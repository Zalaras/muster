package server

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"fmt"
	"os"
	"path/filepath"
	"testing"

	"github.com/rs/zerolog"

	"github.com/Zalaras/muster/internal/store"
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

// sharedStubClaude is stubClaudeScript on disk, from cachedStub.
var sharedStubClaude string

// migratedTemplate is a closed, fully migrated database file that openCopiedStore copies, so a
// test pays one file copy instead of replaying every migration (about 400 ms each under -race,
// measured 2026-11-04 on a store open alone).
var migratedTemplate string

func TestMain(m *testing.M) {
	os.Exit(runTestMain(m))
}

// runTestMain is TestMain's body, split out so its deferred cleanup actually runs — a
// deferred call inside a function that itself calls os.Exit never fires.
func runTestMain(m *testing.M) int {
	var err error
	if sharedStubClaude, err = cachedStub("stub-claude.sh", stubClaudeScript); err != nil {
		fmt.Fprintln(os.Stderr, "server test setup: write shared stub claude:", err)
		return 1
	}

	dir, err := os.MkdirTemp("", "muster-server-template-")
	if err != nil {
		fmt.Fprintln(os.Stderr, "server test setup: template database directory:", err)
		return 1
	}
	defer func() { _ = os.RemoveAll(dir) }()
	migratedTemplate = filepath.Join(dir, "muster.db")
	tmpl, err := store.Open(context.Background(), migratedTemplate, zerolog.Nop())
	if err != nil {
		fmt.Fprintln(os.Stderr, "server test setup: migrating the template database:", err)
		return 1
	}
	if err := tmpl.Close(); err != nil {
		fmt.Fprintln(os.Stderr, "server test setup: closing the template database:", err)
		return 1
	}

	return m.Run()
}

// openCopiedStore is store.Open for a test: a path with no database yet starts as a copy of the
// migrated template (mode 0600, as store.Open leaves it), a path that has one is opened as is,
// so a test that reopens its database sees what it wrote.
func openCopiedStore(ctx context.Context, path string, log zerolog.Logger) (*store.Store, error) {
	if _, err := os.Stat(path); os.IsNotExist(err) {
		body, err := os.ReadFile(migratedTemplate)
		if err != nil {
			return nil, err
		}
		if err := os.WriteFile(path, body, 0o600); err != nil {
			return nil, err
		}
	}
	return store.Open(ctx, path, log)
}

// cachedStub returns the path of an executable script holding body, at a path keyed by the
// body's content hash and reused across runs rather than rewritten. A stub must therefore
// never embed a per-test path; it reads anything per-test from its environment.
//
// macOS charges the first exec of a *newly written* executable a real, serialized cost —
// about 270 ms per inode, measured 2026-09-06
// (kb:lesson/first-exec-of-fresh-script-costs-270ms). Writing a stub fresh each run pays
// that every run, and under a full-tree `go test ./...` it pushed
// TestLauncher_SuccessfulLaunchEndToEnd past its own three-second wait roughly one run in
// five. Keying the path by content means the inode survives between runs and only the
// first run on a machine ever pays. Mirrors web/e2e/helpers/daemon.ts's
// ensureSharedStubClaude, which keys its stub the same way and for the same reason. The
// write goes to a temporary name and is renamed into place, so a concurrent `go test` of
// this package can never observe a half-written executable.
func cachedStub(name, body string) (string, error) {
	sum := sha256.Sum256([]byte(body))
	dir := filepath.Join(os.TempDir(), "muster-server-stub-"+hex.EncodeToString(sum[:8]))
	path := filepath.Join(dir, name)
	if _, err := os.Stat(path); err == nil {
		return path, nil
	}
	if err := os.MkdirAll(dir, 0o755); err != nil {
		return "", err
	}
	tmp, err := os.CreateTemp(dir, name+"-*.partial")
	if err != nil {
		return "", err
	}
	defer func() { _ = os.Remove(tmp.Name()) }()
	if _, err := tmp.WriteString(body); err != nil {
		_ = tmp.Close()
		return "", err
	}
	if err := tmp.Close(); err != nil {
		return "", err
	}
	if err := os.Chmod(tmp.Name(), 0o755); err != nil {
		return "", err
	}
	return path, os.Rename(tmp.Name(), path)
}
