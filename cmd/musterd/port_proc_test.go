package main

// These tests drive a real musterd-under-test subprocess (built once by onexit_test.go's
// TestMain) for the port behaviours that live in run()'s wiring and the real fd 0.
// The pure rules are in port_test.go.

import (
	"bytes"
	"net"
	"net/http"
	"net/url"
	"os"
	"os/exec"
	"strconv"
	"strings"
	"syscall"
	"testing"
	"time"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

const promptTextPrefix = "Save port "

// portDaemonArgs is openTestDaemonArgs with the data dir and -port set as the test needs:
// an empty port drops the flag, an empty dataDir keeps the scratch one.
func portDaemonArgs(t *testing.T, dataDir, port string) []string {
	t.Helper()
	args, scratch := openTestDaemonArgs(t, "-open=false")
	if dataDir == "" {
		dataDir = scratch
	}
	out := make([]string, 0, len(args))
	for i := 0; i < len(args); i++ {
		switch args[i] {
		case "-port":
			i++
			if port != "" {
				out = append(out, "-port", port)
			}
		case "-data-dir":
			i++
			out = append(out, "-data-dir", dataDir)
		default:
			out = append(out, args[i])
		}
	}
	return out
}

func spawnPortDaemon(t *testing.T, args []string, stdin *os.File, env ...string) (*exec.Cmd, *syncBuf) {
	t.Helper()
	cmd := exec.Command(musterdBinary, args...)
	cmd.Env = append(os.Environ(), env...)
	if stdin != nil {
		cmd.Stdin = stdin
	}
	stderr := &syncBuf{}
	cmd.Stderr = stderr
	require.NoError(t, cmd.Start())
	t.Cleanup(func() { terminate(cmd) })
	return cmd, stderr
}

func flagValue(t *testing.T, args []string, flag string) string {
	t.Helper()
	for i, a := range args {
		if a == flag {
			return args[i+1]
		}
	}
	require.Fail(t, "flag missing from args", flag)
	return ""
}

func dataDirOf(t *testing.T, args []string) string {
	t.Helper()
	return flagValue(t, args, "-data-dir")
}

func boundPort(t *testing.T, tf tokensFileShape) string {
	t.Helper()
	u, err := url.Parse(tf.DashboardURL)
	require.NoError(t, err)
	return u.Port()
}

func exitCode(t *testing.T, cmd *exec.Cmd) int {
	t.Helper()
	done := make(chan error, 1)
	go func() { done <- cmd.Wait() }()
	select {
	case err := <-done:
		if err == nil {
			return 0
		}
		var exitErr *exec.ExitError
		require.ErrorAs(t, err, &exitErr)
		return exitErr.ExitCode()
	case <-time.After(tokensFileWriteBound):
		require.Fail(t, "musterd did not exit")
		return -1
	}
}

// TestPortProc_YesSavesAndTheNextStartBindsTheSavedPort covers the exact prompt,
// that the flag's port is the bound one, that a saved port is read back by the next start
// in the same data dir, and that the start binds it without prompting.
func TestPortProc_YesSavesAndTheNextStartBindsTheSavedPort(t *testing.T) {
	port := freePort(t)
	args := portDaemonArgs(t, "", port)
	dataDir := dataDirOf(t, args)
	ptmx, tty := newPTYPair(t)
	cmd, stderr := spawnPortDaemon(t, args, tty)

	tf := waitForTokensFile(t, dataDir)
	assert.Equal(t, port, boundPort(t, tf), "D4: the daemon binds the -port value")
	require.Eventually(t, func() bool {
		return strings.Contains(stderr.String(), "Save port "+port+" for future starts? [y/N] ")
	}, tokensFileWriteBound, 20*time.Millisecond, "stderr: %s", stderr)

	_, err := ptmx.WriteString("y\n")
	require.NoError(t, err)
	require.Eventually(t, func() bool {
		raw, readErr := os.ReadFile(savedPortPath(dataDir))
		return readErr == nil && string(raw) == port+"\n"
	}, tokensFileWriteBound, 20*time.Millisecond, "stderr: %s", stderr)

	terminate(cmd)

	next := portDaemonArgs(t, dataDir, "")
	_, nextStderr := spawnPortDaemon(t, next, nil)
	nextTokens := waitForTokensFile(t, dataDir)
	assert.Equal(t, port, boundPort(t, nextTokens), "D3/D14: no flag binds the saved port")
	assert.NotContains(t, nextStderr.String(), promptTextPrefix, "a saved port is not offered again")
}

// TestPortProc_DeclineSavesNothingAndServingStartsOnlyAfterThePromptIsAnswered: the
// listener is bound while the save prompt waits but nothing serves on it — an ingest POST
// goes unanswered — and a later "n" saves nothing, then startup continues and the same
// POST is answered 200 and the startup line is logged.
func TestPortProc_DeclineSavesNothingAndServingStartsOnlyAfterThePromptIsAnswered(t *testing.T) {
	port := freePort(t)
	args := portDaemonArgs(t, "", port)
	dataDir := dataDirOf(t, args)
	ptmx, tty := newPTYPair(t)
	_, stderr := spawnPortDaemon(t, args, tty)

	tf := waitForTokensFile(t, dataDir)
	require.Eventually(t, func() bool {
		return strings.Contains(stderr.String(), promptTextPrefix+port)
	}, tokensFileWriteBound, 20*time.Millisecond, "stderr: %s", stderr)

	ingestURL := "http://127.0.0.1:" + port + "/ingest/" + tf.IngestToken + "/hook"
	post := func(timeout time.Duration) (*http.Response, error) {
		client := &http.Client{Timeout: timeout}
		return client.Post(ingestURL, "application/json", bytes.NewReader([]byte(`{"session_id":"port-prompt"}`)))
	}
	resp, err := post(500 * time.Millisecond)
	if err == nil {
		_ = resp.Body.Close()
	}
	require.Error(t, err, "REQ-1: nothing serves while the prompt waits; stderr: %s", stderr)
	assert.NotContains(t, stderr.String(), "musterd starting", "REQ-1: the startup line waits for the answer")

	_, err = ptmx.WriteString("n\n")
	require.NoError(t, err)
	require.Eventually(t, func() bool {
		r, postErr := post(time.Second)
		if postErr != nil {
			return false
		}
		_ = r.Body.Close()
		return r.StatusCode == http.StatusOK
	}, tokensFileWriteBound, 50*time.Millisecond, "REQ-2: serving starts once the prompt is answered; stderr: %s", stderr)
	assert.Contains(t, stderr.String(), "musterd starting", "REQ-2: the startup line follows the answer")
	assert.Never(t, func() bool {
		_, statErr := os.Stat(savedPortPath(dataDir))
		return statErr == nil
	}, 400*time.Millisecond, 20*time.Millisecond, "D11: an n saves nothing")
}

// TestPortProc_SavePromptIsAskedBeforeServingAndStaysTheLastLine: the prompt is the last
// thing on stderr while it waits — no startup line, no async warning from the background
// checks (the usage poll against an unreachable URL warns once serving starts) — and a
// "y" saves the port, after which startup continues.
func TestPortProc_SavePromptIsAskedBeforeServingAndStaysTheLastLine(t *testing.T) {
	port := freePort(t)
	args := append(portDaemonArgs(t, "", port), "-usage-poll", "100ms", "-usage-api-url", "http://127.0.0.1:1")
	dataDir := dataDirOf(t, args)
	ptmx, tty := newPTYPair(t)
	_, stderr := spawnPortDaemon(t, args, tty)
	prompt := "Save port " + port + " for future starts? [y/N] "

	waitForTokensFile(t, dataDir)
	require.Eventually(t, func() bool {
		return strings.Contains(stderr.String(), promptTextPrefix+port)
	}, tokensFileWriteBound, 20*time.Millisecond, "stderr: %s", stderr)

	assert.Never(t, func() bool {
		out := stderr.String()
		return !strings.HasSuffix(out, prompt) || strings.Contains(out, "musterd starting")
	}, 1500*time.Millisecond, 20*time.Millisecond, "REQ-1: the prompt stays the last line and no startup line precedes it; stderr: %s", stderr)
	_, statErr := os.Stat(savedPortPath(dataDir))
	assert.True(t, os.IsNotExist(statErr), "nothing is saved before the answer")

	_, err := ptmx.WriteString("y\n")
	require.NoError(t, err)
	require.Eventually(t, func() bool {
		raw, readErr := os.ReadFile(savedPortPath(dataDir))
		return readErr == nil && string(raw) == port+"\n"
	}, tokensFileWriteBound, 20*time.Millisecond, "REQ-2: y saves; stderr: %s", stderr)
	require.Eventually(t, func() bool {
		return strings.Contains(stderr.String(), "musterd starting")
	}, tokensFileWriteBound, 20*time.Millisecond, "REQ-2: startup continues after the answer; stderr: %s", stderr)
	out := stderr.String()
	assert.Less(t, strings.Index(out, prompt), strings.Index(out, "musterd starting"), "REQ-1: the startup line comes after the prompt")
}

// TestPortProc_InterruptAtSavePromptSavesNothingAndExitsZero: a signal while the prompt
// waits saves nothing, ends the prompt line with a newline, and exits 0 without serving.
func TestPortProc_InterruptAtSavePromptSavesNothingAndExitsZero(t *testing.T) {
	for _, sig := range []os.Signal{syscall.SIGINT, syscall.SIGTERM} {
		t.Run(sig.String(), func(t *testing.T) {
			port := freePort(t)
			args := portDaemonArgs(t, "", port)
			dataDir := dataDirOf(t, args)
			_, tty := newPTYPair(t)
			cmd, stderr := spawnPortDaemon(t, args, tty)
			prompt := "Save port " + port + " for future starts? [y/N] "
			waitForTokensFile(t, dataDir)
			require.Eventually(t, func() bool {
				return strings.Contains(stderr.String(), prompt)
			}, tokensFileWriteBound, 20*time.Millisecond, "stderr: %s", stderr)

			require.NoError(t, cmd.Process.Signal(sig))
			code := exitCode(t, cmd)

			assert.Equal(t, 0, code, "REQ-3: a clean exit; stderr: %s", stderr)
			assert.Contains(t, stderr.String(), prompt+"\n", "REQ-3: a newline follows the prompt")
			assert.NotContains(t, stderr.String(), "musterd starting", "REQ-3: nothing was served")
			_, statErr := os.Stat(savedPortPath(dataDir))
			assert.True(t, os.IsNotExist(statErr), "REQ-3: nothing is saved")
		})
	}
}

// TestPortProc_NeverPrompts checks against the real fd 0: each row has
// "y" already waiting on stdin, so a prompt that wrongly appeared would also save.
func TestPortProc_NeverPrompts(t *testing.T) {
	tests := []struct {
		name      string
		port      func(t *testing.T) string
		stdin     string // "pty" or "pipe"
		env       []string
		savedSame bool // the data dir already saves the very port the flag names
	}{
		{name: "D8 stdin is a pipe", port: freePort, stdin: "pipe"},
		{name: "D9 restarted daemon on a terminal", port: freePort, stdin: "pty", env: []string{"MUSTER_RESTARTED=1"}},
		{name: "D7 port zero on a terminal", port: func(*testing.T) string { return "0" }, stdin: "pty"},
		{name: "D5 flag equals the saved port", port: freePort, stdin: "pty", savedSame: true},
	}
	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			port := tc.port(t)
			args := portDaemonArgs(t, "", port)
			dataDir := dataDirOf(t, args)
			want := ""
			if tc.savedSame {
				writeSavedPort(t, dataDir, port+"\n")
				want = port + "\n"
			}

			var stdin *os.File
			switch tc.stdin {
			case "pty":
				ptmx, tty := newPTYPair(t)
				_, err := ptmx.WriteString("y\n")
				require.NoError(t, err)
				stdin = tty
			case "pipe":
				r, w, err := os.Pipe()
				require.NoError(t, err)
				t.Cleanup(func() { _ = r.Close(); _ = w.Close() })
				_, err = w.WriteString("y\n")
				require.NoError(t, err)
				stdin = r
			}
			_, stderr := spawnPortDaemon(t, args, stdin, tc.env...)

			tf := waitForTokensFile(t, dataDir)
			if port != "0" {
				assert.Equal(t, port, boundPort(t, tf))
			}
			assert.Never(t, func() bool {
				return strings.Contains(stderr.String(), promptTextPrefix)
			}, 400*time.Millisecond, 20*time.Millisecond, "no prompt; stderr: %s", stderr)

			raw, err := os.ReadFile(savedPortPath(dataDir))
			if want == "" {
				assert.True(t, os.IsNotExist(err), "nothing is saved")
				return
			}
			require.NoError(t, err)
			assert.Equal(t, want, string(raw), "the saved port is untouched")
		})
	}
}

// TestPortProc_BusyPortExitsNamingThePortAndTheFlag: no fallback
// port, nothing saved, non-zero exit.
func TestPortProc_BusyPortExitsNamingThePortAndTheFlag(t *testing.T) {
	ln, err := net.Listen("tcp", "127.0.0.1:0")
	require.NoError(t, err)
	t.Cleanup(func() { _ = ln.Close() })
	port := strconv.Itoa(ln.Addr().(*net.TCPAddr).Port)
	args := portDaemonArgs(t, "", port)
	dataDir := dataDirOf(t, args)
	cmd, stderr := spawnPortDaemon(t, args, nil)

	code := exitCode(t, cmd)

	assert.NotZero(t, code, "D10: a bind failure exits non-zero")
	assert.Contains(t, stderr.String(), "127.0.0.1:"+port, "D10: the message names the port")
	assert.Contains(t, stderr.String(), "-port N", "REQ-9: and suggests the remedy")
	_, statErr := os.Stat(savedPortPath(dataDir))
	assert.True(t, os.IsNotExist(statErr), "REQ-8: nothing is saved")
}

// TestPortProc_CorruptSavedPort: without -port it is fatal and names the
// remedy; with -port it starts, so the remedy works.
func TestPortProc_CorruptSavedPort(t *testing.T) {
	t.Run("no flag exits naming -port default", func(t *testing.T) {
		args := portDaemonArgs(t, "", "")
		dataDir := dataDirOf(t, args)
		writeSavedPort(t, dataDir, "not-a-port\n")
		cmd, stderr := spawnPortDaemon(t, args, nil)

		code := exitCode(t, cmd)

		assert.NotZero(t, code)
		assert.Contains(t, stderr.String(), "-port default")
		assert.Contains(t, stderr.String(), savedPortPath(dataDir))
	})

	t.Run("a -port flag starts anyway", func(t *testing.T) {
		port := freePort(t)
		args := portDaemonArgs(t, "", port)
		dataDir := dataDirOf(t, args)
		writeSavedPort(t, dataDir, "not-a-port\n")
		_, _ = spawnPortDaemon(t, args, nil)

		tf := waitForTokensFile(t, dataDir)

		assert.Equal(t, port, boundPort(t, tf))
	})
}

// TestPortProc_ShutdownAskPromptAnswerNeverReachesTheSavePrompt: with the save prompt
// answered "y", the line typed at the "-on-exit ask" kill prompt answers that prompt alone —
// "y" kills the session and its shell and the port stays saved. No goroutine is left reading
// fd 0 for the save prompt's answer.
func TestPortProc_ShutdownAskPromptAnswerNeverReachesTheSavePrompt(t *testing.T) {
	port := freePort(t)
	args := append(portDaemonArgs(t, "", port), "-on-exit", "ask")
	dataDir := dataDirOf(t, args)
	ptmx, tty := newPTYPair(t)
	cmd, stderr := spawnPortDaemon(t, args, tty)
	tf := waitForTokensFile(t, dataDir)
	d := &spawnedDaemon{cmd: cmd, dataDir: dataDir, tmuxSocket: flagValue(t, args, "-tmux-socket"), baseURL: "http://127.0.0.1:" + boundPort(t, tf), uiToken: tf.UIToken, stderr: stderr}
	require.Eventually(t, func() bool {
		return strings.Contains(stderr.String(), "Save port "+port+" for future starts? [y/N] ")
	}, tokensFileWriteBound, 20*time.Millisecond, "stderr: %s", stderr)
	_, err := ptmx.WriteString("y\n")
	require.NoError(t, err)
	require.Eventually(t, func() bool {
		raw, readErr := os.ReadFile(savedPortPath(dataDir))
		return readErr == nil && string(raw) == port+"\n"
	}, tokensFileWriteBound, 20*time.Millisecond, "stderr: %s", stderr)

	id := d.launchSession(t, t.TempDir())
	d.waitForLiveTmuxSession(t)
	d.spawnShell(t, id)
	d.waitForTmuxSessionCount(t, 2) // the session and its shell coexist on the socket

	require.NoError(t, cmd.Process.Signal(syscall.SIGINT))
	require.Eventually(t, func() bool {
		return strings.Contains(stderr.String(), "kill them? [y/N] ")
	}, tokensFileWriteBound, 20*time.Millisecond, "stderr: %s", stderr)
	assert.Contains(t, stderr.String(), "1 live sessions and 1 shells on tmux socket "+d.tmuxSocket)
	_, err = ptmx.WriteString("y\n")
	require.NoError(t, err)

	code := exitCode(t, cmd)

	assert.Equal(t, 0, code, "stderr: %s", stderr)
	assert.Empty(t, tmuxSessionNames(d.tmuxSocket), "the answer at the kill prompt kills the session and its shell; stderr: %s", stderr)
	assert.Contains(t, stderr.String(), "ended live sessions on shutdown")
	raw, readErr := os.ReadFile(savedPortPath(dataDir))
	require.NoError(t, readErr)
	assert.Equal(t, port+"\n", string(raw), "the save answered y stays saved")
}
