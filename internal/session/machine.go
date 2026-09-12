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
// vocabulary, so the count is the domain's, not this function's, and the INV-A/INV-F/INV-P
// comments cross-reference between adjacent arms ("also reachable from failed") — splitting
// the switch would strand an invariant's halves in different functions, which no test can
// catch. See kb:adr/lifecycle-prompt-ordering-guards, kb:adr/ingest-monotonic-rebind and
// kb:adr/lifecycle-subagent-marked-events-not-stragglers.
//
//nolint:gocyclo // one arm per wire Kind; splitting strands the cross-referencing INV-A/INV-F/INV-P comments
func applyInput(sess *Session, claudeSessionID string, promptID *string, input claudecode.StateInput, now time.Time) {
	switch input.Kind {
	case claudecode.KindBind, claudecode.KindClearRebind, claudecode.KindResumeBind:
		applyBind(sess, claudeSessionID, input, now)

	case claudecode.KindTurnActivity:
		latchPermissionMode(sess, input.PermissionMode)
		closed := promptID != nil && sess.promptClosed(*promptID)
		if closed && !input.FromSubagent {
			return // straggler past a Stop — persist only, no transition (Edge Case 2)
		}
		// A closed prompt with the subagent marker is a background subagent still
		// working past the parent's Stop (measured 2.1.259, canary-fields.md): it
		// transitions the session like ordinary activity, but the closed prompt is
		// never reopened or adopted as current (INV-P) — only an open/unseen prompt id
		// is adopted here.
		if !closed && promptID != nil {
			sess.currentPromptID = *promptID
		}
		// kb:anchor/ws.session's attention-iff-needs_input / failure-iff-failed invariants (INV-A,
		// INV-F) are unconditional: every transitioning path here — whether the prompt
		// was open or a subagent-marked closed prompt — clears both, so a stale
		// permission wait or failure note never survives into the next working state.
		sess.Attention = nil
		sess.Failure = nil
		sess.setState(sess.activeState(), now)

	case claudecode.KindNeedsInputPermission:
		if promptID != nil && sess.promptClosed(*promptID) && !input.FromSubagent {
			return
		}
		// A subagent-marked PermissionRequest for a closed prompt corroborates a
		// background permission wait (measured 2.1.259) exactly like the open-prompt
		// case — same transition, no prompt reopening.
		sess.Attention = &Attention{Reason: "permission", Since: now}
		// INV-F (kb:anchor/ws.session, unconditional): failure is non-null iff state == failed. This
		// branch always transitions to needs_input, so a failure note carried over
		// from an earlier failed turn (e.g. StopFailure, then a subagent-marked
		// PermissionRequest against that same now-closed prompt) must not survive.
		sess.Failure = nil
		sess.setState(StateNeedsInput, now)

	case claudecode.KindNeedsInputIdle:
		if promptID != nil && sess.promptClosed(*promptID) {
			return
		}
		sess.Attention = &Attention{Reason: "idle", Since: now}
		// INV-F: same reasoning as KindNeedsInputPermission above — this branch is
		// also reachable from failed (an unseen fresh prompt id when the preceding
		// UserPromptSubmit was itself lost), and must not strand a stale failure note.
		sess.Failure = nil
		sess.setState(StateNeedsInput, now)

	case claudecode.KindTurnClosed:
		latchPermissionMode(sess, input.PermissionMode)
		if promptID != nil {
			sess.closePrompt(*promptID)
		}
		sess.Attention = nil
		sess.Failure = nil
		if input.LastActivity != nil {
			text := truncate(*input.LastActivity, 200)
			sess.LastActivity = &text
		}
		sess.setState(StateIdle, now)

	case claudecode.KindTurnFailed:
		if promptID != nil {
			sess.closePrompt(*promptID)
		}
		sess.Attention = nil
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

	case claudecode.KindDeathHint:
		sess.Alive = false
		endedAt := now
		sess.EndedAt = &endedAt

	case claudecode.KindClearDeathHint, claudecode.KindInert:
		// no-op: SessionEnd(reason:"clear") is not a death hint; unknown/inert events
		// persist (already done by the ingest worker) with no state effect.
	}
}

// applyBind handles SessionStart's Bind/ClearRebind (kb:anchor/state.transitions), escalating a
// plain Bind to a clear-rebind when the incoming claude session id differs from one
// already bound on this pane without a clear source (Edge Case 5: loss tolerance).
func applyBind(sess *Session, claudeSessionID string, input claudecode.StateInput, now time.Time) {
	kind := input.Kind
	if sess.ClaudeSessionID != "" && sess.ClaudeSessionID != claudeSessionID {
		kind = claudecode.KindClearRebind
	}

	sess.ClaudeSessionID = claudeSessionID
	if input.Model != nil {
		if sess.Model == nil {
			sess.Model = &Model{ID: *input.Model}
		} else {
			sess.Model.ID = *input.Model
		}
	}

	// kb:anchor/ws.session's attention-iff-needs_input / failure-iff-failed invariants are unconditional:
	// no bind — clear-rebind or a plain re-bind with an unchanged claude session id (e.g.
	// SessionStart(source:"resume"), which per docs/history/spikes/canary-fields.md reuses the
	// original session_id and so never reaches the escalation above) — may land on
	// `started` while still carrying a previous turn's blocked-or-failed note (review
	// cycle 2 Critical 1: this was previously reset only inside the KindClearRebind
	// branch, leaving a plain re-bind able to strand attention/failure).
	sess.Attention = nil
	sess.Failure = nil

	if kind == claudecode.KindClearRebind {
		sess.Compactions = 0
		sess.currentPromptID = ""
		sess.closedPromptIDs = nil
		// /clear starts a fresh conversation: LastActivity resets too — kb:anchor/ws.session: "null until
		// a first Stop". This part is genuinely /clear-only semantics, unlike the
		// attention/failure reset above.
		sess.LastActivity = nil
		// m3-gauges REQ-9: a fresh conversation has no context data yet either — the
		// next status post of the new conversation refills it.
		sess.Context = nil
	}

	// m4-reconcile REQ-8: a same-id resume bind lands in idle and leaves compactions/
	// lastActivity/context alone (history exists; it is waiting for input, not new) —
	// this only runs when kind wasn't escalated to KindClearRebind above, which already
	// took the full-reset/started path a different claude id implies.
	//
	// REQ-8 does not authorise touching `alive` here (review cycle 1 Major 1): INV-1
	// makes tmux pane existence the sole authority for liveness, and this branch runs
	// from a hook payload, which may be queued/late relative to the tmux state it
	// describes. RecordResume already sets `alive` on the real resume path, from the
	// tmux spawn that actually happened; a resume-bind hook that outraces or follows a
	// pane's real death must never override that.
	if kind == claudecode.KindResumeBind {
		sess.setState(StateIdle, now)
		return
	}
	sess.setState(StateStarted, now)
}

func latchPermissionMode(sess *Session, mode *string) {
	if mode == nil {
		return // never resets the latch (REQ-9) — most events carry no permission_mode
	}
	sess.PermissionMode = PermissionMode(*mode)
	sess.PermissionModeSource = "hook"
}
