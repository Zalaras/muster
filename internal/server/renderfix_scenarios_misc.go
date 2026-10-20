//go:build renderfix

package server

import (
	"context"
	"fmt"
	"net/http"
	"strings"

	"github.com/Zalaras/muster/internal/claudecode"
	"github.com/Zalaras/muster/internal/claudecode/claudecodetest"
	"github.com/Zalaras/muster/internal/tmux"
)

// The scenarios of the 2026-10-20 re-levelling's core batch
// (plans/_audit/relevel/misc-core.md): the states web/render/{connection,actions,rename,
// drop,issue,theme,surfaces,card-location}.spec.ts read their display properties from — the
// masthead's Claude version readout per status, a title too long for any header, the live
// Stop beside a dead session's disabled Resume and the four state badges under every theme,
// a session's added directories in every shape the Focus header's panel lists them, and a
// shell the daemon reports busy.
func init() {
	renderScenarios = append(renderScenarios,
		renderScenario{"claude-version-below", driveClaudeVersion("2.0.0", claudecode.StatusBelow)},
		renderScenario{"claude-version-above", driveClaudeVersion("2.1.301", claudecode.StatusAbove)},
		renderScenario{"claude-version-unknown", driveClaudeVersion("", claudecode.StatusUnknown)},
		renderScenario{"long-title", driveLongTitle},
		// Theme variants: the dashboard adopts `theme` only from the prefs broadcast
		// (web/src/features/theme.ts), never from the Settings radio, so each theme is its
		// own fixture. Instrument is `follow` with the family unknown, the default.
		renderScenario{"theme-dark", withPrefs(func(context.Context, *renderRig) error { return nil }, map[string]any{"theme": "dark"})},
		renderScenario{"stop-resume-pair", driveStopResumePair},
		renderScenario{"stop-resume-pair-dark", withPrefs(driveStopResumePair, map[string]any{"theme": "dark"})},
		renderScenario{"stop-resume-pair-light", withPrefs(driveStopResumePair, map[string]any{"theme": "light"})},
		renderScenario{"four-badges", driveFourBadges},
		renderScenario{"four-badges-dark", withPrefs(driveFourBadges, map[string]any{"theme": "dark"})},
		renderScenario{"four-badges-light", withPrefs(driveFourBadges, map[string]any{"theme": "light"})},
		renderScenario{"added-dirs-two", driveAddedDirsTwo(false, "repo")},
		renderScenario{"added-dirs-moved", driveAddedDirsTwo(true, "repo")},
		renderScenario{"added-dirs-long", driveAddedDirsTwo(false, focusFolder60)},
		renderScenario{"added-dirs-plain-3", driveAddedDirsPlain(3)},
		renderScenario{"added-dirs-plain-15", driveAddedDirsPlain(15)},
		renderScenario{"added-dirs-plain-22", driveAddedDirsPlain(22)},
		// A shell the poller reports busy, and the same shell idle, each under both views:
		// the dashboard shows the done tick when a snapshot stops listing a busy shell, so
		// the idle twin is what a render test pushes after the busy one.
		renderScenario{"shell-busy", driveShell(true)},
		renderScenario{"shell-idle", driveShell(false)},
		renderScenario{"shell-busy-tiles", withPrefs(driveShell(true), tilesView)},
		renderScenario{"shell-idle-tiles", withPrefs(driveShell(false), tilesView)},
	)
}

// driveClaudeVersion sets the daemon's held Claude Code verdict through the seam
// newRenderRig itself uses, so the hello carries `{installed, status}` for that state; the
// normaliser pins floor and verified, so "above" is one patch over the pinned ceiling and
// "below" is under the pinned floor. An empty installed is the unknown state's nil.
func driveClaudeVersion(installed string, status claudecode.VersionStatus) func(context.Context, *renderRig) error {
	return func(_ context.Context, r *renderRig) error {
		info := notCheckedClaudeCode()
		if installed != "" {
			info.Installed = &installed
		}
		info.Status = string(status)
		r.srv.claudeVersion.current = info
		return nil
	}
}

// driveLongTitle holds one live session whose title is 300 unbroken characters: the daemon
// caps a rename at 100, so a title that long arrives the way it really can, as Claude's own
// session name on the status line.
func driveLongTitle(ctx context.Context, r *renderRig) error {
	dir, err := r.dir(ctx, "iota", "main")
	if err != nil {
		return err
	}
	s, err := r.bind(ctx, dir, "cs-long-title", renderModelHaiku, launchOpts{})
	if err != nil {
		return err
	}
	return r.status(ctx, claudecodetest.EnvelopedStatusLineFull("cs-long-title", claudecodetest.StatusLineFullOpts{
		MusterSession: int(s.id), TmuxPane: s.pane, CurrentDir: dir,
		SessionName: strings.Repeat("W", 300),
	}))
}

// driveStopResumePair holds the two header buttons theme E13 compares: a live bound session
// (an enabled Stop) and a dead session no SessionStart ever bound (a disabled Resume).
func driveStopResumePair(ctx context.Context, r *renderRig) error {
	live, err := r.dir(ctx, "enabled", "main")
	if err != nil {
		return err
	}
	if _, err = r.bind(ctx, live, "cs-enabled-e13", renderModelSonnet, launchOpts{title: "enabled-e13"}); err != nil {
		return err
	}
	dead, err := r.dir(ctx, "disabled", "main")
	if err != nil {
		return err
	}
	s, err := r.launch(ctx, dead, launchOpts{title: "disabled-e13"})
	if err != nil {
		return err
	}
	return r.markDead(ctx, s.id)
}

// driveFourBadges holds one card per coloured state — needs input (a permission prompt),
// failed (a StopFailure), planning (a prompt in plan mode) and working (a prompt) — for the
// badge-colour test under each theme.
func driveFourBadges(ctx context.Context, r *renderRig) error {
	if _, err := r.blockedSession(ctx, "badge-needs-input"); err != nil {
		return err
	}
	if _, err := r.workingSession(ctx, "badge-failed"); err != nil {
		return err
	}
	if err := r.hookStamped(ctx, claudecodetest.RawStopFailure("cs-badge-failed", claudecodetest.StopFailureOpts{})); err != nil {
		return err
	}
	planDir, err := r.dir(ctx, "badge-planning", "main")
	if err != nil {
		return err
	}
	if _, err = r.bind(ctx, planDir, "cs-badge-planning", renderModelSonnet, launchOpts{
		title: "badge-planning", permissionMode: claudecode.PermissionPlan,
	}); err != nil {
		return err
	}
	if err = r.hook(ctx, claudecodetest.RawUserPromptSubmit("cs-badge-planning", claudecodetest.PromptSubmitOpts{PermissionMode: claudecode.PermissionPlan})); err != nil {
		return err
	}
	_, err = r.workingSession(ctx, "badge-working")
	return err
}

// reportAddedDirs posts one status line for s whose `workspace.added_dirs` is the launch
// directory followed by dirs, as a real status line lists them, then runs the repo poll
// that reads each directory's branch from disk.
func (r *renderRig) reportAddedDirs(ctx context.Context, s renderSession, claudeID, launchDir string, dirs []string) error {
	err := r.status(ctx, claudecodetest.EnvelopedStatusLineFull(claudeID, claudecodetest.StatusLineFullOpts{
		MusterSession: int(s.id), TmuxPane: s.pane, CurrentDir: launchDir,
		AddedDirs: append([]string{launchDir}, dirs...),
	}))
	if err != nil {
		return err
	}
	r.repoTick(ctx)
	return nil
}

// driveAddedDirsTwo holds one bound session launched in a checkout named folder with two
// added checkouts, the second on `feature-x`; moved also reports Claude working in the
// first added checkout, so the panel lists the `↳` row beside the added list.
func driveAddedDirsTwo(moved bool, folder string) func(context.Context, *renderRig) error {
	return func(ctx context.Context, r *renderRig) error {
		dir, err := r.dir(ctx, folder, "main")
		if err != nil {
			return err
		}
		first, err := r.dir(ctx, "first", "main")
		if err != nil {
			return err
		}
		second, err := r.dir(ctx, "second", "feature-x")
		if err != nil {
			return err
		}
		s, err := r.bind(ctx, dir, "cs-added", renderModelSonnet, launchOpts{title: "ad-two"})
		if err != nil {
			return err
		}
		if err = r.reportAddedDirs(ctx, s, "cs-added", dir, []string{first, second}); err != nil {
			return err
		}
		if !moved {
			return nil
		}
		// The move comes after the report: a status line's `cwd` is the launch directory,
		// which would read as Claude back home and clear the location.
		if err = r.hook(ctx, claudecodetest.EnvelopedHookInDirectory(int(s.id), s.pane, "UserPromptSubmit", "cs-added", first)); err != nil {
			return err
		}
		if err = r.hookStamped(ctx, claudecodetest.EnvelopedHookInDirectory(int(s.id), s.pane, "Stop", "cs-added", first)); err != nil {
			return err
		}
		r.repoTick(ctx)
		return nil
	}
}

// driveAddedDirsPlain holds one bound session with n plain (non-git) added directories —
// the panel-placement states. Each name is long enough that its path, under the persona
// root the normaliser rewrites it to, wraps onto a second line in the panel while the
// folder name stays on one — the row the E2E's temp-dir paths made, and the height at
// which fifteen rows no longer fit under the readout at 1280×800 yet fit from the top.
func driveAddedDirsPlain(n int) func(context.Context, *renderRig) error {
	return func(ctx context.Context, r *renderRig) error {
		dir, err := r.dir(ctx, "repo", "main")
		if err != nil {
			return err
		}
		dirs := make([]string, 0, n)
		for i := range n {
			var plain string
			plain, err = r.dir(ctx, fmt.Sprintf("plain-directory-number-%02d-wrapping-its-path", i+1), "")
			if err != nil {
				return err
			}
			dirs = append(dirs, plain)
		}
		s, err := r.bind(ctx, dir, "cs-plain", renderModelSonnet, launchOpts{title: fmt.Sprintf("ad-plain-%d", n)})
		if err != nil {
			return err
		}
		return r.reportAddedDirs(ctx, s, "cs-plain", dir, dirs)
	}
}

// driveShell holds one idle session with a plain shell spawned through the real route, and
// — when busy — the shell-activity poller's one tick over a pane listing that reports the
// shell running a foreground command on a canonical tty (kb:anchor/ws.shell-activity):
// the listing and the tty read are the poller's own test seams, since the rig runs no tmux.
func driveShell(busy bool) func(context.Context, *renderRig) error {
	return func(ctx context.Context, r *renderRig) error {
		s, err := r.idleSession(ctx, "shell-host")
		if err != nil {
			return err
		}
		if _, err = r.api(ctx, http.MethodPost, fmt.Sprintf("/api/sessions/%d/shell", s.id), nil); err != nil {
			return err
		}
		if !busy {
			return nil
		}
		poller := r.srv.shellActivity.poller
		poller.lister = func(context.Context) ([]tmux.PaneActivity, error) {
			return []tmux.PaneActivity{{
				SessionName: tmux.ShellSessionName(s.id), CurrentCommand: "sleep", AlternateOn: false, Tty: "/dev/ttys000",
			}}, nil
		}
		poller.canonical = func(string) (bool, error) { return true, nil }
		poller.tick(ctx)
		return nil
	}
}
