package claudecode

import (
	"encoding/json"
	"errors"
	"fmt"
)

// Kind selects which ingest endpoint received the body. The status-line payload carries
// no hook_event_name of its own (docs/history/spikes/canary-fields.md), so the caller must say which
// endpoint it came in on.
type Kind string

const (
	KindHook   Kind = "hook"
	KindStatus Kind = "status"
)

// Event is the neutral, wire-format-free result of parsing an ingest body. Every field
// here is Muster's own; nothing outside this package needs to know hook_event_name,
// session_id, or the envelope's musterSession/tmuxPane keys.
type Event struct {
	SessionID     string
	Type          string // hook_event_name verbatim, or "status_line"
	PromptID      *string
	ToolUseID     *string
	MusterSession *int64
	TmuxPane      *string
	Payload       json.RawMessage // verbatim inner payload
}

// ErrNoSessionID marks an ingest body that is valid JSON but carries no usable
// session_id. Every measured hook and status-line post carries one (canary-fields.md
// "common set"), so this is treated as a drop, the same as malformed JSON.
var ErrNoSessionID = errors.New("ingest body has no usable session_id")

// envelope matches the wrapper the SessionStart and status-line command scripts POST
// (kb:anchor/ingest.envelope): musterSession/tmuxPane from the pane environment, plus the
// verbatim stdin payload. A raw plain-HTTP hook has none of these keys.
type envelope struct {
	MusterSession *int64          `json:"musterSession"`
	TmuxPane      *string         `json:"tmuxPane"`
	Payload       json.RawMessage `json:"payload"`
}

// payloadFields are the inner-payload keys the ingest path needs, common across every
// measured hook and the status line (canary-fields.md).
type payloadFields struct {
	SessionID     string  `json:"session_id"`
	HookEventName string  `json:"hook_event_name"`
	PromptID      *string `json:"prompt_id"`
	ToolUseID     *string `json:"tool_use_id"`
}

// ParseIngestBody detects the envelope shape (a "payload" key present) versus a raw hook
// body, and extracts the fields Muster's ingest path needs. kind decides the persisted
// type for a body with no hook_event_name of its own (the status-line endpoint).
func ParseIngestBody(body []byte, kind Kind) (Event, error) {
	var env envelope
	if err := json.Unmarshal(body, &env); err != nil {
		return Event{}, fmt.Errorf("parsing ingest body: %w", err)
	}

	inner := body
	var musterSession *int64
	var tmuxPane *string
	if len(env.Payload) > 0 {
		inner = env.Payload
		musterSession = env.MusterSession
		tmuxPane = env.TmuxPane
	}

	var fields payloadFields
	if err := json.Unmarshal(inner, &fields); err != nil {
		return Event{}, fmt.Errorf("parsing inner payload: %w", err)
	}
	if fields.SessionID == "" {
		return Event{}, ErrNoSessionID
	}

	eventType := fields.HookEventName
	if kind == KindStatus {
		eventType = "status_line"
	}
	if eventType == "" {
		return Event{}, fmt.Errorf("ingest body has no hook_event_name")
	}

	return Event{
		SessionID:     fields.SessionID,
		Type:          eventType,
		PromptID:      fields.PromptID,
		ToolUseID:     fields.ToolUseID,
		MusterSession: musterSession,
		TmuxPane:      tmuxPane,
		Payload:       json.RawMessage(inner),
	}, nil
}
