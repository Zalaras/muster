package session

import (
	"strings"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/Zalaras/muster/internal/claudecode"
)

// TestApplyInput_Unread_INV1 covers plan rail-card-improvements REQ-7/D7's half of INV-1
// (unread ⇒ idle) that lives in applyInput/setState: setState (session.go) clears Unread
// unconditionally whenever the target state is not idle — the single choke point every
// applyInput arm routes through — whatever the source state or whether the transition is
// a genuine state change. Crossed against every one of the six displayed source states
// and both Unread seeds (kb:lesson/invariant-missed-by-per-transition-tests: a narrower
// per-transition test starting from one convenient state proves nothing about the
// invariant). Manager.Apply is the only place that ever sets Unread *true* — after a
// turn_closed input, per the Watcher's answer — covered separately in
// manager_rail_test.go's TestApply_TurnClosed_SetsUnreadFromWatcher, since applyInput
// itself never reads a Watcher; this test's own turn_closed row instead documents that
// applyInput leaves Unread untouched for that Kind (Manager.Apply's exclusive turf).
func TestApplyInput_Unread_INV1(t *testing.T) {
	sourceStates := []State{StateStarted, StatePlanning, StateWorking, StateNeedsInput, StateFailed, StateIdle}

	cases := []struct {
		name   string
		kind   claudecode.InputKind
		closed bool // promptID "p1" pre-seeded into closedPromptIDs
		marked bool // FromSubagent
		clears bool // true: Unread must be false after, whatever it was seeded to;
		// false: Unread must equal the seeded value, untouched.
	}{
		{"bind_unchanged_claude_id", claudecode.KindBind, false, false, true},
		{"clear_rebind_explicit", claudecode.KindClearRebind, false, false, true},
		{"resume_bind_same_claude_id", claudecode.KindResumeBind, false, false, false},
		{"turn_activity_open_prompt", claudecode.KindTurnActivity, false, false, true},
		{"turn_activity_closed_prompt_subagent_marked", claudecode.KindTurnActivity, true, true, true},
		{"turn_activity_closed_prompt_unmarked_straggler", claudecode.KindTurnActivity, true, false, false},
		{"needs_input_permission_open_prompt", claudecode.KindNeedsInputPermission, false, false, true},
		{"needs_input_permission_closed_prompt_subagent_marked", claudecode.KindNeedsInputPermission, true, true, true},
		{"needs_input_permission_closed_prompt_unmarked_straggler", claudecode.KindNeedsInputPermission, true, false, false},
		{"needs_input_idle_fresh_prompt", claudecode.KindNeedsInputIdle, false, false, true},
		{"needs_input_idle_closed_prompt_straggler", claudecode.KindNeedsInputIdle, true, false, false},
		{"turn_failed", claudecode.KindTurnFailed, false, false, true},
		{"turn_closed_owned_by_manager_not_applyinput", claudecode.KindTurnClosed, false, false, false},
		{"compaction", claudecode.KindCompaction, false, false, false},
		{"death_hint", claudecode.KindDeathHint, false, false, false},
		{"clear_death_hint", claudecode.KindClearDeathHint, false, false, false},
		{"inert", claudecode.KindInert, false, false, false},
	}

	for _, from := range sourceStates {
		for _, seedUnread := range []bool{true, false} {
			for _, tc := range cases {
				t.Run(string(from)+"/"+tc.name+"/unread_seed_"+boolLabel(seedUnread), func(t *testing.T) {
					sess := newTestSession()
					sess.State = from
					sess.StateSince = fixedNow
					sess.ClaudeSessionID = "c1" // fixed and matching on every call below, so no
					// bind-family case here ever escalates to an id-change rebind — each row
					// exercises its own named Kind, not the escalation path (already covered by
					// machine_test.go's own Bind/ClearRebind/ResumeBind suites).
					sess.Unread = seedUnread
					if tc.closed {
						sess.closedPromptIDs = []string{"p1"}
					}

					promptID := "p1"
					in := claudecode.StateInput{Kind: tc.kind, FromSubagent: tc.marked}
					applyInput(sess, "c1", &promptID, in, laterNow())

					if tc.clears {
						assert.False(t, sess.Unread, "INV-1: %s must clear Unread (setState's target state is non-idle)", tc.name)
						return
					}
					assert.Equal(t, seedUnread, sess.Unread, "INV-1: %s must never touch Unread", tc.name)
				})
			}
		}
	}
}

func boolLabel(b bool) string {
	if b {
		return "true"
	}
	return "false"
}

// TestApplyInput_TurnActivity_PromptHandling covers REQ-12/D5/D12: KindTurnActivity
// stores the adapter-supplied prompt on Session.LastPrompt truncated to 200 characters
// (mirroring lastActivity's own truncate), leaves it untouched when the adapter supplied
// none, and — because the straggler early-return in the closed/unmarked case happens
// before the Prompt is ever read (machine.go's guard runs first) — a closed-prompt
// straggler carrying a Prompt still leaves LastPrompt exactly as it was (Edge Case 10).
func TestApplyInput_TurnActivity_PromptHandling(t *testing.T) {
	t.Run("truncates a long prompt to 200 characters", func(t *testing.T) {
		sess := newTestSession()
		long := strings.Repeat("a", 250)
		promptID := "p1"

		applyInput(sess, "c1", &promptID, claudecode.StateInput{Kind: claudecode.KindTurnActivity, Prompt: &long}, fixedNow)

		require.NotNil(t, sess.LastPrompt)
		assert.Len(t, *sess.LastPrompt, 200)
		assert.Equal(t, long[:200], *sess.LastPrompt)
	})

	t.Run("a short prompt is stored verbatim", func(t *testing.T) {
		sess := newTestSession()
		short := "fix the flaky retry"
		promptID := "p1"

		applyInput(sess, "c1", &promptID, claudecode.StateInput{Kind: claudecode.KindTurnActivity, Prompt: &short}, fixedNow)

		require.NotNil(t, sess.LastPrompt)
		assert.Equal(t, short, *sess.LastPrompt)
	})

	t.Run("no Prompt on the input leaves LastPrompt unchanged", func(t *testing.T) {
		sess := newTestSession()
		existing := "earlier prompt"
		sess.LastPrompt = &existing
		promptID := "p1"

		applyInput(sess, "c1", &promptID, claudecode.StateInput{Kind: claudecode.KindTurnActivity}, fixedNow)

		require.NotNil(t, sess.LastPrompt)
		assert.Equal(t, "earlier prompt", *sess.LastPrompt)
	})

	t.Run("a closed-prompt unmarked straggler never touches LastPrompt even when Prompt is present", func(t *testing.T) {
		sess := newTestSession()
		existing := "earlier prompt"
		sess.LastPrompt = &existing
		sess.closedPromptIDs = []string{"p1"}
		promptID := "p1"
		newText := "a stale re-post of the same prompt"

		applyInput(sess, "c1", &promptID, claudecode.StateInput{Kind: claudecode.KindTurnActivity, Prompt: &newText}, fixedNow)

		require.NotNil(t, sess.LastPrompt)
		assert.Equal(t, "earlier prompt", *sess.LastPrompt, "Edge Case 10: a straggler must not overwrite lastPrompt")
	})
}

// TestApplyBind_LastPrompt covers D12's bind-family clauses: an explicit clear-rebind (a
// fresh /clear conversation) resets LastPrompt to nil regardless of what it held, an
// id-change escalation to clear-rebind does the same, a same-claude-id resume-bind
// leaves it completely untouched, and a plain bind with an unchanged claude id (no
// rebind at all) leaves it untouched too.
func TestApplyBind_LastPrompt(t *testing.T) {
	t.Run("explicit clear-rebind resets LastPrompt to nil", func(t *testing.T) {
		sess := newTestSession()
		existing := "before the clear"
		sess.LastPrompt = &existing
		sess.ClaudeSessionID = "old-id"

		applyInput(sess, "new-id", nil, claudecode.StateInput{Kind: claudecode.KindClearRebind}, fixedNow)

		assert.Nil(t, sess.LastPrompt)
	})

	t.Run("an id-change escalation to clear-rebind also resets LastPrompt to nil", func(t *testing.T) {
		sess := newTestSession()
		existing := "before the clear"
		sess.LastPrompt = &existing
		sess.ClaudeSessionID = "old-id"

		applyInput(sess, "new-id", nil, claudecode.StateInput{Kind: claudecode.KindBind}, fixedNow)

		assert.Nil(t, sess.LastPrompt)
	})

	t.Run("a same-claude-id resume-bind leaves LastPrompt untouched", func(t *testing.T) {
		sess := newTestSession()
		existing := "before the resume"
		sess.LastPrompt = &existing
		sess.ClaudeSessionID = "claude-1"

		applyInput(sess, "claude-1", nil, claudecode.StateInput{Kind: claudecode.KindResumeBind}, fixedNow)

		require.NotNil(t, sess.LastPrompt)
		assert.Equal(t, "before the resume", *sess.LastPrompt)
	})

	t.Run("a plain bind with an unchanged claude id leaves LastPrompt untouched", func(t *testing.T) {
		sess := newTestSession()
		existing := "still here"
		sess.LastPrompt = &existing
		sess.ClaudeSessionID = "claude-1"

		applyInput(sess, "claude-1", nil, claudecode.StateInput{Kind: claudecode.KindBind}, fixedNow)

		require.NotNil(t, sess.LastPrompt)
		assert.Equal(t, "still here", *sess.LastPrompt)
	})
}
