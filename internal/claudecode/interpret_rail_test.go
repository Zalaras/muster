package claudecode

import (
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// TestInterpret_UserPromptSubmit_Prompt: UserPromptSubmit's Prompt is
// the payload's own prompt string verbatim, nil when the field is absent, and nil when
// the prompt begins with the measured background-completion tag
// (kb:fact/background-completion-new-prompt-id) — a finished background task's synthetic
// re-invocation, never a real user prompt.
func TestInterpret_UserPromptSubmit_Prompt(t *testing.T) {
	t.Run("a genuine prompt is carried through verbatim", func(t *testing.T) {
		payload := []byte(`{"hook_event_name":"UserPromptSubmit","session_id":"c1","prompt_id":"p1","prompt":"fix the flaky retry and rerun the suite"}`)

		in := Interpret("UserPromptSubmit", payload)

		require.NotNil(t, in.Prompt)
		assert.Equal(t, "fix the flaky retry and rerun the suite", *in.Prompt)
	})

	t.Run("an absent prompt field yields nil", func(t *testing.T) {
		payload := []byte(`{"hook_event_name":"UserPromptSubmit","session_id":"c1","prompt_id":"p1"}`)

		in := Interpret("UserPromptSubmit", payload)

		assert.Nil(t, in.Prompt)
	})

	t.Run("a prompt beginning with the background-completion tag yields nil", func(t *testing.T) {
		payload := []byte(`{"hook_event_name":"UserPromptSubmit","session_id":"c1","prompt_id":"p1","prompt":"` + backgroundCompletionTag + `resuming after the background task finished"}`)

		in := Interpret("UserPromptSubmit", payload)

		assert.Nil(t, in.Prompt, "kb:fact/background-completion-new-prompt-id: a synthetic re-invocation must never surface as a user prompt")
	})

	t.Run("a prompt beginning <agent-message yields nil", func(t *testing.T) {
		payload := []byte(`{"hook_event_name":"UserPromptSubmit","session_id":"c1","prompt_id":"p1","prompt":"<agent-message from=\"alice\">please review the diff</agent-message>"}`)

		in := Interpret("UserPromptSubmit", payload)

		assert.Nil(t, in.Prompt, "a teammate's message is never a last prompt, like a task notification")
	})

	t.Run("the tag appearing mid-string, not as a prefix, does not suppress the prompt", func(t *testing.T) {
		payload := []byte(`{"hook_event_name":"UserPromptSubmit","session_id":"c1","prompt_id":"p1","prompt":"please handle ` + backgroundCompletionTag + ` literally"}`)

		in := Interpret("UserPromptSubmit", payload)

		require.NotNil(t, in.Prompt, "only a leading tag marks a synthetic prompt")
	})

	t.Run("still yields KindTurnActivity and the subagent marker independently of Prompt", func(t *testing.T) {
		payload := []byte(`{"hook_event_name":"UserPromptSubmit","session_id":"c1","prompt_id":"p1","prompt":"hi","agent_id":"a1"}`)

		in := Interpret("UserPromptSubmit", payload)

		assert.Equal(t, KindTurnActivity, in.Kind)
		assert.True(t, in.FromSubagent)
		require.NotNil(t, in.Prompt)
		assert.Equal(t, "hi", *in.Prompt)
	})
}

// TestInterpret_ToolUseEvents_NeverSetPrompt covers the other half: PreToolUse and
// PostToolUse never populate Prompt — the Affected Files note's "the two tool-use cases
// never set it" — even when a "prompt" key appears in their payload (they never actually
// carry one per kb:fact/hook-payload-fields; this proves the interpreter doesn't even
// look, not just that the fixture never supplies one).
func TestInterpret_ToolUseEvents_NeverSetPrompt(t *testing.T) {
	for _, event := range []string{"PreToolUse", "PostToolUse"} {
		t.Run(event, func(t *testing.T) {
			payload := []byte(`{"hook_event_name":"` + event + `","session_id":"c1","prompt_id":"p1","prompt":"should never be read"}`)

			in := Interpret(event, payload)

			assert.Equal(t, KindTurnActivity, in.Kind)
			assert.Nil(t, in.Prompt)
		})
	}
}

// TestInterpret_ReopensClosedPromptFlag: the neutral flag is true exactly for a PreToolUse or
// PermissionRequest without the subagent marker — the awaited main-agent events
// (kb:fact/hook-await-per-event) — and false for every other event.
func TestInterpret_ReopensClosedPromptFlag(t *testing.T) {
	tests := []struct {
		event string
		extra string
		want  bool
	}{
		{"PreToolUse", ``, true},
		{"PermissionRequest", ``, true},
		{"PostToolUse", ``, false},
		{"PostToolBatch", ``, false},
		{"PreToolUse", `,"agent_id":"a1","agent_type":"helper"`, false},
		{"PermissionRequest", `,"agent_id":"a1","agent_type":"helper"`, false},
		{"UserPromptSubmit", `,"prompt":"hi"`, false},
		{"Stop", ``, false},
		{"Notification", `,"notification_type":"permission_prompt"`, false},
	}
	for _, tt := range tests {
		name := tt.event
		if tt.extra != "" {
			name += tt.extra
		}
		t.Run(name, func(t *testing.T) {
			payload := []byte(`{"hook_event_name":"` + tt.event + `","session_id":"c1","prompt_id":"p1"` + tt.extra + `}`)

			in := Interpret(tt.event, payload)

			assert.Equal(t, tt.want, in.ReopensClosedPrompt)
		})
	}
}
