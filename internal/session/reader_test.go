package session

import (
	"context"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/Zalaras/muster/internal/claudecode"
)

// bindClaude binds sess to claudeID via the same enveloped-bind path a real SessionStart
// takes (mirrors title_test.go's "SessionStart bind" subtest) — the shortest route to a
// session whose ClaudeSessionID a SetTranscript/SetPlan call can be checked against.
func bindClaude(t *testing.T, mgr *Manager, id int64, claudeID string) {
	t.Helper()
	_, err := mgr.Apply(context.Background(), id, claudeID, nil, claudecode.StateInput{Kind: claudecode.KindBind}, true)
	require.NoError(t, err)
}

// TestSetTranscript_PersistsOnlyOnChangeAndNeverBroadcasts covers D15: a real change
// persists (visible on reload through the store) and reports changed=true; reapplying
// the same path is a no-op (changed=false); across every call here, zero broadcasts
// reach OnUpsert — every hook carries transcript_path, and a no-op upsert per hook would
// double the ingest worker's SQLite traffic.
func TestSetTranscript_PersistsOnlyOnChangeAndNeverBroadcasts(t *testing.T) {
	st := openTestStore(t)
	rec := &upsertsRecorder{}
	mgr := newTestManager(t, st, nil, rec.record)
	ctx := context.Background()
	sess := createLaunchedSession(t, mgr, st, t.TempDir())
	bindClaude(t, mgr, sess.ID, "claude-1")
	before := len(rec.all()) // createLaunchedSession + bindClaude each broadcast once themselves

	changed, err := mgr.SetTranscript(ctx, sess.ID, "claude-1", "/tmp/t1.jsonl")
	require.NoError(t, err)
	assert.True(t, changed, "a genuinely new path must report changed")

	got, ok := mgr.Get(sess.ID)
	require.True(t, ok)
	assert.Equal(t, "/tmp/t1.jsonl", got.TranscriptPath)

	changed, err = mgr.SetTranscript(ctx, sess.ID, "claude-1", "/tmp/t1.jsonl")
	require.NoError(t, err)
	assert.False(t, changed, "reapplying the same path must be a no-op")

	changed, err = mgr.SetTranscript(ctx, sess.ID, "claude-1", "/tmp/t2.jsonl")
	require.NoError(t, err)
	assert.True(t, changed, "a second, different path must again report changed")
	got, ok = mgr.Get(sess.ID)
	require.True(t, ok)
	assert.Equal(t, "/tmp/t2.jsonl", got.TranscriptPath)

	assert.Len(t, rec.all(), before, "SetTranscript must never broadcast, changed or not")
}

// TestSetTranscript_RefusesWhenClaudeSessionIDDoesNotMatchCurrentBinding covers
// REQ-26/INV-8's transcript half: a straggler naming an id the session has already left
// must never move transcript_file — the correct id still works afterward.
func TestSetTranscript_RefusesWhenClaudeSessionIDDoesNotMatchCurrentBinding(t *testing.T) {
	st := openTestStore(t)
	mgr := newTestManager(t, st, nil, nil)
	ctx := context.Background()
	sess := createLaunchedSession(t, mgr, st, t.TempDir())
	bindClaude(t, mgr, sess.ID, "claude-B")

	changed, err := mgr.SetTranscript(ctx, sess.ID, "claude-A", "/tmp/stale.jsonl")
	require.NoError(t, err)
	assert.False(t, changed, "a mismatched claudeSessionID must never move the transcript")

	got, ok := mgr.Get(sess.ID)
	require.True(t, ok)
	assert.Empty(t, got.TranscriptPath, "the stale write must leave the transcript untouched")

	changed, err = mgr.SetTranscript(ctx, sess.ID, "claude-B", "/tmp/current.jsonl")
	require.NoError(t, err)
	assert.True(t, changed, "the current binding must still be able to set the transcript")
	got, ok = mgr.Get(sess.ID)
	require.True(t, ok)
	assert.Equal(t, "/tmp/current.jsonl", got.TranscriptPath)
}

func TestSetTranscript_UnknownSessionReturnsErrUnknownSession(t *testing.T) {
	st := openTestStore(t)
	mgr := newTestManager(t, st, nil, nil)

	_, err := mgr.SetTranscript(context.Background(), 999999, "claude-1", "/tmp/t.jsonl")

	assert.ErrorIs(t, err, ErrUnknownSession)
}

// TestSetPlan_BroadcastsOnlyOnARealChange mirrors title_test.go's SetTitle broadcast
// test for the plan's own persist+broadcast pair.
func TestSetPlan_BroadcastsOnlyOnARealChange(t *testing.T) {
	t.Run("nil to a resolved plan: one broadcast, changed=true", func(t *testing.T) {
		st := openTestStore(t)
		rec := &upsertsRecorder{}
		mgr := newTestManager(t, st, nil, rec.record)
		ctx := context.Background()
		sess := createLaunchedSession(t, mgr, st, t.TempDir())
		bindClaude(t, mgr, sess.ID, "claude-1")
		before := len(rec.all())

		final, changed, err := mgr.SetPlan(ctx, sess.ID, "claude-1", "/plans/happy-otter.md", false)
		require.NoError(t, err)

		assert.True(t, changed)
		assert.Len(t, rec.all(), before+1)
		assert.Equal(t, "/plans/happy-otter.md", final.PlanPath)
		assert.False(t, final.PlanExists)
	})

	t.Run("exists flips from false to true: one broadcast, changed=true", func(t *testing.T) {
		st := openTestStore(t)
		rec := &upsertsRecorder{}
		mgr := newTestManager(t, st, nil, rec.record)
		ctx := context.Background()
		sess := createLaunchedSession(t, mgr, st, t.TempDir())
		bindClaude(t, mgr, sess.ID, "claude-1")
		_, _, err := mgr.SetPlan(ctx, sess.ID, "claude-1", "/plans/happy-otter.md", false)
		require.NoError(t, err)
		before := len(rec.all())

		final, changed, err := mgr.SetPlan(ctx, sess.ID, "claude-1", "/plans/happy-otter.md", true)
		require.NoError(t, err)

		assert.True(t, changed)
		assert.Len(t, rec.all(), before+1)
		assert.True(t, final.PlanExists)
	})

	t.Run("reapplying the same path and exists is a no-op: zero broadcasts, changed=false", func(t *testing.T) {
		st := openTestStore(t)
		rec := &upsertsRecorder{}
		mgr := newTestManager(t, st, nil, rec.record)
		ctx := context.Background()
		sess := createLaunchedSession(t, mgr, st, t.TempDir())
		bindClaude(t, mgr, sess.ID, "claude-1")
		_, _, err := mgr.SetPlan(ctx, sess.ID, "claude-1", "/plans/happy-otter.md", true)
		require.NoError(t, err)
		before := len(rec.all())

		final, changed, err := mgr.SetPlan(ctx, sess.ID, "claude-1", "/plans/happy-otter.md", true)
		require.NoError(t, err)

		assert.False(t, changed)
		assert.Len(t, rec.all(), before, "a no-op SetPlan must never broadcast")
		assert.Equal(t, "/plans/happy-otter.md", final.PlanPath, "the unchanged snapshot must still be returned")
	})
}

// TestSetPlan_RefusesWhenClaudeSessionIDDoesNotMatchCurrentBinding covers
// REQ-26/INV-8's plan half: a straggler's scan result must never move the plan — the
// existing plan (and its snapshot) survives untouched, with no broadcast.
func TestSetPlan_RefusesWhenClaudeSessionIDDoesNotMatchCurrentBinding(t *testing.T) {
	st := openTestStore(t)
	rec := &upsertsRecorder{}
	mgr := newTestManager(t, st, nil, rec.record)
	ctx := context.Background()
	sess := createLaunchedSession(t, mgr, st, t.TempDir())
	bindClaude(t, mgr, sess.ID, "claude-B")
	_, _, err := mgr.SetPlan(ctx, sess.ID, "claude-B", "/plans/existing.md", true)
	require.NoError(t, err)
	before := len(rec.all())

	final, changed, err := mgr.SetPlan(ctx, sess.ID, "claude-A", "/plans/stale.md", true)
	require.NoError(t, err)

	assert.False(t, changed)
	assert.Len(t, rec.all(), before, "a straggler's scan must never broadcast")
	assert.Equal(t, "/plans/existing.md", final.PlanPath, "the straggler must never move the plan")

	got, ok := mgr.Get(sess.ID)
	require.True(t, ok)
	assert.Equal(t, "/plans/existing.md", got.PlanPath)
}

func TestSetPlan_UnknownSessionReturnsErrUnknownSession(t *testing.T) {
	st := openTestStore(t)
	mgr := newTestManager(t, st, nil, nil)

	_, _, err := mgr.SetPlan(context.Background(), 999999, "claude-1", "/plans/x.md", true)

	assert.ErrorIs(t, err, ErrUnknownSession)
}

// TestReaderFields_RoundTripThroughLoadAll covers D14: transcript_file, plan_path and
// plan_exists survive a daemon restart (a fresh Manager loading the same store), the
// session-package twin of the store package's own TestUpdateSession_ReaderFieldsRoundTrip.
func TestReaderFields_RoundTripThroughLoadAll(t *testing.T) {
	st := openTestStore(t)
	dir := t.TempDir()

	mgr1 := newTestManager(t, st, nil, nil)
	sess := createLaunchedSession(t, mgr1, st, dir)
	bindClaude(t, mgr1, sess.ID, "claude-9")
	_, err := mgr1.SetTranscript(context.Background(), sess.ID, "claude-9", "/tmp/t.jsonl")
	require.NoError(t, err)
	_, _, err = mgr1.SetPlan(context.Background(), sess.ID, "claude-9", "/plans/happy-otter.md", true)
	require.NoError(t, err)

	mgr2 := newTestManager(t, st, nil, nil)
	require.NoError(t, mgr2.LoadAll(context.Background()))

	got, ok := mgr2.Get(sess.ID)
	require.True(t, ok)
	assert.Equal(t, "/tmp/t.jsonl", got.TranscriptPath)
	assert.Equal(t, "/plans/happy-otter.md", got.PlanPath)
	assert.True(t, got.PlanExists)
}
