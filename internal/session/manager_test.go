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

	_ "modernc.org/sqlite"
)

func openTestStore(t *testing.T) *store.Store {
	t.Helper()
	st, err := store.Open(context.Background(), filepath.Join(t.TempDir(), "muster.db"))
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

// fakeKiller is a Killer double: fully test-controlled ListSessions/KillSession, no real
// tmux socket needed (m4-reconcile REQ-2's unknown-panes check and REQ-5/REQ-6's kill
// path). ListSessions' answer is fixed at construction (Reconcile's own test scenarios
// don't need it to change mid-test); KillSession's per-name outcome and call log are
// mutable under a lock since Manager methods call it from the caller's own goroutine but
// tests read the log back afterward.
type fakeKiller struct {
	mu       sync.Mutex
	sessions []string
	killErr  map[string]error
	killed   []string
}

func newFakeKiller(sessions ...string) *fakeKiller {
	return &fakeKiller{sessions: sessions, killErr: map[string]error{}}
}

func (f *fakeKiller) ListSessions(_ context.Context) ([]string, error) {
	f.mu.Lock()
	defer f.mu.Unlock()
	out := make([]string, len(f.sessions))
	copy(out, f.sessions)
	return out, nil
}

func (f *fakeKiller) KillSession(_ context.Context, name string) error {
	f.mu.Lock()
	defer f.mu.Unlock()
	if err, ok := f.killErr[name]; ok {
		return err
	}
	f.killed = append(f.killed, name)
	return nil
}

func (f *fakeKiller) setKillErr(name string, err error) {
	f.mu.Lock()
	defer f.mu.Unlock()
	f.killErr[name] = err
}

func (f *fakeKiller) killedNames() []string {
	f.mu.Lock()
	defer f.mu.Unlock()
	out := make([]string, len(f.killed))
	copy(out, f.killed)
	return out
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

func newTestManager(t *testing.T, st *store.Store, pc PaneChecker, onUpsert func(*Session)) *Manager {
	t.Helper()
	return NewManager(Config{
		Store:        st,
		Logger:       zerolog.Nop(),
		PaneChecker:  pc,
		OnUpsert:     onUpsert,
		PollInterval: 10 * time.Millisecond, // fast enough for tests to observe within seconds
	})
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
	_, err = mgr.Apply(context.Background(), sess.ID, "claude-1", nil, claudecode.StateInput{Kind: claudecode.KindBind})
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

	_, err = mgr.Apply(context.Background(), sess.ID, "claude-1", nil, claudecode.StateInput{Kind: claudecode.KindBind})
	require.NoError(t, err)

	boundID, ok := mgr.Resolve("claude-1")
	require.True(t, ok)
	assert.Equal(t, sess.ID, boundID)

	promptID := "p1"
	final, err := mgr.Apply(context.Background(), sess.ID, "claude-1", &promptID, claudecode.StateInput{Kind: claudecode.KindTurnActivity})
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

	_, err := mgr.Apply(context.Background(), 42, "claude-1", nil, claudecode.StateInput{Kind: claudecode.KindBind})

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
	_, err = mgr1.Apply(context.Background(), sess.ID, "claude-9", nil, claudecode.StateInput{Kind: claudecode.KindBind})
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

	assert.Equal(t, len(before), len(rec.all()), "a live pane must not trigger a spurious broadcast")
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

	assert.Equal(t, len(before), len(rec.all()), "a check error must not trigger a broadcast — the session is left as-is, not flipped")
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
// pre-upgrade check (docs/protocol.md §6: 404 unknown id / 409 not_attachable).
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
	mgr := NewManager(Config{
		Store: st, Logger: zerolog.Nop(), PaneChecker: pc, OnUpsert: rec.record,
		PollInterval: time.Hour,
	})
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

	assert.Equal(t, before, len(rec.all()))
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

	assert.Equal(t, firstCount, len(rec.all()), "a session already flipped dead must not broadcast again")
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

	assert.Equal(t, afterFirst, len(rec.all()), "an identical status update must not re-broadcast")
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
	_, err = mgr.Apply(context.Background(), sess.ID, "claude-1", nil, claudecode.StateInput{Kind: claudecode.KindBind})
	require.NoError(t, err)
	promptID := "p1"
	_, err = mgr.Apply(context.Background(), sess.ID, "claude-1", &promptID, claudecode.StateInput{Kind: claudecode.KindNeedsInputPermission})
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

// TestRowToSession_ModelDisplayNameFallsBackToIDForPreM3Rows covers REQ-16's other
// half: a row written before M3 (or before any status post ever arrived) has a null
// model_display_name column — rowToSession must fall back to the id, matching the
// pre-M3 behaviour, rather than surfacing an empty display name.
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

	// "Fresh daemon lifetime": reload from the store with a fake pane checker reporting
	// the deadPane target gone and the livePane target still there.
	pc := newFakePaneChecker()
	pc.setExists("muster-deadpane:@1", false)
	pc.setExists("muster-livepane:@1", true)
	rec := &upsertsRecorder{}
	mgr := NewManager(Config{Store: st, Logger: zerolog.Nop(), PaneChecker: pc, OnUpsert: rec.record})
	require.NoError(t, mgr.LoadAll(ctx))

	report, err := mgr.Reconcile(ctx)
	require.NoError(t, err)

	assert.Equal(t, ReconcileReport{KeptAlive: 1, MarkedEnded: 1, Swept: 1}, report)

	// The already-ended row is gone from both memory and the store.
	assert.False(t, mgr.Exists(endedSess.ID))
	_, err = st.GetSession(ctx, endedSess.ID)
	assert.Error(t, err)

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

	killer := newFakeKiller(knownName, "muster-999999", "not-a-muster-session-at-all")
	pc := newFakePaneChecker()
	pc.setExists(target, true)
	var logBuf bytes.Buffer
	mgr := NewManager(Config{Store: st, Logger: zerolog.New(&logBuf), PaneChecker: pc, SessionKiller: killer})
	require.NoError(t, mgr.LoadAll(ctx))

	report, err := mgr.Reconcile(ctx)
	require.NoError(t, err)

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
	mgr := NewManager(Config{Store: st, Logger: zerolog.Nop(), PaneChecker: pc, PaneSnapshotter: snap})
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
			mgr := NewManager(Config{Store: st, Logger: zerolog.Nop(), PaneSnapshotter: snap})
			params := createParams(dir)
			params.RepoID = repoID
			sess, err := mgr.CreateSession(ctx, params)
			require.NoError(t, err)
			target := "muster-capture-" + tt.name + ":@1"
			_, err = mgr.RecordLaunch(ctx, sess.ID, target, "%1")
			require.NoError(t, err)

			_, err = mgr.Apply(ctx, sess.ID, "claude-1", nil, claudecode.StateInput{Kind: claudecode.KindBind})
			require.NoError(t, err)
			if tt.name != "started" {
				promptID := "p1"
				_, err = mgr.Apply(ctx, sess.ID, "claude-1", &promptID, tt.input)
				require.NoError(t, err)
			}

			before, ok := mgr.Get(sess.ID)
			require.True(t, ok)
			// review cycle 1 Minor 6: Clone() is a shallow copy, so before.Attention/
			// Failure/Model/Context share the exact same pointers the live session (and
			// therefore `after`, taken post-capture) holds — an *in-place* mutation of one
			// of those pointees would be invisible to a pointer-sharing compare, since both
			// "snapshots" would end up looking at the same, now-mutated, memory. Deref into
			// independent value copies right here, before captureSnapshot runs, so such a
			// mutation would actually show up as a diff below.
			beforeDeref := derefSessionPointers(before)

			snap.setText(target, "pane output for "+tt.name)
			mgr.captureSnapshot(ctx, sess.ID, target)

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
	mgr := NewManager(Config{Store: st, Logger: zerolog.Nop(), PaneSnapshotter: snap})
	params := createParams(dir)
	params.RepoID = repoID
	sess, err := mgr.CreateSession(ctx, params)
	require.NoError(t, err)
	target := "muster-capture-err:@1"
	_, err = mgr.RecordLaunch(ctx, sess.ID, target, "%1")
	require.NoError(t, err)

	snap.setText(target, "good capture")
	mgr.captureSnapshot(ctx, sess.ID, target)
	before, ok := mgr.Get(sess.ID)
	require.True(t, ok)
	require.Equal(t, "good capture", before.LastSnapshot)

	snap.setErr(target, errors.New("tmux capture-pane: transient failure"))
	mgr.captureSnapshot(ctx, sess.ID, target)

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
	mgr := NewManager(Config{Store: st, Logger: zerolog.Nop()})
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
	mgr := NewManager(Config{Store: openTestStore(t), Logger: zerolog.Nop()})
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
	mgr := NewManager(Config{Store: st, Logger: zerolog.Nop(), PaneSnapshotter: snap})
	params := createParams(dir)
	params.RepoID = repoID
	sess, err := mgr.CreateSession(ctx, params)
	require.NoError(t, err)
	target := "muster-blank-capture:@1"
	_, err = mgr.RecordLaunch(ctx, sess.ID, target, "%1")
	require.NoError(t, err)

	snap.setText(target, "some pane text")
	mgr.captureSnapshot(ctx, sess.ID, target)
	_, _, ok := mgr.Snapshot(sess.ID)
	require.True(t, ok, "sanity check: the non-blank capture is visible")

	snap.setText(target, "") // the screen genuinely went blank on the next capture
	mgr.captureSnapshot(ctx, sess.ID, target)

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
	mgr := NewManager(Config{Store: st, Logger: zerolog.Nop(), PaneSnapshotter: snap})
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
	mgr.captureSnapshot(ctx, sess.ID, target)

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
	killer := newFakeKiller()
	snapper := newFakePaneSnapshotter()
	rec := &upsertsRecorder{}
	mgr := NewManager(Config{
		Store: st, Logger: zerolog.Nop(), PaneChecker: pc, SessionKiller: killer,
		PaneSnapshotter: snapper, OnUpsert: rec.record,
	})
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
	killer := newFakeKiller()
	snapper := newFakePaneSnapshotter()
	mgr := NewManager(Config{
		Store: st, Logger: zerolog.Nop(), PaneChecker: pc, SessionKiller: killer,
		PaneSnapshotter: snapper,
	})
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

// TestEnd_UnknownAndAlreadyEndedSessions covers End's two error branches (docs/protocol.md
// §3.7): an unknown id is ErrUnknownSession, and an already-ended session is
// ErrSessionNotAlive.
func TestEnd_UnknownAndAlreadyEndedSessions(t *testing.T) {
	st := openTestStore(t)
	mgr := newTestManager(t, st, nil, nil)

	_, err := mgr.End(context.Background(), 999)
	assert.ErrorIs(t, err, ErrUnknownSession)

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
		killer := newFakeKiller()
		var removedIDs []int64
		mgr := NewManager(Config{
			Store: st, Logger: zerolog.Nop(), PaneChecker: pc, SessionKiller: killer,
			OnRemoved: func(id int64) { removedIDs = append(removedIDs, id) },
		})

		target, err := mgr.CreateSession(ctx, params)
		require.NoError(t, err)
		targetTmux := "muster-" + strconv.FormatInt(target.ID, 10) + ":@1"
		_, err = mgr.RecordLaunch(ctx, target.ID, targetTmux, "%1")
		require.NoError(t, err)
		_, err = mgr.Apply(ctx, target.ID, "claude-remove-1", nil, claudecode.StateInput{Kind: claudecode.KindBind})
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
		assert.Error(t, err)
		assert.Equal(t, []string{"muster-" + strconv.FormatInt(target.ID, 10)}, killer.killedNames())
		assert.Equal(t, []int64{target.ID}, removedIDs)

		bystanderAfter, ok := mgr.Get(bystander.ID)
		require.True(t, ok)
		assert.True(t, bystanderAfter.Alive, "the bystander must survive the other session's Remove")
	})

	t.Run("a failing kill leaves the row and never fires OnRemoved", func(t *testing.T) {
		pc := newFakePaneChecker()
		killer := newFakeKiller()
		var removedIDs []int64
		mgr := NewManager(Config{
			Store: st, Logger: zerolog.Nop(), PaneChecker: pc, SessionKiller: killer,
			OnRemoved: func(id int64) { removedIDs = append(removedIDs, id) },
		})

		sess, err := mgr.CreateSession(ctx, params)
		require.NoError(t, err)
		tmuxName := "muster-" + strconv.FormatInt(sess.ID, 10)
		_, err = mgr.RecordLaunch(ctx, sess.ID, tmuxName+":@1", "%1")
		require.NoError(t, err)
		killer.setKillErr(tmuxName, errors.New("tmux kill-session: boom"))

		err = mgr.Remove(ctx, sess.ID)

		assert.Error(t, err)
		assert.True(t, mgr.Exists(sess.ID), "the row must survive a failed kill")
		_, getErr := st.GetSession(ctx, sess.ID)
		assert.NoError(t, getErr, "the row must still be in the store")
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
