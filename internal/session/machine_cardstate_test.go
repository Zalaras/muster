package session

import (
	"testing"
	"time"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/Zalaras/muster/internal/claudecode"
)

// waitKind names the three needs_input shapes the card-state rules tell apart: a permission
// wait the main agent raised, one a subagent raised, and the legacy idle wait only a row an
// earlier daemon persisted can carry.
type waitKind string

const (
	waitNone         waitKind = ""
	waitMain         waitKind = "permission_main"
	waitSubagent     waitKind = "permission_subagent"
	waitLegacyIdle   waitKind = "legacy_idle"
	subagentID                = "agent-a"
	compactionPrompt          = "pc"
)

// cardSource is one source-state row: a state plus, for needs_input, whose wait it holds.
type cardSource struct {
	name  string
	state State
	wait  waitKind
}

// cardSources are the six displayed states with needs_input split three ways.
var cardSources = []cardSource{
	{"started", StateStarted, waitNone},
	{"planning", StatePlanning, waitNone},
	{"working", StateWorking, waitNone},
	{"idle", StateIdle, waitNone},
	{"failed", StateFailed, waitNone},
	{"needs_input/permission_main", StateNeedsInput, waitMain},
	{"needs_input/permission_subagent", StateNeedsInput, waitSubagent},
	{"needs_input/legacy_idle", StateNeedsInput, waitLegacyIdle},
}

// cardSession builds a bound session in src whose stored notes match its state: prompt "p1"
// is current and open, "p0" is closed, two background tasks and a last activity are set, a
// planning card carries the plan latch and an idle one is unread (INV-D's only legal seed).
func cardSession(src cardSource) *Session {
	owner := ""
	if src.wait == waitSubagent {
		owner = subagentID
	}
	sess := seededSession(src.state, owner)
	sess.ClaudeSessionID = "c1"
	sess.closedPromptIDs = []string{"p0"}
	sess.LastActivity = strp("earlier activity")
	sess.LastPrompt = strp("earlier prompt")
	switch src.state {
	case StatePlanning:
		sess.PermissionMode = PermissionPlan
	case StateIdle:
		sess.Unread = true
	case StateNeedsInput:
		if src.wait == waitLegacyIdle {
			sess.Attention.Reason = attentionIdle
		}
	default:
		// Only planning, idle and needs_input carry extra seeded state.
	}
	return sess
}

func idleNotice() claudecode.StateInput {
	return claudecode.StateInput{Kind: claudecode.KindIdleNotice}
}
func compactionBegan() claudecode.StateInput {
	return claudecode.StateInput{Kind: claudecode.KindCompactionBegan}
}
func compactionEnded() claudecode.StateInput {
	return claudecode.StateInput{Kind: claudecode.KindCompactionEnded}
}
func mainActivity() claudecode.StateInput {
	return claudecode.StateInput{Kind: claudecode.KindTurnActivity}
}
func subagentActivity(mode *string) claudecode.StateInput {
	return claudecode.StateInput{Kind: claudecode.KindTurnActivity, Agent: subagentID, FromSubagent: true, PermissionMode: mode}
}
func subagentStopFailure() claudecode.StateInput {
	return claudecode.StateInput{Kind: claudecode.KindTurnFailed, Agent: subagentID, FromSubagent: true, FailureError: strp("server_error"), LastActivity: strp("API error ended the turn")}
}

// TestApplyInput_IdleNotice covers REQ-1 to REQ-4 row by row: from each source state, an
// idle_prompt with no prompt id or a closed one changes nothing; one naming an open prompt
// (the current one, or one no hook ever named) ends the turn of a working or planning card
// and of a legacy idle wait, and otherwise only closes the named prompt, a permission wait
// surviving. Whatever the row, no needs_input is ever raised and lastActivity,
// backgroundTasks and lastPrompt stay as they were.
func TestApplyInput_IdleNotice(t *testing.T) {
	endsTurn := map[string]bool{"planning": true, "working": true, "needs_input/legacy_idle": true}
	prompts := []struct {
		name   string
		prompt *string
		inert  bool // REQ-4: no id, or a closed one
	}{
		{"no_prompt_id", nil, true},
		{"closed_prompt", strp("p0"), true},
		{"open_current_prompt", strp("p1"), false},
		{"open_unseen_prompt", strp("p9"), false},
	}

	for _, src := range cardSources {
		for _, pr := range prompts {
			t.Run(src.name+"/"+pr.name, func(t *testing.T) {
				sess := cardSession(src)
				before := *sess

				ended := applyInput(sess, "c1", pr.prompt, idleNotice(), laterNow())

				assertTurnStateInvariants(t, sess)
				assert.Equal(t, before.LastActivity, sess.LastActivity, "lastActivity is never touched")
				assert.Equal(t, before.LastPrompt, sess.LastPrompt)
				assert.Equal(t, 2, sess.BackgroundTasks, "backgroundTasks is never touched")
				if pr.inert {
					assert.False(t, ended)
					assert.Equal(t, before, *sess, "REQ-4: no id or a closed id changes no field")
					return
				}
				assert.True(t, sess.promptClosed(*pr.prompt), "the named prompt is closed")
				if !endsTurn[src.name] {
					assert.False(t, ended, "REQ-3: no turn ended")
					assert.Equal(t, src.state, sess.State)
					assert.Equal(t, before.StateSince, sess.StateSince)
					assert.Equal(t, before.Attention, sess.Attention, "a permission wait is kept")
					assert.Equal(t, before.AttentionAgent, sess.AttentionAgent)
					assert.Equal(t, before.Failure, sess.Failure)
					assert.Equal(t, before.Unread, sess.Unread)
					if *pr.prompt != "p1" {
						assert.Equal(t, "p1", sess.currentPromptID, "naming another prompt leaves the current one")
					}
					return
				}
				assert.True(t, ended, "REQ-2: the turn ended")
				assert.Equal(t, StateIdle, sess.State)
				assert.Equal(t, laterNow(), sess.StateSince)
				assert.Nil(t, sess.Attention)
				assert.Empty(t, sess.AttentionAgent)
				assert.Nil(t, sess.Failure)
				assert.Empty(t, sess.currentPromptID, "REQ-2: the current prompt closes too")
				assert.True(t, sess.promptClosed("p1"))
			})
		}
	}
}

// TestApplyInput_CompactionBegan covers REQ-6 and REQ-7: outside a turn a PreCompact reads
// working whatever the latch says, adopts its prompt and clears attention and failure;
// inside a turn it only counts and leaves the current prompt alone. Either way the counter
// moves by one and the Stop-owned fields stay.
func TestApplyInput_CompactionBegan(t *testing.T) {
	outside := map[string]bool{"started": true, "idle": true, "failed": true}

	for _, src := range cardSources {
		for _, latch := range []PermissionMode{PermissionDefault, PermissionPlan} {
			t.Run(src.name+"/latch_"+string(latch), func(t *testing.T) {
				sess := cardSession(src)
				sess.PermissionMode = latch
				sess.Compactions = 2
				before := *sess

				ended := applyInput(sess, "c1", strp(compactionPrompt), compactionBegan(), laterNow())

				assert.False(t, ended, "a compaction beginning ends no turn")
				assert.Equal(t, 3, sess.Compactions)
				assert.Equal(t, before.LastActivity, sess.LastActivity)
				assert.Equal(t, before.LastPrompt, sess.LastPrompt)
				assert.Equal(t, 2, sess.BackgroundTasks)
				assert.Equal(t, latch, sess.PermissionMode, "the latch is untouched")
				assertTurnStateInvariants(t, sess)
				if outside[src.name] {
					assert.Equal(t, StateWorking, sess.State, "REQ-6: working, never planning, whatever the latch reads")
					assert.Equal(t, compactionPrompt, sess.currentPromptID)
					assert.Nil(t, sess.Attention)
					assert.Nil(t, sess.Failure)
					assert.False(t, sess.Unread)
					return
				}
				assert.Equal(t, src.state, sess.State, "REQ-7: no transition inside a turn")
				assert.Equal(t, before.StateSince, sess.StateSince)
				assert.Equal(t, "p1", sess.currentPromptID, "REQ-7: the turn's current prompt is unchanged")
				assert.Equal(t, before.Attention, sess.Attention)
				assert.Equal(t, before.AttentionAgent, sess.AttentionAgent)

				// The compaction prompt was never marked as a compaction's: its SessionStart is a no-op.
				snapshot := *sess
				assert.False(t, applyInput(sess, "c1", strp(compactionPrompt), compactionEnded(), laterNow()))
				assert.Equal(t, snapshot, *sess)
			})
		}
	}

	t.Run("a PreCompact with no prompt id outside a turn still reads working and adopts nothing", func(t *testing.T) {
		sess := cardSession(cardSources[3])
		sess.currentPromptID = ""

		applyInput(sess, "c1", nil, compactionBegan(), laterNow())

		assert.Equal(t, StateWorking, sess.State)
		assert.Empty(t, sess.currentPromptID)
		assert.Equal(t, 1, sess.Compactions)
	})
}

// TestApplyInput_CompactionEnded covers REQ-8 and REQ-9 at the machine: a compact
// SessionStart naming the prompt a compaction opened, still current and open, lands idle and
// moves nothing the Stop does not own; every other compact SessionStart changes no
// state-machine field.
func TestApplyInput_CompactionEnded(t *testing.T) {
	compacting := func(from cardSource) *Session {
		sess := cardSession(from)
		sess.Context = &Context{UsedPct: 40, TotalInputTokens: 80000, WindowSize: 200000}
		applyInput(sess, "c1", strp(compactionPrompt), compactionBegan(), fixedNow)
		require.Equal(t, StateWorking, sess.State)
		return sess
	}

	for _, from := range []cardSource{cardSources[0], cardSources[3], cardSources[4]} {
		t.Run("own prompt from "+from.name+" lands idle and keeps the Stop-owned fields", func(t *testing.T) {
			sess := compacting(from)
			before := *sess

			ended := applyInput(sess, "c1", strp(compactionPrompt), compactionEnded(), laterNow())

			assert.True(t, ended, "REQ-8: the turn ended, so Apply sets unread as for a Stop")
			assert.Equal(t, StateIdle, sess.State)
			assert.Equal(t, laterNow(), sess.StateSince)
			assert.True(t, sess.promptClosed(compactionPrompt))
			assert.Empty(t, sess.currentPromptID)
			assert.Nil(t, sess.Attention)
			assert.Nil(t, sess.Failure)
			assert.Equal(t, before.LastActivity, sess.LastActivity)
			assert.Equal(t, before.LastPrompt, sess.LastPrompt)
			assert.Equal(t, before.Context, sess.Context)
			assert.Equal(t, 1, sess.Compactions)
			assert.Equal(t, 2, sess.BackgroundTasks)
			assert.Equal(t, "c1", sess.ClaudeSessionID)
			assertTurnStateInvariants(t, sess)
		})
	}

	t.Run("a duplicate delivery of the same SessionStart is a no-op", func(t *testing.T) {
		sess := compacting(cardSources[3])
		applyInput(sess, "c1", strp(compactionPrompt), compactionEnded(), laterNow())
		before := *sess

		ended := applyInput(sess, "c1", strp(compactionPrompt), compactionEnded(), laterNow().Add(1))

		assert.False(t, ended)
		assert.Equal(t, before, *sess)
	})

	noOps := []struct {
		name  string
		setup func(t *testing.T) *Session
		id    *string
	}{
		{"no prompt id", func(*testing.T) *Session { return compacting(cardSources[3]) }, nil},
		{"a prompt id other than the compaction's", func(*testing.T) *Session { return compacting(cardSources[3]) }, strp("p9")},
		{"lost PreCompact: an idle card and an unseen id", func(*testing.T) *Session { return cardSession(cardSources[3]) }, strp(compactionPrompt)},
		{"stale: the compaction prompt was already closed", func(t *testing.T) *Session {
			sess := compacting(cardSources[3])
			applyInput(sess, "c1", strp(compactionPrompt), idleNotice(), fixedNow)
			require.Equal(t, StateIdle, sess.State)
			return sess
		}, strp(compactionPrompt)},
		{"stale: a new turn replaced the compaction prompt as current", func(t *testing.T) *Session {
			sess := compacting(cardSources[3])
			applyInput(sess, "c1", strp("p2"), mainActivity(), fixedNow)
			require.Equal(t, "p2", sess.currentPromptID)
			return sess
		}, strp(compactionPrompt)},
		{"mid-turn compaction: the turn's own prompt on a working card", func(*testing.T) *Session {
			sess := cardSession(cardSources[2])
			applyInput(sess, "c1", strp(compactionPrompt), compactionBegan(), fixedNow)
			return sess
		}, strp("p1")},
	}
	for _, tt := range noOps {
		t.Run("no-op: "+tt.name, func(t *testing.T) {
			sess := tt.setup(t)
			before := *sess

			ended := applyInput(sess, "c1", tt.id, compactionEnded(), laterNow())

			assert.False(t, ended)
			assert.Equal(t, before, *sess, "REQ-9: no state and no state-machine field changes")
		})
	}

	t.Run("a different session id is left to Apply: the machine rebinds nothing and applies no model", func(t *testing.T) {
		for _, src := range cardSources {
			sess := cardSession(src)
			sess.Compactions = 2
			sess.Context = &Context{UsedPct: 40, TotalInputTokens: 80000, WindowSize: 200000}
			sess.Model = &Model{ID: "sonnet", DisplayName: "Sonnet"}
			other := "claude-haiku-4-5-20251001"
			in := claudecode.StateInput{Kind: claudecode.KindCompactionEnded, Model: &other}
			before := *sess

			ended := applyInput(sess, "c-other", nil, in, laterNow())

			assert.False(t, ended, src.name)
			assert.Equal(t, "c1", sess.ClaudeSessionID, src.name)
			assert.Equal(t, &Model{ID: "sonnet", DisplayName: "Sonnet"}, sess.Model, src.name)
			assert.Equal(t, before, *sess, src.name)
		}
	})

	t.Run("the model a compact SessionStart names binds as any SessionStart does", func(t *testing.T) {
		sess := cardSession(cardSources[3])
		sess.Model = &Model{ID: "sonnet", DisplayName: "Sonnet"}
		same, other := "sonnet", "claude-haiku-4-5-20251001"

		applyInput(sess, "c1", nil, claudecode.StateInput{Kind: claudecode.KindCompactionEnded, Model: &same}, laterNow())
		assert.Equal(t, &Model{ID: "sonnet", DisplayName: "Sonnet"}, sess.Model, "the same id keeps the confirmed display name")

		applyInput(sess, "c1", nil, claudecode.StateInput{Kind: claudecode.KindCompactionEnded, Model: &other}, laterNow())
		assert.Equal(t, &Model{ID: other, DisplayName: other}, sess.Model)
		assert.Equal(t, StateIdle, sess.State, "binding a model moves no state")
	})
}

// seqStep is one event in a sequence, with the state the card must read after it.
type seqStep struct {
	name   string
	prompt *string
	in     claudecode.StateInput
	want   State
	check  func(t *testing.T, sess *Session)
}

func runSequence(t *testing.T, sess *Session, steps []seqStep) {
	t.Helper()
	now := fixedNow
	for _, step := range steps {
		now = now.Add(time.Second)
		applyInput(sess, "c1", step.prompt, step.in, now)
		require.Equal(t, step.want, sess.State, step.name)
		assertTurnStateInvariants(t, sess)
		if step.check != nil {
			step.check(t, sess)
		}
	}
}

// idleCard is a bound, idle card whose last turn (p0) closed.
func idleCard() *Session { return cardSession(cardSources[3]) }

// TestApplyInput_CardStateEdgeCases drives the plan's numbered edge cases (D2) as event
// sequences through the machine, asserting the card's state after every step. The numbering
// follows plan state-issues "Edge Cases".
func TestApplyInput_CardStateEdgeCases(t *testing.T) {
	pc, p2, bg := strp(compactionPrompt), strp("p2"), strp("f6b55573")
	dontAsk := strp("dontAsk")
	subagentPermission := claudecode.StateInput{Kind: claudecode.KindNeedsInputPermission, Agent: subagentID, FromSubagent: true}

	tests := []struct {
		name  string
		start func() *Session
		steps []seqStep
	}{
		{"edge 1: lost PreCompact leaves the idle card idle", idleCard, []seqStep{
			{"compact SessionStart", pc, compactionEnded(), StateIdle, func(t *testing.T, s *Session) {
				assert.Zero(t, s.Compactions)
				assert.Equal(t, fixedNow, s.StateSince)
			}},
		}},
		{"edges 2 and 4: a lost SessionStart, or an empty compaction, ends at the idle_prompt that follows", idleCard, []seqStep{
			{"PreCompact", pc, compactionBegan(), StateWorking, nil},
			{"idle_prompt naming the compaction prompt ~60 s later", pc, idleNotice(), StateIdle, func(t *testing.T, s *Session) {
				assert.Equal(t, 1, s.Compactions)
				assert.Empty(t, s.currentPromptID)
				assert.True(t, s.promptClosed(compactionPrompt))
				assert.Nil(t, s.Attention)
			}},
		}},
		{"edge 3: a SessionStart reordered before its PreCompact is a no-op, the PreCompact then opens working", idleCard, []seqStep{
			{"compact SessionStart first", pc, compactionEnded(), StateIdle, nil},
			{"PreCompact", pc, compactionBegan(), StateWorking, nil},
			{"idle_prompt", pc, idleNotice(), StateIdle, nil},
		}},
		{"the measured full sequence reads working, then idle, and the late idle_prompt changes nothing", idleCard, []seqStep{
			{"PreCompact", pc, compactionBegan(), StateWorking, nil},
			{"SubagentStop (inert)", pc, claudecode.StateInput{Kind: claudecode.KindInert}, StateWorking, nil},
			{"SessionStart(source:compact), same prompt", pc, compactionEnded(), StateIdle, func(t *testing.T, s *Session) {
				assert.Equal(t, 1, s.Compactions)
			}},
			{"idle_prompt 60 s later names the now-closed prompt", pc, idleNotice(), StateIdle, nil},
		}},
		{"edge 6: an auto-compaction inside a turn changes no state and its SessionStart is a no-op", func() *Session { return cardSession(cardSources[2]) }, []seqStep{
			{"PreCompact in working", pc, compactionBegan(), StateWorking, func(t *testing.T, s *Session) {
				assert.Equal(t, 1, s.Compactions)
				assert.Equal(t, "p1", s.currentPromptID)
			}},
			{"compact SessionStart on the compaction's id", pc, compactionEnded(), StateWorking, nil},
			{"compact SessionStart on the turn's id", strp("p1"), compactionEnded(), StateWorking, func(t *testing.T, s *Session) {
				assert.Equal(t, "p1", s.currentPromptID)
			}},
			{"the turn's own Stop ends it", strp("p1"), claudecode.StateInput{Kind: claudecode.KindTurnClosed}, StateIdle, nil},
		}},
		{"edge 7: a fresh UserPromptSubmit during a compaction is an ordinary new turn, and the stale SessionStart changes nothing", idleCard, []seqStep{
			{"PreCompact", pc, compactionBegan(), StateWorking, nil},
			{"UserPromptSubmit on a fresh id", p2, claudecode.StateInput{Kind: claudecode.KindTurnActivity, Prompt: strp("next")}, StateWorking, func(t *testing.T, s *Session) {
				assert.Equal(t, "p2", s.currentPromptID)
			}},
			{"compact SessionStart for the old compaction prompt", pc, compactionEnded(), StateWorking, func(t *testing.T, s *Session) {
				assert.Equal(t, "p2", s.currentPromptID)
				assert.False(t, s.promptClosed("p2"))
			}},
			{"Stop", p2, claudecode.StateInput{Kind: claudecode.KindTurnClosed}, StateIdle, nil},
		}},
		{"edge 9: a background subagent's fresh-id stretch ends at the idle_prompt, and later marked activity reads working again", idleCard, []seqStep{
			{"marked PreToolUse on an unseen id", bg, subagentActivity(nil), StateWorking, func(t *testing.T, s *Session) {
				assert.Equal(t, "f6b55573", s.currentPromptID)
			}},
			{"idle_prompt naming that id", bg, idleNotice(), StateIdle, func(t *testing.T, s *Session) {
				assert.Empty(t, s.currentPromptID)
				assert.Equal(t, "earlier activity", *s.LastActivity)
				assert.Equal(t, 2, s.BackgroundTasks)
			}},
			{"a later marked event on the now-closed id", bg, subagentActivity(nil), StateWorking, func(t *testing.T, s *Session) {
				assert.Empty(t, s.currentPromptID, "a closed prompt is not reopened (kb:adr/lifecycle-subagent-marked-events-not-stragglers)")
				assert.True(t, s.promptClosed("f6b55573"))
			}},
		}},
		{"edge 10: an idle_prompt for an open prompt keeps a subagent's permission wait", func() *Session { return cardSession(cardSources[6]) }, []seqStep{
			{"idle_prompt naming the open prompt", strp("p1"), idleNotice(), StateNeedsInput, func(t *testing.T, s *Session) {
				require.NotNil(t, s.Attention)
				assert.Equal(t, attentionPermission, s.Attention.Reason)
				assert.Equal(t, subagentID, s.AttentionAgent)
			}},
			{"the owner's activity then ends the wait", strp("p2"), subagentActivity(nil), StateWorking, nil},
		}},
		{"edge 11: marked activity ends a legacy idle wait", func() *Session { return cardSession(cardSources[7]) }, []seqStep{
			{"marked PreToolUse", strp("p1"), subagentActivity(nil), StateWorking, func(t *testing.T, s *Session) {
				assert.Nil(t, s.Attention)
				assert.Empty(t, s.AttentionAgent)
			}},
		}},
		{"edge 12: after /clear a prompt-less idle_prompt and the previous conversation's straggler change nothing", idleCard, []seqStep{
			{"SessionEnd(clear)", nil, claudecode.StateInput{Kind: claudecode.KindClearDeathHint}, StateIdle, nil},
			{"SessionStart(clear)", nil, claudecode.StateInput{Kind: claudecode.KindClearRebind}, StateStarted, nil},
			{"prompt-less idle_prompt", nil, idleNotice(), StateStarted, nil},
			{"idle_prompt carrying the old conversation's closed prompt", strp("p0"), idleNotice(), StateStarted, nil},
		}},
		{"edge 13: a straggler idle_prompt for a Stop-closed prompt does not end the next turn", func() *Session { return cardSession(cardSources[2]) }, []seqStep{
			{"Stop closes p1", strp("p1"), claudecode.StateInput{Kind: claudecode.KindTurnClosed}, StateIdle, nil},
			{"next turn", p2, mainActivity(), StateWorking, nil},
			{"the straggler idle_prompt for p1", strp("p1"), idleNotice(), StateWorking, func(t *testing.T, s *Session) {
				assert.Equal(t, "p2", s.currentPromptID)
				assert.False(t, s.promptClosed("p2"))
			}},
		}},
		{"edge 15: a plan-mode card stays planning and keeps its latch under a subagent's declared mode", func() *Session { return cardSession(cardSources[1]) }, []seqStep{
			{"marked PreToolUse carrying dontAsk", strp("p1"), subagentActivity(dontAsk), StatePlanning, func(t *testing.T, s *Session) {
				assert.Equal(t, PermissionPlan, s.PermissionMode)
				assert.Equal(t, "seed", s.PermissionModeSource)
			}},
			{"main agent's own event latches as ever", strp("p1"), claudecode.StateInput{Kind: claudecode.KindTurnActivity, PermissionMode: strp("acceptEdits")}, StateWorking, func(t *testing.T, s *Session) {
				assert.Equal(t, PermissionAcceptEdits, s.PermissionMode)
				assert.Equal(t, "hook", s.PermissionModeSource)
			}},
		}},
		{"edge 16: a subagent's StopFailure while the main turn is open leaves it working", func() *Session { return cardSession(cardSources[2]) }, []seqStep{
			{"marked StopFailure", strp("p1"), subagentStopFailure(), StateWorking, func(t *testing.T, s *Session) {
				assert.Nil(t, s.Failure)
				assert.Equal(t, "p1", s.currentPromptID)
				assert.False(t, s.promptClosed("p1"), "no prompt is closed")
			}},
		}},
		{"edge 17: a subagent's StopFailure while a permission wait is open keeps the wait", func() *Session { return cardSession(cardSources[5]) }, []seqStep{
			{"marked StopFailure", strp("p1"), subagentStopFailure(), StateNeedsInput, func(t *testing.T, s *Session) {
				require.NotNil(t, s.Attention)
				assert.Equal(t, attentionPermission, s.Attention.Reason)
				assert.Nil(t, s.Failure)
			}},
		}},
		{"edge 18: the background-completion turn's own unmarked StopFailure fails the card", idleCard, []seqStep{
			{"marked StopFailure on the closed parent prompt", strp("p0"), subagentStopFailure(), StateIdle, nil},
			{"background-completion UserPromptSubmit on a fresh id", p2, mainActivity(), StateWorking, nil},
			{"unmarked StopFailure", p2, claudecode.StateInput{Kind: claudecode.KindTurnFailed, FailureError: strp("server_error")}, StateFailed, func(t *testing.T, s *Session) {
				require.NotNil(t, s.Failure)
				assert.Equal(t, "server_error", s.Failure.Error)
			}},
		}},
		{"a subagent's permission wait past the parent's Stop survives the idle_prompt of the prompt it runs under", idleCard, []seqStep{
			{"subagent PermissionRequest on the closed parent prompt", strp("p0"), subagentPermission, StateNeedsInput, nil},
			{"idle_prompt naming the closed prompt is a straggler", strp("p0"), idleNotice(), StateNeedsInput, nil},
		}},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			runSequence(t, tt.start(), tt.steps)
		})
	}
}

// TestApplyInput_LegacyIdleWaitEndsOnAnyAgentsActivity covers REQ-5: unlike a permission
// wait, which another agent's activity leaves alone, a wait with reason idle belongs to
// nobody, so activity from the main agent, the subagent or a second one all land ACTIVE with
// attention cleared.
func TestApplyInput_LegacyIdleWaitEndsOnAnyAgentsActivity(t *testing.T) {
	actors := map[string]claudecode.StateInput{
		"main":       mainActivity(),
		"subagent_a": subagentActivity(nil),
		"subagent_b": {Kind: claudecode.KindTurnActivity, Agent: "agent-b", FromSubagent: true},
	}
	for name, in := range actors {
		t.Run(name, func(t *testing.T) {
			sess := cardSession(cardSources[7])
			sess.Failure = &Failure{Error: "stale", Message: "stale"}

			applyInput(sess, "c1", strp("p1"), in, laterNow())

			assert.Equal(t, StateWorking, sess.State)
			assert.Nil(t, sess.Attention)
			assert.Empty(t, sess.AttentionAgent)
			assert.Nil(t, sess.Failure)
		})
	}
}

// TestApplyInput_SubagentEventsNeverMoveTheLatch covers REQ-12: whatever mode a subagent-
// marked turn-activity event carries, from every latch the main agent could have set, the
// latch and its source stay put and the state follows the held latch; the same event
// unmarked latches as today.
func TestApplyInput_SubagentEventsNeverMoveTheLatch(t *testing.T) {
	latches := []struct {
		name   string
		mode   PermissionMode
		source string
		active State
	}{
		{"plan from a hook", PermissionPlan, "hook", StatePlanning},
		{"default from the seed", PermissionDefault, "seed", StateWorking},
		{"acceptEdits from a hook", PermissionAcceptEdits, "hook", StateWorking},
	}
	modes := []string{"dontAsk", "plan", "default", "acceptEdits", "auto", "bypassPermissions"}

	for _, src := range cardSources {
		for _, latch := range latches {
			for _, mode := range modes {
				t.Run(src.name+"/latch_"+latch.name+"/carrying_"+mode, func(t *testing.T) {
					sess := cardSession(src)
					sess.PermissionMode, sess.PermissionModeSource = latch.mode, latch.source

					applyInput(sess, "c1", strp("p1"), subagentActivity(&mode), laterNow())

					assert.Equal(t, latch.mode, sess.PermissionMode, "REQ-12")
					assert.Equal(t, latch.source, sess.PermissionModeSource, "REQ-12")
					if src.state != StateNeedsInput || src.wait == waitLegacyIdle {
						assert.Equal(t, latch.active, sess.State, "the card follows the latch it still holds")
					}
					assertTurnStateInvariants(t, sess)

					control := cardSession(src)
					control.PermissionMode, control.PermissionModeSource = latch.mode, latch.source
					applyInput(control, "c1", strp("p1"), claudecode.StateInput{Kind: claudecode.KindTurnActivity, PermissionMode: &mode}, laterNow())
					assert.Equal(t, PermissionMode(mode), control.PermissionMode, "an unmarked event latches exactly as before")
					assert.Equal(t, "hook", control.PermissionModeSource)
				})
			}
		}
	}

	t.Run("a marked event carrying no mode and a marked event on a closed prompt also leave the latch", func(t *testing.T) {
		sess := cardSession(cardSources[3])
		sess.PermissionMode, sess.PermissionModeSource = PermissionPlan, "hook"
		mode := "dontAsk"

		applyInput(sess, "c1", strp("p0"), subagentActivity(&mode), laterNow())
		applyInput(sess, "c1", strp("p0"), subagentActivity(nil), laterNow())

		assert.Equal(t, PermissionPlan, sess.PermissionMode)
		assert.Equal(t, "hook", sess.PermissionModeSource)
	})
}

// TestApplyInput_SubagentStopFailureChangesNothing covers REQ-13: from every source state
// and for an open, a closed, an unseen or an absent prompt id, a subagent-marked StopFailure
// moves no field at all, while the unmarked one still fails the card from every state.
func TestApplyInput_SubagentStopFailureChangesNothing(t *testing.T) {
	prompts := map[string]*string{"open": strp("p1"), "closed": strp("p0"), "unseen": strp("p9"), "absent": nil}

	for _, src := range cardSources {
		for name, prompt := range prompts {
			t.Run(src.name+"/marked/"+name, func(t *testing.T) {
				sess := cardSession(src)
				before := *sess

				ended := applyInput(sess, "c1", prompt, subagentStopFailure(), laterNow())

				assert.False(t, ended)
				assert.Equal(t, before, *sess, "REQ-13: no transition, no failure, no prompt closed")
			})

			t.Run(src.name+"/unmarked/"+name, func(t *testing.T) {
				sess := cardSession(src)
				in := claudecode.StateInput{Kind: claudecode.KindTurnFailed, FailureError: strp("server_error")}

				applyInput(sess, "c1", prompt, in, laterNow())

				assert.Equal(t, StateFailed, sess.State, "an unmarked StopFailure behaves as before")
				require.NotNil(t, sess.Failure)
				assert.Equal(t, "server_error", sess.Failure.Error)
				assertTurnStateInvariants(t, sess)
			})
		}
	}
}

// TestApplyInput_CardStateInvariants_D3 crosses each new or changed input with every source
// state (needs_input three ways) and asserts, after every row, INV-A (attention iff
// needs_input, failure iff failed), INV-B (an idle_prompt never ends in needs_input unless
// the card already held a permission wait), INV-C (no compaction input ends in started, for
// the bound session_id, unless the card already was started) and INV-D (unread implies idle)
// (kb:lesson/invariant-missed-by-per-transition-tests).
func TestApplyInput_CardStateInvariants_D3(t *testing.T) {
	type input struct {
		name       string
		in         claudecode.StateInput
		prompt     *string
		compaction bool
		idlePrompt bool
		ownMarker  bool // seed the compaction marker so the prompt is a REQ-6 compaction's
	}
	mode := "dontAsk"
	inputs := []input{
		{name: "idle_prompt/no_id", in: idleNotice(), idlePrompt: true},
		{name: "idle_prompt/open_id", in: idleNotice(), prompt: strp("p1"), idlePrompt: true},
		{name: "idle_prompt/closed_id", in: idleNotice(), prompt: strp("p0"), idlePrompt: true},
		{name: "idle_prompt/unseen_id", in: idleNotice(), prompt: strp("p9"), idlePrompt: true},
		{name: "PreCompact", in: compactionBegan(), prompt: strp(compactionPrompt), compaction: true},
		{name: "compact_SessionStart/own_prompt", in: compactionEnded(), prompt: strp(compactionPrompt), compaction: true, ownMarker: true},
		{name: "compact_SessionStart/other_prompt", in: compactionEnded(), prompt: strp("p1"), compaction: true},
		{name: "subagent_StopFailure", in: subagentStopFailure(), prompt: strp("p1")},
		{name: "subagent_activity_dontAsk", in: subagentActivity(&mode), prompt: strp("p1")},
	}

	for _, src := range cardSources {
		for _, tt := range inputs {
			t.Run(src.name+"/"+tt.name, func(t *testing.T) {
				sess := cardSession(src)
				if tt.ownMarker {
					sess.currentPromptID, sess.compactionPromptID = compactionPrompt, compactionPrompt
				}
				before := *sess

				applyInput(sess, "c1", tt.prompt, tt.in, laterNow())

				assertTurnStateInvariants(t, sess)
				assert.True(t, !sess.Unread || sess.State == StateIdle, "INV-D: unread implies idle (state %s)", sess.State)
				if tt.idlePrompt && sess.State == StateNeedsInput {
					assert.Equal(t, StateNeedsInput, src.state, "INV-B: an idle_prompt never enters needs_input")
					assert.Equal(t, before.Attention, sess.Attention, "INV-B: and never raises or re-stamps a wait")
					assert.Equal(t, waitKindOf(before), waitKindOf(*sess))
				}
				if tt.compaction && sess.State == StateStarted {
					assert.Equal(t, StateStarted, src.state, "INV-C: a compaction input never lands started")
				}
				if tt.name == "subagent_StopFailure" {
					assert.Equal(t, before, *sess, "REQ-13")
				}
				if tt.name == "subagent_activity_dontAsk" {
					assert.Equal(t, before.PermissionMode, sess.PermissionMode, "REQ-12")
					assert.Equal(t, before.PermissionModeSource, sess.PermissionModeSource, "REQ-12")
				}
			})
		}
	}
}

// waitKindOf is the needs_input shape a session holds, "" outside needs_input.
func waitKindOf(sess Session) waitKind {
	switch {
	case sess.State != StateNeedsInput || sess.Attention == nil:
		return waitNone
	case sess.Attention.Reason == attentionIdle:
		return waitLegacyIdle
	case sess.AttentionAgent != "":
		return waitSubagent
	default:
		return waitMain
	}
}
