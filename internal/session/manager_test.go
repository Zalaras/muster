package session

import (
	"context"
	"path/filepath"
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
