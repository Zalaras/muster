package server

import (
	"context"
	"errors"
	"net/http"
	"net/http/httptest"
	"sync/atomic"
	"testing"
	"time"

	"github.com/coder/websocket"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// recordingPaneConn is a paneConn whose Close records that it happened — this test's
// assertion that a takeover's replacement bridge is torn down rather than kept alive.
// Read/Write/Resize are never exercised (the assertion is entirely about
// terminalRegistry's own bookkeeping, not any PTY traffic).
type recordingPaneConn struct {
	closed atomic.Bool
}

func (c *recordingPaneConn) Read(_ []byte) (int, error)               { return 0, nil }
func (c *recordingPaneConn) Write(p []byte) (int, error)              { return len(p), nil }
func (c *recordingPaneConn) Resize(_ context.Context, _, _ int) error { return nil }
func (c *recordingPaneConn) Close() error                             { c.closed.Store(true); return nil }

// dialRealWSConnCapturingClose is dialRealWSConn (terminal_registry_lock_test.go) plus a
// channel that receives the close frame's code/reason as the upgrade server's own peer
// observes it — this test needs to see what code terminalRegistry actually sent, not just
// whether Close was called.
func dialRealWSConnCapturingClose(t *testing.T) (*websocket.Conn, <-chan websocket.CloseError) {
	t.Helper()
	closeInfo := make(chan websocket.CloseError, 1)
	upgrader := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		c, err := websocket.Accept(w, r, nil)
		if err != nil {
			return
		}
		_, _, err = c.Read(r.Context())
		var ce websocket.CloseError
		if errors.As(err, &ce) {
			closeInfo <- ce
		}
	}))
	t.Cleanup(upgrader.Close)

	wsURL := "ws" + upgrader.URL[len("http"):]
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	c, _, err := websocket.Dial(ctx, wsURL, nil) //nolint:bodyclose // coder/websocket Dial nils out resp.Body on success (dial.go); there is nothing to close
	require.NoError(t, err)
	t.Cleanup(func() { _ = c.CloseNow() })
	return c, closeInfo
}

// TestTerminalRegistry_TakeoverAfterCloseAllClosesNewConnWithShutdownCode asserts that a
// takeover whose attach completes after closeAll has already run must not install its
// connection — closeAll has emptied the map and moved on, and a conn slipped in afterwards
// would never get torn down. terminalRegistry.closed and takeover's second check (after
// attach returns) are what closes it instead, with the same shutdown code closeAll itself
// uses.
//
// Written to FAIL on the pre-FW-D3 code: see daemon-tests-FW-D3.md for the captured
// failure against the restored pre-fix internal/server/terminal.go (no closed field, no
// second check).
func TestTerminalRegistry_TakeoverAfterCloseAllClosesNewConnWithShutdownCode(t *testing.T) {
	r := newTerminalRegistry()
	const sessionID = int64(7)
	key := terminalKey{sessionID: sessionID, surface: surfaceClaude}

	newWS, closeInfo := dialRealWSConnCapturingClose(t)
	newBridge := &recordingPaneConn{}

	attachEntered := make(chan struct{})
	proceed := make(chan struct{})
	takeoverDone := make(chan error, 1)
	var takeoverConn *terminalConn
	go func() {
		conn, err := r.takeover(context.Background(), key, func(context.Context) (*terminalConn, error) {
			close(attachEntered)
			<-proceed
			return &terminalConn{ws: newWS, bridge: newBridge}, nil
		})
		takeoverConn = conn
		takeoverDone <- err
	}()

	select {
	case <-attachEntered:
	case <-time.After(2 * time.Second):
		t.Fatal("takeover never reached its attach call")
	}
	// The first closed check (before evicting) has already passed — takeover is now
	// inside attach, exactly the window closeAll can run in that the second check
	// guards against.

	r.closeAll()
	close(proceed) // let attach return its new conn now that closeAll has already run

	var err error
	select {
	case err = <-takeoverDone:
	case <-time.After(2 * time.Second):
		t.Fatal("takeover never returned after its attach unblocked")
	}
	require.ErrorIs(t, err, errRegistryClosed, "a takeover whose attach finishes after closeAll must report the registry closed, not install its conn")
	assert.Nil(t, takeoverConn, "takeover must not hand back a connection it is about to close")

	select {
	case ce := <-closeInfo:
		assert.Equal(t, websocket.StatusNormalClosure, ce.Code, "the same shutdown code closeAll itself uses (terminal.go's closeAll loop)")
		assert.Equal(t, "musterd shutting down", ce.Reason)
	case <-time.After(2 * time.Second):
		t.Fatal("the new connection was never closed — it must not be left dangling once closeAll has run")
	}
	assert.True(t, newBridge.closed.Load(), "the new bridge must be torn down alongside its socket")

	r.mu.Lock()
	_, present := r.conns[key]
	r.mu.Unlock()
	assert.False(t, present, "a takeover whose attach finishes after closeAll must never install its connection into the registry")
}
