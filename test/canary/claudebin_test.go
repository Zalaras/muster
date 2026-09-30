//go:build canary

package canary

import (
	"os"
	"os/exec"
	"path/filepath"
)

// claudeBinEnv names the claude binary every step of the run execs. `make canary` sets it to
// the installed binary's resolved, versioned path, and hands the same path to `versions bump`,
// so a Claude Code auto-update mid-run can neither switch the binary under later steps nor
// make bump record a version the run never tested.
const claudeBinEnv = "MUSTER_CANARY_CLAUDE_BIN"

// claudeBin is resolved once, before any test runs: MUSTER_CANARY_CLAUDE_BIN when set, else
// `claude` on PATH with its symlinks resolved (the installer's `claude` is a symlink into a
// per-version directory that an update repoints). Falls back to the bare name when neither
// resolves, so the existing "claude must be on PATH" failures still surface.
var claudeBin = resolveClaudeBin()

func resolveClaudeBin() string {
	if bin := os.Getenv(claudeBinEnv); bin != "" {
		return bin
	}
	path, err := exec.LookPath("claude")
	if err != nil {
		return "claude"
	}
	if resolved, err := filepath.EvalSymlinks(path); err == nil {
		return resolved
	}
	return path
}
