package server

import (
	"bytes"
	"context"
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"os"
	"os/exec"
	"path/filepath"
	"strconv"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/Zalaras/muster/internal/claudecode"
	"github.com/Zalaras/muster/internal/claudecode/claudecodetest"
)

func requireShellTools(t *testing.T) {
	t.Helper()
	if _, err := exec.LookPath("curl"); err != nil {
		t.Skip("curl not on PATH; the generated wrapper scripts shell out to curl")
	}
	if _, err := exec.LookPath("sh"); err != nil {
		t.Skip("sh not on PATH")
	}
}

// wrapperCommands writes the wrapper scripts for baseURL into a data dir whose path holds a
// space, and returns the hook and status-line command strings exactly as MergeSettings
// registers them.
func wrapperCommands(t *testing.T, baseURL string) (hookCmd, statusLineCmd string) {
	t.Helper()
	dataDir := filepath.Join(t.TempDir(), "muster data")
	require.NoError(t, os.MkdirAll(dataDir, 0o700))
	hookScript, statusLineScript, _, err := claudecode.WriteWrapperScripts(dataDir, baseURL, testIngestToken)
	require.NoError(t, err)
	merged, err := claudecode.MergeSettings(nil, claudecode.SettingsConfig{HookCommand: hookScript, StatusLineCommand: statusLineScript})
	require.NoError(t, err)
	var doc settingsDoc
	require.NoError(t, json.Unmarshal(merged, &doc))
	return doc.Hooks["UserPromptSubmit"][0].Hooks[0].Command, doc.StatusLine.Command
}

// wrapperHangGuard only stops a hung wrapper: under a loaded `make test-race` one run took
// over 6 s to start sh and curl, so speed is asserted separately, never by this limit.
const wrapperHangGuard = 30 * time.Second

// runWrapperCapture runs cmdString via sh -c like Claude Code would and returns what it
// wrote, failing the test unless it exits 0 within wrapperHangGuard.
func runWrapperCapture(t *testing.T, cmdString string, env []string, stdin string) (stdout, stderr string) {
	t.Helper()
	ctx, cancel := context.WithTimeout(context.Background(), wrapperHangGuard)
	defer cancel()
	cmd := exec.CommandContext(ctx, "sh", "-c", cmdString)
	cmd.Env = env
	cmd.Stdin = strings.NewReader(stdin)
	var out, errOut bytes.Buffer
	cmd.Stdout = &out
	cmd.Stderr = &errOut
	require.NoError(t, cmd.Run(), "the wrapper must always exit 0")
	return out.String(), errOut.String()
}

// TestWrapperReply_PrintsTheBodyOnlyOnA2xx: hook.sh passes the daemon's body
// to stdout, byte for byte, only when the answer is a 2xx; every other status prints
// nothing, and the wrapper exits 0 and keeps stderr empty either way. status-line.sh, whose
// stdout is the status-line text, never prints whatever the daemon answers. The
// daemon-down case is TestWrapperScriptsShellRoundTrip_DaemonUnreachableExitsSilentlyAndFast.
func TestWrapperReply_PrintsTheBodyOnlyOnA2xx(t *testing.T) {
	requireShellTools(t)
	reply := string(claudecode.PromptTitleReply("Mine"))
	tests := []struct {
		name   string
		status int
		body   string
		want   string // what hook.sh prints
	}{
		{"200 with a body", 200, reply, reply},
		{"200 with a body holding a newline", 200, "line one\nline two", "line one\nline two"},
		{"200 with a trailing newline", 200, reply + "\n", reply + "\n"},
		{"200 with a body whose last line looks like a status", 200, "hi\n404", "hi\n404"},
		{"200 with an empty body", 200, "", ""},
		{"201 with a body", 201, reply, reply},
		{"202 with a body", 202, reply, reply},
		{"204 no content", 204, "", ""},
		{"299 is still 2xx", 299, reply, reply},
		{"301 with a body", 301, reply, ""},
		{"400 with a body", 400, reply, ""},
		{"404 with a body", 404, reply, ""},
		{"500 with a body", 500, reply, ""},
		{"503 with a body", 503, reply, ""},
		{"500 whose body ends in a 200 line", 500, "oops\n200", ""},
	}
	// One server and one script set for every row: a freshly written script costs a first
	// exec of a few hundred ms (kb:lesson/first-exec-of-fresh-script-costs-270ms), so the
	// rows share them and only the answer the handler gives changes.
	var mu sync.Mutex
	var status int
	var body string
	hs := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		mu.Lock()
		st, b := status, body
		mu.Unlock()
		w.WriteHeader(st)
		_, _ = w.Write([]byte(b))
	}))
	t.Cleanup(hs.Close)
	hookCmd, statusLineCmd := wrapperCommands(t, hs.URL)
	env := append(baseTestEnv(t), "MUSTER_SESSION=1", "TMUX_PANE=%1")
	hookStdin := claudecodetest.RawHookBody("UserPromptSubmit", "wrapper-reply-claude")
	statusStdin := claudecodetest.RawStatusLineFull("wrapper-reply-claude", claudecodetest.StatusLineFullOpts{})

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			mu.Lock()
			status, body = tt.status, tt.body
			mu.Unlock()

			stdout, stderr := runWrapperCapture(t, hookCmd, env, hookStdin)
			assert.Equal(t, tt.want, stdout, "hook.sh stdout")
			assert.Empty(t, stderr)

			stdout, stderr = runWrapperCapture(t, statusLineCmd, env, statusStdin)
			assert.Empty(t, stdout, "status-line.sh must never print the daemon's answer")
			assert.Empty(t, stderr)
		})
	}
}

// TestWrapperReply_AnAnswerThatNeverComesPrintsNothing covers the timeout case: curl's
// own 2 s limit ends the post, nothing reaches stdout, and the wrapper still exits 0.
func TestWrapperReply_AnAnswerThatNeverComesPrintsNothing(t *testing.T) {
	requireShellTools(t)
	// The handler reads the post and then never answers; the release channel lets Close
	// return once curl has given up (a handler that has not read its body is never told the
	// client went away).
	release := make(chan struct{})
	hs := httptest.NewServer(http.HandlerFunc(func(_ http.ResponseWriter, r *http.Request) {
		_, _ = io.Copy(io.Discard, r.Body)
		select {
		case <-r.Context().Done():
		case <-release:
		}
	}))
	t.Cleanup(hs.Close)
	t.Cleanup(func() { close(release) })
	hookCmd, _ := wrapperCommands(t, hs.URL)
	env := append(baseTestEnv(t), "MUSTER_SESSION=1", "TMUX_PANE=%1")

	start := time.Now()
	stdout, stderr := runWrapperCapture(t, hookCmd, env, claudecodetest.RawHookBody("UserPromptSubmit", "wrapper-timeout-claude"))

	assert.Empty(t, stdout)
	assert.Empty(t, stderr)
	assert.Less(t, time.Since(start), 5*time.Second, "curl --max-time 2 must end the wait")
}

// TestWrapperReply_RenameRoundTripThroughTheRealIngest runs the generated hook.sh against
// the real ingest handler: the first UserPromptSubmit after a rename prints the Claude Code
// reply on stdout, the second prints nothing, and a non-prompt hook prints nothing even
// with a rename waiting. This is the whole chain end to end.
func TestWrapperReply_RenameRoundTripThroughTheRealIngest(t *testing.T) {
	requireShellTools(t)
	r := newRenameRig(t)
	hs := httptest.NewServer(r.srv.Handler())
	t.Cleanup(hs.Close)
	hookCmd, _ := wrapperCommands(t, hs.URL)
	env := append(baseTestEnv(t), "MUSTER_SESSION="+strconv.FormatInt(r.id, 10), "TMUX_PANE=%1")
	run := func(event string) string {
		stdout, stderr := runWrapperCapture(t, hookCmd, env, claudecodetest.RawHookBody(event, r.claude))
		assert.Empty(t, stderr)
		return stdout
	}
	r.setTitle(strPtr("Renamed In Muster"))

	assert.Empty(t, run("PreToolUse"), "a non-prompt hook prints nothing and does not spend the rename")

	first := run("UserPromptSubmit")
	got, ok := claudecodetest.PromptReplyTitle([]byte(first))
	require.True(t, ok, "stdout %q", first)
	assert.Equal(t, "Renamed In Muster", got)

	assert.Empty(t, run("UserPromptSubmit"), "an override already sent is not printed again")
}
