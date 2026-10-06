package session

import (
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/Zalaras/muster/internal/claudecode"
	"github.com/Zalaras/muster/internal/claudecode/claudecodetest"
)

// allStates are the six displayed states, the source axis of every table below
// (kb:lesson/invariant-missed-by-per-transition-tests).
var allStates = []State{StateStarted, StateWorking, StatePlanning, StateIdle, StateFailed, StateNeedsInput}

// seededSession builds a session in state whose stored notes are consistent with it: a
// needs_input wait carries its attention and owner, a failed one its failure note.
func seededSession(state State, waitOwner string) *Session {
	sess := newTestSession()
	sess.State = state
	sess.StateSince = fixedNow
	sess.currentPromptID = "p1"
	sess.BackgroundTasks = 2
	switch state {
	case StateNeedsInput:
		sess.Attention = &Attention{Reason: "permission", Since: fixedNow}
		sess.AttentionAgent = waitOwner
	case StateFailed:
		sess.Failure = &Failure{Error: "server_error", Message: "boom"}
	default:
		// Only needs_input and failed carry a note; every other state has nothing to seed.
	}
	return sess
}

// assertTurnStateInvariants is INV-A (attention non-null iff needs_input; the owner only
// while attention is non-null) plus failure non-null iff failed.
func assertTurnStateInvariants(t *testing.T, sess *Session) {
	t.Helper()
	assert.Equal(t, sess.State == StateNeedsInput, sess.Attention != nil, "INV-A: attention non-null iff needs_input (state %s)", sess.State)
	if sess.Attention == nil {
		assert.Empty(t, sess.AttentionAgent, "INV-A: attentionAgent non-empty only while attention is non-null")
	}
	assert.Equal(t, sess.State == StateFailed, sess.Failure != nil, "failure non-null iff failed (state %s)", sess.State)
}

func strp(s string) *string { return &s }
func intp(n int) *int       { return &n }

// TestApplyInput_PromptlessIdlePrompt covers D1/REQ-1: a prompt-less idle_prompt (the shape
// that follows /clear, kb:fact/clear-idle-prompt-carries-no-prompt-id) changes no field from
// any of the six states, whoever owns the wait.
func TestApplyInput_PromptlessIdlePrompt(t *testing.T) {
	for _, from := range allStates {
		for _, owner := range []string{"", "agent-a"} {
			if from != StateNeedsInput && owner != "" {
				continue
			}
			name := string(from)
			if owner != "" {
				name += "/subagent_owned"
			}
			t.Run(name, func(t *testing.T) {
				sess := seededSession(from, owner)
				before := *sess

				applyInput(sess, "c1", nil, claudecode.StateInput{Kind: claudecode.KindNeedsInputIdle}, laterNow())

				assert.Equal(t, before, *sess, "no state, attention, failure, stateSince or any other field may move")
				assert.Equal(t, fixedNow, sess.StateSince)
				assertTurnStateInvariants(t, sess)
			})
		}
	}

	t.Run("a prompt-carrying idle_prompt still enters needs_input idle and drops a subagent owner", func(t *testing.T) {
		sess := seededSession(StateWorking, "")
		sess.AttentionAgent = "" // working holds no owner
		p := "p1"

		applyInput(sess, "c1", &p, claudecode.StateInput{Kind: claudecode.KindNeedsInputIdle}, laterNow())

		assert.Equal(t, StateNeedsInput, sess.State)
		require.NotNil(t, sess.Attention)
		assert.Equal(t, "idle", sess.Attention.Reason)
		assert.Empty(t, sess.AttentionAgent)
	})

	t.Run("an idle_prompt for a closed prompt changes nothing", func(t *testing.T) {
		sess := seededSession(StateIdle, "")
		sess.closedPromptIDs = []string{"p1"}
		before := *sess
		p := "p1"

		applyInput(sess, "c1", &p, claudecode.StateInput{Kind: claudecode.KindNeedsInputIdle}, laterNow())

		assert.Equal(t, before, *sess)
	})
}

// TestApplyInput_PostToolBatchLandsActive covers D4's machine half: PostToolBatch interprets
// to ordinary turn activity, so from a main-owned needs_input an unmarked one lands ACTIVE
// with attention cleared and the latch updated — the plan-rejected-with-feedback path
// (kb:fact/plan-feedback-emits-only-post-tool-batch).
func TestApplyInput_PostToolBatchLandsActive(t *testing.T) {
	tests := []struct {
		name  string
		mode  string
		latch PermissionMode
		want  State
	}{
		{"plan mode latched: planning", "plan", PermissionPlan, StatePlanning},
		{"default mode latched: working", "default", PermissionDefault, StateWorking},
		{"acceptEdits latched: working", "acceptEdits", PermissionAcceptEdits, StateWorking},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			sess := seededSession(StateNeedsInput, "")
			in := claudecode.Interpret("PostToolBatch", []byte(claudecodetest.RawPostToolBatch("c1", claudecodetest.ToolFileOpts{PromptID: "p1", PermissionMode: tt.mode})))
			p := "p1"

			applyInput(sess, "c1", &p, in, laterNow())

			assert.Equal(t, tt.want, sess.State)
			assert.Nil(t, sess.Attention)
			assert.Empty(t, sess.AttentionAgent)
			assert.Equal(t, tt.latch, sess.PermissionMode)
			assert.Equal(t, "hook", sess.PermissionModeSource)
			assertTurnStateInvariants(t, sess)
		})
	}
}

// TestApplyInput_WaitOwnership_INVB covers D5/INV-B: for every source state a wait can be
// entered from, the wait raised by main and then by subagent A, and turn activity from main,
// from A and from a second subagent B, asserts after each row that only the owner's activity
// clears the wait — and INV-A holds either way. A needs_input source is crossed against both
// prior owners so a re-raised wait records its new owner.
func TestApplyInput_WaitOwnership_INVB(t *testing.T) {
	const (
		main = ""
		a    = "agent-a"
		b    = "agent-b"
	)
	agentName := map[string]string{main: "main", a: "A", b: "B"}

	for _, from := range allStates {
		priors := []string{main}
		if from == StateNeedsInput {
			priors = []string{main, "agent-z"}
		}
		for _, prior := range priors {
			for _, owner := range []string{main, a} {
				for _, actor := range []string{main, a, b} {
					name := string(from) + "/prior_" + agentName[prior]
					if prior == "agent-z" {
						name = string(from) + "/prior_Z"
					}
					name += "/wait_by_" + agentName[owner] + "/activity_from_" + agentName[actor]
					t.Run(name, func(t *testing.T) {
						sess := seededSession(from, prior)
						sess.closedPromptIDs = nil
						p := "p1"
						raise := claudecode.StateInput{Kind: claudecode.KindNeedsInputPermission, Agent: owner, FromSubagent: owner != main}
						applyInput(sess, "c1", &p, raise, fixedNow)
						require.Equal(t, StateNeedsInput, sess.State)
						require.Equal(t, owner, sess.AttentionAgent, "the raising event's agent owns the wait")
						assertTurnStateInvariants(t, sess)

						mode := "plan"
						activity := claudecode.StateInput{Kind: claudecode.KindTurnActivity, Agent: actor, FromSubagent: actor != main, PermissionMode: &mode}
						applyInput(sess, "c1", &p, activity, laterNow())

						if actor == owner {
							assert.Equal(t, StatePlanning, sess.State, "the owner's own activity ends its wait")
							assert.Nil(t, sess.Attention)
							assert.Empty(t, sess.AttentionAgent)
						} else {
							assert.Equal(t, StateNeedsInput, sess.State, "INV-B: another agent's activity never leaves needs_input")
							require.NotNil(t, sess.Attention, "INV-B: and never clears attention")
							assert.Equal(t, "permission", sess.Attention.Reason)
							assert.Equal(t, owner, sess.AttentionAgent, "the owner stays")
							assert.Equal(t, fixedNow, sess.StateSince)
							assert.Equal(t, PermissionPlan, sess.PermissionMode, "the latch still updates")
						}
						assertTurnStateInvariants(t, sess)
					})
				}
			}
		}
	}
}

// TestApplyInput_OtherAgentActivityStillAdoptsAndRecords covers the plan row "the latch still
// updates; an open, unseen prompt_id is still adopted": another agent's activity during a wait
// records LastPrompt and adopts the prompt without transitioning, and a closed prompt with the
// marker is neither adopted nor a transition.
func TestApplyInput_OtherAgentActivityStillAdoptsAndRecords(t *testing.T) {
	t.Run("open unseen prompt is adopted and the prompt text kept", func(t *testing.T) {
		sess := seededSession(StateNeedsInput, "")
		sess.currentPromptID = "p-old"
		p := "p-new"

		applyInput(sess, "c1", &p, claudecode.StateInput{Kind: claudecode.KindTurnActivity, Agent: "agent-a", FromSubagent: true, Prompt: strp("hello")}, laterNow())

		assert.Equal(t, StateNeedsInput, sess.State)
		assert.Equal(t, "p-new", sess.currentPromptID)
		require.NotNil(t, sess.LastPrompt)
		assert.Equal(t, "hello", *sess.LastPrompt)
		require.NotNil(t, sess.Attention)
	})

	t.Run("edge 6: main's unmarked UserPromptSubmit while a subagent owns the wait", func(t *testing.T) {
		sess := seededSession(StateNeedsInput, "agent-a")
		p := "p2"

		applyInput(sess, "c1", &p, claudecode.StateInput{Kind: claudecode.KindTurnActivity, Prompt: strp("next")}, laterNow())

		assert.Equal(t, StateNeedsInput, sess.State)
		assert.Equal(t, "agent-a", sess.AttentionAgent)
		assertTurnStateInvariants(t, sess)
	})

	t.Run("edge 3: a marked PostToolBatch for a closed prompt from another agent causes no transition", func(t *testing.T) {
		sess := seededSession(StateNeedsInput, "")
		sess.closedPromptIDs = []string{"p0"}
		sess.currentPromptID = "p1"
		p := "p0"

		applyInput(sess, "c1", &p, claudecode.StateInput{Kind: claudecode.KindTurnActivity, Agent: "agent-a", FromSubagent: true}, laterNow())

		assert.Equal(t, StateNeedsInput, sess.State)
		assert.Equal(t, "p1", sess.currentPromptID, "a closed prompt is never adopted")
		assert.True(t, sess.promptClosed("p0"))
	})

	t.Run("a marked PostToolBatch for a closed prompt from the owner lands active without reopening it", func(t *testing.T) {
		sess := seededSession(StateNeedsInput, "agent-a")
		sess.closedPromptIDs = []string{"p0"}
		sess.currentPromptID = ""
		p := "p0"

		applyInput(sess, "c1", &p, claudecode.StateInput{Kind: claudecode.KindTurnActivity, Agent: "agent-a", FromSubagent: true}, laterNow())

		assert.Equal(t, StateWorking, sess.State)
		assert.Empty(t, sess.currentPromptID)
		assert.True(t, sess.promptClosed("p0"))
		assertTurnStateInvariants(t, sess)
	})
}

// TestApplyInput_PermissionOwnerRecorded covers the PermissionRequest and Notification rows:
// a PermissionRequest records its own agent as owner (edge 14: a subagent's request while main
// owns a wait takes it over), while a permission_prompt Notification — which cannot name its
// agent — keeps an existing wait's owner and otherwise records main.
func TestApplyInput_PermissionOwnerRecorded(t *testing.T) {
	tests := []struct {
		name      string
		from      State
		priorOwn  string
		in        claudecode.StateInput
		wantOwner string
	}{
		{"main PermissionRequest from working", StateWorking, "", claudecode.StateInput{Kind: claudecode.KindNeedsInputPermission}, ""},
		{"subagent PermissionRequest from working", StateWorking, "", claudecode.StateInput{Kind: claudecode.KindNeedsInputPermission, Agent: "agent-a", FromSubagent: true}, "agent-a"},
		{"edge 14: subagent PermissionRequest while main owns the wait", StateNeedsInput, "", claudecode.StateInput{Kind: claudecode.KindNeedsInputPermission, Agent: "agent-a", FromSubagent: true}, "agent-a"},
		{"main PermissionRequest while a subagent owns the wait", StateNeedsInput, "agent-a", claudecode.StateInput{Kind: claudecode.KindNeedsInputPermission}, ""},
		{"second subagent takes over", StateNeedsInput, "agent-a", claudecode.StateInput{Kind: claudecode.KindNeedsInputPermission, Agent: "agent-b", FromSubagent: true}, "agent-b"},
		{"permission_prompt keeps a subagent owner", StateNeedsInput, "agent-a", claudecode.StateInput{Kind: claudecode.KindNeedsInputPermission, AgentUnknown: true}, "agent-a"},
		{"permission_prompt keeps a main owner", StateNeedsInput, "", claudecode.StateInput{Kind: claudecode.KindNeedsInputPermission, AgentUnknown: true}, ""},
		{"permission_prompt from working records main", StateWorking, "", claudecode.StateInput{Kind: claudecode.KindNeedsInputPermission, AgentUnknown: true}, ""},
		{"permission_prompt from idle records main", StateIdle, "", claudecode.StateInput{Kind: claudecode.KindNeedsInputPermission, AgentUnknown: true}, ""},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			sess := seededSession(tt.from, tt.priorOwn)
			p := "p1"

			applyInput(sess, "c1", &p, tt.in, laterNow())

			assert.Equal(t, StateNeedsInput, sess.State)
			assert.Equal(t, tt.wantOwner, sess.AttentionAgent)
			assertTurnStateInvariants(t, sess)
		})
	}
}

// TestApplyInput_SubagentOwnedWaitSurvivesMainStop covers D14/REQ-8 and D6: a main Stop while a
// subagent owns the wait keeps needs_input, attention and the owner, yet still closes the prompt
// and captures lastActivity, backgroundTasks and the latch; while a main-owned wait still ends
// at Stop. A main StopFailure or an interrupt ends a subagent's wait (edge 5).
func TestApplyInput_SubagentOwnedWaitSurvivesMainStop(t *testing.T) {
	stop := claudecode.StateInput{
		Kind: claudecode.KindTurnClosed, PermissionMode: strp("acceptEdits"),
		LastActivity: strp("all done"), BackgroundTasks: intp(1),
	}

	t.Run("D14: subagent-owned wait is kept, the Stop's fields still land", func(t *testing.T) {
		sess := seededSession(StateNeedsInput, "agent-a")
		p := "p1"

		applyInput(sess, "c1", &p, stop, laterNow())

		assert.Equal(t, StateNeedsInput, sess.State)
		require.NotNil(t, sess.Attention)
		assert.Equal(t, "agent-a", sess.AttentionAgent)
		assert.Equal(t, fixedNow, sess.StateSince)
		assert.True(t, sess.promptClosed("p1"), "the prompt still closes")
		assert.Empty(t, sess.currentPromptID)
		require.NotNil(t, sess.LastActivity)
		assert.Equal(t, "all done", *sess.LastActivity)
		assert.Equal(t, 1, sess.BackgroundTasks)
		assert.Equal(t, PermissionAcceptEdits, sess.PermissionMode)
		assertTurnStateInvariants(t, sess)
	})

	t.Run("a main-owned wait ends at Stop", func(t *testing.T) {
		sess := seededSession(StateNeedsInput, "")
		p := "p1"

		applyInput(sess, "c1", &p, stop, laterNow())

		assert.Equal(t, StateIdle, sess.State)
		assert.Nil(t, sess.Attention)
		assertTurnStateInvariants(t, sess)
	})

	t.Run("D6: a main StopFailure lands failed over a subagent-owned wait", func(t *testing.T) {
		sess := seededSession(StateNeedsInput, "agent-a")
		p := "p1"

		applyInput(sess, "c1", &p, claudecode.StateInput{Kind: claudecode.KindTurnFailed, FailureError: strp("rate_limit")}, laterNow())

		assert.Equal(t, StateFailed, sess.State)
		assert.Nil(t, sess.Attention)
		assert.Empty(t, sess.AttentionAgent)
		require.NotNil(t, sess.Failure)
		assertTurnStateInvariants(t, sess)
	})

	t.Run("D6: an interrupt lands idle over a subagent-owned wait", func(t *testing.T) {
		sess := seededSession(StateNeedsInput, "agent-a")
		p := "p1"

		applyInput(sess, "c1", &p, claudecode.StateInput{Kind: claudecode.KindTurnInterrupted}, laterNow())

		assert.Equal(t, StateIdle, sess.State)
		assert.Nil(t, sess.Attention)
		assert.Empty(t, sess.AttentionAgent)
		assertTurnStateInvariants(t, sess)
	})

	t.Run("a Stop from every other state still lands idle", func(t *testing.T) {
		for _, from := range []State{StateStarted, StateWorking, StatePlanning, StateIdle, StateFailed} {
			sess := seededSession(from, "")
			p := "p1"

			applyInput(sess, "c1", &p, stop, laterNow())

			assert.Equal(t, StateIdle, sess.State, from)
			assertTurnStateInvariants(t, sess)
		}
	})
}

// TestApplyInput_TurnInterrupted covers REQ-4/D8/D9's machine arm.
func TestApplyInput_TurnInterrupted(t *testing.T) {
	interrupt := claudecode.StateInput{Kind: claudecode.KindTurnInterrupted}

	t.Run("an open turn lands idle from every open state, clearing attention and failure", func(t *testing.T) {
		for _, from := range []State{StateWorking, StatePlanning, StateNeedsInput} {
			for _, owner := range []string{"", "agent-a"} {
				if from != StateNeedsInput && owner != "" {
					continue
				}
				sess := seededSession(from, owner)
				sess.Failure = &Failure{Error: "stale", Message: "stale"} // even a stale note must go
				prior := "earlier activity"
				sess.LastActivity = &prior
				sess.PermissionMode = PermissionPlan
				p := "p1"

				applyInput(sess, "c1", &p, interrupt, laterNow())

				assert.Equal(t, StateIdle, sess.State, from)
				assert.Equal(t, laterNow(), sess.StateSince)
				assert.Nil(t, sess.Attention)
				assert.Empty(t, sess.AttentionAgent)
				assert.Nil(t, sess.Failure)
				assert.True(t, sess.promptClosed("p1"), "the prompt closes")
				assert.Empty(t, sess.currentPromptID)
				assert.Equal(t, &prior, sess.LastActivity, "lastActivity is left unchanged")
				assert.Equal(t, 2, sess.BackgroundTasks, "backgroundTasks is left unchanged")
				assert.Equal(t, PermissionPlan, sess.PermissionMode)
			}
		}
	})

	t.Run("D8: an interrupt for a non-current prompt causes no transition", func(t *testing.T) {
		for _, from := range allStates {
			sess := seededSession(from, "")
			before := *sess
			other := "p-older"

			applyInput(sess, "c1", &other, interrupt, laterNow())

			assert.Equal(t, before, *sess, from)
		}
	})

	t.Run("a nil prompt id causes no transition", func(t *testing.T) {
		sess := seededSession(StateWorking, "")
		before := *sess

		applyInput(sess, "c1", nil, interrupt, laterNow())

		assert.Equal(t, before, *sess)
	})

	t.Run("a turn that already closed is left alone from every non-open state", func(t *testing.T) {
		for _, from := range []State{StateStarted, StateIdle, StateFailed} {
			sess := seededSession(from, "")
			before := *sess
			p := "p1"

			applyInput(sess, "c1", &p, interrupt, laterNow())

			assert.Equal(t, before, *sess, from)
		}
	})

	t.Run("D9: after the interrupt an unmarked tool event for that prompt is a straggler, a new prompt opens a turn", func(t *testing.T) {
		sess := seededSession(StateWorking, "")
		p1, p2 := "p1", "p2"
		applyInput(sess, "c1", &p1, interrupt, fixedNow)
		require.Equal(t, StateIdle, sess.State)

		applyInput(sess, "c1", &p1, claudecode.StateInput{Kind: claudecode.KindTurnActivity}, laterNow())
		assert.Equal(t, StateIdle, sess.State, "a straggler for the interrupted prompt changes nothing")
		assert.Empty(t, sess.currentPromptID)

		applyInput(sess, "c1", &p2, claudecode.StateInput{Kind: claudecode.KindTurnActivity, Prompt: strp("next")}, laterNow())
		assert.Equal(t, StateWorking, sess.State)
		assert.Equal(t, "p2", sess.currentPromptID)
	})
}

// TestApplyInput_BackgroundTasksCount covers D13/REQ-5: a Stop sets the count, a later empty
// Stop zeroes it, a Stop with no list, StopFailure and every other event leave it alone, and
// clear-rebind (explicit and escalated) and resume-bind reset it — a plain same-id bind does not.
func TestApplyInput_BackgroundTasksCount(t *testing.T) {
	t.Run("Stop sets 2, then a later Stop with an empty list sets 0", func(t *testing.T) {
		sess := seededSession(StateWorking, "")
		sess.BackgroundTasks = 0
		p1, p2 := "p1", "p2"

		applyInput(sess, "c1", &p1, claudecode.StateInput{Kind: claudecode.KindTurnClosed, BackgroundTasks: intp(2)}, fixedNow)
		assert.Equal(t, 2, sess.BackgroundTasks)
		assert.Equal(t, StateIdle, sess.State, "background work never changes the state")

		applyInput(sess, "c1", &p2, claudecode.StateInput{Kind: claudecode.KindTurnActivity}, fixedNow)
		assert.Equal(t, 2, sess.BackgroundTasks, "turn activity leaves the count")
		applyInput(sess, "c1", &p2, claudecode.StateInput{Kind: claudecode.KindTurnClosed, BackgroundTasks: intp(0)}, laterNow())
		assert.Equal(t, 0, sess.BackgroundTasks)
	})

	t.Run("a Stop with no list leaves the count", func(t *testing.T) {
		sess := seededSession(StateWorking, "")
		p := "p1"

		applyInput(sess, "c1", &p, claudecode.StateInput{Kind: claudecode.KindTurnClosed}, fixedNow)

		assert.Equal(t, 2, sess.BackgroundTasks)
	})

	t.Run("every other input kind leaves the count, from every state", func(t *testing.T) {
		others := []claudecode.StateInput{
			{Kind: claudecode.KindTurnActivity},
			{Kind: claudecode.KindNeedsInputPermission},
			{Kind: claudecode.KindNeedsInputIdle},
			{Kind: claudecode.KindTurnFailed},
			{Kind: claudecode.KindTurnInterrupted},
			{Kind: claudecode.KindCompaction},
			{Kind: claudecode.KindDeathHint},
			{Kind: claudecode.KindClearDeathHint},
			{Kind: claudecode.KindInert},
			{Kind: claudecode.KindBind},
		}
		for _, from := range allStates {
			for _, in := range others {
				sess := seededSession(from, "")
				sess.ClaudeSessionID = "c1"
				p := "p1"

				applyInput(sess, "c1", &p, in, fixedNow)

				assert.Equal(t, 2, sess.BackgroundTasks, "%s / %s", from, kindName(in.Kind))
			}
		}
	})

	t.Run("binds that reset it", func(t *testing.T) {
		tests := []struct {
			name   string
			oldID  string
			in     claudecode.StateInput
			wantBG int
		}{
			{"explicit clear-rebind", "old", claudecode.StateInput{Kind: claudecode.KindClearRebind}, 0},
			{"plain Bind escalated by a new claude id", "old", claudecode.StateInput{Kind: claudecode.KindBind}, 0},
			{"resume-bind on the same id", "c1", claudecode.StateInput{Kind: claudecode.KindResumeBind}, 0},
			{"plain Bind on the same id is not a reset", "c1", claudecode.StateInput{Kind: claudecode.KindBind}, 2},
		}
		for _, tt := range tests {
			for _, from := range allStates {
				t.Run(tt.name+"/"+string(from), func(t *testing.T) {
					sess := seededSession(from, "agent-a")
					sess.ClaudeSessionID = tt.oldID

					applyInput(sess, "c1", nil, tt.in, laterNow())

					assert.Equal(t, tt.wantBG, sess.BackgroundTasks)
					assert.Empty(t, sess.AttentionAgent, "a bind resets the wait owner to main")
					assertTurnStateInvariants(t, sess)
				})
			}
		}
	})
}

// TestApplyInput_TurnStateInvariantsAcrossEverySourceState crosses every input kind against
// every source state (and both wait owners) and asserts INV-A and failure-iff-failed afterwards:
// the new owner field must never outlive the attention it belongs to on any path
// (kb:lesson/invariant-missed-by-per-transition-tests).
func TestApplyInput_TurnStateInvariantsAcrossEverySourceState(t *testing.T) {
	inputs := []struct {
		name     string
		in       claudecode.StateInput
		promptID *string
	}{
		{"main activity", claudecode.StateInput{Kind: claudecode.KindTurnActivity}, strp("p1")},
		{"subagent A activity", claudecode.StateInput{Kind: claudecode.KindTurnActivity, Agent: "agent-a", FromSubagent: true}, strp("p1")},
		{"subagent B activity", claudecode.StateInput{Kind: claudecode.KindTurnActivity, Agent: "agent-b", FromSubagent: true}, strp("p1")},
		{"main permission", claudecode.StateInput{Kind: claudecode.KindNeedsInputPermission}, strp("p1")},
		{"subagent permission", claudecode.StateInput{Kind: claudecode.KindNeedsInputPermission, Agent: "agent-a", FromSubagent: true}, strp("p1")},
		{"notification permission", claudecode.StateInput{Kind: claudecode.KindNeedsInputPermission, AgentUnknown: true}, strp("p1")},
		{"idle_prompt with id", claudecode.StateInput{Kind: claudecode.KindNeedsInputIdle}, strp("p1")},
		{"idle_prompt without id", claudecode.StateInput{Kind: claudecode.KindNeedsInputIdle}, nil},
		{"Stop", claudecode.StateInput{Kind: claudecode.KindTurnClosed, BackgroundTasks: intp(1)}, strp("p1")},
		{"StopFailure", claudecode.StateInput{Kind: claudecode.KindTurnFailed}, strp("p1")},
		{"interrupt", claudecode.StateInput{Kind: claudecode.KindTurnInterrupted}, strp("p1")},
		{"clear-rebind", claudecode.StateInput{Kind: claudecode.KindClearRebind}, nil},
		{"resume-bind", claudecode.StateInput{Kind: claudecode.KindResumeBind}, nil},
	}
	for _, from := range allStates {
		for _, owner := range []string{"", "agent-a"} {
			if from != StateNeedsInput && owner != "" {
				continue
			}
			for _, tt := range inputs {
				name := string(from) + "/" + tt.name
				if owner != "" {
					name = string(from) + "_owned_by_A/" + tt.name
				}
				t.Run(name, func(t *testing.T) {
					sess := seededSession(from, owner)
					sess.ClaudeSessionID = "c1"

					applyInput(sess, "c1", tt.promptID, tt.in, laterNow())

					assertTurnStateInvariants(t, sess)
				})
			}
		}
	}
}
