package main

import (
	"context"
	"errors"
	"fmt"
	"io"

	"github.com/Zalaras/muster/internal/tmux"
)

// runTmuxPreflight consults internal/tmux.Preflight and renders its result: nothing on
// an all-clear (REQ-13 — the detected version instead joins the "musterd starting" log
// line, added by run itself), a warning row on an unrecognized version (REQ-3, startup
// proceeds), or a fatal report plus a returned error naming the remedy (REQ-1/REQ-2/
// REQ-17). It holds no tmux version knowledge of its own beyond calling internal/tmux —
// MinVersion, parsing and the comparison all live there (REQ-4/R2).
func runTmuxPreflight(ctx context.Context, stderr io.Writer) (tmux.PreflightResult, error) {
	result := tmux.Preflight(ctx)

	switch result.Status {
	case tmux.StatusOK:
		return result, nil

	case tmux.StatusUnrecognized:
		fmt.Fprintln(stderr, "musterd preflight")
		fmt.Fprintf(stderr, "  ? tmux    unrecognised version %q at %s - assuming %s or newer\n",
			result.Version, result.Path, tmux.MinVersion)
		return result, nil

	case tmux.StatusTooOld:
		fmt.Fprintln(stderr, "musterd preflight")
		fmt.Fprintf(stderr, "  x tmux    %s at %s - need %s or newer\n", result.Version, result.Path, tmux.MinVersion)
		fmt.Fprintln(stderr) // UI spec: a blank line separates the report from main's "musterd: ..." verdict line
		return result, errors.New("tmux is required - Muster runs every session in tmux. Upgrade it with: " + tmuxUpgradeRemedy)

	default: // tmux.StatusNotFound: absent, not executable, exiting non-zero, or timed out
		fmt.Fprintln(stderr, "musterd preflight")
		if result.Found {
			fmt.Fprintf(stderr, "  x tmux    found at %s but did not run\n", result.Path)
		} else {
			fmt.Fprintln(stderr, "  x tmux    not found in $PATH")
		}
		fmt.Fprintln(stderr) // UI spec: a blank line separates the report from main's "musterd: ..." verdict line
		return result, fmt.Errorf("tmux is required - Muster runs every session in tmux. Install it with: %s", tmuxInstallRemedy)
	}
}

// tmuxInstallRemedy is the "not installed" remedy string. README.md's Prerequisites
// section (REQ-12) quotes this byte-for-byte (D13/R1) — keep the two in sync by hand,
// since README is prose, not generated.
const tmuxInstallRemedy = "brew install tmux"

// tmuxUpgradeRemedy is the "too old" remedy string. README.md's Prerequisites section
// (REQ-12) quotes this byte-for-byte too — keep the two in sync by hand, same as
// tmuxInstallRemedy above.
const tmuxUpgradeRemedy = "brew upgrade tmux"
