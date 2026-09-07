// Package tmuxtest is the one shared per-test tmux socket helper (plan v1-cleanup
// REQ-4): internal/tmux, internal/termbridge, internal/server and cmd/musterd's tests
// all built their own copy of the same os.MkdirTemp + t.Cleanup(kill-server) idiom, so
// this replaces all of them. A separate package rather than internal/tmux's own test
// file, because internal/server, internal/termbridge and cmd/musterd all need it and Go
// test files are not importable from another package.
package tmuxtest

import (
	"context"
	"os"
	"os/exec"
	"path/filepath"
	"testing"

	"github.com/stretchr/testify/require"
)

// Socket returns a private, per-test tmux socket *path* in its own scratch directory —
// deleted on cleanup, along with the tmux server bound to it — and never the user's
// default server (CLAUDE.md hard rule, ALWAYS via a dedicated socket).
//
// Deliberately NOT t.TempDir(): that path is rooted under the calling test's full name
// (e.g. ".../TestNewSession_AppliesServerOptionsOnlyOnceOnAnAlreadyRunningServer/001/"),
// and with "/tmux.sock" appended it can overflow AF_UNIX's ~104-byte sun_path limit on
// macOS ("File name too long" from tmux itself) — a real portability trap, not a style
// choice. os.MkdirTemp with a short, fixed prefix keeps the whole path well under that
// limit regardless of how long the calling test's own name is (D5).
func Socket(t *testing.T) string {
	t.Helper()
	dir, err := os.MkdirTemp("", "muster-tmuxtest-")
	require.NoError(t, err)
	t.Cleanup(func() { _ = os.RemoveAll(dir) })

	socket := filepath.Join(dir, "tmux.sock")
	t.Cleanup(func() {
		_ = exec.CommandContext(context.Background(), "tmux", "-S", socket, "kill-server").Run()
	})
	return socket
}
