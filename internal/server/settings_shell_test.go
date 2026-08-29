package server

import (
	"bytes"
	"context"
	"encoding/json"
	"net"
	"net/http"
	"net/http/httptest"
	"os"
	"os/exec"
	"path/filepath"
	"strconv"
	"strings"
	"sync/atomic"
	"testing"
	"time"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/Zalaras/muster/internal/claudecode"
	"github.com/Zalaras/muster/internal/claudecode/claudecodetest"
)

// settingsDoc is a minimal local decode target for the generated settings.local.json —
// deliberately not importing internal/claudecode's own (unexported) hookEntry/hookGroup
// types, per the plan's Implementation Notes: "do not import Claude-Code field names
// beyond hooks/statusLine/command, which are settings-file keys, not payload keys".
type settingsDoc struct {
	Hooks map[string][]struct {
		Hooks []struct {
			Command string `json:"command"`
		} `json:"hooks"`
	} `json:"hooks"`
	StatusLine struct {
		Command string `json:"command"`
	} `json:"statusLine"`
}

// usageSampleCount queries the store's own SQLite file directly, mirroring
// countEventsForSession/totalEventCount in ingest_test.go — internal/store deliberately
// exposes no query-by-count API for usage_sample either.
func usageSampleCount(t *testing.T, srv *testServer) int {
	t.Helper()
	var n int
	require.NoError(t, srv.queryDB(t).QueryRowContext(context.Background(),
		`SELECT COUNT(*) FROM usage_sample`,
	).Scan(&n))
	return n
}

// statusLineEventSessionID returns the routed session_id of the (single expected)
// status_line-typed event for claudeSessionID. Scoped to type='status_line' rather than
// the bare claude_session_id, since this test's claude id also carries an earlier
// SessionStart-typed row (D6a) — querying without the type filter would nondeterministically
// return either row.
func statusLineEventSessionID(t *testing.T, srv *testServer, claudeSessionID string) *int64 {
	t.Helper()
	var id *int64
	require.NoError(t, srv.queryDB(t).QueryRowContext(context.Background(),
		`SELECT session_id FROM event WHERE claude_session_id = ? AND type = 'status_line'`, claudeSessionID).Scan(&id))
	return id
}

func countStatusLineEventsForSession(t *testing.T, srv *testServer, claudeSessionID string) int {
	t.Helper()
	var n int
	require.NoError(t, srv.queryDB(t).QueryRowContext(context.Background(),
		`SELECT COUNT(*) FROM event WHERE claude_session_id = ? AND type = 'status_line'`, claudeSessionID).Scan(&n))
	return n
}

// TestWrapperScriptsShellRoundTrip covers D6/D6a/D6b/D6c/REQ-5/REQ-9: the settings→shell→
// script→POST chain the plan's own probe found broken on day one (spikes/FINDINGS.md
// 2026-08-25 addendum: a bare space-bearing command-hook path silently never runs), and
// (D11/REQ-9) that the enveloped SessionStart the wrapper produces actually binds. This
// test takes the *generated* command strings verbatim from a real MergeSettings output —
// not reimplemented quoting — and runs each one exactly as /bin/sh -c would, from a data
// dir whose path contains a space (Edge Case 6), against a real httptest server backed
// by the real ingest pipeline.
//
// Not hermetic (Edge Case 7): it shells out to a real curl. Skipped if curl isn't on
// PATH so CI portability isn't silently broken; that is the only condition under which
// this test does not run.
func TestWrapperScriptsShellRoundTrip(t *testing.T) {
	if _, err := exec.LookPath("curl"); err != nil {
		t.Skip("curl not on PATH; the generated wrapper scripts shell out to curl (Edge Case 7)")
	}
	if _, err := exec.LookPath("sh"); err != nil {
		t.Skip("sh not on PATH")
	}

	srv := newTestServer(t, ClaudeCodeInfo{})
	srv.Start()
	t.Cleanup(func() { srv.Shutdown(context.Background()) })
	sess := seedLiveSession(t, srv)

	hs := httptest.NewServer(srv.Handler())
	t.Cleanup(hs.Close)

	// Edge Case 6: t.TempDir() itself contains no space on macOS
	// (/var/folders/.../T/TestX.../001) — the test must deliberately introduce one, or it
	// silently loses the point of this plan.
	dataDir := filepath.Join(t.TempDir(), "muster data")
	require.NoError(t, os.MkdirAll(dataDir, 0o700), "the real daemon creates its data dir at startup; this test must do the same before writing into it")

	hookScript, statusLineScript, legacyScript, err := claudecode.WriteWrapperScripts(dataDir, hs.URL, testIngestToken)
	require.NoError(t, err)
	assert.Equal(t, filepath.Join(dataDir, "hook.sh"), hookScript, "REQ-5: one hook.sh serves all eleven events")
	assert.Equal(t, filepath.Join(dataDir, "hook-sessionstart.sh"), legacyScript)

	merged, err := claudecode.MergeSettings(nil, claudecode.SettingsConfig{
		HookCommand:       hookScript,
		StatusLineCommand: statusLineScript,
		LegacyCommands:    []string{legacyScript},
	})
	require.NoError(t, err)

	var doc settingsDoc
	require.NoError(t, json.Unmarshal(merged, &doc))
	require.Len(t, doc.Hooks["SessionStart"], 1)
	require.Len(t, doc.Hooks["SessionStart"][0].Hooks, 1)
	hookCmd := doc.Hooks["SessionStart"][0].Hooks[0].Command
	statusLineCmd := doc.StatusLine.Command

	// D6c: guard the test itself against silently losing its point.
	assert.Contains(t, hookCmd, " ", "the extracted hook command must contain a space (Edge Case 6)")
	assert.Contains(t, statusLineCmd, " ", "the extracted statusLine command must contain a space (Edge Case 6)")
	// And it must be the single-quoted form (REQ-1), not merely any string with a space.
	assert.Equal(t, "'"+hookScript+"'", hookCmd)
	assert.Equal(t, "'"+statusLineScript+"'", statusLineCmd)

	// REQ-1: every one of the eleven events carries the exact same command string —
	// spot-check a plain-HTTP-hook event too, not just SessionStart.
	require.Len(t, doc.Hooks["PreToolUse"], 1)
	require.Len(t, doc.Hooks["PreToolUse"][0].Hooks, 1)
	assert.Equal(t, hookCmd, doc.Hooks["PreToolUse"][0].Hooks[0].Command)

	env := append(baseTestEnv(t), "MUSTER_SESSION="+strconv.FormatInt(sess.ID, 10), "TMUX_PANE=%1")

	// --- SessionStart run (D6/D6a/D11) ---
	const claudeID = "shell-roundtrip-claude-1"
	runWrapperCommand(t, hookCmd, env, claudecodetest.RawHookBody("SessionStart", claudeID))

	require.Eventually(t, func() bool {
		return countEventsForSession(t, srv, claudeID) == 1
	}, 5*time.Second, 20*time.Millisecond, "the SessionStart wrapper script must have POSTed and been persisted")

	id := eventSessionID(t, srv, claudeID)
	require.NotNil(t, id, "D6a/D11: the SessionStart run must bind via the envelope MergeSettings/WriteWrapperScripts produced")
	assert.Equal(t, sess.ID, *id, "D6a: event.session_id must equal the seeded session's id")

	final, ok := srv.manager.Get(sess.ID)
	require.True(t, ok)
	assert.Equal(t, claudeID, final.ClaudeSessionID, "D11: the enveloped SessionStart must have bound the session's ClaudeSessionID")

	// --- status-line run (D6/D6b) --- raw (un-enveloped) body: the script itself adds
	// the envelope from $MUSTER_SESSION/$TMUX_PANE, exactly like the real status line.
	runWrapperCommand(t, statusLineCmd, env, claudecodetest.RawStatusLineFull(claudeID, claudecodetest.StatusLineFullOpts{}))

	require.Eventually(t, func() bool {
		return usageSampleCount(t, srv) == 1
	}, 5*time.Second, 20*time.Millisecond, "D6b: the status-line wrapper script must have produced one usage_sample row")

	require.Eventually(t, func() bool {
		return countStatusLineEventsForSession(t, srv, claudeID) == 1
	}, 5*time.Second, 20*time.Millisecond, "D6b: the status-line post must persist as a routed status_line event")
	statusID := statusLineEventSessionID(t, srv, claudeID)
	require.NotNil(t, statusID)
	assert.Equal(t, sess.ID, *statusID, "D6b: the status-line event must route to the seeded session's id")
}

// TestWrapperScriptsShellRoundTrip_UnmanagedSessionProducesZeroRequests covers
// D12/REQ-6: with $MUSTER_SESSION unset (an unmanaged Claude Code session in the same
// directory), running the generated hook command must make zero HTTP requests, persist
// zero new event rows, exit 0, and write nothing to stdout or stderr.
func TestWrapperScriptsShellRoundTrip_UnmanagedSessionProducesZeroRequests(t *testing.T) {
	if _, err := exec.LookPath("curl"); err != nil {
		t.Skip("curl not on PATH; the generated wrapper scripts shell out to curl (Edge Case 7)")
	}
	if _, err := exec.LookPath("sh"); err != nil {
		t.Skip("sh not on PATH")
	}

	srv := newTestServer(t, ClaudeCodeInfo{})
	srv.Start()
	t.Cleanup(func() { srv.Shutdown(context.Background()) })

	var requestCount int32
	hs := httptest.NewServer(countingHandler(&requestCount, srv.Handler()))
	t.Cleanup(hs.Close)

	dataDir := filepath.Join(t.TempDir(), "muster data")
	require.NoError(t, os.MkdirAll(dataDir, 0o700))

	hookScript, _, _, err := claudecode.WriteWrapperScripts(dataDir, hs.URL, testIngestToken)
	require.NoError(t, err)
	merged, err := claudecode.MergeSettings(nil, claudecode.SettingsConfig{HookCommand: hookScript, StatusLineCommand: hookScript})
	require.NoError(t, err)
	var doc settingsDoc
	require.NoError(t, json.Unmarshal(merged, &doc))
	hookCmd := doc.Hooks["SessionStart"][0].Hooks[0].Command

	const claudeID = "d12-unmanaged-claude-1"
	before := countEventsForSession(t, srv, claudeID)

	// D12: env deliberately has no MUSTER_SESSION — baseTestEnv already strips any stray
	// one from the test runner's own environment.
	env := baseTestEnv(t)
	runWrapperCommandExpectingSilence(t, hookCmd, env, claudecodetest.RawHookBody("SessionStart", claudeID), 3*time.Second)

	assert.Equal(t, int32(0), atomic.LoadInt32(&requestCount), "D12/REQ-6: an unmanaged session (no MUSTER_SESSION) must make zero HTTP requests")
	assert.Equal(t, before, countEventsForSession(t, srv, claudeID), "D12: zero new event rows")
}

// TestWrapperScriptsShellRoundTrip_DaemonUnreachableExitsSilentlyAndFast covers
// D13/REQ-7: with $MUSTER_SESSION set but the configured URL pointing at a closed
// loopback port (the daemon is down), the wrapper must exit 0 with empty stdout/stderr
// in well under the hook's own 2s curl --max-time, never hanging out to the shell's own
// timeout.
func TestWrapperScriptsShellRoundTrip_DaemonUnreachableExitsSilentlyAndFast(t *testing.T) {
	if _, err := exec.LookPath("curl"); err != nil {
		t.Skip("curl not on PATH; the generated wrapper scripts shell out to curl (Edge Case 7)")
	}
	if _, err := exec.LookPath("sh"); err != nil {
		t.Skip("sh not on PATH")
	}

	// A closed loopback port: bind then immediately close it, so nothing answers (D13's
	// "daemon down" case) while the URL shape is still a real loopback address.
	ln, err := net.Listen("tcp", "127.0.0.1:0")
	require.NoError(t, err)
	closedURL := "http://" + ln.Addr().String()
	require.NoError(t, ln.Close())

	dataDir := filepath.Join(t.TempDir(), "muster data")
	require.NoError(t, os.MkdirAll(dataDir, 0o700))
	hookScript, _, _, err := claudecode.WriteWrapperScripts(dataDir, closedURL, testIngestToken)
	require.NoError(t, err)
	merged, err := claudecode.MergeSettings(nil, claudecode.SettingsConfig{HookCommand: hookScript, StatusLineCommand: hookScript})
	require.NoError(t, err)
	var doc settingsDoc
	require.NoError(t, json.Unmarshal(merged, &doc))
	hookCmd := doc.Hooks["SessionStart"][0].Hooks[0].Command

	env := append(baseTestEnv(t), "MUSTER_SESSION=999", "TMUX_PANE=%1")

	start := time.Now()
	runWrapperCommandExpectingSilence(t, hookCmd, env, claudecodetest.RawHookBody("SessionStart", "d13-claude-1"), 3*time.Second)
	elapsed := time.Since(start)

	assert.Less(t, elapsed, 3*time.Second, "D13: a closed port must fail fast (curl --max-time 2), not hang out to the test's own timeout")
}

// countingHandler wraps next with an atomic request counter, so
// TestWrapperScriptsShellRoundTrip_UnmanagedSessionProducesZeroRequests can assert on
// "zero HTTP requests" directly rather than only inferring it from an unchanged DB.
func countingHandler(counter *int32, next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		atomic.AddInt32(counter, 1)
		next.ServeHTTP(w, r)
	})
}

// baseTestEnv returns the test runner's own environment with any stray MUSTER_SESSION/
// TMUX_PANE stripped, so a value the caller then appends is the only one that can take
// effect (exec.Cmd resolves duplicate keys to the last occurrence) — this must keep the
// real PATH so the subprocess's `sh`/`curl` resolve to the exact binaries
// exec.LookPath validated above, not a hand-picked guess at their location.
func baseTestEnv(t *testing.T) []string {
	t.Helper()
	var kept []string
	for _, kv := range os.Environ() {
		if strings.HasPrefix(kv, "MUSTER_SESSION=") || strings.HasPrefix(kv, "TMUX_PANE=") {
			continue
		}
		kept = append(kept, kv)
	}
	return kept
}

// runWrapperCommand runs cmdString (a command string extracted verbatim from a
// generated settings.local.json) through `sh -c`, feeding stdin and env, exactly as
// Claude Code itself would invoke a command hook or the status line.
func runWrapperCommand(t *testing.T, cmdString string, env []string, stdin string) {
	t.Helper()
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	cmd := exec.CommandContext(ctx, "sh", "-c", cmdString)
	cmd.Env = env
	cmd.Stdin = strings.NewReader(stdin)
	out, err := cmd.CombinedOutput()
	require.NoErrorf(t, err, "wrapper command failed: %s", string(out))
}

// runWrapperCommandExpectingSilence runs cmdString via sh -c exactly like
// runWrapperCommand, but asserts REQ-7's "never writes to stdout or stderr, always
// exits 0" contract directly on the observed process output/exit code — used for D12
// (MUSTER_SESSION unset) and D13 (daemon unreachable), where the whole point is that
// nothing observable happens.
func runWrapperCommandExpectingSilence(t *testing.T, cmdString string, env []string, stdin string, timeout time.Duration) {
	t.Helper()
	ctx, cancel := context.WithTimeout(context.Background(), timeout)
	defer cancel()

	cmd := exec.CommandContext(ctx, "sh", "-c", cmdString)
	cmd.Env = env
	cmd.Stdin = strings.NewReader(stdin)
	var stdout, stderr bytes.Buffer
	cmd.Stdout = &stdout
	cmd.Stderr = &stderr

	err := cmd.Run()

	require.NoError(t, err, "REQ-7: the wrapper must always exit 0")
	assert.Empty(t, stdout.String(), "REQ-7: the wrapper must never write to stdout")
	assert.Empty(t, stderr.String(), "REQ-7: the wrapper must never write to stderr")
}
