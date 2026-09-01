package main

// D19-D21 exercise musterd's real `-on-exit` shutdown policy end to end: a real musterd
// process (built once below), a real scratch tmux socket (never -L muster and never the
// user's default server — CLAUDE.md hard rule), a real live "session" (tmux spawns a
// stub script that just sleeps — CLAUDE.md forbids ever launching the real `claude` from
// a unit test), a real OS signal, and the process's real exit code. This needs the actual
// binary rather than an in-process call to run(): sending a real SIGINT/SIGTERM to this
// test's own process to exercise run()'s signal.Notify path would risk terminating the
// whole `go test` run if delivered before that Notify call has registered — a subprocess
// makes that race harmless instead of catastrophic.

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"net/url"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"sync"
	"syscall"
	"testing"
	"time"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/Zalaras/muster/internal/store"
)

// musterdBinary is built once (TestMain below) and shared by every test in this file —
// D19/D20/D21 each spawn their own process from it against their own scratch dataDir/
// tmux socket, so nothing about the binary itself needs to vary per test.
var musterdBinary string

func TestMain(m *testing.M) {
	os.Exit(runTestMain(m))
}

// runTestMain is TestMain's body, split out so its deferred cleanup actually runs (a
// deferred call inside a function that itself calls os.Exit never fires — gocritic
// exitAfterDefer).
func runTestMain(m *testing.M) int {
	dir, err := os.MkdirTemp("", "musterd-onexit-build-")
	if err != nil {
		fmt.Fprintln(os.Stderr, "musterd on-exit test setup: MkdirTemp:", err)
		return 1
	}
	defer func() { _ = os.RemoveAll(dir) }()

	musterdBinary = filepath.Join(dir, "musterd-under-test")
	cmd := exec.Command("go", "build", "-o", musterdBinary, ".")
	if out, buildErr := cmd.CombinedOutput(); buildErr != nil {
		fmt.Fprintf(os.Stderr, "musterd on-exit test setup: go build musterd: %v: %s\n", buildErr, out)
		return 1
	}

	return m.Run()
}

// syncBuf is a mutex-guarded byte buffer: the subprocess writes its stdout/stderr
// concurrently with the test goroutine possibly reading them back for a failure message.
type syncBuf struct {
	mu  sync.Mutex
	buf bytes.Buffer
}

func (b *syncBuf) Write(p []byte) (int, error) {
	b.mu.Lock()
	defer b.mu.Unlock()
	return b.buf.Write(p)
}

func (b *syncBuf) String() string {
	b.mu.Lock()
	defer b.mu.Unlock()
	return b.buf.String()
}

// tokensFileShape mirrors main.go's own tokensFile — a private local copy (this is a
// black-box subprocess test; it deliberately reads the same JSON file a real dashboard
// launcher would, not an internal type).
type tokensFileShape struct {
	DashboardURL string `json:"dashboardUrl"`
	UIToken      string `json:"uiToken"`
	IngestToken  string `json:"ingestToken"`
}

// spawnedDaemon is a running musterd-under-test subprocess plus what D19-D21 need to
// drive and inspect it: launch a session over its real HTTP API, wait for the resulting
// tmux session, signal it, and check what's left afterward.
type spawnedDaemon struct {
	cmd        *exec.Cmd
	dataDir    string
	tmuxSocket string
	baseURL    string
	uiToken    string
	stdout     *syncBuf
	stderr     *syncBuf
}

// newSleepStubClaude writes an executable standing in for `claude`: it ignores every
// argument (BuildArgv's --model/--resume/etc. don't matter here) and just sleeps, so a
// launched "session" has a real, live tmux pane to test against. CLAUDE.md forbids ever
// launching the real `claude` from a unit test — this is the sanctioned substitute,
// mirroring internal/server/sessions_test.go's newStubClaudeBin.
func newSleepStubClaude(t *testing.T) string {
	t.Helper()
	path := filepath.Join(t.TempDir(), "stub-claude.sh")
	require.NoError(t, os.WriteFile(path, []byte("#!/bin/sh\nsleep 60\n"), 0o755))
	return path
}

// spawnDaemon starts musterd-under-test against a fresh scratch dataDir and tmux socket.
// stdin, if non-nil, becomes the subprocess's stdin (D21 passes a pipe's read end so
// "-on-exit ask" sees a non-TTY without needing a real terminal).
func spawnDaemon(t *testing.T, onExit string, stdin *os.File) *spawnedDaemon {
	t.Helper()
	dataDir := t.TempDir()
	webDist := t.TempDir()

	// A private per-test tmux socket *path* in its own scratch dir, never a bare -L name
	// in tmux's shared socket directory (D12-style discipline, mirrors
	// internal/tmux/tmux_test.go's newTestSocket) and never the user's default server
	// (CLAUDE.md hard rule). Deliberately not t.TempDir() directly: appending "/tmux.sock"
	// to a name-rooted temp dir can overflow AF_UNIX's ~104-byte sun_path limit on macOS.
	sockDir, err := os.MkdirTemp("", "musterd-onexit-sock-")
	require.NoError(t, err)
	t.Cleanup(func() { _ = os.RemoveAll(sockDir) })
	tmuxSocket := filepath.Join(sockDir, "tmux.sock")
	t.Cleanup(func() { _ = exec.Command("tmux", "-S", tmuxSocket, "kill-server").Run() })

	args := []string{
		"-addr", "127.0.0.1:0",
		"-data-dir", dataDir,
		"-web-dist", webDist,
		"-claude-bin", newSleepStubClaude(t),
		"-tmux-socket", tmuxSocket,
		"-on-exit", onExit,
		// D19-D21 have nothing to do with usage polling; -usage-poll's non-zero CLI
		// default plus its immediate fetch on Start would otherwise make every spawned
		// musterd here shell out to the real macOS Keychain and, if that lookup
		// succeeded, call the real https://api.anthropic.com with whatever real Claude
		// Code OAuth token is on the machine running `go test` — an unannounced touch of
		// a real subscription CLAUDE.md forbids. -usage-token-file points at a scratch
		// file that's never written, so the reader fails fast with ErrNoCredentials
		// (ordinary "no-credentials", not a real lookup) even with polling left off by
		// -usage-poll 0 belt-and-braces.
		"-usage-poll", "0",
		"-usage-token-file", filepath.Join(dataDir, "usage-token-not-present"),
		// REQ-11: defence in depth over REQ-6's terminal condition, which already covers
		// every spawn in this file (none of them set a terminal stdin).
		"-open=false",
	}
	cmd := exec.Command(musterdBinary, args...)
	if stdin != nil {
		cmd.Stdin = stdin
	}
	stdout, stderr := &syncBuf{}, &syncBuf{}
	cmd.Stdout = stdout
	cmd.Stderr = stderr

	require.NoError(t, cmd.Start())
	t.Cleanup(func() {
		// Belt-and-braces: a test that fails before reaching its own signal step must not
		// leave an orphan musterd process running (CLAUDE.md: "an orphan keeps burning" —
		// stated about `claude`, the same discipline applies to the daemon spawned here).
		if cmd.Process != nil {
			_ = cmd.Process.Kill()
		}
	})

	d := &spawnedDaemon{cmd: cmd, dataDir: dataDir, tmuxSocket: tmuxSocket, stdout: stdout, stderr: stderr}

	var tf tokensFileShape
	require.Eventually(t, func() bool {
		b, readErr := os.ReadFile(filepath.Join(dataDir, "tokens.json"))
		if readErr != nil {
			return false
		}
		return json.Unmarshal(b, &tf) == nil && tf.DashboardURL != ""
	}, 10*time.Second, 20*time.Millisecond, "musterd must write tokens.json shortly after starting; stderr so far: %s", stderr)

	u, err := url.Parse(tf.DashboardURL)
	require.NoError(t, err)
	d.baseURL = u.Scheme + "://" + u.Host
	d.uiToken = tf.UIToken
	return d
}

// launchSession POSTs a real launch request against the running daemon's HTTP API — the
// only way this black-box test can put a live tmux session under it.
func (d *spawnedDaemon) launchSession(t *testing.T, dir string) {
	t.Helper()
	body := fmt.Sprintf(`{"directory":%q,"model":"sonnet","permissionMode":"default"}`, dir)
	req, err := http.NewRequest(http.MethodPost, d.baseURL+"/api/sessions", strings.NewReader(body))
	require.NoError(t, err)
	req.AddCookie(&http.Cookie{Name: "muster_auth", Value: d.uiToken})
	req.Header.Set("Content-Type", "application/json")

	resp, err := http.DefaultClient.Do(req)
	require.NoError(t, err, "stderr so far: %s", d.stderr)
	defer func() { _ = resp.Body.Close() }()
	require.Equal(t, http.StatusCreated, resp.StatusCode, "launch failed; stderr so far: %s", d.stderr)
}

// waitForLiveTmuxSession blocks until at least one muster-* session exists on d's socket
// — proof the launch above actually reached tmux, not just the HTTP 201.
func (d *spawnedDaemon) waitForLiveTmuxSession(t *testing.T) {
	t.Helper()
	require.Eventually(t, func() bool {
		return len(tmuxSessionNames(d.tmuxSocket)) > 0
	}, 10*time.Second, 50*time.Millisecond, "expected a muster-* tmux session to appear on the scratch socket")
}

// signalAndWaitExit sends sig to the subprocess and waits (with timeout) for it to exit,
// returning its exit code.
func (d *spawnedDaemon) signalAndWaitExit(t *testing.T, sig os.Signal, timeout time.Duration) int {
	t.Helper()
	require.NoError(t, d.cmd.Process.Signal(sig))

	done := make(chan error, 1)
	go func() { done <- d.cmd.Wait() }()

	select {
	case err := <-done:
		if err == nil {
			return 0
		}
		var exitErr *exec.ExitError
		if errors.As(err, &exitErr) {
			return exitErr.ExitCode()
		}
		t.Fatalf("musterd process did not exit cleanly: %v; stderr: %s", err, d.stderr)
	case <-time.After(timeout):
		_ = d.cmd.Process.Kill()
		t.Fatalf("musterd did not exit within %s after signal; stderr so far: %s", timeout, d.stderr)
	}
	return -1
}

// tmuxSessionNames lists every session on socket, or nil if the server is gone/empty —
// the same "no server running yet" shape internal/tmux.Client.ListSessions treats as
// empty, not an error (this is a plain CLI oracle call, not production code, so it uses
// the tmux binary directly rather than importing internal/tmux).
func tmuxSessionNames(socket string) []string {
	out, err := exec.Command("tmux", "-S", socket, "list-sessions", "-F", "#{session_name}").Output()
	if err != nil {
		return nil
	}
	trimmed := strings.TrimSpace(string(out))
	if trimmed == "" {
		return nil
	}
	return strings.Split(trimmed, "\n")
}

// TestOnExit_Leave_LiveSessionSurvivesShutdown covers D19: `-on-exit=leave` with a live
// session exits 0 and leaves the tmux session running untouched.
func TestOnExit_Leave_LiveSessionSurvivesShutdown(t *testing.T) {
	d := spawnDaemon(t, "leave", nil)
	d.launchSession(t, t.TempDir())
	d.waitForLiveTmuxSession(t)

	exitCode := d.signalAndWaitExit(t, syscall.SIGTERM, 15*time.Second)

	assert.Equal(t, 0, exitCode, "stderr: %s", d.stderr)
	assert.NotEmpty(t, tmuxSessionNames(d.tmuxSocket), "a live session must survive -on-exit=leave")
	assert.Contains(t, d.stderr.String(), "leaving live sessions running", "REQ-3's leave log line")
}

// TestOnExit_Kill_LiveSessionIsKilledAndRowMarkedDead covers D20: `-on-exit=kill` with a
// live session exits 0, the tmux session is gone, and the persisted row reads alive=false.
func TestOnExit_Kill_LiveSessionIsKilledAndRowMarkedDead(t *testing.T) {
	d := spawnDaemon(t, "kill", nil)
	d.launchSession(t, t.TempDir())
	d.waitForLiveTmuxSession(t)

	exitCode := d.signalAndWaitExit(t, syscall.SIGTERM, 15*time.Second)

	assert.Equal(t, 0, exitCode, "stderr: %s", d.stderr)
	assert.Empty(t, tmuxSessionNames(d.tmuxSocket), "-on-exit=kill must kill the tmux session before exiting")
	assert.Contains(t, d.stderr.String(), "ended live sessions on shutdown", "REQ-3's kill log line")

	st, err := store.Open(context.Background(), filepath.Join(d.dataDir, "muster.db"))
	require.NoError(t, err)
	defer func() { _ = st.Close() }()
	rows, err := st.ListSessions(context.Background())
	require.NoError(t, err)
	require.Len(t, rows, 1)
	assert.False(t, rows[0].Alive, "the row must read alive=false after -on-exit=kill")
	assert.NotNil(t, rows[0].EndedAt)
}

// TestOnExit_AskWithNonTTYStdinBehavesAsLeave covers D21 and D11: `-on-exit=ask` with a
// non-TTY stdin (a pipe, never a real terminal) never prompts and behaves exactly like
// "leave" — the tmux session survives, never a silent kill — and D11's bounded wait
// proves it resolved immediately via isTerminal rather than sitting out the 10s prompt
// timeout (Edge Case 14): before REQ-9, a /dev/null-shaped stdin was wrongly treated as
// a TTY, entered the prompt, and was still waiting when the E2E harness's 5s SIGKILL
// escalation fired mid-shutdown.
func TestOnExit_AskWithNonTTYStdinBehavesAsLeave(t *testing.T) {
	r, w, err := os.Pipe()
	require.NoError(t, err)
	t.Cleanup(func() { _ = r.Close(); _ = w.Close() })

	d := spawnDaemon(t, "ask", r)
	d.launchSession(t, t.TempDir())
	d.waitForLiveTmuxSession(t)

	start := time.Now()
	exitCode := d.signalAndWaitExit(t, syscall.SIGTERM, 15*time.Second)
	elapsed := time.Since(start)

	assert.Equal(t, 0, exitCode, "stderr: %s", d.stderr)
	assert.NotEmpty(t, tmuxSessionNames(d.tmuxSocket), "ask under non-TTY stdin must behave as leave, never a silent kill")
	assert.Less(t, elapsed, 5*time.Second,
		"D11: a non-TTY stdin must resolve immediately via isTerminal, well inside the 10s prompt timeout, not sit out the prompt")
}
