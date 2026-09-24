package claudecode

// PermissionDefault, PermissionPlan, PermissionAcceptEdits and PermissionAuto are every
// value Claude Code's `--permission-mode` flag accepts (kb:fact/permission-mode-flag-on-wire)
// — Claude-Code-format vocabulary, so this package is its one owner (CLAUDE.md hard
// rule). internal/session's PermissionMode constants derive from these (session already
// imports claudecode, so that direction never cycles); internal/server validates
// incoming requests through whichever of the two it already has in hand.
const (
	PermissionDefault     = "default"
	PermissionPlan        = "plan"
	PermissionAcceptEdits = "acceptEdits"
	PermissionAuto        = "auto"
)

// PermissionModes lists every value above, in the order BuildArgv/ValidPermissionMode
// iterate them.
var PermissionModes = []string{PermissionDefault, PermissionPlan, PermissionAcceptEdits, PermissionAuto}

// ValidPermissionMode reports whether s is one of PermissionModes.
func ValidPermissionMode(s string) bool {
	for _, m := range PermissionModes {
		if m == s {
			return true
		}
	}
	return false
}

// LaunchParams are the neutral inputs to building the `claude` CLI invocation
// (kb:anchor/sessions.create). Validation of these values (non-empty model, a known
// permission mode) is the caller's job — BuildArgv only assembles argv.
type LaunchParams struct {
	Model          string
	Title          string // optional; empty omits --name
	PermissionMode string // one of PermissionModes

	// ResumeSessionID is non-empty for a resume relaunch (kb:anchor/sessions.resume):
	// emits `--resume <id>` and omits `--name` — the only place the `--resume` flag
	// string may appear.
	ResumeSessionID string
}

// BuildArgv returns the full argv (binary included) for launching `claude` with p.
// Every accepted mode, "default" included, is now sent explicitly: with no flag at all
// Claude Code starts in its own configured default, which the 2026-09-23 probe measured
// as auto on the developer's machine, not manual
// (kb:fact/permission-mode-no-flag-follows-configured-default) — omitting the flag for
// "default" no longer means manual. An unrecognized PermissionMode adds no flag at all
// (validation is the caller's job, per LaunchParams' doc) rather than passing an
// unvalidated value straight to the `claude` argv.
func BuildArgv(binary string, p LaunchParams) []string {
	args := []string{binary, "--model", p.Model}
	if p.ResumeSessionID != "" {
		args = append(args, "--resume", p.ResumeSessionID)
	} else if p.Title != "" {
		args = append(args, "--name", p.Title)
	}
	if ValidPermissionMode(p.PermissionMode) {
		args = append(args, "--permission-mode", p.PermissionMode)
	}
	return args
}

// ScrollSpeed is the mouse-wheel scroll rate, in lines per notch, handed to Claude Code's
// TUI via CLAUDE_CODE_SCROLL_SPEED. Claude Code owns the wheel — its TUI enables mouse
// tracking (1000/1002/1003 plus SGR 1006) whether or not tmux is in the loop
// (spikes/S6-scroll-bandwidth.md) — so this is the only lever Muster has over scroll
// distance; nothing in the dashboard or in tmux can widen it
// (kb:adr/surfaces-scroll-speed-via-launch-env).
//
// Why 5: Claude Code's own default measured ~1 line per notch (9 lines over 10 notches)
// against 17 lines for a single PageUp on the same screen, which is the "scrolling is
// slow" half of issue #13. 5 is the conventional terminal wheel step of 3 rounded up
// toward that PageUp distance, and measured 4.9 lines/notch end to end through a
// Muster-launched session. Values above ~10 are unverified: a higher setting ran off the
// top of its 120-line transcript before the rate could be read, so proportionality is
// confirmed at 5 and assumed, not measured, beyond it (spikes/S6-scroll-bandwidth.md).
//
// UNSUPPORTED INTERFACE: the variable is absent from `claude --help` and was found by
// reading strings out of the binary; it carries no compatibility promise
// (kb:fact/scroll-speed-env-present). Measured on 2.1.259, inside the verified range
// declared in docs/claude-code-versions.md; these numbers want re-confirming if a future
// canary run pushes the verified ceiling past that build. `make canary`'s static tier
// asserts this variable's presence (by name, read from LaunchEnv()) in the installed
// binary, which catches an upstream rename or removal; it does not catch a change in the
// variable's effect on scroll rate — that stays a manual re-measurement against
// spikes/S6-scroll-bandwidth.md.
const ScrollSpeed = "5"

// LaunchEnv returns the Claude-Code-specific environment shared by a launch and a resume.
// It lives here, not at the two call sites in internal/server, so no Claude Code variable
// name leaks outside this package (the package-boundary hard rule). Callers merge it over
// their own env; it never overwrites MUSTER_SESSION or the locale pair, which use
// different keys.
func LaunchEnv() map[string]string {
	return map[string]string{"CLAUDE_CODE_SCROLL_SPEED": ScrollSpeed}
}
