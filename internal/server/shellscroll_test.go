package server

import (
	"context"
	"errors"
	"net/http/httptest"
	"path/filepath"
	"sync"
	"testing"
	"time"

	"github.com/coder/websocket"
	"github.com/rs/zerolog"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/Zalaras/muster/internal/session"
	"github.com/Zalaras/muster/internal/store"
	"github.com/Zalaras/muster/internal/tmux"
)

// scrollCall is one recorded fakeScroller.ScrollCopyMode invocation.
type scrollCall struct {
	target string
	lines  int
}

// fakeScroller is the shellScroller test double (kb:anchor/terminal.shell-ws): records
// every ScrollCopyMode/CancelCopyMode call so a test can assert the wire-level `scroll`
// frame reached tmux copy-mode with the clamped magnitude (D3) and the right
// entered/cancel bookkeeping (REQ-10), without a real tmux socket — internal/tmux's own
// activity_test.go already covers ScrollCopyMode/CancelCopyMode's tmux command shape for
// real; this file's job is the daemon's frame-decode-to-call wiring above that.
type fakeScroller struct {
	mu          sync.Mutex
	scrollCalls []scrollCall
	cancelCalls int
	entered     bool
	scrollErr   error
	cancelErr   error
}

func newFakeScroller() *fakeScroller {
	return &fakeScroller{entered: true}
}

func (f *fakeScroller) ScrollCopyMode(_ context.Context, target string, lines int) (bool, error) {
	f.mu.Lock()
	defer f.mu.Unlock()
	f.scrollCalls = append(f.scrollCalls, scrollCall{target: target, lines: lines})
	if f.scrollErr != nil {
		return false, f.scrollErr
	}
	return f.entered, nil
}

func (f *fakeScroller) CancelCopyMode(_ context.Context, _ string) error {
	f.mu.Lock()
	defer f.mu.Unlock()
	f.cancelCalls++
	return f.cancelErr
}

func (f *fakeScroller) calls() []scrollCall {
	f.mu.Lock()
	defer f.mu.Unlock()
	out := make([]scrollCall, len(f.scrollCalls))
	copy(out, f.scrollCalls)
	return out
}

func (f *fakeScroller) cancelCount() int {
	f.mu.Lock()
	defer f.mu.Unlock()
	return f.cancelCalls
}

func (f *fakeScroller) setEntered(v bool) {
	f.mu.Lock()
	defer f.mu.Unlock()
	f.entered = v
}

func (f *fakeScroller) setScrollErr(err error) {
	f.mu.Lock()
	defer f.mu.Unlock()
	f.scrollErr = err
}

// newFakeTmuxTestServerWithScroll is newFakeTmuxTestServer plus a fakeScroller wired as
// Config.ShellScroll — fakes_test.go's constructor has no such field, and adding one
// there would force every other test in the package to reason about a fourth return
// value it doesn't need.
func newFakeTmuxTestServerWithScroll(t *testing.T) (*testServer, *fakeTmux, *fakeScroller) {
	t.Helper()
	dbPath := filepath.Join(t.TempDir(), "muster.db")
	st, err := store.Open(context.Background(), dbPath)
	require.NoError(t, err)
	t.Cleanup(func() { _ = st.Close() })

	fake := newFakeTmux()
	scroller := newFakeScroller()
	logBuf := &syncBuffer{}
	srv := New(Config{
		Store: st, Logger: zerolog.New(logBuf), UIToken: testUIToken, IngestToken: testIngestToken,
		WebDist: t.TempDir(), DaemonVersion: "test-version",
		TmuxClient: fake, Attach: fake.attach, ShellScroll: scroller,
	})
	return &testServer{Server: srv, dbPath: dbPath, logs: logBuf, store: st}, fake, scroller
}

// spawnFakeShell is this file's shared setup: a launched session plus a spawned (faked)
// shell, ready for a WS dial.
func spawnFakeShell(t *testing.T, srv *testServer) (sess *session.Session, httpSrv *httptest.Server) {
	t.Helper()
	s := launchRealSession(t, srv, sleepForeverCommand())
	httpSrv = httptest.NewServer(srv.Handler())
	t.Cleanup(httpSrv.Close)
	_, _, created := postShellRequest(t, srv, s.ID)
	require.True(t, created)
	return s, httpSrv
}

// TestHandleShellTerminal_ScrollFrameClampsPositiveLinesTo200 covers D3 at the real wire
// shape: a `scroll` frame's magnitude reaches ScrollCopyMode already clamped, never the
// raw requested value.
func TestHandleShellTerminal_ScrollFrameClampsPositiveLinesTo200(t *testing.T) {
	srv, _, scroller := newFakeTmuxTestServerWithScroll(t)
	sess, httpSrv := spawnFakeShell(t, srv)

	c := dialShellOK(t, httpSrv, sess.ID)
	defer func() { _ = c.CloseNow() }()

	require.NoError(t, c.Write(context.Background(), websocket.MessageText, []byte(`{"type":"scroll","lines":9999}`)))

	require.Eventually(t, func() bool { return len(scroller.calls()) == 1 }, 3*time.Second, 20*time.Millisecond)
	calls := scroller.calls()
	assert.Equal(t, tmux.ShellSessionName(sess.ID), calls[0].target)
	assert.Equal(t, 200, calls[0].lines, "D3: magnitude clamped to 200 before reaching ScrollCopyMode")
}

// TestHandleShellTerminal_ScrollFrameClampsNegativeLinesToMinus200 covers D3's other
// direction, preserving the sign that carries scroll-down.
func TestHandleShellTerminal_ScrollFrameClampsNegativeLinesToMinus200(t *testing.T) {
	srv, _, scroller := newFakeTmuxTestServerWithScroll(t)
	sess, httpSrv := spawnFakeShell(t, srv)

	c := dialShellOK(t, httpSrv, sess.ID)
	defer func() { _ = c.CloseNow() }()

	require.NoError(t, c.Write(context.Background(), websocket.MessageText, []byte(`{"type":"scroll","lines":-9999}`)))

	require.Eventually(t, func() bool { return len(scroller.calls()) == 1 }, 3*time.Second, 20*time.Millisecond)
	assert.Equal(t, -200, scroller.calls()[0].lines)
}

// TestHandleShellTerminal_ScrollFrameZeroLinesNeverCallsScrollCopyMode covers
// clampScrollLines' "0 stays 0" clause reaching all the way to the socket: a frame that
// carries no actual scroll must never touch tmux at all.
func TestHandleShellTerminal_ScrollFrameZeroLinesNeverCallsScrollCopyMode(t *testing.T) {
	srv, fake, scroller := newFakeTmuxTestServerWithScroll(t)
	sess, httpSrv := spawnFakeShell(t, srv)

	c := dialShellOK(t, httpSrv, sess.ID)
	defer func() { _ = c.CloseNow() }()

	require.NoError(t, c.Write(context.Background(), websocket.MessageText, []byte(`{"type":"scroll","lines":0}`)))
	// A subsequent binary write is the synchronization point: by the time it's recorded,
	// the read loop has already processed (and skipped) the zero-lines scroll frame ahead
	// of it, so asserting scroller.calls() here is not a race against a slow handler.
	require.NoError(t, c.Write(context.Background(), websocket.MessageBinary, []byte("x")))
	require.Eventually(t, func() bool {
		conn := fake.lastPaneConn()
		return conn != nil && conn.writeCount() > 0
	}, 3*time.Second, 20*time.Millisecond)

	assert.Empty(t, scroller.calls(), "a lines:0 scroll frame must never reach ScrollCopyMode")
}

// TestHandleShellTerminal_ScrollErrorIsLoggedNotFatal covers a ScrollCopyMode failure
// (e.g. the real tmux command erroring): the socket must survive it, matching every other
// unparseable/failed-control-frame path in this package.
func TestHandleShellTerminal_ScrollErrorIsLoggedNotFatal(t *testing.T) {
	srv, _, scroller := newFakeTmuxTestServerWithScroll(t)
	scroller.setScrollErr(errors.New("boom: tmux scroll copy-mode failed"))
	sess, httpSrv := spawnFakeShell(t, srv)

	c := dialShellOK(t, httpSrv, sess.ID)
	defer func() { _ = c.CloseNow() }()

	require.NoError(t, c.Write(context.Background(), websocket.MessageText, []byte(`{"type":"scroll","lines":5}`)))
	require.NoError(t, c.Write(context.Background(), websocket.MessageBinary, []byte("STILL_ALIVE")))

	require.Eventually(t, func() bool { return len(scroller.calls()) == 1 }, 3*time.Second, 20*time.Millisecond)
	assert.Contains(t, srv.logs.String(), "shell scroll failed", "a failed scroll must be logged, never silently dropped")
}

// TestHandleShellTerminal_TypingWhileInCopyModeCancelsBeforeTheWrite covers REQ-10/E10:
// once a scroll frame reports entered=true, the next binary input frame must cancel
// copy-mode before the bytes reach the pane.
func TestHandleShellTerminal_TypingWhileInCopyModeCancelsBeforeTheWrite(t *testing.T) {
	srv, fake, scroller := newFakeTmuxTestServerWithScroll(t)
	scroller.setEntered(true)
	sess, httpSrv := spawnFakeShell(t, srv)

	c := dialShellOK(t, httpSrv, sess.ID)
	defer func() { _ = c.CloseNow() }()

	require.NoError(t, c.Write(context.Background(), websocket.MessageText, []byte(`{"type":"scroll","lines":5}`)))
	require.Eventually(t, func() bool { return len(scroller.calls()) == 1 }, 3*time.Second, 20*time.Millisecond)

	require.NoError(t, c.Write(context.Background(), websocket.MessageBinary, []byte("x")))
	require.Eventually(t, func() bool {
		conn := fake.lastPaneConn()
		return conn != nil && conn.writeCount() > 0
	}, 3*time.Second, 20*time.Millisecond)

	assert.Equal(t, 1, scroller.cancelCount(), "REQ-10: typing after a scroll that entered copy-mode must cancel it first")
}

// TestHandleShellTerminal_TypingNeverCancelsWhenNoScrollHasHappened covers REQ-10's
// negative source state: with no prior scroll frame at all, ordinary typing must never
// call CancelCopyMode — proving the cancel is conditional on the connection's own
// inCopyMode tracking, not unconditional before every write.
func TestHandleShellTerminal_TypingNeverCancelsWhenNoScrollHasHappened(t *testing.T) {
	srv, fake, scroller := newFakeTmuxTestServerWithScroll(t)
	sess, httpSrv := spawnFakeShell(t, srv)

	c := dialShellOK(t, httpSrv, sess.ID)
	defer func() { _ = c.CloseNow() }()

	require.NoError(t, c.Write(context.Background(), websocket.MessageBinary, []byte("x")))
	require.Eventually(t, func() bool {
		conn := fake.lastPaneConn()
		return conn != nil && conn.writeCount() > 0
	}, 3*time.Second, 20*time.Millisecond)

	assert.Equal(t, 0, scroller.cancelCount())
}

// TestHandleShellTerminal_ScrollThatDoesNotEnterCopyModeNeverCancelsOnNextInput covers
// REQ-12/edge case 10's no-op path end to end: ScrollCopyMode's own entered=false (the
// "nothing to scroll to" result) must leave the connection's inCopyMode tracking false,
// so the very next input frame skips CancelCopyMode — proven by the doc comment on
// applyShellTextFrame ("inCopyMode is set from ScrollCopyMode's own entered result, never
// assumed from a nil error").
func TestHandleShellTerminal_ScrollThatDoesNotEnterCopyModeNeverCancelsOnNextInput(t *testing.T) {
	srv, fake, scroller := newFakeTmuxTestServerWithScroll(t)
	scroller.setEntered(false)
	sess, httpSrv := spawnFakeShell(t, srv)

	c := dialShellOK(t, httpSrv, sess.ID)
	defer func() { _ = c.CloseNow() }()

	require.NoError(t, c.Write(context.Background(), websocket.MessageText, []byte(`{"type":"scroll","lines":5}`)))
	require.Eventually(t, func() bool { return len(scroller.calls()) == 1 }, 3*time.Second, 20*time.Millisecond)

	require.NoError(t, c.Write(context.Background(), websocket.MessageBinary, []byte("x")))
	require.Eventually(t, func() bool {
		conn := fake.lastPaneConn()
		return conn != nil && conn.writeCount() > 0
	}, 3*time.Second, 20*time.Millisecond)

	assert.Equal(t, 0, scroller.cancelCount(), "entered=false must never flip inCopyMode true")
}

// TestHandleShellTerminal_ResizeFrameStillDecodesOnTheShellSocket covers REQ-9's other
// direction at the shell route: shellTextFrame is a superset of resizeFrame, so an
// ordinary resize control frame on /ws/shell/{id} must still apply, exactly as it does on
// the Claude socket.
func TestHandleShellTerminal_ResizeFrameStillDecodesOnTheShellSocket(t *testing.T) {
	srv, fake, _ := newFakeTmuxTestServerWithScroll(t)
	sess, httpSrv := spawnFakeShell(t, srv)

	c := dialShellOK(t, httpSrv, sess.ID)
	defer func() { _ = c.CloseNow() }()

	require.NoError(t, c.Write(context.Background(), websocket.MessageText, []byte(`{"type":"resize","cols":111,"rows":33}`)))

	require.Eventually(t, func() bool {
		conn := fake.lastPaneConn()
		if conn == nil {
			return false
		}
		cols, _ := conn.resize()
		return cols == 111
	}, 3*time.Second, 20*time.Millisecond)
}
