package claudecode

import "encoding/json"

// InputKind is the neutral vocabulary the kb:anchor/state state machine (internal/session) operates
// on. This is the whole interface between the two packages: internal/session never
// reads a Claude Code payload key or event name (CLAUDE.md hard rule) — only these
// values. (Named InputKind, not Kind, to avoid colliding with the ingest Kind type
// (KindHook/KindStatus) already declared in this package by ingest.go.)
type InputKind string

const (
	KindBind                 InputKind = "bind"
	KindClearRebind          InputKind = "clear_rebind"
	KindResumeBind           InputKind = "resume_bind"
	KindTurnActivity         InputKind = "turn_activity"
	KindNeedsInputPermission InputKind = "needs_input_permission"
	KindNeedsInputIdle       InputKind = "needs_input_idle"
	KindTurnClosed           InputKind = "turn_closed"
	KindTurnFailed           InputKind = "turn_failed"
	KindCompaction           InputKind = "compaction"
	KindDeathHint            InputKind = "death_hint"
	KindClearDeathHint       InputKind = "clear_death_hint"
	KindInert                InputKind = "inert"
)

// StateInput is what Interpret derives from one persisted event's type + payload: the
// kb:anchor/state.transitions transition table's own vocabulary, plus the neutral fields the state machine
// needs to carry forward. Nothing here is a Claude Code field name.
type StateInput struct {
	Kind InputKind

	// PermissionMode is set only when the payload carried permission_mode (the latch's
	// "source:hook" case) — nil means "this event never carries the field", never "reset
	// to unknown" (REQ-9).
	PermissionMode *string

	// Model is SessionStart's optional model id, when present.
	Model *string

	// FailureError is StopFailure's raw error token, displayed verbatim and never
	// switched on (H2: the taxonomy isn't 1:1).
	FailureError *string

	// LastActivity is a closing Stop/StopFailure's last_assistant_message, verbatim
	// (daemon-side truncation to 200 chars is internal/session's job, not a wire-format
	// concern).
	LastActivity *string

	// FromSubagent is true iff the payload carries the subagent agent marker (measured
	// 2.1.259, canary-fields.md "Subagent and background-task fields": a background
	// subagent's PreToolUse/PostToolUse/PermissionRequest carry the parent turn's
	// prompt_id plus an agent id key that main-agent hooks never carry — not even null).
	// It is derived only for the turn-activity events and PermissionRequest; every other
	// event (including Notification, which never carries the marker) leaves this false.
	// internal/session sees only this neutral bool, never the marker's payload key name.
	FromSubagent bool
}

// Interpret derives the neutral StateInput for one persisted event. eventType is the
// event.type column's value (a hook_event_name verbatim, or "status_line"); payload is
// its verbatim inner JSON. This is the only function in Muster that reads
// event-type-specific payload keys (canary-fields.md is the field inventory).
func Interpret(eventType string, payload []byte) StateInput {
	switch eventType {
	case "SessionStart":
		return interpretSessionStart(payload)
	case "UserPromptSubmit", "PreToolUse", "PostToolUse":
		var f struct {
			PermissionMode *string `json:"permission_mode"`
			AgentID        *string `json:"agent_id"`
		}
		_ = json.Unmarshal(payload, &f)
		return StateInput{Kind: KindTurnActivity, PermissionMode: f.PermissionMode, FromSubagent: f.AgentID != nil}
	case "Notification":
		return interpretNotification(payload)
	case "PermissionRequest":
		var f struct {
			PermissionMode *string `json:"permission_mode"`
			AgentID        *string `json:"agent_id"`
		}
		_ = json.Unmarshal(payload, &f)
		return StateInput{Kind: KindNeedsInputPermission, PermissionMode: f.PermissionMode, FromSubagent: f.AgentID != nil}
	case "Stop":
		var f struct {
			PermissionMode       *string `json:"permission_mode"`
			LastAssistantMessage *string `json:"last_assistant_message"`
		}
		_ = json.Unmarshal(payload, &f)
		return StateInput{Kind: KindTurnClosed, PermissionMode: f.PermissionMode, LastActivity: f.LastAssistantMessage}
	case "StopFailure":
		var f struct {
			Error                string  `json:"error"`
			LastAssistantMessage *string `json:"last_assistant_message"`
		}
		_ = json.Unmarshal(payload, &f)
		in := StateInput{Kind: KindTurnFailed, LastActivity: f.LastAssistantMessage}
		// nil (not a pointer to "") when the payload carried no error field — a StopFailure
		// with an absent error must not render as a bare " — message" note (review Minor 11).
		if f.Error != "" {
			in.FailureError = &f.Error
		}
		return in
	case "PreCompact":
		return StateInput{Kind: KindCompaction}
	case "SessionEnd":
		return interpretSessionEnd(payload)
	case "SubagentStop", "status_line":
		return StateInput{Kind: KindInert}
	default:
		// Unknown hook_event_name: persist + log (done by the caller); inert here
		// (forward compatibility, kb:anchor/state.transitions's last row).
		return StateInput{Kind: KindInert}
	}
}

func interpretSessionStart(payload []byte) StateInput {
	var f struct {
		Source string          `json:"source"`
		Model  json.RawMessage `json:"model"`
	}
	_ = json.Unmarshal(payload, &f)

	kind := KindBind
	switch f.Source {
	case "clear":
		kind = KindClearRebind
	case "resume":
		// m4-reconcile REQ-8: a resume bind lands in idle (history exists; it is waiting
		// for input, not new) unless applyBind escalates it to a clear-rebind because the
		// claude session id actually changed (Edge Case 5 loss tolerance).
		kind = KindResumeBind
	}

	in := StateInput{Kind: kind}
	if id := modelID(f.Model); id != "" {
		in.Model = &id
	}
	return in
}

// modelID extracts a model id from SessionStart's optional `model` field. Settled by
// measurement (interface probe, 2026-08-22, docs/history/spikes/canary-fields.md "Values worth
// asserting" → SessionStart.model): when present it is always a plain model-id string
// (e.g. "claude-haiku-4-5-20251001") — never the {id, display_name} object shape the
// status line uses. The object-shape branch this function used to also accept was
// speculative (review Major 11) and is dropped now that the wire shape is known.
func modelID(raw json.RawMessage) string {
	if len(raw) == 0 {
		return ""
	}
	var s string
	if err := json.Unmarshal(raw, &s); err == nil {
		return s
	}
	return ""
}

func interpretNotification(payload []byte) StateInput {
	var f struct {
		NotificationType string `json:"notification_type"`
	}
	_ = json.Unmarshal(payload, &f)
	switch f.NotificationType {
	case "permission_prompt":
		return StateInput{Kind: KindNeedsInputPermission}
	case "idle_prompt":
		return StateInput{Kind: KindNeedsInputIdle}
	default:
		return StateInput{Kind: KindInert}
	}
}

func interpretSessionEnd(payload []byte) StateInput {
	var f struct {
		Reason string `json:"reason"`
	}
	_ = json.Unmarshal(payload, &f)
	if f.Reason == "clear" {
		return StateInput{Kind: KindClearDeathHint}
	}
	return StateInput{Kind: KindDeathHint}
}
