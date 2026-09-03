package claudecode

import (
	"testing"

	"github.com/stretchr/testify/assert"
)

// TestBuildArgv covers the CLI argv construction confirmed by spike S2: default needs
// no --permission-mode flag (it's Claude Code's own default), plan/acceptEdits do, and
// --name is only added when a title was given.
func TestBuildArgv(t *testing.T) {
	tests := []struct {
		name   string
		params LaunchParams
		want   []string
	}{
		{
			name:   "default mode with no title omits both --permission-mode and --name",
			params: LaunchParams{Model: "sonnet", PermissionMode: "default"},
			want:   []string{"claude", "--model", "sonnet"},
		},
		{
			name:   "plan mode adds --permission-mode plan",
			params: LaunchParams{Model: "sonnet", PermissionMode: "plan"},
			want:   []string{"claude", "--model", "sonnet", "--permission-mode", "plan"},
		},
		{
			name:   "acceptEdits mode adds --permission-mode acceptEdits",
			params: LaunchParams{Model: "opus", PermissionMode: "acceptEdits"},
			want:   []string{"claude", "--model", "opus", "--permission-mode", "acceptEdits"},
		},
		{
			// D5: 2026-09-03 permission-mode probe against 2.1.259 confirmed
			// `--permission-mode auto` (spikes/canary-fields.md § Hook payloads).
			name:   "auto mode adds --permission-mode auto",
			params: LaunchParams{Model: "sonnet", PermissionMode: "auto"},
			want:   []string{"claude", "--model", "sonnet", "--permission-mode", "auto"},
		},
		{
			name:   "a title adds --name after --model",
			params: LaunchParams{Model: "sonnet", Title: "Spike Title Probe", PermissionMode: "default"},
			want:   []string{"claude", "--model", "sonnet", "--name", "Spike Title Probe"},
		},
		{
			name:   "title and non-default mode combine, model+name first then permission-mode",
			params: LaunchParams{Model: "haiku", Title: "My Session", PermissionMode: "acceptEdits"},
			want:   []string{"claude", "--model", "haiku", "--name", "My Session", "--permission-mode", "acceptEdits"},
		},
		{
			name:   "an unrecognized permission mode adds no flag (validation is the caller's job)",
			params: LaunchParams{Model: "sonnet", PermissionMode: "bogus"},
			want:   []string{"claude", "--model", "sonnet"},
		},
		{
			name:   "empty title never adds --name",
			params: LaunchParams{Model: "sonnet", Title: "", PermissionMode: "default"},
			want:   []string{"claude", "--model", "sonnet"},
		},
		{
			// D13/REQ-7: a resume relaunch emits --resume <id> and omits --name, even when
			// a Title was also set — --name is meaningless for a resumed session (the
			// tmux/pane title comes from the original launch, not a resume).
			name:   "ResumeSessionID emits --resume and omits --name even when Title is also set",
			params: LaunchParams{Model: "sonnet", Title: "Should Be Omitted", PermissionMode: "default", ResumeSessionID: "abc-123"},
			want:   []string{"claude", "--model", "sonnet", "--resume", "abc-123"},
		},
		{
			name:   "ResumeSessionID combines with a non-default permission mode",
			params: LaunchParams{Model: "sonnet", PermissionMode: "plan", ResumeSessionID: "abc-123"},
			want:   []string{"claude", "--model", "sonnet", "--resume", "abc-123", "--permission-mode", "plan"},
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := BuildArgv("claude", tt.params)
			assert.Equal(t, tt.want, got)
		})
	}
}

func TestBuildArgv_UsesTheGivenBinaryName(t *testing.T) {
	// REQ-19: the -claude-bin flag lets E2E launch a stub binary instead of the real one.
	got := BuildArgv("/tmp/stub-claude.sh", LaunchParams{Model: "sonnet", PermissionMode: "default"})

	assert.Equal(t, []string{"/tmp/stub-claude.sh", "--model", "sonnet"}, got)
}
