package server

import (
	"context"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/coder/websocket"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// gatedCloseConn is a paneConn test double whose Close blocks until release is closed,
// signalling entered exactly once — the review.maintainability.b-server.md Major 2
// interleaving's "a takeover's Close call hangs" fixture. Read/Write/Resize are never
// exercised by this test (the assertion is entirely about terminalRegistry's own lock
// ordering, not any PTY traffic), so they're trivial stand-ins satisfying paneConn.
type gatedCloseConn struct {
	entered chan struct{}
	release chan struct{}
}

func newGatedCloseConn() *gatedCloseConn {
	return &gatedCloseConn{entered: make(chan struct{}), release: make(chan struct{})}
}

func (c *gatedCloseConn) Read(_ []byte) (int, error)               { <-c.release; return 0, nil }
func (c *gatedCloseConn) Write(p []byte) (int, error)              { return len(p), nil }
func (c *gatedCloseConn) Resize(_ context.Context, _, _ int) error { return nil }
func (c *gatedCloseConn) Close() error {
	close(c.entered)
	<-c.release
	return nil
}

// instantPaneConn is the trivial paneConn a takeover's replacement attach hands back —
// never touched by this test beyond being installed.
type instantPaneConn struct{}

func (instantPaneConn) Read(_ []byte) (int, error)               { return 0, nil }
func (instantPaneConn) Write(p []byte) (int, error)              { return len(p), nil }
func (instantPaneConn) Resize(_ context.Context, _, _ int) error { return nil }
func (instantPaneConn) Close() error                             { return nil }

// dialRealWSConn opens one real client-side *websocket.Conn against a throwaway upgrade
// server. terminalConn.ws is a concrete *websocket.Conn (Close is called on it directly,
// terminal.go's takeover), so a nil or fabricated value would panic — this test's
// assertion is about terminalRegistry's own lock ordering, never about what happens on
// the wire, so a plain client-side conn (rather than the harder-to-obtain server-accepted
// one) stands in fine as "some real, closable *websocket.Conn".
func dialRealWSConn(t *testing.T) *websocket.Conn {
	t.Helper()
	upgrader := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		c, err := websocket.Accept(w, r, nil)
		if err != nil {
			return
		}
		// CloseRead (mirroring handleWS's own use of it): a background goroutine keeps
		// reading so this side actually answers the client's eventual close handshake
		// instead of leaving c.Close on the test's client-side conn to wait out
		// coder/websocket's internal 5s close-handshake timeout, which would otherwise
		// swallow this test's own short "did it block" bound before terminalRegistry
		// code is even reached.
		ctx := c.CloseRead(r.Context())
		<-ctx.Done()
	}))
	t.Cleanup(upgrader.Close)

	wsURL := "ws" + upgrader.URL[len("http"):]
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	c, _, err := websocket.Dial(ctx, wsURL, nil) //nolint:bodyclose // coder/websocket Dial nils out resp.Body on success (dial.go); there is nothing to close
	require.NoError(t, err)
	t.Cleanup(func() { _ = c.CloseNow() })
	return c
}

// TestTerminalRegistry_WatchedNeverBlocksOnAnInFlightTakeoverClose covers
// review.maintainability.b-server.md Major 2: Watched must return promptly even while a
// takeover for the same session is stuck evicting a slow-closing old connection — proven
// directly against terminalRegistry (no HTTP handler needed; takeover/Watched are its own
// exported-enough surface within this package). Pre-fix, Watched and takeover shared one
// mu held across the whole evict-then-attach sequence, so Watched would block for as long
// as the stuck Close does; post-fix, keyLocks (the takeover-serialising lock) and mu (the
// map-only lock) are separate, so Watched only ever needs the latter's brief hold.
//
// Written to FAIL on the pre-F2 code: see daemon-tests-F2.md for the captured failure
// against the restored pre-fix internal/server/terminal.go.
func TestTerminalRegistry_WatchedNeverBlocksOnAnInFlightTakeoverClose(t *testing.T) {
	r := newTerminalRegistry()
	const sessionID = int64(42)
	key := terminalKey{sessionID: sessionID, surface: surfaceClaude}

	oldWS := dialRealWSConn(t)
	oldBridge := newGatedCloseConn()
	r.conns[key] = &terminalConn{ws: oldWS, bridge: oldBridge}

	newWS := dialRealWSConn(t)
	takeoverDone := make(chan error, 1)
	go func() {
		_, err := r.takeover(context.Background(), key, func(context.Context) (*terminalConn, error) {
			return &terminalConn{ws: newWS, bridge: instantPaneConn{}}, nil
		})
		takeoverDone <- err
	}()

	select {
	case <-oldBridge.entered:
	case <-time.After(2 * time.Second):
		t.Fatal("takeover never reached the old connection's blocking Close")
	}

	// The takeover goroutine is now stuck inside oldBridge.Close(), holding key's
	// keyLocks entry (post-fix) or the single shared mu (pre-fix). Watched must not need
	// to wait on either — this is Major 2's actual assertion.
	watchedResult := make(chan bool, 1)
	go func() { watchedResult <- r.Watched(sessionID) }()

	select {
	case watched := <-watchedResult:
		// The old entry has already been evicted from the map (takeover deletes it
		// before calling Close) and the new one is not installed until attach returns,
		// so the correct answer while the takeover is mid-flight is false — the useful
		// assertion here is that this returned at all within the bound, not which
		// boolean it carried.
		assert.False(t, watched, "no connection is registered for the session while its takeover is between evict and attach")
	case <-time.After(200 * time.Millisecond):
		t.Fatal("Major 2 regression: Watched blocked on an in-flight takeover's stuck Close")
	}

	close(oldBridge.release)

	select {
	case err := <-takeoverDone:
		require.NoError(t, err)
	case <-time.After(2 * time.Second):
		t.Fatal("takeover never completed after the gate was released")
	}

	assert.True(t, r.Watched(sessionID), "the new connection must be registered once the takeover completes")
}
