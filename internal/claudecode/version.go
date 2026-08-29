package claudecode

import (
	"context"
	"fmt"
	"os/exec"
	"regexp"
	"strings"
)

// PinnedVersion is the only Claude Code version Muster is validated against.
//
// Every interface fact in spikes/FINDINGS.md and spikes/canary-fields.md was measured
// against this build. Claude Code offers no interface stability guarantee, so bumping this
// constant without a green canary run is how Muster breaks silently.
//
// The upgrade ritual is in docs/claude-code-pin.md.
const PinnedVersion = "2.1.246"

// versionRE matches the leading semver of `claude --version`, e.g. "2.1.233 (Claude Code)".
var versionRE = regexp.MustCompile(`^(\d+\.\d+\.\d+)`)

// InstalledVersion reports the version of the claude binary on PATH.
//
// The caller supplies the context: this runs on the daemon's startup path, and a hung
// claude binary must not stall it indefinitely.
func InstalledVersion(ctx context.Context) (string, error) {
	out, err := exec.CommandContext(ctx, "claude", "--version").Output()
	if err != nil {
		return "", fmt.Errorf("running claude --version: %w", err)
	}
	trimmed := strings.TrimSpace(string(out))
	m := versionRE.FindStringSubmatch(trimmed)
	if m == nil {
		return "", fmt.Errorf("parsing claude --version output %q", trimmed)
	}
	return m[1], nil
}

// VersionDriftError reports that the installed Claude Code is not the pinned one.
type VersionDriftError struct {
	Installed string
	Pinned    string
}

func (e *VersionDriftError) Error() string {
	return fmt.Sprintf(
		"claude code version drift: installed %s, pinned %s (run `make canary` before bumping the pin; see docs/claude-code-pin.md)",
		e.Installed, e.Pinned,
	)
}

// CheckPin compares the installed Claude Code against PinnedVersion.
//
// Drift is returned as an error but is deliberately not fatal to the daemon: Muster does not
// disable Claude Code's auto-updater (that would freeze the user's everyday install), so it
// detects drift instead and surfaces it as a warning. An unexpected auto-update should be
// visible without stopping the user working.
func CheckPin(ctx context.Context) error {
	installed, err := InstalledVersion(ctx)
	if err != nil {
		return err
	}
	if installed != PinnedVersion {
		return &VersionDriftError{Installed: installed, Pinned: PinnedVersion}
	}
	return nil
}
