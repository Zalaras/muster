package claudecode

import (
	"encoding/json"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// cwdPayload builds a hook payload from the common key set the facts measured
// (kb:fact/cwd-follows-claude-mid-session), with extra keys merged over it.
func cwdPayload(t *testing.T, event string, extra map[string]any) []byte {
	t.Helper()
	body := map[string]any{"hook_event_name": event, "session_id": "claude-1", "transcript_path": "/tmp/t.jsonl"}
	for k, v := range extra {
		body[k] = v
	}
	out, err := json.Marshal(body)
	require.NoError(t, err)
	return out
}

// mainAgentEvents is every hook event the daemon's state machine reads, plus one it does not
// know: the cwd rule is event-independent, so each row is asserted against all of them.
var mainAgentEvents = []string{
	"SessionStart", "UserPromptSubmit", "PreToolUse", "PostToolUse", "PostToolBatch",
	"Notification", "PermissionRequest", "Stop", "StopFailure", "PreCompact", "SessionEnd",
	"CwdChanged",
}

// TestInterpret_Cwd is D1: a main-agent hook's non-empty cwd becomes StateInput.Cwd, an absent
// or empty one leaves it nil, and CwdChanged's new_cwd is never read
// (kb:fact/cwd-changed-hook: a cd outside the allowed directories makes new_cwd name the
// target while cwd is already the reset project root).
func TestInterpret_Cwd(t *testing.T) {
	cases := []struct {
		name  string
		extra map[string]any
		want  *string
	}{
		{name: "non-empty cwd", extra: map[string]any{"cwd": "/private/tmp/repo/sub"}, want: strPtr("/private/tmp/repo/sub")},
		{name: "a worktree under .claude/worktrees", extra: map[string]any{"cwd": "/repo/.claude/worktrees/probewt"}, want: strPtr("/repo/.claude/worktrees/probewt")},
		{name: "cwd absent", extra: map[string]any{}, want: nil},
		{name: "cwd empty string", extra: map[string]any{"cwd": ""}, want: nil},
		{name: "new_cwd alone is never read", extra: map[string]any{"new_cwd": "/etc"}, want: nil},
		{name: "reset cd: cwd is the project root, new_cwd the stale target", extra: map[string]any{"cwd": "/repo", "old_cwd": "/repo", "new_cwd": "/elsewhere"}, want: strPtr("/repo")},
	}
	for _, event := range mainAgentEvents {
		for _, tc := range cases {
			t.Run(event+"/"+tc.name, func(t *testing.T) {
				got := Interpret(event, cwdPayload(t, event, tc.extra))

				assert.Equal(t, tc.want, got.Cwd)
			})
		}
	}
}

// TestInterpret_CwdNeverChangesTheTransition: cwd is display-only, so adding it to a payload
// changes nothing but StateInput.Cwd.
func TestInterpret_CwdNeverChangesTheTransition(t *testing.T) {
	for _, event := range mainAgentEvents {
		t.Run(event, func(t *testing.T) {
			without := Interpret(event, cwdPayload(t, event, nil))
			with := Interpret(event, cwdPayload(t, event, map[string]any{"cwd": "/repo/sub"}))

			require.NotNil(t, with.Cwd)
			with.Cwd = nil
			assert.Equal(t, without, with)
		})
	}
}

// TestInterpret_CwdIgnoredForSubagents is D2 / INV-4: an event carrying the agent marker
// (kb:fact/subagent-hooks-carry-agent-id) and SubagentStart/SubagentStop never report a
// directory, whatever its cwd says.
func TestInterpret_CwdIgnoredForSubagents(t *testing.T) {
	marked := map[string]any{"cwd": "/repo/.claude/worktrees/sub", "agent_id": "agent-1", "agent_type": "general-purpose"}
	for _, event := range []string{"PreToolUse", "PostToolUse", "PostToolBatch", "PermissionRequest", "UserPromptSubmit", "Notification", "Stop"} {
		t.Run("marked "+event, func(t *testing.T) {
			assert.Nil(t, Interpret(event, cwdPayload(t, event, marked)).Cwd)
		})
	}
	for _, event := range []string{"SubagentStart", "SubagentStop"} {
		t.Run(event+" without a marker", func(t *testing.T) {
			assert.Nil(t, Interpret(event, cwdPayload(t, event, map[string]any{"cwd": "/repo/sub"})).Cwd)
		})
		t.Run(event+" with a marker", func(t *testing.T) {
			assert.Nil(t, Interpret(event, cwdPayload(t, event, marked)).Cwd)
		})
	}
}

// TestInterpret_CwdNotTakenFromAStatusLineEventType: a status-line post is read by
// InterpretStatus only; routed through Interpret it stays inert and reports no directory.
func TestInterpret_CwdNotTakenFromAStatusLineEventType(t *testing.T) {
	got := Interpret("status_line", []byte(`{"cwd":"/repo/sub","workspace":{"current_dir":"/repo/sub"}}`))

	assert.Equal(t, KindInert, got.Kind)
	assert.Nil(t, got.Cwd)
}

// TestInterpret_CwdMalformedPayloadIsNil: a body that is not JSON must not panic or invent a
// directory.
func TestInterpret_CwdMalformedPayloadIsNil(t *testing.T) {
	assert.Nil(t, Interpret("PostToolUse", []byte(`{not json`)).Cwd)
}

func strPtr(s string) *string { return &s }

// TestInterpretStatus_Cwd is REQ-3's status half: workspace.current_dir wins, the top-level
// cwd is the fallback, project_dir is never read, and empty or absent values report nothing
// (kb:fact/status-line-keys, kb:fact/enter-worktree-moves-project-dir).
func TestInterpretStatus_Cwd(t *testing.T) {
	cases := []struct {
		name    string
		payload string
		want    *string
	}{
		{name: "current_dir wins over cwd", payload: `{"cwd":"/a","workspace":{"current_dir":"/b","project_dir":"/c"}}`, want: strPtr("/b")},
		{name: "cwd is the fallback when workspace is absent", payload: `{"cwd":"/a"}`, want: strPtr("/a")},
		{name: "cwd is the fallback when current_dir is empty", payload: `{"cwd":"/a","workspace":{"current_dir":"","project_dir":"/c"}}`, want: strPtr("/a")},
		{name: "cwd is the fallback when current_dir is absent", payload: `{"cwd":"/a","workspace":{"project_dir":"/c"}}`, want: strPtr("/a")},
		{name: "project_dir alone is never a directory", payload: `{"workspace":{"project_dir":"/c"}}`, want: nil},
		{name: "both empty", payload: `{"cwd":"","workspace":{"current_dir":""}}`, want: nil},
		{name: "neither present", payload: `{"session_id":"claude-1"}`, want: nil},
		{name: "the added-dirs shape: cwd resolved, current_dir the added directory", payload: `{"cwd":"/private/tmp/other","workspace":{"current_dir":"/private/tmp/other","project_dir":"/tmp/repo","added_dirs":["/tmp/repo","/tmp/other"]}}`, want: strPtr("/private/tmp/other")},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			assert.Equal(t, tc.want, InterpretStatus([]byte(tc.payload)).Cwd)
		})
	}
}
