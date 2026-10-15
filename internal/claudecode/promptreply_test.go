package claudecode

import (
	"encoding/json"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestIsPromptSubmit(t *testing.T) {
	tests := []struct {
		event string
		want  bool
	}{
		{"UserPromptSubmit", true},
		{"SessionStart", false},
		{"PreToolUse", false},
		{"PostToolUse", false},
		{"Stop", false},
		{"StopFailure", false},
		{"Notification", false},
		{"SessionEnd", false},
		{"userpromptsubmit", false},
		{"", false},
	}
	for _, tt := range tests {
		t.Run(tt.event, func(t *testing.T) {
			assert.Equal(t, tt.want, IsPromptSubmit(tt.event))
		})
	}
}

// TestPromptTitleReply covers REQ-1: the reply body is exactly the Claude Code hook-output
// shape measured in kb:fact/hook-output-sets-session-title, whatever the title holds.
func TestPromptTitleReply(t *testing.T) {
	tests := []struct {
		name  string
		title string
	}{
		{"plain", "Renamed In Muster"},
		{"quotes and backslash", `He said "hi" \ bye`},
		{"newline and tab", "line one\nline\ttwo"},
		{"unicode", "Café – 日本語"},
		{"html metacharacters", "<b>&</b>"},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			body := PromptTitleReply(tt.title)

			var got struct {
				HookSpecificOutput map[string]string `json:"hookSpecificOutput"`
			}
			require.NoError(t, json.Unmarshal(body, &got), "the body must be valid JSON: %s", body)
			assert.Equal(t, map[string]string{
				"hookEventName": "UserPromptSubmit",
				"sessionTitle":  tt.title,
			}, got.HookSpecificOutput, "no other key may ride in the reply")
			var top map[string]json.RawMessage
			require.NoError(t, json.Unmarshal(body, &top))
			assert.Len(t, top, 1, "hookSpecificOutput is the only top-level key")
			assert.NotContains(t, string(body), "\n", "a single line, so the wrapper's status-suffix split is unambiguous")
		})
	}

	t.Run("exact bytes", func(t *testing.T) {
		assert.JSONEq(t,
			`{"hookSpecificOutput":{"hookEventName":"UserPromptSubmit","sessionTitle":"X"}}`,
			string(PromptTitleReply("X")))
	})
}
