package server

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/coder/websocket"
	"github.com/rs/zerolog"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/Zalaras/muster/internal/claudecode"
	"github.com/Zalaras/muster/internal/session"
	"github.com/Zalaras/muster/internal/store"
)

const (
	pathSessionsRestart = "/api/sessions/restart"
	restartOld          = "2.1.317"
	restartInstalled    = "2.1.318"
)

func withOnRestartDue(f func(int64)) sessionManagerOpt {
	return func(c *session.Config) { c.OnRestartDue = f }
}

// restartHarness is the restart feature mounted over a real session.Manager and store with fake
// tmux ports, recording every broadcast as the JSON the hub would send. The manager's
// restart-due callback feeds the feature's queue exactly as server.go wires it; the queue is
// drained by hand (drain) so a test controls when a queued restart runs, except where it starts
// the feature itself.
type restartHarness struct {
	t         *testing.T
	st        *store.Store
	mgr       *session.Manager
	fake      *fakeTmux
	killer    *namedKiller
	wire      *wireLog
	terminals *terminalRegistry
	launcher  *sessionLauncher
	feature   *restartFeature
	mux       *http.ServeMux
	logs      *bytes.Buffer
	dir       string
	repoID    int64
}

func newRestartHarness(t *testing.T) *restartHarness {
	t.Helper()
	st := openLauncherTestStore(t)
	h := &restartHarness{t: t, st: st, fake: newFakeTmux(), killer: &namedKiller{}, wire: &wireLog{}, dir: t.TempDir(), logs: &bytes.Buffer{}}
	repo, _, err := st.UpsertRepo(t.Context(), store.UpsertRepoParams{Path: h.dir, Name: "proj", Model: "sonnet", PermissionMode: "default"})
	require.NoError(t, err)
	h.repoID = repo.ID
	h.build()
	h.mgr.SetInstalledClaude(t.Context(), ptrTo(restartInstalled))
	return h
}

// build constructs the manager, launcher and restart feature over h's store; a second call is a
// daemon restart.
func (h *restartHarness) build() {
	h.t.Helper()
	h.terminals = newTerminalRegistry()
	h.mgr = newSessionTestManager(h.t, h.st,
		withTmuxSessions(h.killer),
		withOnUpsert(func(s *session.Session) { h.wire.add(sessionUpsertWire(s)) }),
		withOnRestartDue(func(id int64) { h.feature.enqueue(id) }),
	)
	require.NoError(h.t, h.mgr.LoadAll(h.t.Context()))
	h.launcher = &sessionLauncher{
		store: h.st, manager: h.mgr, tmux: h.fake, log: zerolog.Nop(), claudeBin: "irrelevant-never-reached",
		hookScript: "/bin/true", statusLineScript: "/bin/true",
	}
	h.feature = newRestartFeature(h.mgr, h.launcher, h.terminals, zerolog.New(h.logs))
	noGuard := func(next http.Handler) http.Handler { return next }
	h.mux = http.NewServeMux()
	h.feature.mount(h.mux, noGuard)
	newTerminalFeature(h.terminals, h.mgr, h.fake.attach, zerolog.Nop()).mount(h.mux, noGuard)
}

// restartStateSetters drive a bound, launched session into each display state.
var restartStateSetters = map[string][]claudecode.StateInput{
	"started":     nil,
	"planning":    {{Kind: claudecode.KindTurnActivity, PermissionMode: ptrTo("plan")}},
	"working":     {{Kind: claudecode.KindTurnActivity}},
	"needs_input": {{Kind: claudecode.KindTurnActivity}, {Kind: claudecode.KindNeedsInputPermission}},
	"idle":        {{Kind: claudecode.KindTurnActivity}, {Kind: claudecode.KindTurnClosed, BackgroundTasks: ptrTo(0)}},
	"idle_tasks":  {{Kind: claudecode.KindTurnActivity}, {Kind: claudecode.KindTurnClosed, BackgroundTasks: ptrTo(2)}},
	"failed":      {{Kind: claudecode.KindTurnActivity}, {Kind: claudecode.KindTurnFailed}},
}

// launchBound creates a launched session bound to claude-<id>, in display state state, with no
// version reported.
func (h *restartHarness) launchBound(state string) int64 {
	h.t.Helper()
	ctx := h.t.Context()
	sess, err := h.mgr.CreateSession(ctx, session.CreateParams{
		RepoID: h.repoID, Directory: h.dir, PermissionMode: session.PermissionDefault, Model: "sonnet", FirstLaunchHere: true,
	})
	require.NoError(h.t, err)
	_, err = h.mgr.RecordLaunch(ctx, sess.ID, fmt.Sprintf("muster-%d:@1", sess.ID), "%1")
	require.NoError(h.t, err)
	claudeID := fmt.Sprintf("claude-%d", sess.ID)
	_, err = h.mgr.Apply(ctx, sess.ID, claudeID, nil, claudecode.StateInput{Kind: claudecode.KindBind}, true)
	require.NoError(h.t, err)
	inputs, ok := restartStateSetters[state]
	require.True(h.t, ok, "unknown state %q", state)
	for _, in := range inputs {
		_, err = h.mgr.Apply(ctx, sess.ID, claudeID, nil, in, true)
		require.NoError(h.t, err)
	}
	return sess.ID
}

func (h *restartHarness) postVersion(id int64, v string) {
	h.t.Helper()
	_, err := h.mgr.ApplyStatus(h.t.Context(), id, claudecode.StatusUpdate{Version: &v})
	require.NoError(h.t, err)
}

// behind is a launched session in state that reported restartOld under the installed restartInstalled.
func (h *restartHarness) behind(state string) int64 {
	h.t.Helper()
	id := h.launchBound(state)
	h.postVersion(id, restartOld)
	require.True(h.t, h.get(id).ClaudeBehind)
	return id
}

func (h *restartHarness) pending(state string) int64 {
	h.t.Helper()
	id := h.behind(state)
	changed, err := h.mgr.SetRestartPending(h.t.Context(), id, true)
	require.NoError(h.t, err)
	require.True(h.t, changed)
	return id
}

// storedMark is the restart_pending column itself, which a reloaded mark held off the wire
// still occupies.
func (h *restartHarness) storedMark(id int64) bool {
	h.t.Helper()
	row, err := h.st.GetSession(h.t.Context(), id)
	require.NoError(h.t, err)
	return row.RestartPending
}

// requireHeld asserts id is a reloaded mark held off the wire: neither pending nor behind in
// memory, never due, and still stored.
func (h *restartHarness) requireHeld(id int64) {
	h.t.Helper()
	s := h.get(id)
	require.False(h.t, s.RestartPending, "a held mark is off the wire")
	require.False(h.t, s.ClaudeBehind, "nothing is behind while the installed version is unknown")
	require.NotEmpty(h.t, s.ClaudeVersion, "the running version came back from the row")
	require.True(h.t, h.storedMark(id), "the store still carries the mark")
	require.False(h.t, h.mgr.IsRestartDue(id))
}

func (h *restartHarness) get(id int64) *session.Session {
	h.t.Helper()
	s, ok := h.mgr.Get(id)
	require.True(h.t, ok, "session %d is gone", id)
	return s
}

func (h *restartHarness) input(id int64, in claudecode.StateInput) {
	h.t.Helper()
	_, err := h.mgr.Apply(h.t.Context(), id, h.get(id).ClaudeSessionID, nil, in, true)
	require.NoError(h.t, err)
}

func (h *restartHarness) stop(id int64, tasks int) {
	h.input(id, claudecode.StateInput{Kind: claudecode.KindTurnClosed, BackgroundTasks: &tasks})
}

func (h *restartHarness) do(body string) *httptest.ResponseRecorder {
	h.t.Helper()
	req := httptest.NewRequest(http.MethodPost, pathSessionsRestart, strings.NewReader(body))
	rec := httptest.NewRecorder()
	h.mux.ServeHTTP(rec, req)
	return rec
}

type restartResult struct{ Done, Queued, Skipped, Failed []int64 }

func (h *restartHarness) restart(ids ...int64) restartResult {
	h.t.Helper()
	rec := h.do(fmt.Sprintf(`{"ids":%s}`, jsonIDs(ids...)))
	require.Equal(h.t, http.StatusOK, rec.Code, rec.Body.String())
	body := decodeBody(h.t, rec)
	return restartResult{idList(h.t, body["done"]), idList(h.t, body["queued"]), idList(h.t, body["skipped"]), idList(h.t, body["failed"])}
}

// drain runs the queue's one consumer step by step on the test goroutine: every queued id, in
// order, through fire.
func (h *restartHarness) drain() []int64 {
	h.t.Helper()
	var fired []int64
	for id, ok := h.feature.next(); ok; id, ok = h.feature.next() {
		fired = append(fired, id)
		h.feature.fire(h.t.Context(), id)
	}
	return fired
}

func (h *restartHarness) spawns() int { return len(h.fake.newSessionIDsSeen()) }

// upsertsFor counts the upserts the wire carried for id, and those with restartPending true.
func (h *restartHarness) upsertsFor(id int64) (all, pending int) {
	for _, m := range h.wire.all() {
		if m["type"] != "sessionUpsert" {
			continue
		}
		s := m["session"].(map[string]any)
		if int64(s["id"].(float64)) != id {
			continue
		}
		all++
		if s["restartPending"] == true {
			pending++
		}
	}
	return all, pending
}

// TestRestartSessions_ClassifiesEachListedID: unknown, dead, no version, current,
// newer-than-installed and unbound sessions are skipped; a behind busy session is queued with
// one upsert showing restartPending, an already pending one is queued with none; a behind free
// one is restarted in place, in listed order.
func TestRestartSessions_ClassifiesEachListedID(t *testing.T) {
	h := newRestartHarness(t)
	dead := h.behind("working")
	_, err := h.mgr.End(t.Context(), dead)
	require.NoError(t, err)
	noVersion := h.launchBound("idle")
	current := h.launchBound("idle")
	h.postVersion(current, restartInstalled)
	newer := h.launchBound("idle")
	h.postVersion(newer, "2.1.400")
	unbound := func() int64 {
		sess, err := h.mgr.CreateSession(t.Context(), session.CreateParams{RepoID: h.repoID, Directory: h.dir, PermissionMode: session.PermissionDefault, Model: "sonnet"})
		require.NoError(t, err)
		_, err = h.mgr.RecordLaunch(t.Context(), sess.ID, fmt.Sprintf("muster-%d:@1", sess.ID), "%1")
		require.NoError(t, err)
		h.postVersion(sess.ID, restartOld)
		return sess.ID
	}()
	busy := map[string]int64{}
	for _, state := range []string{"started", "planning", "working", "needs_input", "idle_tasks"} {
		busy[state] = h.behind(state)
	}
	alreadyPending := h.pending("working")
	freeIdle, freeFailed := h.behind("idle"), h.behind("failed")
	h.wire.reset()
	h.killer.mu.Lock()
	h.killer.killed = nil
	h.killer.mu.Unlock()

	listed := []int64{999999, dead, noVersion, current, newer, unbound, busy["started"], freeIdle, busy["planning"], busy["working"], alreadyPending, freeFailed, busy["needs_input"], busy["idle_tasks"]}
	got := h.restart(listed...)

	assert.Equal(t, []int64{freeIdle, freeFailed}, got.Done)
	assert.Equal(t, []int64{busy["started"], busy["planning"], busy["working"], alreadyPending, busy["needs_input"], busy["idle_tasks"]}, got.Queued, "listed order")
	assert.Equal(t, []int64{999999, dead, noVersion, current, newer, unbound}, got.Skipped)
	assert.Empty(t, got.Failed)

	for state, id := range busy {
		s := h.get(id)
		assert.True(t, s.Alive, state)
		assert.True(t, s.RestartPending, state)
		assert.Equal(t, restartOld, s.ClaudeVersion, "%s: a queued session keeps running", state)
		all, pend := h.upsertsFor(id)
		assert.Equal(t, 1, all, "%s: one upsert", state)
		assert.Equal(t, 1, pend, "%s: showing restartPending", state)
	}
	all, _ := h.upsertsFor(alreadyPending)
	assert.Zero(t, all, "an already pending session is queued with no upsert")
	for _, id := range []int64{999999, dead, noVersion, current, newer, unbound} {
		all, _ := h.upsertsFor(id)
		assert.Zero(t, all, "a skipped session is not touched (%d)", id)
	}
	for _, id := range []int64{freeIdle, freeFailed} {
		s := h.get(id)
		assert.True(t, s.Alive, "resumed in place")
		assert.Empty(t, s.ClaudeVersion)
		assert.False(t, s.RestartPending)
		assert.Equal(t, fmt.Sprintf("claude-%d", id), s.ClaudeSessionID, "the same Claude conversation")
		all, _ := h.upsertsFor(id)
		assert.Equal(t, 2, all, "ended, then resumed")
	}
	assert.Equal(t, []int64{freeIdle, freeFailed}, h.fake.newSessionIDsSeen(), "one spawn each, on the same row ids")
	assert.Equal(t, []string{fmt.Sprintf("muster-%d", freeIdle), fmt.Sprintf("muster-%d", freeFailed)}, h.killer.killedNames())
	assert.Empty(t, h.drain(), "nothing queued for the daemon yet: no listed session is free and pending")
}

func TestRestartSessions_EmptyListsSerialiseAsArrays(t *testing.T) {
	h := newRestartHarness(t)
	rec := h.do(`{"ids":[424242]}`)
	assert.JSONEq(t, `{"done":[],"queued":[],"skipped":[424242],"failed":[]}`, rec.Body.String())
}

// TestRestartSessions_RestartsWithTheLatchedModeAndEffortAndClosesTheTerminal covers the success
// half: the Stop path (final pane snapshot, kill, terminal socket closed 4001 pane_ended, an
// alive:false upsert) then the Resume path (argv with the latched permission mode and effort,
// the same row, an alive:true upsert with claudeVersion null).
func TestRestartSessions_RestartsWithTheLatchedModeAndEffortAndClosesTheTerminal(t *testing.T) {
	h := newRestartHarness(t)
	id := h.launchBound("idle")
	h.input(id, claudecode.StateInput{Kind: claudecode.KindTurnActivity, PermissionMode: ptrTo("plan")})
	h.stop(id, 0)
	_, err := h.mgr.ApplyStatus(t.Context(), id, claudecode.StatusUpdate{Effort: &claudecode.StatusEffort{Level: ptrTo("high")}})
	require.NoError(t, err)
	h.postVersion(id, restartOld)
	require.Equal(t, session.PermissionPlan, h.get(id).PermissionMode)
	bystander := h.behind("idle")
	require.NoError(t, h.mgr.MarkSeen(t.Context(), id), "the card is already read: a terminal attach clears Unread with its own upsert, which would land beside the restart's")

	httpSrv := httptest.NewServer(h.mux)
	t.Cleanup(httpSrv.Close)
	c := dialTerminalOK(t, httpSrv, id)
	defer func() { _ = c.CloseNow() }()
	require.Eventually(t, func() bool { return terminalConnFor(h.terminals, id) != nil }, 3*time.Second, 10*time.Millisecond)
	h.wire.reset()
	closed := make(chan error, 1)
	go func() { closed <- readUntilError(t, c, 5*time.Second) }()

	res := h.restart(id)

	assert.Equal(t, []int64{id}, res.Done)
	argv := h.fake.lastNewSessionArgv()
	resume, _ := argvFlagValue(argv, "--resume")
	mode, _ := argvFlagValue(argv, "--permission-mode")
	effort, _ := argvFlagValue(argv, "--effort")
	assert.Equal(t, fmt.Sprintf("claude-%d", id), resume)
	assert.Equal(t, "plan", mode, "the latched mode, not the launch's")
	assert.Equal(t, "high", effort)
	assert.Equal(t, []int64{id}, h.fake.newSessionIDsSeen(), "the same row id and muster-<id> session")
	assert.Nil(t, terminalConnFor(h.terminals, id), "the terminal socket is closed")
	assert.Equal(t, websocket.StatusCode(4001), websocket.CloseStatus(<-closed))

	var alive []bool
	var versions []any
	for _, m := range h.wire.all() {
		if m["type"] != "sessionUpsert" {
			continue
		}
		s := m["session"].(map[string]any)
		if int64(s["id"].(float64)) != id {
			continue
		}
		alive = append(alive, s["alive"].(bool))
		versions = append(versions, s["claudeVersion"])
	}
	assert.Equal(t, []bool{false, true}, alive, "exactly two upserts for the session: alive:false then alive:true")
	assert.Equal(t, []any{nil, nil}, versions, "claudeVersion is null in both")
	assert.True(t, h.get(bystander).Alive)
	all, _ := h.upsertsFor(bystander)
	assert.Zero(t, all, "the other behind session is untouched")
}

// TestRestartSessions_FailedHalves covers the failure of either half, through the
// batch and through the queue: a Stop half that fails leaves the session alive and untouched
// with no pending mark; a Resume half that fails leaves it ended and resumable with none; and
// neither stops the next listed session from being restarted.
func TestRestartSessions_FailedHalves(t *testing.T) {
	t.Run("stop half fails, from the batch", func(t *testing.T) {
		h := newRestartHarness(t)
		failing, ok := h.behind("idle"), h.behind("idle")
		h.killer.failKill(fmt.Sprintf("muster-%d", failing))

		res := h.restart(failing, ok)

		assert.Equal(t, []int64{ok}, res.Done)
		assert.Equal(t, []int64{failing}, res.Failed, "the response is still 200")
		s := h.get(failing)
		assert.True(t, s.Alive, "untouched")
		assert.Equal(t, restartOld, s.ClaudeVersion)
		assert.False(t, s.RestartPending)
		assert.Equal(t, []int64{ok}, h.fake.newSessionIDsSeen(), "no resume was attempted for the failed one")
	})

	t.Run("stop half fails, from the queue", func(t *testing.T) {
		h := newRestartHarness(t)
		id := h.pending("working")
		h.killer.failKill(fmt.Sprintf("muster-%d", id))
		h.stop(id, 0)

		fired := h.drain()

		assert.Equal(t, []int64{id}, fired)
		s := h.get(id)
		assert.True(t, s.Alive)
		assert.False(t, s.RestartPending, "the mark is cleared by the attempt, so the queue does not retry forever")
		assert.Zero(t, h.spawns())
		assert.Contains(t, h.logs.String(), "queued restart failed", "a queue-fired failure is logged")
		assert.Contains(t, h.logs.String(), `"level":"warn"`)
		assert.NotContains(t, h.logs.String(), "prompt", "no payload is logged")
	})

	t.Run("resume half fails, from the batch", func(t *testing.T) {
		h := newRestartHarness(t)
		id := h.behind("idle")
		h.fake.queueNewSessionErrs(fmt.Errorf("boom: tmux spawn failed"))

		res := h.restart(id)

		assert.Equal(t, []int64{id}, res.Failed)
		s := h.get(id)
		assert.False(t, s.Alive, "left ended")
		assert.Empty(t, s.ClaudeVersion)
		assert.False(t, s.RestartPending)
		assert.Equal(t, fmt.Sprintf("claude-%d", id), s.ClaudeSessionID, "and resumable by hand")
		_, lerr := h.launcher.Resume(t.Context(), id)
		require.Nil(t, lerr, "the Resume button works afterwards")
		assert.True(t, h.get(id).Alive)
	})

	t.Run("resume half fails, from the queue", func(t *testing.T) {
		h := newRestartHarness(t)
		id := h.pending("working")
		other := h.pending("working")
		h.fake.queueNewSessionErrs(fmt.Errorf("boom: tmux spawn failed"))
		h.stop(id, 0)
		h.stop(other, 0)

		fired := h.drain()

		assert.Equal(t, []int64{id, other}, fired)
		assert.False(t, h.get(id).Alive)
		assert.False(t, h.get(id).RestartPending)
		assert.True(t, h.get(other).Alive, "the next queued session is restarted regardless")
		assert.Empty(t, h.get(other).ClaudeVersion)
		assert.Contains(t, h.logs.String(), "queued restart failed")
	})
}

// TestRestartQueue_RestartsOnceWhenTheSessionBecomesFree: a pending session is restarted
// exactly once through each path into free, and not by a Stop that leaves tasks running or a
// permission prompt.
func TestRestartQueue_RestartsOnceWhenTheSessionBecomesFree(t *testing.T) {
	cases := []struct {
		name    string
		state   string
		drive   func(h *restartHarness, id int64)
		queued  bool
		wantRun bool
	}{
		{"Stop with no tasks", "working", func(h *restartHarness, id int64) { h.stop(id, 0) }, true, true},
		{"Stop dropping the count to 0", "idle_tasks", func(h *restartHarness, id int64) {
			h.input(id, claudecode.StateInput{Kind: claudecode.KindTurnActivity})
			h.stop(id, 0)
		}, true, true},
		{"StopFailure", "working", func(h *restartHarness, id int64) {
			h.input(id, claudecode.StateInput{Kind: claudecode.KindTurnFailed})
		}, true, true},
		{"StopFailure from planning", "planning", func(h *restartHarness, id int64) {
			h.input(id, claudecode.StateInput{Kind: claudecode.KindTurnFailed})
		}, true, true},
		{"Stop leaving tasks running", "working", func(h *restartHarness, id int64) { h.stop(id, 1) }, false, false},
		{"a permission prompt", "working", func(h *restartHarness, id int64) {
			h.input(id, claudecode.StateInput{Kind: claudecode.KindNeedsInputPermission})
		}, false, false},
		{"still waiting on a permission prompt", "needs_input", func(h *restartHarness, id int64) {
			h.input(id, claudecode.StateInput{Kind: claudecode.KindNeedsInputPermission})
		}, false, false},
		{"the prompt answered and the turn closed", "needs_input", func(h *restartHarness, id int64) {
			h.input(id, claudecode.StateInput{Kind: claudecode.KindTurnActivity})
			h.stop(id, 0)
		}, true, true},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			h := newRestartHarness(t)
			id := h.pending(tc.state)
			bystander := h.behind("idle")

			tc.drive(h, id)
			fired := h.drain()

			if !tc.wantRun {
				assert.Empty(t, fired, "nothing was offered to the queue")
				assert.Zero(t, h.spawns())
				assert.True(t, h.get(id).RestartPending, "still pending")
				return
			}
			assert.Equal(t, []int64{id}, fired)
			assert.Equal(t, []int64{id}, h.fake.newSessionIDsSeen(), "restarted exactly once")
			s := h.get(id)
			assert.True(t, s.Alive)
			assert.False(t, s.RestartPending)
			assert.Empty(t, s.ClaudeVersion)

			h.feature.enqueue(id)
			h.feature.enqueue(id)
			assert.Equal(t, []int64{id}, h.drain(), "a duplicate queue entry is deduplicated")
			assert.Equal(t, 1, h.spawns(), "and a stale one restarts nothing")
			assert.True(t, h.get(bystander).Alive)
			assert.Equal(t, restartOld, h.get(bystander).ClaudeVersion, "a free behind session nobody confirmed is not restarted")
		})
	}
}

// TestRestartQueue_ASessionBusyAgainBeforeItsTurnIsLeftPending: the queue re-checks under the
// session's lock, so a state change since the entry was queued makes it a no-op that keeps the
// mark; the next free moment restarts it.
func TestRestartQueue_ASessionBusyAgainBeforeItsTurnIsLeftPending(t *testing.T) {
	h := newRestartHarness(t)
	id := h.pending("working")
	h.stop(id, 0)
	h.input(id, claudecode.StateInput{Kind: claudecode.KindTurnActivity})

	assert.Equal(t, []int64{id}, h.drain())

	assert.Zero(t, h.spawns())
	assert.True(t, h.get(id).RestartPending)

	h.stop(id, 0)
	assert.Equal(t, []int64{id}, h.drain())
	assert.Equal(t, 1, h.spawns())
}

// TestRestartQueue_DeathAndRemoveLeaveNothingToFire, at the queue: a queued entry for a
// session that was stopped, died or removed since is a no-op and the session is not resumed.
func TestRestartQueue_DeathAndRemoveLeaveNothingToFire(t *testing.T) {
	ends := map[string]func(h *restartHarness, id int64){
		"Stop": func(h *restartHarness, id int64) {
			_, err := h.mgr.End(t.Context(), id)
			require.NoError(t, err)
		},
		"Remove": func(h *restartHarness, id int64) { require.NoError(t, h.mgr.Remove(t.Context(), id)) },
	}
	for name, end := range ends {
		t.Run(name, func(t *testing.T) {
			h := newRestartHarness(t)
			id := h.pending("working")
			h.stop(id, 0)
			bystander := h.pending("working")
			end(h, id)

			h.drain()

			assert.Zero(t, h.spawns(), "no restart follows")
			if name == "Stop" {
				assert.False(t, h.get(id).Alive, "it stays ended")
				assert.False(t, h.get(id).RestartPending)
			} else {
				assert.False(t, h.mgr.Exists(id))
			}
			assert.True(t, h.get(bystander).RestartPending, "a coexisting pending session keeps its mark")
		})
	}
}

// TestRestart_NeverTouchesSessionsOutsideIDs: with other behind, pending, free and
// current sessions present, a batch stops, resumes and marks only the ids it lists, and a queue
// firing restarts only its own session.
func TestRestart_NeverTouchesSessionsOutsideIDs(t *testing.T) {
	newScene := func() (*restartHarness, map[string]int64) {
		h := newRestartHarness(t)
		ids := map[string]int64{
			"free":         h.behind("idle"),
			"busy":         h.behind("working"),
			"pending busy": h.pending("working"),
			"pending free": h.behind("idle"),
			"other free":   h.behind("failed"),
		}
		ids["current"] = h.launchBound("idle")
		h.postVersion(ids["current"], restartInstalled)
		return h, ids
	}
	unchanged := func(t *testing.T, h *restartHarness, ids map[string]int64, except ...string) {
		t.Helper()
		skip := map[string]bool{}
		for _, e := range except {
			skip[e] = true
		}
		for name, id := range ids {
			if skip[name] {
				continue
			}
			s := h.get(id)
			assert.True(t, s.Alive, name)
			assert.Equal(t, name == "pending busy", s.RestartPending, name)
			assert.NotEmpty(t, s.ClaudeVersion, name)
			all, _ := h.upsertsFor(id)
			assert.Zero(t, all, "%s: no upsert", name)
		}
	}

	t.Run("a restart-now batch", func(t *testing.T) {
		h, ids := newScene()
		h.wire.reset()
		res := h.restart(ids["free"])
		assert.Equal(t, []int64{ids["free"]}, res.Done)
		assert.Equal(t, []string{fmt.Sprintf("muster-%d", ids["free"])}, h.killer.killedNames())
		assert.Equal(t, []int64{ids["free"]}, h.fake.newSessionIDsSeen())
		unchanged(t, h, ids, "free")
	})
	t.Run("a queueing batch", func(t *testing.T) {
		h, ids := newScene()
		h.wire.reset()
		res := h.restart(ids["busy"])
		assert.Equal(t, []int64{ids["busy"]}, res.Queued)
		assert.Empty(t, h.killer.killedNames())
		assert.Zero(t, h.spawns())
		assert.True(t, h.get(ids["busy"]).RestartPending)
		unchanged(t, h, ids, "busy")
	})
	t.Run("a queue firing", func(t *testing.T) {
		h, ids := newScene()
		h.wire.reset()
		h.stop(ids["pending busy"], 0)
		h.wire.reset()
		fired := h.drain()
		assert.Equal(t, []int64{ids["pending busy"]}, fired)
		assert.Equal(t, []int64{ids["pending busy"]}, h.fake.newSessionIDsSeen())
		unchanged(t, h, ids, "pending busy")
	})
}

// TestRestartSessions_RefusesABadIDsList: a malformed or repeating ids list is a 400 invalid_request that changes nothing.
func TestRestartSessions_RefusesABadIDsList(t *testing.T) {
	bodies := map[string]string{
		"body not JSON":        `{`,
		"empty body":           ``,
		"ids missing":          `{}`,
		"ids null":             `{"ids":null}`,
		"ids empty":            `{"ids":[]}`,
		"ids not an array":     `{"ids":"1"}`,
		"ids holds a string":   `{"ids":["a"]}`,
		"ids holds a fraction": `{"ids":[1.5]}`,
		"a duplicate id":       `{"ids":[%d,%d]}`,
		"a non-adjacent dup":   `{"ids":[%d,12345,%d]}`,
	}
	for name, body := range bodies {
		t.Run(name, func(t *testing.T) {
			h := newRestartHarness(t)
			id := h.behind("idle")
			h.wire.reset()
			if strings.Contains(body, "%d") {
				body = fmt.Sprintf(body, id, id)
			}

			rec := h.do(body)

			assertErrorResponse(t, rec, http.StatusBadRequest, "invalid_request", msgBatchIDs)
			assert.True(t, h.get(id).Alive)
			assert.Empty(t, h.wire.kinds())
			assert.Empty(t, h.killer.killedNames())
			assert.Zero(t, h.spawns())
		})
	}
}

func TestRestartSessions_RequiresTheCookie(t *testing.T) {
	srv := newTestServer(t, ClaudeCodeInfo{})

	req := httptest.NewRequest(http.MethodPost, pathSessionsRestart, strings.NewReader(`{"ids":[1]}`))
	rec := httptest.NewRecorder()
	srv.Handler().ServeHTTP(rec, req)

	assert.Equal(t, http.StatusUnauthorized, rec.Code)
}

// heldScene is a daemon start that reloaded stored restart marks: a free, a failed and a busy
// pending session, a free session nobody confirmed and an ended one with its mark gone. The
// manager has not been told the installed version.
type heldScene struct {
	*restartHarness
	freePending, failedPending, busyPending, freeNotPending, deadPending int64
}

func newHeldScene(t *testing.T) *heldScene {
	t.Helper()
	h := newRestartHarness(t)
	s := &heldScene{restartHarness: h}
	s.freePending = h.pending("idle")
	s.failedPending = h.pending("failed")
	s.busyPending = h.pending("working")
	s.freeNotPending = h.behind("idle")
	s.deadPending = h.pending("idle")
	_, err := h.mgr.End(t.Context(), s.deadPending)
	require.NoError(t, err)
	h.killer.mu.Lock()
	h.killer.killed = nil
	h.killer.mu.Unlock()
	require.Zero(t, h.spawns())

	h.build()
	h.wire.reset()
	return s
}

func (s *heldScene) held() []int64 {
	return []int64{s.freePending, s.failedPending, s.busyPending}
}

// TestRestartHeld_NothingIsDueOrRestartableBeforeTheFirstInstalledResult:
// after a daemon restart the stored marks are reloaded and held off the wire, so the
// queue holds nothing however the sessions move, a batch listing one skips it, and the wire
// never shows a pending mark.
func TestRestartHeld_NothingIsDueOrRestartableBeforeTheFirstInstalledResult(t *testing.T) {
	s := newHeldScene(t)

	for _, id := range s.held() {
		s.requireHeld(id)
	}
	assert.False(t, s.storedMark(s.deadPending), "an ended session's mark died with it")
	assert.False(t, s.storedMark(s.freeNotPending))
	assert.Empty(t, s.drain(), "the start sweep waits for the installed version: nothing is queued")

	s.stop(s.busyPending, 0)
	s.postVersion(s.freePending, restartOld)
	assert.Empty(t, s.drain(), "a busy session becoming free does not queue a held mark")
	res := s.restart(s.freePending, s.failedPending, s.busyPending)
	assert.Equal(t, restartResult{Skipped: []int64{s.freePending, s.failedPending, s.busyPending}, Done: []int64{}, Queued: []int64{}, Failed: []int64{}}, res,
		"a restart request cannot reach a held session")

	assert.Zero(t, s.spawns())
	assert.Empty(t, s.killer.killedNames())
	for _, id := range s.held() {
		assert.True(t, s.storedMark(id), "the mark is still stored after the status post and the Stop")
	}
	for _, m := range s.wire.all() {
		if m["type"] != "sessionUpsert" {
			continue
		}
		sess := m["session"].(map[string]any)
		assert.Equal(t, false, sess["restartPending"], "no upsert shows a pending mark")
		if cv, ok := sess["claudeVersion"].(map[string]any); ok {
			assert.Equal(t, false, cv["behind"], "and none shows behind")
		}
	}
}

// TestRestartHeld_TheFirstInstalledResultReleasesTheFreePendingSessionsOnce: a result with the
// sessions still behind releases every held mark, restarts each free one exactly once through
// the queue (a stale entry is no second restart) and leaves the busy one pending until it is
// free; a free session nobody confirmed and an ended one are not touched.
func TestRestartHeld_TheFirstInstalledResultReleasesTheFreePendingSessionsOnce(t *testing.T) {
	s := newHeldScene(t)

	s.feature.installedKnown(t.Context(), ptrTo(restartInstalled))
	s.feature.Start()
	t.Cleanup(func() { s.feature.Stop(context.Background()) })
	require.Eventually(t, func() bool { return s.spawns() == 2 }, 5*time.Second, 10*time.Millisecond)
	s.feature.Stop(t.Context())

	assert.ElementsMatch(t, []int64{s.freePending, s.failedPending}, s.fake.newSessionIDsSeen(), "each free pending session once")
	for _, id := range []int64{s.freePending, s.failedPending} {
		got := s.get(id)
		assert.True(t, got.Alive)
		assert.False(t, got.RestartPending)
		assert.Empty(t, got.ClaudeVersion)
		assert.False(t, s.storedMark(id))
	}
	busy := s.get(s.busyPending)
	assert.True(t, busy.RestartPending, "a busy one is released as pending and keeps waiting")
	assert.True(t, busy.ClaudeBehind)
	assert.True(t, s.storedMark(s.busyPending))
	assert.Equal(t, restartOld, s.get(s.freeNotPending).ClaudeVersion, "a free one nobody confirmed is left alone")
	assert.False(t, s.get(s.deadPending).Alive)
	assert.Equal(t, 2, s.spawns())

	s.feature.enqueue(s.freePending)
	assert.Equal(t, []int64{s.freePending}, s.drain(), "a stale entry is looked at")
	assert.Equal(t, 2, s.spawns(), "and restarts nothing")

	s.stop(s.busyPending, 0)
	assert.Equal(t, []int64{s.busyPending}, s.drain(), "the released busy session restarts when it becomes free")
	assert.Equal(t, 3, s.spawns())
}

// TestRestartHeld_AResultThatLeavesNothingBehindDropsTheMarks: a first result equal to or older
// than the running version, or an unknown one (a failed check, an unresolvable binary), drops
// every held mark, in the store too, and queues and restarts nothing.
func TestRestartHeld_AResultThatLeavesNothingBehindDropsTheMarks(t *testing.T) {
	results := map[string]*string{
		"installed equals the running version":    ptrTo(restartOld),
		"installed is older than the running one": ptrTo("2.1.300"),
		"installed is unknown":                    nil,
	}
	for name, installed := range results {
		t.Run(name, func(t *testing.T) {
			s := newHeldScene(t)

			s.feature.installedKnown(t.Context(), installed)

			assert.Empty(t, s.drain(), "nothing is queued")
			assert.Zero(t, s.spawns())
			for _, id := range s.held() {
				got := s.get(id)
				assert.False(t, got.RestartPending, "the mark is dropped")
				assert.False(t, got.ClaudeBehind)
				assert.False(t, s.storedMark(id), "and dropped from the store")
				assert.True(t, got.Alive, "the session itself is untouched")
				assert.Equal(t, restartOld, got.ClaudeVersion)
			}
			s.stop(s.busyPending, 0)
			assert.Empty(t, s.drain(), "a held session becoming free later restarts nothing")
		})
	}
}

// TestToWireSession_ClaudeVersionAndRestartPending: both keys on every Session object —
// claudeVersion an explicit null until a version is held, then {running, behind}.
func TestToWireSession_ClaudeVersionAndRestartPending(t *testing.T) {
	cases := []struct {
		name    string
		mutate  func(s *session.Session)
		version string
		pending bool
	}{
		{"nothing reported", func(*session.Session) {}, `null`, false},
		{"reported, current", func(s *session.Session) { s.ClaudeVersion = "2.1.318" }, `{"running":"2.1.318","behind":false}`, false},
		{"reported, behind", func(s *session.Session) { s.ClaudeVersion, s.ClaudeBehind = "2.1.317", true }, `{"running":"2.1.317","behind":true}`, false},
		{"behind and pending", func(s *session.Session) { s.ClaudeVersion, s.ClaudeBehind, s.RestartPending = "2.1.317", true, true }, `{"running":"2.1.317","behind":true}`, true},
		{"behind with the version unset reads null", func(s *session.Session) { s.ClaudeBehind = true }, `null`, false},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			s := minimalSession()
			tc.mutate(s)

			b, err := json.Marshal(toWireSession(s))
			require.NoError(t, err)

			var raw map[string]json.RawMessage
			require.NoError(t, json.Unmarshal(b, &raw))
			require.Contains(t, raw, "claudeVersion", "a required key, never omitted")
			require.Contains(t, raw, "restartPending")
			assert.JSONEq(t, tc.version, string(raw["claudeVersion"]))
			assert.JSONEq(t, fmt.Sprintf("%t", tc.pending), string(raw["restartPending"]))
		})
	}
}
