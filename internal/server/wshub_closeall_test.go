package server

import (
	"net/http/httptest"
	"testing"
	"time"

	"github.com/stretchr/testify/require"
)

// TestWSHub_CloseAllDoesNotBlockBroadcastOnASlowPeer covers
// review.maintainability.b-server.md Minor 10: closeAll must not hold h.mu for the
// duration of a slow/unresponsive peer's close handshake, since broadcast (called from the
// ingest worker and the session manager's OnUpsert) needs that same lock on every message.
//
// The dialed client here reads its hello/snapshot and then never reads (or writes) again,
// so it never responds to the server-initiated close frame closeAll's Close call sends —
// coder/websocket's own close handshake then blocks on its internal 5s timeout
// (close.go's waitCloseHandshake) waiting for a reply that never comes. Pre-fix, closeAll
// held h.mu for that whole span; post-fix, the client map is copied out and cleared under
// the lock before any Close call is made, so broadcast returns immediately regardless.
//
// Written to FAIL on the pre-F2 code: see daemon-tests-F2.md for the captured failure
// against the restored pre-fix internal/server/ws.go.
func TestWSHub_CloseAllDoesNotBlockBroadcastOnASlowPeer(t *testing.T) {
	srv := newTestServer(t, ClaudeCodeInfo{})
	httpSrv := httptest.NewServer(srv.Handler())
	t.Cleanup(httpSrv.Close)
	wsURL := "ws" + httpSrv.URL[len("http"):] + "/ws"

	c, err := dialWS(t, wsURL, nil)
	require.NoError(t, err)
	defer func() { _ = c.CloseNow() }()
	_ = readJSON[helloWire](t, c)
	_ = readJSON[snapshotWire](t, c)
	// c never reads (or writes) again from this point on — it will not answer the
	// server's close frame, forcing the server-side Close call below into its internal
	// close-handshake timeout.

	closeAllDone := make(chan struct{})
	go func() {
		defer close(closeAllDone)
		srv.hub.closeAll()
	}()

	// Give closeAll's goroutine a moment to actually reach the slow peer's Close call
	// (it has exactly one client to iterate, so this is generous, not a race window the
	// assertion below depends on for correctness — broadcast must return promptly
	// whether closeAll has started iterating yet or not).
	time.Sleep(50 * time.Millisecond)

	broadcastDone := make(chan struct{})
	go func() {
		defer close(broadcastDone)
		srv.hub.broadcast(map[string]string{"type": "probe"})
	}()

	select {
	case <-broadcastDone:
	case <-time.After(500 * time.Millisecond):
		t.Fatal("Minor 10 regression: broadcast blocked on closeAll's slow-peer close handshake")
	}

	// closeAll itself must still eventually finish (proving the fix doesn't skip closing
	// the slow peer, just stops holding the lock while doing it) — bounded generously
	// above coder/websocket's internal 5s close-handshake timeout.
	select {
	case <-closeAllDone:
	case <-time.After(7 * time.Second):
		t.Fatal("closeAll never completed")
	}

	// The hub must also be immediately reusable (add/remove need h.mu too) — dial a
	// second client right after closeAll returns and confirm it isn't itself blocked.
	// dialWS/readJSON assert internally, so this runs on the main test goroutine (no
	// separate bound beyond their own internal 5s timeouts) rather than in a goroutine
	// testify would flag (testifylint's go-require).
	c2, err := dialWS(t, wsURL, nil)
	require.NoError(t, err)
	defer func() { _ = c2.CloseNow() }()
	_ = readJSON[helloWire](t, c2)
}
