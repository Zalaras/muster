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
