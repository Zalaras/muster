package session

import (
	"bytes"
	"context"
	"errors"
	"path/filepath"
	"strconv"
	"sync"
	"testing"
	"time"

	"github.com/rs/zerolog"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/Zalaras/muster/internal/claudecode"
	"github.com/Zalaras/muster/internal/store"
	"github.com/Zalaras/muster/internal/tmux"
	"github.com/Zalaras/muster/internal/tmux/tmuxtest"

	_ "modernc.org/sqlite"
)

// sleepCommand is the long-running dummy command plan session-lifecycle's real-tmux
// Reconcile/End tests spawn — mirrors internal/tmux/tmux_test.go's own helper of the same
// name (unexported there, so it can't be imported directly).
func sleepCommand() []string {
	return []string{"/bin/sh", "-c", "sleep 60"}
}

func openTestStore(t *testing.T) *store.Store {
	t.Helper()
	st, err := store.Open(context.Background(), filepath.Join(t.TempDir(), "muster.db"), zerolog.Nop())
	require.NoError(t, err)
	t.Cleanup(func() { _ = st.Close() })
	return st
}

// upsertsRecorder is a thread-safe OnUpsert sink for asserting broadcast timing/order.
type upsertsRecorder struct {
	mu   sync.Mutex
	seen []*Session
}

func (r *upsertsRecorder) record(s *Session) {
	r.mu.Lock()
	defer r.mu.Unlock()
	r.seen = append(r.seen, s.Clone())
}

func (r *upsertsRecorder) all() []*Session {
	r.mu.Lock()
	defer r.mu.Unlock()
	out := make([]*Session, len(r.seen))
	copy(out, r.seen)
	return out
}

// fakePaneChecker is a PaneChecker whose answer per target is fully test-controlled —
// no real tmux socket needed to exercise the liveness poll's own logic.
type fakePaneChecker struct {
	mu     sync.Mutex
	exists map[string]bool
	err    map[string]error
	calls  int
}

func newFakePaneChecker() *fakePaneChecker {
	return &fakePaneChecker{exists: map[string]bool{}, err: map[string]error{}}
}

func (f *fakePaneChecker) PaneExists(_ context.Context, target string) (bool, error) {
	f.mu.Lock()
	defer f.mu.Unlock()
	f.calls++
	if err, ok := f.err[target]; ok {
		return false, err
	}
	return f.exists[target], nil
}

func (f *fakePaneChecker) setExists(target string, v bool) {
	f.mu.Lock()
	defer f.mu.Unlock()
	f.exists[target] = v
}

func (f *fakePaneChecker) setErr(target string, err error) {
	f.mu.Lock()
	defer f.mu.Unlock()
	f.err[target] = err
}

// fakeTmuxSessions is a TmuxSessions double: fully test-controlled ListSessions/
// KillSession, no real tmux socket needed. ListSessions' answer is fixed at construction
// (Reconcile's own test scenarios don't need it to change mid-test); KillSession's
// per-name outcome and call log are mutable under a lock since Manager methods call it
// from the caller's own goroutine but tests read the log back afterward.
type fakeTmuxSessions struct {
	mu       sync.Mutex
	sessions []string
	killErr  map[string]error
	killed   []string
	// listErr, when set, makes every ListSessions call fail (plan session-lifecycle
	// D17: a tmux-server-level listing failure must be treated as transient, never as
	// grounds to believe every pane is gone).
	listErr error
}

func newFakeTmuxSessions(sessions ...string) *fakeTmuxSessions {
	return &fakeTmuxSessions{sessions: sessions, killErr: map[string]error{}}
}

func (f *fakeTmuxSessions) ListSessions(_ context.Context) ([]string, error) {
	f.mu.Lock()
	defer f.mu.Unlock()
	if f.listErr != nil {
		return nil, f.listErr
	}
	out := make([]string, len(f.sessions))
	copy(out, f.sessions)
	return out, nil
}

func (f *fakeTmuxSessions) setListErr(err error) {
	f.mu.Lock()
	defer f.mu.Unlock()
	f.listErr = err
}

func (f *fakeTmuxSessions) KillSession(_ context.Context, name string) error {
	f.mu.Lock()
	defer f.mu.Unlock()
	if err, ok := f.killErr[name]; ok {
		return err
	}
	f.killed = append(f.killed, name)
	return nil
}

func (f *fakeTmuxSessions) setKillErr(name string, err error) {
	f.mu.Lock()
	defer f.mu.Unlock()
	f.killErr[name] = err
}

func (f *fakeTmuxSessions) killedNames() []string {
	f.mu.Lock()
	defer f.mu.Unlock()
	out := make([]string, len(f.killed))
	copy(out, f.killed)
	return out
}

// ResolveSessionTarget satisfies TmuxSessions for the tests that only need
// ListSessions/KillSession (Reconcile and kill-path tests, most of this suite's
// fakeTmuxSessions uses) — the same "unsupported" shape a real resolve failure already takes.
// fakeResolvingTmuxSessions (manager_writeorder_test.go) shadows this with a real answer for
// the repair/revive tests that do need one.
func (f *fakeTmuxSessions) ResolveSessionTarget(_ context.Context, _ string) (string, string, error) {
	return "", "", errors.New("fakeTmuxSessions: ResolveSessionTarget not supported")
}

// fakePaneSnapshotter is a PaneSnapshotter double: fully test-controlled CapturePane
// answers per target, no real tmux socket needed (m4-reconcile REQ-4).
type fakePaneSnapshotter struct {
	mu    sync.Mutex
	texts map[string]string
	errs  map[string]error
	calls int
}

func newFakePaneSnapshotter() *fakePaneSnapshotter {
	return &fakePaneSnapshotter{texts: map[string]string{}, errs: map[string]error{}}
}

func (f *fakePaneSnapshotter) CapturePane(_ context.Context, target string) (string, error) {
	f.mu.Lock()
	defer f.mu.Unlock()
	f.calls++
	if err, ok := f.errs[target]; ok {
		return "", err
	}
	return f.texts[target], nil
}

func (f *fakePaneSnapshotter) setText(target, text string) {
	f.mu.Lock()
	defer f.mu.Unlock()
	f.texts[target] = text
}

func (f *fakePaneSnapshotter) setErr(target string, err error) {
	f.mu.Lock()
	defer f.mu.Unlock()
	f.errs[target] = err
}

// testManagerOpt overrides one field of newTestManager's default Config, so a test that
// needs PaneSnapshotter, TmuxSessions, a Watcher, OnRemoved or a non-default PollInterval
// shares this one constructor instead of hand-rolling its own NewManager(Config{...}).
type testManagerOpt func(*Config)

func withPaneSnapshotter(ps PaneSnapshotter) testManagerOpt {
	return func(c *Config) { c.PaneSnapshotter = ps }
}

func withTmuxSessions(ts TmuxSessions) testManagerOpt {
	return func(c *Config) { c.TmuxSessions = ts }
}

func withOnRemoved(f func(int64)) testManagerOpt {
	return func(c *Config) { c.OnRemoved = f }
}

func withWatcher(w Watcher) testManagerOpt {
	return func(c *Config) { c.Watcher = w }
}

func withPollInterval(d time.Duration) testManagerOpt {
	return func(c *Config) { c.PollInterval = d }
}

func withLogger(l zerolog.Logger) testManagerOpt {
	return func(c *Config) { c.Logger = l }
}

// newTestManager is the one constructor every session-package test builds a Manager
// through: it supplies a default fake for each of the three ports NewManager requires
// (PaneChecker, PaneSnapshotter, TmuxSessions), so a test that doesn't care about tmux at
// all can still build a Manager, and testManagerOpt overrides the rest. pc/onUpsert stay
// positional (every call site already passes them) with a nil pc defaulting the same way
// the other two ports do.
func newTestManager(t *testing.T, st *store.Store, pc PaneChecker, onUpsert func(*Session), opts ...testManagerOpt) *Manager {
	t.Helper()
	if pc == nil {
		pc = newFakePaneChecker()
	}
	cfg := Config{
		Store:           st,
		Logger:          zerolog.Nop(),
		PaneChecker:     pc,
		PaneSnapshotter: newFakePaneSnapshotter(),
		TmuxSessions:    newFakeTmuxSessions(),
		OnUpsert:        onUpsert,
		PollInterval:    10 * time.Millisecond, // fast enough for tests to observe within seconds
	}
	for _, opt := range opts {
		opt(&cfg)
	}
	return NewManager(cfg)
}

// TestNewManager_PanicsOnMissingRequiredPort proves PaneChecker, PaneSnapshotter and
// TmuxSessions are each required at construction, one at a time — a missing port must
// panic regardless of which of the three is left nil, not just the first one a caller
// happens to omit.
func TestNewManager_PanicsOnMissingRequiredPort(t *testing.T) {
	base := func() Config {
		return Config{
			Store:           openTestStore(t),
			Logger:          zerolog.Nop(),
			PaneChecker:     newFakePaneChecker(),
			PaneSnapshotter: newFakePaneSnapshotter(),
			TmuxSessions:    newFakeTmuxSessions(),
		}
	}

	tests := []struct {
		name string
		omit func(*Config)
	}{
		{"PaneChecker", func(c *Config) { c.PaneChecker = nil }},
		{"PaneSnapshotter", func(c *Config) { c.PaneSnapshotter = nil }},
		{"TmuxSessions", func(c *Config) { c.TmuxSessions = nil }},
	}
	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			cfg := base()
			tc.omit(&cfg)
			assert.Panics(t, func() { NewManager(cfg) })
		})
	}
}

func createParams(dir string) CreateParams {
	return CreateParams{
		RepoID:          1,
		Directory:       dir,
		PermissionMode:  PermissionDefault,
		Model:           "sonnet",
		FirstLaunchHere: true,
	}
}

// seedRepo inserts a minimal repo row so CreateSession's RepoID foreign key is valid.
func seedRepo(t *testing.T, st *store.Store, dir string) int64 {
	t.Helper()
	repo, _, err := st.UpsertRepo(context.Background(), store.UpsertRepoParams{
		Path: dir, Name: filepath.Base(dir), Model: "sonnet", PermissionMode: "default",
	})
	require.NoError(t, err)
	return repo.ID
}

// TestCreateSession_DoesNotBroadcast covers REQ-2's other half: CreateSession inserts
// and registers the row but does not broadcast — RecordLaunch is the point at which the
// session becomes visible, once a real tmux target exists.
func TestCreateSession_DoesNotBroadcast(t *testing.T) {
	st := openTestStore(t)
	rec := &upsertsRecorder{}
	mgr := newTestManager(t, st, nil, rec.record)
	dir := t.TempDir()
	repoID := seedRepo(t, st, dir)

	params := createParams(dir)
	params.RepoID = repoID
	sess, err := mgr.CreateSession(context.Background(), params)
	require.NoError(t, err)

	assert.Equal(t, StateStarted, sess.State)
	assert.Equal(t, "seed", sess.PermissionModeSource)
	assert.Empty(t, rec.all(), "REQ-2: no broadcast until RecordLaunch stamps the real tmux target")
	assert.True(t, mgr.Exists(sess.ID))
}

// TestRecordLaunch_BroadcastsOnceWithTheRealTarget covers REQ-2's "sessionUpsert
// broadcast before any hook can arrive" — the first (and only, here) broadcast carries
// the real tmux target/pane.
func TestRecordLaunch_BroadcastsOnceWithTheRealTarget(t *testing.T) {
	st := openTestStore(t)
	rec := &upsertsRecorder{}
	mgr := newTestManager(t, st, nil, rec.record)
	dir := t.TempDir()
	params := createParams(dir)
	params.RepoID = seedRepo(t, st, dir)

	sess, err := mgr.CreateSession(context.Background(), params)
	require.NoError(t, err)

	final, err := mgr.RecordLaunch(context.Background(), sess.ID, "muster:@4", "%12")
	require.NoError(t, err)

	assert.Equal(t, "muster:@4", final.TmuxTarget)
	assert.Equal(t, "%12", final.TmuxPane)

	seen := rec.all()
	require.Len(t, seen, 1)
	assert.Equal(t, "muster:@4", seen[0].TmuxTarget)
}

func TestRecordLaunch_UnknownSessionErrors(t *testing.T) {
	st := openTestStore(t)
	mgr := newTestManager(t, st, nil, nil)

	_, err := mgr.RecordLaunch(context.Background(), 999, "muster:@1", "%1")

	assert.Error(t, err)
}

// TestDeleteSession_RemovesFromMemoryAndStoreAndByClaudeIndex covers the launch-failure
// rollback path (plan Implementation Notes) — no session row and no dangling claude-id
// binding survives a rollback.
func TestDeleteSession_RemovesFromMemoryAndStoreAndByClaudeIndex(t *testing.T) {
	st := openTestStore(t)
	mgr := newTestManager(t, st, nil, nil)
	dir := t.TempDir()
	params := createParams(dir)
	params.RepoID = seedRepo(t, st, dir)

	sess, err := mgr.CreateSession(context.Background(), params)
	require.NoError(t, err)
	_, err = mgr.RecordLaunch(context.Background(), sess.ID, "muster:@1", "%1")
	require.NoError(t, err)
	_, err = mgr.Apply(context.Background(), sess.ID, "claude-1", nil, claudecode.StateInput{Kind: claudecode.KindBind}, true)
	require.NoError(t, err)

	require.NoError(t, mgr.DeleteSession(context.Background(), sess.ID))

	assert.False(t, mgr.Exists(sess.ID))
	_, ok := mgr.Resolve("claude-1")
	assert.False(t, ok, "the claude-session-id binding must not survive a delete")

	_, err = st.GetSession(context.Background(), sess.ID)
	assert.Error(t, err, "the row must be gone from the store too")
}

// TestApply_RoutesByClaudeSessionIDAndBroadcasts covers REQ-7/D8: binding a claude
// session id, then applying a subsequent input for that id, both persist and broadcast
// through the same session.
func TestApply_RoutesByClaudeSessionIDAndBroadcasts(t *testing.T) {
	st := openTestStore(t)
	rec := &upsertsRecorder{}
	mgr := newTestManager(t, st, nil, rec.record)
	dir := t.TempDir()
	params := createParams(dir)
	params.RepoID = seedRepo(t, st, dir)

	sess, err := mgr.CreateSession(context.Background(), params)
	require.NoError(t, err)
	_, err = mgr.RecordLaunch(context.Background(), sess.ID, "muster:@1", "%1")
	require.NoError(t, err)

	_, err = mgr.Apply(context.Background(), sess.ID, "claude-1", nil, claudecode.StateInput{Kind: claudecode.KindBind}, true)
	require.NoError(t, err)

	boundID, ok := mgr.Resolve("claude-1")
	require.True(t, ok)
	assert.Equal(t, sess.ID, boundID)

	promptID := "p1"
	final, err := mgr.Apply(context.Background(), sess.ID, "claude-1", &promptID, claudecode.StateInput{Kind: claudecode.KindTurnActivity}, true)
	require.NoError(t, err)
	assert.Equal(t, StateWorking, final.State)

	persisted, err := st.GetSession(context.Background(), sess.ID)
	require.NoError(t, err)
	assert.Equal(t, "working", persisted.State)

	// RecordLaunch's broadcast + the Bind broadcast + the TurnActivity broadcast.
	assert.Len(t, rec.all(), 3)
}

func TestApply_UnknownSessionErrors(t *testing.T) {
	st := openTestStore(t)
	mgr := newTestManager(t, st, nil, nil)

	_, err := mgr.Apply(context.Background(), 42, "claude-1", nil, claudecode.StateInput{Kind: claudecode.KindBind}, true)

	assert.Error(t, err)
}

// TestLoadAll_ReconstructsInMemoryStateAndClaudeBinding covers Edge Case 7: a daemon
// restart reloads sessions from SQLite, including the claude-session-id binding needed
// for routing to keep working without waiting for a fresh SessionStart.
func TestLoadAll_ReconstructsInMemoryStateAndClaudeBinding(t *testing.T) {
	st := openTestStore(t)
	dir := t.TempDir()

	// First "daemon lifetime": create, launch, bind.
	mgr1 := newTestManager(t, st, nil, nil)
	params := createParams(dir)
	params.RepoID = seedRepo(t, st, dir)
	sess, err := mgr1.CreateSession(context.Background(), params)
	require.NoError(t, err)
	_, err = mgr1.RecordLaunch(context.Background(), sess.ID, "muster:@7", "%7")
	require.NoError(t, err)
	_, err = mgr1.Apply(context.Background(), sess.ID, "claude-9", nil, claudecode.StateInput{Kind: claudecode.KindBind}, true)
	require.NoError(t, err)

	// Second "daemon lifetime": a fresh Manager over the same store.
	mgr2 := newTestManager(t, st, nil, nil)
	require.NoError(t, mgr2.LoadAll(context.Background()))

	assert.True(t, mgr2.Exists(sess.ID))
	boundID, ok := mgr2.Resolve("claude-9")
	require.True(t, ok)
	assert.Equal(t, sess.ID, boundID)

	list := mgr2.List()
	require.Len(t, list, 1)
	assert.Equal(t, "muster:@7", list[0].TmuxTarget)
	assert.Equal(t, StateStarted, list[0].State)
}

// TestCheckLiveness_FlipsAliveFalseOnMissingPaneAndBroadcasts covers REQ-11/D16: the
// poll flips alive on the first miss and broadcasts, without touching state.
func TestCheckLiveness_FlipsAliveFalseOnMissingPaneAndBroadcasts(t *testing.T) {
	st := openTestStore(t)
	pc := newFakePaneChecker()
	rec := &upsertsRecorder{}
	mgr := newTestManager(t, st, pc, rec.record)
	dir := t.TempDir()
	params := createParams(dir)
	params.RepoID = seedRepo(t, st, dir)

	sess, err := mgr.CreateSession(context.Background(), params)
	require.NoError(t, err)
	_, err = mgr.RecordLaunch(context.Background(), sess.ID, "muster:@5", "%5")
	require.NoError(t, err)
	pc.setExists("muster:@5", false) // pane already gone by the first tick

	mgr.checkLiveness(context.Background())

	list := mgr.List()
	require.Len(t, list, 1)
	assert.False(t, list[0].Alive)
	require.NotNil(t, list[0].EndedAt)
	assert.Equal(t, StateStarted, list[0].State, "liveness must never change the displayed state")

	persisted, err := st.GetSession(context.Background(), sess.ID)
	require.NoError(t, err)
	assert.False(t, persisted.Alive)
}

func TestCheckLiveness_LeavesAliveSessionsUntouchedWhenPaneExists(t *testing.T) {
	st := openTestStore(t)
	pc := newFakePaneChecker()
	rec := &upsertsRecorder{}
	mgr := newTestManager(t, st, pc, rec.record)
	dir := t.TempDir()
	params := createParams(dir)
	params.RepoID = seedRepo(t, st, dir)

	sess, err := mgr.CreateSession(context.Background(), params)
	require.NoError(t, err)
	_, err = mgr.RecordLaunch(context.Background(), sess.ID, "muster:@6", "%6")
	require.NoError(t, err)
	pc.setExists("muster:@6", true)

	before := rec.all()
	mgr.checkLiveness(context.Background())

	assert.Len(t, rec.all(), len(before), "a live pane must not trigger a spurious broadcast")
	list := mgr.List()
	require.Len(t, list, 1)
	assert.True(t, list[0].Alive)
}

// TestCheckLiveness_LeavesAliveUntouchedWhenPaneCheckErrors covers checkOneLiveness's
// endOnCheckError=false path (review cycle 1 Minor 1/Fix Attempt 1): the ordinary
// periodic poll treats a PaneExists error as a transient hiccup, not a death signal, and
// leaves the session alive for the next tick — unlike End, which passes true because it
// just killed the pane itself (see TestEnd_MarksEndedWhenPostKillPaneCheckErrors).
func TestCheckLiveness_LeavesAliveUntouchedWhenPaneCheckErrors(t *testing.T) {
	st := openTestStore(t)
	pc := newFakePaneChecker()
	rec := &upsertsRecorder{}
	mgr := newTestManager(t, st, pc, rec.record)
	dir := t.TempDir()
	params := createParams(dir)
	params.RepoID = seedRepo(t, st, dir)

	sess, err := mgr.CreateSession(context.Background(), params)
	require.NoError(t, err)
	_, err = mgr.RecordLaunch(context.Background(), sess.ID, "muster:@7", "%7")
	require.NoError(t, err)
	pc.setErr("muster:@7", errors.New("tmux: connection refused"))

	before := rec.all()
	mgr.checkLiveness(context.Background())

	assert.Len(t, rec.all(), len(before), "a check error must not trigger a broadcast — the session is left as-is, not flipped")
	list := mgr.List()
	require.Len(t, list, 1)
	assert.True(t, list[0].Alive, "a transient check error is not a death signal for the periodic poll")
	assert.Nil(t, list[0].EndedAt)

	persisted, err := st.GetSession(context.Background(), sess.ID)
	require.NoError(t, err)
	assert.True(t, persisted.Alive, "the store row must be untouched too")
}

func TestCheckLiveness_SkipsSessionsWithNoTmuxTargetYet(t *testing.T) {
	// The narrow window between CreateSession and RecordLaunch: TmuxTarget is still the
	// "" placeholder, and the poll must not treat that as a dead pane.
	st := openTestStore(t)
	pc := newFakePaneChecker()
	mgr := newTestManager(t, st, pc, nil)
	dir := t.TempDir()
	params := createParams(dir)
	params.RepoID = seedRepo(t, st, dir)

	sess, err := mgr.CreateSession(context.Background(), params)
	require.NoError(t, err)

	mgr.checkLiveness(context.Background())

	assert.Equal(t, 0, pc.calls, "a placeholder tmux target must never be pane-checked")
	list := mgr.List()
	require.Len(t, list, 1)
	assert.True(t, list[0].Alive)
	assert.Equal(t, sess.ID, list[0].ID)
}

func TestCheckLiveness_NilPaneCheckerIsANoOp(t *testing.T) {
	st := openTestStore(t)
	mgr := newTestManager(t, st, nil, nil)
	dir := t.TempDir()
	params := createParams(dir)
	params.RepoID = seedRepo(t, st, dir)
	sess, err := mgr.CreateSession(context.Background(), params)
	require.NoError(t, err)
	_, err = mgr.RecordLaunch(context.Background(), sess.ID, "muster:@1", "%1")
	require.NoError(t, err)

	assert.NotPanics(t, func() { mgr.checkLiveness(context.Background()) })
}

// TestPollLoop_RunsUntilStopped exercises Start/Stop end to end with the real ticker,
// proving the poll loop actually fires and Stop returns promptly.
func TestPollLoop_RunsUntilStopped(t *testing.T) {
	st := openTestStore(t)
	pc := newFakePaneChecker()
	mgr := newTestManager(t, st, pc, nil)
	dir := t.TempDir()
	params := createParams(dir)
	params.RepoID = seedRepo(t, st, dir)
	sess, err := mgr.CreateSession(context.Background(), params)
	require.NoError(t, err)
	_, err = mgr.RecordLaunch(context.Background(), sess.ID, "muster:@1", "%1")
	require.NoError(t, err)
	pc.setExists("muster:@1", false)

	mgr.Start()

	require.Eventually(t, func() bool {
		list := mgr.List()
		return len(list) == 1 && !list[0].Alive
	}, 2*time.Second, 5*time.Millisecond)

	stopCtx, cancel := context.WithTimeout(context.Background(), 2*time.Second)
	defer cancel()
	mgr.Stop(stopCtx)
}

// TestGet_ReturnsCloneForAKnownSessionFalseForUnknown covers the terminal bridge's
// pre-upgrade check (kb:anchor/terminal.ws: 404 unknown id / 409 not_attachable).
func TestGet_ReturnsCloneForAKnownSessionFalseForUnknown(t *testing.T) {
	st := openTestStore(t)
	mgr := newTestManager(t, st, nil, nil)
	dir := t.TempDir()
	params := createParams(dir)
	params.RepoID = seedRepo(t, st, dir)
	sess, err := mgr.CreateSession(context.Background(), params)
	require.NoError(t, err)

	got, ok := mgr.Get(sess.ID)
	require.True(t, ok)
	assert.Equal(t, sess.ID, got.ID)
	got.State = StateFailed // mutate the returned value
	again, _ := mgr.Get(sess.ID)
	assert.Equal(t, StateStarted, again.State, "Get must return an independent clone, not the manager's live pointer")

	_, ok = mgr.Get(999)
	assert.False(t, ok)
}

// TestNudge_FlipsAliveFalseImmediatelyWithoutWaitingForThePollTicker covers REQ-6/D6:
// Nudge re-checks liveness right away rather than lagging the ~5s poll interval — proven
// here by giving the manager a poll interval far longer than the test's timeout, so any
// observed alive:false flip can only have come from Nudge itself, never the ticker.
func TestNudge_FlipsAliveFalseImmediatelyWithoutWaitingForThePollTicker(t *testing.T) {
	st := openTestStore(t)
	pc := newFakePaneChecker()
	rec := &upsertsRecorder{}
	mgr := newTestManager(t, st, pc, rec.record, withPollInterval(time.Hour))
	dir := t.TempDir()
	params := createParams(dir)
	params.RepoID = seedRepo(t, st, dir)
	sess, err := mgr.CreateSession(context.Background(), params)
	require.NoError(t, err)
	_, err = mgr.RecordLaunch(context.Background(), sess.ID, "muster-1:@1", "%1")
	require.NoError(t, err)
	pc.setExists("muster-1:@1", false) // PTY already reported EOF for this pane

	mgr.Nudge(context.Background(), sess.ID)

	got, ok := mgr.Get(sess.ID)
	require.True(t, ok)
	assert.False(t, got.Alive)
	require.NotNil(t, got.EndedAt)

	seen := rec.all()
	require.Len(t, seen, 2, "RecordLaunch's broadcast plus Nudge's liveness-flip broadcast")
	assert.False(t, seen[1].Alive)

	persisted, err := st.GetSession(context.Background(), sess.ID)
	require.NoError(t, err)
	assert.False(t, persisted.Alive)
}

func TestNudge_PaneStillAliveDoesNotBroadcast(t *testing.T) {
	st := openTestStore(t)
	pc := newFakePaneChecker()
	rec := &upsertsRecorder{}
	mgr := newTestManager(t, st, pc, rec.record)
	dir := t.TempDir()
	params := createParams(dir)
	params.RepoID = seedRepo(t, st, dir)
	sess, err := mgr.CreateSession(context.Background(), params)
	require.NoError(t, err)
	_, err = mgr.RecordLaunch(context.Background(), sess.ID, "muster-2:@1", "%1")
	require.NoError(t, err)
	pc.setExists("muster-2:@1", true)

	before := len(rec.all())
	mgr.Nudge(context.Background(), sess.ID)

	assert.Len(t, rec.all(), before)
	got, _ := mgr.Get(sess.ID)
	assert.True(t, got.Alive)
}

func TestNudge_UnknownSessionIsANoOp(t *testing.T) {
	st := openTestStore(t)
	pc := newFakePaneChecker()
	mgr := newTestManager(t, st, pc, nil)

	assert.NotPanics(t, func() { mgr.Nudge(context.Background(), 999) })
	assert.Equal(t, 0, pc.calls)
}

// TestNudge_PlaceholderTargetIsANoOp covers the narrow CreateSession..RecordLaunch
// window (mirrors TestCheckLiveness_SkipsSessionsWithNoTmuxTargetYet for the poll path):
// Nudge must never pane-check a session whose tmux target is still the "" placeholder.
func TestNudge_PlaceholderTargetIsANoOp(t *testing.T) {
	st := openTestStore(t)
	pc := newFakePaneChecker()
	mgr := newTestManager(t, st, pc, nil)
	dir := t.TempDir()
	params := createParams(dir)
	params.RepoID = seedRepo(t, st, dir)
	sess, err := mgr.CreateSession(context.Background(), params)
	require.NoError(t, err)

	mgr.Nudge(context.Background(), sess.ID)

	assert.Equal(t, 0, pc.calls)
}

func TestNudge_NilPaneCheckerIsANoOp(t *testing.T) {
	st := openTestStore(t)
	mgr := newTestManager(t, st, nil, nil)
	dir := t.TempDir()
	params := createParams(dir)
	params.RepoID = seedRepo(t, st, dir)
	sess, err := mgr.CreateSession(context.Background(), params)
	require.NoError(t, err)
	_, err = mgr.RecordLaunch(context.Background(), sess.ID, "muster-3:@1", "%1")
	require.NoError(t, err)

	assert.NotPanics(t, func() { mgr.Nudge(context.Background(), sess.ID) })
}

// TestNudge_AnAlreadyDeadSessionIsANoOp covers checkOneLiveness's shared guard from the
// Nudge entry point specifically: a second Nudge (e.g. a racing takeover and EOF) after
// the session is already alive:false must not re-broadcast.
func TestNudge_AnAlreadyDeadSessionIsANoOp(t *testing.T) {
	st := openTestStore(t)
	pc := newFakePaneChecker()
	rec := &upsertsRecorder{}
	mgr := newTestManager(t, st, pc, rec.record)
	dir := t.TempDir()
	params := createParams(dir)
	params.RepoID = seedRepo(t, st, dir)
	sess, err := mgr.CreateSession(context.Background(), params)
	require.NoError(t, err)
	_, err = mgr.RecordLaunch(context.Background(), sess.ID, "muster-4:@1", "%1")
	require.NoError(t, err)
	pc.setExists("muster-4:@1", false)
	mgr.Nudge(context.Background(), sess.ID)
	firstCount := len(rec.all())

	mgr.Nudge(context.Background(), sess.ID)

	assert.Len(t, rec.all(), firstCount, "a session already flipped dead must not broadcast again")
}

// TestCheckOneLiveness_StoppedGuard_PeriodicPollAndNudgeSkipPersistAfterStop covers
// Fix Attempt 3's `Manager.stopped` guard (kb:adr/lifecycle-reconcile-converges-with-the-socket's
// invariant that shutdown, not an opportunistic real-time signal, owns the final alive
// write once Stop has run): once Stop has run, checkLiveness's periodic-poll path and
// Nudge (both endOnCheckError=false) must observe a missing pane without persisting
// alive:false — leaving the row for shutdown's own on-exit policy or the next boot's
// reconcile to decide. Stop is called without Start (idempotent, Manager.cancel is nil,
// so it returns at once) — only the atomic flag matters here, not the poll goroutine's
// own lifecycle, already covered by TestPollLoop_RunsUntilStopped.
func TestCheckOneLiveness_StoppedGuard_PeriodicPollAndNudgeSkipPersistAfterStop(t *testing.T) {
	for _, tc := range []struct {
		name string
		run  func(mgr *Manager, id int64)
	}{
		{"periodic poll", func(mgr *Manager, _ int64) { mgr.checkLiveness(context.Background()) }},
		{"nudge", func(mgr *Manager, id int64) { mgr.Nudge(context.Background(), id) }},
	} {
		t.Run(tc.name, func(t *testing.T) {
			st := openTestStore(t)
			pc := newFakePaneChecker()
			rec := &upsertsRecorder{}
			mgr := newTestManager(t, st, pc, rec.record)
			dir := t.TempDir()
			params := createParams(dir)
			params.RepoID = seedRepo(t, st, dir)
			sess, err := mgr.CreateSession(context.Background(), params)
			require.NoError(t, err)
			_, err = mgr.RecordLaunch(context.Background(), sess.ID, "muster-stopped:@1", "%1")
			require.NoError(t, err)
			pc.setExists("muster-stopped:@1", true)

			stopCtx, cancel := context.WithTimeout(context.Background(), 2*time.Second)
			defer cancel()
			mgr.Stop(stopCtx)

			pc.setExists("muster-stopped:@1", false) // pane goes away only after Stop has run
			before := len(rec.all())

			tc.run(mgr, sess.ID)

			got, ok := mgr.Get(sess.ID)
			require.True(t, ok)
			assert.True(t, got.Alive, "a post-Stop opportunistic check must not flip alive")
			assert.Nil(t, got.EndedAt)
			assert.Len(t, rec.all(), before, "no persist means no broadcast either")

			persisted, err := st.GetSession(context.Background(), sess.ID)
			require.NoError(t, err)
			assert.True(t, persisted.Alive, "the store row must be untouched by a post-Stop opportunistic check")
		})
	}
}

// TestEnd_StillMarksEndedAfterStop covers the regression risk of Fix Attempt 3's guard
// itself: `-on-exit=kill`'s EndAllSessions -> End -> endLocked -> checkOneLiveness(...,
// true) chain must stay unaffected by Stop having already run, since Stop is now called
// as shutdownGracefully's own first statement ahead of the kill branch. A bystander
// session stays alive throughout and must be untouched (INV-2, matches
// TestEnd_MarksEndedWhenPostKillPaneCheckErrors's shape).
func TestEnd_StillMarksEndedAfterStop(t *testing.T) {
	st := openTestStore(t)
	ctx := context.Background()
	dir := t.TempDir()
	repoID := seedRepo(t, st, dir)
	pc := newFakePaneChecker()
	killer := newFakeTmuxSessions()
	snapper := newFakePaneSnapshotter()
	rec := &upsertsRecorder{}
	mgr := newTestManager(t, st, pc, rec.record, withTmuxSessions(killer), withPaneSnapshotter(snapper))
	params := createParams(dir)
	params.RepoID = repoID

	target, err := mgr.CreateSession(ctx, params)
	require.NoError(t, err)
	targetTmux := "muster-" + strconv.FormatInt(target.ID, 10) + ":@1"
	_, err = mgr.RecordLaunch(ctx, target.ID, targetTmux, "%1")
	require.NoError(t, err)

	other, err := mgr.CreateSession(ctx, params)
	require.NoError(t, err)
	otherTmux := "muster-" + strconv.FormatInt(other.ID, 10) + ":@1"
	_, err = mgr.RecordLaunch(ctx, other.ID, otherTmux, "%1")
	require.NoError(t, err)

	pc.setExists(targetTmux, true)
	pc.setExists(otherTmux, true)

	stopCtx, cancel := context.WithTimeout(ctx, 2*time.Second)
	defer cancel()
	mgr.Stop(stopCtx) // shutdownGracefully's own first statement, ahead of the kill branch

	pc.setExists(targetTmux, false) // simulates the effect of End's own kill-session call

	final, err := mgr.End(ctx, target.ID)
	require.NoError(t, err)
	assert.False(t, final.Alive, "End's own deliberate kill must still be persisted after Stop")
	require.NotNil(t, final.EndedAt)

	assert.Equal(t, []string{"muster-" + strconv.FormatInt(target.ID, 10)}, killer.killedNames())

	targetPersisted, err := st.GetSession(ctx, target.ID)
	require.NoError(t, err)
	assert.False(t, targetPersisted.Alive, "the row must be persisted as ended even though Stop already ran")

	otherAfter, ok := mgr.Get(other.ID)
	require.True(t, ok)
	assert.True(t, otherAfter.Alive, "the bystander session must be untouched by ending a different target")
	assert.Nil(t, otherAfter.EndedAt)

	otherPersisted, err := st.GetSession(ctx, other.ID)
	require.NoError(t, err)
	assert.True(t, otherPersisted.Alive, "the bystander's row must be untouched in the store too")
}

// TestApply_SessionEndAfterStopKeepsResumeChance is the regression test named by the
// sessionend-alive-hint decision
// (plans/maintainability-cleanup/decisions/sessionend-alive-hint/decision.md): Apply has
// no `stopped` guard, so a non-clear SessionEnd hook delivered after Manager.Stop can land
// in the up-to-10s `-on-exit=ask` prompt window between StopLivenessPoll
// (cmd/musterd/onexit.go:48, called via Server.StopLivenessPoll,
// internal/server/server.go:291) and the HTTP shutdown that follows it
// (cmd/musterd/onexit.go:96). Before this fix that hint wrote alive=false straight to the
// row; a daemon restarting with the row paneless and alive=false would have the next
// boot's Reconcile sweep it immediately (reconcile.go's absent+alive=false branch),
// losing Resume. After the fix the row stays alive=true through the whole window, so the
// next boot's Reconcile instead takes the absent+alive=true branch: marked ended and
// kept, one more life before it is finally swept.
func TestApply_SessionEndAfterStopKeepsResumeChance(t *testing.T) {
	st := openTestStore(t)
	ctx := context.Background()
	dir := t.TempDir()
	repoID := seedRepo(t, st, dir)
	pc := newFakePaneChecker()
	mgr := newTestManager(t, st, pc, nil)
	params := createParams(dir)
	params.RepoID = repoID

	target, err := mgr.CreateSession(ctx, params)
	require.NoError(t, err)
	targetTmux := "muster-" + strconv.FormatInt(target.ID, 10) + ":@1"
	_, err = mgr.RecordLaunch(ctx, target.ID, targetTmux, "%1")
	require.NoError(t, err)
	pc.setExists(targetTmux, true)

	bound, err := mgr.Apply(ctx, target.ID, "claude-1", nil, claudecode.StateInput{Kind: claudecode.KindBind}, true)
	require.NoError(t, err)
	require.True(t, bound.Alive)

	stopCtx, cancel := context.WithTimeout(ctx, 2*time.Second)
	defer cancel()
	mgr.Stop(stopCtx) // shutdownGracefully's own first statement, ahead of the ask/kill branch

	pc.setExists(targetTmux, false) // Claude Code exited under -on-exit=ask; the pane is gone
	// mid the up-to-10s prompt window, before HTTP shutdown and before the next boot's
	// Reconcile ever runs.

	// The async hook worker delivers the SessionEnd it received in that window, landing
	// after Stop -- exactly as it can today, since Apply has no `stopped` guard.
	final, err := mgr.Apply(ctx, target.ID, "claude-1", nil, claudecode.StateInput{Kind: claudecode.KindDeathHint}, true)
	require.NoError(t, err)
	assert.True(t, final.Alive, "a non-clear SessionEnd delivered after Stop must not flip alive")
	assert.Nil(t, final.EndedAt)

	persisted, err := st.GetSession(ctx, target.ID)
	require.NoError(t, err)
	assert.True(t, persisted.Alive, "the stored row must stay alive through the whole shutdown window")

	// One daemon lifetime later: the pane is still gone (default fake TmuxSessions lists
	// no sessions), so Reconcile must take the absent+alive=true branch (marked ended,
	// kept for a resume chance) rather than sweeping a row that never should have been
	// persisted alive=false in the first place.
	mgr2 := newTestManager(t, st, pc, nil)
	require.NoError(t, mgr2.LoadAll(ctx))
	report := mgr2.Reconcile(ctx)
	assert.Equal(t, 1, report.MarkedEnded, "the row gets one more life: marked ended, not swept")
	assert.Equal(t, 0, report.Swept)
}

// TestApplyStatus_PersistsAndBroadcastsOnAChange covers REQ-4's happy path: a status
// post carrying new title/model/context data persists the row and broadcasts once.
func TestApplyStatus_PersistsAndBroadcastsOnAChange(t *testing.T) {
	st := openTestStore(t)
	rec := &upsertsRecorder{}
	mgr := newTestManager(t, st, nil, rec.record)
	dir := t.TempDir()
	params := createParams(dir)
	params.RepoID = seedRepo(t, st, dir)
	sess, err := mgr.CreateSession(context.Background(), params)
	require.NoError(t, err)
	_, err = mgr.RecordLaunch(context.Background(), sess.ID, "muster:@1", "%1")
	require.NoError(t, err)
	before := len(rec.all())

	title := "From Status Line"
	final, err := mgr.ApplyStatus(context.Background(), sess.ID, claudecode.StatusUpdate{
		Title:   &title,
		Model:   &claudecode.StatusModel{ID: "claude-opus-5", DisplayName: "Opus 5"},
		Context: &claudecode.StatusContext{UsedPct: 42, TotalInputTokens: 84000, WindowSize: 200000},
	})
	require.NoError(t, err)

	require.NotNil(t, final.Title)
	assert.Equal(t, "From Status Line", *final.Title)
	require.NotNil(t, final.Model)
	assert.Equal(t, "claude-opus-5", final.Model.ID)
	require.NotNil(t, final.Context)
	assert.Equal(t, 42.0, final.Context.UsedPct)

	assert.Len(t, rec.all(), before+1, "a real change must broadcast exactly once")

	persisted, err := st.GetSession(context.Background(), sess.ID)
	require.NoError(t, err)
	require.NotNil(t, persisted.ContextUsedPct)
	assert.Equal(t, 42.0, *persisted.ContextUsedPct)
	require.NotNil(t, persisted.ModelDisplayName)
	assert.Equal(t, "Opus 5", *persisted.ModelDisplayName)
}

// TestApplyStatus_NoChangeDoesNotBroadcast covers REQ-4/INV-5's session-side twin:
// status posts fire on every tool use, so applying the same data twice must not
// double-broadcast a no-op sessionUpsert.
func TestApplyStatus_NoChangeDoesNotBroadcast(t *testing.T) {
	st := openTestStore(t)
	rec := &upsertsRecorder{}
	mgr := newTestManager(t, st, nil, rec.record)
	dir := t.TempDir()
	params := createParams(dir)
	params.RepoID = seedRepo(t, st, dir)
	sess, err := mgr.CreateSession(context.Background(), params)
	require.NoError(t, err)
	_, err = mgr.RecordLaunch(context.Background(), sess.ID, "muster:@1", "%1")
	require.NoError(t, err)

	update := claudecode.StatusUpdate{
		Context: &claudecode.StatusContext{UsedPct: 42, TotalInputTokens: 84000, WindowSize: 200000},
	}
	_, err = mgr.ApplyStatus(context.Background(), sess.ID, update)
	require.NoError(t, err)
	afterFirst := len(rec.all())

	_, err = mgr.ApplyStatus(context.Background(), sess.ID, update)
	require.NoError(t, err)

	assert.Len(t, rec.all(), afterFirst, "an identical status update must not re-broadcast")
}

func TestApplyStatus_UnknownSessionErrors(t *testing.T) {
	st := openTestStore(t)
	mgr := newTestManager(t, st, nil, nil)

	_, err := mgr.ApplyStatus(context.Background(), 999, claudecode.StatusUpdate{})

	assert.Error(t, err)
}

// TestApplyStatus_NeverTouchesAttentionWhileNeedsInput is INV-1's manager-level twin
// (E8's unit-level equivalent): a status post applied while a session is needs_input
// must leave its state and attention exactly as they were.
func TestApplyStatus_NeverTouchesAttentionWhileNeedsInput(t *testing.T) {
	st := openTestStore(t)
	mgr := newTestManager(t, st, nil, nil)
	dir := t.TempDir()
	params := createParams(dir)
	params.RepoID = seedRepo(t, st, dir)
	sess, err := mgr.CreateSession(context.Background(), params)
	require.NoError(t, err)
	_, err = mgr.RecordLaunch(context.Background(), sess.ID, "muster:@1", "%1")
	require.NoError(t, err)
	_, err = mgr.Apply(context.Background(), sess.ID, "claude-1", nil, claudecode.StateInput{Kind: claudecode.KindBind}, true)
	require.NoError(t, err)
	promptID := "p1"
	_, err = mgr.Apply(context.Background(), sess.ID, "claude-1", &promptID, claudecode.StateInput{Kind: claudecode.KindNeedsInputPermission}, true)
	require.NoError(t, err)

	before, ok := mgr.Get(sess.ID)
	require.True(t, ok)
	require.Equal(t, StateNeedsInput, before.State)
	require.NotNil(t, before.Attention)

	title := "Renamed"
	final, err := mgr.ApplyStatus(context.Background(), sess.ID, claudecode.StatusUpdate{Title: &title})
	require.NoError(t, err)

	assert.Equal(t, StateNeedsInput, final.State)
	require.NotNil(t, final.Attention)
	assert.Equal(t, before.Attention.Reason, final.Attention.Reason)
	assert.True(t, before.Attention.Since.Equal(final.Attention.Since))
}

// TestApplyStatus_ModelDisplayNamePersistsAcrossARestart covers REQ-16: a restarted
// daemon shows the real display name a status post provided, not one re-derived from
// the model id.
func TestApplyStatus_ModelDisplayNamePersistsAcrossARestart(t *testing.T) {
	st := openTestStore(t)
	dir := t.TempDir()
	params := createParams(dir)
	params.RepoID = seedRepo(t, st, dir)

	mgr1 := newTestManager(t, st, nil, nil)
	sess, err := mgr1.CreateSession(context.Background(), params)
	require.NoError(t, err)
	_, err = mgr1.RecordLaunch(context.Background(), sess.ID, "muster:@1", "%1")
	require.NoError(t, err)
	_, err = mgr1.ApplyStatus(context.Background(), sess.ID, claudecode.StatusUpdate{
		Model: &claudecode.StatusModel{ID: "claude-haiku-4-5-20251001", DisplayName: "Haiku 4.5"},
	})
	require.NoError(t, err)

	mgr2 := newTestManager(t, st, nil, nil)
	require.NoError(t, mgr2.LoadAll(context.Background()))

	got, ok := mgr2.Get(sess.ID)
	require.True(t, ok)
	require.NotNil(t, got.Model)
	assert.Equal(t, "claude-haiku-4-5-20251001", got.Model.ID)
	assert.Equal(t, "Haiku 4.5", got.Model.DisplayName, "REQ-16: the real display name must survive a restart, not be re-derived from the id")
}

// TestRowToSession_ModelDisplayNameFallsBackToIDForPreM3Rows: a row no status post has
// reached has a null model_display_name column — rowToSession must fall back to the id
// rather than surfacing an empty display name.
func TestRowToSession_ModelDisplayNameFallsBackToIDForPreM3Rows(t *testing.T) {
	modelID := "sonnet"
	row := store.SessionRow{ID: 1, Model: &modelID, ModelDisplayName: nil}

	got := rowToSession(row)

	require.NotNil(t, got.Model)
	assert.Equal(t, "sonnet", got.Model.ID)
	assert.Equal(t, "sonnet", got.Model.DisplayName)
}

// TestReconcile_DeletesEndedRowsMarksDeadPanesEndedLeavesLivePanesByteIdentical covers
// D9/REQ-1: a fresh Manager over a store seeded (by an earlier "daemon lifetime") with an
// already-ended row, an alive row whose pane is now gone, and an alive row whose pane
// still exists — Reconcile must delete the first, mark the second ended (alive:false,
// endedAt set) and keep it, and leave the third byte-identical to its pre-reconcile state.
func TestReconcile_DeletesEndedRowsMarksDeadPanesEndedLeavesLivePanesByteIdentical(t *testing.T) {
	st := openTestStore(t)
	ctx := context.Background()
	dir := t.TempDir()
	repoID := seedRepo(t, st, dir)
	params := createParams(dir)
	params.RepoID = repoID

	// "First daemon lifetime": seed three rows via a throwaway manager.
	seed := newTestManager(t, st, nil, nil)
	endedSess, err := seed.CreateSession(ctx, params)
	require.NoError(t, err)
	_, err = seed.RecordLaunch(ctx, endedSess.ID, "muster-ended:@1", "%1")
	require.NoError(t, err)
	endedRow, err := st.GetSession(ctx, endedSess.ID)
	require.NoError(t, err)
	endedRow.Alive = false
	endedAt := time.Now().UTC().Add(-time.Hour)
	endedRow.EndedAt = &endedAt
	require.NoError(t, st.UpdateSession(ctx, endedRow))

	deadPaneSess, err := seed.CreateSession(ctx, params)
	require.NoError(t, err)
	_, err = seed.RecordLaunch(ctx, deadPaneSess.ID, "muster-deadpane:@1", "%1")
	require.NoError(t, err)

	livePaneSess, err := seed.CreateSession(ctx, params)
	require.NoError(t, err)
	_, err = seed.RecordLaunch(ctx, livePaneSess.ID, "muster-livepane:@1", "%1")
	require.NoError(t, err)

	livePaneBefore, err := st.GetSession(ctx, livePaneSess.ID)
	require.NoError(t, err)

	// "Fresh daemon lifetime": reload from the store with a fake TmuxSessions listing
	// only the live-pane session's real muster-<id> name — ownership classification goes
	// by ListSessions name, not PaneChecker.PaneExists, so what makes a row "still there"
	// is its id appearing in ListSessions' answer, not a PaneChecker verdict on its (here,
	// arbitrary) stored TmuxTarget string.
	killer := newFakeTmuxSessions(tmux.SessionName(livePaneSess.ID))
	rec := &upsertsRecorder{}
	mgr := newTestManager(t, st, nil, rec.record, withTmuxSessions(killer))
	require.NoError(t, mgr.LoadAll(ctx))

	report := mgr.Reconcile(ctx)

	assert.Equal(t, ReconcileReport{KeptAlive: 1, MarkedEnded: 1, Swept: 1}, report)

	// The already-ended row is gone from both memory and the store.
	assert.False(t, mgr.Exists(endedSess.ID))
	_, err = st.GetSession(ctx, endedSess.ID)
	require.Error(t, err)

	// The dead-pane row is marked ended and kept (the resume chance is not lost).
	got, ok := mgr.Get(deadPaneSess.ID)
	require.True(t, ok)
	assert.False(t, got.Alive)
	require.NotNil(t, got.EndedAt)
	persisted, err := st.GetSession(ctx, deadPaneSess.ID)
	require.NoError(t, err)
	assert.False(t, persisted.Alive)
	require.NotNil(t, persisted.EndedAt)

	// The live-pane row is byte-identical to its pre-reconcile state.
	livePaneAfter, err := st.GetSession(ctx, livePaneSess.ID)
	require.NoError(t, err)
	assert.Equal(t, livePaneBefore, livePaneAfter, "a row whose pane still exists must be left byte-identical by Reconcile")
}

// TestReconcile_ReportsUnknownMusterSessionsWithoutCreatingRows covers D10/REQ-2: a
// muster-prefixed tmux session on the socket with no matching row is reported and never
// adopted (no row created); a session whose row IS known, and a tmux session that isn't
// muster-prefixed at all, are both left out of the report. Also covers the log half of
// D10's criterion ("logs (and reports)"): review cycle 2 Minor 6 flagged that only the
// report was asserted, leaving a future refactor free to drop the warn log without this
// test noticing — the logger is now a buffer instead of zerolog.Nop() so the warn line
// itself is asserted, not just observed live by the reviewer.
func TestReconcile_ReportsUnknownMusterSessionsWithoutCreatingRows(t *testing.T) {
	st := openTestStore(t)
	ctx := context.Background()
	dir := t.TempDir()
	repoID := seedRepo(t, st, dir)
	params := createParams(dir)
	params.RepoID = repoID

	mgr0 := newTestManager(t, st, nil, nil)
	sess, err := mgr0.CreateSession(ctx, params)
	require.NoError(t, err)
	knownName := "muster-" + strconv.FormatInt(sess.ID, 10)
	target := knownName + ":@1"
	_, err = mgr0.RecordLaunch(ctx, sess.ID, target, "%1")
	require.NoError(t, err)

	killer := newFakeTmuxSessions(knownName, "muster-999999", "not-a-muster-session-at-all")
	pc := newFakePaneChecker()
	pc.setExists(target, true)
	var logBuf bytes.Buffer
	mgr := newTestManager(t, st, pc, nil, withTmuxSessions(killer), withLogger(zerolog.New(&logBuf)))
	require.NoError(t, mgr.LoadAll(ctx))

	report := mgr.Reconcile(ctx)

	assert.Equal(t, []string{"muster-999999"}, report.UnknownSessions,
		"the known session and the non-muster-prefixed session must not be reported")

	rows, err := st.ListSessions(ctx)
	require.NoError(t, err)
	assert.Len(t, rows, 1, "an unknown tmux session must never get a row created for it")

	logs := logBuf.String()
	assert.Contains(t, logs, "unknown muster tmux session on socket; not adopted",
		"D10 requires an unknown muster-prefixed tmux session to be logged, not just reported")
	assert.Contains(t, logs, `"tmux_session":"muster-999999"`,
		"the warn line must name the specific unknown session")
}

// TestReconcile_ReportsAndLogsAMusterPrefixedNameMatchingNeitherShapeAsUnknown covers plan
// session-lifecycle D22/review Major 1 (Edge Case 22): a tmux session whose name is
// muster-prefixed but matches neither the bare "muster-<id>" shape nor the
// "muster-<id>-shell" shape (e.g. "muster-99999-foreign") must still be reported in
// UnknownSessions and warn-logged, exactly as any other unknown muster session — REQ-9's
// own words ("reported ... and warn-logged exactly as today") and
// kb:adr/lifecycle-reconcile-converges-with-the-socket both promise this. classifyTmuxNames
// today does `id, ok := tmux.ParseSessionName(name); if !ok { continue }` — silently
// dropping any muster-prefixed name that isn't a bare integer suffix, never reaching the
// unknown-names report at all.
func TestReconcile_ReportsAndLogsAMusterPrefixedNameMatchingNeitherShapeAsUnknown(t *testing.T) {
	st := openTestStore(t)
	ctx := context.Background()

	killer := newFakeTmuxSessions("muster-99999-foreign")
	var logBuf bytes.Buffer
	mgr := newTestManager(t, st, nil, nil, withTmuxSessions(killer), withLogger(zerolog.New(&logBuf)))
	require.NoError(t, mgr.LoadAll(ctx))

	report := mgr.Reconcile(ctx)

	assert.Equal(t, []string{"muster-99999-foreign"}, report.UnknownSessions,
		"D22: a muster-prefixed name matching neither shape must still be reported unknown")

	logs := logBuf.String()
	assert.Contains(t, logs, "unknown muster tmux session on socket; not adopted",
		"D22: it must be warn-logged, not just silently ignored")
	assert.Contains(t, logs, `"tmux_session":"muster-99999-foreign"`,
		"the warn line must name the specific unknown session")

	rows, err := st.ListSessions(ctx)
	require.NoError(t, err)
	assert.Empty(t, rows, "never adopted — no row created for it")
}

// TestReconcile_ListSessionsFailureActsOnNothing covers plan session-lifecycle D26/review
// cycle 2 Major (the consequence of D25): when Reconcile cannot enumerate the socket at
// all, it must act on nothing — never mark an alive row ended, never delete a not-alive
// one. Reconcile's own fallback on a ListSessions error is the trap: it warn-logs and
// falls through to classifySessions, the pre-REQ-9 function, whose `if !r.alive {
// toSweep = append(...); continue }` sweeps every not-alive row completely
// unconditionally — no pane check, no tmux call, nothing — which is the original bug this
// whole plan exists to close, now reachable again through the fallback path. The alive
// row survives today already (classifySessions's own alive branch does consult
// PaneChecker and leaves a row as-is on a check error) — asserted anyway, per the
// invariant-crossed-from-every-state lesson, alongside the not-alive row that does not.
func TestReconcile_ListSessionsFailureActsOnNothing(t *testing.T) {
	st := openTestStore(t)
	ctx := context.Background()
	dir := t.TempDir()
	repoID := seedRepo(t, st, dir)
	params := createParams(dir)
	params.RepoID = repoID

	seed := newTestManager(t, st, nil, nil)
	aliveSess, err := seed.CreateSession(ctx, params)
	require.NoError(t, err)
	aliveTarget := "muster-" + strconv.FormatInt(aliveSess.ID, 10) + ":@1"
	_, err = seed.RecordLaunch(ctx, aliveSess.ID, aliveTarget, "%1")
	require.NoError(t, err)

	deadSess, err := seed.CreateSession(ctx, params)
	require.NoError(t, err)
	deadTarget := "muster-" + strconv.FormatInt(deadSess.ID, 10) + ":@1"
	_, err = seed.RecordLaunch(ctx, deadSess.ID, deadTarget, "%1")
	require.NoError(t, err)
	_, err = seed.End(ctx, deadSess.ID) // seed's default fakes: kill no-ops, PaneExists defaults false, so End still marks it ended
	require.NoError(t, err)

	killer := newFakeTmuxSessions()
	killer.setListErr(errors.New("tmux server unreachable"))
	pc := newFakePaneChecker()
	pc.setErr(aliveTarget, errors.New("tmux server unreachable")) // the same socket, entirely unreachable
	mgr := newTestManager(t, st, pc, nil, withTmuxSessions(killer))
	require.NoError(t, mgr.LoadAll(ctx))

	_ = mgr.Reconcile(ctx)

	aliveAfter, ok := mgr.Get(aliveSess.ID)
	require.True(t, ok)
	assert.True(t, aliveAfter.Alive, "D26: an alive row must not be marked ended when the socket cannot be enumerated")

	deadAfter, ok := mgr.Get(deadSess.ID)
	require.True(t, ok, "D26: a not-alive row must not be deleted when the socket cannot be enumerated")
	assert.False(t, deadAfter.Alive)

	persisted, err := st.GetSession(ctx, deadSess.ID)
	require.NoError(t, err, "the row must still be in the store too, not just in memory")
	assert.False(t, persisted.Alive)
}

// TestRecordResume_UpdatesTargetClearsSnapshotLeavesStateUntouched covers REQ-7: a
// resumed session's tmux target/pane are updated, alive is set true and endedAt cleared,
// the stale pane snapshot is cleared (a fresh pane has nothing captured yet), and state is
// left exactly as it was — it only becomes idle once the enveloped
// SessionStart(source:"resume") arrives via the ordinary Apply/KindResumeBind path.
func TestRecordResume_UpdatesTargetClearsSnapshotLeavesStateUntouched(t *testing.T) {
	st := openTestStore(t)
	ctx := context.Background()
	dir := t.TempDir()
	repoID := seedRepo(t, st, dir)
	pc := newFakePaneChecker()
	snap := newFakePaneSnapshotter()
	mgr := newTestManager(t, st, pc, nil, withPaneSnapshotter(snap))
	params := createParams(dir)
	params.RepoID = repoID
	sess, err := mgr.CreateSession(ctx, params)
	require.NoError(t, err)
	oldTarget := "muster-resume-x:@1"
	_, err = mgr.RecordLaunch(ctx, sess.ID, oldTarget, "%1")
	require.NoError(t, err)
	snap.setText(oldTarget, "old pane text")
	pc.setExists(oldTarget, true)
	mgr.checkLiveness(ctx) // captures a snapshot for the old pane
	before, ok := mgr.Get(sess.ID)
	require.True(t, ok)
	require.NotEmpty(t, before.LastSnapshot)

	final, err := mgr.RecordResume(ctx, sess.ID, "muster-resume-x:@2", "%2")
	require.NoError(t, err)

	assert.Equal(t, "muster-resume-x:@2", final.TmuxTarget)
	assert.Equal(t, "%2", final.TmuxPane)
	assert.True(t, final.Alive)
	assert.Nil(t, final.EndedAt)
	assert.Empty(t, final.LastSnapshot, "a fresh pane has nothing captured yet")
	assert.True(t, final.LastSnapshotAt.IsZero())
	assert.Equal(t, before.State, final.State, "state is untouched by RecordResume itself")

	persisted, err := st.GetSession(ctx, sess.ID)
	require.NoError(t, err)
	assert.Nil(t, persisted.LastSnapshot)
}

// TestRecordResume_AliveTracksPaneExistenceOnTheNextPoll covers INV-1's resumed-then-alive
// and resumed-then-immediately-dead cases: after RecordResume, the very next liveness poll
// must set alive to exactly whatever the resumed pane's real existence is — true if it's
// still there, false (with endedAt set) if it died right away (Edge Case 3 in the plan:
// "resume of an id claude no longer has" exits within seconds).
func TestRecordResume_AliveTracksPaneExistenceOnTheNextPoll(t *testing.T) {
	tests := []struct {
		name       string
		paneExists bool
	}{
		{"resumed then still alive on the next poll", true},
		{"resumed then immediately dead on the next poll", false},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			st := openTestStore(t)
			ctx := context.Background()
			dir := t.TempDir()
			repoID := seedRepo(t, st, dir)
			pc := newFakePaneChecker()
			mgr := newTestManager(t, st, pc, nil)
			params := createParams(dir)
			params.RepoID = repoID
			sess, err := mgr.CreateSession(ctx, params)
			require.NoError(t, err)
			oldTarget := "muster-resume-poll:@1"
			_, err = mgr.RecordLaunch(ctx, sess.ID, oldTarget, "%1")
			require.NoError(t, err)
			pc.setExists(oldTarget, false) // dead before the resume

			newTarget := "muster-resume-poll:@2"
			resumed, err := mgr.RecordResume(ctx, sess.ID, newTarget, "%2")
			require.NoError(t, err)
			require.True(t, resumed.Alive)
			require.Nil(t, resumed.EndedAt)

			pc.setExists(newTarget, tt.paneExists)
			mgr.checkLiveness(ctx)

			got, ok := mgr.Get(sess.ID)
			require.True(t, ok)
			assert.Equal(t, tt.paneExists, got.Alive, "INV-1: alive must track the resumed pane's actual existence")
			if !tt.paneExists {
				require.NotNil(t, got.EndedAt)
			}
		})
	}
}

// TestCaptureSnapshot_NeverMutatesStateFields covers D14/INV-4: a pane capture, applied
// against a session parked in every one of the six displayed states, must change only
// LastSnapshot/LastSnapshotAt — every other field (including the unexported prompt-guard
// fields Clone() also copies) must be byte-identical before and after.
func TestCaptureSnapshot_NeverMutatesStateFields(t *testing.T) {
	tests := []struct {
		name  string
		input claudecode.StateInput
	}{
		{"started", claudecode.StateInput{Kind: claudecode.KindBind}},
		{"working", claudecode.StateInput{Kind: claudecode.KindTurnActivity}},
		{"planning", claudecode.StateInput{Kind: claudecode.KindTurnActivity, PermissionMode: strPtr("plan")}},
		{"needs_input", claudecode.StateInput{Kind: claudecode.KindNeedsInputPermission}},
		{"failed", claudecode.StateInput{Kind: claudecode.KindTurnFailed, FailureError: strPtr("server_error")}},
		{"idle", claudecode.StateInput{Kind: claudecode.KindTurnClosed}},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			st := openTestStore(t)
			ctx := context.Background()
			dir := t.TempDir()
			repoID := seedRepo(t, st, dir)
			snap := newFakePaneSnapshotter()
			mgr := newTestManager(t, st, nil, nil, withPaneSnapshotter(snap))
			params := createParams(dir)
			params.RepoID = repoID
			sess, err := mgr.CreateSession(ctx, params)
			require.NoError(t, err)
			target := "muster-capture-" + tt.name + ":@1"
			_, err = mgr.RecordLaunch(ctx, sess.ID, target, "%1")
			require.NoError(t, err)

			_, err = mgr.Apply(ctx, sess.ID, "claude-1", nil, claudecode.StateInput{Kind: claudecode.KindBind}, true)
			require.NoError(t, err)
			if tt.name != "started" {
				promptID := "p1"
				_, err = mgr.Apply(ctx, sess.ID, "claude-1", &promptID, tt.input, true)
				require.NoError(t, err)
			}

			before, ok := mgr.Get(sess.ID)
			require.True(t, ok)
			// review cycle 1 Minor 6: Clone() is a shallow copy, so before.Attention/
			// Failure/Model/Context share the exact same pointers the live session (and
			// therefore `after`, taken post-capture) holds — an *in-place* mutation of one
			// of those pointees would be invisible to a pointer-sharing compare, since both
			// "snapshots" would end up looking at the same, now-mutated, memory. Deref into
			// independent value copies right here, before captureAndStoreSnapshot runs, so such a
			// mutation would actually show up as a diff below.
			beforeDeref := derefSessionPointers(before)

			snap.setText(target, "pane output for "+tt.name)
			mgr.captureAndStoreSnapshot(ctx, ctx, sess.ID, target)

			after, ok := mgr.Get(sess.ID)
			require.True(t, ok)
			afterDeref := derefSessionPointers(after)

			assert.Equal(t, "pane output for "+tt.name, after.LastSnapshot)
			assert.False(t, after.LastSnapshotAt.IsZero())

			assert.Equal(t, beforeDeref, afterDeref, "a pane capture must never mutate any state-machine field's pointee in place (INV-4)")

			beforeCopy := *before
			afterCopy := *after
			beforeCopy.LastSnapshot, afterCopy.LastSnapshot = "", ""
			beforeCopy.LastSnapshotAt, afterCopy.LastSnapshotAt = time.Time{}, time.Time{}
			assert.Equal(t, beforeCopy, afterCopy, "a pane capture must never mutate any state-machine field (INV-4)")
		})
	}
}

func strPtr(s string) *string { return &s }

// sessionPointeeSnapshot holds independent value copies of Session's pointer fields, so
// two snapshots taken from Clone()s that happen to share the underlying pointers (Clone
// is a shallow copy — session.go's own doc comment) can still detect an in-place mutation
// of one of those pointees (review cycle 1 Minor 6). Zero value means the source pointer
// was nil.
type sessionPointeeSnapshot struct {
	hasAttention bool
	attention    Attention
	hasFailure   bool
	failure      Failure
	hasModel     bool
	model        Model
	hasContext   bool
	context      Context
}

func derefSessionPointers(s *Session) sessionPointeeSnapshot {
	var out sessionPointeeSnapshot
	if s.Attention != nil {
		out.hasAttention = true
		out.attention = *s.Attention
	}
	if s.Failure != nil {
		out.hasFailure = true
		out.failure = *s.Failure
	}
	if s.Model != nil {
		out.hasModel = true
		out.model = *s.Model
	}
	if s.Context != nil {
		out.hasContext = true
		out.context = *s.Context
	}
	return out
}

// TestCaptureSnapshot_ErrorLeavesThePreviousSnapshotAndNeverTouchesAlive covers Edge Case
// 9: a transient capture-pane failure is not a pane-missing signal — the previously
// stored snapshot survives untouched and alive is never flipped by a capture error alone
// (only PaneExists governs liveness).
func TestCaptureSnapshot_ErrorLeavesThePreviousSnapshotAndNeverTouchesAlive(t *testing.T) {
	st := openTestStore(t)
	ctx := context.Background()
	dir := t.TempDir()
	repoID := seedRepo(t, st, dir)
	snap := newFakePaneSnapshotter()
	mgr := newTestManager(t, st, nil, nil, withPaneSnapshotter(snap))
	params := createParams(dir)
	params.RepoID = repoID
	sess, err := mgr.CreateSession(ctx, params)
	require.NoError(t, err)
	target := "muster-capture-err:@1"
	_, err = mgr.RecordLaunch(ctx, sess.ID, target, "%1")
	require.NoError(t, err)

	snap.setText(target, "good capture")
	mgr.captureAndStoreSnapshot(ctx, ctx, sess.ID, target)
	before, ok := mgr.Get(sess.ID)
	require.True(t, ok)
	require.Equal(t, "good capture", before.LastSnapshot)

	snap.setErr(target, errors.New("tmux capture-pane: transient failure"))
	mgr.captureAndStoreSnapshot(ctx, ctx, sess.ID, target)

	after, ok := mgr.Get(sess.ID)
	require.True(t, ok)
	assert.Equal(t, "good capture", after.LastSnapshot, "a capture error must leave the previous snapshot in place")
	assert.True(t, after.LastSnapshotAt.Equal(before.LastSnapshotAt))
	assert.True(t, after.Alive, "a capture error is not a pane-missing signal — alive must never flip because of it")

	persisted, err := st.GetSession(ctx, sess.ID)
	require.NoError(t, err)
	require.NotNil(t, persisted.LastSnapshot)
	assert.Equal(t, "good capture", *persisted.LastSnapshot)
}

// TestSnapshot_NeverCapturedReturnsNotOK covers the honest "never captured" sentinel
// (review cycle 1 Minor 2): a session with no capture at all must report ok=false, not a
// zero-value blank text.
func TestSnapshot_NeverCapturedReturnsNotOK(t *testing.T) {
	st := openTestStore(t)
	ctx := context.Background()
	dir := t.TempDir()
	repoID := seedRepo(t, st, dir)
	mgr := newTestManager(t, st, nil, nil)
	params := createParams(dir)
	params.RepoID = repoID
	sess, err := mgr.CreateSession(ctx, params)
	require.NoError(t, err)

	text, at, ok := mgr.Snapshot(sess.ID)
	assert.False(t, ok, "no capture has ever happened for this session")
	assert.Empty(t, text)
	assert.True(t, at.IsZero())
}

// TestSnapshot_UnknownSessionReturnsNotOK covers Snapshot's other not-ok branch: an id the
// manager has no record of at all.
func TestSnapshot_UnknownSessionReturnsNotOK(t *testing.T) {
	mgr := newTestManager(t, openTestStore(t), nil, nil)
	_, _, ok := mgr.Snapshot(999999)
	assert.False(t, ok)
}

// TestSnapshot_GenuinelyBlankCaptureServesTextNotNoSnapshot covers Minor 2/Fix Attempt 1
// directly: LastSnapshotAt.IsZero() is the sentinel, not LastSnapshot == "". A pane that
// was actually captured and happened to be blank (e.g. the prompt cleared the screen)
// must still report ok=true with empty text — the daemon-impl fix's whole point was that
// the *old* sentinel (LastSnapshot == "") could not tell this apart from "never
// captured". storeSnapshot only persists on a text change, so the scenario is built by
// capturing non-blank text first, then a blank capture that changes it.
func TestSnapshot_GenuinelyBlankCaptureServesTextNotNoSnapshot(t *testing.T) {
	st := openTestStore(t)
	ctx := context.Background()
	dir := t.TempDir()
	repoID := seedRepo(t, st, dir)
	snap := newFakePaneSnapshotter()
	mgr := newTestManager(t, st, nil, nil, withPaneSnapshotter(snap))
	params := createParams(dir)
	params.RepoID = repoID
	sess, err := mgr.CreateSession(ctx, params)
	require.NoError(t, err)
	target := "muster-blank-capture:@1"
	_, err = mgr.RecordLaunch(ctx, sess.ID, target, "%1")
	require.NoError(t, err)

	snap.setText(target, "some pane text")
	mgr.captureAndStoreSnapshot(ctx, ctx, sess.ID, target)
	_, _, ok := mgr.Snapshot(sess.ID)
	require.True(t, ok, "sanity check: the non-blank capture is visible")

	snap.setText(target, "") // the screen genuinely went blank on the next capture
	mgr.captureAndStoreSnapshot(ctx, ctx, sess.ID, target)

	text, at, ok := mgr.Snapshot(sess.ID)
	assert.True(t, ok, "a genuinely blank capture must still be reported as captured, not 404 no_snapshot")
	assert.Empty(t, text)
	assert.False(t, at.IsZero(), "capturedAt must be set even though the text is empty")
}

// TestSnapshot_VeryFirstCaptureBlankStillSetsCapturedAt covers review cycle 2 Minor
// 2/Fix Attempt 2: storeSnapshot's diff-skip (sess.LastSnapshot == text) used to
// short-circuit the *very first* capture whenever that capture was itself blank, because
// both sides of the comparison were the in-memory zero value "" — unlike
// TestSnapshot_GenuinelyBlankCaptureServesTextNotNoSnapshot above, which deliberately
// captures non-blank text first (the cycle-1 read-side scenario), this test never
// captures anything but blank text, so it exercises the write-side edge Fix Attempt 2
// actually changed: the guard now also requires !sess.LastSnapshotAt.IsZero() before
// skipping, so a first-ever capture always persists and sets LastSnapshotAt regardless
// of what the captured text is.
func TestSnapshot_VeryFirstCaptureBlankStillSetsCapturedAt(t *testing.T) {
	st := openTestStore(t)
	ctx := context.Background()
	dir := t.TempDir()
	repoID := seedRepo(t, st, dir)
	snap := newFakePaneSnapshotter()
	mgr := newTestManager(t, st, nil, nil, withPaneSnapshotter(snap))
	params := createParams(dir)
	params.RepoID = repoID
	sess, err := mgr.CreateSession(ctx, params)
	require.NoError(t, err)
	target := "muster-first-capture-blank:@1"
	_, err = mgr.RecordLaunch(ctx, sess.ID, target, "%1")
	require.NoError(t, err)

	_, _, before := mgr.Snapshot(sess.ID)
	require.False(t, before, "sanity check: nothing has been captured yet")

	snap.setText(target, "") // the very first capture is itself blank
	mgr.captureAndStoreSnapshot(ctx, ctx, sess.ID, target)

	text, at, ok := mgr.Snapshot(sess.ID)
	assert.True(t, ok, "a genuinely-blank first capture must still be reported as captured, not 404 no_snapshot")
	assert.Empty(t, text)
	assert.False(t, at.IsZero(), "capturedAt must be set on the very first capture even though the text is empty")
}

// TestEnd_OnATwoSessionManagerFlipsOnlyTheTargetsAlive covers D15/INV-2: End must never
// touch a bystander session sharing the same manager/tmux socket — its alive, state,
// tmuxTarget and kill-call count must all be untouched.
func TestEnd_OnATwoSessionManagerFlipsOnlyTheTargetsAlive(t *testing.T) {
	st := openTestStore(t)
	ctx := context.Background()
	dir := t.TempDir()
	repoID := seedRepo(t, st, dir)
	pc := newFakePaneChecker()
	killer := newFakeTmuxSessions()
	snapper := newFakePaneSnapshotter()
	rec := &upsertsRecorder{}
	mgr := newTestManager(t, st, pc, rec.record, withTmuxSessions(killer), withPaneSnapshotter(snapper))
	params := createParams(dir)
	params.RepoID = repoID

	target, err := mgr.CreateSession(ctx, params)
	require.NoError(t, err)
	targetTmux := "muster-" + strconv.FormatInt(target.ID, 10) + ":@1"
	_, err = mgr.RecordLaunch(ctx, target.ID, targetTmux, "%1")
	require.NoError(t, err)

	other, err := mgr.CreateSession(ctx, params)
	require.NoError(t, err)
	otherTmux := "muster-" + strconv.FormatInt(other.ID, 10) + ":@1"
	_, err = mgr.RecordLaunch(ctx, other.ID, otherTmux, "%1")
	require.NoError(t, err)

	pc.setExists(targetTmux, false) // simulates the effect of End's kill-session call
	pc.setExists(otherTmux, true)

	final, err := mgr.End(ctx, target.ID)
	require.NoError(t, err)
	assert.False(t, final.Alive)
	require.NotNil(t, final.EndedAt)

	assert.Equal(t, []string{"muster-" + strconv.FormatInt(target.ID, 10)}, killer.killedNames(),
		"only the target session's tmux session is ever killed")

	otherAfter, ok := mgr.Get(other.ID)
	require.True(t, ok)
	assert.True(t, otherAfter.Alive, "the bystander session must be untouched by End")
	assert.Nil(t, otherAfter.EndedAt)
	assert.Equal(t, StateStarted, otherAfter.State)
	assert.Equal(t, otherTmux, otherAfter.TmuxTarget)

	otherPersisted, err := st.GetSession(ctx, other.ID)
	require.NoError(t, err)
	assert.True(t, otherPersisted.Alive, "the bystander's row must be untouched in the store too")
}

// TestEnd_MarksEndedWhenPostKillPaneCheckErrors covers review cycle 1 Minor 1/Fix Attempt
// 1: End must not return alive:true when the liveness check it runs right after its own
// kill-session call errors (rather than cleanly reporting "gone"). checkOneLiveness's
// endOnCheckError=true (End's caller) must fall through to markEnded instead of leaving
// the row untouched for the next poll, unlike the ordinary periodic poll/nudge path. A
// bystander session with a clean (non-erroring) pane check is present throughout and must
// be unaffected (INV-2).
func TestEnd_MarksEndedWhenPostKillPaneCheckErrors(t *testing.T) {
	st := openTestStore(t)
	ctx := context.Background()
	dir := t.TempDir()
	repoID := seedRepo(t, st, dir)
	pc := newFakePaneChecker()
	killer := newFakeTmuxSessions()
	snapper := newFakePaneSnapshotter()
	mgr := newTestManager(t, st, pc, nil, withTmuxSessions(killer), withPaneSnapshotter(snapper))
	params := createParams(dir)
	params.RepoID = repoID

	target, err := mgr.CreateSession(ctx, params)
	require.NoError(t, err)
	targetTmux := "muster-" + strconv.FormatInt(target.ID, 10) + ":@1"
	_, err = mgr.RecordLaunch(ctx, target.ID, targetTmux, "%1")
	require.NoError(t, err)

	other, err := mgr.CreateSession(ctx, params)
	require.NoError(t, err)
	otherTmux := "muster-" + strconv.FormatInt(other.ID, 10) + ":@1"
	_, err = mgr.RecordLaunch(ctx, other.ID, otherTmux, "%1")
	require.NoError(t, err)

	// The post-kill PaneExists call errors instead of cleanly reporting "gone" — e.g. a
	// transient tmux hiccup on the very target End just killed.
	pc.setErr(targetTmux, errors.New("tmux: connection refused"))
	pc.setExists(otherTmux, true)

	final, err := mgr.End(ctx, target.ID)
	require.NoError(t, err)
	assert.False(t, final.Alive, "End must never report alive:true after a kill it just performed, even if the follow-up check errors")
	require.NotNil(t, final.EndedAt)

	assert.Equal(t, []string{"muster-" + strconv.FormatInt(target.ID, 10)}, killer.killedNames())

	otherAfter, ok := mgr.Get(other.ID)
	require.True(t, ok)
	assert.True(t, otherAfter.Alive, "the bystander session must be untouched by the erroring check on a different target")
	assert.Nil(t, otherAfter.EndedAt)

	targetPersisted, err := st.GetSession(ctx, target.ID)
	require.NoError(t, err)
	assert.False(t, targetPersisted.Alive, "the row must be persisted as ended, not just in memory")

	otherPersisted, err := st.GetSession(ctx, other.ID)
	require.NoError(t, err)
	assert.True(t, otherPersisted.Alive, "the bystander's row must be untouched in the store too")
}

// TestEnd_UnknownAndAlreadyEndedSessions covers End's two error branches
// (kb:anchor/sessions.end): an unknown id is ErrUnknownSession, and an already-ended session is
// ErrSessionNotAlive.
func TestEnd_UnknownAndAlreadyEndedSessions(t *testing.T) {
	st := openTestStore(t)
	mgr := newTestManager(t, st, nil, nil)

	_, err := mgr.End(context.Background(), 999)
	require.ErrorIs(t, err, ErrUnknownSession)

	dir := t.TempDir()
	params := createParams(dir)
	params.RepoID = seedRepo(t, st, dir)
	sess, err := mgr.CreateSession(context.Background(), params)
	require.NoError(t, err)
	_, err = mgr.RecordLaunch(context.Background(), sess.ID, "muster-already-ended:@1", "%1")
	require.NoError(t, err)
	_, err = mgr.markEnded(context.Background(), sess.ID)
	require.NoError(t, err)

	_, err = mgr.End(context.Background(), sess.ID)
	assert.ErrorIs(t, err, ErrSessionNotAlive)
}

// TestRemove_EndsAnAliveSessionFirstAndLeavesTheRowOnAFailingKill covers D16/Edge Case 5:
// a successful Remove of an alive session runs the kill path first, and OnRemoved fires
// only then; a failing kill leaves the row (and the claude-id binding) untouched and
// propagates the error — never a deleted row with a running pane. A bystander session is
// present throughout and must be unaffected either way (INV-2).
func TestRemove_EndsAnAliveSessionFirstAndLeavesTheRowOnAFailingKill(t *testing.T) {
	st := openTestStore(t)
	ctx := context.Background()
	dir := t.TempDir()
	repoID := seedRepo(t, st, dir)
	params := createParams(dir)
	params.RepoID = repoID

	t.Run("successful kill removes the row and fires OnRemoved", func(t *testing.T) {
		pc := newFakePaneChecker()
		killer := newFakeTmuxSessions()
		var removedIDs []int64
		mgr := newTestManager(t, st, pc, nil, withTmuxSessions(killer), withOnRemoved(func(id int64) { removedIDs = append(removedIDs, id) }))

		target, err := mgr.CreateSession(ctx, params)
		require.NoError(t, err)
		targetTmux := "muster-" + strconv.FormatInt(target.ID, 10) + ":@1"
		_, err = mgr.RecordLaunch(ctx, target.ID, targetTmux, "%1")
		require.NoError(t, err)
		_, err = mgr.Apply(ctx, target.ID, "claude-remove-1", nil, claudecode.StateInput{Kind: claudecode.KindBind}, true)
		require.NoError(t, err)

		bystander, err := mgr.CreateSession(ctx, params)
		require.NoError(t, err)
		bystanderTmux := "muster-" + strconv.FormatInt(bystander.ID, 10) + ":@1"
		_, err = mgr.RecordLaunch(ctx, bystander.ID, bystanderTmux, "%1")
		require.NoError(t, err)

		pc.setExists(targetTmux, false) // the kill "succeeds" -> pane now gone
		pc.setExists(bystanderTmux, true)

		require.NoError(t, mgr.Remove(ctx, target.ID))

		assert.False(t, mgr.Exists(target.ID))
		_, ok := mgr.Resolve("claude-remove-1")
		assert.False(t, ok, "the claude-session-id binding must not survive a remove")
		_, err = st.GetSession(ctx, target.ID)
		require.Error(t, err)
		assert.Equal(t, []string{"muster-" + strconv.FormatInt(target.ID, 10)}, killer.killedNames())
		assert.Equal(t, []int64{target.ID}, removedIDs)

		bystanderAfter, ok := mgr.Get(bystander.ID)
		require.True(t, ok)
		assert.True(t, bystanderAfter.Alive, "the bystander must survive the other session's Remove")
	})

	t.Run("a failing kill leaves the row and never fires OnRemoved", func(t *testing.T) {
		pc := newFakePaneChecker()
		killer := newFakeTmuxSessions()
		var removedIDs []int64
		mgr := newTestManager(t, st, pc, nil, withTmuxSessions(killer), withOnRemoved(func(id int64) { removedIDs = append(removedIDs, id) }))

		sess, err := mgr.CreateSession(ctx, params)
		require.NoError(t, err)
		tmuxName := "muster-" + strconv.FormatInt(sess.ID, 10)
		_, err = mgr.RecordLaunch(ctx, sess.ID, tmuxName+":@1", "%1")
		require.NoError(t, err)
		killer.setKillErr(tmuxName, errors.New("tmux kill-session: boom"))

		err = mgr.Remove(ctx, sess.ID)

		require.Error(t, err)
		assert.True(t, mgr.Exists(sess.ID), "the row must survive a failed kill")
		_, getErr := st.GetSession(ctx, sess.ID)
		require.NoError(t, getErr, "the row must still be in the store")
		assert.Empty(t, removedIDs, "OnRemoved must never fire when the kill failed")
	})
}

func TestRemove_UnknownSessionIsErrUnknownSession(t *testing.T) {
	st := openTestStore(t)
	mgr := newTestManager(t, st, nil, nil)

	err := mgr.Remove(context.Background(), 999)

	assert.ErrorIs(t, err, ErrUnknownSession)
}

func TestList_ReturnsClonesNotLiveReferences(t *testing.T) {
	st := openTestStore(t)
	mgr := newTestManager(t, st, nil, nil)
	dir := t.TempDir()
	params := createParams(dir)
	params.RepoID = seedRepo(t, st, dir)
	sess, err := mgr.CreateSession(context.Background(), params)
	require.NoError(t, err)

	list := mgr.List()
	require.Len(t, list, 1)
	list[0].State = StateFailed // mutate the clone

	again := mgr.List()
	require.Len(t, again, 1)
	assert.Equal(t, StateStarted, again[0].State, "List must return independent clones, not the manager's live Session pointers")
	assert.Equal(t, sess.ID, again[0].ID)
}

// --- m4-hook-lifetime: REQ-9/REQ-10/REQ-11 envelope-authoritative binding invariants ---
//
// Per docs/conventions.md and the m1-sessions review lesson (both review Criticals were
// stated invariants that 157 passing per-transition tests missed because every rebind
// test started from the one state with nothing to leak), the tests below assert each
// invariant from every reachable source state, not just the convenient one.

// createLaunchedSession creates and launches a fresh session in dir, in its initial
// State=started, ClaudeSessionID="" shape — the common starting point every helper below
// builds on.
func createLaunchedSession(t *testing.T, mgr *Manager, st *store.Store, dir string) *Session {
	t.Helper()
	ctx := context.Background()
	params := createParams(dir)
	params.RepoID = seedRepo(t, st, dir)
	sess, err := mgr.CreateSession(ctx, params)
	require.NoError(t, err)
	target := "muster-inv-" + strconv.FormatInt(sess.ID, 10) + ":@1"
	_, err = mgr.RecordLaunch(ctx, sess.ID, target, "%1")
	require.NoError(t, err)
	return sess
}

// advanceToState drives sess (already created+launched, in Started/unbound) toward the
// given displayed state via Apply, either binding it to claudeID along the way
// (enveloped=true) or leaving it permanently unbound (enveloped=false — REQ-10's raw
// path never binds, which is exactly how a "never bound but in state X" fixture is
// built for the invariant tables below).
func advanceToState(t *testing.T, mgr *Manager, sessID int64, claudeID string, state State, enveloped bool) {
	t.Helper()
	ctx := context.Background()
	setupPrompt := "setup-p1"
	var err error
	switch state {
	case StateStarted:
		if enveloped {
			_, err = mgr.Apply(ctx, sessID, claudeID, nil, claudecode.StateInput{Kind: claudecode.KindBind}, true)
		}
		// unbound+started: CreateSession/RecordLaunch already leaves it exactly there.
	case StatePlanning:
		mode := "plan"
		_, err = mgr.Apply(ctx, sessID, claudeID, &setupPrompt, claudecode.StateInput{Kind: claudecode.KindTurnActivity, PermissionMode: &mode}, enveloped)
	case StateWorking:
		_, err = mgr.Apply(ctx, sessID, claudeID, &setupPrompt, claudecode.StateInput{Kind: claudecode.KindTurnActivity}, enveloped)
	case StateNeedsInput:
		_, err = mgr.Apply(ctx, sessID, claudeID, &setupPrompt, claudecode.StateInput{Kind: claudecode.KindNeedsInputPermission}, enveloped)
	case StateFailed:
		errTok := "server_error"
		_, err = mgr.Apply(ctx, sessID, claudeID, &setupPrompt, claudecode.StateInput{Kind: claudecode.KindTurnFailed, FailureError: &errTok}, enveloped)
	case StateIdle:
		_, err = mgr.Apply(ctx, sessID, claudeID, &setupPrompt, claudecode.StateInput{Kind: claudecode.KindTurnClosed}, enveloped)
	default:
		t.Fatalf("advanceToState: unsupported state %s", state)
	}
	require.NoError(t, err)
}

// assertBindingConsistent is INV-1 itself: whenever a session has a bound claude id, the
// manager's reverse index must resolve that id back to exactly this session.
func assertBindingConsistent(t *testing.T, mgr *Manager, sess *Session) {
	t.Helper()
	if sess.ClaudeSessionID == "" {
		return
	}
	got, ok := mgr.Resolve(sess.ClaudeSessionID)
	assert.True(t, ok, "INV-1: a non-empty ClaudeSessionID must resolve via byClaude")
	assert.Equal(t, sess.ID, got, "INV-1: byClaude[sess.ClaudeSessionID] must equal sess.ID")
}

// TestApply_INV1_BindingMapConsistencyAcrossStatesAndInputClasses covers D14: after any
// Apply, byClaude[sess.ClaudeSessionID] == sess.ID whenever ClaudeSessionID != "" —
// asserted from every displayed state plus the alive=false (ended, kept-for-resume) row,
// crossed against every REQ-9/REQ-10 input class: an enveloped event naming the same
// bound id, one naming a different id (rebind), one on a never-bound session (bind), and
// a raw event (never binds).
func TestApply_INV1_BindingMapConsistencyAcrossStatesAndInputClasses(t *testing.T) {
	type sourceRow struct {
		name  string
		state State
		alive bool
	}
	rows := []sourceRow{
		{"started", StateStarted, true},
		{"planning", StatePlanning, true},
		{"working", StateWorking, true},
		{"needs_input", StateNeedsInput, true},
		{"failed", StateFailed, true},
		{"idle", StateIdle, true},
		{"ended_kept_for_resume", StateIdle, false},
	}

	for _, row := range rows {
		t.Run(row.name+"/enveloped_same_id", func(t *testing.T) {
			st := openTestStore(t)
			mgr := newTestManager(t, st, nil, nil)
			sess := createLaunchedSession(t, mgr, st, t.TempDir())
			advanceToState(t, mgr, sess.ID, "claude-old", row.state, true)
			if !row.alive {
				_, err := mgr.markEnded(context.Background(), sess.ID)
				require.NoError(t, err)
			}

			promptID := "test-p2"
			final, err := mgr.Apply(context.Background(), sess.ID, "claude-old", &promptID, claudecode.StateInput{Kind: claudecode.KindTurnActivity}, true)
			require.NoError(t, err)

			assertBindingConsistent(t, mgr, final)
			assert.Equal(t, "claude-old", final.ClaudeSessionID, "a same-id enveloped event must not rebind")
		})

		t.Run(row.name+"/enveloped_different_id", func(t *testing.T) {
			st := openTestStore(t)
			mgr := newTestManager(t, st, nil, nil)
			sess := createLaunchedSession(t, mgr, st, t.TempDir())
			advanceToState(t, mgr, sess.ID, "claude-old", row.state, true)
			if !row.alive {
				_, err := mgr.markEnded(context.Background(), sess.ID)
				require.NoError(t, err)
			}

			promptID := "test-p2"
			final, err := mgr.Apply(context.Background(), sess.ID, "claude-new", &promptID, claudecode.StateInput{Kind: claudecode.KindTurnActivity}, true)
			require.NoError(t, err)

			assertBindingConsistent(t, mgr, final)
			assert.Equal(t, "claude-new", final.ClaudeSessionID, "REQ-9: an enveloped event naming a different claude id must rebind")
		})

		t.Run(row.name+"/enveloped_never_bound", func(t *testing.T) {
			st := openTestStore(t)
			mgr := newTestManager(t, st, nil, nil)
			sess := createLaunchedSession(t, mgr, st, t.TempDir())
			if row.state != StateStarted {
				advanceToState(t, mgr, sess.ID, "irrelevant", row.state, false) // raw: never binds
			}
			if !row.alive {
				_, err := mgr.markEnded(context.Background(), sess.ID)
				require.NoError(t, err)
			}
			before, ok := mgr.Get(sess.ID)
			require.True(t, ok)
			require.Empty(t, before.ClaudeSessionID, "sanity: the session must still be unbound before the tested event")

			promptID := "test-p2"
			final, err := mgr.Apply(context.Background(), sess.ID, "claude-fresh", &promptID, claudecode.StateInput{Kind: claudecode.KindTurnActivity}, true)
			require.NoError(t, err)

			assertBindingConsistent(t, mgr, final)
			assert.Equal(t, "claude-fresh", final.ClaudeSessionID, "REQ-9: a never-bound session must bind on its first enveloped event")
		})

		t.Run(row.name+"/raw_event", func(t *testing.T) {
			st := openTestStore(t)
			mgr := newTestManager(t, st, nil, nil)
			sess := createLaunchedSession(t, mgr, st, t.TempDir())
			advanceToState(t, mgr, sess.ID, "claude-old", row.state, true)
			if !row.alive {
				_, err := mgr.markEnded(context.Background(), sess.ID)
				require.NoError(t, err)
			}
			before, ok := mgr.Get(sess.ID)
			require.True(t, ok)

			promptID := "test-p2"
			final, err := mgr.Apply(context.Background(), sess.ID, "claude-raw-imposter", &promptID, claudecode.StateInput{Kind: claudecode.KindTurnActivity}, false)
			require.NoError(t, err)

			assertBindingConsistent(t, mgr, final)
			assert.Equal(t, before.ClaudeSessionID, final.ClaudeSessionID, "REQ-10: a raw event must never bind or rebind, regardless of the id it names")
		})
	}
}

// TestApply_NeverBoundSessionBindsWithNoTransitionThenAppliesItsOwnEvent covers REQ-9's
// precise "no transition" clause: the binding step itself must cause no state change —
// only the triggering event's own row does. Proven with PreCompact (Kind that has no
// transition of its own), so any state movement observed would have to have come from
// the binding step, not the event.
func TestApply_NeverBoundSessionBindsWithNoTransitionThenAppliesItsOwnEvent(t *testing.T) {
	st := openTestStore(t)
	mgr := newTestManager(t, st, nil, nil)
	sess := createLaunchedSession(t, mgr, st, t.TempDir())
	require.Equal(t, StateStarted, sess.State)
	require.Empty(t, sess.ClaudeSessionID)

	final, err := mgr.Apply(context.Background(), sess.ID, "claude-1", nil, claudecode.StateInput{Kind: claudecode.KindCompaction}, true)
	require.NoError(t, err)

	assert.Equal(t, "claude-1", final.ClaudeSessionID, "REQ-9: binds on the first enveloped event")
	assert.Equal(t, StateStarted, final.State, "REQ-9: binding itself causes no transition")
	assert.Equal(t, 1, final.Compactions, "PreCompact's own (no-transition) row is what actually applied")
}

// TestApply_EnvelopedSameBoundIDNeverRebindsEvenForClearDeathHint covers Edge Case 6:
// SessionEnd(reason:"clear") for the *currently bound* id arriving enveloped is not a
// death hint and must not rebind — the id matches, so the same-id branch (no-op) applies.
func TestApply_EnvelopedSameBoundIDNeverRebindsEvenForClearDeathHint(t *testing.T) {
	st := openTestStore(t)
	mgr := newTestManager(t, st, nil, nil)
	sess := createLaunchedSession(t, mgr, st, t.TempDir())
	_, err := mgr.Apply(context.Background(), sess.ID, "claude-1", nil, claudecode.StateInput{Kind: claudecode.KindBind}, true)
	require.NoError(t, err)

	final, err := mgr.Apply(context.Background(), sess.ID, "claude-1", nil, claudecode.StateInput{Kind: claudecode.KindClearDeathHint}, true)
	require.NoError(t, err)

	assert.True(t, final.Alive, "Edge Case 6: SessionEnd(reason:clear) for the currently-bound id is not a death hint and must not rebind")
	assert.Equal(t, "claude-1", final.ClaudeSessionID)
	assert.Equal(t, StateStarted, final.State, "no rebind means no reset-to-started either")
}

// TestApply_INV2_RebindResetsContextAndCompactionsBeforeItsOwnRowApplies covers D15:
// an enveloped different-id event resets context to nil and compactions to 0 *before*
// its own row applies, from every displayed source state, for both a UserPromptSubmit-
// like trigger (ends working) and a Stop trigger (ends idle).
func TestApply_INV2_RebindResetsContextAndCompactionsBeforeItsOwnRowApplies(t *testing.T) {
	states := []State{StateStarted, StatePlanning, StateWorking, StateNeedsInput, StateFailed, StateIdle}
	triggers := []struct {
		name      string
		input     claudecode.StateInput
		wantState State
	}{
		// PermissionMode is a sticky latch applyBind never resets (it's a CLI launch
		// setting, not conversation state) — the trigger sets it explicitly to "default"
		// so the expected end state is deterministic regardless of what the source-state
		// setup above latched (e.g. the "planning" row latches "plan").
		{"UserPromptSubmit-like turn activity", claudecode.StateInput{Kind: claudecode.KindTurnActivity, PermissionMode: strPtr("default")}, StateWorking},
		{"Stop", claudecode.StateInput{Kind: claudecode.KindTurnClosed}, StateIdle},
	}
	for _, state := range states {
		for _, trig := range triggers {
			t.Run(string(state)+"/"+trig.name, func(t *testing.T) {
				st := openTestStore(t)
				mgr := newTestManager(t, st, nil, nil)
				sess := createLaunchedSession(t, mgr, st, t.TempDir())
				advanceToState(t, mgr, sess.ID, "claude-old", state, true)
				// Give the rebind something to lose: a compaction and a context gauge.
				_, err := mgr.Apply(context.Background(), sess.ID, "claude-old", nil, claudecode.StateInput{Kind: claudecode.KindCompaction}, true)
				require.NoError(t, err)
				_, err = mgr.ApplyStatus(context.Background(), sess.ID, claudecode.StatusUpdate{
					Context: &claudecode.StatusContext{UsedPct: 84, TotalInputTokens: 168000, WindowSize: 200000},
				})
				require.NoError(t, err)
				before, ok := mgr.Get(sess.ID)
				require.True(t, ok)
				require.Equal(t, 1, before.Compactions, "sanity: compactions must be nonzero before the rebind")
				require.NotNil(t, before.Context, "sanity: context must be populated before the rebind")

				promptID := "test-p2"
				final, err := mgr.Apply(context.Background(), sess.ID, "claude-new", &promptID, trig.input, true)
				require.NoError(t, err)

				assert.Equal(t, 0, final.Compactions, "INV-2: a rebind must reset compactions before its own row applies")
				assert.Nil(t, final.Context, "INV-2: a rebind must reset the context gauge before its own row applies")
				assert.Equal(t, trig.wantState, final.State)
				assert.Equal(t, "claude-new", final.ClaudeSessionID)
			})
		}
	}
}

// TestApply_MonotonicRebindGuard_ReorderedStragglerNeverRebindsBackwards is the
// permanent regression test for review.md cycle 1 Critical 1 / Edge Case 6a, decided as
// Option B in decisions/monotonic-rebind/decision.md and landed in
// kb:anchor/ingest.envelope: an enveloped event naming a claude id this session has already left
// (byClaude[id] already points at this session, but it is not the current
// ClaudeSessionID) is a reordered straggler, not a forward rebind. It must be routed
// and applied, but must never move the binding backwards, reset the context gauge, or
// zero the compaction counter. This is INV-2's mirror case: INV-2 (above) proves a
// genuine forward rebind resets those fields before its own row; this proves a
// backward-looking straggler must not.
//
// Sequence (the reviewer's exact repro): bind claude-old -> one PreCompact on
// claude-old (gives a rebind something to lose) -> SessionStart(clear) to claude-new
// -> claude-new goes working and compacts once more (sanity checkpoint) -> a reordered
// enveloped event naming claude-old arrives last, after the new conversation is
// already live.
func TestApply_MonotonicRebindGuard_ReorderedStragglerNeverRebindsBackwards(t *testing.T) {
	// setUpLiveNewConversation drives the common prefix every subtest shares, up to and
	// including the sanity checkpoint, and returns the manager/store/recorder/session
	// for the subtest's own reordered-straggler step. The store and recorder are handed
	// back (rather than built fresh per subtest) so each subtest can assert, after its
	// own straggler Apply call, that it persisted and broadcast exactly once (D18's
	// guarantee, extended to this path per review.md cycle 1 Minor 2) with the
	// straggler's own content already in the row — not merely inferred from the
	// broadcast count alone.
	setUpLiveNewConversation := func(t *testing.T) (*Manager, *store.Store, *upsertsRecorder, *Session) {
		t.Helper()
		ctx := context.Background()
		st := openTestStore(t)
		rec := &upsertsRecorder{}
		mgr := newTestManager(t, st, nil, rec.record)
		sess := createLaunchedSession(t, mgr, st, t.TempDir())

		_, err := mgr.Apply(ctx, sess.ID, "claude-old", nil, claudecode.StateInput{Kind: claudecode.KindBind}, true)
		require.NoError(t, err)
		_, err = mgr.Apply(ctx, sess.ID, "claude-old", nil, claudecode.StateInput{Kind: claudecode.KindCompaction}, true)
		require.NoError(t, err)

		_, err = mgr.Apply(ctx, sess.ID, "claude-new", nil, claudecode.StateInput{Kind: claudecode.KindClearRebind}, true)
		require.NoError(t, err)

		mode := "default"
		_, err = mgr.Apply(ctx, sess.ID, "claude-new", nil, claudecode.StateInput{Kind: claudecode.KindTurnActivity, PermissionMode: &mode}, true)
		require.NoError(t, err)
		_, err = mgr.ApplyStatus(ctx, sess.ID, claudecode.StatusUpdate{
			Context: &claudecode.StatusContext{UsedPct: 12, TotalInputTokens: 24000, WindowSize: 200000},
		})
		require.NoError(t, err)
		final, err := mgr.Apply(ctx, sess.ID, "claude-new", nil, claudecode.StateInput{Kind: claudecode.KindCompaction}, true)
		require.NoError(t, err)

		require.Equal(t, StateWorking, final.State, "sanity: the new conversation is live before the straggler arrives")
		require.Equal(t, 1, final.Compactions, "sanity: the new conversation has compacted once before the straggler arrives")
		require.NotNil(t, final.Context, "sanity: the context gauge is populated before the straggler arrives")
		require.Equal(t, "claude-new", final.ClaudeSessionID)

		return mgr, st, rec, sess
	}

	t.Run("reordered SessionEnd(reason=clear) death hint for the old id", func(t *testing.T) {
		mgr, st, rec, sess := setUpLiveNewConversation(t)
		before, ok := mgr.Get(sess.ID)
		require.True(t, ok)
		broadcastsBefore := len(rec.all())

		final, err := mgr.Apply(context.Background(), sess.ID, "claude-old", nil, claudecode.StateInput{Kind: claudecode.KindClearDeathHint}, true)
		require.NoError(t, err)

		assert.Equal(t, "claude-new", final.ClaudeSessionID, "the reordered straggler for a left-behind id must not rebind backwards")
		assert.Equal(t, StateWorking, final.State, "no rebind means no reset-to-started")
		assert.Equal(t, 1, final.Compactions, "no rebind means the compaction counter is not zeroed")
		require.NotNil(t, final.Context)
		assert.Equal(t, before.Context.UsedPct, final.Context.UsedPct, "no rebind means the context gauge is not reset")
		assert.True(t, final.Alive, "SessionEnd(reason:clear) is not a death hint")
		assertBindingConsistent(t, mgr, final)

		got, ok := mgr.Resolve("claude-old")
		require.True(t, ok, "byClaude keeps the old id mapped to this session — that memory is what the guard relies on")
		assert.Equal(t, sess.ID, got)

		assert.Len(t, rec.all(), broadcastsBefore+1, "D18: the straggler path must also broadcast exactly once")
		persisted, err := st.GetSession(context.Background(), sess.ID)
		require.NoError(t, err)
		assert.Equal(t, "working", persisted.State, "the persisted row must already reflect the non-rebind (state untouched)")
		assert.Equal(t, 1, persisted.Compactions, "the persisted row must carry the un-zeroed compaction count")
		require.NotNil(t, persisted.ClaudeSessionID)
		assert.Equal(t, "claude-new", *persisted.ClaudeSessionID, "the persisted row must not have rebound backwards")
	})

	t.Run("reordered non-death-hint PostToolUse straggler for the old id applies its own row without rebinding", func(t *testing.T) {
		mgr, st, rec, sess := setUpLiveNewConversation(t)
		before, ok := mgr.Get(sess.ID)
		require.True(t, ok)
		require.Equal(t, PermissionMode("default"), before.PermissionMode, "sanity: latched to \"default\" by the setup's own turn activity")
		broadcastsBefore := len(rec.all())

		mode := "acceptEdits"
		final, err := mgr.Apply(context.Background(), sess.ID, "claude-old", nil, claudecode.StateInput{Kind: claudecode.KindTurnActivity, PermissionMode: &mode}, true)
		require.NoError(t, err)

		// The straggler's own row still applies (REQ-9: "route and apply the event") —
		// proven by the permission-mode latch actually moving, which a plain no-op
		// could not produce.
		assert.Equal(t, PermissionMode("acceptEdits"), final.PermissionMode, "the straggler's own row must still apply")

		// But it must not rebind: binding, context and compactions are untouched.
		assert.Equal(t, "claude-new", final.ClaudeSessionID, "the reordered straggler for a left-behind id must not rebind backwards")
		assert.Equal(t, StateWorking, final.State)
		assert.Equal(t, 1, final.Compactions, "no rebind means the compaction counter is not zeroed")
		require.NotNil(t, final.Context)
		assert.Equal(t, before.Context.UsedPct, final.Context.UsedPct, "no rebind means the context gauge is not reset")
		assertBindingConsistent(t, mgr, final)

		assert.Len(t, rec.all(), broadcastsBefore+1, "D18: the straggler path must also broadcast exactly once")
		persisted, err := st.GetSession(context.Background(), sess.ID)
		require.NoError(t, err)
		assert.Equal(t, "acceptEdits", persisted.PermissionMode, "the persisted row must already carry the straggler's own applied effect")
		assert.Equal(t, 1, persisted.Compactions, "the persisted row must carry the un-zeroed compaction count")
		require.NotNil(t, persisted.ClaudeSessionID)
		assert.Equal(t, "claude-new", *persisted.ClaudeSessionID, "the persisted row must not have rebound backwards")
	})
}

// TestApply_INV3_RawEventNeverBindsFromAnyState covers D16's first half: a raw event
// with an unknown session_id changes no session's ClaudeSessionID and creates no
// byClaude entry, from every displayed source state.
func TestApply_INV3_RawEventNeverBindsFromAnyState(t *testing.T) {
	states := []State{StateStarted, StatePlanning, StateWorking, StateNeedsInput, StateFailed, StateIdle}
	for _, state := range states {
		t.Run(string(state), func(t *testing.T) {
			st := openTestStore(t)
			mgr := newTestManager(t, st, nil, nil)
			sess := createLaunchedSession(t, mgr, st, t.TempDir())
			if state != StateStarted {
				advanceToState(t, mgr, sess.ID, "irrelevant", state, false)
			}
			before, ok := mgr.Get(sess.ID)
			require.True(t, ok)
			require.Empty(t, before.ClaudeSessionID, "sanity: never bound")

			promptID := "test-p2"
			final, err := mgr.Apply(context.Background(), sess.ID, "claude-unknown", &promptID, claudecode.StateInput{Kind: claudecode.KindTurnActivity}, false)
			require.NoError(t, err)

			assert.Empty(t, final.ClaudeSessionID, "INV-3: a raw event with an unknown session_id must never bind")
			_, ok = mgr.Resolve("claude-unknown")
			assert.False(t, ok, "INV-3: a raw event must never create a byClaude entry")
		})
	}
}

// TestApplyStatus_INV4_NeverTouchesBindingOrStateFromAnyState covers D16's other half:
// a status post never binds, rebinds, or changes any state-machine-owned field, from
// every displayed source state (m3-gauges INV-1's cross-state twin).
func TestApplyStatus_INV4_NeverTouchesBindingOrStateFromAnyState(t *testing.T) {
	states := []State{StateStarted, StatePlanning, StateWorking, StateNeedsInput, StateFailed, StateIdle}
	for _, state := range states {
		t.Run(string(state), func(t *testing.T) {
			st := openTestStore(t)
			mgr := newTestManager(t, st, nil, nil)
			sess := createLaunchedSession(t, mgr, st, t.TempDir())
			advanceToState(t, mgr, sess.ID, "claude-old", state, true)
			before, ok := mgr.Get(sess.ID)
			require.True(t, ok)

			title := "status-only change"
			final, err := mgr.ApplyStatus(context.Background(), sess.ID, claudecode.StatusUpdate{Title: &title})
			require.NoError(t, err)

			assert.Equal(t, before.ClaudeSessionID, final.ClaudeSessionID, "INV-4: a status post must never bind or rebind")
			assert.Equal(t, before.State, final.State, "INV-4: a status post must never change state")
			assert.Equal(t, before.Attention, final.Attention)
			assert.Equal(t, before.Failure, final.Failure)
			got, ok := mgr.Resolve("claude-old")
			require.True(t, ok)
			assert.Equal(t, sess.ID, got, "INV-4: byClaude must be untouched by a status post")
		})
	}
}

// TestApply_INV7_RebindOnOneSessionLeavesABystanderUntouched covers D17: two live
// sessions sharing a manager/directory — a rebind on one must never touch the other's
// ClaudeSessionID or byClaude entry (the m2-terminal multi-instance lesson: a
// destructive/identity-changing path must be proven safe with a bystander present, not
// just alone).
func TestApply_INV7_RebindOnOneSessionLeavesABystanderUntouched(t *testing.T) {
	st := openTestStore(t)
	mgr := newTestManager(t, st, nil, nil)
	dir := t.TempDir()
	target := createLaunchedSession(t, mgr, st, dir)
	bystander := createLaunchedSession(t, mgr, st, dir)

	_, err := mgr.Apply(context.Background(), target.ID, "claude-target-old", nil, claudecode.StateInput{Kind: claudecode.KindBind}, true)
	require.NoError(t, err)
	_, err = mgr.Apply(context.Background(), bystander.ID, "claude-bystander", nil, claudecode.StateInput{Kind: claudecode.KindBind}, true)
	require.NoError(t, err)

	promptID := "p1"
	final, err := mgr.Apply(context.Background(), target.ID, "claude-target-new", &promptID, claudecode.StateInput{Kind: claudecode.KindTurnActivity}, true)
	require.NoError(t, err)
	assert.Equal(t, "claude-target-new", final.ClaudeSessionID)

	bystanderAfter, ok := mgr.Get(bystander.ID)
	require.True(t, ok)
	assert.Equal(t, "claude-bystander", bystanderAfter.ClaudeSessionID, "INV-7: a rebind on one session must never touch a bystander's binding")
	got, ok := mgr.Resolve("claude-bystander")
	require.True(t, ok)
	assert.Equal(t, bystander.ID, got)
}

// TestApply_RebindThenApplyPersistsAndBroadcastsExactlyOnce covers D18: even though the
// rebind-then-apply path (REQ-9) performs two logical mutations (the /clear-style reset,
// then the triggering event's own transition), Manager.Apply must coalesce them into a
// single persist and a single broadcast — never two separate sessionUpsert messages for
// one ingest POST. The store side is verified by content (the persisted row already
// carries both the reset and the transition, which a correct single UpdateSession call
// must produce) since internal/session.Manager takes a concrete *store.Store rather than
// an interface, leaving no seam to install a call-counting fake without touching
// production code.
func TestApply_RebindThenApplyPersistsAndBroadcastsExactlyOnce(t *testing.T) {
	st := openTestStore(t)
	rec := &upsertsRecorder{}
	mgr := newTestManager(t, st, nil, rec.record)
	dir := t.TempDir()
	sess := createLaunchedSession(t, mgr, st, dir)
	_, err := mgr.Apply(context.Background(), sess.ID, "claude-old", nil, claudecode.StateInput{Kind: claudecode.KindBind}, true)
	require.NoError(t, err)
	before := len(rec.all())

	promptID := "p1"
	_, err = mgr.Apply(context.Background(), sess.ID, "claude-new", &promptID, claudecode.StateInput{Kind: claudecode.KindTurnActivity}, true)
	require.NoError(t, err)

	assert.Len(t, rec.all(), before+1, "D18: the rebind-then-apply path must broadcast exactly once, not once per logical mutation")

	persisted, err := st.GetSession(context.Background(), sess.ID)
	require.NoError(t, err)
	assert.Equal(t, "working", persisted.State, "the persisted row must already carry the post-rebind transition")
	require.NotNil(t, persisted.ClaudeSessionID)
	assert.Equal(t, "claude-new", *persisted.ClaudeSessionID)
}

// --- plan order-sidebar: CreateSession's RailPos assignment ---

// TestCreateSession_FirstSessionRailPosIsZeroAndUnpinned covers REQ-1/D5's base case:
// with no existing sessions, the first one gets railPos 0 and pinned:false.
func TestCreateSession_FirstSessionRailPosIsZeroAndUnpinned(t *testing.T) {
	st := openTestStore(t)
	mgr := newTestManager(t, st, nil, nil)
	dir := t.TempDir()
	params := createParams(dir)
	params.RepoID = seedRepo(t, st, dir)

	sess, err := mgr.CreateSession(context.Background(), params)
	require.NoError(t, err)

	assert.Equal(t, int64(0), sess.RailPos)
	assert.False(t, sess.Pinned)
}

// TestCreateSession_RailPosIsMaxOfExistingPlusOne covers REQ-1/D5: each new session's
// railPos is strictly greater than every existing session's — "opened order = bottom of
// the unpinned block" — computed from the manager's in-memory registry, not a
// pinned-aware MAX (a later session must still sort after an earlier pinned one on
// creation, since REQ-1 only promises "greater than every existing session's railPos",
// not "greater than every unpinned one's").
func TestCreateSession_RailPosIsMaxOfExistingPlusOne(t *testing.T) {
	st := openTestStore(t)
	mgr := newTestManager(t, st, nil, nil)
	dir := t.TempDir()
	params := createParams(dir)
	params.RepoID = seedRepo(t, st, dir)

	first, err := mgr.CreateSession(context.Background(), params)
	require.NoError(t, err)
	second, err := mgr.CreateSession(context.Background(), params)
	require.NoError(t, err)
	third, err := mgr.CreateSession(context.Background(), params)
	require.NoError(t, err)

	assert.Equal(t, int64(0), first.RailPos)
	assert.Equal(t, int64(1), second.RailPos)
	assert.Equal(t, int64(2), third.RailPos)
	assert.False(t, first.Pinned)
	assert.False(t, second.Pinned)
	assert.False(t, third.Pinned)
}

// TestCreateSession_RailPosAccountsForAPinnedExistingSession covers REQ-1's own wording
// precisely from a non-trivial starting state (m1-sessions lesson: don't only test the
// all-unpinned case) — a pinned existing session (with a high railPos, since pinning
// renumbers the whole rail) must still be beaten by the new session's railPos.
func TestCreateSession_RailPosAccountsForAPinnedExistingSession(t *testing.T) {
	st := openTestStore(t)
	mgr := newTestManager(t, st, nil, nil)
	dir := t.TempDir()
	params := createParams(dir)
	params.RepoID = seedRepo(t, st, dir)

	first, err := mgr.CreateSession(context.Background(), params)
	require.NoError(t, err)
	second, err := mgr.CreateSession(context.Background(), params)
	require.NoError(t, err)
	require.NoError(t, mgr.SetPinned(context.Background(), first.ID, true))

	third, err := mgr.CreateSession(context.Background(), params)
	require.NoError(t, err)

	assert.Greater(t, third.RailPos, second.RailPos)
	after, ok := mgr.Get(first.ID)
	require.True(t, ok)
	assert.Greater(t, third.RailPos, after.RailPos, "the new session's railPos must exceed even the pinned bystander's")
}

// --- plan order-sidebar: SetPinned ---

// TestSetPinned_PinPersistsAndBroadcastsOnlyChangedSessions covers D6/D15: pinning the
// second-of-two unpinned sessions changes *both* of them — b becomes pinned at railPos
// 0, and a (previously railPos 0) is pushed to railPos 1 to keep INV-1, since the
// unpinned block can no longer start at 0 once a pinned block exists ahead of it. Both
// are real changes the invariant requires, so both (and only both) are broadcast —
// there is no third bystander here to prove the "nothing else" half; that is covered by
// TestSetOrder_AppliesAndBroadcastsOnlyChangedSessions's unlisted-bystander case instead.
func TestSetPinned_PinPersistsAndBroadcastsOnlyChangedSessions(t *testing.T) {
	st := openTestStore(t)
	rec := &upsertsRecorder{}
	mgr := newTestManager(t, st, nil, rec.record)
	dir := t.TempDir()
	a := createLaunchedSession(t, mgr, st, dir)
	b := createLaunchedSession(t, mgr, st, dir)
	before := len(rec.all())

	require.NoError(t, mgr.SetPinned(context.Background(), b.ID, true))

	seen := rec.all()
	require.Len(t, seen, before+2, "D6: pinning b also shifts a's railPos, since the unpinned block can no longer start at 0")
	byID := map[int64]*Session{}
	for _, s := range seen[before:] {
		byID[s.ID] = s
	}
	require.Contains(t, byID, b.ID)
	require.Contains(t, byID, a.ID)
	assert.True(t, byID[b.ID].Pinned)
	assert.Equal(t, int64(0), byID[b.ID].RailPos, "D6: pinning into an empty pinned block lands at railPos 0")
	assert.False(t, byID[a.ID].Pinned)
	assert.Equal(t, int64(1), byID[a.ID].RailPos, "a is pushed down one slot only because the invariant requires it")

	persisted, err := st.GetSession(context.Background(), b.ID)
	require.NoError(t, err)
	assert.True(t, persisted.Pinned)
	assert.Equal(t, int64(0), persisted.RailPos)

	aPersisted, err := st.GetSession(context.Background(), a.ID)
	require.NoError(t, err)
	assert.False(t, aPersisted.Pinned)
	assert.Equal(t, int64(1), aPersisted.RailPos, "D6: the untouched bystander moves down one slot only because the invariant requires it, but is still persisted with its new position")
}

// TestSetPinned_UnpinPersistsAndBroadcasts covers D7's happy path at the Manager level.
func TestSetPinned_UnpinPersistsAndBroadcasts(t *testing.T) {
	st := openTestStore(t)
	rec := &upsertsRecorder{}
	mgr := newTestManager(t, st, nil, rec.record)
	dir := t.TempDir()
	a := createLaunchedSession(t, mgr, st, dir)
	require.NoError(t, mgr.SetPinned(context.Background(), a.ID, true))
	before := len(rec.all())

	require.NoError(t, mgr.SetPinned(context.Background(), a.ID, false))

	seen := rec.all()
	require.Len(t, seen, before+1)
	assert.False(t, seen[len(seen)-1].Pinned)

	persisted, err := st.GetSession(context.Background(), a.ID)
	require.NoError(t, err)
	assert.False(t, persisted.Pinned)
}

// TestSetPinned_NoOpDoesNotPersistOrBroadcast covers D8 at the Manager level: pinning a
// session already in the requested state issues no store write and no broadcast at all.
func TestSetPinned_NoOpDoesNotPersistOrBroadcast(t *testing.T) {
	st := openTestStore(t)
	rec := &upsertsRecorder{}
	mgr := newTestManager(t, st, nil, rec.record)
	dir := t.TempDir()
	a := createLaunchedSession(t, mgr, st, dir)
	before := len(rec.all())
	beforeRow, err := st.GetSession(context.Background(), a.ID)
	require.NoError(t, err)

	require.NoError(t, mgr.SetPinned(context.Background(), a.ID, false)) // already false

	assert.Len(t, rec.all(), before, "D8: a pin call matching the current flag must not broadcast")
	afterRow, err := st.GetSession(context.Background(), a.ID)
	require.NoError(t, err)
	assert.Equal(t, beforeRow, afterRow, "D8: a pin call matching the current flag must not persist a write")
}

// TestSetPinned_NoOpWithABystanderGapFromAnEarlierRemoveStillBroadcastsNothing extends
// D8 to a dirty rail (m2-terminal lesson: a destructive path — Remove — leaves a shared
// substrate, here the rail's railPos sequence, in a state every other test's tidy setup
// never reaches). Three sessions are created (railPos 0,1,2); the middle one is removed,
// leaving a REQ-14-sanctioned gap between the two survivors. A pin call whose flag
// already matches the current state on one of the survivors must still broadcast and
// persist nothing — including for the *other*, untouched survivor.
func TestSetPinned_NoOpWithABystanderGapFromAnEarlierRemoveStillBroadcastsNothing(t *testing.T) {
	st := openTestStore(t)
	rec := &upsertsRecorder{}
	mgr := newTestManager(t, st, nil, rec.record)
	dir := t.TempDir()
	a := createLaunchedSession(t, mgr, st, dir)
	middle := createLaunchedSession(t, mgr, st, dir)
	c := createLaunchedSession(t, mgr, st, dir)
	require.NoError(t, mgr.Remove(context.Background(), middle.ID)) // leaves a gap: a=0, c=2

	before := len(rec.all())
	aBefore, err := st.GetSession(context.Background(), a.ID)
	require.NoError(t, err)
	cBefore, err := st.GetSession(context.Background(), c.ID)
	require.NoError(t, err)

	require.NoError(t, mgr.SetPinned(context.Background(), a.ID, false)) // a is already unpinned: a literal no-op

	assert.Len(t, rec.all(), before, "D8: a pin call matching the current flag must not broadcast, even with a bystander railPos gap from an earlier Remove")
	aAfter, err := st.GetSession(context.Background(), a.ID)
	require.NoError(t, err)
	cAfter, err := st.GetSession(context.Background(), c.ID)
	require.NoError(t, err)
	assert.Equal(t, aBefore, aAfter)
	assert.Equal(t, cBefore, cAfter, "the untouched bystander's gap-closing renumbering must not be persisted by an otherwise no-op pin call")
}

// TestSetPinned_PinNoOpWithABystanderGapFromAnEarlierRemoveStillBroadcastsNothing
// mirrors the test above from the other flag direction: the fix's short-circuit
// (applyPin's `current.Pinned == pinned`) is symmetric in the flag, so this asserts the
// already-pinned/pin-again no-op is equally silent when a bystander's railPos has a
// pre-existing gap — not just the already-unpinned/unpin-again direction above.
func TestSetPinned_PinNoOpWithABystanderGapFromAnEarlierRemoveStillBroadcastsNothing(t *testing.T) {
	st := openTestStore(t)
	rec := &upsertsRecorder{}
	mgr := newTestManager(t, st, nil, rec.record)
	dir := t.TempDir()
	a := createLaunchedSession(t, mgr, st, dir)
	middle := createLaunchedSession(t, mgr, st, dir)
	c := createLaunchedSession(t, mgr, st, dir)
	require.NoError(t, mgr.SetPinned(context.Background(), a.ID, true))
	require.NoError(t, mgr.SetPinned(context.Background(), c.ID, true))
	require.NoError(t, mgr.Remove(context.Background(), middle.ID)) // leaves a gap in the pinned block: a=0, c=2

	before := len(rec.all())
	aBefore, err := st.GetSession(context.Background(), a.ID)
	require.NoError(t, err)
	cBefore, err := st.GetSession(context.Background(), c.ID)
	require.NoError(t, err)

	require.NoError(t, mgr.SetPinned(context.Background(), a.ID, true)) // a is already pinned: a literal no-op

	assert.Len(t, rec.all(), before, "D8: a pin call matching the current flag must not broadcast, even with a bystander railPos gap in the pinned block from an earlier Remove")
	aAfter, err := st.GetSession(context.Background(), a.ID)
	require.NoError(t, err)
	cAfter, err := st.GetSession(context.Background(), c.ID)
	require.NoError(t, err)
	assert.Equal(t, aBefore, aAfter)
	assert.Equal(t, cBefore, cAfter, "the untouched bystander's gap-closing renumbering must not be persisted by an otherwise no-op pin call")
}

func TestSetPinned_UnknownSessionReturnsErrUnknownSession(t *testing.T) {
	st := openTestStore(t)
	mgr := newTestManager(t, st, nil, nil)

	err := mgr.SetPinned(context.Background(), 999, true)

	assert.ErrorIs(t, err, ErrUnknownSession)
}

// --- plan order-sidebar: SetOrder ---

// TestSetOrder_AppliesAndBroadcastsOnlyChangedSessions covers D9/D15 at the Manager
// level: the listed ids/pinnedCount are applied, persisted, and broadcast — a session
// whose position/flag didn't change is not among the broadcasts.
func TestSetOrder_AppliesAndBroadcastsOnlyChangedSessions(t *testing.T) {
	st := openTestStore(t)
	rec := &upsertsRecorder{}
	mgr := newTestManager(t, st, nil, rec.record)
	dir := t.TempDir()
	a := createLaunchedSession(t, mgr, st, dir)
	b := createLaunchedSession(t, mgr, st, dir)
	c := createLaunchedSession(t, mgr, st, dir)
	before := len(rec.all())

	// Swap a and b; leave c unlisted (it stays last, its railPos unaffected).
	require.NoError(t, mgr.SetOrder(context.Background(), []int64{b.ID, a.ID}, 0))

	seen := rec.all()
	changedIDs := map[int64]bool{}
	for _, s := range seen[before:] {
		changedIDs[s.ID] = true
	}
	assert.True(t, changedIDs[a.ID])
	assert.True(t, changedIDs[b.ID])
	assert.False(t, changedIDs[c.ID], "an unlisted, unmoved bystander must not be broadcast")

	bRow, err := st.GetSession(context.Background(), b.ID)
	require.NoError(t, err)
	aRow, err := st.GetSession(context.Background(), a.ID)
	require.NoError(t, err)
	assert.Less(t, bRow.RailPos, aRow.RailPos)
}

// TestSetOrder_InvalidRequestReturnsErrInvalidOrderAndChangesNothing covers D10/D11 at
// the Manager level: a 400-shaped request leaves the store and every broadcast list
// untouched.
func TestSetOrder_InvalidRequestReturnsErrInvalidOrderAndChangesNothing(t *testing.T) {
	st := openTestStore(t)
	rec := &upsertsRecorder{}
	mgr := newTestManager(t, st, nil, rec.record)
	dir := t.TempDir()
	a := createLaunchedSession(t, mgr, st, dir)
	before := len(rec.all())
	beforeRow, err := st.GetSession(context.Background(), a.ID)
	require.NoError(t, err)

	err = mgr.SetOrder(context.Background(), []int64{a.ID, 999999}, 0) // unknown id

	require.ErrorIs(t, err, ErrInvalidOrder)
	assert.Len(t, rec.all(), before)
	afterRow, err := st.GetSession(context.Background(), a.ID)
	require.NoError(t, err)
	assert.Equal(t, beforeRow, afterRow)
}

// --- plan order-sidebar: Remove and the state machine leave pinned/railPos alone ---

// TestRemove_LeavesBystandersPinnedAndRailPosUnchanged covers D18 with the multi-session
// coexistence coverage the m2-terminal lesson calls for on a destructive path sharing a
// substrate (here: the rail's railPos sequence spans every session, not just the removed
// one) — removing one session must leave every other session's pinned/railPos exactly as
// they were, gaps and all (REQ-14).
func TestRemove_LeavesBystandersPinnedAndRailPosUnchanged(t *testing.T) {
	st := openTestStore(t)
	mgr := newTestManager(t, st, nil, nil)
	dir := t.TempDir()
	a := createLaunchedSession(t, mgr, st, dir)
	b := createLaunchedSession(t, mgr, st, dir)
	c := createLaunchedSession(t, mgr, st, dir)
	require.NoError(t, mgr.SetPinned(context.Background(), a.ID, true))

	aBefore, err := st.GetSession(context.Background(), a.ID)
	require.NoError(t, err)
	cBefore, err := st.GetSession(context.Background(), c.ID)
	require.NoError(t, err)

	require.NoError(t, mgr.Remove(context.Background(), b.ID))

	aAfter, err := st.GetSession(context.Background(), a.ID)
	require.NoError(t, err)
	cAfter, err := st.GetSession(context.Background(), c.ID)
	require.NoError(t, err)
	assert.Equal(t, aBefore.Pinned, aAfter.Pinned)
	assert.Equal(t, aBefore.RailPos, aAfter.RailPos)
	assert.Equal(t, cBefore.Pinned, cAfter.Pinned)
	assert.Equal(t, cBefore.RailPos, cAfter.RailPos)

	_, err = st.GetSession(context.Background(), b.ID)
	assert.Error(t, err, "the removed session's own row is gone")
}

// TestApply_NeverTouchesPinnedOrRailPos covers D17 (state machine transitions must never
// write pinned/railPos — display-only columns, m3-gauges INV-1 style discipline): a
// session pinned at a non-zero railPos is driven through bind, working, needs_input and
// idle transitions, and pinned/railPos must be byte-identical throughout.
func TestApply_NeverTouchesPinnedOrRailPos(t *testing.T) {
	st := openTestStore(t)
	mgr := newTestManager(t, st, nil, nil)
	dir := t.TempDir()
	_ = createLaunchedSession(t, mgr, st, dir) // pushes the session under test off railPos 0
	sess := createLaunchedSession(t, mgr, st, dir)
	require.NoError(t, mgr.SetPinned(context.Background(), sess.ID, true))
	pinned, ok := mgr.Get(sess.ID)
	require.True(t, ok)
	require.True(t, pinned.Pinned)
	wantRailPos := pinned.RailPos

	ctx := context.Background()
	_, err := mgr.Apply(ctx, sess.ID, "claude-1", nil, claudecode.StateInput{Kind: claudecode.KindBind}, true)
	require.NoError(t, err)
	promptID := "p1"
	_, err = mgr.Apply(ctx, sess.ID, "claude-1", &promptID, claudecode.StateInput{Kind: claudecode.KindTurnActivity}, true)
	require.NoError(t, err)
	_, err = mgr.Apply(ctx, sess.ID, "claude-1", &promptID, claudecode.StateInput{Kind: claudecode.KindNeedsInputPermission}, true)
	require.NoError(t, err)
	_, err = mgr.Apply(ctx, sess.ID, "claude-1", &promptID, claudecode.StateInput{Kind: claudecode.KindTurnClosed}, true)
	require.NoError(t, err)

	final, ok := mgr.Get(sess.ID)
	require.True(t, ok)
	assert.True(t, final.Pinned, "D17: no state transition may unpin a session")
	assert.Equal(t, wantRailPos, final.RailPos, "D17: no state transition may change railPos")

	persisted, err := st.GetSession(ctx, sess.ID)
	require.NoError(t, err)
	assert.True(t, persisted.Pinned)
	assert.Equal(t, wantRailPos, persisted.RailPos)
}

// TestApplyStatus_NeverTouchesPinnedOrRailPos is TestApply_NeverTouchesPinnedOrRailPos's
// twin for status-line posts (D17).
func TestApplyStatus_NeverTouchesPinnedOrRailPos(t *testing.T) {
	st := openTestStore(t)
	mgr := newTestManager(t, st, nil, nil)
	dir := t.TempDir()
	sess := createLaunchedSession(t, mgr, st, dir)
	require.NoError(t, mgr.SetPinned(context.Background(), sess.ID, true))
	pinned, ok := mgr.Get(sess.ID)
	require.True(t, ok)
	wantRailPos := pinned.RailPos

	title := "Renamed via status"
	_, err := mgr.ApplyStatus(context.Background(), sess.ID, claudecode.StatusUpdate{Title: &title})
	require.NoError(t, err)

	final, ok := mgr.Get(sess.ID)
	require.True(t, ok)
	assert.True(t, final.Pinned)
	assert.Equal(t, wantRailPos, final.RailPos)
}

// --- plan session-lifecycle: identity, reconcile-convergence, atomicity red tests ---
//
// Every test below is written and run against the unmodified tree (Implementation Notes
// § Red-first): each documents, in its own comment, the current (buggy) behaviour it
// observes, not the fixed one it will observe once daemon-impl lands.

// realTmuxManager builds a Manager whose PaneChecker, PaneSnapshotter and TmuxSessions are
// all a real tmux.Client on a private per-test socket — needed wherever a test's assertion
// depends on Reconcile/End actually deriving a target/pane from tmux, which no fake can
// fabricate realistically (Testing conventions: real tmux only for a tmux-observable
// effect).
func realTmuxManager(t *testing.T, st *store.Store, onUpsert func(*Session)) (*Manager, *tmux.Client) {
	t.Helper()
	client := tmux.New(tmuxtest.Socket(t))
	mgr := newTestManager(t, st, client, onUpsert, withTmuxSessions(client), withPaneSnapshotter(client))
	return mgr, client
}

// TestCreateSession_AfterRemovingTheHighestIDTheNextIDIsStrictlyGreater covers D7/REQ-2:
// a session id must never be reissued, including right after the highest row is deleted
// by Remove/DeleteSession. session.id is currently an ordinary SQLite ROWID column with
// no AUTOINCREMENT and no watermark (REQ-1's gap) — deleting the highest row lets the very
// next insert compute the same max(rowid)+1 and reuse it.
func TestCreateSession_AfterRemovingTheHighestIDTheNextIDIsStrictlyGreater(t *testing.T) {
	st := openTestStore(t)
	ctx := context.Background()
	dir := t.TempDir()
	repoID := seedRepo(t, st, dir)
	params := createParams(dir)
	params.RepoID = repoID

	mgr := newTestManager(t, st, nil, nil)
	first, err := mgr.CreateSession(ctx, params)
	require.NoError(t, err)
	second, err := mgr.CreateSession(ctx, params)
	require.NoError(t, err)
	require.Greater(t, second.ID, first.ID)

	require.NoError(t, mgr.DeleteSession(ctx, second.ID)) // remove the highest id

	third, err := mgr.CreateSession(ctx, params)
	require.NoError(t, err)
	assert.Greater(t, third.ID, second.ID, "D7/REQ-2: a session id must never be reissued, even right after the highest row is deleted")
}

// TestReconcile_LiveMusterSessionUnderAPlaceholderTargetIsRepairedAndKeptAlive covers D8
// (Edge Case 5, SIGKILL between NewSession and RecordLaunch): a row whose tmux_target is
// still the InsertSession placeholder ("") but whose muster-<id> tmux session is actually
// live must be repaired and kept alive, not swept. classifySessions today reads
// PaneExists("") as false unconditionally (tmux.go's own empty-target short-circuit) and
// never consults ListSessions/ownership by name, so this row is marked ended instead.
func TestReconcile_LiveMusterSessionUnderAPlaceholderTargetIsRepairedAndKeptAlive(t *testing.T) {
	st := openTestStore(t)
	ctx := context.Background()
	dir := t.TempDir()
	repoID := seedRepo(t, st, dir)
	params := createParams(dir)
	params.RepoID = repoID

	seed := newTestManager(t, st, nil, nil)
	sess, err := seed.CreateSession(ctx, params) // tmux_target left "" — never RecordLaunch'd
	require.NoError(t, err)

	mgr, client := realTmuxManager(t, st, nil)
	realTarget, _, err := client.NewSession(ctx, sess.ID, dir, nil, sleepCommand())
	require.NoError(t, err)

	require.NoError(t, mgr.LoadAll(ctx))
	_ = mgr.Reconcile(ctx)

	got, ok := mgr.Get(sess.ID)
	require.True(t, ok, "D8: the row must survive Reconcile")
	assert.True(t, got.Alive, "D8: a live muster-<id> under a placeholder target must be kept alive, not swept")
	assert.Equal(t, realTarget, got.TmuxTarget, "the placeholder target must be repaired from tmux")

	persisted, err := st.GetSession(ctx, sess.ID)
	require.NoError(t, err)
	assert.Equal(t, realTarget, persisted.TmuxTarget, "the repair must be persisted, not just in memory")
	assert.True(t, persisted.Alive)
}

// TestReconcile_AliveFalseRowWithALiveMusterSessionIsRevivedNotSwept covers D9 (Edge Cases
// 6/7): a row already marked alive=false — e.g. a SIGKILL landed between a resume's spawn
// and its persist, or an earlier KillSession silently failed — whose muster-<id> tmux
// session is nonetheless still live must be revived, not deleted.
// classifySessions today short-circuits on `!r.alive` straight to sweep, before any pane
// check at all.
func TestReconcile_AliveFalseRowWithALiveMusterSessionIsRevivedNotSwept(t *testing.T) {
	st := openTestStore(t)
	ctx := context.Background()
	dir := t.TempDir()
	repoID := seedRepo(t, st, dir)
	params := createParams(dir)
	params.RepoID = repoID

	seed := newTestManager(t, st, nil, nil)
	sess, err := seed.CreateSession(ctx, params)
	require.NoError(t, err)

	mgr, client := realTmuxManager(t, st, nil)
	target, pane, err := client.NewSession(ctx, sess.ID, dir, nil, sleepCommand())
	require.NoError(t, err)
	_, err = seed.RecordLaunch(ctx, sess.ID, target, pane)
	require.NoError(t, err)

	// Simulate the SIGKILL-between-kill-and-persist scenario directly: the row believes
	// it is dead while its pane is, in fact, still running.
	row, err := st.GetSession(ctx, sess.ID)
	require.NoError(t, err)
	row.Alive = false
	endedAt := time.Now().UTC()
	row.EndedAt = &endedAt
	require.NoError(t, st.UpdateSession(ctx, row))

	require.NoError(t, mgr.LoadAll(ctx))
	_ = mgr.Reconcile(ctx)

	got, ok := mgr.Get(sess.ID)
	require.True(t, ok, "D9: the row must not be deleted while its pane is live")
	assert.True(t, got.Alive, "D9: a live muster-<id> must revive an alive=false row, not leave it swept")
	assert.Nil(t, got.EndedAt)
}

// TestReconcile_AliveRowWithAStaleWindowTargetIsRepairedNotMarkedEnded covers D10 (Edge
// Case 8): an alive=true row whose stored tmux_target names a window that no longer
// exists, while its owning muster-<id> tmux session is genuinely still live (under a
// different window id), must have its target repaired rather than being marked ended —
// today's PaneExists(staleTarget) check reports false and marks it ended.
func TestReconcile_AliveRowWithAStaleWindowTargetIsRepairedNotMarkedEnded(t *testing.T) {
	st := openTestStore(t)
	ctx := context.Background()
	dir := t.TempDir()
	repoID := seedRepo(t, st, dir)
	params := createParams(dir)
	params.RepoID = repoID

	seed := newTestManager(t, st, nil, nil)
	sess, err := seed.CreateSession(ctx, params)
	require.NoError(t, err)

	mgr, client := realTmuxManager(t, st, nil)
	realTarget, pane, err := client.NewSession(ctx, sess.ID, dir, nil, sleepCommand())
	require.NoError(t, err)
	_, err = seed.RecordLaunch(ctx, sess.ID, realTarget, pane)
	require.NoError(t, err)

	// Corrupt the stored target to name a window that was never actually created, while
	// the owning tmux session itself is still very much alive.
	tmuxName := "muster-" + strconv.FormatInt(sess.ID, 10)
	staleTarget := tmuxName + ":@999999"
	row, err := st.GetSession(ctx, sess.ID)
	require.NoError(t, err)
	row.TmuxTarget = staleTarget
	require.NoError(t, st.UpdateSession(ctx, row))

	require.NoError(t, mgr.LoadAll(ctx))
	_ = mgr.Reconcile(ctx)

	got, ok := mgr.Get(sess.ID)
	require.True(t, ok)
	assert.True(t, got.Alive, "D10: a live owning tmux session must not be marked ended over a stale window id")
	assert.Nil(t, got.EndedAt)
	assert.Equal(t, realTarget, got.TmuxTarget, "the stale window target must be repaired to the real one")
}

// TestEnd_AlreadyGoneTmuxSessionIsSuccessNotError covers D12/REQ-6 (Edge Case 9): a pane
// that died moments before End runs must be treated as an already-successful kill —
// KillSession today has no "already gone" tolerance (unlike PaneExists/ListSessions) and
// returns a genuine error for a "no such session" tmux exit, which End propagates as a 500.
func TestEnd_AlreadyGoneTmuxSessionIsSuccessNotError(t *testing.T) {
	st := openTestStore(t)
	ctx := context.Background()
	dir := t.TempDir()
	repoID := seedRepo(t, st, dir)
	params := createParams(dir)
	params.RepoID = repoID

	mgr, client := realTmuxManager(t, st, nil)
	sess, err := mgr.CreateSession(ctx, params)
	require.NoError(t, err)
	target, pane, err := client.NewSession(ctx, sess.ID, dir, nil, sleepCommand())
	require.NoError(t, err)
	_, err = mgr.RecordLaunch(ctx, sess.ID, target, pane)
	require.NoError(t, err)

	// The pane dies (here: is killed out-of-band) moments before End runs.
	tmuxName := "muster-" + strconv.FormatInt(sess.ID, 10)
	require.NoError(t, client.KillSession(ctx, tmuxName))

	got, err := mgr.End(ctx, sess.ID)

	require.NoError(t, err, "D12/REQ-6: an already-gone tmux session must be treated as a successful kill, never an error")
	assert.False(t, got.Alive)
	require.NotNil(t, got.EndedAt)
}

// TestEnd_ConcurrentEndsProduceExactlyOneMarkEndedAndNeverAKillError covers D14/REQ-11:
// two concurrent End calls on the same session must serialise the check-then-act so at
// most one observes ErrSessionNotAlive, exactly one persists+broadcasts the alive:false
// flip, and neither ever surfaces a raw kill error. End has no per-session lock today, so
// both goroutines can pass the initial "is it alive" gate before either flips state, and
// whichever loses the race against the real tmux kill-session gets a genuine "no such
// session" error back (REQ-6 not yet in effect either) instead of ErrSessionNotAlive.
func TestEnd_ConcurrentEndsProduceExactlyOneMarkEndedAndNeverAKillError(t *testing.T) {
	st := openTestStore(t)
	ctx := context.Background()
	dir := t.TempDir()
	repoID := seedRepo(t, st, dir)
	params := createParams(dir)
	params.RepoID = repoID

	rec := &upsertsRecorder{}
	mgr, client := realTmuxManager(t, st, rec.record)
	sess, err := mgr.CreateSession(ctx, params)
	require.NoError(t, err)
	target, pane, err := client.NewSession(ctx, sess.ID, dir, nil, sleepCommand())
	require.NoError(t, err)
	_, err = mgr.RecordLaunch(ctx, sess.ID, target, pane)
	require.NoError(t, err)

	const attempts = 2
	ready := make(chan struct{})
	var wg sync.WaitGroup
	results := make([]error, attempts)
	for i := range attempts {
		wg.Add(1)
		go func(i int) {
			defer wg.Done()
			<-ready
			_, err := mgr.End(ctx, sess.ID)
			results[i] = err
		}(i)
	}
	close(ready)
	wg.Wait()

	notAlive, killErrs, oks := 0, 0, 0
	for _, err := range results {
		switch {
		case err == nil:
			oks++
		case errors.Is(err, ErrSessionNotAlive):
			notAlive++
		default:
			killErrs++
		}
	}
	assert.LessOrEqual(t, notAlive, 1, "D14: at most one concurrent End may observe not-alive")
	assert.Equal(t, 0, killErrs, "D14/REQ-11+REQ-6: neither concurrent End call may surface a raw kill error")

	endedBroadcasts := 0
	for _, s := range rec.all() {
		if s.ID == sess.ID && !s.Alive {
			endedBroadcasts++
		}
	}
	assert.Equal(t, 1, endedBroadcasts, "D14: exactly one alive:false broadcast, never zero or two")
}

// TestHandleRemoveSession... (D15) lives in internal/server/sessions_test.go: it needs
// the shell registry and HTTP handler, which this package doesn't have.

// TestMarkEnded_APersistFailureLeavesTheInMemorySessionAliveMatchingTheDB covers D16: when
// UpdateSession fails inside markEnded, the in-memory alive:=false mutation must roll back
// so memory never disagrees with the DB — today's markEnded flips sess.Alive before the
// persist and never rolls it back on a persist error.
func TestMarkEnded_APersistFailureLeavesTheInMemorySessionAliveMatchingTheDB(t *testing.T) {
	st := openTestStore(t)
	ctx := context.Background()
	dir := t.TempDir()
	repoID := seedRepo(t, st, dir)
	params := createParams(dir)
	params.RepoID = repoID

	pc := newFakePaneChecker()
	mgr := newTestManager(t, st, pc, nil)
	sess, err := mgr.CreateSession(ctx, params)
	require.NoError(t, err)
	target := "muster-" + strconv.FormatInt(sess.ID, 10) + ":@1"
	_, err = mgr.RecordLaunch(ctx, sess.ID, target, "%1")
	require.NoError(t, err)

	pc.setExists(target, false) // the pane is gone

	require.NoError(t, st.Close()) // forces the next UpdateSession to fail

	mgr.checkLiveness(ctx) // drives checkOneLiveness -> markEnded, whose persist must now fail

	got, ok := mgr.Get(sess.ID)
	require.True(t, ok)
	assert.True(t, got.Alive, "D16: a failed persist must roll the in-memory flip back so memory and the DB never disagree")
	assert.Nil(t, got.EndedAt)
}

// TestCheckLiveness_ListSessionsFailureLeavesSessionsAsIsDespitePaneExistsFalse covers
// D17/REQ-16: before believing a pane is gone, checkOneLiveness must confirm the tmux
// server is reachable at all (a successful ListSessions) — a server-level failure (tmux
// unreachable) must be treated as transient and leave sessions untouched, never as N
// simultaneous deaths. checkOneLiveness today consults only PaneExists.
func TestCheckLiveness_ListSessionsFailureLeavesSessionsAsIsDespitePaneExistsFalse(t *testing.T) {
	st := openTestStore(t)
	ctx := context.Background()
	dir := t.TempDir()
	repoID := seedRepo(t, st, dir)
	params := createParams(dir)
	params.RepoID = repoID

	pc := newFakePaneChecker()
	killer := newFakeTmuxSessions()
	killer.setListErr(errors.New("tmux server unreachable"))
	rec := &upsertsRecorder{}
	mgr := newTestManager(t, st, pc, rec.record, withTmuxSessions(killer))

	sess, err := mgr.CreateSession(ctx, params)
	require.NoError(t, err)
	target := "muster-" + strconv.FormatInt(sess.ID, 10) + ":@1"
	_, err = mgr.RecordLaunch(ctx, sess.ID, target, "%1")
	require.NoError(t, err)

	pc.setExists(target, false) // the pane check alone says "gone"

	mgr.checkLiveness(ctx)

	got, ok := mgr.Get(sess.ID)
	require.True(t, ok)
	assert.True(t, got.Alive, "D17/REQ-16: a server-level ListSessions failure must be treated as transient, never as grounds to mark the session dead")
	assert.Nil(t, got.EndedAt)
}

// ---------------------------------------------------------------------------------------
// KillAllShells / ShellCount / PaneOf (general-cleanup REQ-13, D11/D12; REQ-12)

// TestKillAllShells_KillsEveryShellAndNoClaudeSessions covers D11: KillAllShells kills
// every muster-<n>-shell tmux session on the socket and none of the muster-<n> ones, and
// counts an already-gone shell as killed (REQ-13/kb:adr/actions-kill-is-idempotent — the
// fake's KillSession has no notion of "already gone" to fail on, mirroring
// tmux.Client.KillSession's own idempotence).
func TestKillAllShells_KillsEveryShellAndNoClaudeSessions(t *testing.T) {
	st := openTestStore(t)
	killer := newFakeTmuxSessions("muster-1", "muster-2-shell", "muster-3-shell", "other-unrelated")
	mgr := newTestManager(t, st, nil, nil, withTmuxSessions(killer))

	killed, err := mgr.KillAllShells(context.Background())

	require.NoError(t, err)
	assert.Equal(t, 2, killed)
	assert.ElementsMatch(t, []string{"muster-2-shell", "muster-3-shell"}, killer.killedNames(),
		"D11: only muster-<n>-shell names are killed, never a muster-<n> claude session or an unrelated tmux session")
}

// TestKillAllShells_OneShellAlreadyGoneStillCountsAsKilled covers D11's idempotence
// clause directly: a shell whose KillSession happens to fail is logged and skipped, never
// stopping the rest — mirroring reportAndSweepUnknown's own "one id's failure does not
// stop the rest" discipline (REQ-10).
func TestKillAllShells_OneShellFailingDoesNotStopTheRest(t *testing.T) {
	st := openTestStore(t)
	killer := newFakeTmuxSessions("muster-1-shell", "muster-2-shell")
	killer.setKillErr("muster-1-shell", errors.New("kill-session failed"))
	mgr := newTestManager(t, st, nil, nil, withTmuxSessions(killer))

	killed, err := mgr.KillAllShells(context.Background())

	require.NoError(t, err)
	assert.Equal(t, 1, killed, "one shell's failure must not stop the other from being killed")
	assert.Equal(t, []string{"muster-2-shell"}, killer.killedNames())
}

// TestKillAllShells_EmptySocketReadsAsNoShells: a tmux socket with nothing on it reads as
// zero shells, not an error. TmuxSessions is a required port
// (TestNewManager_PanicsOnMissingRequiredPort below), so this exercises the equivalent
// case instead — an empty default fakeTmuxSessions (newTestManager's own default) —
// which shellNamesOnSocket must still handle without erroring.
func TestKillAllShells_EmptySocketReadsAsNoShells(t *testing.T) {
	st := openTestStore(t)
	mgr := newTestManager(t, st, nil, nil)

	killed, err := mgr.KillAllShells(context.Background())

	require.NoError(t, err)
	assert.Equal(t, 0, killed)
}

// TestKillAllShells_ListSessionsFailureIsReturnedAsAnError covers D12: a ShellCount/
// KillAllShells error (the socket unreachable) is returned to the caller — cmd/musterd's
// shutdown path is the one that logs it and treats it as zero, per REQ-13's Implementation
// Notes ("ShellCount runs before resolveOnExit... error path logs at Warn and uses 0");
// the manager method itself just reports the failure honestly.
func TestKillAllShells_ListSessionsFailureIsReturnedAsAnError(t *testing.T) {
	st := openTestStore(t)
	killer := newFakeTmuxSessions()
	killer.setListErr(errors.New("tmux server unreachable"))
	mgr := newTestManager(t, st, nil, nil, withTmuxSessions(killer))

	_, err := mgr.KillAllShells(context.Background())

	require.Error(t, err, "D12: a socket-unreachable failure must be reported, not swallowed as zero shells")
}

// TestShellCount_CountsOnlyShellNames covers D12's positive half: ShellCount counts every
// muster-<n>-shell name and ignores muster-<n> and unrelated names, without killing
// anything.
func TestShellCount_CountsOnlyShellNames(t *testing.T) {
	st := openTestStore(t)
	killer := newFakeTmuxSessions("muster-1", "muster-2-shell", "muster-3-shell", "other-unrelated")
	mgr := newTestManager(t, st, nil, nil, withTmuxSessions(killer))

	count, err := mgr.ShellCount(context.Background())

	require.NoError(t, err)
	assert.Equal(t, 2, count)
	assert.Empty(t, killer.killedNames(), "ShellCount must never kill anything")
}

// TestShellCount_ListSessionsFailureIsReturnedAsAnError covers D12's error-propagation
// half, the ShellCount-specific twin of TestKillAllShells_ListSessionsFailureIsReturnedAsAnError.
func TestShellCount_ListSessionsFailureIsReturnedAsAnError(t *testing.T) {
	st := openTestStore(t)
	killer := newFakeTmuxSessions()
	killer.setListErr(errors.New("tmux server unreachable"))
	mgr := newTestManager(t, st, nil, nil, withTmuxSessions(killer))

	_, err := mgr.ShellCount(context.Background())

	require.Error(t, err)
}

// TestPaneOf_KnownSessionReturnsItsStoredPaneEmptyPaneIsOKTrue covers REQ-12's
// corroboration read: PaneOf reports id's stored pane, with an empty pane and ok:true
// distinguished from an unknown id (ok:false) — INV-EMPTY-PANE-ROUTES depends on that
// distinction (an empty stored pane is "not yet recorded", not "unknown").
func TestPaneOf_KnownSessionReturnsItsStoredPaneEmptyPaneIsOKTrue(t *testing.T) {
	st := openTestStore(t)
	ctx := context.Background()
	dir := t.TempDir()
	repoID := seedRepo(t, st, dir)
	params := createParams(dir)
	params.RepoID = repoID
	mgr := newTestManager(t, st, nil, nil)

	sess, err := mgr.CreateSession(ctx, params)
	require.NoError(t, err)

	pane, ok := mgr.PaneOf(sess.ID)
	require.True(t, ok)
	assert.Empty(t, pane, "the spawn-to-record window: a freshly created session has no pane yet")

	_, err = mgr.RecordLaunch(ctx, sess.ID, "muster-"+strconv.FormatInt(sess.ID, 10)+":@1", "%7")
	require.NoError(t, err)

	pane, ok = mgr.PaneOf(sess.ID)
	require.True(t, ok)
	assert.Equal(t, "%7", pane)
}

// TestPaneOf_UnknownSessionIsNotOK covers PaneOf's negative case: an id the manager has
// never heard of reports ok:false, distinct from a known session's empty (not-yet-recorded)
// pane.
func TestPaneOf_UnknownSessionIsNotOK(t *testing.T) {
	st := openTestStore(t)
	mgr := newTestManager(t, st, nil, nil)

	pane, ok := mgr.PaneOf(999999)

	assert.False(t, ok)
	assert.Empty(t, pane)
}
