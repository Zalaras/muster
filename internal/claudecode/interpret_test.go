package claudecode

import (
	"encoding/json"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/Zalaras/muster/internal/claudecode/claudecodetest"
)

// TestInterpret_SessionStart covers the three measured source values
// (docs/history/spikes/canary-fields.md "Values worth asserting": startup/resume/clear all
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

	t.Run("resume source is a distinct resume-bind kind (m4-reconcile REQ-8: lands in idle, not started)", func(t *testing.T) {
		body := claudecodetest.EnvelopedSessionStart("claude-1", claudecodetest.SessionStartOpts{Source: "resume"})
		payload := innerPayload(t, body)

		in := Interpret("SessionStart", payload)

		assert.Equal(t, KindResumeBind, in.Kind)
	})

	t.Run("clear source is a clear-rebind", func(t *testing.T) {
		body := claudecodetest.EnvelopedSessionStart("claude-2", claudecodetest.SessionStartOpts{Source: "clear"})
		payload := innerPayload(t, body)

		in := Interpret("SessionStart", payload)

		assert.Equal(t, KindClearRebind, in.Kind)
	})

	t.Run("model present as a plain string extracts it (measured shape, docs/history/spikes/canary-fields.md)", func(t *testing.T) {
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
	for _, event := range []string{"UserPromptSubmit", "PreToolUse", "PostToolUse", "PostToolBatch"} {
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

// TestInterpret_PermissionRequest covers kb:anchor/state.transitions's permission-request
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

// TestInterpret_InertAndForwardCompatibility covers kb:anchor/state.transitions's last row: SubagentStop and
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

// TestInterpret_FromSubagentMarker covers REQ-1/D6: FromSubagent is derived only for
// the turn-activity events (UserPromptSubmit/PreToolUse/PostToolUse) and
// PermissionRequest, true iff the payload carries the agent_id key at all (measured
// 2.1.259, canary-fields.md "Subagent and background-task fields": main-agent hooks
// have no agent_id key — not even null) — presence, never the value, per the daemon
// implementation's own decision log. Every other event path (including Notification,
// which never carries the marker on either observed type) leaves it false via the zero
// value.
func TestInterpret_FromSubagentMarker(t *testing.T) {
	t.Run("marked turn-activity events derive FromSubagent true", func(t *testing.T) {
		for _, event := range []string{"UserPromptSubmit", "PreToolUse", "PostToolUse"} {
			t.Run(event, func(t *testing.T) {
				payload := []byte(`{"hook_event_name":"` + event + `","session_id":"c1","prompt_id":"p1","permission_mode":"plan","agent_id":"agent-1","agent_type":"general-purpose"}`)

				in := Interpret(event, payload)

				assert.Equal(t, KindTurnActivity, in.Kind)
				assert.True(t, in.FromSubagent, "an agent_id key present must derive FromSubagent true regardless of its value")
			})
		}
	})

	t.Run("unmarked turn-activity events derive FromSubagent false", func(t *testing.T) {
		for _, event := range []string{"UserPromptSubmit", "PreToolUse", "PostToolUse"} {
			t.Run(event, func(t *testing.T) {
				payload := []byte(`{"hook_event_name":"` + event + `","session_id":"c1","prompt_id":"p1","permission_mode":"plan"}`)

				in := Interpret(event, payload)

				assert.False(t, in.FromSubagent, "no agent_id key at all (main-agent hooks never carry it — canary-fields.md) must derive false")
			})
		}
	})

	t.Run("an explicit agent_id:null (never observed on the wire, but a defensive case) derives FromSubagent false, matching absence", func(t *testing.T) {
		payload := []byte(`{"hook_event_name":"PreToolUse","session_id":"c1","prompt_id":"p1","permission_mode":"default","agent_id":null}`)

		in := Interpret("PreToolUse", payload)

		assert.False(t, in.FromSubagent)
	})

	t.Run("marked PermissionRequest derives FromSubagent true", func(t *testing.T) {
		payload := []byte(`{"hook_event_name":"PermissionRequest","session_id":"c1","prompt_id":"p1","permission_mode":"default","agent_id":"agent-1","agent_type":"general-purpose","tool_name":"Write"}`)

		in := Interpret("PermissionRequest", payload)

		assert.Equal(t, KindNeedsInputPermission, in.Kind)
		assert.True(t, in.FromSubagent)
	})

	t.Run("unmarked PermissionRequest derives FromSubagent false", func(t *testing.T) {
		body := claudecodetest.RawPermissionRequest("c1", "p1")

		in := Interpret("PermissionRequest", []byte(body))

		assert.Equal(t, KindNeedsInputPermission, in.Kind)
		assert.False(t, in.FromSubagent)
	})

	t.Run("Notification never carries the marker on either observed type, so FromSubagent is always false", func(t *testing.T) {
		for _, notificationType := range []string{"permission_prompt", "idle_prompt"} {
			t.Run(notificationType, func(t *testing.T) {
				body := claudecodetest.RawNotification("c1", "p1", notificationType)

				in := Interpret("Notification", []byte(body))

				assert.False(t, in.FromSubagent, "canary-fields.md: a subagent's own Notification permission_prompt carries no agent_id — only its PermissionRequest does")
			})
		}
	})

	t.Run("event kinds outside REQ-1's scope leave FromSubagent false via the zero value even though they're never expected to carry the marker", func(t *testing.T) {
		stopBody := claudecodetest.RawStop("c1", claudecodetest.StopOpts{})
		in := Interpret("Stop", []byte(stopBody))
		assert.False(t, in.FromSubagent)

		failBody := claudecodetest.RawStopFailure("c1", claudecodetest.StopFailureOpts{})
		in = Interpret("StopFailure", []byte(failBody))
		assert.False(t, in.FromSubagent)
	})
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

// TestInterpret_PostToolBatch covers D4's interpreter half: the wire-shaped PostToolBatch
// is turn activity with its permission_mode latched, and the marker derives FromSubagent
// and the opaque Agent id exactly as on PostToolUse (kb:fact/plan-feedback-emits-only-post-tool-batch).
func TestInterpret_PostToolBatch(t *testing.T) {
	tests := []struct {
		name         string
		opts         claudecodetest.ToolFileOpts
		wantMode     string
		wantSubagent bool
		wantAgent    string
	}{
		{"main agent", claudecodetest.ToolFileOpts{PermissionMode: "plan"}, "plan", false, ""},
		{"default permission mode", claudecodetest.ToolFileOpts{}, "default", false, ""},
		{"subagent marker", claudecodetest.ToolFileOpts{AgentID: "agent-a7f3"}, "default", true, "agent-a7f3"},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			in := Interpret("PostToolBatch", []byte(claudecodetest.RawPostToolBatch("c1", tt.opts)))

			assert.Equal(t, KindTurnActivity, in.Kind)
			require.NotNil(t, in.PermissionMode)
			assert.Equal(t, tt.wantMode, *in.PermissionMode)
			assert.Equal(t, tt.wantSubagent, in.FromSubagent)
			assert.Equal(t, tt.wantAgent, in.Agent)
			assert.Nil(t, in.Prompt)
		})
	}
}

// TestInterpret_AgentIdentity covers REQ-3's interpreter half: Agent is the marker's opaque
// id for the events FromSubagent is derived on, "" for the main agent, and a Notification
// permission_prompt is AgentUnknown (it cannot say) while every other kind is not.
func TestInterpret_AgentIdentity(t *testing.T) {
	t.Run("marked PermissionRequest carries the subagent id", func(t *testing.T) {
		in := Interpret("PermissionRequest", []byte(claudecodetest.RawSubagentPermissionRequest("c1", "p1", "agent-a7f3")))

		assert.Equal(t, KindNeedsInputPermission, in.Kind)
		assert.True(t, in.FromSubagent)
		assert.Equal(t, "agent-a7f3", in.Agent)
		assert.False(t, in.AgentUnknown)
	})

	t.Run("unmarked PermissionRequest is the main agent, known", func(t *testing.T) {
		in := Interpret("PermissionRequest", []byte(claudecodetest.RawPermissionRequest("c1", "p1")))

		assert.Empty(t, in.Agent)
		assert.False(t, in.AgentUnknown, "a PermissionRequest names its agent: empty means main")
	})

	t.Run("marked PreToolUse and UserPromptSubmit carry the id", func(t *testing.T) {
		for _, event := range []string{"PreToolUse", "PostToolUse", "UserPromptSubmit"} {
			payload := []byte(`{"hook_event_name":"` + event + `","session_id":"c1","prompt_id":"p1","agent_id":"agent-b","agent_type":"general-purpose"}`)
			assert.Equal(t, "agent-b", Interpret(event, payload).Agent, event)
		}
	})

	t.Run("an explicit agent_id:null is the main agent", func(t *testing.T) {
		in := Interpret("PreToolUse", []byte(`{"hook_event_name":"PreToolUse","session_id":"c1","prompt_id":"p1","agent_id":null}`))

		assert.Empty(t, in.Agent)
		assert.False(t, in.FromSubagent)
	})

	t.Run("a permission_prompt notification cannot say which agent", func(t *testing.T) {
		in := Interpret("Notification", []byte(claudecodetest.RawNotification("c1", "p1", "permission_prompt")))

		assert.Equal(t, KindNeedsInputPermission, in.Kind)
		assert.True(t, in.AgentUnknown)
		assert.Empty(t, in.Agent)
	})

	t.Run("no other event is AgentUnknown", func(t *testing.T) {
		for _, tc := range []struct{ event, body string }{
			{"Notification", claudecodetest.RawNotification("c1", "p1", "idle_prompt")},
			{"Stop", claudecodetest.RawStop("c1", claudecodetest.StopOpts{})},
			{"StopFailure", claudecodetest.RawStopFailure("c1", claudecodetest.StopFailureOpts{})},
			{"PostToolBatch", claudecodetest.RawPostToolBatch("c1", claudecodetest.ToolFileOpts{})},
		} {
			assert.False(t, Interpret(tc.event, []byte(tc.body)).AgentUnknown, tc.event)
		}
	})
}

// TestInterpret_IdlePromptWithAndWithoutPromptID pins the interpreter's half of REQ-1: a
// prompt-less idle_prompt (the shape after /clear) still interprets as needs_input_idle;
// the machine, which sees no prompt id, is what makes it a no-op.
func TestInterpret_IdlePromptWithAndWithoutPromptID(t *testing.T) {
	in := Interpret("Notification", []byte(claudecodetest.RawPromptlessIdleNotification("c1")))

	assert.Equal(t, KindNeedsInputIdle, in.Kind)
	assert.False(t, in.AgentUnknown)
}

// TestInterpret_StopBackgroundTasks covers D13's interpreter half: the running count is the
// number of status:"running" entries (subagents and shells alike), nil when the payload
// carries no list at all, and 0 for an empty list (kb:fact/background-tasks-field).
func TestInterpret_StopBackgroundTasks(t *testing.T) {
	tests := []struct {
		name string
		body string
		want *int
	}{
		{"empty list", claudecodetest.RawStop("c1", claudecodetest.StopOpts{}), intPtr(0)},
		{"one running shell", claudecodetest.RawStop("c1", claudecodetest.StopOpts{RunningShells: 1}), intPtr(1)},
		{"two running shells", claudecodetest.RawStop("c1", claudecodetest.StopOpts{RunningShells: 2}), intPtr(2)},
		{"completed entries do not count", claudecodetest.RawStop("c1", claudecodetest.StopOpts{RunningShells: 1, CompletedShells: 2}), intPtr(1)},
		{"only completed entries", claudecodetest.RawStop("c1", claudecodetest.StopOpts{CompletedShells: 2}), intPtr(0)},
		{"running subagent and shell", `{"hook_event_name":"Stop","session_id":"c1","background_tasks":[{"type":"subagent","id":"a","status":"running"},{"type":"shell","id":"s","status":"running"},{"type":"shell","id":"t","status":"killed"}]}`, intPtr(2)},
		{"no background_tasks key: count is left alone", `{"hook_event_name":"Stop","session_id":"c1","last_assistant_message":"hi"}`, nil},
		{"background_tasks null is absent", `{"hook_event_name":"Stop","session_id":"c1","background_tasks":null}`, nil},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			in := Interpret("Stop", []byte(tt.body))

			assert.Equal(t, KindTurnClosed, in.Kind)
			assert.Equal(t, tt.want, in.BackgroundTasks)
		})
	}

	t.Run("StopFailure carries no count", func(t *testing.T) {
		in := Interpret("StopFailure", []byte(claudecodetest.RawStopFailure("c1", claudecodetest.StopFailureOpts{})))

		assert.Nil(t, in.BackgroundTasks)
	})
}

func intPtr(n int) *int { return &n }
