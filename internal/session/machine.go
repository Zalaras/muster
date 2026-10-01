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
func applyInput(sess *Session, claudeSessionID string, promptID *string, input claudecode.StateInput, now time.Time) {
	switch input.Kind {
	case claudecode.KindBind, claudecode.KindClearRebind, claudecode.KindResumeBind:
		applyBind(sess, claudeSessionID, input, now)

	case claudecode.KindTurnActivity:
		latchPermissionMode(sess, input.PermissionMode)
		closed := promptID != nil && sess.promptClosed(*promptID)
		if closed && !input.FromSubagent {
			return // straggler past a Stop — persist only, no transition
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
		if sess.waitOwnedByOther(input.Agent) {
			return
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
			return
		}
		// A subagent-marked PermissionRequest for a closed prompt corroborates a
		// background permission wait (measured 2.1.259) exactly like the open-prompt
		// case — same transition, no prompt reopening.
		// A Notification cannot name its agent, so a wait already raised keeps its owner;
		// otherwise the raising event's own agent owns it.
		if !input.AgentUnknown || sess.State != StateNeedsInput {
			sess.AttentionAgent = input.Agent
		}
		sess.Attention = &Attention{Reason: "permission", Since: now}
		// kb:anchor/ws.session's failure-iff-failed invariant is unconditional: this
		// branch always transitions to needs_input, so a failure note carried over
		// from an earlier failed turn (e.g. StopFailure, then a subagent-marked
		// PermissionRequest against that same now-closed prompt) must not survive.
		sess.Failure = nil
		sess.setState(StateNeedsInput, now)

	case claudecode.KindNeedsInputIdle:
		// An idle_prompt with no prompt id follows /clear and says nothing about the new
		// conversation (kb:fact/clear-idle-prompt-carries-no-prompt-id): persist only.
		if promptID == nil || sess.promptClosed(*promptID) {
			return
		}
		sess.AttentionAgent = ""
		sess.Attention = &Attention{Reason: "idle", Since: now}
		// Same reasoning as KindNeedsInputPermission above — this branch is also
		// reachable from failed (an unseen fresh prompt id when the preceding
		// turn-activity event was itself lost), and must not strand a stale failure note.
		sess.Failure = nil
		sess.setState(StateNeedsInput, now)

	case claudecode.KindTurnClosed:
		applyTurnClosed(sess, promptID, input, now)

	case claudecode.KindTurnInterrupted:
		applyTurnInterrupted(sess, promptID, now)

	case claudecode.KindTurnFailed:
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

	case claudecode.KindCompaction:
		sess.Compactions++

	case claudecode.KindDeathHint, claudecode.KindClearDeathHint, claudecode.KindInert:
		// no-op: alive comes from the pane check alone
		// (kb:adr/lifecycle-liveness-from-pane-existence) — a non-clear SessionEnd is
		// persisted as a hint but never writes alive/endedAt from a payload.
		// SessionEnd(reason:"clear") is not a death hint either; unknown/inert events
		// persist (already done by the ingest worker) with no state effect.
	}
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

	sess.ClaudeSessionID = claudeSessionID
	// A resume claim (if any) graduates into ClaudeSessionID itself the moment any bind
	// lands, whichever kind: AliveByClaudeSessionID's ordinary ClaudeSessionID match
	// already covers this row from here on, so the separate pending marker is cleared
	// rather than left to shadow a future /clear onto a different id
	// (kb:adr/launch-resume-pending-hold-persisted).
	sess.pendingResumeClaudeSessionID = ""
	if input.Model != nil {
		// A fresh pointer, never a field written into the old one: List/Get hand out
		// Clone()s that share this *Model, and Session.Clone's contract is that a changed
		// model is always a new pointer, never mutated in place. DisplayName is carried
		// over from the previous Model (empty on a new model, stale on an id change) —
		// what the card should show on a bind is a separate, undecided question.
		next := Model{ID: *input.Model}
		if sess.Model != nil {
			next.DisplayName = sess.Model.DisplayName
		}
		sess.Model = &next
	}

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

func latchPermissionMode(sess *Session, mode *string) {
	if mode == nil {
		return // never resets the latch (kb:fact/permission-mode-presence-split) — most events carry no permission_mode
	}
	sess.PermissionMode = PermissionMode(*mode)
	sess.PermissionModeSource = "hook"
}

// applyTurnClosed applies a Stop: closes the prompt, captures the Stop's fields, and
// goes idle unless a subagent's permission wait outlives the main turn. Callers hold
// the manager's lock.
func applyTurnClosed(sess *Session, promptID *string, input claudecode.StateInput, now time.Time) {
	latchPermissionMode(sess, input.PermissionMode)
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
		return
	}
	sess.clearAttention()
	sess.Failure = nil
	sess.setState(StateIdle, now)
}

// applyTurnInterrupted applies the transcript sweep's interrupt verdict. Only the
// daemon's sweep produces this kind, and it decided on a snapshot: re-check under the
// lock that the prompt is still the current one of an open turn. Callers hold the
// manager's lock.
func applyTurnInterrupted(sess *Session, promptID *string, now time.Time) {
	if promptID == nil || sess.currentPromptID != *promptID || !sess.inOpenTurn() {
		return
	}
	sess.closePrompt(*promptID)
	sess.clearAttention()
	sess.Failure = nil
	sess.setState(StateIdle, now)
}
