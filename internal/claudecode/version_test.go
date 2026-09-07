package claudecode

import (
	"context"
	"errors"
	"os"
	"os/exec"
	"path/filepath"
	"testing"
	"time"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestVersionRE(t *testing.T) {
	tests := []struct {
		name string
		out  string
		want string // "" means: expect no match
	}{
		{"native install format", "2.1.233 (Claude Code)", "2.1.233"},
		{"bare version", "2.1.233", "2.1.233"},
		{"multi-digit minor", "2.10.0 (Claude Code)", "2.10.0"},
		{"not a version", "command not found", ""},
		{"incomplete version", "2.1 (Claude Code)", ""},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			m := versionRE.FindStringSubmatch(tt.out)
			if tt.want == "" {
				assert.Nil(t, m)
				return
			}
			require.NotNil(t, m)
			assert.Equal(t, tt.want, m[1])
		})
	}
}

// writeVersionLeakStub writes a real executable that prints the pinned --version output
// and then exits successfully while a *descendant* it forked keeps the inherited stdout
// pipe open for a long time. This is the exact shape that hung musterd's startup before
// its first log line at e0319f8 (REQ-2): the direct child (the one exec.CommandContext
// tracks) exits promptly, so a stub that merely slept *before* exiting would only prove
// the ordinary context-deadline/kill path, not this bug — os/exec's Wait blocks on the
// stdout pipe reaching EOF, and that requires every fd holder to close it, including a
// backgrounded grandchild the shell never waits for.
func writeVersionLeakStub(t *testing.T) string {
	t.Helper()
	dir := t.TempDir()
	path := filepath.Join(dir, "claude")
	script := "#!/bin/sh\n" +
		"echo '" + PinnedVersion + " (Claude Code)'\n" +
		"sleep 60 &\n" +
		"exit 0\n"
	require.NoError(t, os.WriteFile(path, []byte(script), 0o755))
	return path
}

// TestInstalledVersion_DescendantHoldingStdoutDoesNotHangStartup covers D2/REQ-2 and Edge
// Cases 1-2: a claude binary that exits 0 promptly but leaves a descendant holding stdout
// must not stall InstalledVersion past the WaitDelay bound, since this runs on musterd's
// startup path before any log line. The call is run in a goroutine with the test's own
// bounded select so a regression (WaitDelay reverted/removed) fails this test with a clear
// diagnostic instead of hanging the whole `go test` run for the stub's full sleep.
func TestInstalledVersion_DescendantHoldingStdoutDoesNotHangStartup(t *testing.T) {
	bin := writeVersionLeakStub(t)

	type result struct {
		version string
		err     error
	}
	done := make(chan result, 1)
	start := time.Now()
	go func() {
		v, err := InstalledVersion(context.Background(), bin)
		done <- result{v, err}
	}()

	select {
	case res := <-done:
		elapsed := time.Since(start)
		assert.Less(t, elapsed, 15*time.Second, "must return within the 2s WaitDelay bound plus slack, not wait out the descendant's own sleep")
		// The pipe is force-closed mid-read once WaitDelay elapses, which os/exec
		// reports as an error even though the direct process itself exited 0 — so the
		// version is unavailable this time, but the call still returned promptly
		// rather than hanging (the happy-path parse is covered by the existing
		// subprocess-free TestVersionRE table, D1/Edge Case 3).
		assert.Error(t, res.err)
		assert.ErrorIs(t, res.err, exec.ErrWaitDelay)
		assert.Empty(t, res.version)
	case <-time.After(15 * time.Second):
		t.Fatal("InstalledVersion did not return within 15s of a descendant holding stdout open — this is the startup hang REQ-2 fixes (revert cmd.WaitDelay in version.go to reproduce)")
	}
}

func TestVersionDriftErrorIsMatchable(t *testing.T) {
	err := error(&VersionDriftError{Installed: "2.2.0", Pinned: PinnedVersion})

	var drift *VersionDriftError
	require.True(t, errors.As(err, &drift))
	assert.Equal(t, "2.2.0", drift.Installed)
	assert.Contains(t, err.Error(), PinnedVersion)
}
