package server

import (
	"crypto/sha256"
	"encoding/hex"
	"fmt"
	"os"
	"path/filepath"
	"testing"
)

// stubClaudeScript stands in for `claude` for this package's one really-spawning test:
// CLAUDE.md forbids ever launching the real binary from a unit test. It records the
// MUSTER_SESSION it was handed, then sleeps so a liveness check sees it alive.
//
// It records into its working directory — the launch directory, unique to each test — never
// beside itself: every test server numbers its sessions from 1, so a file shared across
// tests could satisfy another test's wait. Deriving the path at run time also keeps the
// content, and so the content hash below, identical across runs.
const stubClaudeScript = "#!/bin/sh\n" +
	"echo \"$MUSTER_SESSION\" > \"$PWD/muster-stub-session-$MUSTER_SESSION\"\n" +
	"sleep 60\n"

// sharedStubClaude is stubClaudeScript on disk, at a path keyed by the script's content
// hash and reused across runs rather than rewritten.
//
// macOS charges the first exec of a *newly written* executable a real, serialized cost —
// about 270 ms per inode, measured 2026-09-06
// (kb:lesson/first-exec-of-fresh-script-costs-270ms). Writing the stub fresh each run pays
// that every run, and under a full-tree `go test ./...` it pushed
// TestLauncher_SuccessfulLaunchEndToEnd past its own three-second wait roughly one run in
// five. Keying the path by content means the inode survives between runs and only the
// first run on a machine ever pays. Mirrors web/e2e/helpers/daemon.ts's
// ensureSharedStubClaude, which keys its stub the same way and for the same reason.
var sharedStubClaude string

// stubDir holds sharedStubClaude, keyed by its content hash so it persists across runs.
var stubDir string

func TestMain(m *testing.M) {
	os.Exit(runTestMain(m))
}

// runTestMain is TestMain's body, split out so its deferred cleanup actually runs — a
// deferred call inside a function that itself calls os.Exit never fires.
func runTestMain(m *testing.M) int {
	sum := sha256.Sum256([]byte(stubClaudeScript))
	stubDir = filepath.Join(os.TempDir(), "muster-server-stub-"+hex.EncodeToString(sum[:8]))
	if err := os.MkdirAll(stubDir, 0o755); err != nil {
		fmt.Fprintln(os.Stderr, "server test setup: MkdirAll:", err)
		return 1
	}
	sharedStubClaude = filepath.Join(stubDir, "stub-claude.sh")

	if err := ensureStubClaude(); err != nil {
		fmt.Fprintln(os.Stderr, "server test setup: write shared stub claude:", err)
		return 1
	}

	return m.Run()
}

// ensureStubClaude writes the stub only when it is not already on disk, so repeat runs
// reuse the existing inode and skip macOS's first-exec assessment. The write goes to a
// temporary name and is renamed into place, so a concurrent `go test` of this package
// can never observe a half-written executable.
func ensureStubClaude() error {
	if _, err := os.Stat(sharedStubClaude); err == nil {
		return nil
	}
	tmp, err := os.CreateTemp(stubDir, "stub-claude-*.partial")
	if err != nil {
		return err
	}
	defer func() { _ = os.Remove(tmp.Name()) }()
	if _, err := tmp.WriteString(stubClaudeScript); err != nil {
		_ = tmp.Close()
		return err
	}
	if err := tmp.Close(); err != nil {
		return err
	}
	if err := os.Chmod(tmp.Name(), 0o755); err != nil {
		return err
	}
	return os.Rename(tmp.Name(), sharedStubClaude)
}
