package server

import (
	"context"
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

	"github.com/coder/websocket"
	"github.com/rs/zerolog"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/Zalaras/muster/internal/session"
	"github.com/Zalaras/muster/internal/store"
)

// newTerminalTestServer builds a Server wired to a real, per-test tmux socket — never
// "-L muster" and never the user's default server (CLAUDE.md hard rule). The terminal
// bridge has no seam between internal/server and internal/termbridge/internal/tmux by
// design (daemon-implementation.md Decisions: "kept concrete per YAGNI"), so its own
// acceptance tests (D1-D7) exercise a real tmux server — the hard rule only forbids
// deriving *state* from captured/attached bytes, not exercising tmux for real in tests.
//
// Deliberately not t.TempDir() for the socket itself: appending "/tmux.sock" to a
// t.TempDir() path (rooted under the test's full name) can overflow AF_UNIX's
// ~104-byte sun_path limit on macOS ("File name too long" from tmux itself) — see
// internal/tmux/tmux_test.go's newTestSocket for the same fix.
func newTerminalTestServer(t *testing.T) *testServer {
	t.Helper()
	dbPath := filepath.Join(t.TempDir(), "muster.db")
	st, err := store.Open(context.Background(), dbPath)
	require.NoError(t, err)
	t.Cleanup(func() { _ = st.Close() })

	scratch, err := os.MkdirTemp("", "muster-terminal-test-")
	require.NoError(t, err)
	t.Cleanup(func() { _ = os.RemoveAll(scratch) })
	socket := filepath.Join(scratch, "tmux.sock")
	t.Cleanup(func() { _ = exec.Command("tmux", "-S", socket, "kill-server").Run() })

	logBuf := &syncBuffer{}
	srv := New(Config{
		Store: st, Logger: zerolog.New(logBuf), UIToken: testUIToken, IngestToken: testIngestToken,
		WebDist: t.TempDir(), DaemonVersion: "test-version", TmuxSocket: socket,
	})
	return &testServer{Server: srv, dbPath: dbPath, logs: logBuf, store: st, tmuxSocket: socket}
}

// launchRealSession creates a real Muster session row and a real backing tmux session
// running argv (never the real `claude` binary — CLAUDE.md hard rule — a plain shell
// stands in), bypassing the HTTP launch path entirely so no `claude` process is ever
// spawned from a unit test.
func launchRealSession(t *testing.T, srv *testServer, argv []string) *session.Session {
	t.Helper()
	dir := t.TempDir()
	repo, _, err := srv.store.UpsertRepo(context.Background(), store.UpsertRepoParams{
		Path: dir, Name: filepath.Base(dir), Model: "sonnet", PermissionMode: "default",
	})
	require.NoError(t, err)
	sess, err := srv.manager.CreateSession(context.Background(), session.CreateParams{
		RepoID: repo.ID, Directory: dir, PermissionMode: session.PermissionDefault,
		Model: "sonnet", FirstLaunchHere: true,
	})
	require.NoError(t, err)
	target, pane, err := srv.tmuxClient.NewSession(context.Background(), sess.ID, dir, nil, argv)
	require.NoError(t, err)
	t.Cleanup(func() { _ = srv.tmuxClient.KillWindow(context.Background(), target) })
	final, err := srv.manager.RecordLaunch(context.Background(), sess.ID, target, pane)
	require.NoError(t, err)
	return final
}

func shellCommand() []string {
	return []string{"/bin/sh"}
}

func sleepForeverCommand() []string {
	return []string{"/bin/sh", "-c", "sleep 300"}
}

// dialTerminal opens a real WS connection to /ws/terminal/{id}, sending the UI cookie.
// Used directly only by tests that need to inspect a *failed* handshake's response
// (status code) — see dialTerminalOK for the success-path case.
func dialTerminal(t *testing.T, httpSrv *httptest.Server, id int64) (*websocket.Conn, *http.Response, error) {
	t.Helper()
	wsURL := "ws" + httpSrv.URL[len("http"):] + "/ws/terminal/" + strconv.FormatInt(id, 10)
	header := http.Header{"Cookie": {cookieName + "=" + testUIToken}}
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	return websocket.Dial(ctx, wsURL, &websocket.DialOptions{HTTPHeader: header}) //nolint:bodyclose
}

// dialTerminalOK is dialTerminal for the success path: it intentionally discards the
// handshake *http.Response, mirroring ws_test.go's dialWS ("coder/websocket's Dial nils
// out resp.Body on success — you never need to close resp.Body yourself, dial.go") —
// there is nothing for a success-path test to close.
func dialTerminalOK(t *testing.T, httpSrv *httptest.Server, id int64) *websocket.Conn {
	t.Helper()
	c, _, err := dialTerminal(t, httpSrv, id) //nolint:bodyclose
	require.NoError(t, err)
	return c
}

// readUntilError drains frames from c (there may be real PTY output queued ahead of a
// server-initiated close, e.g. a shell prompt or tmux's own final repaint) on one
// shared deadline until Read itself returns an error — the close, once it arrives, or
// (if the close never comes) the deadline's own context.DeadlineExceeded, which the
// caller's CloseStatus assertion will then fail on distinctly.
func readUntilError(t *testing.T, c *websocket.Conn, timeout time.Duration) error {
	t.Helper()
	ctx, cancel := context.WithTimeout(context.Background(), timeout)
	defer cancel()
	for {
		if _, _, err := c.Read(ctx); err != nil {
			return err
		}
	}
}

// readUntilContains reads binary frames from c until the accumulated bytes contain want
// or the deadline passes, returning everything read so far.
func readUntilContains(t *testing.T, c *websocket.Conn, want string, timeout time.Duration) string {
	t.Helper()
	var acc []byte
	deadline := time.Now().Add(timeout)
	for time.Now().Before(deadline) {
		ctx, cancel := context.WithTimeout(context.Background(), 500*time.Millisecond)
		_, data, err := c.Read(ctx)
		cancel()
		if err == nil {
			acc = append(acc, data...)
			if strings.Contains(string(acc), want) {
				return string(acc)
			}
		}
	}
	return string(acc)
}

// tmuxSessionName extracts the tmux session name from a window target like
// "muster-7:@3" — #{session_attached} and list-clients both key on the session, not the
// window.
func tmuxSessionName(target string) string {
	if i := strings.Index(target, ":"); i >= 0 {
		return target[:i]
	}
	return target
}

// sessionAttachedCount is a test-oracle-only tmux query (CLAUDE.md hard rule:
// capture/attach are display + oracle in tests, never a state source in production —
// nothing in internal/server reads #{session_attached}) reading tmux's own count of
// attached clients for sessionName directly. Returns 0 for a destroyed/unknown session:
// tmux_test.go's TestDisplayVar_UnknownTargetReturnsEmptyWithNoError measured that an
// unresolvable target silently expands display-message's format to empty output (exit
// 0), it does not error.
func sessionAttachedCount(t *testing.T, socket, sessionName string) int {
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

// tmuxListClientSessions is a test-oracle-only query returning the session name each
// currently-attached tmux client (anywhere on this socket) is attached to, one entry per
// client. tmux exits non-zero when nobody is attached at all, which is not a test error.
func tmuxListClientSessions(t *testing.T, socket string) []string {
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

// TestHandleTerminal_UnknownSessionIs404 covers the Protocol Contract's pre-upgrade
// 404 not_found.
func TestHandleTerminal_UnknownSessionIs404(t *testing.T) {
	srv := newTerminalTestServer(t)
	httpSrv := httptest.NewServer(srv.Handler())
	t.Cleanup(httpSrv.Close)

	_, resp, err := dialTerminal(t, httpSrv, 999)

	require.Error(t, err)
	require.NotNil(t, resp)
	defer func() { _ = resp.Body.Close() }()
	assert.Equal(t, http.StatusNotFound, resp.StatusCode)
}

// TestHandleTerminal_NonNumericIDIs404 covers the id-parse failure branch alongside the
// unknown-id branch (both map to the same 404 not_found per the Protocol Contract).
func TestHandleTerminal_NonNumericIDIs404(t *testing.T) {
	srv := newTerminalTestServer(t)
	httpSrv := httptest.NewServer(srv.Handler())
	t.Cleanup(httpSrv.Close)

	wsURL := "ws" + httpSrv.URL[len("http"):] + "/ws/terminal/not-a-number"
	header := http.Header{"Cookie": {cookieName + "=" + testUIToken}}
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	_, resp, err := websocket.Dial(ctx, wsURL, &websocket.DialOptions{HTTPHeader: header}) //nolint:bodyclose
	require.Error(t, err)
	require.NotNil(t, resp)
	defer func() { _ = resp.Body.Close() }()
	assert.Equal(t, http.StatusNotFound, resp.StatusCode)
}

// TestHandleTerminal_DeadSessionIs409 covers D7: a session whose Alive flag is false
// (here flipped for real via the liveness poll after killing its tmux session, never
// hand-set) is rejected pre-upgrade with 409 not_attachable — no attach attempt at all.
func TestHandleTerminal_DeadSessionIs409(t *testing.T) {
	srv := newTerminalTestServer(t)
	sess := launchRealSession(t, srv, sleepForeverCommand())
	require.NoError(t, srv.tmuxClient.KillWindow(context.Background(), sess.TmuxTarget))
	srv.manager.Nudge(context.Background(), sess.ID)
	require.Eventually(t, func() bool {
		got, ok := srv.manager.Get(sess.ID)
		return ok && !got.Alive
	}, 3*time.Second, 20*time.Millisecond)

	httpSrv := httptest.NewServer(srv.Handler())
	t.Cleanup(httpSrv.Close)

	_, resp, err := dialTerminal(t, httpSrv, sess.ID)

	require.Error(t, err)
	require.NotNil(t, resp)
	defer func() { _ = resp.Body.Close() }()
	assert.Equal(t, http.StatusConflict, resp.StatusCode)
}

// TestHandleTerminal_RequiresCookie covers the same auth wiring every other UI route
// gets (requireCookie), specifically for the new route.
func TestHandleTerminal_RequiresCookie(t *testing.T) {
	srv := newTerminalTestServer(t)
	sess := launchRealSession(t, srv, sleepForeverCommand())
	httpSrv := httptest.NewServer(srv.Handler())
	t.Cleanup(httpSrv.Close)

	wsURL := "ws" + httpSrv.URL[len("http"):] + "/ws/terminal/" + strconv.FormatInt(sess.ID, 10)
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	_, resp, err := websocket.Dial(ctx, wsURL, nil) // no cookie
	require.Error(t, err)
	require.NotNil(t, resp)
	defer func() { _ = resp.Body.Close() }()
	assert.Equal(t, http.StatusUnauthorized, resp.StatusCode)
}

// TestHandleTerminal_StreamsPTYOutputAndAcceptsInput covers D1/D2 at the full
// HTTP-handler level (auth → attach → pump), complementing termbridge's own
// package-level test of the same round trip.
func TestHandleTerminal_StreamsPTYOutputAndAcceptsInput(t *testing.T) {
	srv := newTerminalTestServer(t)
	sess := launchRealSession(t, srv, shellCommand())
	httpSrv := httptest.NewServer(srv.Handler())
	t.Cleanup(httpSrv.Close)

	c := dialTerminalOK(t, httpSrv, sess.ID)
	defer func() { _ = c.CloseNow() }()

	require.NoError(t, c.Write(context.Background(), websocket.MessageBinary, []byte("echo MUSTER_WS_MARKER\n")))

	out := readUntilContains(t, c, "MUSTER_WS_MARKER", 5*time.Second)
	assert.Contains(t, out, "MUSTER_WS_MARKER")
}

// TestHandleTerminal_ResizeFrameAppliesRealGeometry covers D4/REQ-3 end to end through
// the actual WS JSON frame shape (clamping is covered in isolation by
// TestClampInt_Table; this proves the parsed values reach tmux via DisplayVar).
func TestHandleTerminal_ResizeFrameAppliesRealGeometry(t *testing.T) {
	srv := newTerminalTestServer(t)
	sess := launchRealSession(t, srv, sleepForeverCommand())
	httpSrv := httptest.NewServer(srv.Handler())
	t.Cleanup(httpSrv.Close)

	c := dialTerminalOK(t, httpSrv, sess.ID)
	defer func() { _ = c.CloseNow() }()

	require.NoError(t, c.Write(context.Background(), websocket.MessageText, []byte(`{"type":"resize","cols":150,"rows":45}`)))

	require.Eventually(t, func() bool {
		w, dErr := srv.tmuxClient.DisplayVar(context.Background(), sess.TmuxTarget, "#{window_width}")
		return dErr == nil && w == "150"
	}, 3*time.Second, 50*time.Millisecond)
	h, hErr := srv.tmuxClient.DisplayVar(context.Background(), sess.TmuxTarget, "#{window_height}")
	require.NoError(t, hErr)
	assert.Equal(t, "45", h)
}

// TestHandleTerminal_ResizeFrameIsClampedToTheProtocolBounds covers REQ-3's clamp
// clause via the real wire shape: an out-of-range request lands at the clamp boundary,
// not the raw requested (or rejected) value.
func TestHandleTerminal_ResizeFrameIsClampedToTheProtocolBounds(t *testing.T) {
	srv := newTerminalTestServer(t)
	sess := launchRealSession(t, srv, sleepForeverCommand())
	httpSrv := httptest.NewServer(srv.Handler())
	t.Cleanup(httpSrv.Close)

	c := dialTerminalOK(t, httpSrv, sess.ID)
	defer func() { _ = c.CloseNow() }()

	require.NoError(t, c.Write(context.Background(), websocket.MessageText, []byte(`{"type":"resize","cols":99999,"rows":1}`)))

	require.Eventually(t, func() bool {
		w, dErr := srv.tmuxClient.DisplayVar(context.Background(), sess.TmuxTarget, "#{window_width}")
		return dErr == nil && w == "500"
	}, 3*time.Second, 50*time.Millisecond)
	h, hErr := srv.tmuxClient.DisplayVar(context.Background(), sess.TmuxTarget, "#{window_height}")
	require.NoError(t, hErr)
	assert.Equal(t, "5", h)
}

// TestHandleTerminal_UnparseableResizeFrameIsIgnoredNotFatal covers Edge Case 9: a
// garbage text frame must never kill the socket — proven by the same connection still
// streaming normal data afterward.
func TestHandleTerminal_UnparseableResizeFrameIsIgnoredNotFatal(t *testing.T) {
	srv := newTerminalTestServer(t)
	sess := launchRealSession(t, srv, shellCommand())
	httpSrv := httptest.NewServer(srv.Handler())
	t.Cleanup(httpSrv.Close)

	c := dialTerminalOK(t, httpSrv, sess.ID)
	defer func() { _ = c.CloseNow() }()

	require.NoError(t, c.Write(context.Background(), websocket.MessageText, []byte(`not even json`)))
	require.NoError(t, c.Write(context.Background(), websocket.MessageText, []byte(`{"type":"something-else"}`)))

	require.NoError(t, c.Write(context.Background(), websocket.MessageBinary, []byte("echo STILL_ALIVE_MARKER\n")))
	out := readUntilContains(t, c, "STILL_ALIVE_MARKER", 5*time.Second)
	assert.Contains(t, out, "STILL_ALIVE_MARKER", "a bad text frame must never kill the socket")
}

// TestHandleTerminal_SecondSocketSupersedesTheFirst covers D3/INV-1 from the plainest
// reachable state: no prior activity on the first socket before the second connects.
func TestHandleTerminal_SecondSocketSupersedesTheFirst(t *testing.T) {
	srv := newTerminalTestServer(t)
	sess := launchRealSession(t, srv, sleepForeverCommand())
	httpSrv := httptest.NewServer(srv.Handler())
	t.Cleanup(httpSrv.Close)

	c1 := dialTerminalOK(t, httpSrv, sess.ID)
	defer func() { _ = c1.CloseNow() }()

	c2 := dialTerminalOK(t, httpSrv, sess.ID)
	defer func() { _ = c2.CloseNow() }()

	ctx, cancel := context.WithTimeout(context.Background(), 3*time.Second)
	defer cancel()
	_, _, readErr := c1.Read(ctx)
	require.Error(t, readErr)
	assert.Equal(t, websocket.StatusCode(4000), websocket.CloseStatus(readErr))
}

// TestHandleTerminal_SupersedesMidTyping covers INV-1's "mid-typing" reachable state
// (m1-sessions lesson: assert invariants from every source state, not just the
// convenient idle one) — the first socket is actively exchanging data when the second
// connects, and must still be superseded correctly, without corrupting the new
// connection's own stream.
func TestHandleTerminal_SupersedesMidTyping(t *testing.T) {
	srv := newTerminalTestServer(t)
	sess := launchRealSession(t, srv, shellCommand())
	httpSrv := httptest.NewServer(srv.Handler())
	t.Cleanup(httpSrv.Close)

	c1 := dialTerminalOK(t, httpSrv, sess.ID)
	defer func() { _ = c1.CloseNow() }()
	require.NoError(t, c1.Write(context.Background(), websocket.MessageBinary, []byte("echo FIRST_MARKER\n")))
	_ = readUntilContains(t, c1, "FIRST_MARKER", 3*time.Second)

	c2 := dialTerminalOK(t, httpSrv, sess.ID)
	defer func() { _ = c2.CloseNow() }()

	ctx, cancel := context.WithTimeout(context.Background(), 3*time.Second)
	defer cancel()
	_, _, readErr := c1.Read(ctx)
	require.Error(t, readErr)
	assert.Equal(t, websocket.StatusCode(4000), websocket.CloseStatus(readErr))

	require.NoError(t, c2.Write(context.Background(), websocket.MessageBinary, []byte("echo SECOND_MARKER\n")))
	out := readUntilContains(t, c2, "SECOND_MARKER", 5*time.Second)
	assert.Contains(t, out, "SECOND_MARKER", "the superseding connection must attach and stream cleanly")
}

// TestHandleTerminal_SupersedesOnRefocus covers INV-1's "same-page refocus" reachable
// state: the first connection closes itself cleanly (as a real client would on
// navigating away) before the second opens — the registry must not still think the old
// connection is live and refuse/misroute the new one.
func TestHandleTerminal_SupersedesOnRefocus(t *testing.T) {
	srv := newTerminalTestServer(t)
	sess := launchRealSession(t, srv, shellCommand())
	httpSrv := httptest.NewServer(srv.Handler())
	t.Cleanup(httpSrv.Close)

	c1 := dialTerminalOK(t, httpSrv, sess.ID)
	require.NoError(t, c1.Close(websocket.StatusNormalClosure, "navigating away"))

	c2 := dialTerminalOK(t, httpSrv, sess.ID)
	defer func() { _ = c2.CloseNow() }()

	require.NoError(t, c2.Write(context.Background(), websocket.MessageBinary, []byte("echo REFOCUS_MARKER\n")))
	out := readUntilContains(t, c2, "REFOCUS_MARKER", 5*time.Second)
	assert.Contains(t, out, "REFOCUS_MARKER")
}

// TestHandleTerminal_KillingTheTmuxSessionCloses4001AndNudgesLiveness covers D5/D6: PTY
// EOF (the tmux session/pane is gone) closes the socket with 4001 pane_ended, and the
// liveness poll flips alive:false promptly (via Nudge, not the ~5s ticker).
//
// As written this reproduces an implementation bug, not a test bug (daemon-tests.md has
// the full writeup): handleTerminal's two pumps share one context.WithCancel(r.Context())
// (terminal.go). pumpPTYToSocket's EOF branch calls c.Close(closePaneEnded, ...) then
// s.manager.Nudge(ctx, sessionID) using that same ctx — but closing c immediately
// unblocks pumpSocketToPTY's blocked c.Read(ctx) in the sibling goroutine, which returns
// and calls the shared cancel() right after, racing Nudge's still-in-flight tmux command
// on the same context. srv.logs below shows the resulting "liveness check failed:
// context canceled", and Alive is left true instead of flipping to false. Reproduced 5/5
// runs (not flaky) via `go test -run TestHandleTerminal_KillingTheTmuxSessionCloses4001AndNudgesLiveness -count=5`.
func TestHandleTerminal_KillingTheTmuxSessionCloses4001AndNudgesLiveness(t *testing.T) {
	srv := newTerminalTestServer(t)
	sess := launchRealSession(t, srv, sleepForeverCommand())
	httpSrv := httptest.NewServer(srv.Handler())
	t.Cleanup(httpSrv.Close)
	t.Cleanup(func() {
		if t.Failed() {
			t.Log("daemon log output:", srv.logs.String())
		}
	})

	c := dialTerminalOK(t, httpSrv, sess.ID)
	defer func() { _ = c.CloseNow() }()

	require.NoError(t, srv.tmuxClient.KillWindow(context.Background(), sess.TmuxTarget))

	readErr := readUntilError(t, c, 5*time.Second)
	require.Error(t, readErr)
	assert.Equal(t, websocket.StatusCode(4001), websocket.CloseStatus(readErr))

	require.Eventually(t, func() bool {
		got, ok := srv.manager.Get(sess.ID)
		return ok && !got.Alive
	}, 3*time.Second, 20*time.Millisecond, "D6: alive:false must follow promptly, not wait out the ~5s poll interval")
}

// TestHandleTerminal_KillingOneSessionAmongMultipleNeverMisroutesToAnother covers
// review.md Critical 3, and is the reason the review flagged this file at all: every
// other death test above (D5/D6) creates exactly one tmux session on the socket, so a
// dying attach client has nowhere to hop — it exits and the test passes whether or not
// detach-on-destroy is set correctly. With >=2 sessions on the same socket (three here:
// the one being killed while attached, a survivor that stays attached throughout, and a
// bystander nobody ever attaches to), review.md's measured failure mode was that killing
// the attached session sent its client to a DIFFERENT Muster session instead of exiting
// — no PTY EOF/4001 for the dead session, a second client landing on the survivor
// (list-clients showed two clients on one session), and keystrokes meant for the dead
// session's pane reaching the survivor's claude instead. detach-on-destroy=on (the REQ-4
// amendment, tmux.go's serverOptions) is supposed to make the client exit cleanly
// instead of hopping; this proves it, at the daemon's own HTTP/WS surface.
func TestHandleTerminal_KillingOneSessionAmongMultipleNeverMisroutesToAnother(t *testing.T) {
	srv := newTerminalTestServer(t)
	dying := launchRealSession(t, srv, sleepForeverCommand())
	survivor := launchRealSession(t, srv, sleepForeverCommand())
	bystander := launchRealSession(t, srv, sleepForeverCommand()) // never gets a terminal socket at all
	httpSrv := httptest.NewServer(srv.Handler())
	t.Cleanup(httpSrv.Close)

	dyingSession := tmuxSessionName(dying.TmuxTarget)
	survivorSession := tmuxSessionName(survivor.TmuxTarget)
	bystanderSession := tmuxSessionName(bystander.TmuxTarget)

	cDying := dialTerminalOK(t, httpSrv, dying.ID)
	defer func() { _ = cDying.CloseNow() }()
	cSurvivor := dialTerminalOK(t, httpSrv, survivor.ID)
	defer func() { _ = cSurvivor.CloseNow() }()

	// Both attach clients must actually register with tmux before killing anything —
	// dialTerminalOK only waits for the WS upgrade, not for tmux's own bookkeeping.
	require.Eventually(t, func() bool {
		return sessionAttachedCount(t, srv.tmuxSocket, dyingSession) == 1
	}, 3*time.Second, 20*time.Millisecond)
	require.Eventually(t, func() bool {
		return sessionAttachedCount(t, srv.tmuxSocket, survivorSession) == 1
	}, 3*time.Second, 20*time.Millisecond)
	require.Equal(t, 0, sessionAttachedCount(t, srv.tmuxSocket, bystanderSession), "the bystander must start with no attached client")

	require.NoError(t, srv.tmuxClient.KillWindow(context.Background(), dying.TmuxTarget))

	readErr := readUntilError(t, cDying, 5*time.Second)
	require.Error(t, readErr)
	assert.Equal(t, websocket.StatusCode(4001), websocket.CloseStatus(readErr), "the killed session's own socket must still 4001")

	// The Critical 3 assertions: the survivor must never end up with a second (migrated)
	// client, and a session nobody ever attached to must never gain one either.
	require.Eventually(t, func() bool {
		return sessionAttachedCount(t, srv.tmuxSocket, survivorSession) == 1
	}, 2*time.Second, 20*time.Millisecond, "the survivor must keep exactly its own one client throughout")
	assert.Equal(t, 0, sessionAttachedCount(t, srv.tmuxSocket, bystanderSession), "a session nobody attached to must never gain a client")

	clients := tmuxListClientSessions(t, srv.tmuxSocket)
	assert.NotContains(t, clients, dyingSession, "the destroyed session no longer exists to have a client")
	assert.NotContains(t, clients, bystanderSession, "list-clients must show no client on any OTHER Muster session")
	assert.Equal(t, []string{survivorSession}, clients, "exactly the survivor's own single client should remain on the socket")

	// The survivor's own socket must still be perfectly healthy — proves the fix isn't
	// just "the dead session's client vanishes" but specifically "it never touched
	// anyone else's pane."
	require.NoError(t, cSurvivor.Write(context.Background(), websocket.MessageBinary, []byte("echo SURVIVOR_STILL_FINE\n")))
	out := readUntilContains(t, cSurvivor, "SURVIVOR_STILL_FINE", 5*time.Second)
	assert.Contains(t, out, "SURVIVOR_STILL_FINE")
}

// TestHandleTerminal_TakeoverNeverLeavesTwoClientsAttachedAtOnce covers review.md Major
// 1: takeover must evict the old connection (closing its PTY/attach client) *before* the
// new attach starts, never after, so the target tmux session never shows two attached
// clients even momentarily. A background poller samples #{session_attached} at high
// frequency across the whole takeover — a regression to "attach before evict" would
// create a real (if brief) window with two attach processes on the session, which
// polling every 2ms has a good chance of catching, unlike asserting only the eventual
// settled state.
func TestHandleTerminal_TakeoverNeverLeavesTwoClientsAttachedAtOnce(t *testing.T) {
	srv := newTerminalTestServer(t)
	sess := launchRealSession(t, srv, shellCommand())
	httpSrv := httptest.NewServer(srv.Handler())
	t.Cleanup(httpSrv.Close)
	sessionName := tmuxSessionName(sess.TmuxTarget)

	c1 := dialTerminalOK(t, httpSrv, sess.ID)
	defer func() { _ = c1.CloseNow() }()
	require.Eventually(t, func() bool {
		return sessionAttachedCount(t, srv.tmuxSocket, sessionName) == 1
	}, 3*time.Second, 20*time.Millisecond)

	stopPolling := make(chan struct{})
	maxSeen := 0
	var pollWG sync.WaitGroup
	pollWG.Add(1)
	go func() {
		defer pollWG.Done()
		for {
			select {
			case <-stopPolling:
				return
			default:
				if n := sessionAttachedCount(t, srv.tmuxSocket, sessionName); n > maxSeen {
					maxSeen = n
				}
				time.Sleep(2 * time.Millisecond)
			}
		}
	}()

	c2 := dialTerminalOK(t, httpSrv, sess.ID)
	defer func() { _ = c2.CloseNow() }()
	require.NoError(t, c2.Write(context.Background(), websocket.MessageBinary, []byte("echo TAKEOVER_ORDER_MARKER\n")))
	out := readUntilContains(t, c2, "TAKEOVER_ORDER_MARKER", 5*time.Second)
	require.Contains(t, out, "TAKEOVER_ORDER_MARKER")

	close(stopPolling)
	pollWG.Wait()

	assert.LessOrEqual(t, maxSeen, 1, "eviction must complete before the new attach starts (Major 1): the session must never show two attached clients during a takeover")
}

// TestHandleTerminal_ClientInitiatedCloseTearsDownThePTYPromptly is the permanent
// regression test for review.md Critical 4, covering daemon-impl's Fix Attempt 2
// exactly: it measured, via a throwaway _test.go deleted afterward, ~450ms teardown
// latency pre-fix (bounded only by coder/websocket's own client-side close-handshake
// timeout, an external bound with no guarantee for a real/slower/unresponsive browser)
// versus ~35ms post-fix (the daemon's own explicit bridge.Close(), not dependent on the
// client's handshake at all) for a graceful client-initiated close against a silent pane
// (sleepForeverCommand: emits nothing after tmux's initial repaint, exactly the idle
// Needs-Input condition the review measured). 300ms sits comfortably above the measured
// post-fix latency and comfortably below the measured pre-fix latency, so a regression
// back to "wait for <-ptyDone before closing the bridge" fails this deterministically
// rather than by chance.
func TestHandleTerminal_ClientInitiatedCloseTearsDownThePTYPromptly(t *testing.T) {
	srv := newTerminalTestServer(t)
	sess := launchRealSession(t, srv, sleepForeverCommand())
	httpSrv := httptest.NewServer(srv.Handler())
	t.Cleanup(httpSrv.Close)
	sessionName := tmuxSessionName(sess.TmuxTarget)

	c := dialTerminalOK(t, httpSrv, sess.ID)
	require.Eventually(t, func() bool {
		return sessionAttachedCount(t, srv.tmuxSocket, sessionName) == 1
	}, 3*time.Second, 20*time.Millisecond, "the attach client must register before this test can prove anything about its teardown")

	require.NoError(t, c.Close(websocket.StatusNormalClosure, "navigating away"))

	assert.Eventually(t, func() bool {
		return sessionAttachedCount(t, srv.tmuxSocket, sessionName) == 0
	}, 300*time.Millisecond, 10*time.Millisecond, "Critical 4: a client-initiated close on a silent pane must tear down the attach client promptly (measured ~35ms post-fix), not wait ~450ms+ for the client's own close-handshake timeout or hang indefinitely for a real pane that never emits output")
}

// TestHandleTerminal_ShutdownClosesOpenTerminalSocketsNormally covers Server.Shutdown's
// terminals.closeAll() half (the WS-hub half is already covered by
// TestServerShutdown_ClosesOpenWSConnections in ws_test.go).
func TestHandleTerminal_ShutdownClosesOpenTerminalSocketsNormally(t *testing.T) {
	srv := newTerminalTestServer(t)
	sess := launchRealSession(t, srv, shellCommand())
	httpSrv := httptest.NewServer(srv.Handler())
	t.Cleanup(httpSrv.Close)

	c := dialTerminalOK(t, httpSrv, sess.ID)
	defer func() { _ = c.CloseNow() }()

	// The client sees the WS upgrade (101) as soon as websocket.Accept returns, which
	// is before the handler has attached the PTY and registered the connection in
	// s.terminals (docs/protocol.md §6's handler order: accept, then attach, then
	// register) — so Shutdown could otherwise race ahead of registration and find
	// nothing to close. A real round trip through the pane proves attach+registration
	// have actually completed before Shutdown is asked to tear it down.
	require.NoError(t, c.Write(context.Background(), websocket.MessageBinary, []byte("echo MUSTER_READY_MARKER\n")))
	ready := readUntilContains(t, c, "MUSTER_READY_MARKER", 5*time.Second)
	require.Contains(t, ready, "MUSTER_READY_MARKER", "the bridge must be attached and registered before Shutdown is exercised")

	readErr := make(chan error, 1)
	go func() {
		readErr <- readUntilError(t, c, 5*time.Second)
	}()

	srv.Shutdown(context.Background())

	select {
	case err := <-readErr:
		assert.Error(t, err, "client read must fail once Shutdown closes the terminal socket")
	case <-time.After(5 * time.Second):
		t.Fatal("terminal socket was not closed by Shutdown")
	}
}

// TestClampInt_Table exhaustively covers REQ-3's clamp function in isolation (the pure
// logic underneath applyResizeFrame), including both boundaries and both directions.
func TestClampInt_Table(t *testing.T) {
	tests := []struct {
		name      string
		v, lo, hi int
		want      int
	}{
		{"below range", 1, 20, 500, 20},
		{"at low boundary", 20, 20, 500, 20},
		{"in range", 210, 20, 500, 210},
		{"at high boundary", 500, 20, 500, 500},
		{"above range", 99999, 20, 500, 500},
		{"negative", -5, 5, 300, 5},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			assert.Equal(t, tt.want, clampInt(tt.v, tt.lo, tt.hi))
		})
	}
}
