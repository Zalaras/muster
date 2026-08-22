package session

import (
	"time"

	"github.com/Zalaras/muster/internal/claudecode"
)

// applyInput mutates sess per protocol §7.3/§7.4, given the already-resolved
// claudeSessionID and promptID (generic identifiers — not Claude Code payload
// vocabulary) and the neutral StateInput the claudecode interpreter derived. Callers
// hold the manager's lock.
func applyInput(sess *Session, claudeSessionID string, promptID *string, input claudecode.StateInput, now time.Time) {
	switch input.Kind {
	case claudecode.KindBind, claudecode.KindClearRebind:
		applyBind(sess, claudeSessionID, input, now)

	case claudecode.KindTurnActivity:
		latchPermissionMode(sess, input.PermissionMode)
		if promptID != nil && sess.promptClosed(*promptID) {
			return // straggler past a Stop — persist only, no transition (Edge Case 2)
		}
		if promptID != nil {
			sess.currentPromptID = *promptID
		}
		sess.setState(sess.activeState(), now)

	case claudecode.KindNeedsInputPermission:
		if promptID != nil && sess.promptClosed(*promptID) {
			return
		}
		sess.Attention = &Attention{Reason: "permission", Since: now}
		sess.setState(StateNeedsInput, now)

	case claudecode.KindNeedsInputIdle:
		if promptID != nil && sess.promptClosed(*promptID) {
			return
		}
		sess.Attention = &Attention{Reason: "idle", Since: now}
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

// applyBind handles SessionStart's Bind/ClearRebind (protocol §7.3), escalating a
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

	// §5.3's attention-iff-needs_input / failure-iff-failed invariants are unconditional:
	// no bind — clear-rebind or a plain re-bind with an unchanged claude session id (e.g.
	// SessionStart(source:"resume"), which per spikes/canary-fields.md reuses the
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
		// /clear starts a fresh conversation: LastActivity resets too — §5.3: "null until
		// a first Stop". This part is genuinely /clear-only semantics, unlike the
		// attention/failure reset above.
		sess.LastActivity = nil
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
