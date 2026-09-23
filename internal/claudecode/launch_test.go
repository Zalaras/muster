package claudecode

import (
	"strconv"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// TestBuildArgv covers the CLI argv construction confirmed by spike S2 and REQ-4: every
// accepted mode, "default" included, now emits its own --permission-mode flag
// (kb:fact/permission-mode-no-flag-follows-configured-default — with no flag Claude Code
// starts in its own configured default, which is not always manual), and --name is only
// added when a title was given.
func TestBuildArgv(t *testing.T) {
	tests := []struct {
		name   string
		params LaunchParams
		want   []string
	}{
		{
			name:   "default mode with no title adds --permission-mode default and omits --name",
			params: LaunchParams{Model: "sonnet", PermissionMode: "default"},
			want:   []string{"claude", "--model", "sonnet", "--permission-mode", "default"},
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
			// `--permission-mode auto` (docs/history/spikes/canary-fields.md § Hook payloads).
			name:   "auto mode adds --permission-mode auto",
			params: LaunchParams{Model: "sonnet", PermissionMode: "auto"},
			want:   []string{"claude", "--model", "sonnet", "--permission-mode", "auto"},
		},
		{
			name:   "a title adds --name after --model, before --permission-mode default",
			params: LaunchParams{Model: "sonnet", Title: "Spike Title Probe", PermissionMode: "default"},
			want:   []string{"claude", "--model", "sonnet", "--name", "Spike Title Probe", "--permission-mode", "default"},
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
			want:   []string{"claude", "--model", "sonnet", "--permission-mode", "default"},
		},
		{
			// D13/REQ-7: a resume relaunch emits --resume <id> and omits --name, even when
			// a Title was also set — --name is meaningless for a resumed session (the
			// tmux/pane title comes from the original launch, not a resume). REQ-4/INV-3:
			// --permission-mode is still explicit on a resume.
			name:   "ResumeSessionID emits --resume and omits --name even when Title is also set",
			params: LaunchParams{Model: "sonnet", Title: "Should Be Omitted", PermissionMode: "default", ResumeSessionID: "abc-123"},
			want:   []string{"claude", "--model", "sonnet", "--resume", "abc-123", "--permission-mode", "default"},
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

// TestBuildArgv_PermissionModeAlwaysExplicit is D10/INV-3: every accepted mode emits
// --permission-mode <mode> exactly once, on both a plain launch and a resume relaunch.
func TestBuildArgv_PermissionModeAlwaysExplicit(t *testing.T) {
	for _, mode := range []string{"default", "plan", "acceptEdits", "auto"} {
		for _, resumeID := range []string{"", "abc-123"} {
			name := mode + " resume=" + resumeID
			t.Run(name, func(t *testing.T) {
				got := BuildArgv("claude", LaunchParams{
					Model:           "sonnet",
					PermissionMode:  mode,
					ResumeSessionID: resumeID,
				})

				count := 0
				for i, arg := range got {
					if arg == "--permission-mode" {
						count++
						require.Less(t, i+1, len(got), "--permission-mode has no value")
						assert.Equal(t, mode, got[i+1])
					}
				}
				assert.Equal(t, 1, count, "--permission-mode must appear exactly once, got argv %v", got)
			})
		}
	}
}

func TestBuildArgv_UsesTheGivenBinaryName(t *testing.T) {
	// REQ-19: the -claude-bin flag lets E2E launch a stub binary instead of the real one.
	got := BuildArgv("/tmp/stub-claude.sh", LaunchParams{Model: "sonnet", PermissionMode: "default"})

	assert.Equal(t, []string{"/tmp/stub-claude.sh", "--model", "sonnet", "--permission-mode", "default"}, got)
}

// TestLaunchEnv pins the exact Claude Code variable name and a usable value. The name is
// an unsupported interface (spikes/S6-scroll-bandwidth.md §6) — a rename upstream degrades
// silently rather than failing, so the spelling is worth asserting somewhere that a diff
// will show. The value is checked as a positive integer rather than a literal so tuning
// ScrollSpeed doesn't churn the test.
func TestLaunchEnv(t *testing.T) {
	env := LaunchEnv()

	v, ok := env["CLAUDE_CODE_SCROLL_SPEED"]
	assert.True(t, ok, "CLAUDE_CODE_SCROLL_SPEED must be set — it is the only lever on wheel scroll distance")

	n, err := strconv.Atoi(v)
	require.NoError(t, err, "Claude Code parses this as an integer and rejects anything else")
	assert.Greater(t, n, 1, "must beat Claude Code's own ~1 line per notch default to be worth setting")
}

// TestLaunchEnv_ReturnsAFreshMap guards the two call sites in internal/server, which merge
// the result into their own env map: handing back a shared map would let one launch's
// mutation leak into the next.
func TestLaunchEnv_ReturnsAFreshMap(t *testing.T) {
	first := LaunchEnv()
	first["CLAUDE_CODE_SCROLL_SPEED"] = "999"

	assert.Equal(t, ScrollSpeed, LaunchEnv()["CLAUDE_CODE_SCROLL_SPEED"])
}
