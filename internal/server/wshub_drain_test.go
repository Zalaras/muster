package server

import (
	"context"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/rs/zerolog"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/coder/websocket"
	"github.com/coder/websocket/wsjson"
)

// probeMessage is a minimal broadcast payload these tests round-trip over the wire to
// prove delivery (as opposed to just its enqueue) — separate from wshub_closeall_test.go's
// map[string]string probe so its N field can distinguish iterations.
type probeMessage struct {
	Type string `json:"type"`
	N    int    `json:"n"`
}

// TestWSHub_CloseAllDeliversQueuedBroadcastBeforeClosing is Fix Attempt 1's named
// guarantee: a message broadcast() already queued in a client's outbox must reach the wire
// before closeAll's Close tears the socket down, even though broadcast and closeAll race
// with no synchronization between them beyond drainOutboxes.
//
// There is deliberately no sleep between broadcast and closeAll — that gap is exactly the
// scheduling window Fix Attempt 1's root-cause analysis names: handleWS's read loop can
// have both the queued message and ctx.Done() ready in the same select once Close cancels
// ctx, and pre-fix, Go could pick either. The client's read is started before broadcast so
// it races closeAll's Close the way a real dashboard's always-on read loop does — reading
// only after closeAll returns would instead measure Close's own close-handshake wait (the
// peer must be reading for that handshake to complete promptly), not this race. Looped
// enough times to have caught the race reliably on the pre-fix code (see daemon-tests.md
// for the throwaway-copy repro this test was proven against).
func TestWSHub_CloseAllDeliversQueuedBroadcastBeforeClosing(t *testing.T) {
	srv := newTestServer(t, ClaudeCodeInfo{})
	httpSrv := httptest.NewServer(srv.Handler())
	t.Cleanup(httpSrv.Close)
	wsURL := "ws" + httpSrv.URL[len("http"):] + "/ws"

	const iterations = 300
	for i := range iterations {
		c, err := dialWS(t, wsURL, nil)
		require.NoError(t, err)

		// hello/snapshot are written only after handleWS's hub.add(c) has already run, so
		// once these two are read the client is guaranteed registered in h.clients —
		// broadcast below cannot race the registration itself, only closeAll.
		_ = readJSON[helloWire](t, c)
		_ = readJSON[snapshotWire](t, c)

		type readResult struct {
			msg probeMessage
			err error
		}
		readDone := make(chan readResult, 1)
		go func() {
			ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
			defer cancel()
			var got probeMessage
			err := wsjson.Read(ctx, c, &got)
			if err == nil {
				// A second Read lets coder/websocket see and auto-ack the close frame
				// Close() sent right behind the probe — without this, the client never
				// participates in the close handshake and closeAll's Close blocks on its
				// own 5s handshake timeout every iteration, which is not what this test
				// measures.
				_, _, _ = c.Read(ctx)
			}
			readDone <- readResult{msg: got, err: err}
		}()

		want := probeMessage{Type: "probe", N: i}
		srv.hub.broadcast(want)
		srv.hub.closeAll()

		select {
		case res := <-readDone:
			require.NoError(t, res.err, "iteration %d: client read failed", i)
			assert.Equal(t, want, res.msg, "iteration %d: broadcast queued just before closeAll must still be delivered", i)
		case <-time.After(6 * time.Second):
			t.Fatalf("iteration %d: client never received the queued broadcast", i)
		}

		_ = c.CloseNow()
	}
}

// TestWSHub_CloseAllBoundedWithQueuedMessageOnNonReadingPeer is Fix Attempt 1's second
// named guarantee: closeAll must stay bounded even when a client has both a message queued
// (drainOutboxes has something to wait for) and never reads at all (the ack it's waiting
// for never arrives, and neither does the close-handshake reply Close itself needs).
// Mirrors wshub_closeall_test.go's TestWSHub_CloseAllDoesNotBlockBroadcastOnASlowPeer but
// adds a queued broadcast before closeAll, so the drain wait and the close handshake both
// contribute to the bound this test checks.
func TestWSHub_CloseAllBoundedWithQueuedMessageOnNonReadingPeer(t *testing.T) {
	srv := newTestServer(t, ClaudeCodeInfo{})
	httpSrv := httptest.NewServer(srv.Handler())
	t.Cleanup(httpSrv.Close)
	wsURL := "ws" + httpSrv.URL[len("http"):] + "/ws"

	c, err := dialWS(t, wsURL, nil)
	require.NoError(t, err)
	defer func() { _ = c.CloseNow() }()
	_ = readJSON[helloWire](t, c)
	_ = readJSON[snapshotWire](t, c)
	// c never reads again from here: it will neither dequeue the broadcast below nor
	// answer the server's close frame, so both drainOutboxes' ack wait and Close's
	// handshake wait run out their full timeouts.

	srv.hub.broadcast(probeMessage{Type: "probe", N: 1})

	closeAllDone := make(chan struct{})
	go func() {
		defer close(closeAllDone)
		srv.hub.closeAll()
	}()

	// Bounded above closeDrainTimeout (250ms) plus coder/websocket's internal 5s
	// close-handshake timeout, with margin — matches the sibling slow-peer test's bound.
	select {
	case <-closeAllDone:
	case <-time.After(7 * time.Second):
		t.Fatal("closeAll did not return within the bound: a stuck client with a queued message blocked shutdown")
	}
}

// TestDrainOutboxes_AckedClientReturnsWellUnderTheBound covers drainOutboxes directly
// (package-internal, no real WS connection needed): a client whose outbox is actively
// drained — the same shape handleWS's read loop gives a live client — closes the ack
// marker immediately, so drainOutboxes returns as soon as that happens rather than waiting
// out closeDrainTimeout.
func TestDrainOutboxes_AckedClientReturnsWellUnderTheBound(t *testing.T) {
	ch := make(chan any, outboxSize)
	clients := map[*websocket.Conn]chan any{nil: ch}

	// Simulates handleWS's read loop: single goroutine draining ch in order, closing the
	// ack marker instead of writing it in place of processing it.
	drained := make(chan struct{})
	go func() {
		defer close(drained)
		for msg := range ch {
			if ack, ok := msg.(wsDrainAck); ok {
				close(ack)
				return
			}
		}
	}()

	start := time.Now()
	drainOutboxes(clients, zerolog.Nop())
	elapsed := time.Since(start)

	select {
	case <-drained:
	case <-time.After(time.Second):
		t.Fatal("simulated reader never observed the ack marker drainOutboxes enqueued")
	}
	assert.Less(t, elapsed, closeDrainTimeout, "an actively-drained client must not wait out the bound")
}

// TestDrainOutboxes_DeadReaderHitsTheBound covers the other drainOutboxes shape: a client
// whose outbox nothing will ever dequeue (a stuck or dead handleWS goroutine). The ack
// marker enqueues fine (the outbox isn't full) but is never closed, so drainOutboxes must
// still return once closeDrainTimeout elapses rather than waiting forever.
func TestDrainOutboxes_DeadReaderHitsTheBound(t *testing.T) {
	ch := make(chan any, outboxSize)
	clients := map[*websocket.Conn]chan any{nil: ch}
	// Nothing ever reads ch.

	start := time.Now()
	drainOutboxes(clients, zerolog.Nop())
	elapsed := time.Since(start)

	assert.GreaterOrEqual(t, elapsed, closeDrainTimeout, "must wait out the full bound when no ack ever arrives")
	assert.Less(t, elapsed, closeDrainTimeout+time.Second, "must not overrun the bound by more than test scheduling slack")
}
