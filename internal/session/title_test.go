package session

import (
	"context"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/Zalaras/muster/internal/claudecode"
)

// assertINV1Holds asserts kb:anchor/ws.session / plan ui-text-and-focus INV-1: whenever
// titleOverride is non-nil, the wire title (DisplayTitle()) equals it exactly.
func assertINV1Holds(t *testing.T, sess *Session, wantOverride string) {
	t.Helper()
	require.NotNil(t, sess.TitleOverride, "INV-1: the override must survive this operation")
	assert.Equal(t, wantOverride, *sess.TitleOverride)
	require.NotNil(t, sess.DisplayTitle(), "INV-1: title == titleOverride whenever titleOverride != null")
	assert.Equal(t, wantOverride, *sess.DisplayTitle())
}

// TestTitleOverride_INV1_SurvivesEverySourceState covers D5: INV-1 ("title ==
// titleOverride whenever titleOverride != null") must hold after every source state the
// Invariants section lists — a rebind, a resume, a status post (with or without a new
// Claude-provided name), the liveness sweep, a daemon restart, and the PUT itself. Per the
// m2-terminal retro lesson, each of these is its own subtest against a session that
// already carries an override, rather than one path lightly touched in passing.
func TestTitleOverride_INV1_SurvivesEverySourceState(t *testing.T) {
	const overrideStr = "My Override"

	t.Run("launch (RecordLaunch after the override was set pre-launch)", func(t *testing.T) {
		st := openTestStore(t)
		mgr := newTestManager(t, st, nil, nil)
		ctx := context.Background()
		dir := t.TempDir()
		params := createParams(dir)
		params.RepoID = seedRepo(t, st, dir)
		sess, err := mgr.CreateSession(ctx, params)
		require.NoError(t, err)
		_, err = mgr.SetTitle(ctx, sess.ID, strPtr(overrideStr))
		require.NoError(t, err)

		final, err := mgr.RecordLaunch(ctx, sess.ID, "muster-inv1-launch:@1", "%1")
		require.NoError(t, err)

		assertINV1Holds(t, final, overrideStr)
	})

	t.Run("SessionStart bind", func(t *testing.T) {
		st := openTestStore(t)
		mgr := newTestManager(t, st, nil, nil)
		ctx := context.Background()
		sess := createLaunchedSession(t, mgr, st, t.TempDir())
		_, err := mgr.SetTitle(ctx, sess.ID, strPtr(overrideStr))
		require.NoError(t, err)

		final, err := mgr.Apply(ctx, sess.ID, "claude-1", nil, claudecode.StateInput{Kind: claudecode.KindBind}, true)
		require.NoError(t, err)

		assertINV1Holds(t, final, overrideStr)
	})

	t.Run("/clear rebind", func(t *testing.T) {
		st := openTestStore(t)
		mgr := newTestManager(t, st, nil, nil)
		ctx := context.Background()
		sess := createLaunchedSession(t, mgr, st, t.TempDir())
		_, err := mgr.Apply(ctx, sess.ID, "claude-old", nil, claudecode.StateInput{Kind: claudecode.KindBind}, true)
		require.NoError(t, err)
		_, err = mgr.SetTitle(ctx, sess.ID, strPtr(overrideStr))
		require.NoError(t, err)

		final, err := mgr.Apply(ctx, sess.ID, "claude-new", nil, claudecode.StateInput{Kind: claudecode.KindClearRebind}, true)
		require.NoError(t, err)

		assertINV1Holds(t, final, overrideStr)
	})

	t.Run("resume rebind (same claude id, via RecordResume + KindResumeBind)", func(t *testing.T) {
		st := openTestStore(t)
		mgr := newTestManager(t, st, nil, nil)
		ctx := context.Background()
		sess := createLaunchedSession(t, mgr, st, t.TempDir())
		_, err := mgr.Apply(ctx, sess.ID, "claude-1", nil, claudecode.StateInput{Kind: claudecode.KindBind}, true)
		require.NoError(t, err)
		_, err = mgr.SetTitle(ctx, sess.ID, strPtr(overrideStr))
		require.NoError(t, err)
		_, err = mgr.RecordResume(ctx, sess.ID, "muster-inv1-resume:@2", "%2")
		require.NoError(t, err)

		final, err := mgr.Apply(ctx, sess.ID, "claude-1", nil, claudecode.StateInput{Kind: claudecode.KindResumeBind}, true)
		require.NoError(t, err)
		require.Equal(t, StateIdle, final.State, "sanity: a same-id resume bind lands idle, not a clear-rebind")

		assertINV1Holds(t, final, overrideStr)
	})

	t.Run("status post carrying a different session_name", func(t *testing.T) {
		st := openTestStore(t)
		mgr := newTestManager(t, st, nil, nil)
		ctx := context.Background()
		sess := createLaunchedSession(t, mgr, st, t.TempDir())
		_, err := mgr.SetTitle(ctx, sess.ID, strPtr(overrideStr))
		require.NoError(t, err)

		claudeName := "Claude's Own Name"
		final, err := mgr.ApplyStatus(ctx, sess.ID, claudecode.StatusUpdate{Title: &claudeName})
		require.NoError(t, err)

		assertINV1Holds(t, final, overrideStr)
	})

	t.Run("status post carrying no session_name", func(t *testing.T) {
		st := openTestStore(t)
		mgr := newTestManager(t, st, nil, nil)
		ctx := context.Background()
		sess := createLaunchedSession(t, mgr, st, t.TempDir())
		_, err := mgr.SetTitle(ctx, sess.ID, strPtr(overrideStr))
		require.NoError(t, err)

		final, err := mgr.ApplyStatus(ctx, sess.ID, claudecode.StatusUpdate{
			Context: &claudecode.StatusContext{UsedPct: 10, TotalInputTokens: 1000, WindowSize: 200000},
		})
		require.NoError(t, err)

		assertINV1Holds(t, final, overrideStr)
	})

	t.Run("the liveness sweep marking the session dead", func(t *testing.T) {
		st := openTestStore(t)
		pc := newFakePaneChecker()
		mgr := newTestManager(t, st, pc, nil)
		ctx := context.Background()
		sess := createLaunchedSession(t, mgr, st, t.TempDir())
		_, err := mgr.SetTitle(ctx, sess.ID, strPtr(overrideStr))
		require.NoError(t, err)
		pc.setExists(sess.TmuxTarget, false)

		mgr.checkLiveness(ctx)

		final, ok := mgr.Get(sess.ID)
		require.True(t, ok)
		require.False(t, final.Alive, "sanity: the sweep actually marked this session dead")
		assertINV1Holds(t, final, overrideStr)
	})

	t.Run("daemon restart (row reload)", func(t *testing.T) {
		st := openTestStore(t)
		mgr1 := newTestManager(t, st, nil, nil)
		ctx := context.Background()
		sess := createLaunchedSession(t, mgr1, st, t.TempDir())
		_, err := mgr1.SetTitle(ctx, sess.ID, strPtr(overrideStr))
		require.NoError(t, err)

		mgr2 := newTestManager(t, st, nil, nil)
		require.NoError(t, mgr2.LoadAll(ctx))

		final, ok := mgr2.Get(sess.ID)
		require.True(t, ok)
		assertINV1Holds(t, final, overrideStr)
	})

	t.Run("PUT .../title itself", func(t *testing.T) {
		st := openTestStore(t)
		mgr := newTestManager(t, st, nil, nil)
		ctx := context.Background()
		sess := createLaunchedSession(t, mgr, st, t.TempDir())

		final, err := mgr.SetTitle(ctx, sess.ID, strPtr(overrideStr))
		require.NoError(t, err)
		assert.True(t, final)

		got, ok := mgr.Get(sess.ID)
		require.True(t, ok)
		assertINV1Holds(t, got, overrideStr)
	})
}

// TestApplyStatusUpdate_NeverTouchesTitleOverride covers D6/INV-2: applyStatusUpdate has
// no path to TitleOverride at all — a status post carrying a session_name (or not) leaves
// it bit-identical from every one of the six displayed states, plus a dead session. Reuses
// status_test.go's baselineForState/fullStatusUpdate helpers (same package), extended with
// an override, so this doesn't duplicate that file's own state coverage.
func TestApplyStatusUpdate_NeverTouchesTitleOverride(t *testing.T) {
	states := []State{StateStarted, StatePlanning, StateWorking, StateNeedsInput, StateFailed, StateIdle}
	const overrideStr = "Never Touched"

	for _, state := range states {
		t.Run(string(state), func(t *testing.T) {
			sess := baselineForState(state)
			sess.TitleOverride = strPtr(overrideStr)

			applyStatusUpdate(sess, fullStatusUpdate())

			require.NotNil(t, sess.TitleOverride, "INV-2: a status post must never clear the override")
			assert.Equal(t, overrideStr, *sess.TitleOverride)
		})
	}

	t.Run("dead session (alive:false)", func(t *testing.T) {
		sess := baselineForState(StateIdle)
		sess.Alive = false
		sess.TitleOverride = strPtr(overrideStr)

		applyStatusUpdate(sess, fullStatusUpdate())

		require.NotNil(t, sess.TitleOverride)
		assert.Equal(t, overrideStr, *sess.TitleOverride)
	})
}

// TestSetTitle_BroadcastsOnceOnARealChangeZeroOnEdgeCases3And4 covers D7: SetTitle
// broadcasts (and reports changed=true) exactly once per real change, and neither
// persists-with-broadcast nor reports changed for edge cases 3 (clear when no override
// exists) and 4 (set to the same string as the current override).
func TestSetTitle_BroadcastsOnceOnARealChangeZeroOnEdgeCases3And4(t *testing.T) {
	t.Run("nil to a new override: one broadcast, changed=true", func(t *testing.T) {
		st := openTestStore(t)
		rec := &upsertsRecorder{}
		mgr := newTestManager(t, st, nil, rec.record)
		ctx := context.Background()
		sess := createLaunchedSession(t, mgr, st, t.TempDir())
		before := len(rec.all())

		changed, err := mgr.SetTitle(ctx, sess.ID, strPtr("New Title"))
		require.NoError(t, err)

		assert.True(t, changed)
		assert.Len(t, rec.all(), before+1)
		final, ok := mgr.Get(sess.ID)
		require.True(t, ok)
		require.NotNil(t, final.DisplayTitle())
		assert.Equal(t, "New Title", *final.DisplayTitle())
	})

	t.Run("edge case 3: clear when no override exists — zero broadcasts, changed=false", func(t *testing.T) {
		st := openTestStore(t)
		rec := &upsertsRecorder{}
		mgr := newTestManager(t, st, nil, rec.record)
		ctx := context.Background()
		sess := createLaunchedSession(t, mgr, st, t.TempDir())
		before := len(rec.all())

		changed, err := mgr.SetTitle(ctx, sess.ID, nil)
		require.NoError(t, err)

		assert.False(t, changed)
		assert.Len(t, rec.all(), before)
	})

	t.Run("edge case 4: set to the same string as the current override — zero broadcasts, changed=false", func(t *testing.T) {
		st := openTestStore(t)
		rec := &upsertsRecorder{}
		mgr := newTestManager(t, st, nil, rec.record)
		ctx := context.Background()
		sess := createLaunchedSession(t, mgr, st, t.TempDir())
		_, err := mgr.SetTitle(ctx, sess.ID, strPtr("Same"))
		require.NoError(t, err)
		before := len(rec.all())

		changed, err := mgr.SetTitle(ctx, sess.ID, strPtr("Same"))
		require.NoError(t, err)

		assert.False(t, changed)
		assert.Len(t, rec.all(), before)
	})

	t.Run("clearing an existing override: one broadcast, changed=true, falls back to Claude's name", func(t *testing.T) {
		st := openTestStore(t)
		rec := &upsertsRecorder{}
		mgr := newTestManager(t, st, nil, rec.record)
		ctx := context.Background()
		sess := createLaunchedSession(t, mgr, st, t.TempDir())
		claudeName := "Claude's Name"
		_, err := mgr.ApplyStatus(ctx, sess.ID, claudecode.StatusUpdate{Title: &claudeName})
		require.NoError(t, err)
		_, err = mgr.SetTitle(ctx, sess.ID, strPtr("Overridden"))
		require.NoError(t, err)
		before := len(rec.all())

		changed, err := mgr.SetTitle(ctx, sess.ID, nil)
		require.NoError(t, err)

		assert.True(t, changed)
		assert.Len(t, rec.all(), before+1)
		final, ok := mgr.Get(sess.ID)
		require.True(t, ok)
		assert.Nil(t, final.TitleOverride)
		require.NotNil(t, final.DisplayTitle())
		assert.Equal(t, claudeName, *final.DisplayTitle())
	})

	t.Run("edge case 5: set to a string equal to Claude's current name while no override exists still broadcasts", func(t *testing.T) {
		st := openTestStore(t)
		rec := &upsertsRecorder{}
		mgr := newTestManager(t, st, nil, rec.record)
		ctx := context.Background()
		sess := createLaunchedSession(t, mgr, st, t.TempDir())
		claudeName := "Same As Claude"
		_, err := mgr.ApplyStatus(ctx, sess.ID, claudecode.StatusUpdate{Title: &claudeName})
		require.NoError(t, err)
		before := len(rec.all())

		changed, err := mgr.SetTitle(ctx, sess.ID, strPtr(claudeName))
		require.NoError(t, err)

		assert.True(t, changed, "titleOverride itself changed (nil -> non-nil) even though the wire title text did not")
		assert.Len(t, rec.all(), before+1)
		final, ok := mgr.Get(sess.ID)
		require.True(t, ok)
		require.NotNil(t, final.TitleOverride)
		assert.Equal(t, claudeName, *final.TitleOverride)
	})

	t.Run("unknown session id returns ErrUnknownSession and never broadcasts", func(t *testing.T) {
		st := openTestStore(t)
		rec := &upsertsRecorder{}
		mgr := newTestManager(t, st, nil, rec.record)

		_, err := mgr.SetTitle(context.Background(), 999999, strPtr("X"))

		assert.ErrorIs(t, err, ErrUnknownSession)
		assert.Empty(t, rec.all())
	})
}

// TestApplyStatus_OverrideSetAndClaudeNameChanges_PersistsButDoesNotBroadcast covers D10/
// REQ-12: while an override is set, a status post that changes only Claude's last-known
// name (the wire title is unaffected, since the override still wins) persists the row but
// broadcasts nothing — the wire object is unchanged, so kb:anchor/ws.session's no-no-op-upserts rule
// stands.
func TestApplyStatus_OverrideSetAndClaudeNameChanges_PersistsButDoesNotBroadcast(t *testing.T) {
	st := openTestStore(t)
	rec := &upsertsRecorder{}
	mgr := newTestManager(t, st, nil, rec.record)
	ctx := context.Background()
	sess := createLaunchedSession(t, mgr, st, t.TempDir())
	firstName := "First Claude Name"
	_, err := mgr.ApplyStatus(ctx, sess.ID, claudecode.StatusUpdate{Title: &firstName})
	require.NoError(t, err)
	_, err = mgr.SetTitle(ctx, sess.ID, strPtr("User's Override"))
	require.NoError(t, err)
	before := len(rec.all())

	newClaudeName := "Second Claude Name"
	final, err := mgr.ApplyStatus(ctx, sess.ID, claudecode.StatusUpdate{Title: &newClaudeName})
	require.NoError(t, err)

	// The row persisted the new Claude-name (Title column) even though nothing broadcast.
	require.NotNil(t, final.Title)
	assert.Equal(t, "Second Claude Name", *final.Title)
	require.NotNil(t, final.DisplayTitle())
	assert.Equal(t, "User's Override", *final.DisplayTitle(), "the override still wins on the wire")

	assert.Len(t, rec.all(), before, "REQ-12: a Claude-name-only change behind an override must not broadcast")

	persisted, err := st.GetSession(ctx, sess.ID)
	require.NoError(t, err)
	require.NotNil(t, persisted.Title)
	assert.Equal(t, "Second Claude Name", *persisted.Title, "REQ-12: the row is still persisted even though it isn't broadcast")
}
