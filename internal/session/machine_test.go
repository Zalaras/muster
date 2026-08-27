package session

import (
	"strconv"
	"testing"
	"time"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/Zalaras/muster/internal/claudecode"
)

// newTestSession returns a baseline Session for the state-machine tests below: idle,
// permission mode latched to "default" by source "seed", alive, with a fixed StateSince
// so tests can assert whether setState actually moved it.
func newTestSession() *Session {
	return &Session{
		ID:                   1,
		State:                StateIdle,
		StateSince:           fixedNow,
		PermissionMode:       PermissionDefault,
		PermissionModeSource: "seed",
		Alive:                true,
	}
}

var fixedNow = time.Date(2026, 8, 22, 12, 0, 0, 0, time.UTC)

func laterNow() time.Time { return fixedNow.Add(time.Minute) }

// TestApplyInput_Bind covers protocol §7.3's Bind row: a fresh session (no prior Claude
// session id) transitions to started and binds the id.
func TestApplyInput_Bind(t *testing.T) {
	t.Run("binds a fresh session and sets started", func(t *testing.T) {
		sess := newTestSession()
		sess.State = StateStarted // launch seeds started; Bind is the first real transition

		applyInput(sess, "claude-1", nil, claudecode.StateInput{Kind: claudecode.KindBind}, fixedNow)

		assert.Equal(t, "claude-1", sess.ClaudeSessionID)
		assert.Equal(t, StateStarted, sess.State)
	})

	t.Run("captures the model id when SessionStart carries one", func(t *testing.T) {
		sess := newTestSession()
		model := "claude-haiku-4-5-20251001"

		applyInput(sess, "claude-1", nil, claudecode.StateInput{Kind: claudecode.KindBind, Model: &model}, fixedNow)

		require.NotNil(t, sess.Model)
		assert.Equal(t, model, sess.Model.ID)
	})

	t.Run("leaves DisplayName at its launch value when Model already existed", func(t *testing.T) {
		sess := newTestSession()
		sess.Model = &Model{ID: "sonnet", DisplayName: "sonnet"} // launch-time value, both fields equal
		newID := "claude-haiku-4-5-20251001"

		applyInput(sess, "claude-1", nil, claudecode.StateInput{Kind: claudecode.KindBind, Model: &newID}, fixedNow)

		assert.Equal(t, newID, sess.Model.ID)
		assert.Equal(t, "sonnet", sess.Model.DisplayName, "displayName stays the verbatim launch string until M3 (protocol §5.3 M1 value semantics)")
	})

	t.Run("no model field present leaves Model nil", func(t *testing.T) {
		sess := newTestSession()

		applyInput(sess, "claude-1", nil, claudecode.StateInput{Kind: claudecode.KindBind}, fixedNow)

		assert.Nil(t, sess.Model)
	})

	t.Run("binding the same claude session id twice is not a clear-rebind", func(t *testing.T) {
		sess := newTestSession()
		sess.ClaudeSessionID = "claude-1"
		sess.Compactions = 3
		sess.currentPromptID = "p1"

		applyInput(sess, "claude-1", nil, claudecode.StateInput{Kind: claudecode.KindBind}, fixedNow)

		assert.Equal(t, 3, sess.Compactions, "same id rebinding must not reset the compaction counter")
		assert.Equal(t, "p1", sess.currentPromptID)
	})
}

// TestApplyInput_ClearRebind covers REQ-10/D14 and Edge Case 5: both an explicit
// SessionStart(source:"clear") and a Bind whose claude session id differs from an
// already-bound one (loss-tolerant auto-detection) must rebind, reset compactions and
// the prompt-close guards, and set state to started while leaving Muster identity
// (id/tmuxTarget/title) untouched — the manager, not the machine, owns those fields, so
// this test only asserts what applyInput itself is responsible for.
func TestApplyInput_ClearRebind(t *testing.T) {
	t.Run("explicit clear-rebind resets compactions and prompt guards", func(t *testing.T) {
		sess := newTestSession()
		sess.ClaudeSessionID = "old-claude-id"
		sess.Compactions = 5
		sess.currentPromptID = "p1"
		sess.closedPromptIDs = []string{"p0"}
		sess.State = StateFailed // pre-clear state must not survive

		applyInput(sess, "new-claude-id", nil, claudecode.StateInput{Kind: claudecode.KindClearRebind}, fixedNow)

		assert.Equal(t, "new-claude-id", sess.ClaudeSessionID)
		assert.Equal(t, 0, sess.Compactions)
		assert.Empty(t, sess.currentPromptID)
		assert.Empty(t, sess.closedPromptIDs)
		assert.Equal(t, StateStarted, sess.State)
	})

	t.Run("a plain Bind escalates to clear-rebind when the claude session id changed without a clear source", func(t *testing.T) {
		// Edge Case 5: a new claude session id on a known pane without an explicit
		// source:"clear" is still treated as /clear (protocol §4.2 loss tolerance).
		sess := newTestSession()
		sess.ClaudeSessionID = "old-claude-id"
		sess.Compactions = 5

		applyInput(sess, "new-claude-id", nil, claudecode.StateInput{Kind: claudecode.KindBind}, fixedNow)

		assert.Equal(t, "new-claude-id", sess.ClaudeSessionID)
		assert.Equal(t, 0, sess.Compactions, "an unexplained new claude session id must still reset compactions like a real /clear")
	})

	t.Run("keeps updating the model id on a clear-rebind", func(t *testing.T) {
		sess := newTestSession()
		sess.ClaudeSessionID = "old-claude-id"
		sess.Model = &Model{ID: "old-model", DisplayName: "Old Model"}
		newModel := "new-model"

		applyInput(sess, "new-claude-id", nil, claudecode.StateInput{Kind: claudecode.KindClearRebind, Model: &newModel}, fixedNow)

		assert.Equal(t, "new-model", sess.Model.ID)
		assert.Equal(t, "Old Model", sess.Model.DisplayName)
	})

	// m3-gauges REQ-9/D12: /clear starts a fresh conversation with no context data yet —
	// the stale gauge from the previous conversation must not survive, alongside the
	// existing compactions/lastActivity reset.
	t.Run("explicit clear-rebind resets context to nil", func(t *testing.T) {
		sess := newTestSession()
		sess.ClaudeSessionID = "old-claude-id"
		sess.Context = &Context{UsedPct: 84, TotalInputTokens: 168000, WindowSize: 200000}

		applyInput(sess, "new-claude-id", nil, claudecode.StateInput{Kind: claudecode.KindClearRebind}, fixedNow)

		assert.Nil(t, sess.Context)
	})

	t.Run("id-change escalation to clear-rebind also resets context to nil", func(t *testing.T) {
		// The loss-tolerant auto-detection path (Edge Case 5) is still a real /clear —
		// its context reset must fire exactly like the explicit-source path above.
		sess := newTestSession()
		sess.ClaudeSessionID = "old-claude-id"
		sess.Context = &Context{UsedPct: 84, TotalInputTokens: 168000, WindowSize: 200000}

		applyInput(sess, "new-claude-id", nil, claudecode.StateInput{Kind: claudecode.KindBind}, fixedNow)

		assert.Nil(t, sess.Context)
	})

	t.Run("a plain bind with an unchanged claude session id leaves context untouched", func(t *testing.T) {
		// Not a /clear — the pre-existing context must survive (mirrors the existing
		// compactions/lastActivity assertions for this same non-clear path below).
		sess := newTestSession()
		sess.ClaudeSessionID = "claude-1"
		sess.Context = &Context{UsedPct: 84, TotalInputTokens: 168000, WindowSize: 200000}

		applyInput(sess, "claude-1", nil, claudecode.StateInput{Kind: claudecode.KindBind}, fixedNow)

		require.NotNil(t, sess.Context)
		assert.Equal(t, 84.0, sess.Context.UsedPct)
	})

	// review Critical 1: protocol §5.3's invariants ("attention non-null iff
	// needs_input", "failure non-null iff failed") must hold across a clear-rebind.
	// Before the fix, applyBind forced state=started without ever touching Attention/
	// Failure, so a card blocked on a permission prompt (or showing a stale failure)
	// kept displaying either after /clear started a fresh conversation — reproduced in
	// a real browser per the review. E7 only ever cleared from started, which is why
	// nothing caught this.
	t.Run("explicit clear-rebind from needs_input clears attention and failure and resets lastActivity", func(t *testing.T) {
		sess := newTestSession()
		sess.ClaudeSessionID = "old-claude-id"
		sess.State = StateNeedsInput
		sess.Attention = &Attention{Reason: "permission", Since: fixedNow}
		prior := "some earlier activity"
		sess.LastActivity = &prior

		applyInput(sess, "new-claude-id", nil, claudecode.StateInput{Kind: claudecode.KindClearRebind}, fixedNow)

		assert.Equal(t, StateStarted, sess.State)
		assert.Nil(t, sess.Attention, "a rebind must never leave a stale needs-input note on a started card")
		assert.Nil(t, sess.Failure)
		assert.Nil(t, sess.LastActivity, "/clear starts a fresh conversation; §5.3: null until a first Stop")
	})

	t.Run("explicit clear-rebind from failed clears the stale failure and attention", func(t *testing.T) {
		sess := newTestSession()
		sess.ClaudeSessionID = "old-claude-id"
		sess.State = StateFailed
		sess.Failure = &Failure{Error: "server_error", Message: "API error ended the turn"}
		prior := "some earlier activity"
		sess.LastActivity = &prior

		applyInput(sess, "new-claude-id", nil, claudecode.StateInput{Kind: claudecode.KindClearRebind}, fixedNow)

		assert.Equal(t, StateStarted, sess.State)
		assert.Nil(t, sess.Attention)
		assert.Nil(t, sess.Failure, "a rebind must never leave the stale server_error note on a started card")
		assert.Nil(t, sess.LastActivity)
	})

	t.Run("id-change escalation from needs_input also clears attention and failure", func(t *testing.T) {
		// Edge Case 5: a new claude session id on a known pane without an explicit
		// source:"clear" escalates to KindClearRebind inside applyBind itself — the
		// honesty fix must apply on that path too, not only the explicit-clear one.
		sess := newTestSession()
		sess.ClaudeSessionID = "old-claude-id"
		sess.State = StateNeedsInput
		sess.Attention = &Attention{Reason: "idle", Since: fixedNow}
		sess.Failure = &Failure{Error: "server_error", Message: "boom"}

		applyInput(sess, "new-claude-id", nil, claudecode.StateInput{Kind: claudecode.KindBind}, fixedNow)

		assert.Equal(t, StateStarted, sess.State)
		assert.Nil(t, sess.Attention)
		assert.Nil(t, sess.Failure)
	})

	// review cycle 2 Critical 1 (second half): SessionStart(source:"resume") reuses the
	// *original* claude_session_id (spikes/canary-fields.md), so it arrives as a plain
	// KindBind — the id-change escalation above never fires, and there is no explicit
	// source:"clear" either. Before this fix, applyBind only cleared Attention/Failure
	// inside the KindClearRebind branch, so this exact path left a started card still
	// showing a stale needs-input note or failure. It must clear those two fields like
	// any other bind while leaving the /clear-only fields (Compactions, prompt guards,
	// LastActivity) untouched — a plain re-bind is not a fresh conversation.
	t.Run("plain bind with an unchanged claude session id from needs_input clears attention and failure but leaves clear-only fields untouched", func(t *testing.T) {
		sess := newTestSession()
		sess.ClaudeSessionID = "same-claude-id"
		sess.State = StateNeedsInput
		sess.Attention = &Attention{Reason: "permission", Since: fixedNow}
		sess.Compactions = 5
		sess.currentPromptID = "p1"
		sess.closedPromptIDs = []string{"p0"}
		prior := "some earlier activity"
		sess.LastActivity = &prior

		applyInput(sess, "same-claude-id", nil, claudecode.StateInput{Kind: claudecode.KindBind}, fixedNow)

		assert.Equal(t, StateStarted, sess.State)
		assert.Nil(t, sess.Attention, "a plain re-bind must never leave a stale needs-input note on a started card")
		assert.Nil(t, sess.Failure)
		assert.Equal(t, 5, sess.Compactions, "a plain re-bind (not a /clear) must not reset the compaction counter")
		assert.Equal(t, "p1", sess.currentPromptID, "a plain re-bind must not reset the current prompt guard")
		assert.Equal(t, []string{"p0"}, sess.closedPromptIDs, "a plain re-bind must not reset the closed-prompt guard")
		require.NotNil(t, sess.LastActivity, "a plain re-bind is not /clear — lastActivity must survive")
		assert.Equal(t, "some earlier activity", *sess.LastActivity)
	})

	t.Run("plain bind with an unchanged claude session id from failed clears failure and attention but leaves clear-only fields untouched", func(t *testing.T) {
		sess := newTestSession()
		sess.ClaudeSessionID = "same-claude-id"
		sess.State = StateFailed
		sess.Failure = &Failure{Error: "server_error", Message: "API error ended the turn"}
		sess.Compactions = 2
		sess.currentPromptID = "p1"
		prior := "some earlier activity"
		sess.LastActivity = &prior

		applyInput(sess, "same-claude-id", nil, claudecode.StateInput{Kind: claudecode.KindBind}, fixedNow)

		assert.Equal(t, StateStarted, sess.State)
		assert.Nil(t, sess.Attention)
		assert.Nil(t, sess.Failure, "a plain re-bind must never leave the stale server_error note on a started card")
		assert.Equal(t, 2, sess.Compactions, "a plain re-bind (not a /clear) must not reset the compaction counter")
		assert.Equal(t, "p1", sess.currentPromptID, "a plain re-bind must not reset the current prompt guard")
		require.NotNil(t, sess.LastActivity, "a plain re-bind is not /clear — lastActivity must survive")
		assert.Equal(t, "some earlier activity", *sess.LastActivity)
	})
}

// TestApplyInput_ResumeBind_SameClaudeIDFromEveryStateLandsIdleWithAttentionAndFailureCleared
// covers REQ-8/D11/INV-6: a same-claude-id resume bind must land in idle with attention
// and failure cleared — asserted from every one of the six displayed states, not just the
// convenient one, per the m1-sessions review lesson (both review Criticals were stated
// invariants that per-transition tests missed because they all started from the one state
// with nothing to leak). Also asserts the REQ-8 "history exists, it is waiting for input,
// not new" contract: compactions/lastActivity/context survive, unlike a clear-rebind.
func TestApplyInput_ResumeBind_SameClaudeIDFromEveryStateLandsIdleWithAttentionAndFailureCleared(t *testing.T) {
	states := []State{StateStarted, StatePlanning, StateWorking, StateNeedsInput, StateFailed, StateIdle}
	for _, from := range states {
		t.Run(string(from), func(t *testing.T) {
			sess := newTestSession()
			sess.ClaudeSessionID = "claude-1"
			sess.State = from
			sess.Alive = false // dead before the resume — RecordResume sets Alive separately in the manager
			sess.Attention = &Attention{Reason: "permission", Since: fixedNow}
			sess.Failure = &Failure{Error: "server_error", Message: "boom"}
			sess.Compactions = 3
			prior := "earlier activity"
			sess.LastActivity = &prior
			sess.Context = &Context{UsedPct: 50, TotalInputTokens: 1000, WindowSize: 2000}

			applyInput(sess, "claude-1", nil, claudecode.StateInput{Kind: claudecode.KindResumeBind}, laterNow())

			assert.Equal(t, StateIdle, sess.State)
			assert.Nil(t, sess.Attention, "INV-6: attention non-null iff needs_input — a resume bind must never leave a stale note")
			assert.Nil(t, sess.Failure, "INV-6: failure non-null iff failed — a resume bind must never leave a stale failure")
			assert.False(t, sess.Alive, "INV-1: tmux pane existence is the sole authority for alive — a resume-bind hook (queued/late relative to tmux) must never flip it; RecordResume owns alive on the real resume path")
			assert.Equal(t, 3, sess.Compactions, "REQ-8: history exists — a resume is not a /clear, compactions survive")
			require.NotNil(t, sess.LastActivity, "REQ-8: lastActivity survives a resume")
			assert.Equal(t, "earlier activity", *sess.LastActivity)
			require.NotNil(t, sess.Context, "REQ-8: context survives a resume")
			assert.Equal(t, 50.0, sess.Context.UsedPct)
		})
	}
}

// TestApplyInput_ResumeBind_DifferentClaudeIDEscalatesToClearRebind covers REQ-8/D12/Edge
// Case 5: a resume bind for a claude session id the machine doesn't already have bound
// (claude no longer has the requested id, or some other loss-tolerant mismatch) escalates
// to the ordinary clear-rebind path exactly like a plain Bind would, landing in started
// with a full reset rather than idle.
func TestApplyInput_ResumeBind_DifferentClaudeIDEscalatesToClearRebind(t *testing.T) {
	sess := newTestSession()
	sess.ClaudeSessionID = "old-claude-id"
	sess.State = StateFailed
	sess.Failure = &Failure{Error: "server_error", Message: "boom"}
	sess.Attention = nil
	sess.Compactions = 5
	prior := "earlier activity"
	sess.LastActivity = &prior

	applyInput(sess, "new-claude-id", nil, claudecode.StateInput{Kind: claudecode.KindResumeBind}, fixedNow)

	assert.Equal(t, StateStarted, sess.State, "an unrecognized resume id escalates to clear-rebind, landing started — not idle")
	assert.Equal(t, "new-claude-id", sess.ClaudeSessionID)
	assert.Nil(t, sess.Attention)
	assert.Nil(t, sess.Failure)
	assert.Equal(t, 0, sess.Compactions, "escalation to clear-rebind resets compactions like any other /clear")
	assert.Nil(t, sess.LastActivity, "escalation to clear-rebind resets lastActivity like any other /clear")
}

// TestApplyInput_TurnActivity covers the ACTIVE transition and REQ-9's latch semantics.
func TestApplyInput_TurnActivity(t *testing.T) {
	t.Run("enters working when the permission latch is not plan", func(t *testing.T) {
		sess := newTestSession()
		promptID := "p1"

		applyInput(sess, "c1", &promptID, claudecode.StateInput{Kind: claudecode.KindTurnActivity}, fixedNow)

		assert.Equal(t, StateWorking, sess.State)
		assert.Equal(t, "p1", sess.currentPromptID)
	})

	t.Run("enters planning when the permission latch reads plan", func(t *testing.T) {
		sess := newTestSession()
		sess.PermissionMode = PermissionPlan
		promptID := "p1"

		applyInput(sess, "c1", &promptID, claudecode.StateInput{Kind: claudecode.KindTurnActivity}, fixedNow)

		assert.Equal(t, StatePlanning, sess.State)
	})

	t.Run("a present permission_mode latches the mode with source hook", func(t *testing.T) {
		sess := newTestSession()
		mode := "acceptEdits"

		applyInput(sess, "c1", nil, claudecode.StateInput{Kind: claudecode.KindTurnActivity, PermissionMode: &mode}, fixedNow)

		assert.Equal(t, PermissionAcceptEdits, sess.PermissionMode)
		assert.Equal(t, "hook", sess.PermissionModeSource)
	})

	t.Run("REQ-9: a nil permission_mode never resets the latch", func(t *testing.T) {
		sess := newTestSession()
		sess.PermissionMode = PermissionPlan
		sess.PermissionModeSource = "seed"

		applyInput(sess, "c1", nil, claudecode.StateInput{Kind: claudecode.KindTurnActivity, PermissionMode: nil}, fixedNow)

		assert.Equal(t, PermissionPlan, sess.PermissionMode)
		assert.Equal(t, "seed", sess.PermissionModeSource)
	})

	t.Run("D12: an unseen prompt id opens ACTIVE even with no prior prompt at all", func(t *testing.T) {
		sess := newTestSession()
		require.Empty(t, sess.currentPromptID)
		require.Empty(t, sess.closedPromptIDs)
		promptID := "brand-new"

		applyInput(sess, "c1", &promptID, claudecode.StateInput{Kind: claudecode.KindTurnActivity}, fixedNow)

		assert.Equal(t, StateWorking, sess.State)
		assert.Equal(t, "brand-new", sess.currentPromptID)
	})

	t.Run("D11/Edge Case 2: turn-activity for an already-closed prompt causes no transition", func(t *testing.T) {
		sess := newTestSession()
		sess.State = StateIdle
		sess.StateSince = fixedNow
		sess.closedPromptIDs = []string{"p1"}

		promptID := "p1"
		applyInput(sess, "c1", &promptID, claudecode.StateInput{Kind: claudecode.KindTurnActivity}, laterNow())

		assert.Equal(t, StateIdle, sess.State, "a straggler past Stop must not move the card off idle")
		assert.Equal(t, fixedNow, sess.StateSince)
		assert.Empty(t, sess.currentPromptID, "a closed prompt id must not become the current prompt")
	})

	t.Run("a nil prompt id is treated as open (no closed-prompt guard applies)", func(t *testing.T) {
		sess := newTestSession()
		sess.closedPromptIDs = []string{"p1"}

		applyInput(sess, "c1", nil, claudecode.StateInput{Kind: claudecode.KindTurnActivity}, fixedNow)

		assert.Equal(t, StateWorking, sess.State)
	})
}

// TestApplyInput_NeedsInput covers both needs_input notification variants and their
// shared closed-prompt guard.
func TestApplyInput_NeedsInput(t *testing.T) {
	t.Run("permission notification sets needs_input with reason permission", func(t *testing.T) {
		sess := newTestSession()
		promptID := "p1"

		applyInput(sess, "c1", &promptID, claudecode.StateInput{Kind: claudecode.KindNeedsInputPermission}, fixedNow)

		assert.Equal(t, StateNeedsInput, sess.State)
		require.NotNil(t, sess.Attention)
		assert.Equal(t, "permission", sess.Attention.Reason)
		assert.Equal(t, fixedNow, sess.Attention.Since)
	})

	t.Run("idle notification sets needs_input with reason idle", func(t *testing.T) {
		sess := newTestSession()
		promptID := "p1"

		applyInput(sess, "c1", &promptID, claudecode.StateInput{Kind: claudecode.KindNeedsInputIdle}, fixedNow)

		assert.Equal(t, StateNeedsInput, sess.State)
		require.NotNil(t, sess.Attention)
		assert.Equal(t, "idle", sess.Attention.Reason)
	})

	t.Run("a needs-input event for an already-closed prompt causes no transition", func(t *testing.T) {
		sess := newTestSession()
		sess.State = StateIdle
		sess.StateSince = fixedNow
		sess.closedPromptIDs = []string{"p1"}
		promptID := "p1"

		applyInput(sess, "c1", &promptID, claudecode.StateInput{Kind: claudecode.KindNeedsInputPermission}, laterNow())

		assert.Equal(t, StateIdle, sess.State)
		assert.Nil(t, sess.Attention)
	})
}

// TestApplyInput_TurnClosed covers Stop's transition to idle, prompt closing,
// LastActivity truncation, and clearing attention/failure.
func TestApplyInput_TurnClosed(t *testing.T) {
	t.Run("closes the prompt and enters idle, clearing attention and failure", func(t *testing.T) {
		sess := newTestSession()
		sess.State = StateNeedsInput
		sess.Attention = &Attention{Reason: "permission", Since: fixedNow}
		sess.Failure = &Failure{Error: "server_error", Message: "boom"}
		sess.currentPromptID = "p1"
		promptID := "p1"
		msg := "all done"

		applyInput(sess, "c1", &promptID, claudecode.StateInput{Kind: claudecode.KindTurnClosed, LastActivity: &msg}, fixedNow)

		assert.Equal(t, StateIdle, sess.State)
		assert.Nil(t, sess.Attention)
		assert.Nil(t, sess.Failure)
		assert.True(t, sess.promptClosed("p1"))
		assert.Empty(t, sess.currentPromptID)
		require.NotNil(t, sess.LastActivity)
		assert.Equal(t, "all done", *sess.LastActivity)
	})

	t.Run("truncates lastActivity to 200 chars", func(t *testing.T) {
		sess := newTestSession()
		long := make([]byte, 250)
		for i := range long {
			long[i] = 'x'
		}
		msg := string(long)
		promptID := "p1"

		applyInput(sess, "c1", &promptID, claudecode.StateInput{Kind: claudecode.KindTurnClosed, LastActivity: &msg}, fixedNow)

		require.NotNil(t, sess.LastActivity)
		assert.Len(t, *sess.LastActivity, 200)
	})

	t.Run("a nil lastActivity leaves the previous value untouched", func(t *testing.T) {
		sess := newTestSession()
		prior := "previous message"
		sess.LastActivity = &prior
		promptID := "p1"

		applyInput(sess, "c1", &promptID, claudecode.StateInput{Kind: claudecode.KindTurnClosed}, fixedNow)

		require.NotNil(t, sess.LastActivity)
		assert.Equal(t, "previous message", *sess.LastActivity)
	})

	t.Run("latches a present permission_mode on close too", func(t *testing.T) {
		sess := newTestSession()
		mode := "plan"
		promptID := "p1"

		applyInput(sess, "c1", &promptID, claudecode.StateInput{Kind: claudecode.KindTurnClosed, PermissionMode: &mode}, fixedNow)

		assert.Equal(t, PermissionPlan, sess.PermissionMode)
		assert.Equal(t, "hook", sess.PermissionModeSource)
	})

	t.Run("reapplying Stop for an already-closed prompt is idempotent (no error, still idle)", func(t *testing.T) {
		sess := newTestSession()
		sess.State = StateIdle
		sess.closedPromptIDs = []string{"p1"}
		promptID := "p1"

		applyInput(sess, "c1", &promptID, claudecode.StateInput{Kind: claudecode.KindTurnClosed}, fixedNow)

		assert.Equal(t, StateIdle, sess.State)
		assert.True(t, sess.promptClosed("p1"))
	})
}

// TestApplyInput_TurnFailed covers D13: StopFailure never carries permission_mode
// (spikes/canary-fields.md), so the latch must never be touched by this input kind —
// a session failing in plan mode stays planning-latched even though the displayed
// state is failed.
func TestApplyInput_TurnFailed(t *testing.T) {
	t.Run("sets Failure and state failed, clears attention, closes the prompt", func(t *testing.T) {
		sess := newTestSession()
		sess.State = StateWorking
		sess.Attention = &Attention{Reason: "idle", Since: fixedNow}
		promptID := "p1"
		errTok := "server_error"
		msg := "API error ended the turn"

		applyInput(sess, "c1", &promptID, claudecode.StateInput{
			Kind: claudecode.KindTurnFailed, FailureError: &errTok, LastActivity: &msg,
		}, fixedNow)

		assert.Equal(t, StateFailed, sess.State)
		assert.Nil(t, sess.Attention)
		require.NotNil(t, sess.Failure)
		assert.Equal(t, "server_error", sess.Failure.Error)
		assert.Equal(t, "API error ended the turn", sess.Failure.Message)
		assert.True(t, sess.promptClosed("p1"))
	})

	t.Run("D13: the permission-mode latch is untouched by a failure while seeded in plan mode", func(t *testing.T) {
		sess := newTestSession()
		sess.PermissionMode = PermissionPlan
		sess.PermissionModeSource = "seed"
		promptID := "p1"
		errTok := "server_error"

		applyInput(sess, "c1", &promptID, claudecode.StateInput{Kind: claudecode.KindTurnFailed, FailureError: &errTok}, fixedNow)

		assert.Equal(t, StateFailed, sess.State)
		assert.Equal(t, PermissionPlan, sess.PermissionMode, "a failure must never reset the permission latch")
		assert.Equal(t, "seed", sess.PermissionModeSource)
	})

	t.Run("a nil FailureError produces an empty (never nil-panicking) token", func(t *testing.T) {
		sess := newTestSession()
		promptID := "p1"

		applyInput(sess, "c1", &promptID, claudecode.StateInput{Kind: claudecode.KindTurnFailed}, fixedNow)

		require.NotNil(t, sess.Failure)
		assert.Empty(t, sess.Failure.Error)
		assert.Empty(t, sess.Failure.Message)
	})
}

// TestApplyInput_Compaction covers REQ-21: PreCompact increments the counter with no
// state transition.
func TestApplyInput_Compaction(t *testing.T) {
	sess := newTestSession()
	sess.State = StateWorking
	sess.StateSince = fixedNow
	sess.Compactions = 2

	applyInput(sess, "c1", nil, claudecode.StateInput{Kind: claudecode.KindCompaction}, laterNow())

	assert.Equal(t, 3, sess.Compactions)
	assert.Equal(t, StateWorking, sess.State, "PreCompact must cause no state transition")
	assert.Equal(t, fixedNow, sess.StateSince)
}

// TestApplyInput_DeathHint covers D15/REQ-11: any SessionEnd reason other than "clear"
// sets alive:false and endedAt, leaving state untouched (liveness never changes state).
func TestApplyInput_DeathHint(t *testing.T) {
	sess := newTestSession()
	sess.State = StateWorking
	sess.Alive = true

	applyInput(sess, "c1", nil, claudecode.StateInput{Kind: claudecode.KindDeathHint}, fixedNow)

	assert.False(t, sess.Alive)
	require.NotNil(t, sess.EndedAt)
	assert.Equal(t, fixedNow, *sess.EndedAt)
	assert.Equal(t, StateWorking, sess.State, "a death hint must never change the displayed state")
}

// TestApplyInput_ClearDeathHintAndInert cover D15's other half and §7.3's forward-
// compatibility row: both are pure no-ops.
func TestApplyInput_ClearDeathHintAndInert(t *testing.T) {
	for _, kind := range []claudecode.InputKind{claudecode.KindClearDeathHint, claudecode.KindInert} {
		t.Run(string(kind), func(t *testing.T) {
			sess := newTestSession()
			sess.State = StateWorking
			sess.StateSince = fixedNow
			sess.Alive = true

			applyInput(sess, "c1", nil, claudecode.StateInput{Kind: kind}, laterNow())

			assert.True(t, sess.Alive, "SessionEnd(reason:clear) must not be read as a death hint")
			assert.Equal(t, StateWorking, sess.State)
			assert.Equal(t, fixedNow, sess.StateSince)
		})
	}
}

// TestSetState_NoopWhenUnchanged covers Edge Case 3: reapplying an event that resolves
// to the same state must not touch stateSince.
func TestSetState_NoopWhenUnchanged(t *testing.T) {
	sess := newTestSession()
	sess.State = StateWorking
	sess.StateSince = fixedNow
	promptID := "p1"
	sess.currentPromptID = promptID

	// A second turn-activity for the same still-open prompt resolves to the same
	// activeState (working) — must be a true no-op on stateSince.
	applyInput(sess, "c1", &promptID, claudecode.StateInput{Kind: claudecode.KindTurnActivity}, laterNow())

	assert.Equal(t, StateWorking, sess.State)
	assert.Equal(t, fixedNow, sess.StateSince, "reapplying to the same state must not move stateSince")
}

// TestClosePrompt_BoundedRing covers the plan's Schema Changes note: the closed-prompt
// guard is bounded to the last 8 ids so a long-lived session's memory doesn't grow
// unboundedly.
func TestClosePrompt_BoundedRing(t *testing.T) {
	sess := newTestSession()
	for i := 0; i < 9; i++ {
		sess.closePrompt(promptIDFor(i))
	}

	assert.Len(t, sess.closedPromptIDs, maxClosedPrompts)
	assert.False(t, sess.promptClosed(promptIDFor(0)), "the oldest closed id must have been evicted")
	for i := 1; i < 9; i++ {
		assert.True(t, sess.promptClosed(promptIDFor(i)), "id %d should still be tracked as closed", i)
	}
}

func TestClosePrompt_ClearsCurrentPromptIDWhenItIsTheOneClosed(t *testing.T) {
	sess := newTestSession()
	sess.currentPromptID = "p1"

	sess.closePrompt("p1")

	assert.Empty(t, sess.currentPromptID)
}

func TestClosePrompt_IdempotentForAnAlreadyClosedID(t *testing.T) {
	sess := newTestSession()
	sess.closePrompt("p1")
	sess.closePrompt("p1")

	count := 0
	for _, id := range sess.closedPromptIDs {
		if id == "p1" {
			count++
		}
	}
	assert.Equal(t, 1, count, "closing the same id twice must not duplicate it in the ring")
}

func promptIDFor(i int) string {
	return "p" + strconv.Itoa(i)
}

// TestActiveState covers the ACTIVE-state split the permission latch drives.
func TestActiveState(t *testing.T) {
	tests := []struct {
		name string
		mode PermissionMode
		want State
	}{
		{"plan latches to planning", PermissionPlan, StatePlanning},
		{"default latches to working", PermissionDefault, StateWorking},
		{"acceptEdits latches to working", PermissionAcceptEdits, StateWorking},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			sess := newTestSession()
			sess.PermissionMode = tt.mode
			assert.Equal(t, tt.want, sess.activeState())
		})
	}
}

// TestTruncate covers the helper setState/turn-closed relies on for the 200-char cap.
func TestTruncate(t *testing.T) {
	assert.Equal(t, "short", truncate("short", 200))
	assert.Equal(t, "ab", truncate("abcdef", 2))
	assert.Equal(t, "", truncate("", 5))
}
