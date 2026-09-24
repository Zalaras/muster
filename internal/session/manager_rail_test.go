package session

import (
	"context"
	"sync"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/Zalaras/muster/internal/claudecode"
	"github.com/Zalaras/muster/internal/tmux"
)

// fakeWatcher is a Watcher double: fully test-controlled per-id answers, no real
// terminalRegistry needed (plan rail-card-improvements REQ-7/REQ-8).
type fakeWatcher struct {
	mu      sync.Mutex
	watched map[int64]bool
}

func newFakeWatcher() *fakeWatcher {
	return &fakeWatcher{watched: map[int64]bool{}}
}

func (f *fakeWatcher) Watched(id int64) bool {
	f.mu.Lock()
	defer f.mu.Unlock()
	return f.watched[id]
}

func (f *fakeWatcher) setWatched(id int64, v bool) {
	f.mu.Lock()
	defer f.mu.Unlock()
	f.watched[id] = v
}

// TestApply_TurnClosed_SetsUnreadFromWatcher covers D5/D6/D7 and the daemon half of
// INV-1 (unread ⇒ idle) at the layer that actually owns Unread: Manager.Apply sets it
// only for KindTurnClosed, from the Watcher's answer at that moment — crossed against
// every one of the six source states (kb:lesson/invariant-missed-by-per-transition-tests)
// and every watcher answer, including a nil Watcher (Config.Watcher unset, as most of
// this suite's other tests build it), which must count as unwatched exactly like
// watched:false.
func TestApply_TurnClosed_SetsUnreadFromWatcher(t *testing.T) {
	states := []State{StateStarted, StatePlanning, StateWorking, StateNeedsInput, StateFailed, StateIdle}
	type watcherCase struct {
		name       string
		nilWatcher bool
		watched    bool
		wantUnread bool
	}
	cases := []watcherCase{
		{"watched_true", false, true, false},
		{"watched_false", false, false, true},
		{"nil_watcher_counts_as_unwatched", true, false, true},
	}

	for _, from := range states {
		for _, tc := range cases {
			t.Run(string(from)+"/"+tc.name, func(t *testing.T) {
				st := openTestStore(t)
				rec := &upsertsRecorder{}
				var watcher *fakeWatcher
				var w Watcher
				if !tc.nilWatcher {
					watcher = newFakeWatcher()
					w = watcher
				}
				mgr := newTestManager(t, st, nil, rec.record, withWatcher(w))
				sess := createLaunchedSession(t, mgr, st, t.TempDir())
				claudeID := "claude-1"
				advanceToState(t, mgr, sess.ID, claudeID, from, true)
				if watcher != nil {
					watcher.setWatched(sess.ID, tc.watched)
				}

				final, err := mgr.Apply(context.Background(), sess.ID, claudeID, nil, claudecode.StateInput{Kind: claudecode.KindTurnClosed}, true)
				require.NoError(t, err)

				assert.Equal(t, StateIdle, final.State)
				assert.Equal(t, tc.wantUnread, final.Unread)
				if final.Unread {
					assert.Equal(t, StateIdle, final.State, "INV-1: unread true must imply idle")
				}

				persisted, perr := st.GetSession(context.Background(), sess.ID)
				require.NoError(t, perr)
				assert.Equal(t, tc.wantUnread, persisted.Unread, "D5/D6: Unread must be persisted")
			})
		}
	}
}

// TestApply_TurnClosed_WatcherIsPerSessionIndependence covers Edge Case 4/D9's
// consequence at the manager layer: two sessions closing their turns against the same
// shared watcher, one watched and one not, must each get exactly its own Unread answer —
// never the other's ("nothing else was harmed" is an assertion, not an assumption,
// kb:lesson/detach-on-destroy-misrouted-keystrokes).
func TestApply_TurnClosed_WatcherIsPerSessionIndependence(t *testing.T) {
	st := openTestStore(t)
	rec := &upsertsRecorder{}
	watcher := newFakeWatcher()
	mgr := newTestManager(t, st, nil, rec.record, withWatcher(watcher))

	sessA := createLaunchedSession(t, mgr, st, t.TempDir())
	sessB := createLaunchedSession(t, mgr, st, t.TempDir())
	advanceToState(t, mgr, sessA.ID, "claude-a", StateWorking, true)
	advanceToState(t, mgr, sessB.ID, "claude-b", StateWorking, true)
	watcher.setWatched(sessA.ID, true)
	watcher.setWatched(sessB.ID, false)

	_, err := mgr.Apply(context.Background(), sessA.ID, "claude-a", nil, claudecode.StateInput{Kind: claudecode.KindTurnClosed}, true)
	require.NoError(t, err)
	_, err = mgr.Apply(context.Background(), sessB.ID, "claude-b", nil, claudecode.StateInput{Kind: claudecode.KindTurnClosed}, true)
	require.NoError(t, err)

	gotA, ok := mgr.Get(sessA.ID)
	require.True(t, ok)
	gotB, ok := mgr.Get(sessB.ID)
	require.True(t, ok)
	assert.False(t, gotA.Unread, "watched session must not be marked unread")
	assert.True(t, gotB.Unread, "unwatched session must be marked unread, unaffected by A's watched attach")
}

// TestApply_MonotonicRebindGuard_StragglerTurnClosedBehavesLikeAnyOther covers Edge
// Case 9: a Stop straggler from a conversation this session has already left behind (the
// /clear pair reordered so the new-id SessionStart applied before the old-id Stop
// arrives) is routed and applied like any other turn_closed by Apply's monotonic guard —
// it sets idle and, if the watcher reports unwatched, Unread — without rebinding
// backwards (mirrors manager_test.go's
// TestApply_MonotonicRebindGuard_ReorderedStragglerNeverRebindsBackwards, extended with a
// watcher).
func TestApply_MonotonicRebindGuard_StragglerTurnClosedBehavesLikeAnyOther(t *testing.T) {
	ctx := context.Background()
	st := openTestStore(t)
	rec := &upsertsRecorder{}
	watcher := newFakeWatcher()
	mgr := newTestManager(t, st, nil, rec.record, withWatcher(watcher))
	sess := createLaunchedSession(t, mgr, st, t.TempDir())

	_, err := mgr.Apply(ctx, sess.ID, "claude-old", nil, claudecode.StateInput{Kind: claudecode.KindBind}, true)
	require.NoError(t, err)
	_, err = mgr.Apply(ctx, sess.ID, "claude-new", nil, claudecode.StateInput{Kind: claudecode.KindClearRebind}, true)
	require.NoError(t, err)
	_, err = mgr.Apply(ctx, sess.ID, "claude-new", nil, claudecode.StateInput{Kind: claudecode.KindTurnActivity}, true)
	require.NoError(t, err)
	watcher.setWatched(sess.ID, false)

	final, err := mgr.Apply(ctx, sess.ID, "claude-old", nil, claudecode.StateInput{Kind: claudecode.KindTurnClosed}, true)
	require.NoError(t, err)

	assert.Equal(t, "claude-new", final.ClaudeSessionID, "the straggler must not rebind backwards")
	assert.Equal(t, StateIdle, final.State, "a turn_closed straggler still applies its own transition")
	assert.True(t, final.Unread, "unwatched: a straggler turn_closed still sets Unread like any other")

	persisted, err := st.GetSession(ctx, sess.ID)
	require.NoError(t, err)
	assert.True(t, persisted.Unread)
}

// TestManager_MarkSeen covers D8: clearing Unread persists and broadcasts exactly once
// when it was true, and is a true no-op (no broadcast — MarkSeen returns before ever
// reaching the store write, manager.go) when the session was already read; an unknown id
// returns ErrUnknownSession.
func TestManager_MarkSeen(t *testing.T) {
	t.Run("clears Unread, persists and broadcasts once", func(t *testing.T) {
		st := openTestStore(t)
		rec := &upsertsRecorder{}
		watcher := newFakeWatcher()
		mgr := newTestManager(t, st, nil, rec.record, withWatcher(watcher))
		sess := createLaunchedSession(t, mgr, st, t.TempDir())
		_, err := mgr.Apply(context.Background(), sess.ID, "claude-1", nil, claudecode.StateInput{Kind: claudecode.KindBind}, true)
		require.NoError(t, err)
		_, err = mgr.Apply(context.Background(), sess.ID, "claude-1", nil, claudecode.StateInput{Kind: claudecode.KindTurnClosed}, true)
		require.NoError(t, err)
		got, ok := mgr.Get(sess.ID)
		require.True(t, ok)
		require.True(t, got.Unread, "sanity: unwatched turn_closed set Unread")
		broadcastsBefore := len(rec.all())

		err = mgr.MarkSeen(context.Background(), sess.ID)
		require.NoError(t, err)

		got, ok = mgr.Get(sess.ID)
		require.True(t, ok)
		assert.False(t, got.Unread)
		assert.Len(t, rec.all(), broadcastsBefore+1, "D8: exactly one broadcast")
		persisted, perr := st.GetSession(context.Background(), sess.ID)
		require.NoError(t, perr)
		assert.False(t, persisted.Unread)
	})

	t.Run("already-read session: no broadcast", func(t *testing.T) {
		st := openTestStore(t)
		rec := &upsertsRecorder{}
		mgr := newTestManager(t, st, nil, rec.record)
		sess := createLaunchedSession(t, mgr, st, t.TempDir())
		broadcastsBefore := len(rec.all())

		err := mgr.MarkSeen(context.Background(), sess.ID)
		require.NoError(t, err)

		assert.Len(t, rec.all(), broadcastsBefore, "D8: an already-read session's MarkSeen must not broadcast")
	})

	t.Run("unknown session returns ErrUnknownSession", func(t *testing.T) {
		st := openTestStore(t)
		mgr := newTestManager(t, st, nil, nil)

		err := mgr.MarkSeen(context.Background(), 999)

		assert.ErrorIs(t, err, ErrUnknownSession)
	})
}

// TestReconcile_LeavesUnreadAndLastPromptUntouchedAcrossRowClasses covers D10: neither
// field is ever read or written by Reconcile, for a row it keeps alive (pane still
// exists) and for a row it marks ended (pane gone) — the two row classes Reconcile still
// holds a row for afterward (the third, sweep, deletes the row entirely, so "untouched"
// does not apply to it).
func TestReconcile_LeavesUnreadAndLastPromptUntouchedAcrossRowClasses(t *testing.T) {
	st := openTestStore(t)
	ctx := context.Background()
	dir := t.TempDir()
	repoID := seedRepo(t, st, dir)
	params := createParams(dir)
	params.RepoID = repoID
	prompt := "a prompt that must survive reconcile"

	seed := newTestManager(t, st, nil, nil)
	keptAliveSess, err := seed.CreateSession(ctx, params)
	require.NoError(t, err)
	_, err = seed.RecordLaunch(ctx, keptAliveSess.ID, "muster-keptalive:@1", "%1")
	require.NoError(t, err)
	keptAliveRow, err := st.GetSession(ctx, keptAliveSess.ID)
	require.NoError(t, err)
	keptAliveRow.Unread = true
	keptAliveRow.LastPrompt = &prompt
	require.NoError(t, st.UpdateSession(ctx, keptAliveRow))

	markedEndedSess, err := seed.CreateSession(ctx, params)
	require.NoError(t, err)
	_, err = seed.RecordLaunch(ctx, markedEndedSess.ID, "muster-markedended:@1", "%1")
	require.NoError(t, err)
	markedEndedRow, err := st.GetSession(ctx, markedEndedSess.ID)
	require.NoError(t, err)
	markedEndedRow.Unread = true
	markedEndedRow.LastPrompt = &prompt
	require.NoError(t, st.UpdateSession(ctx, markedEndedRow))

	// Ownership classification goes by ListSessions name, not PaneChecker — only
	// keptAlive's real muster-<id> name is listed as present.
	killer := newFakeTmuxSessions(tmux.SessionName(keptAliveSess.ID))
	mgr := newTestManager(t, st, nil, nil, withTmuxSessions(killer))
	require.NoError(t, mgr.LoadAll(ctx))

	_ = mgr.Reconcile(ctx)

	got, ok := mgr.Get(keptAliveSess.ID)
	require.True(t, ok)
	assert.True(t, got.Alive, "sanity: this row's pane still exists")
	assert.True(t, got.Unread, "D10: a kept-alive row's Unread must be untouched by Reconcile")
	require.NotNil(t, got.LastPrompt)
	assert.Equal(t, prompt, *got.LastPrompt)

	got2, ok2 := mgr.Get(markedEndedSess.ID)
	require.True(t, ok2)
	assert.False(t, got2.Alive, "sanity: this row was marked ended")
	assert.True(t, got2.Unread, "D10: a marked-ended row's Unread must be untouched by Reconcile")
	require.NotNil(t, got2.LastPrompt)
	assert.Equal(t, prompt, *got2.LastPrompt)

	persisted1, perr := st.GetSession(ctx, keptAliveSess.ID)
	require.NoError(t, perr)
	assert.True(t, persisted1.Unread)
	require.NotNil(t, persisted1.LastPrompt)
	assert.Equal(t, prompt, *persisted1.LastPrompt)

	persisted2, perr2 := st.GetSession(ctx, markedEndedSess.ID)
	require.NoError(t, perr2)
	assert.True(t, persisted2.Unread)
	require.NotNil(t, persisted2.LastPrompt)
	assert.Equal(t, prompt, *persisted2.LastPrompt)
}
