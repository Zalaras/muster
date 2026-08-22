package claudecode

import (
	"encoding/json"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/Zalaras/muster/internal/claudecode/claudecodetest"
)

// TestInterpret_SessionStart covers the three measured source values
// (spikes/canary-fields.md "Values worth asserting": startup/resume/clear all
// observed) and the optional model field, which has been measured both absent and
// present — never assume it's there.
func TestInterpret_SessionStart(t *testing.T) {
	t.Run("startup binds and carries no permission_mode (never present per canary-fields.md)", func(t *testing.T) {
		body := claudecodetest.EnvelopedSessionStart("claude-1", claudecodetest.SessionStartOpts{Source: "startup"})
		payload := innerPayload(t, body)

		in := Interpret("SessionStart", payload)

		assert.Equal(t, KindBind, in.Kind)
		assert.Nil(t, in.PermissionMode)
	})

	t.Run("resume binds (same session id path, still a Bind kind at the interpreter level)", func(t *testing.T) {
		body := claudecodetest.EnvelopedSessionStart("claude-1", claudecodetest.SessionStartOpts{Source: "resume"})
		payload := innerPayload(t, body)

		in := Interpret("SessionStart", payload)

		assert.Equal(t, KindBind, in.Kind)
	})

	t.Run("clear source is a clear-rebind", func(t *testing.T) {
		body := claudecodetest.EnvelopedSessionStart("claude-2", claudecodetest.SessionStartOpts{Source: "clear"})
		payload := innerPayload(t, body)

		in := Interpret("SessionStart", payload)

		assert.Equal(t, KindClearRebind, in.Kind)
	})

	t.Run("model present as a plain string extracts it (measured shape, spikes/canary-fields.md)", func(t *testing.T) {
		body := claudecodetest.EnvelopedSessionStart("claude-1", claudecodetest.SessionStartOpts{
			Source: "startup", ModelID: "claude-haiku-4-5-20251001",
		})
		payload := innerPayload(t, body)

		in := Interpret("SessionStart", payload)

		require.NotNil(t, in.Model)
		assert.Equal(t, "claude-haiku-4-5-20251001", *in.Model)
	})

	t.Run("model present as a plain string via a raw (non-enveloped) payload extracts it too", func(t *testing.T) {
		payload := []byte(`{"hook_event_name":"SessionStart","session_id":"claude-1","source":"startup","model":"claude-sonnet-4-5"}`)

		in := Interpret("SessionStart", payload)

		require.NotNil(t, in.Model)
		assert.Equal(t, "claude-sonnet-4-5", *in.Model)
	})

	// The {id, display_name} object shape modelID used to also accept was speculative
	// (review Major 11) and was dropped once the interface probe settled SessionStart's
	// model as a plain string only — the status line is the one place that shape is
	// real. A payload carrying it here must now be treated as absent, not extracted.
	t.Run("model present as an {id, display_name} object (the status-line shape) is not extracted here", func(t *testing.T) {
		payload := []byte(`{"hook_event_name":"SessionStart","session_id":"claude-1","source":"startup","model":{"id":"claude-haiku-4-5-20251001","display_name":"Haiku 4.5"}}`)

		in := Interpret("SessionStart", payload)

		assert.Nil(t, in.Model, "the object shape was never real for SessionStart; modelID must not extract from it")
	})

	t.Run("model absent (measured on one startup capture and on clear) leaves it nil", func(t *testing.T) {
		body := claudecodetest.EnvelopedSessionStart("claude-1", claudecodetest.SessionStartOpts{Source: "startup", OmitModel: true})
		payload := innerPayload(t, body)

		in := Interpret("SessionStart", payload)

		assert.Nil(t, in.Model)
	})
}

// TestInterpret_TurnActivityEvents covers UserPromptSubmit/PreToolUse/PostToolUse, all
// of which always carry permission_mode per canary-fields.md's measured split.
func TestInterpret_TurnActivityEvents(t *testing.T) {
	for _, event := range []string{"UserPromptSubmit", "PreToolUse", "PostToolUse"} {
		t.Run(event, func(t *testing.T) {
			payload := []byte(`{"hook_event_name":"` + event + `","session_id":"c1","prompt_id":"p1","permission_mode":"plan"}`)

			in := Interpret(event, payload)

			assert.Equal(t, KindTurnActivity, in.Kind)
			require.NotNil(t, in.PermissionMode)
			assert.Equal(t, "plan", *in.PermissionMode)
		})
	}
}

// TestInterpret_Notification covers both observed notification_type values
// (canary-fields.md) and the never-present permission_mode on this event.
func TestInterpret_Notification(t *testing.T) {
	t.Run("permission_prompt maps to needs_input_permission", func(t *testing.T) {
		body := claudecodetest.RawNotification("c1", "p1", "permission_prompt")

		in := Interpret("Notification", []byte(body))

		assert.Equal(t, KindNeedsInputPermission, in.Kind)
	})

	t.Run("idle_prompt maps to needs_input_idle", func(t *testing.T) {
		body := claudecodetest.RawNotification("c1", "p1", "idle_prompt")

		in := Interpret("Notification", []byte(body))

		assert.Equal(t, KindNeedsInputIdle, in.Kind)
	})

	t.Run("an unrecognized notification_type (e.g. auth_success) is inert", func(t *testing.T) {
		body := claudecodetest.RawNotification("c1", "p1", "auth_success")

		in := Interpret("Notification", []byte(body))

		assert.Equal(t, KindInert, in.Kind)
	})
}

// TestInterpret_PermissionRequest covers protocol §7.3's permission-request
// corroboration path; permission_mode is always present on this event.
func TestInterpret_PermissionRequest(t *testing.T) {
	body := claudecodetest.RawPermissionRequest("c1", "p1")

	in := Interpret("PermissionRequest", []byte(body))

	assert.Equal(t, KindNeedsInputPermission, in.Kind)
	require.NotNil(t, in.PermissionMode)
	assert.Equal(t, "default", *in.PermissionMode)
}

// TestInterpret_Stop covers the turn-closed path, including the truncation-relevant
// last_assistant_message field (truncation itself is internal/session's job).
func TestInterpret_Stop(t *testing.T) {
	body := claudecodetest.RawStop("c1", claudecodetest.StopOpts{
		PromptID: "p1", PermissionMode: "acceptEdits", LastAssistantMessage: "all done",
	})

	in := Interpret("Stop", []byte(body))

	assert.Equal(t, KindTurnClosed, in.Kind)
	require.NotNil(t, in.PermissionMode)
	assert.Equal(t, "acceptEdits", *in.PermissionMode)
	require.NotNil(t, in.LastActivity)
	assert.Equal(t, "all done", *in.LastActivity)
}

// TestInterpret_StopFailure covers D13's premise directly at the interpreter level:
// StopFailure never carries permission_mode (canary-fields.md's "Never present" list),
// so PermissionMode must always come back nil here — the machine relies on this to
// justify never touching the latch on a failure.
func TestInterpret_StopFailure(t *testing.T) {
	body := claudecodetest.RawStopFailure("c1", claudecodetest.StopFailureOpts{
		PromptID: "p1", Error: "server_error", LastAssistantMessage: "API error ended the turn",
	})

	in := Interpret("StopFailure", []byte(body))

	assert.Equal(t, KindTurnFailed, in.Kind)
	assert.Nil(t, in.PermissionMode)
	require.NotNil(t, in.FailureError)
	assert.Equal(t, "server_error", *in.FailureError)
	require.NotNil(t, in.LastActivity)
	assert.Equal(t, "API error ended the turn", *in.LastActivity)
}

// TestInterpret_StopFailure_EmptyErrorYieldsNilFailureError covers review Minor 11:
// StopFailure.error is a plain (non-pointer) string field on the wire, but a
// StopFailure payload with no error field at all must surface as a nil FailureError,
// not a pointer to "" — otherwise the card would render a bare " — message" note with
// no error token. Interpret only takes the field's address when it is non-empty.
func TestInterpret_StopFailure_EmptyErrorYieldsNilFailureError(t *testing.T) {
	in := Interpret("StopFailure", []byte(`{"hook_event_name":"StopFailure","session_id":"c1"}`))

	assert.Nil(t, in.FailureError)
}

func TestInterpret_PreCompact(t *testing.T) {
	body := claudecodetest.RawPreCompact("c1", "p1")

	in := Interpret("PreCompact", []byte(body))

	assert.Equal(t, KindCompaction, in.Kind)
}

// TestInterpret_SessionEnd covers REQ-10/D15: reason "clear" must never be read as a
// death hint; any other reason (including "other", which covers both a killed pane and
// ordinary termination per canary-fields.md) is one.
func TestInterpret_SessionEnd(t *testing.T) {
	t.Run(`reason "clear" is not a death hint`, func(t *testing.T) {
		body := claudecodetest.RawSessionEnd("c1", "clear")

		in := Interpret("SessionEnd", []byte(body))

		assert.Equal(t, KindClearDeathHint, in.Kind)
	})

	t.Run(`reason "other" is a death hint`, func(t *testing.T) {
		body := claudecodetest.RawSessionEnd("c1", "other")

		in := Interpret("SessionEnd", []byte(body))

		assert.Equal(t, KindDeathHint, in.Kind)
	})
}

// TestInterpret_InertAndForwardCompatibility covers §7.3's last row: SubagentStop and
// the status-line event type are inert by design, and any wholly unrecognized
// hook_event_name (forward compatibility with a future Claude Code version) is inert
// rather than erroring.
func TestInterpret_InertAndForwardCompatibility(t *testing.T) {
	for _, eventType := range []string{"SubagentStop", "status_line", "SomeFutureHookNobodyHasSeenYet"} {
		t.Run(eventType, func(t *testing.T) {
			in := Interpret(eventType, []byte(`{}`))
			assert.Equal(t, KindInert, in.Kind)
		})
	}
}

// TestInterpret_MalformedPayloadNeverPanics documents that Interpret degrades to its
// zero-value fields rather than panicking on unparseable JSON — the ingest worker has
// already parsed the outer envelope by the time Interpret runs, but a partially-shaped
// inner payload must still be handled gracefully.
func TestInterpret_MalformedPayloadNeverPanics(t *testing.T) {
	for _, eventType := range []string{"SessionStart", "UserPromptSubmit", "Notification", "PermissionRequest", "Stop", "StopFailure", "SessionEnd"} {
		t.Run(eventType, func(t *testing.T) {
			assert.NotPanics(t, func() {
				Interpret(eventType, []byte(`not json`))
			})
		})
	}
}

// innerPayload extracts the "payload" field from an enveloped body — the shape
// Interpret actually receives (the ingest worker unwraps the envelope before calling
// it), mirroring what claudecode.ParseIngestBody hands the caller.
func innerPayload(t *testing.T, envelopedBody string) []byte {
	t.Helper()
	var env struct {
		Payload json.RawMessage `json:"payload"`
	}
	require.NoError(t, json.Unmarshal([]byte(envelopedBody), &env))
	return env.Payload
}
