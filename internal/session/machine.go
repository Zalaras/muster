package session

import (
	"time"

	"github.com/Zalaras/muster/internal/claudecode"
)

// applyInput mutates sess per kb:anchor/state.transitions / kb:anchor/state.ordering, given the already-resolved
// claudeSessionID and promptID (generic identifiers — not Claude Code payload
// vocabulary) and the neutral StateInput the claudecode interpreter derived. Callers
// hold the manager's lock.
//
// Deliberately exceeds the complexity ceiling. Every arm is one Kind of the wire
// vocabulary, so the count is the domain's, not this function's, and the
// attention/failure/prompt-adoption invariant comments cross-reference between adjacent
// arms ("also reachable from failed") — splitting the switch would strand an invariant's
// halves in different functions, which no test can catch. See
// kb:adr/lifecycle-prompt-ordering-guards, kb:adr/ingest-monotonic-rebind and
// kb:adr/lifecycle-subagent-marked-events-not-stragglers.
//
//nolint:gocyclo // one arm per wire Kind; splitting strands the cross-referencing attention/failure/prompt invariant comments
func applyInput(sess *Session, claudeSessionID string, promptID *string, input claudecode.StateInput, now time.Time) (turnEnded bool) {
	switch input.Kind {
	case claudecode.KindBind, claudecode.KindClearRebind, claudecode.KindResumeBind:
		applyBind(sess, claudeSessionID, input, now)

	case claudecode.KindCompactionEnded:
		return applyCompactionEnded(sess, claudeSessionID, promptID, input, now)

	case claudecode.KindTurnActivity:
		latchPermissionMode(sess, input)
		closed := promptID != nil && sess.promptClosed(*promptID)
		if closed && !input.FromSubagent {
			return false
		}
		// A closed prompt with the subagent marker is a background subagent still
		// working past the parent's Stop (kb:fact/subagent-hooks-carry-agent-id): it
		// transitions the session like ordinary activity, but the closed prompt id
		// itself is never reopened or adopted as current — only an open/unseen prompt id
		// is adopted here.
		if !closed && promptID != nil {
			sess.currentPromptID = *promptID
		}
		// The adapter (internal/claudecode) supplies Prompt only for a genuine user
		// prompt, never a synthetic background-completion re-invocation; a straggler
		// past a Stop already returned above, so reaching here means this isn't one.
		if input.Prompt != nil {
			text := truncate(*input.Prompt, 200)
			sess.LastPrompt = &text
		}
		// Another agent's activity neither clears a permission wait nor leaves needs_input
		// (INV-B, kb:adr/lifecycle-attention-owned-by-raising-agent): the latch and prompt
		// adoption above already happened, nothing below does.
		if sess.permissionWaitOwnedByOther(input.Agent) {
			return false
		}
		// kb:anchor/ws.session's attention-iff-needs_input / failure-iff-failed
		// invariants are unconditional: every transitioning path here — whether the
		// prompt was open or a subagent-marked closed prompt — clears both, so a stale
		// permission wait or failure note never survives into the next working state.
		sess.clearAttention()
		sess.Failure = nil
		sess.setState(sess.activeState(), now)

	case claudecode.KindNeedsInputPermission:
		if promptID != nil && sess.promptClosed(*promptID) && !input.FromSubagent {
			return false
		}
		// A subagent-marked PermissionRequest for a closed prompt corroborates a
		// background permission wait (measured 2.1.259) exactly like the open-prompt
		// case — same transition, no prompt reopening.
		// A Notification cannot name its agent, so a wait already raised keeps its owner;
		// otherwise the raising event's own agent owns it.
		if !input.AgentUnknown || sess.State != StateNeedsInput {
			sess.AttentionAgent = input.Agent
		}
		sess.Attention = &Attention{Reason: attentionPermission, Since: now}
		// kb:anchor/ws.session's failure-iff-failed invariant is unconditional: this
		// branch always transitions to needs_input, so a failure note carried over
		// from an earlier failed turn (e.g. StopFailure, then a subagent-marked
		// PermissionRequest against that same now-closed prompt) must not survive.
		sess.Failure = nil
		sess.setState(StateNeedsInput, now)

	case claudecode.KindIdleNotice:
		return applyIdleNotice(sess, promptID, now)

	case claudecode.KindTurnClosed:
		return applyTurnClosed(sess, promptID, input, now)

	case claudecode.KindTurnInterrupted:
		return applyTurnInterrupted(sess, promptID, now)

	case claudecode.KindTurnFailed:
		if input.FromSubagent {
			return false
		}
		if promptID != nil {
			sess.closePrompt(*promptID)
		}
		sess.clearAttention()
		var errTok, msg string
		if input.FailureError != nil {
			errTok = *input.FailureError
		}
		if input.LastActivity != nil {
			msg = *input.LastActivity
		}
		sess.Failure = &Failure{Error: errTok, Message: msg}
		sess.setState(StateFailed, now)

	case claudecode.KindCompactionBegan:
		applyCompactionBegan(sess, promptID, now)

	case claudecode.KindDeathHint, claudecode.KindClearDeathHint, claudecode.KindInert:
		// no-op: alive comes from the pane check alone
		// (kb:adr/lifecycle-liveness-from-pane-existence) — a non-clear SessionEnd is
		// persisted as a hint but never writes alive/endedAt from a payload.
		// SessionEnd(reason:"clear") is not a death hint either; unknown/inert events
		// persist (already done by the ingest worker) with no state effect.
	}
	return false
}

// applyBind handles SessionStart's Bind/ClearRebind (kb:anchor/state.transitions),
// escalating a plain Bind to a clear-rebind when the incoming claude session id differs
// from one already bound on this pane without a clear source — delivery is lossy, so the
// daemon cannot rely on having seen the intervening SessionEnd
// (kb:fact/hook-delivery-best-effort).
func applyBind(sess *Session, claudeSessionID string, input claudecode.StateInput, now time.Time) {
	kind := input.Kind
	if sess.ClaudeSessionID != "" && sess.ClaudeSessionID != claudeSessionID {
		kind = claudecode.KindClearRebind
	}

	bindIdentity(sess, claudeSessionID, input.Model)

	// kb:anchor/ws.session's attention-iff-needs_input / failure-iff-failed invariants
	// are unconditional: no bind — clear-rebind or a plain re-bind with an unchanged
	// claude session id (e.g. SessionStart(source:"resume"), which per
	// kb:fact/resume-keeps-session-identity reuses the original session_id and so never
	// reaches the escalation above) — may land on `started` while still carrying a
	// previous turn's blocked-or-failed note. This reset covers both the clear-rebind
	// and the plain re-bind path, not just clear-rebind.
	sess.clearAttention()
	sess.Failure = nil

	if kind == claudecode.KindClearRebind {
		sess.Compactions = 0
		sess.BackgroundTasks = 0
		sess.currentPromptID = ""
		// closedPromptIDs survives: prompt ids are unique per conversation, so the new
		// conversation never collides with them, and keeping them lets a straggler
		// idle_prompt from the old conversation read as already-closed.
		// /clear starts a fresh conversation: LastActivity resets too — kb:anchor/ws.session: "null until
		// a first Stop". This part is genuinely /clear-only semantics, unlike the
		// attention/failure reset above.
		sess.LastActivity = nil
		// A fresh conversation has no context data yet either
		// (kb:adr/usage-context-gauge-shows-tokens-and-compactions) — the next status
		// post of the new conversation refills it.
		sess.Context = nil
		// A fresh conversation has no prompt yet either — kb:anchor/ws.session:
		// "null until a first prompt and again after /clear".
		sess.LastPrompt = nil
	}

	// A same-id resume bind lands in idle and leaves compactions/lastActivity/context
	// alone — history exists; it is waiting for input, not new
	// (kb:adr/lifecycle-resume-rebinds-existing-session). This only runs when kind
	// wasn't escalated to KindClearRebind above, which already took the
	// full-reset/started path a different claude id implies.
	//
	// This never touches `alive`: pane existence is the sole authority for liveness
	// (kb:adr/lifecycle-liveness-from-pane-existence), and this branch runs from a hook
	// payload, which may be queued/late relative to the tmux state it describes.
	// RecordResume already sets `alive` on the real resume path, from the tmux spawn
	// that actually happened; a resume-bind hook that outraces or follows a pane's real
	// death must never override that.
	if kind == claudecode.KindResumeBind {
		sess.BackgroundTasks = 0
		sess.setState(StateIdle, now)
		return
	}
	sess.setState(StateStarted, now)
}

func bindIdentity(sess *Session, claudeSessionID string, model *string) {
	sess.ClaudeSessionID = claudeSessionID
	sess.pendingResumeClaudeSessionID = ""
	if model != nil && (sess.Model == nil || sess.Model.ID != *model) {
		// A fresh pointer, never a field written into the old one: List/Get hand out
		// Clone()s that share this *Model, and Session.Clone's contract is that a changed
		// model is always a new pointer, never mutated in place. A bind naming the model
		// already held changes nothing, so a display name the status line confirmed
		// survives; a different id shows as itself until the status line confirms a name
		// (kb:adr/lifecycle-bind-model-display-name-is-id).
		sess.Model = &Model{ID: *model, DisplayName: *model}
	}
}

func latchPermissionMode(sess *Session, input claudecode.StateInput) {
	if input.PermissionMode == nil || input.FromSubagent {
		return // never resets the latch (kb:fact/permission-mode-presence-split) — most events carry no permission_mode
	}
	sess.PermissionMode = PermissionMode(*input.PermissionMode)
	sess.PermissionModeSource = "hook"
}

func endTurnIntoIdle(sess *Session, now time.Time) (turnEnded bool) {
	sess.clearAttention()
	sess.Failure = nil
	sess.setState(StateIdle, now)
	return true
}

// applyTurnClosed applies a Stop: closes the prompt, captures the Stop's fields, and
// goes idle unless a subagent's permission wait outlives the main turn. Callers hold
// the manager's lock.
func applyTurnClosed(sess *Session, promptID *string, input claudecode.StateInput, now time.Time) (turnEnded bool) {
	latchPermissionMode(sess, input)
	if promptID != nil {
		sess.closePrompt(*promptID)
	}
	if input.LastActivity != nil {
		text := truncate(*input.LastActivity, 200)
		sess.LastActivity = &text
	}
	if input.BackgroundTasks != nil {
		sess.BackgroundTasks = *input.BackgroundTasks
	}
	// The main turn ending does not end a wait a subagent raised: the prompt is closed
	// and the Stop's fields captured, but the session stays in needs_input
	// (kb:adr/lifecycle-attention-owned-by-raising-agent).
	if sess.State == StateNeedsInput && sess.AttentionAgent != "" {
		return false
	}
	return endTurnIntoIdle(sess, now)
}

// applyTurnInterrupted applies the transcript sweep's interrupt verdict. Only the
// daemon's sweep produces this kind, and it decided on a snapshot: re-check under the
// lock that the prompt is still the current one of an open turn. Callers hold the
// manager's lock.
func applyTurnInterrupted(sess *Session, promptID *string, now time.Time) (turnEnded bool) {
	if promptID == nil || sess.currentPromptID != *promptID || !sess.inOpenTurn() {
		return false
	}
	sess.closePrompt(*promptID)
	return endTurnIntoIdle(sess, now)
}

func applyIdleNotice(sess *Session, promptID *string, now time.Time) (turnEnded bool) {
	if promptID == nil || sess.promptClosed(*promptID) {
		return false
	}
	endsTurn := sess.State == StateWorking || sess.State == StatePlanning || sess.idleWait()
	sess.closePrompt(*promptID)
	if !endsTurn {
		return false
	}
	if sess.currentPromptID != "" {
		sess.closePrompt(sess.currentPromptID)
	}
	return endTurnIntoIdle(sess, now)
}

func applyCompactionBegan(sess *Session, promptID *string, now time.Time) {
	sess.Compactions++
	if sess.inOpenTurn() {
		return
	}
	if promptID != nil {
		sess.currentPromptID = *promptID
		sess.compactionPromptID = *promptID
	}
	sess.clearAttention()
	sess.Failure = nil
	sess.setState(StateWorking, now)
}

func applyCompactionEnded(sess *Session, claudeSessionID string, promptID *string, input claudecode.StateInput, now time.Time) (turnEnded bool) {
	if sess.ClaudeSessionID == claudeSessionID {
		bindIdentity(sess, claudeSessionID, input.Model)
	}
	if promptID == nil || !sess.compactionOpen(*promptID) {
		return false
	}
	sess.closePrompt(*promptID)
	return endTurnIntoIdle(sess, now)
}
