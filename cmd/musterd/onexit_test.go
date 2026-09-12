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

	"github.com/Zalaras/muster/internal/claudecode"

	"github.com/Zalaras/muster/internal/store"
	"github.com/Zalaras/muster/internal/tmux/tmuxtest"
)

// musterdBinary is built once (TestMain below) and shared by every test in this file —
// D19/D20/D21 each spawn their own process from it against their own scratch dataDir/
// tmux socket, so nothing about the binary itself needs to vary per test.
var musterdBinary string

// sharedStubClaude is the -claude-bin stub every test in this package (onexit_test.go and
// open_test.go — both package main) shares, built once by runTestMain before any test
// runs (REQ-9/D9). Before this, newSleepStubClaude wrote a fresh executable per
// spawnDaemon/openTestDaemonArgs call — ~7 fresh scripts per `go test` run of this
// package. macOS charges the first exec of a newly written executable a real, serialized
// cost (measured 2026-09-06, docs/history/design/test-strategy.md: ~270ms per inode on first
// exec), which this package's tests pay repeatedly for no reason, since every daemon in
// this file wants the exact same stub content. Mirrors
// web/e2e/helpers/daemon.ts's ensureSharedStubClaude, minus that harness's hash-keyed
// path and atomic write+rename: those exist there because concurrent Playwright workers
// race to create the file, and nothing here does — this package's tests run sequentially
// (no t.Parallel()), and the shared stub is written once, before m.Run(), with no
// concurrent writer to race.
var sharedStubClaude string

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

	sharedStubClaude = filepath.Join(dir, "stub-claude.sh")
	stubScript := "#!/bin/sh\n" +
		"if [ \"$1\" = \"--version\" ]; then echo \"" + claudecode.Verified() + " (Claude Code)\"; exit 0; fi\n" +
		"sleep 60\n"
	if writeErr := os.WriteFile(sharedStubClaude, []byte(stubScript), 0o755); writeErr != nil {
		fmt.Fprintln(os.Stderr, "musterd on-exit test setup: write shared stub claude:", writeErr)
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

// newSleepStubClaude returns the run-shared stub standing in for `claude` (REQ-9/D9): it
// answers `--version` with the pinned version (the daemon's startup drift check runs the
// -claude-bin binary, so a stub that slept there would stall every spawned daemon for
// the whole version-check timeout), otherwise ignores every argument (BuildArgv's
// --model/--resume/etc. don't matter here) and just sleeps, so a launched "session" has
// a real, live tmux pane to test against. CLAUDE.md forbids ever launching the real
// `claude` from a unit test — this is the sanctioned substitute, mirroring
// internal/server/sessions_test.go's newStubClaudeBin. One stub per package run
// (runTestMain writes it before any test starts), not one per call — see
// sharedStubClaude's doc comment.
func newSleepStubClaude(t *testing.T) string {
	t.Helper()
	require.NotEmpty(t, sharedStubClaude, "TestMain must have built the shared stub claude before any test runs")
	return sharedStubClaude
}

// tokensFileWriteBound bounds every wait in this package for musterd to write
// tokens.json, or for an effect that only happens once it has (REQ-8, D8, D10). Two
// legitimate, bounded-but-blocking steps precede that write on the startup path
// (main.go's run(), roughly lines 139-185: tmux preflight -> checkWebDist -> mkdir ->
// store.Open's migrations -> bootstrapTokens -> claude --version -> listen ->
// writeTokensFile): tmux.Preflight's own preflightTimeout (internal/tmux/preflight.go,
// 2s) and this package's own versionCheckTimeout for the claude --version drift check
// (main.go, 5s) - 7s of legitimate worst case before a single log line. The previous 10s
// bound left only ~3s of margin over that 7s for everything else on the path (fork/exec
// latency, mkdir, the migrations themselves) and measured one real flake at 10.02s under
// load (plans/post-worktree-spike-issues/validation.md) - a threshold the suite kept
// crossing, not a hang. 20s clears the 7s legitimate worst case with real headroom
// instead. This is the one bound this plan raises rather than removing the timing
// dependence entirely (docs/history/design/test-strategy.md's standing rule), because it is
// derived from the path's own worst case, not a bumped magic number.
const tokensFileWriteBound = 20 * time.Second

// spawnDaemon starts musterd-under-test against a fresh scratch dataDir and tmux socket.
// stdin, if non-nil, becomes the subprocess's stdin (D21 passes a pipe's read end so
// "-on-exit ask" sees a non-TTY without needing a real terminal).
func spawnDaemon(t *testing.T, onExit string, stdin *os.File) *spawnedDaemon {
	t.Helper()
	dataDir := t.TempDir()
	webDist := t.TempDir()

	// tmuxSocket (plan v1-cleanup REQ-4): tmuxtest.Socket replaces this file's own copy
	// of the shared os.MkdirTemp + kill-server idiom (D12-style discipline) — never a
	// bare -L name in tmux's shared socket directory and never the user's default server
	// (CLAUDE.md hard rule).
	tmuxSocket := tmuxtest.Socket(t)

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
	}, tokensFileWriteBound, 20*time.Millisecond, "musterd must write tokens.json within tokensFileWriteBound's derived 7s+margin bound; stderr so far: %s", stderr)

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
