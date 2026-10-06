package server

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/rs/zerolog"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/Zalaras/muster/internal/claudecode"
	"github.com/Zalaras/muster/internal/session"
	"github.com/Zalaras/muster/internal/store"
	"github.com/Zalaras/muster/internal/tmux"
	"github.com/Zalaras/muster/internal/tmux/tmuxtest"
)

// TestHandleCreateSession_RequiresCookie covers the auth wiring for the new endpoint.
func TestHandleCreateSession_RequiresCookie(t *testing.T) {
	srv := newTestServer(t, ClaudeCodeInfo{})

	req := httptest.NewRequest(http.MethodPost, "/api/sessions", strings.NewReader(`{}`))
	rec := httptest.NewRecorder()
	srv.Handler().ServeHTTP(rec, req)

	assert.Equal(t, http.StatusUnauthorized, rec.Code)
}

func TestHandleCreateSession_InvalidJSONBodyIs400(t *testing.T) {
	srv := newTestServer(t, ClaudeCodeInfo{})

	rec := postSessionsRequest(t, srv, `not valid json`)

	assert.Equal(t, http.StatusBadRequest, rec.Code)
	assert.Equal(t, "invalid_request", decodeErrorCode(t, rec))
}

// TestHandleCreateSession_ValidationErrors covers the Protocol Contract's "400
// invalid_request also covers" list, exercised through the real HTTP handler (decode
// → delegate → encode); none of these ever reach the store or tmux.
func TestHandleCreateSession_ValidationErrors(t *testing.T) {
	tests := []struct {
		name string
		body string
	}{
		{"missing directory", `{"model":"sonnet","permissionMode":"default"}`},
		{"relative directory", `{"directory":"relative/dir","model":"sonnet","permissionMode":"default"}`},
		{"non-existent directory", `{"directory":"/this/does/not/exist/anywhere","model":"sonnet","permissionMode":"default"}`},
		{"empty model", `{"directory":"` + os.TempDir() + `","model":"","permissionMode":"default"}`},
		{"missing model", `{"directory":"` + os.TempDir() + `","permissionMode":"default"}`},
		{"unknown permissionMode", `{"directory":"` + os.TempDir() + `","model":"sonnet","permissionMode":"bogus"}`},
		{"empty permissionMode", `{"directory":"` + os.TempDir() + `","model":"sonnet","permissionMode":""}`},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			srv := newTestServer(t, ClaudeCodeInfo{})

			rec := postSessionsRequest(t, srv, tt.body)

			assert.Equal(t, http.StatusBadRequest, rec.Code)
			assert.Equal(t, "invalid_request", decodeErrorCode(t, rec))
		})
	}
}

// TestHandleCreateSession_UnknownPermissionModeMessageNamesAllFive covers D4/REQ-1: the
// rejection message must name all five accepted values, not just say "invalid" — plan
// resume-and-dangerously-allow's REQ-1 makes "bypassPermissions" itself a valid mode
// (kb:lesson/stale-fixture-reshaped-the-wire: this test's own fixture used to be the one
// value this plan turned valid, so it now spells a value no plan has ever accepted).
func TestHandleCreateSession_UnknownPermissionModeMessageNamesAllFive(t *testing.T) {
	srv := newTestServer(t, ClaudeCodeInfo{})

	rec := postSessionsRequest(t, srv, `{"directory":"`+os.TempDir()+`","model":"sonnet","permissionMode":"bogus"}`)

	assert.Equal(t, http.StatusBadRequest, rec.Code)
	var envelope struct {
		Error struct {
			Code    string `json:"code"`
			Message string `json:"message"`
		} `json:"error"`
	}
	require.NoError(t, json.Unmarshal(rec.Body.Bytes(), &envelope))
	assert.Equal(t, "invalid_request", envelope.Error.Code)
	assert.Equal(t, "permissionMode must be one of default, plan, acceptEdits, auto, bypassPermissions", envelope.Error.Message)
}

// TestHandleCreateSession_ADirectoryThatIsAFileIs400 covers the "not a directory" half
// of the Protocol Contract's validation clause.
func TestHandleCreateSession_ADirectoryThatIsAFileIs400(t *testing.T) {
	srv := newTestServer(t, ClaudeCodeInfo{})
	file := filepath.Join(t.TempDir(), "not-a-dir.txt")
	require.NoError(t, os.WriteFile(file, []byte("x"), 0o644))

	rec := postSessionsRequest(t, srv, `{"directory":"`+file+`","model":"sonnet","permissionMode":"default"}`)

	assert.Equal(t, http.StatusBadRequest, rec.Code)
	assert.Equal(t, "invalid_request", decodeErrorCode(t, rec))
}

// TestLauncher_CorruptSettingsFileRefusesAndRollsBackTheSessionRow covers D7/Edge Case
// 9's other half and the plan's "on spawn failure: delete the row" rollback rule — a
// corrupt settings.local.json is caught before tmux is ever touched, so this needs no
// tmux socket at all.
func TestLauncher_CorruptSettingsFileRefusesAndRollsBackTheSessionRow(t *testing.T) {
	st := openLauncherTestStore(t)
	mgr := newSessionTestManager(t, st)
	dir := t.TempDir()
	require.NoError(t, os.MkdirAll(filepath.Join(dir, ".claude"), 0o700))
	require.NoError(t, os.WriteFile(filepath.Join(dir, ".claude", "settings.local.json"), []byte(`{not valid json`), 0o600))

	// REQ-10: the 500 body is now a fixed phrase, never the raw error — the offending
	// path lives only in the adjacent log line, so that's what this test reads instead of
	// the response body (daemon-implementation.md's Handoff on this exact test).
	var logBuf bytes.Buffer
	l := &sessionLauncher{
		store: st, manager: mgr, log: zerolog.New(&logBuf), claudeBin: "irrelevant-never-reached",
		hookScript: "/bin/true", statusLineScript: "/bin/true",
	}

	_, lerr := l.Launch(context.Background(), createSessionRequest{
		Directory: dir, Model: "sonnet", PermissionMode: "default",
	})

	require.NotNil(t, lerr)
	assert.Equal(t, http.StatusInternalServerError, lerr.status)
	assert.Equal(t, "launch_failed", lerr.code)
	assert.Equal(t, msgLaunchFailed, lerr.message, "REQ-10: the response body carries only the fixed phrase")
	assert.Contains(t, logBuf.String(), "settings.local.json", "REQ-10: the offending file's path lives in the daemon log, not the response body")

	rows, err := st.ListSessions(context.Background())
	require.NoError(t, err)
	assert.Empty(t, rows, "the inserted session row must be rolled back on a later launch-step failure")
}

// TestLauncher_SuccessfulLaunchEndToEnd covers D4/D5/D6/D7/REQ-1/REQ-2 at the
// sessionLauncher level (below the HTTP handler, above tmux/store), complementing the
// E2E suite's browser-driven equivalent (E1): a real tmux window is spawned (on a
// private per-test socket) running a stub binary standing in for `claude`, settings
// are written, and the broadcast fires only once the real tmux target is known.
func TestLauncher_SuccessfulLaunchEndToEnd(t *testing.T) {
	st := openLauncherTestStore(t)
	var upserts []*session.Session
	mgr := newSessionTestManager(t, st, withOnUpsert(func(s *session.Session) {
		upserts = append(upserts, s.Clone())
	}))
	tmuxClient := newTestTmuxClient(t)
	dir := t.TempDir()

	l := &sessionLauncher{
		store: st, manager: mgr, tmux: tmuxClient, log: zerolog.Nop(), claudeBin: sharedStubClaude,
		hookScript: "/bin/true", statusLineScript: "/bin/true",
	}

	sess, lerr := l.Launch(context.Background(), createSessionRequest{
		Directory: dir, Title: "My Session", Model: "sonnet", PermissionMode: "default",
	})
	require.Nil(t, lerr)
	t.Cleanup(func() { _ = tmuxClient.KillWindow(context.Background(), sess.TmuxTarget) })

	assert.Equal(t, session.StateStarted, sess.State)
	assert.NotEmpty(t, sess.TmuxTarget)
	assert.True(t, sess.FirstLaunchHere)

	require.Len(t, upserts, 1, "REQ-2: exactly one broadcast, once the real tmux target is known")
	assert.Equal(t, sess.TmuxTarget, upserts[0].TmuxTarget)

	// D4: the pane environment carries MUSTER_SESSION=<id> — proven by the stub binary
	// itself observing it (see newStubClaudeBin's doc comment for why show-environment
	// can't be used here).
	envOutFile := stubSessionOutFile(sess.ID)
	require.Eventually(t, func() bool {
		b, err := os.ReadFile(envOutFile)
		return err == nil && len(b) > 0
	}, 3*time.Second, 20*time.Millisecond)
	got, err := os.ReadFile(envOutFile)
	require.NoError(t, err)
	assert.Equal(t, strconv.FormatInt(sess.ID, 10)+"\n", string(got))

	settingsPath := filepath.Join(dir, ".claude", "settings.local.json")
	require.FileExists(t, settingsPath)

	// D6: launching a second time into the same directory yields one repo row with
	// launch_count == 2 and updated defaults.
	sess2, lerr2 := l.Launch(context.Background(), createSessionRequest{
		Directory: dir, Model: "opus", PermissionMode: "acceptEdits",
	})
	require.Nil(t, lerr2)
	t.Cleanup(func() { _ = tmuxClient.KillWindow(context.Background(), sess2.TmuxTarget) })
	assert.False(t, sess2.FirstLaunchHere, "the second launch into the same directory is not a first launch")

	repo, err := st.GetRepo(context.Background(), sess2.RepoID)
	require.NoError(t, err)
	assert.Equal(t, sess.RepoID, sess2.RepoID, "one repo row for both launches")
	assert.Equal(t, 2, repo.LaunchCount)
	require.NotNil(t, repo.LastModel)
	assert.Equal(t, "opus", *repo.LastModel)

	// D7: relaunching must merge settings idempotently — the file must still exist and
	// still be valid JSON (a corrupt merge would have failed the launch outright).
	require.FileExists(t, settingsPath)
	b, err := os.ReadFile(settingsPath)
	require.NoError(t, err)
	var doc map[string]any
	require.NoError(t, json.Unmarshal(b, &doc))
}

// TestLauncher_AutoPermissionModeSeedsLatchAndRepoDefault covers D3 (a launch with
// "auto" seeds the session's permission latch with {"auto", "seed"}) and D7 (the
// directory's per-directory default records "auto" as the raw requested value). Uses a
// fakeTmux (REQ-3): every assertion is about the returned Session/repo row, never a
// tmux-observable effect, so no real tmux server is needed.
func TestLauncher_AutoPermissionModeSeedsLatchAndRepoDefault(t *testing.T) {
	st := openLauncherTestStore(t)
	mgr := newSessionTestManager(t, st)
	dir := t.TempDir()

	l := &sessionLauncher{
		store: st, manager: mgr, tmux: newFakeTmux(), log: zerolog.Nop(), claudeBin: "irrelevant-never-reached",
		hookScript: "/bin/true", statusLineScript: "/bin/true",
	}

	sess, lerr := l.Launch(context.Background(), createSessionRequest{
		Directory: dir, Model: "sonnet", PermissionMode: "auto",
	})
	require.Nil(t, lerr)

	// D3: the returned session's permission latch is seeded auto/seed.
	assert.Equal(t, session.PermissionAuto, sess.PermissionMode)
	assert.Equal(t, "seed", sess.PermissionModeSource)

	// D7: the directory's stored default now records the raw requested value "auto".
	repo, err := st.GetRepo(context.Background(), sess.RepoID)
	require.NoError(t, err)
	require.NotNil(t, repo.LastPermissionMode)
	assert.Equal(t, "auto", *repo.LastPermissionMode)
}

// --- plan new-session-improvement: REQ-1/REQ-2's model-catalog pre-check ---

// newModelCheckLauncher builds a sessionLauncher sharing st/mgr/fake, wired with a
// checkModel stub that returns verdict/err and counts its own calls — D7/D8/D9 fake at
// the verdict seam, never the stderr sentence itself, which stays inside
// internal/claudecode per D11 and is covered by modelcheck_test.go instead.
func newModelCheckLauncher(st *store.Store, mgr *session.Manager, fake *fakeTmux, verdict claudecode.ModelVerdict, err error, calls *int) *sessionLauncher {
	return &sessionLauncher{
		store: st, manager: mgr, tmux: fake, log: zerolog.Nop(), claudeBin: "irrelevant-never-reached",
		hookScript: "/bin/true", statusLineScript: "/bin/true",
		checkModel: func(context.Context, string, string) (claudecode.ModelVerdict, error) {
			*calls++
			return verdict, err
		},
	}
}

// TestLauncher_ModelUnrecognised_RefusesAndWritesNothing is D7/INV-1, asserted from both
// of INV-1's source states: a never-launched directory (no repo row, no settings file)
// and a directory with a prior launch (repo row and settings.local.json already present).
// Either way, a refused launch leaves the store, the fake tmux and the settings file
// exactly as they started.
func TestLauncher_ModelUnrecognised_RefusesAndWritesNothing(t *testing.T) {
	tests := []struct {
		name        string
		priorLaunch bool
	}{
		{"never-launched directory", false},
		{"directory with a prior launch", true},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			st := openLauncherTestStore(t)
			var upserts []*session.Session
			mgr := newSessionTestManager(t, st, withOnUpsert(func(s *session.Session) { upserts = append(upserts, s.Clone()) }))
			fake := newFakeTmux()
			dir := t.TempDir()
			settingsPath := filepath.Join(dir, ".claude", "settings.local.json")

			var priorSettings []byte
			if tt.priorLaunch {
				var okCalls int
				okLauncher := newModelCheckLauncher(st, mgr, fake, claudecode.ModelRecognised, nil, &okCalls)
				_, lerr := okLauncher.Launch(context.Background(), createSessionRequest{
					Directory: dir, Model: "sonnet", PermissionMode: "default",
				})
				require.Nil(t, lerr)
				var err error
				priorSettings, err = os.ReadFile(settingsPath)
				require.NoError(t, err)
				upserts = nil // only the refused attempt's broadcasts matter from here
			}

			reposBefore, err := st.ListRepos(context.Background())
			require.NoError(t, err)
			sessionsBefore, err := st.ListSessions(context.Background())
			require.NoError(t, err)
			newSessionCallsBefore := fake.newSessionCalls

			var checkCalls int
			l := newModelCheckLauncher(st, mgr, fake, claudecode.ModelUnrecognised, nil, &checkCalls)

			_, lerr := l.Launch(context.Background(), createSessionRequest{
				Directory: dir, Model: "zephyr", PermissionMode: "default",
			})

			require.NotNil(t, lerr)
			assert.Equal(t, 1, checkCalls)
			assert.Equal(t, http.StatusBadRequest, lerr.status)
			assert.Equal(t, "model_unrecognized", lerr.code)
			assert.Equal(t, `Claude Code doesn't recognise the model "zephyr" — update Claude Code, or pick another model`, lerr.message)

			reposAfter, err := st.ListRepos(context.Background())
			require.NoError(t, err)
			assert.Equal(t, reposBefore, reposAfter, "INV-1: the store's repo rows must be byte-identical after a refusal")

			sessionsAfter, err := st.ListSessions(context.Background())
			require.NoError(t, err)
			assert.Equal(t, sessionsBefore, sessionsAfter, "INV-1: no session row is inserted on a refusal")

			assert.Equal(t, newSessionCallsBefore, fake.newSessionCalls, "INV-1: no tmux session is spawned on a refusal")
			assert.Empty(t, upserts, "INV-1: no sessionUpsert is broadcast on a refusal")

			if tt.priorLaunch {
				afterSettings, err := os.ReadFile(settingsPath)
				require.NoError(t, err)
				assert.Equal(t, priorSettings, afterSettings, "INV-1: settings.local.json must be byte-identical after a refusal")
			} else {
				_, err := os.Stat(settingsPath)
				assert.True(t, os.IsNotExist(err), "INV-1: a never-launched directory must gain no settings.local.json on a refusal")
			}
		})
	}
}

// TestLauncher_ModelRecognised_ProceedsToCreated is D8: a launch whose check reports
// ModelRecognised proceeds to a 201 with the same row a launch with no check configured
// at all would produce — the check itself leaves nothing else about the launch path
// different. Proven by launching the same request twice on the same store, once through
// a checkModel:nil launcher (TestLauncher_SuccessfulLaunchEndToEnd's real-tmux
// equivalent) and once through the ModelRecognised launcher, into a second directory,
// and comparing every field that does not necessarily differ between two distinct
// launches sharing one store's counters (id, RepoID, TmuxTarget/TmuxPane, RailPos,
// StateSince/CreatedAt and Directory itself all encode which launch produced them, so
// those are excluded; every other field must match).
func TestLauncher_ModelRecognised_ProceedsToCreated(t *testing.T) {
	st := openLauncherTestStore(t)
	mgr := newSessionTestManager(t, st)
	fake := newFakeTmux()

	noCheckLauncher := &sessionLauncher{
		store: st, manager: mgr, tmux: fake, log: zerolog.Nop(), claudeBin: "irrelevant-never-reached",
		hookScript: "/bin/true", statusLineScript: "/bin/true",
	}
	baseline, lerrBaseline := noCheckLauncher.Launch(context.Background(), createSessionRequest{
		Directory: t.TempDir(), Model: "sonnet", PermissionMode: "default",
	})
	require.Nil(t, lerrBaseline)

	var checkCalls int
	l := newModelCheckLauncher(st, mgr, fake, claudecode.ModelRecognised, nil, &checkCalls)

	sess, lerr := l.Launch(context.Background(), createSessionRequest{
		Directory: t.TempDir(), Model: "sonnet", PermissionMode: "default",
	})

	require.Nil(t, lerr)
	assert.Equal(t, 1, checkCalls)
	assert.Equal(t, session.StateStarted, sess.State)
	assert.NotEmpty(t, sess.TmuxTarget)
	require.NotNil(t, baseline.Model, "D8: baseline launch must have resolved a model")
	require.NotNil(t, sess.Model)

	// Whole-struct comparison after zeroing the fields that necessarily differ between
	// two distinct launches sharing one store's counters (id, RepoID, TmuxTarget/TmuxPane,
	// RailPos, StateSince/CreatedAt and Directory itself all encode which launch produced
	// them) proves every other field — including ones no individual assertion names, so
	// the claim in the doc comment above stays true as fields are added.
	baselineCmp, sessCmp := *baseline, *sess
	for _, c := range []*session.Session{&baselineCmp, &sessCmp} {
		c.ID = 0
		c.RepoID = 0
		c.TmuxTarget = ""
		c.TmuxPane = ""
		c.RailPos = 0
		c.StateSince = time.Time{}
		c.CreatedAt = time.Time{}
		c.Directory = ""
	}
	assert.Equal(t, baselineCmp, sessCmp, "D8: every field but id/RepoID/TmuxTarget/TmuxPane/RailPos/StateSince/CreatedAt/Directory must match regardless of whether a check ran")

	// D8: the repo row's defaults are recorded identically regardless of whether a check ran.
	baselineRepo, err := st.GetRepo(context.Background(), baseline.RepoID)
	require.NoError(t, err)
	repo, err := st.GetRepo(context.Background(), sess.RepoID)
	require.NoError(t, err)
	assert.Equal(t, baselineRepo.LaunchCount, repo.LaunchCount)
	require.NotNil(t, baselineRepo.LastModel)
	require.NotNil(t, repo.LastModel)
	assert.Equal(t, *baselineRepo.LastModel, *repo.LastModel)
	require.NotNil(t, baselineRepo.LastPermissionMode)
	require.NotNil(t, repo.LastPermissionMode)
	assert.Equal(t, *baselineRepo.LastPermissionMode, *repo.LastPermissionMode)
}

// TestLauncher_ModelCheckRunError_FailsOpenAndLogsWarn is D6's server half (D6 itself,
// "a run func that returns an error ... yields an error from CheckModel, and Launch
// proceeds to a 201", is exercised at the claudecode-package level in modelcheck_test.go
// — this is Launch's own reaction to that error): a checkModel error never blocks the
// launch, and the warn log names the directory and model. The error text here is a
// realistic process-level failure ("executable file not found"), not raw stderr — REQ-2's
// "never the stderr body" is CheckModel/RunModelCheck's own contract (the returned error
// only ever wraps a process-start/timeout failure, never the captured stderr bytes,
// which CheckModel discards on the error path — see modelcheck_test.go), not something a
// fake at this seam can independently prove.
func TestLauncher_ModelCheckRunError_FailsOpenAndLogsWarn(t *testing.T) {
	st := openLauncherTestStore(t)
	mgr := newSessionTestManager(t, st)
	fake := newFakeTmux()
	dir := t.TempDir()

	var logBuf bytes.Buffer
	var checkCalls int
	l := &sessionLauncher{
		store: st, manager: mgr, tmux: fake, log: zerolog.New(&logBuf), claudeBin: "irrelevant-never-reached",
		hookScript: "/bin/true", statusLineScript: "/bin/true",
		checkModel: func(context.Context, string, string) (claudecode.ModelVerdict, error) {
			checkCalls++
			return claudecode.ModelRecognised, errors.New(`exec: "claude": executable file not found in $PATH`)
		},
	}

	sess, lerr := l.Launch(context.Background(), createSessionRequest{
		Directory: dir, Model: "sonnet", PermissionMode: "default",
	})

	require.Nil(t, lerr, "REQ-2: a check error must fail open, never block the launch")
	assert.Equal(t, 1, checkCalls)
	assert.Equal(t, session.StateStarted, sess.State)
	assert.Contains(t, logBuf.String(), dir, "REQ-2: the warn log must name the directory")
	assert.Contains(t, logBuf.String(), "sonnet", "REQ-2: the warn log must name the model")
}

// TestLauncher_ValidationFailure_NeverInvokesTheModelCheck is D9: a request that fails
// validateLaunchRequest is rejected before checkModel is ever called — an invalid
// directory here (relative, not absolute) triggers the same 400 invalid_request the
// unrelated table in TestHandleCreateSession_ValidationErrors covers at the HTTP layer;
// this asserts the launcher-level side effect that check never fires.
func TestLauncher_ValidationFailure_NeverInvokesTheModelCheck(t *testing.T) {
	st := openLauncherTestStore(t)
	mgr := newSessionTestManager(t, st)
	fake := newFakeTmux()

	var checkCalls int
	l := newModelCheckLauncher(st, mgr, fake, claudecode.ModelUnrecognised, nil, &checkCalls)

	_, lerr := l.Launch(context.Background(), createSessionRequest{
		Directory: "relative/dir", Model: "sonnet", PermissionMode: "default",
	})

	require.NotNil(t, lerr)
	assert.Equal(t, "invalid_request", lerr.code)
	assert.Equal(t, 0, checkCalls, "D9: validateLaunchRequest must reject before checkModel is ever invoked")
}

// --- plan session-lifecycle: red tests, written and run against the unmodified tree
// (Implementation Notes § Red-first). Each covers one D* acceptance criterion; the
// package will not build until tmux.ErrSessionExists exists (D4/D5 below), which is the
// correct red state.

// TestHandleCreateSession_OrphanedTmuxSessionDoesNotBlockLaunch is the #26 reproducer
// (plan session-lifecycle D3): an orphaned muster-1 tmux session with an otherwise-empty
// store must not wedge every future launch. Today, the very first CreateSession in a
// fresh store allocates id 1, so `tmux new-session -s muster-1` collides with the
// pre-existing orphan and Launch rolls the row back and returns 500 launch_failed —
// permanently, since the rollback frees id 1 again for the next attempt.
func TestHandleCreateSession_OrphanedTmuxSessionDoesNotBlockLaunch(t *testing.T) {
	socket := tmuxtest.Socket(t)
	client := tmux.New(socket)
	dir := t.TempDir()
	// Pre-create the orphan issue #26 describes: muster-1 exists on the socket, but the
	// store has never heard of it (e.g. a prior daemon crashed after spawning it).
	_, _, err := client.NewSession(context.Background(), 1, dir, nil, sleepForeverCommand())
	require.NoError(t, err)

	dbPath := filepath.Join(t.TempDir(), "muster.db")
	st, err := store.Open(context.Background(), dbPath, zerolog.Nop())
	require.NoError(t, err)
	t.Cleanup(func() { _ = st.Close() })
	logBuf := &syncBuffer{}
	srv := New(Config{
		Store: st, Logger: zerolog.New(logBuf), UIToken: testUIToken, IngestToken: testIngestToken,
		WebDist: t.TempDir(), DaemonVersion: "test-version", TmuxSocket: socket,
		Launch: LaunchConfig{ClaudeBin: sharedStubClaude, HookScript: "/bin/true", StatusLineScript: "/bin/true"},
	})
	testSrv := &testServer{Server: srv, dbPath: dbPath, logs: logBuf, store: st}
	testSrv.Start() // runs the ordinary startup Reconcile — must not adopt or kill muster-1
	t.Cleanup(func() { testSrv.Shutdown(context.Background()) })

	rec := postSessionsRequest(t, testSrv, `{"directory":"`+dir+`","model":"sonnet","permissionMode":"default"}`)

	require.Equal(t, http.StatusCreated, rec.Code, "D3/#26: an orphaned muster-1 must never wedge every future launch")
	var wire struct {
		ID int64 `json:"id"`
	}
	require.NoError(t, json.Unmarshal(rec.Body.Bytes(), &wire))
	assert.GreaterOrEqual(t, wire.ID, int64(2), "the new session's id must not collide with the orphan's")
	t.Cleanup(func() { _ = client.KillSession(context.Background(), fmt.Sprintf("muster-%d", wire.ID)) })

	names, err := client.ListSessions(context.Background())
	require.NoError(t, err)
	assert.Contains(t, names, "muster-1", "the orphan must be left untouched — never adopted, never killed")
}

// TestLauncher_ProbesMaxSessionIDAndDegradesToFloorZeroOnError covers plan
// session-lifecycle D2's launcher half: a MaxSessionID probe failure must be tolerated,
// never fail the launch (REQ-7: "degrades to floor 0 — it never fails a launch"). Today
// Launch never calls MaxSessionID at all, so the probe count stays at zero.
func TestLauncher_ProbesMaxSessionIDAndDegradesToFloorZeroOnError(t *testing.T) {
	st := openLauncherTestStore(t)
	mgr := newSessionTestManager(t, st)
	dir := t.TempDir()
	fake := newFakeTmux()
	fake.maxSessionIDErr = errors.New("boom: tmux unreadable")

	l := &sessionLauncher{
		store: st, manager: mgr, tmux: fake, log: zerolog.Nop(), claudeBin: "irrelevant-never-reached",
		hookScript: "/bin/true", statusLineScript: "/bin/true",
	}

	_, lerr := l.Launch(context.Background(), createSessionRequest{
		Directory: dir, Model: "sonnet", PermissionMode: "default",
	})

	require.Nil(t, lerr, "REQ-7: a MaxSessionID probe failure must never fail the launch")
	assert.GreaterOrEqual(t, fake.maxSessionIDCalls, 1, "REQ-7: Launch must probe MaxSessionID (and tolerate its failure) before CreateSession")
}

// TestLauncher_RetriesOnceOnASingleErrSessionExistsThenSucceedsWithAHigherID covers plan
// session-lifecycle D4: a single tmux.ErrSessionExists on the first NewSession attempt
// must be retried transparently, with a strictly higher session id on the retry, and the
// retry must succeed.
func TestLauncher_RetriesOnceOnASingleErrSessionExistsThenSucceedsWithAHigherID(t *testing.T) {
	st := openLauncherTestStore(t)
	mgr := newSessionTestManager(t, st)
	dir := t.TempDir()
	fake := newFakeTmux()
	fake.queueNewSessionErrs(tmux.ErrSessionExists)

	l := &sessionLauncher{
		store: st, manager: mgr, tmux: fake, log: zerolog.Nop(), claudeBin: "irrelevant-never-reached",
		hookScript: "/bin/true", statusLineScript: "/bin/true",
	}

	sess, lerr := l.Launch(context.Background(), createSessionRequest{
		Directory: dir, Model: "sonnet", PermissionMode: "default",
	})

	require.Nil(t, lerr, "REQ-7: a single collision must be retried transparently, never surfaced to the caller")
	assert.Equal(t, 2, fake.newSessionCalls, "D4: exactly one retry (two attempts total)")
	ids := fake.newSessionIDsSeen()
	require.Len(t, ids, 2)
	assert.Greater(t, ids[1], ids[0], "D4: the retry's session id must be strictly greater than the first attempt's")
	assert.NotEmpty(t, sess.TmuxTarget)
}

// TestLauncher_ExhaustsThreeAttemptsOnRepeatedErrSessionExists covers plan
// session-lifecycle D5: a launcher that keeps colliding gives up after 3 attempts with a
// 500 launch_failed naming the tmux session, rather than retrying forever or leaking a row
// per attempt.
func TestLauncher_ExhaustsThreeAttemptsOnRepeatedErrSessionExists(t *testing.T) {
	st := openLauncherTestStore(t)
	mgr := newSessionTestManager(t, st)
	dir := t.TempDir()
	fake := newFakeTmux()
	fake.newSessionErr = tmux.ErrSessionExists

	// REQ-10: the 500 body is a fixed phrase now — the colliding tmux session's name
	// lives only in the adjacent log line (daemon-implementation.md's Handoff on this
	// exact test).
	var logBuf bytes.Buffer
	l := &sessionLauncher{
		store: st, manager: mgr, tmux: fake, log: zerolog.New(&logBuf), claudeBin: "irrelevant-never-reached",
		hookScript: "/bin/true", statusLineScript: "/bin/true",
	}

	_, lerr := l.Launch(context.Background(), createSessionRequest{
		Directory: dir, Model: "sonnet", PermissionMode: "default",
	})

	require.NotNil(t, lerr)
	assert.Equal(t, http.StatusInternalServerError, lerr.status)
	assert.Equal(t, "launch_failed", lerr.code)
	assert.Equal(t, msgLaunchFailed, lerr.message, "REQ-10: the response body carries only the fixed phrase")
	assert.Contains(t, logBuf.String(), "muster-", "D5/REQ-10: the colliding tmux session's name lives in the daemon log, not the response body")
	assert.Equal(t, 3, fake.newSessionCalls, "D5: exactly three attempts before giving up")

	rows, err := st.ListSessions(context.Background())
	require.NoError(t, err)
	assert.Empty(t, rows, "every attempt's row must be rolled back, never leaked")
}

// barrierTmux is REQ-5(e)/D4's paneSpawner double: NewSession blocks the first caller
// until a second caller has also arrived, then releases both together — proving two
// concurrent Launch calls actually overlap in tmux rather than being serialized behind
// each other. A build that took the per-id lock *before* allocating an id (instead of
// after, per Launch's own doc comment) would make the second Launch's NewSession never
// arrive until the first's completes, and this fake times out instead of releasing.
type barrierTmux struct {
	mu        sync.Mutex
	arrived   int
	callOrder []int64
	release   chan struct{}
}

func newBarrierTmux() *barrierTmux {
	return &barrierTmux{release: make(chan struct{})}
}

func (b *barrierTmux) NewSession(ctx context.Context, id int64, _ string, _ map[string]string, _ []string) (target, pane string, err error) {
	b.mu.Lock()
	b.callOrder = append(b.callOrder, id)
	b.arrived++
	first := b.arrived == 1
	b.mu.Unlock()

	if first {
		select {
		case <-b.release:
		case <-time.After(3 * time.Second):
			return "", "", errors.New("barrierTmux: second concurrent NewSession never arrived — the Launch calls were serialized")
		case <-ctx.Done():
			return "", "", ctx.Err()
		}
	} else {
		close(b.release)
	}
	return fmt.Sprintf("muster-%d:@1", id), "%1", nil
}

func (b *barrierTmux) NewNamedSession(_ context.Context, name, _ string, _ map[string]string, _ []string) (string, string, error) {
	return name, "%1", nil
}
func (b *barrierTmux) PaneExists(_ context.Context, _ string) (bool, error) { return false, nil }
func (b *barrierTmux) KillWindow(_ context.Context, _ string) error         { return nil }
func (b *barrierTmux) KillSession(_ context.Context, _ string) error        { return nil }
func (b *barrierTmux) MaxSessionID(_ context.Context) (int64, error)        { return 0, nil }

func (b *barrierTmux) newSessionCalls() int {
	b.mu.Lock()
	defer b.mu.Unlock()
	return len(b.callOrder)
}

// TestLauncher_ConcurrentLaunchesForTheSameDirectoryProduceTwoDistinctRows covers
// REQ-5(e)/D4's first half: two concurrent Launch calls into the same directory both
// succeed, produce two distinct session rows and two distinct tmux spawns — Launch takes
// its per-id lock only after CreateSession has already allocated a fresh id, so different
// ids' spawns never serialize behind one another.
//
// A captured logger (not zerolog.Nop()) is used deliberately: REQ-10 moved the raw error
// out of the response body, so a failure here needs the log to say why.
func TestLauncher_ConcurrentLaunchesForTheSameDirectoryProduceTwoDistinctRows(t *testing.T) {
	st := openLauncherTestStore(t)
	mgr := newSessionTestManager(t, st)
	dir := t.TempDir()
	fake := newBarrierTmux()

	var logBuf bytes.Buffer
	l := &sessionLauncher{
		store: st, manager: mgr, tmux: fake, log: zerolog.New(&logBuf), claudeBin: "irrelevant-never-reached",
		hookScript: "/bin/true", statusLineScript: "/bin/true",
	}

	type launchResult struct {
		sess *session.Session
		lerr *launchError
	}
	results := make(chan launchResult, 2)
	for range 2 {
		go func() {
			sess, lerr := l.Launch(context.Background(), createSessionRequest{
				Directory: dir, Model: "sonnet", PermissionMode: "default",
			})
			results <- launchResult{sess, lerr}
		}()
	}

	var sessions []*session.Session
	for range 2 {
		r := <-results
		require.Nil(t, r.lerr, "REQ-5(e): both concurrent launches into the same directory must succeed: "+logBuf.String())
		sessions = append(sessions, r.sess)
	}

	require.NotEqual(t, sessions[0].ID, sessions[1].ID, "two distinct session rows")
	assert.Equal(t, 2, fake.newSessionCalls(), "two distinct tmux spawns")

	rows, err := st.ListSessions(context.Background())
	require.NoError(t, err)
	assert.Len(t, rows, 2, "both rows persisted, never one rolled back for no reason")
}
