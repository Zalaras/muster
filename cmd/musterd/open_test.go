package main

// D8, D9, D9b and D10 exercise auto-open through a real musterd-under-test subprocess
// (built once by onexit_test.go's TestMain, shared by this file) rather than calling
// openDashboard in-process: the load-bearing condition under test is main.go's own
// `*openFlag && isTerminal(stdin)` wiring plus a real subprocess's real fd 0, which an
// in-process call to run() with a fabricated *os.File stdin could not exercise
// faithfully. None of these daemons ever launch a session or touch a real tmux server —
// each still gets its own private scratch tmux socket (CLAUDE.md hard rule: never the
// user's default server) purely because server.New always needs one.

import (
	"encoding/json"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"syscall"
	"testing"
	"time"

	"github.com/creack/pty"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/Zalaras/muster/internal/tmux/tmuxtest"
)

// newRecordingStub writes an executable standing in for -open-cmd's program: it appends
// its first argument (the dashboard URL, REQ-6's single argument) as its own line to
// recordFile. Follows -claude-bin's seam pattern exactly (Implementation Notes), the way
// onexit_test.go's newSleepStubClaude stands in for -claude-bin.
func newRecordingStub(t *testing.T, recordFile string) string {
	t.Helper()
	path := filepath.Join(t.TempDir(), "stub-open.sh")
	script := "#!/bin/sh\necho \"$1\" >> " + recordFile + "\n"
	require.NoError(t, os.WriteFile(path, []byte(script), 0o755))
	return path
}

// newPTYStdin opens a real pseudo-terminal (creack/pty, D8's "a pty from creack/pty")
// and returns its slave end for use as a subprocess's Stdin — isatty.IsTerminal reports
// true for it, unlike a pipe or /dev/null. Both ends are kept open and cleaned up
// together; closing the master before the child exits would give the child a broken
// slave.
func newPTYStdin(t *testing.T) *os.File {
	t.Helper()
	ptmx, tty, err := pty.Open()
	require.NoError(t, err)
	t.Cleanup(func() {
		_ = ptmx.Close()
		_ = tty.Close()
	})
	return tty
}

// openTestDaemonArgs returns the flag set every test in this file shares: a scratch
// data/web dir, a private per-test tmux socket path (never a bare -L name in tmux's
// shared socket directory, and never the user's default server — CLAUDE.md hard rule,
// even though nothing here ever creates a tmux session on it), and usage polling
// disabled so no daemon spawned here ever touches the real macOS Keychain or
// api.anthropic.com (mirrors onexit_test.go's spawnDaemon args exactly, for the same
// reason).
func openTestDaemonArgs(t *testing.T, extra ...string) (args []string, dataDir string) {
	t.Helper()
	dataDir = t.TempDir()
	webDist := t.TempDir()

	// tmuxSocket (plan v1-cleanup REQ-4): tmuxtest.Socket replaces this file's own copy
	// of the shared os.MkdirTemp + kill-server idiom — never a bare -L name in tmux's
	// shared socket directory and never the user's default server (CLAUDE.md hard rule),
	// even though nothing here ever creates a tmux session on it.
	tmuxSocket := tmuxtest.Socket(t)

	args = []string{
		"-addr", "127.0.0.1:0",
		"-data-dir", dataDir,
		"-web-dist", webDist,
		"-tmux-socket", tmuxSocket,
		"-claude-bin", newSleepStubClaude(t), // the startup drift check runs -claude-bin; never the real claude from a test
		"-usage-poll", "0",
		"-usage-token-file", filepath.Join(dataDir, "usage-token-not-present"),
	}
	return append(args, extra...), dataDir
}

// waitForTokensFile blocks until dataDir/tokens.json exists and carries a populated
// dashboardUrl — proof the daemon reached its serving state (D10's "still reaches
// serving state").
func waitForTokensFile(t *testing.T, dataDir string) tokensFileShape {
	t.Helper()
	var tf tokensFileShape
	require.Eventually(t, func() bool {
		b, err := os.ReadFile(filepath.Join(dataDir, "tokens.json"))
		if err != nil {
			return false
		}
		return json.Unmarshal(b, &tf) == nil && tf.DashboardURL != ""
	}, 10*time.Second, 20*time.Millisecond, "musterd must write tokens.json shortly after starting")
	return tf
}

// terminate sends SIGTERM and waits briefly for a clean exit, never failing the test if
// shutdown is slow — these tests only care about what happened during startup.
func terminate(cmd *exec.Cmd) {
	if cmd.Process == nil {
		return
	}
	_ = cmd.Process.Signal(syscall.SIGTERM)
	done := make(chan struct{})
	go func() {
		_, _ = cmd.Process.Wait()
		close(done)
	}()
	select {
	case <-done:
	case <-time.After(5 * time.Second):
		_ = cmd.Process.Kill()
	}
}

// TestOpen_DefaultOpenWithTerminalStdinRunsStubOnce covers D8: with -open defaulted, a
// real terminal stdin, and -open-cmd pointed at a stub, the stub is executed exactly
// once with the dashboard URL from tokens.json as its only argument.
func TestOpen_DefaultOpenWithTerminalStdinRunsStubOnce(t *testing.T) {
	recordFile := filepath.Join(t.TempDir(), "record.txt")
	stub := newRecordingStub(t, recordFile)
	args, dataDir := openTestDaemonArgs(t, "-open-cmd", stub) // -open left at its true default

	cmd := exec.Command(musterdBinary, args...)
	cmd.Stdin = newPTYStdin(t)
	var stderr syncBuf
	cmd.Stderr = &stderr
	require.NoError(t, cmd.Start())
	t.Cleanup(func() { terminate(cmd) })

	tf := waitForTokensFile(t, dataDir)

	require.Eventually(t, func() bool {
		b, err := os.ReadFile(recordFile)
		return err == nil && len(b) > 0
	}, 10*time.Second, 50*time.Millisecond, "the stub must be invoked; stderr so far: %s", &stderr)

	// A late second invocation would be a real defect (REQ-8 promises a single run) —
	// give one long enough for a bug to show up before reading the final content.
	time.Sleep(300 * time.Millisecond)

	b, err := os.ReadFile(recordFile)
	require.NoError(t, err)
	lines := strings.Split(strings.TrimRight(string(b), "\n"), "\n")
	require.Len(t, lines, 1, "the stub must be executed exactly once; stderr: %s", &stderr)
	assert.Equal(t, tf.DashboardURL, lines[0])
}

// TestOpen_OpenFalseNeverRunsStub covers D9: -open=false with a terminal stdin must
// never execute the stub, even though the terminal condition alone would otherwise fire.
func TestOpen_OpenFalseNeverRunsStub(t *testing.T) {
	recordFile := filepath.Join(t.TempDir(), "record.txt")
	stub := newRecordingStub(t, recordFile)
	args, dataDir := openTestDaemonArgs(t, "-open=false", "-open-cmd", stub)

	cmd := exec.Command(musterdBinary, args...)
	cmd.Stdin = newPTYStdin(t)
	require.NoError(t, cmd.Start())
	t.Cleanup(func() { terminate(cmd) })

	waitForTokensFile(t, dataDir)
	time.Sleep(500 * time.Millisecond) // let a buggy auto-open goroutine have its chance to fire

	_, err := os.ReadFile(recordFile)
	assert.True(t, os.IsNotExist(err), "-open=false must never run the stub")
}

// TestOpen_DefaultOpenWithDevNullStdinNeverRunsStub covers D9b: the terminal condition,
// not the flag, is what guarantees every test spawn is browser-free — a /dev/null stdin
// (cmd.Stdin left nil, exactly what onexit_test.go's subprocesses and the E2E harness's
// stdio: ["ignore", ...] both give musterd) must suppress auto-open even with -open at
// its true default.
func TestOpen_DefaultOpenWithDevNullStdinNeverRunsStub(t *testing.T) {
	recordFile := filepath.Join(t.TempDir(), "record.txt")
	stub := newRecordingStub(t, recordFile)
	args, dataDir := openTestDaemonArgs(t, "-open-cmd", stub) // -open defaulted true

	cmd := exec.Command(musterdBinary, args...) // cmd.Stdin left nil -> /dev/null
	require.NoError(t, cmd.Start())
	t.Cleanup(func() { terminate(cmd) })

	waitForTokensFile(t, dataDir)
	time.Sleep(500 * time.Millisecond)

	_, err := os.ReadFile(recordFile)
	assert.True(t, os.IsNotExist(err), "D9b: a /dev/null stdin must never trigger auto-open regardless of the -open flag")
}

// TestOpen_NonexistentOpenCmdStillReachesServingState covers D10/REQ-8: a -open-cmd
// naming a program that does not exist must not block startup — the daemon still
// reaches its serving state (tokens.json written, HTTP reachable) and only logs a
// warning, which per R4 must never carry the dashboard URL itself.
func TestOpen_NonexistentOpenCmdStillReachesServingState(t *testing.T) {
	args, dataDir := openTestDaemonArgs(t, "-open-cmd", "/nonexistent-binary-xyz-does-not-exist")

	cmd := exec.Command(musterdBinary, args...)
	cmd.Stdin = newPTYStdin(t)
	var stderr syncBuf
	cmd.Stderr = &stderr
	require.NoError(t, cmd.Start())
	t.Cleanup(func() { terminate(cmd) })

	tf := waitForTokensFile(t, dataDir)
	require.NotEmpty(t, tf.DashboardURL)

	resp, err := http.Get(tf.DashboardURL)
	require.NoError(t, err, "the daemon must still be serving; stderr: %s", &stderr)
	_ = resp.Body.Close()

	const warningMsg = "could not auto-open the dashboard"
	require.Eventually(t, func() bool {
		return strings.Contains(stderr.String(), warningMsg)
	}, 10*time.Second, 50*time.Millisecond, "stderr so far: %s", &stderr)

	// R4 only constrains the auto-open warning line itself — the token and dashboard URL
	// are expected (and already documented) elsewhere in stderr, on the "musterd
	// starting" log line, so the assertion isolates just the one line under test rather
	// than scanning the whole buffer.
	var warningLine string
	for _, line := range strings.Split(stderr.String(), "\n") {
		if strings.Contains(line, warningMsg) {
			warningLine = line
			break
		}
	}
	require.NotEmpty(t, warningLine, "stderr so far: %s", &stderr)
	assert.NotContains(t, warningLine, tf.UIToken, "R4: the auto-open warning must never leak the UI token")
	assert.NotContains(t, warningLine, tf.DashboardURL, "R4: the auto-open warning must never carry the dashboard URL")
}
