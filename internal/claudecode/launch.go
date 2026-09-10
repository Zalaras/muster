package claudecode

// LaunchParams are the neutral inputs to building the `claude` CLI invocation
// (docs/protocol.md §3.1). Validation of these values (non-empty model, a known
// permission mode) is the caller's job — BuildArgv only assembles argv.
type LaunchParams struct {
	Model          string
	Title          string // optional; empty omits --name
	PermissionMode string // "default" | "plan" | "acceptEdits" | "auto"

	// ResumeSessionID is non-empty for a resume relaunch (m4-reconcile REQ-7 / docs/
	// protocol.md §3.5): emits `--resume <id>` and omits `--name` (D13) — the only place
	// the `--resume` flag string may appear (D6).
	ResumeSessionID string
}

// BuildArgv returns the full argv (binary included) for launching `claude` with p.
// `--permission-mode` is confirmed by spike S2 (`--permission-mode plan`,
// `--permission-mode acceptEdits`) and by the 2026-09-03 permission-mode probe against
// 2.1.259 (`--permission-mode auto`, spikes/canary-fields.md § Hook payloads); "default"
// needs no flag — it's Claude Code's own default and carries no CLI flag of its own, and
// remains the safer spelling since `default` is unlisted in the CLI's own choices while
// `manual` may not exist across the verified range (docs/claude-code-versions.md).
func BuildArgv(binary string, p LaunchParams) []string {
	args := []string{binary, "--model", p.Model}
	if p.ResumeSessionID != "" {
		args = append(args, "--resume", p.ResumeSessionID)
	} else if p.Title != "" {
		args = append(args, "--name", p.Title)
	}
	switch p.PermissionMode {
	case "plan", "acceptEdits", "auto":
		args = append(args, "--permission-mode", p.PermissionMode)
	}
	return args
}

// ScrollSpeed is the mouse-wheel scroll rate, in lines per notch, handed to Claude Code's
// TUI via CLAUDE_CODE_SCROLL_SPEED. Claude Code owns the wheel — its TUI enables mouse
// tracking (1000/1002/1003 plus SGR 1006) whether or not tmux is in the loop
// (spikes/S6-scroll-bandwidth.md §1) — so this is the only lever Muster has over scroll
// distance; nothing in the dashboard or in tmux can widen it.
//
// Why 5: Claude Code's own default measured ~1 line per notch (9 lines over 10 notches,
// S6 §5) against 17 lines for a single PageUp on the same screen, which is the "scrolling
// is slow" half of issue #13. 5 is the conventional terminal wheel step of 3 rounded up
// toward that PageUp distance, and measured 4.9 lines/notch end to end through a
// Muster-launched session. Values above ~10 are unverified: the 15 probe ran off the top
// of its 120-line transcript before the rate could be read, so proportionality is
// confirmed at 5 and assumed, not measured, beyond it.
//
// UNSUPPORTED INTERFACE: the variable is absent from `claude --help` and was found by
// reading strings out of the binary; it carries no compatibility promise. Measured on
// 2.1.259, inside the verified range declared in docs/claude-code-versions.md; these
// numbers want re-confirming if a future canary run pushes the verified ceiling past that
// build. Since 2026-09-10, `make canary`'s
// static tier asserts this variable's presence (by name, read from LaunchEnv()) in the
// installed binary, which catches an upstream rename or removal; it does not catch a
// change in the variable's effect on scroll rate — that stays a manual re-measurement
// against spikes/S6-scroll-bandwidth.md.
const ScrollSpeed = "5"

// LaunchEnv returns the Claude-Code-specific environment shared by a launch and a resume.
// It lives here, not at the two call sites in internal/server, so no Claude Code variable
// name leaks outside this package (the package-boundary hard rule). Callers merge it over
// their own env; it never overwrites MUSTER_SESSION or the locale pair, which use
// different keys.
func LaunchEnv() map[string]string {
	return map[string]string{"CLAUDE_CODE_SCROLL_SPEED": ScrollSpeed}
}
