package termbridge

import (
	"bytes"
	"context"
	"io"
	"os"
	"os/exec"
	"path/filepath"
	"strconv"
	"strings"
	"testing"
	"time"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/Zalaras/muster/internal/tmux"
)

// newTestTmuxClient returns a tmux.Client bound to a private, per-test socket *path* in
// its own scratch directory — never a bare -L name in tmux's shared socket directory
// (D12) and never the user's default server (CLAUDE.md hard rule).
//
// Deliberately not t.TempDir() directly: appending "/tmux.sock" to a t.TempDir() path
// (which is rooted under this test's full name) can overflow AF_UNIX's ~104-byte
// sun_path limit on macOS ("File name too long" from tmux itself) — see
// internal/tmux/tmux_test.go's newTestSocket for the same fix.
func newTestTmuxClient(t *testing.T) *tmux.Client {
	t.Helper()
	dir, err := os.MkdirTemp("", "muster-termbridge-")
	require.NoError(t, err)
	t.Cleanup(func() { _ = os.RemoveAll(dir) })
	socket := filepath.Join(dir, "tmux.sock")
	t.Cleanup(func() { _ = exec.Command("tmux", "-S", socket, "kill-server").Run() })
	return tmux.New(socket)
}

// newTestTmuxClientWithSocket is newTestTmuxClient but also returns the underlying
// socket path, for the handful of tests that need to run their own tmux CLI oracle
// queries (list-clients, #{session_attached}) that tmux.Client itself does not expose —
// termbridge has no production reason to read either (CLAUDE.md hard rule: capture/
// attach are display + oracle only, never a state source).
func newTestTmuxClientWithSocket(t *testing.T) (*tmux.Client, string) {
	t.Helper()
	dir, err := os.MkdirTemp("", "muster-termbridge-")
	require.NoError(t, err)
	t.Cleanup(func() { _ = os.RemoveAll(dir) })
	socket := filepath.Join(dir, "tmux.sock")
	t.Cleanup(func() { _ = exec.Command("tmux", "-S", socket, "kill-server").Run() })
	return tmux.New(socket), socket
}

// sessionNameFromTarget extracts the tmux session name from a window target like
// "muster-7:@3" — #{session_attached} and list-clients both key on the session, not the
// window.
func sessionNameFromTarget(target string) string {
	if i := strings.Index(target, ":"); i >= 0 {
		return target[:i]
	}
	return target
}

// attachedClientCount is a test-oracle-only tmux query reading tmux's own count of
// clients attached to sessionName. Returns 0 for a destroyed/unknown session (measured
// in internal/tmux/tmux_test.go's TestDisplayVar_UnknownTargetReturnsEmptyWithNoError:
// an unresolvable target silently expands display-message's format to empty, not an
// error).
func attachedClientCount(t *testing.T, socket, sessionName string) int {
	t.Helper()
	out, err := exec.Command("tmux", "-S", socket, "display-message", "-p", "-t", sessionName, "#{session_attached}").Output()
	if err != nil {
		return 0
	}
	s := strings.TrimSpace(string(out))
	if s == "" {
		return 0
	}
	n, convErr := strconv.Atoi(s)
	require.NoError(t, convErr)
	return n
}

// listClientSessions is a test-oracle-only query returning the session name each
// currently-attached tmux client (anywhere on this socket) is attached to, one entry per
// client. tmux exits non-zero when nobody is attached at all, which is not a test error.
func listClientSessions(t *testing.T, socket string) []string {
	t.Helper()
	out, err := exec.Command("tmux", "-S", socket, "list-clients", "-F", "#{session_name}").Output()
	if err != nil {
		return nil
	}
	trimmed := strings.TrimSpace(string(out))
	if trimmed == "" {
		return nil
	}
	return strings.Split(trimmed, "\n")
}

var idCounter int64 = 1000

func nextID() int64 {
	idCounter++
	return idCounter
}

func newAttachedSession(t *testing.T, c *tmux.Client, argv []string) string {
	t.Helper()
	target, _, err := c.NewSession(context.Background(), nextID(), t.TempDir(), nil, argv)
	require.NoError(t, err)
	return target
}

// readUntil reads from r until s appears in the accumulated bytes or the deadline
// passes, returning everything read so far. Used instead of a fixed-size single Read
// because PTY output can arrive in multiple small chunks.
func readUntil(t *testing.T, r io.Reader, s string, timeout time.Duration) string {
	t.Helper()
	var buf bytes.Buffer
	deadline := time.Now().Add(timeout)
	chunk := make([]byte, 4096)
	type result struct {
		n   int
		err error
	}
	for time.Now().Before(deadline) {
		done := make(chan result, 1)
		go func() {
			n, err := r.Read(chunk)
			done <- result{n, err}
		}()
		select {
		case res := <-done:
			if res.n > 0 {
				buf.Write(chunk[:res.n])
				if strings.Contains(buf.String(), s) {
					return buf.String()
				}
			}
			if res.err != nil {
				return buf.String()
			}
		case <-time.After(time.Until(deadline)):
			return buf.String()
		}
	}
	return buf.String()
}

// TestAttach_StreamsPTYOutputAndAcceptsInput covers D1/D2: the bridge streams a real
// tmux pane's output to the reader, and bytes written reach the pane's process — here
// proven by a shell's own input-echo (PTY line discipline), the same round trip the
// terminal handler relies on.
func TestAttach_StreamsPTYOutputAndAcceptsInput(t *testing.T) {
	c := newTestTmuxClient(t)
	target := newAttachedSession(t, c, []string{"/bin/sh"})

	b, err := Attach(context.Background(), c, target)
	require.NoError(t, err)
	t.Cleanup(func() { _ = b.Close() })

	_, err = b.Write([]byte("echo MUSTER_BRIDGE_MARKER\n"))
	require.NoError(t, err)

	out := readUntil(t, b, "MUSTER_BRIDGE_MARKER", 5*time.Second)
	assert.Contains(t, out, "MUSTER_BRIDGE_MARKER")
}

// TestAttach_SetsTERMAndLANGOnTheAttachProcess covers REQ-6: the attach PTY's client
// process env carries TERM=xterm-256color/LANG=en_US.UTF-8 explicitly, not whatever the
// daemon process happened to inherit — asserted directly against cmd.Env (white-box,
// same package) rather than indirectly, since these affect the *attaching tmux client*,
// not the shell already running inside the pane.
func TestAttach_SetsTERMAndLANGOnTheAttachProcess(t *testing.T) {
	c := newTestTmuxClient(t)
	target := newAttachedSession(t, c, []string{"/bin/sh"})

	b, err := Attach(context.Background(), c, target)
	require.NoError(t, err)
	t.Cleanup(func() { _ = b.Close() })

	assert.Contains(t, b.cmd.Env, "TERM=xterm-256color")
	assert.Contains(t, b.cmd.Env, "LANG=en_US.UTF-8")
}

// TestBridge_Resize_AppliesPtySetsizeThenTmuxResizeWindow covers D4/D13: Resize's
// tmux-side effect lands exactly at the requested geometry (the same DisplayVar oracle
// tmux_test.go uses for ResizeWindow directly) — proving the two calls compose
// correctly through the bridge, not just that ResizeWindow itself works.
func TestBridge_Resize_AppliesPtySetsizeThenTmuxResizeWindow(t *testing.T) {
	c := newTestTmuxClient(t)
	target := newAttachedSession(t, c, []string{"/bin/sh", "-c", "sleep 60"})

	b, err := Attach(context.Background(), c, target)
	require.NoError(t, err)
	t.Cleanup(func() { _ = b.Close() })

	require.NoError(t, b.Resize(context.Background(), 100, 30))

	width, err := c.DisplayVar(context.Background(), target, "#{window_width}")
	require.NoError(t, err)
	assert.Equal(t, "100", width)
	height, err := c.DisplayVar(context.Background(), target, "#{window_height}")
	require.NoError(t, err)
	assert.Equal(t, "30", height)
}

// TestBridge_Read_MapsEIOToCleanEOFWhenTheTmuxSessionDies covers D5/REQ-6: once the
// attached tmux session is killed, the attach process exits and the next PTY read
// returns EIO — Read must map that to io.EOF, exactly like any other EOF-producing
// reader, so the terminal handler's `errors.Is(err, io.EOF)` branch fires.
func TestBridge_Read_MapsEIOToCleanEOFWhenTheTmuxSessionDies(t *testing.T) {
	c := newTestTmuxClient(t)
	target := newAttachedSession(t, c, []string{"/bin/sh", "-c", "sleep 60"})

	b, err := Attach(context.Background(), c, target)
	require.NoError(t, err)
	t.Cleanup(func() { _ = b.Close() })

	require.NoError(t, c.KillWindow(context.Background(), target))

	buf := make([]byte, 4096)
	deadline := time.Now().Add(5 * time.Second)
	var readErr error
	for time.Now().Before(deadline) {
		_, readErr = b.Read(buf)
		if readErr != nil {
			break
		}
	}
	require.ErrorIs(t, readErr, io.EOF, "a killed tmux session must surface as clean EOF, never a raw EIO/errno")
}

// TestAttach_KillingOneOfTwoSessionsNeverMisroutesTheClientToTheOther covers review.md
// Critical 3 directly at the termbridge layer. The test right above this one
// (TestBridge_Read_MapsEIOToCleanEOFWhenTheTmuxSessionDies) only ever puts one tmux
// session on the socket, which makes this defect structurally invisible: with nothing
// else to hop to, a dying client just exits and the test passes whether or not
// detach-on-destroy is set correctly. With a second, untouched session on the same
// socket, killing the attached one must still clean-EOF this bridge exactly as before,
// AND must never leave a client attached to the other session — the review's measured
// failure was a client migrating onto a survivor session and misdelivering keystrokes to
// it.
func TestAttach_KillingOneOfTwoSessionsNeverMisroutesTheClientToTheOther(t *testing.T) {
	c, socket := newTestTmuxClientWithSocket(t)
	dying := newAttachedSession(t, c, []string{"/bin/sh", "-c", "sleep 60"})
	survivor := newAttachedSession(t, c, []string{"/bin/sh", "-c", "sleep 60"})
	survivorSession := sessionNameFromTarget(survivor)

	b, err := Attach(context.Background(), c, dying)
	require.NoError(t, err)
	t.Cleanup(func() { _ = b.Close() })

	require.Eventually(t, func() bool {
		return attachedClientCount(t, socket, sessionNameFromTarget(dying)) == 1
	}, 3*time.Second, 20*time.Millisecond, "the attach client must register before this test can prove anything about its teardown")
	require.Equal(t, 0, attachedClientCount(t, socket, survivorSession), "the survivor must start with no attached client")

	require.NoError(t, c.KillWindow(context.Background(), dying))

	buf := make([]byte, 4096)
	deadline := time.Now().Add(5 * time.Second)
	var readErr error
	for time.Now().Before(deadline) {
		_, readErr = b.Read(buf)
		if readErr != nil {
			break
		}
	}
	require.ErrorIs(t, readErr, io.EOF, ">=2 sessions on the socket must not change this bridge's own clean-EOF behaviour")

	assert.Equal(t, 0, attachedClientCount(t, socket, survivorSession), "detach-on-destroy=on: the dying session's client must exit, never hop onto the survivor (review.md Critical 3)")
	clients := listClientSessions(t, socket)
	assert.NotContains(t, clients, survivorSession, "list-clients must show no client on the OTHER Muster session")
	assert.Empty(t, clients, "no client should remain on the socket at all once the only attached client's session was destroyed")
}

// TestBridge_Close_IsIdempotent covers Close's own doc comment: both the takeover path
// and the handler's deferred cleanup may call Close on the same Bridge.
func TestBridge_Close_IsIdempotent(t *testing.T) {
	c := newTestTmuxClient(t)
	target := newAttachedSession(t, c, []string{"/bin/sh", "-c", "sleep 60"})

	b, err := Attach(context.Background(), c, target)
	require.NoError(t, err)

	err1 := b.Close()
	err2 := b.Close()

	assert.NoError(t, err1)
	assert.Equal(t, err1, err2, "a second Close must return the same result as the first, never panic or re-run teardown")
}

// TestAttach_ErrorsForAnUnattachableTarget covers the termbridge half of a failed
// attach (the terminal handler's 500 path when spawning fails) — attaching to a target
// with no tmux server behind the socket at all must return an error, not hang.
func TestAttach_ErrorsForAnUnattachableTarget(t *testing.T) {
	c := newTestTmuxClient(t) // never creates a session: no server on this socket

	// tmux attach-session against a socket with no server still succeeds in spawning
	// the "tmux" client process (pty.StartWithSize only fails if the fork/exec itself
	// fails); the failure shows up as the attach process exiting almost immediately.
	// Attach itself only reports an error for the fork/exec step, so this test asserts
	// the process-exit behavior via Read returning EOF quickly instead.
	b, err := Attach(context.Background(), c, "muster-999999:@1")
	require.NoError(t, err)
	t.Cleanup(func() { _ = b.Close() })

	buf := make([]byte, 4096)
	deadline := time.Now().Add(5 * time.Second)
	var readErr error
	for time.Now().Before(deadline) {
		_, readErr = b.Read(buf)
		if readErr != nil {
			break
		}
	}
	require.Error(t, readErr, "attaching to a nonexistent tmux target must end in EOF/error, never hang forever")
}
