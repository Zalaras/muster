package server

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"net/http/httptest"
	"strconv"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/rs/zerolog"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/Zalaras/muster/internal/session"
	"github.com/Zalaras/muster/internal/store"
	"github.com/Zalaras/muster/internal/tmux"
	"github.com/Zalaras/muster/internal/tmux/tmuxtest"
)

// TestLauncher_Resume_NotResumableMessageNamesWhichCauseApplies covers plan
// session-lifecycle D21/review Critical 2: Resume's 409 not_resumable covers two causes
// (still alive; dead but never bound a claudeSessionId) and REQ-17/docs/protocol.md both
// promise "the message names which, since only one of the two is ever recoverable" — but
// sessions.go's notResumable call is one byte-identical string for both causes today. This
// doesn't pin exact prose (the impl keeps freedom of wording): it asserts the two messages
// differ, and that only the alive-cause one mentions "alive" — today both causes return
// the identical shared string, so both assertions fail together.
func TestLauncher_Resume_NotResumableMessageNamesWhichCauseApplies(t *testing.T) {
	st := openLauncherTestStore(t)
	mgr := newSessionTestManager(t, st)
	dir := t.TempDir()
	repo, _, err := st.UpsertRepo(context.Background(), store.UpsertRepoParams{
		Path: dir, Name: "proj", Model: "sonnet", PermissionMode: "default",
	})
	require.NoError(t, err)

	l := &sessionLauncher{
		store: st, manager: mgr, tmux: newFakeTmux(), log: zerolog.Nop(), claudeBin: "irrelevant-never-reached",
		hookScript: "/bin/true", statusLineScript: "/bin/true",
	}

	// Cause 1: still alive.
	aliveSess, err := mgr.CreateSession(context.Background(), session.CreateParams{
		RepoID: repo.ID, Directory: dir, PermissionMode: session.PermissionDefault, Model: "sonnet", FirstLaunchHere: true,
	})
	require.NoError(t, err)
	_, err = mgr.RecordLaunch(context.Background(), aliveSess.ID, fmt.Sprintf("muster-%d:@1", aliveSess.ID), "%1")
	require.NoError(t, err)

	_, aliveErr := l.Resume(context.Background(), aliveSess.ID)
	require.NotNil(t, aliveErr)
	require.Equal(t, "not_resumable", aliveErr.code)

	// Cause 2: dead, and never bound a claudeSessionId (this mgr's noop TmuxSessions/
	// PaneChecker double kills nothing and reports every pane absent, so End still lands
	// on the direct markEnded path with no real tmux needed).
	deadSess, err := mgr.CreateSession(context.Background(), session.CreateParams{
		RepoID: repo.ID, Directory: dir, PermissionMode: session.PermissionDefault, Model: "sonnet", FirstLaunchHere: false,
	})
	require.NoError(t, err)
	_, err = mgr.RecordLaunch(context.Background(), deadSess.ID, fmt.Sprintf("muster-%d:@1", deadSess.ID), "%1")
	require.NoError(t, err)
	_, err = mgr.End(context.Background(), deadSess.ID)
	require.NoError(t, err)

	_, noIDErr := l.Resume(context.Background(), deadSess.ID)
	require.NotNil(t, noIDErr)
	require.Equal(t, "not_resumable", noIDErr.code)

	assert.NotEqual(t, aliveErr.message, noIDErr.message,
		"D21/Critical 2: the two not_resumable causes must produce different messages")
	assert.Contains(t, strings.ToLower(aliveErr.message), "alive", "the alive-session message must name that cause")
	assert.NotContains(t, strings.ToLower(noIDErr.message), "alive", "the no-claudeSessionId message must not also claim the session is alive")
}

// errKiller is a session.TmuxSessions double whose KillSession always fails with a
// fixed, non-nil error — used to force a *genuine* kill failure for D15. Phase 1 shipped
// REQ-6 (internal/tmux.Client.KillSession treats an already-gone tmux session as a
// successful kill), so a fabricated/never-spawned tmux target no longer reproduces this
// scenario; a TmuxSessions double is the only way left to get a kill that must still
// fail. ListSessions/ResolveSessionTarget are never exercised by the Remove/End paths
// these tests drive.
type errKiller struct {
	killErr error
}

func (k *errKiller) KillSession(_ context.Context, _ string) error {
	return k.killErr
}

func (k *errKiller) ListSessions(_ context.Context) ([]string, error) {
	return nil, nil
}

func (k *errKiller) ResolveSessionTarget(_ context.Context, _ string) (string, string, error) {
	return "", "", errors.New("errKiller: ResolveSessionTarget not supported")
}

// TestHandleRemoveSession_FailingEndLeavesTheShellRunningAndTheRowPresent covers plan
// session-lifecycle D15/REQ-13: a Remove whose End fails (a genuine tmux kill failure —
// here, errKiller standing in for "tmux unreachable") must not have already destroyed the
// shell tmux session, and the row must still be there afterward. Today handleRemoveSession
// kills the shell and closes terminal sockets *before* calling manager.Remove, so both are
// already gone by the time Remove fails.
func TestHandleRemoveSession_FailingEndLeavesTheShellRunningAndTheRowPresent(t *testing.T) {
	socket := tmuxtest.Socket(t)
	client := tmux.New(socket) // real tmux — backs only the shell registry below
	st := openLauncherTestStore(t)
	killer := &errKiller{killErr: errors.New("boom: tmux unreachable")}
	manager := newSessionTestManager(t, st, withTmuxSessions(killer))
	shells := newShellRegistry(client, zerolog.Nop())
	terminals := newTerminalRegistry()
	launcher := &sessionLauncher{store: st, manager: manager, tmux: client, log: zerolog.Nop()}
	// D7/REQ-10: a captured logger, not zerolog.Nop() — the raw error must reach the log
	// even though the response body below only ever carries the fixed phrase.
	var logBuf bytes.Buffer
	f := newActionsFeature(manager, launcher, shells, terminals, nil, zerolog.New(&logBuf))

	dir := t.TempDir()
	repo, _, err := st.UpsertRepo(context.Background(), store.UpsertRepoParams{
		Path: dir, Name: "proj", Model: "sonnet", PermissionMode: "default",
	})
	require.NoError(t, err)
	sess, err := manager.CreateSession(context.Background(), session.CreateParams{
		RepoID: repo.ID, Directory: dir, PermissionMode: session.PermissionDefault, Model: "sonnet", FirstLaunchHere: true,
	})
	require.NoError(t, err)
	// The tmux target itself no longer matters here — errKiller fails regardless of what
	// (if anything) actually exists on the socket.
	_, err = manager.RecordLaunch(context.Background(), sess.ID, fmt.Sprintf("muster-%d:@1", sess.ID), "%1")
	require.NoError(t, err)

	_, _, err = shells.Ensure(context.Background(), sess.ID, dir)
	require.NoError(t, err)
	shellName := tmux.ShellSessionName(sess.ID)
	existsBefore, err := client.PaneExists(context.Background(), shellName)
	require.NoError(t, err)
	require.True(t, existsBefore, "sanity: the shell must actually be running before Remove is attempted")

	req := httptest.NewRequest(http.MethodDelete, fmt.Sprintf("/api/sessions/%d", sess.ID), nil)
	req.SetPathValue("id", strconv.FormatInt(sess.ID, 10))
	rec := httptest.NewRecorder()
	f.handleRemoveSession(rec, req)

	assert.Equal(t, http.StatusInternalServerError, rec.Code, "errKiller forces a genuine kill failure, so Remove must fail")
	assert.Equal(t, msgRemoveFailed, decodeErrorMessage(t, rec), "D7/REQ-10: the body carries only the fixed phrase")
	assert.Contains(t, logBuf.String(), "boom: tmux unreachable", "D7: the raw error must reach the daemon log")
	assert.True(t, manager.Exists(sess.ID), "D15: a failed Remove must leave the row present")

	stillExists, err := client.PaneExists(context.Background(), shellName)
	require.NoError(t, err)
	assert.True(t, stillExists, "D15/REQ-13: a failed Remove must leave the shell tmux session running")
}

// terminalConnFor reads back the *terminalConn currently registered for id's Claude
// surface, directly from the registry's own map (in-package access) — a deterministic,
// non-network way to assert "the terminal socket was (or wasn't) touched" that doesn't
// depend on a bounded-wait read against the live websocket.
func terminalConnFor(terminals *terminalRegistry, id int64) *terminalConn {
	terminals.mu.Lock()
	defer terminals.mu.Unlock()
	return terminals.conns[terminalKey{sessionID: id, surface: surfaceClaude}]
}

// TestHandleEndSession_FailingKillLeavesTheTerminalSocketOpen covers plan session-lifecycle
// D23/review Major 2: REQ-13 says "a failed End or Remove leaves terminal sockets and the
// shell as they were", but handleEndSession's default (genuine-failure) branch still calls
// f.terminals.closeSession(id) before writing the 500 — recreating the dead-surface-over-
// a-live-session defect the plan's own Overview names. Uses the same errKiller double as
// D15 to force a genuine (non-idempotent-tolerated) kill failure; the terminal WS is a
// real coder/websocket connection (registered via a fake attach, since no real tmux target
// exists here) so "still registered, same connection object" is a genuine assertion about
// terminalRegistry's own state, not a guess from a bounded-wait read.
func TestHandleEndSession_FailingKillLeavesTheTerminalSocketOpen(t *testing.T) {
	st := openLauncherTestStore(t)
	killer := &errKiller{killErr: errors.New("boom: tmux unreachable")}
	manager := newSessionTestManager(t, st, withTmuxSessions(killer))
	terminals := newTerminalRegistry()
	fake := newFakeTmux()
	terminalFeat := newTerminalFeature(terminals, manager, fake.attach, zerolog.Nop())
	shells := newShellRegistry(fake, zerolog.Nop())
	launcher := &sessionLauncher{store: st, manager: manager, tmux: fake, log: zerolog.Nop()}
	// D7/REQ-10: a captured logger, not zerolog.Nop() — the raw error must reach the log
	// even though the response body below only ever carries the fixed phrase.
	var logBuf bytes.Buffer
	sessionsFeat := newActionsFeature(manager, launcher, shells, terminals, nil, zerolog.New(&logBuf))

	dir := t.TempDir()
	repo, _, err := st.UpsertRepo(context.Background(), store.UpsertRepoParams{
		Path: dir, Name: "proj", Model: "sonnet", PermissionMode: "default",
	})
	require.NoError(t, err)
	sess, err := manager.CreateSession(context.Background(), session.CreateParams{
		RepoID: repo.ID, Directory: dir, PermissionMode: session.PermissionDefault, Model: "sonnet", FirstLaunchHere: true,
	})
	require.NoError(t, err)
	_, err = manager.RecordLaunch(context.Background(), sess.ID, fmt.Sprintf("muster-%d:@1", sess.ID), "%1")
	require.NoError(t, err)

	noGuard := func(h http.Handler) http.Handler { return h }
	mux := http.NewServeMux()
	sessionsFeat.mount(mux, noGuard)
	terminalFeat.mount(mux, noGuard)
	httpSrv := httptest.NewServer(mux)
	t.Cleanup(httpSrv.Close)

	c := dialTerminalOK(t, httpSrv, sess.ID)
	defer func() { _ = c.CloseNow() }()

	// Drain frames on the client side throughout: a graceful websocket.Conn.Close() (which
	// closeSession calls) waits for the peer's own close-frame acknowledgement, and a
	// client that never reads would otherwise make this test pay that wait's full grace
	// period for no reason relevant to the assertion below.
	go func() {
		for {
			if _, _, err := c.Read(context.Background()); err != nil {
				return
			}
		}
	}()

	var before *terminalConn
	require.Eventually(t, func() bool {
		before = terminalConnFor(terminals, sess.ID)
		return before != nil
	}, 3*time.Second, 10*time.Millisecond, "sanity: the terminal connection must actually register before End is attempted")

	req := httptest.NewRequest(http.MethodPost, fmt.Sprintf("/api/sessions/%d/end", sess.ID), nil)
	req.SetPathValue("id", strconv.FormatInt(sess.ID, 10))
	rec := httptest.NewRecorder()
	sessionsFeat.handleEndSession(rec, req)

	assert.Equal(t, http.StatusInternalServerError, rec.Code, "errKiller forces a genuine kill failure, so End must fail")
	assert.Equal(t, msgEndFailed, decodeErrorMessage(t, rec), "D7/REQ-10: the body carries only the fixed phrase")
	assert.Contains(t, logBuf.String(), "boom: tmux unreachable", "D7: the raw error must reach the daemon log")

	after := terminalConnFor(terminals, sess.ID)
	assert.Same(t, before, after, "D23/REQ-13: a failed End must leave the terminal socket exactly as it was, never closed")
}

// TestLauncher_ConcurrentResumesSpawnExactlyOnce covers plan session-lifecycle D19/REQ-11:
// Resume's check-then-act (read sess.Alive == false, only flip it much later in
// RecordResume) is not serialised per session id, so two concurrent Resume calls for the
// same dead-but-resumable session can both pass the alive gate and both call NewSession.
// Post-Phase-1 this is invisible in either caller's status code — the loser hits
// tmux.ErrSessionExists and REQ-8's repair path hands it back a plain 200 — so the spawn
// count is the only place the bug still shows. A per-test WaitGroup gated on a shared
// `ready` channel (no artificial delay or fake-side barrier needed) reproduced the race
// 20/20 under `-count=20` and 20/20 under `-race` with no data race reported, both while
// iterating on this test before committing it — real disk I/O inside writeSettings
// (os.ReadFile/os.WriteFile against a real temp dir) between the alive-check and the
// tmux call is enough to reliably widen the window.
func TestLauncher_ConcurrentResumesSpawnExactlyOnce(t *testing.T) {
	st := openLauncherTestStore(t)
	mgr := newSessionTestManager(t, st)
	dir := t.TempDir()
	repo, _, err := st.UpsertRepo(context.Background(), store.UpsertRepoParams{
		Path: dir, Name: "proj", Model: "sonnet", PermissionMode: "default",
	})
	require.NoError(t, err)
	sess, err := mgr.CreateSession(context.Background(), session.CreateParams{
		RepoID: repo.ID, Directory: dir, PermissionMode: session.PermissionDefault, Model: "sonnet", FirstLaunchHere: true,
	})
	require.NoError(t, err)

	// Make it dead-but-resumable: alive=false with a bound claudeSessionId — the ordinary
	// "died, has a resumable conversation" shape Resume expects, reloaded into the
	// manager the same way a daemon restart would.
	row, err := st.GetSession(context.Background(), sess.ID)
	require.NoError(t, err)
	row.Alive = false
	claudeID := "claude-resume-race"
	row.ClaudeSessionID = &claudeID
	require.NoError(t, st.UpdateSession(context.Background(), row))
	require.NoError(t, mgr.LoadAll(context.Background()))

	fake := newFakeTmux()
	l := &sessionLauncher{
		store: st, manager: mgr, tmux: fake, log: zerolog.Nop(), claudeBin: "irrelevant-never-reached",
		hookScript: "/bin/true", statusLineScript: "/bin/true",
	}

	const attempts = 2
	ready := make(chan struct{})
	var wg sync.WaitGroup
	for range attempts {
		wg.Add(1)
		go func() {
			defer wg.Done()
			<-ready
			_, _ = l.Resume(context.Background(), sess.ID)
		}()
	}
	close(ready)
	wg.Wait()

	assert.Equal(t, 1, fake.newSessionCalls, "D19/REQ-11: two concurrent Resumes for one session must spawn exactly once")
}

// spawnerKiller is REQ-5(e)/D4's second fake: a paneSpawner (for the launcher) and a
// session.TmuxSessions (for the manager's End) sharing one call log, so a test can
// observe whether a Launch's spawn and an End's kill for the *same* id ever overlap.
// Production wiring shares a single *tmux.Client across both roles the same way.
type spawnerKiller struct {
	mu          sync.Mutex
	callOrder   []string
	newSessRel  chan struct{}
	newSessHold bool // when true, NewSession blocks on newSessRel before returning
}

func newSpawnerKiller() *spawnerKiller {
	return &spawnerKiller{newSessRel: make(chan struct{})}
}

func (k *spawnerKiller) record(s string) {
	k.mu.Lock()
	k.callOrder = append(k.callOrder, s)
	k.mu.Unlock()
}

func (k *spawnerKiller) NewSession(ctx context.Context, id int64, _ string, _ map[string]string, _ []string) (target, pane string, err error) {
	k.record("NewSession-start")
	if k.newSessHold {
		select {
		case <-k.newSessRel:
		case <-ctx.Done():
			return "", "", ctx.Err()
		}
	}
	k.record("NewSession-end")
	return fmt.Sprintf("muster-%d:@1", id), "%1", nil
}
func (k *spawnerKiller) NewNamedSession(_ context.Context, name, _ string, _ map[string]string, _ []string) (string, string, error) {
	return name, "%1", nil
}
func (k *spawnerKiller) PaneExists(_ context.Context, _ string) (bool, error) { return true, nil }
func (k *spawnerKiller) KillWindow(_ context.Context, _ string) error         { return nil }
func (k *spawnerKiller) KillSession(_ context.Context, _ string) error {
	k.record("KillSession")
	return nil
}
func (k *spawnerKiller) MaxSessionID(_ context.Context) (int64, error) { return 0, nil }
func (k *spawnerKiller) ListSessions(_ context.Context) ([]string, error) {
	return nil, nil
}
func (k *spawnerKiller) ResolveSessionTarget(_ context.Context, _ string) (string, string, error) {
	return "", "", errors.New("spawnerKiller: ResolveSessionTarget not supported")
}

func (k *spawnerKiller) calls() []string {
	k.mu.Lock()
	defer k.mu.Unlock()
	out := make([]string, len(k.callOrder))
	copy(out, k.callOrder)
	return out
}

// TestLauncher_LaunchRacingEndOnTheSameIDCannotInterleave covers REQ-5(e)/D4's second
// half: an End call for the id Launch just allocated, fired while Launch's own tmux spawn
// for that same id is still in flight, must not run its kill until the spawn (and
// RecordLaunch) has finished — the manager's per-id lock (REQ-11, shared by End and by
// Launch's spawnAndRecordLaunch) serializes them. A build that dropped or narrowed that
// lock would let End's KillSession fire while NewSession is still blocked below, which
// this test would catch as a call-order violation.
func TestLauncher_LaunchRacingEndOnTheSameIDCannotInterleave(t *testing.T) {
	st := openLauncherTestStore(t)
	dir := t.TempDir()
	fake := newSpawnerKiller()
	fake.newSessHold = true
	mgr := newSessionTestManager(t, st, withTmuxSessions(fake))

	l := &sessionLauncher{
		store: st, manager: mgr, tmux: fake, log: zerolog.Nop(), claudeBin: "irrelevant-never-reached",
		hookScript: "/bin/true", statusLineScript: "/bin/true",
	}

	launchDone := make(chan *launchError, 1)
	go func() {
		_, lerr := l.Launch(context.Background(), createSessionRequest{
			Directory: dir, Model: "sonnet", PermissionMode: "default",
		})
		launchDone <- lerr
	}()

	// Wait for Launch's spawn to actually be in flight (and, by construction, holding
	// the id's per-id lock) before racing End against it.
	require.Eventually(t, func() bool {
		calls := fake.calls()
		return len(calls) > 0 && calls[0] == "NewSession-start"
	}, 3*time.Second, 10*time.Millisecond)

	rows, err := st.ListSessions(context.Background())
	require.NoError(t, err)
	require.Len(t, rows, 1, "CreateSession must have already allocated the row Launch is spawning for")
	id := rows[0].ID

	endDone := make(chan error, 1)
	go func() {
		_, endErr := mgr.End(context.Background(), id)
		endDone <- endErr
	}()

	// End must not have completed its kill yet — Launch's spawn (and RecordLaunch) is
	// still holding id's per-id lock.
	select {
	case <-endDone:
		t.Fatal("REQ-5(e)/D4: End completed while Launch's spawn for the same id was still blocked — the per-id lock did not serialize them")
	case <-time.After(300 * time.Millisecond):
	}

	close(fake.newSessRel)
	require.Nil(t, <-launchDone)
	require.NoError(t, <-endDone)

	assert.Equal(t, []string{"NewSession-start", "NewSession-end", "KillSession"}, fake.calls(),
		"End's kill must land strictly after Launch's spawn finished, never interleaved with it")
}

// TestHandleEndSession_AlreadyDeadSessionIs409NotAlive covers D17's first clause
// (kb:anchor/sessions.end): ending an already-ended session is a conflict, not a 404 or a
// silent success.
func TestHandleEndSession_AlreadyDeadSessionIs409NotAlive(t *testing.T) {
	srv := newTestServer(t, ClaudeCodeInfo{})
	endedAt := time.Now().UTC()
	id := seedSessionRow(t, srv, func(row *store.SessionRow) {
		row.Alive = false
		row.EndedAt = &endedAt
	})

	rec := sessionActionRequest(t, srv, http.MethodPost, fmt.Sprintf("/api/sessions/%d/end", id))

	assert.Equal(t, http.StatusConflict, rec.Code)
	assert.Equal(t, "not_alive", decodeErrorCode(t, rec))
}

func TestHandleEndSession_UnknownSessionIs404(t *testing.T) {
	srv := newTestServer(t, ClaudeCodeInfo{})

	rec := sessionActionRequest(t, srv, http.MethodPost, "/api/sessions/999999/end")

	assert.Equal(t, http.StatusNotFound, rec.Code)
	assert.Equal(t, "unknown_session", decodeErrorCode(t, rec))
}

// TestHandleResumeSession_LiveSessionIs409NotResumable covers D17's second clause
// (kb:anchor/sessions.resume): resuming a still-alive session is a conflict.
func TestHandleResumeSession_LiveSessionIs409NotResumable(t *testing.T) {
	srv := newTestServer(t, ClaudeCodeInfo{})
	id := seedSessionRow(t, srv, func(row *store.SessionRow) {
		claudeID := "claude-1"
		row.ClaudeSessionID = &claudeID
		// row.Alive is already true from InsertSession.
	})

	rec := sessionActionRequest(t, srv, http.MethodPost, fmt.Sprintf("/api/sessions/%d/resume", id))

	assert.Equal(t, http.StatusConflict, rec.Code)
	assert.Equal(t, "not_resumable", decodeErrorCode(t, rec))
}

// TestHandleResumeSession_DeadSessionWithoutClaudeIDIs409NotResumable covers D17's third
// clause: a dead session that never got a claude session id bound (e.g. it died before its
// first SessionStart hook ever landed) has nothing to resume.
func TestHandleResumeSession_DeadSessionWithoutClaudeIDIs409NotResumable(t *testing.T) {
	srv := newTestServer(t, ClaudeCodeInfo{})
	endedAt := time.Now().UTC()
	id := seedSessionRow(t, srv, func(row *store.SessionRow) {
		row.Alive = false
		row.EndedAt = &endedAt
		row.ClaudeSessionID = nil
	})

	rec := sessionActionRequest(t, srv, http.MethodPost, fmt.Sprintf("/api/sessions/%d/resume", id))

	assert.Equal(t, http.StatusConflict, rec.Code)
	assert.Equal(t, "not_resumable", decodeErrorCode(t, rec))
}

func TestHandleResumeSession_UnknownSessionIs404(t *testing.T) {
	srv := newTestServer(t, ClaudeCodeInfo{})

	rec := sessionActionRequest(t, srv, http.MethodPost, "/api/sessions/999999/resume")

	assert.Equal(t, http.StatusNotFound, rec.Code)
	assert.Equal(t, "unknown_session", decodeErrorCode(t, rec))
}

// TestHandleRemoveSession_UnknownSessionIs404 covers D17's fourth clause
// (kb:anchor/sessions.remove): DELETE against an id nothing knows about is a 404, not a silent 204.
func TestHandleRemoveSession_UnknownSessionIs404(t *testing.T) {
	srv := newTestServer(t, ClaudeCodeInfo{})

	rec := sessionActionRequest(t, srv, http.MethodDelete, "/api/sessions/999999")

	assert.Equal(t, http.StatusNotFound, rec.Code)
	assert.Equal(t, "unknown_session", decodeErrorCode(t, rec))
}

// TestHandleRemoveSession_DeadSessionSucceeds covers the ordinary (non-alive) Remove path
// at the HTTP layer: 204 with no body, and the row is actually gone afterward.
func TestHandleRemoveSession_DeadSessionSucceeds(t *testing.T) {
	srv := newTestServer(t, ClaudeCodeInfo{})
	endedAt := time.Now().UTC()
	id := seedSessionRow(t, srv, func(row *store.SessionRow) {
		row.Alive = false
		row.EndedAt = &endedAt
	})

	rec := sessionActionRequest(t, srv, http.MethodDelete, fmt.Sprintf("/api/sessions/%d", id))

	assert.Equal(t, http.StatusNoContent, rec.Code)
	assert.Empty(t, rec.Body.Bytes())
	_, err := srv.store.GetSession(context.Background(), id)
	assert.Error(t, err, "the row must actually be gone from the store")
}

// TestHandlePaneSnapshot_404BeforeCaptureThen200WithTextAfter covers D18
// (kb:anchor/sessions.pane): no capture yet is 404 no_snapshot; once one lands, GET returns text+capturedAt.
func TestHandlePaneSnapshot_404BeforeCaptureThen200WithTextAfter(t *testing.T) {
	srv := newTestServer(t, ClaudeCodeInfo{})
	id := seedSessionRow(t, srv, nil)

	rec := sessionActionRequest(t, srv, http.MethodGet, fmt.Sprintf("/api/sessions/%d/pane", id))
	assert.Equal(t, http.StatusNotFound, rec.Code)
	assert.Equal(t, "no_snapshot", decodeErrorCode(t, rec))

	capturedAt := time.Now().UTC()
	require.NoError(t, srv.store.UpdateSnapshot(context.Background(), id, "captured pane text", capturedAt))
	require.NoError(t, srv.manager.LoadAll(context.Background()))

	rec2 := sessionActionRequest(t, srv, http.MethodGet, fmt.Sprintf("/api/sessions/%d/pane", id))
	assert.Equal(t, http.StatusOK, rec2.Code)
	var body struct {
		Text       string `json:"text"`
		CapturedAt string `json:"capturedAt"`
	}
	require.NoError(t, json.Unmarshal(rec2.Body.Bytes(), &body))
	assert.Equal(t, "captured pane text", body.Text)
	// D18: capturedAt must be the seeded value, not merely non-empty — a wrong-but-
	// non-empty timestamp must fail this test (review cycle 1 Minor 5). The store
	// truncates to RFC3339 seconds precision on write (session.go's UpdateSnapshot) and
	// the handler formats with the same layout, so exact string equality is sound and
	// deterministic, not a flaky sub-second race.
	assert.Equal(t, capturedAt.Format(time.RFC3339), body.CapturedAt)
}

func TestHandlePaneSnapshot_UnknownSessionIs404UnknownSession(t *testing.T) {
	srv := newTestServer(t, ClaudeCodeInfo{})

	rec := sessionActionRequest(t, srv, http.MethodGet, "/api/sessions/999999/pane")

	assert.Equal(t, http.StatusNotFound, rec.Code)
	assert.Equal(t, "unknown_session", decodeErrorCode(t, rec))
}

// TestSessionActionHandlers_RequireCookie covers the auth wiring shared by all four new
// endpoints — none of them may be reachable without the muster_auth cookie.
func TestSessionActionHandlers_RequireCookie(t *testing.T) {
	tests := []struct {
		name   string
		method string
		path   string
	}{
		{"end", http.MethodPost, "/api/sessions/1/end"},
		{"resume", http.MethodPost, "/api/sessions/1/resume"},
		{"remove", http.MethodDelete, "/api/sessions/1"},
		{"pane", http.MethodGet, "/api/sessions/1/pane"},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			srv := newTestServer(t, ClaudeCodeInfo{})

			req := httptest.NewRequest(tt.method, tt.path, nil)
			rec := httptest.NewRecorder()
			srv.Handler().ServeHTTP(rec, req)

			assert.Equal(t, http.StatusUnauthorized, rec.Code)
		})
	}
}

// batchBody decodes a batch endpoint's 200 body into its three lists.
func batchBody(t *testing.T, rec *httptest.ResponseRecorder) (done, skipped, failed []int64) {
	t.Helper()
	require.Equal(t, http.StatusOK, rec.Code, rec.Body.String())
	body := decodeBody(t, rec)
	return idList(t, body["done"]), idList(t, body["skipped"]), idList(t, body["failed"])
}

// --- POST /api/sessions/end ---

func TestEndSessions_ReportsDoneSkippedAndFailedAndTouchesNoOtherSession(t *testing.T) {
	h := newGroupsHarness(t)
	live, alreadyEnded, failing, bystander := h.launch(nil), h.launch(nil), h.launch(nil), h.launch(nil)
	_, err := h.mgr.End(t.Context(), alreadyEnded)
	require.NoError(t, err)
	h.killer.failKill(fmt.Sprintf("muster-%d", failing))
	h.killer.mu.Lock()
	h.killer.killed = nil
	h.killer.mu.Unlock()
	h.wire.reset()

	rec := h.do(http.MethodPost, pathSessionsEnd, fmt.Sprintf(`{"ids":%s}`, jsonIDs(live, 999999, alreadyEnded, failing)))

	done, skipped, failed := batchBody(t, rec)
	assert.Equal(t, []int64{live}, done)
	assert.Equal(t, []int64{999999, alreadyEnded}, skipped, "an unknown id and an already ended session are skipped")
	assert.Equal(t, []int64{failing}, failed, "a genuine kill failure is failed, with the response still 200")
	assert.Equal(t, []string{fmt.Sprintf("muster-%d", live)}, h.killer.killedNames())
	s, ok := h.mgr.Get(bystander)
	require.True(t, ok)
	assert.True(t, s.Alive, "a session outside ids is never touched")
	assert.NotContains(t, h.wire.kinds(), fmt.Sprintf("sessionUpsert:%d", bystander))
	assert.Contains(t, h.wire.kinds(), fmt.Sprintf("sessionUpsert:%d", live))
}

func TestEndSessions_EmptyListsSerialiseAsArrays(t *testing.T) {
	h := newGroupsHarness(t)
	id := h.launch(nil)

	rec := h.do(http.MethodPost, pathSessionsEnd, fmt.Sprintf(`{"ids":[%d]}`, id))

	assert.JSONEq(t, fmt.Sprintf(`{"done":[%d],"skipped":[],"failed":[]}`, id), rec.Body.String())
}

func TestBatchEndpoints_RefuseABadIDsList(t *testing.T) {
	bodies := map[string]string{
		"body not JSON":        `{`,
		"ids missing":          `{}`,
		"ids null":             `{"ids":null}`,
		"ids empty":            `{"ids":[]}`,
		"ids not an array":     `{"ids":"1"}`,
		"ids holds a string":   `{"ids":["a"]}`,
		"ids holds a fraction": `{"ids":[1.5]}`,
		"a duplicate id":       `{"ids":[1,2,1]}`,
		"a repeated pair":      `{"ids":[7,7]}`,
	}
	for _, path := range []string{pathSessionsEnd, pathSessionsRemove} {
		for name, body := range bodies {
			t.Run(path+"/"+name, func(t *testing.T) {
				h := newGroupsHarness(t)
				id := h.launch(nil)
				h.wire.reset()

				rec := h.do(http.MethodPost, path, body)

				assertErrorResponse(t, rec, 400, "invalid_request", msgBatchBadIDs)
				assert.True(t, h.mgr.Exists(id))
				assert.Empty(t, h.wire.kinds())
				assert.Empty(t, h.killer.killedNames())
			})
		}
	}
}

// --- POST /api/sessions/remove ---

func TestRemoveSessions_RemovesAndTearsDownEachDoneSessionAndNoOther(t *testing.T) {
	h := newGroupsHarness(t)
	a, b, failing, bystander := h.launch(nil), h.launch(nil), h.launch(nil), h.launch(nil)
	h.killer.failKill(fmt.Sprintf("muster-%d", failing))
	h.wire.reset()

	rec := h.do(http.MethodPost, pathSessionsRemove, fmt.Sprintf(`{"ids":%s}`, jsonIDs(a, 999999, b, failing)))

	done, skipped, failed := batchBody(t, rec)
	assert.Equal(t, []int64{a, b}, done)
	assert.Equal(t, []int64{999999}, skipped)
	assert.Equal(t, []int64{failing}, failed)
	assert.False(t, h.mgr.Exists(a))
	assert.False(t, h.mgr.Exists(b))
	assert.True(t, h.mgr.Exists(failing), "the row is kept when the kill fails")
	assert.True(t, h.mgr.Exists(bystander))
	assert.ElementsMatch(t, []string{shellName(a), shellName(b)}, h.spawner.shellKills(), "the shell is torn down for each removed session, and for no other")
	kinds := h.wire.kinds()
	assert.Contains(t, kinds, fmt.Sprintf("sessionRemoved:%d", a))
	assert.Contains(t, kinds, fmt.Sprintf("sessionRemoved:%d", b))
	assert.NotContains(t, kinds, fmt.Sprintf("sessionRemoved:%d", failing))
	assert.NotContains(t, kinds, fmt.Sprintf("sessionUpsert:%d", bystander))
}

// TestRemoveSessions_RemoveAllLeavesNothing is #27: every session in one request.
func TestRemoveSessions_RemoveAllLeavesNothing(t *testing.T) {
	h := newGroupsHarness(t)
	g := h.newGroup("G")
	ids := []int64{h.launch(nil), h.launch(&g), h.launch(nil), h.launch(&g)}

	rec := h.do(http.MethodPost, pathSessionsRemove, fmt.Sprintf(`{"ids":%s}`, jsonIDs(ids...)))

	done, skipped, failed := batchBody(t, rec)
	assert.Equal(t, ids, done)
	assert.Empty(t, skipped)
	assert.Empty(t, failed)
	assert.Empty(t, h.mgr.List())
	assert.Equal(t, []int64{g}, h.groupIDs(), "removing the sessions never removes their group")
}
