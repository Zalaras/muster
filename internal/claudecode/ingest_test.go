package claudecode

import (
	"encoding/json"
	"errors"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func ptr[T any](v T) *T { return &v }

func TestParseIngestBody_EnvelopedVsRaw(t *testing.T) {
	tests := []struct {
		name string
		body string
		kind Kind

		wantSessionID     string
		wantType          string
		wantPromptID      *string
		wantToolUseID     *string
		wantMusterSession *int64
		wantTmuxPane      *string
	}{
		{
			// Verbatim from the plan's Implementation Notes example (envelope binding,
			// docs/protocol.md §4.2). SessionStart carries no prompt_id (canary-fields.md
			// "common set").
			name: "enveloped SessionStart with musterSession and tmuxPane",
			body: `{"musterSession":1,"tmuxPane":"%12","payload":{"hook_event_name":"SessionStart","session_id":"e2e-s1","transcript_path":"/tmp/t.jsonl","cwd":"/tmp","source":"startup","model":{"id":"claude-haiku-4-5-20251001","display_name":"Haiku 4.5"}}}`,
			kind: KindHook,

			wantSessionID:     "e2e-s1",
			wantType:          "SessionStart",
			wantPromptID:      nil,
			wantToolUseID:     nil,
			wantMusterSession: ptr(int64(1)),
			wantTmuxPane:      ptr("%12"),
		},
		{
			// Verbatim from the plan's Implementation Notes example: a plain HTTP hook,
			// no envelope at all.
			name: "raw Stop with no envelope",
			body: `{"hook_event_name":"Stop","session_id":"e2e-s1","transcript_path":"/tmp/t.jsonl","cwd":"/tmp","prompt_id":"p1","permission_mode":"default","last_assistant_message":"hi","stop_hook_active":false}`,
			kind: KindHook,

			wantSessionID:     "e2e-s1",
			wantType:          "Stop",
			wantPromptID:      ptr("p1"),
			wantToolUseID:     nil,
			wantMusterSession: nil,
			wantTmuxPane:      nil,
		},
		{
			// Edge Case 2: headless probe — envelope present (the "payload" key exists) but
			// musterSession/tmuxPane are absent because no pane environment was set.
			name: "enveloped with absent musterSession and tmuxPane",
			body: `{"payload":{"hook_event_name":"PreToolUse","session_id":"e2e-s2","tool_name":"Bash","tool_use_id":"tu-1","prompt_id":"p2"}}`,
			kind: KindHook,

			wantSessionID:     "e2e-s2",
			wantType:          "PreToolUse",
			wantPromptID:      ptr("p2"),
			wantToolUseID:     ptr("tu-1"),
			wantMusterSession: nil,
			wantTmuxPane:      nil,
		},
		{
			// REQ-11: the status endpoint's enveloped body, built from canary-fields.md's
			// pre-first-API-response status-line shape (rate_limits entirely absent,
			// context_window nulls). No hook_event_name of its own — kind decides Type.
			name: "enveloped status line pre-first-response",
			body: `{"musterSession":1,"tmuxPane":"%12","payload":{"session_id":"e2e-s1","transcript_path":"/tmp/t.jsonl","cwd":"/tmp","version":"2.1.233","context_window":{"context_window_size":200000,"used_percentage":null,"remaining_percentage":null,"total_input_tokens":0,"total_output_tokens":0,"current_usage":null},"cost":{"total_cost_usd":0}}}`,
			kind: KindStatus,

			wantSessionID:     "e2e-s1",
			wantType:          "status_line",
			wantPromptID:      nil,
			wantToolUseID:     nil,
			wantMusterSession: ptr(int64(1)),
			wantTmuxPane:      ptr("%12"),
		},
		{
			// REQ-11: "a raw body is tolerated" on the status endpoint too.
			name: "raw status line body tolerated",
			body: `{"session_id":"e2e-s1","version":"2.1.233","context_window":{"used_percentage":19}}`,
			kind: KindStatus,

			wantSessionID:     "e2e-s1",
			wantType:          "status_line",
			wantPromptID:      nil,
			wantToolUseID:     nil,
			wantMusterSession: nil,
			wantTmuxPane:      nil,
		},
		{
			// Edge Case 5: unknown hook_event_name persists verbatim, inert — forward
			// compatibility with a future Claude Code hook Muster doesn't know about yet.
			name: "unknown hook_event_name persists verbatim",
			body: `{"hook_event_name":"SomeFutureHook","session_id":"e2e-s3"}`,
			kind: KindHook,

			wantSessionID:     "e2e-s3",
			wantType:          "SomeFutureHook",
			wantPromptID:      nil,
			wantToolUseID:     nil,
			wantMusterSession: nil,
			wantTmuxPane:      nil,
		},
		{
			// The KindStatus override applies even if the inner payload happens to carry a
			// hook_event_name — Type must come from kind, never the inner field, on the
			// status endpoint.
			name: "status kind overrides an inner hook_event_name",
			body: `{"session_id":"e2e-s4","hook_event_name":"Stop"}`,
			kind: KindStatus,

			wantSessionID: "e2e-s4",
			wantType:      "status_line",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			ev, err := ParseIngestBody([]byte(tt.body), tt.kind)
			require.NoError(t, err)

			assert.Equal(t, tt.wantSessionID, ev.SessionID)
			assert.Equal(t, tt.wantType, ev.Type)
			assert.Equal(t, tt.wantPromptID, ev.PromptID)
			assert.Equal(t, tt.wantToolUseID, ev.ToolUseID)
			assert.Equal(t, tt.wantMusterSession, ev.MusterSession)
			assert.Equal(t, tt.wantTmuxPane, ev.TmuxPane)
			require.NotNil(t, ev.Payload)

			// The persisted payload is the verbatim *inner* payload, never the envelope
			// wrapper — assert it round-trips to a JSON object containing session_id.
			var inner map[string]any
			require.NoError(t, json.Unmarshal(ev.Payload, &inner))
			assert.Equal(t, tt.wantSessionID, inner["session_id"])
		})
	}
}

func TestParseIngestBody_Drops(t *testing.T) {
	t.Run("malformed JSON body is an error, not ErrNoSessionID", func(t *testing.T) {
		_, err := ParseIngestBody([]byte(`not json at all`), KindHook)
		require.Error(t, err)
		assert.False(t, errors.Is(err, ErrNoSessionID))
	})

	t.Run("empty body is an error", func(t *testing.T) {
		_, err := ParseIngestBody([]byte(``), KindHook)
		require.Error(t, err)
	})

	t.Run("JSON array instead of an object is an error", func(t *testing.T) {
		_, err := ParseIngestBody([]byte(`[1,2,3]`), KindHook)
		require.Error(t, err)
	})

	t.Run("valid JSON with no usable session_id is ErrNoSessionID", func(t *testing.T) {
		// Edge Case 4 / REQ-13: every measured hook and status post carries session_id, so
		// this is a deliberately atypical payload exercising the drop path.
		_, err := ParseIngestBody([]byte(`{"hook_event_name":"Stop"}`), KindHook)
		require.Error(t, err)
		assert.True(t, errors.Is(err, ErrNoSessionID))
	})

	t.Run("empty-string session_id is treated as no usable session_id", func(t *testing.T) {
		_, err := ParseIngestBody([]byte(`{"hook_event_name":"Stop","session_id":""}`), KindHook)
		require.Error(t, err)
		assert.True(t, errors.Is(err, ErrNoSessionID))
	})

	t.Run("hook body with no hook_event_name and no session_id override is an error", func(t *testing.T) {
		// KindHook with an inner payload that has session_id but no hook_event_name at all:
		// distinct code path from ErrNoSessionID (session_id is present here).
		_, err := ParseIngestBody([]byte(`{"session_id":"e2e-s5"}`), KindHook)
		require.Error(t, err)
		assert.False(t, errors.Is(err, ErrNoSessionID))
	})

	t.Run("enveloped body whose inner payload is malformed is an error", func(t *testing.T) {
		_, err := ParseIngestBody([]byte(`{"payload":"not-an-object"}`), KindHook)
		require.Error(t, err)
	})
}
