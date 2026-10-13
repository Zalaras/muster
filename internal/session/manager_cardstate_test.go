package session

import (
	"context"
	"strconv"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/Zalaras/muster/internal/claudecode"
)

// TestApply_CardStateUnread covers the manager half of REQ-2 and REQ-8: Apply sets unread
// only when the input actually ended a turn into idle, from the watcher's answer at that
// moment, and the inputs that change nothing (a no-op idle_prompt, a stale compact
// SessionStart, an idle_prompt a permission wait survives) never set it.
func TestApply_CardStateUnread(t *testing.T) {
	tests := []struct {
		name       string
		from       State
		sequence   []claudecode.StateInput // applied before the input under test, on prompts[i]
		prompts    []string
		in         claudecode.StateInput
		prompt     string
		watched    bool
		wantState  State
		wantUnread bool
	}{
		{"idle_prompt ends a working turn, no client attached", StateWorking, nil, nil, idleNotice(), "p-1", false, StateIdle, true},
		{"idle_prompt ends a working turn, a client attached", StateWorking, nil, nil, idleNotice(), "p-1", true, StateIdle, false},
		{"idle_prompt ends a planning turn, no client attached", StatePlanning, nil, nil, idleNotice(), "p-1", false, StateIdle, true},
		{"idle_prompt on an idle card for an unseen id is a no-op", StateIdle, nil, nil, idleNotice(), "p-9", false, StateIdle, false},
		{"idle_prompt on a failed card changes nothing", StateFailed, nil, nil, idleNotice(), "p-9", false, StateFailed, false},
		{"idle_prompt on a started card changes nothing", StateStarted, nil, nil, idleNotice(), "p-9", false, StateStarted, false},
		{"idle_prompt keeps a permission wait", StateNeedsInput, nil, nil, idleNotice(), "p-1", false, StateNeedsInput, false},
		{
			"compact SessionStart on its own prompt, no client attached", StateIdle,
			[]claudecode.StateInput{compactionBegan()}, []string{"pc"}, compactionEnded(), "pc", false, StateIdle, true,
		},
		{
			"compact SessionStart on its own prompt, a client attached", StateIdle,
			[]claudecode.StateInput{compactionBegan()}, []string{"pc"}, compactionEnded(), "pc", true, StateIdle, false,
		},
		{"compact SessionStart with a lost PreCompact is a no-op", StateIdle, nil, nil, compactionEnded(), "pc", false, StateIdle, false},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			st := openTestStore(t)
			rec := &upsertsRecorder{}
			watcher := newFakeWatcher()
			mgr := newTestManager(t, st, nil, rec.record, withWatcher(watcher))
			sess := driveTo(t, mgr, st, tt.from)
			mgr.mu.Lock()
			mgr.sessions[sess.ID].Unread = false
			mgr.mu.Unlock()
			for i, in := range tt.sequence {
				_, err := mgr.Apply(context.Background(), sess.ID, sess.ClaudeSessionID, &tt.prompts[i], in, true)
				require.NoError(t, err)
			}
			watcher.setWatched(sess.ID, tt.watched)
			broadcasts := len(rec.all())

			got, err := mgr.Apply(context.Background(), sess.ID, sess.ClaudeSessionID, &tt.prompt, tt.in, true)

			require.NoError(t, err)
			assert.Equal(t, tt.wantState, got.State)
			assert.Equal(t, tt.wantUnread, got.Unread)
			assert.True(t, !got.Unread || got.State == StateIdle, "INV-D: unread implies idle")
			assert.Len(t, rec.all(), broadcasts+1, "exactly one broadcast")
			persisted, err := st.GetSession(context.Background(), sess.ID)
			require.NoError(t, err)
			assert.Equal(t, string(tt.wantState), persisted.State)
			assert.Equal(t, tt.wantUnread, persisted.Unread, "unread is persisted")
		})
	}
}

// TestApply_CompactionStateThroughTheManager drives a whole compaction through Apply from
// the measured payload shapes: PreCompact reads working and persists, the compact
// SessionStart lands idle, and two sessions compacting at once under the same prompt id do
// not touch each other.
func TestApply_CompactionStateThroughTheManager(t *testing.T) {
	st := openTestStore(t)
	mgr := newTestManager(t, st, nil, nil)
	a := driveTo(t, mgr, st, StateIdle)
	b := driveTo(t, mgr, st, StateIdle)
	pc := compactionPrompt

	preCompact := claudecode.Interpret("PreCompact", []byte(`{"hook_event_name":"PreCompact","session_id":"x","prompt_id":"pc","trigger":"manual"}`))
	sessionStart := claudecode.Interpret("SessionStart", []byte(`{"hook_event_name":"SessionStart","session_id":"x","source":"compact"}`))
	require.Equal(t, claudecode.KindCompactionBegan, preCompact.Kind)
	require.Equal(t, claudecode.KindCompactionEnded, sessionStart.Kind)

	for _, s := range []*Session{a, b} {
		got, err := mgr.Apply(context.Background(), s.ID, s.ClaudeSessionID, &pc, preCompact, true)
		require.NoError(t, err)
		require.Equal(t, StateWorking, got.State)
		assert.Equal(t, 1, got.Compactions)
		persisted, err := st.GetSession(context.Background(), s.ID)
		require.NoError(t, err)
		assert.Equal(t, string(StateWorking), persisted.State, "the compaction's working state is persisted")
	}

	got, err := mgr.Apply(context.Background(), a.ID, a.ClaudeSessionID, &pc, sessionStart, true)

	require.NoError(t, err)
	assert.Equal(t, StateIdle, got.State)
	assert.Equal(t, a.ClaudeSessionID, got.ClaudeSessionID, "the same session_id keeps the binding")
	assert.Equal(t, StateWorking, mustGet(t, mgr, b.ID).State, "the other session's compaction is untouched")
	assert.Equal(t, 1, mustGet(t, mgr, b.ID).Compactions)

	got, err = mgr.Apply(context.Background(), b.ID, b.ClaudeSessionID, &pc, sessionStart, true)
	require.NoError(t, err)
	assert.Equal(t, StateIdle, got.State)
	assert.Equal(t, StateIdle, mustGet(t, mgr, a.ID).State)
}

// TestApply_CompactionEndedBinding covers REQ-9's binding half through the enveloped path,
// where the compact SessionStart is not a binder and goes through Apply's envelope guard: a
// never-bound session binds on it with no transition; a different session_id is the
// clear-rebind, applied once, with the reverse index following and the counters reset.
func TestApply_CompactionEndedBinding(t *testing.T) {

	t.Run("a never-bound session binds and keeps its state", func(t *testing.T) {
		st := openTestStore(t)
		mgr := newTestManager(t, st, nil, nil)
		sess := createLaunchedSession(t, mgr, st, t.TempDir())

		got, err := mgr.Apply(context.Background(), sess.ID, "claude-1", nil, compactionEnded(), true)

		require.NoError(t, err)
		assert.Equal(t, "claude-1", got.ClaudeSessionID)
		assert.Equal(t, StateStarted, got.State)
		assertBindingConsistent(t, mgr, got)
	})

	for _, from := range []State{StateStarted, StatePlanning, StateWorking, StateNeedsInput, StateFailed, StateIdle} {
		t.Run("a different session_id rebinds once from "+string(from), func(t *testing.T) {
			st := openTestStore(t)
			rec := &upsertsRecorder{}
			mgr := newTestManager(t, st, nil, rec.record)
			sess := createLaunchedSession(t, mgr, st, t.TempDir())
			advanceToState(t, mgr, sess.ID, "claude-old", from, true)
			_, err := mgr.Apply(context.Background(), sess.ID, "claude-old", strp(compactionPrompt), compactionBegan(), true)
			require.NoError(t, err)
			broadcasts := len(rec.all())

			got, err := mgr.Apply(context.Background(), sess.ID, "claude-new", strp(compactionPrompt), compactionEnded(), true)

			require.NoError(t, err)
			assert.Equal(t, StateStarted, got.State, "REQ-9: a different session_id is the clear-rebind")
			assert.Equal(t, "claude-new", got.ClaudeSessionID)
			assert.Zero(t, got.Compactions)
			assert.Nil(t, got.Attention)
			assert.Nil(t, got.Failure)
			assertBindingConsistent(t, mgr, got)
			assert.Len(t, rec.all(), broadcasts+1, "one persist and one broadcast, whether or not the rebind ran")
		})
	}
}

// TestApply_CompactionEndedFromALeftIdIsAStraggler covers REQ-9's monotonic half through the
// enveloped path: bind A, clear-rebind to B, then a compact SessionStart naming A (a reordered
// straggler) neither rebinds backwards nor resets or applies anything, from every state B
// can be in, with the reverse index still resolving B and A still resolving to the session.
func TestApply_CompactionEndedFromALeftIdIsAStraggler(t *testing.T) {
	for _, from := range []State{StateStarted, StatePlanning, StateWorking, StateNeedsInput, StateFailed, StateIdle} {
		t.Run("from "+string(from), func(t *testing.T) {
			ctx := context.Background()
			st := openTestStore(t)
			rec := &upsertsRecorder{}
			mgr := newTestManager(t, st, nil, rec.record)
			sess := createLaunchedSession(t, mgr, st, t.TempDir())
			advanceToState(t, mgr, sess.ID, "claude-a", from, true)
			_, err := mgr.Apply(ctx, sess.ID, "claude-b", nil, claudecode.StateInput{Kind: claudecode.KindClearRebind}, true)
			require.NoError(t, err)
			advanceToState(t, mgr, sess.ID, "claude-b", from, true)
			_, err = mgr.Apply(ctx, sess.ID, "claude-b", strp(compactionPrompt), compactionBegan(), true)
			require.NoError(t, err)
			before := mustGet(t, mgr, sess.ID)
			require.Equal(t, "claude-b", before.ClaudeSessionID)
			require.Equal(t, 1, before.Compactions)
			haiku := "claude-haiku-4-5-20251001"
			in := claudecode.StateInput{Kind: claudecode.KindCompactionEnded, Model: &haiku}

			got, err := mgr.Apply(ctx, sess.ID, "claude-a", strp("p-left"), in, true)

			require.NoError(t, err)
			assert.Equal(t, "claude-b", got.ClaudeSessionID, "the straggler does not move the binding backwards")
			assert.Equal(t, before.Compactions, got.Compactions, "no counter reset")
			assert.Equal(t, before.Context, got.Context)
			assert.Equal(t, before.State, got.State)
			assert.Equal(t, before.Model, got.Model, "the left conversation's model is not applied")
			assertBindingConsistent(t, mgr, got)
			a, ok := mgr.Resolve("claude-a")
			assert.True(t, ok)
			assert.Equal(t, sess.ID, a, "the left id still maps to this session")
		})
	}
}

// TestApply_CompactionStatePersistFailureRollsBack proves a PreCompact and a compact
// SessionStart that fail to persist leave the in-memory session, the compaction marker
// included, exactly as it was and broadcast nothing.
func TestApply_CompactionStatePersistFailureRollsBack(t *testing.T) {
	tests := []struct {
		name  string
		setup func(t *testing.T, mgr *Manager, sess *Session)
		in    claudecode.StateInput
	}{
		{"PreCompact from idle", func(*testing.T, *Manager, *Session) {}, compactionBegan()},
		{"compact SessionStart closing the compaction", func(t *testing.T, mgr *Manager, sess *Session) {
			_, err := mgr.Apply(context.Background(), sess.ID, sess.ClaudeSessionID, strp(compactionPrompt), compactionBegan(), true)
			require.NoError(t, err)
		}, compactionEnded()},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			st := openTestStore(t)
			rec := &upsertsRecorder{}
			mgr := newTestManager(t, st, nil, rec.record)
			sess := driveTo(t, mgr, st, StateIdle)
			tt.setup(t, mgr, sess)
			before := mustGet(t, mgr, sess.ID)
			broadcasts := len(rec.all())
			require.NoError(t, st.Close())

			_, err := mgr.Apply(context.Background(), sess.ID, sess.ClaudeSessionID, strp(compactionPrompt), tt.in, true)

			require.Error(t, err)
			assert.Equal(t, before, mustGet(t, mgr, sess.ID), "state, prompts and the compaction marker are restored")
			assert.Len(t, rec.all(), broadcasts)
		})
	}
}

// TestApply_SubagentEventsThroughTheManager checks the two subagent rules through Apply and
// the interpreter's real output for the measured payload shapes: a marked StopFailure on the
// parent's closed prompt leaves an idle card idle with nothing persisted as failed, and a
// marked event carrying dontAsk leaves a plan-mode card planning with the latch persisted.
func TestApply_SubagentEventsThroughTheManager(t *testing.T) {

	t.Run("marked StopFailure on the parent's closed prompt", func(t *testing.T) {
		st := openTestStore(t)
		mgr := newTestManager(t, st, nil, nil)
		sess := driveTo(t, mgr, st, StateIdle)
		prompt := "p-" + strconv.FormatInt(sess.ID, 10)
		in := claudecode.Interpret("StopFailure", []byte(`{"hook_event_name":"StopFailure","session_id":"x","prompt_id":"`+prompt+`","error":"server_error","agent_id":"a1b2c3"}`))

		got, err := mgr.Apply(context.Background(), sess.ID, sess.ClaudeSessionID, &prompt, in, true)

		require.NoError(t, err)
		assert.Equal(t, StateIdle, got.State)
		assert.Nil(t, got.Failure)
		persisted, err := st.GetSession(context.Background(), sess.ID)
		require.NoError(t, err)
		assert.Equal(t, string(StateIdle), persisted.State)
	})

	t.Run("marked PreToolUse carrying dontAsk under a plan-mode card", func(t *testing.T) {
		st := openTestStore(t)
		mgr := newTestManager(t, st, nil, nil)
		sess := driveTo(t, mgr, st, StatePlanning)
		prompt := "p-" + strconv.FormatInt(sess.ID, 10)
		in := claudecode.Interpret("PreToolUse", []byte(`{"hook_event_name":"PreToolUse","session_id":"x","prompt_id":"`+prompt+`","permission_mode":"dontAsk","agent_id":"a1b2c3","agent_type":"claude-code-guide"}`))

		got, err := mgr.Apply(context.Background(), sess.ID, sess.ClaudeSessionID, &prompt, in, true)

		require.NoError(t, err)
		assert.Equal(t, StatePlanning, got.State)
		assert.Equal(t, PermissionPlan, got.PermissionMode)
		persisted, err := st.GetSession(context.Background(), sess.ID)
		require.NoError(t, err)
		assert.Equal(t, string(PermissionPlan), persisted.PermissionMode)
	})
}

// TestSweepInterrupts_CompactionPromptIsInsideTheSweep covers REQ-11: a card a compaction
// moved to working is an open turn like any other for the interrupt sweep, which asks the
// checker about the compaction's prompt and, the transcript holding no interrupt line for
// it, leaves the card working.
func TestSweepInterrupts_CompactionPromptIsInsideTheSweep(t *testing.T) {
	st := openTestStore(t)
	chk := &checkerDouble{}
	mgr := newTestManager(t, st, nil, nil, withInterruptChecker(chk.check))
	sess := driveTo(t, mgr, st, StateIdle)
	_, err := mgr.Apply(context.Background(), sess.ID, sess.ClaudeSessionID, strp(compactionPrompt), compactionBegan(), true)
	require.NoError(t, err)

	mgr.sweepInterrupts(context.Background())

	require.Len(t, chk.seen(), 1)
	assert.Equal(t, [2]string{sess.TranscriptPath, compactionPrompt}, chk.seen()[0])
	assert.Equal(t, StateWorking, mustGet(t, mgr, sess.ID).State)
}
