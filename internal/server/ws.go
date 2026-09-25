package server

import (
	"net/http"
	"sync"
	"time"

	"github.com/coder/websocket"
	"github.com/coder/websocket/wsjson"
	"github.com/rs/zerolog"
)

// helloMessage is the WS `hello` (kb:anchor/ws.hello, protocol 2). ClaudeCode.Installed
// is null iff Status is "unknown" — the client renders that as "Claude installation
// unknown".
type helloMessage struct {
	Type            string         `json:"type"`
	ProtocolVersion int            `json:"protocolVersion"`
	Daemon          daemonInfo     `json:"daemon"`
	ClaudeCode      claudeCodeWire `json:"claudeCode"`
}

type daemonInfo struct {
	Version string `json:"version"`
}

type claudeCodeWire struct {
	Installed *string `json:"installed"`
	Floor     string  `json:"floor"`
	Verified  string  `json:"verified"`
	Status    string  `json:"status"`
}

// snapshotMessage is Snapshot with the WS "type" envelope added (kb:anchor/ws.snapshot). Snapshot is
// embedded anonymously so its fields marshal inline alongside Type.
type snapshotMessage struct {
	Type string `json:"type"`
	Snapshot
}

// protocolVersion bumps only on a breaking change to an existing message — additive
// fields don't bump it (docs/protocol.md header). 2: hello.claudeCode replaced
// {pinned, installed, drift} with {installed, floor, verified, status}
// (kb:adr/connection-installed-claude-classified-never-refused, closes #6).
const protocolVersion = 2

// outboxSize bounds each client's broadcast backlog. A slow/stuck client is dropped
// (messages skipped) rather than allowed to block the broadcaster.
const outboxSize = 16

// wsHub tracks every open /ws connection so Server.Shutdown can close them all —
// otherwise a hijacked WS connection outlives http.Server.Shutdown, which does not wait
// for (or close) connections taken over via Hijack — and so broadcast can fan a
// sessionUpsert out to every connected client.
type wsHub struct {
	mu      sync.Mutex
	clients map[*websocket.Conn]chan any
	log     zerolog.Logger
}

func newWSHub(log zerolog.Logger) *wsHub {
	return &wsHub{clients: make(map[*websocket.Conn]chan any), log: log}
}

func (h *wsHub) add(c *websocket.Conn) chan any {
	ch := make(chan any, outboxSize)
	h.mu.Lock()
	defer h.mu.Unlock()
	h.clients[c] = ch
	return ch
}

func (h *wsHub) remove(c *websocket.Conn) {
	h.mu.Lock()
	defer h.mu.Unlock()
	delete(h.clients, c)
}

// closeAll closes every connected client's socket (daemon shutdown). The map is copied
// out and cleared under the lock, then closed outside it (matching
// terminalRegistry.closeAll's pattern): Close waits out each peer's close handshake, and
// holding h.mu for that would block broadcast — including the ingest worker's and the
// session manager's OnUpsert — for as long as the slowest peer takes to respond.
//
// drainOutboxes runs first, bounded, so a message broadcast() already queued (e.g. the
// restarting-phase `update`, kb:adr/update-restart-is-in-place-reexec-not-shutdown) gets
// a real chance to reach wsjson.Write before Close tears down the socket underneath it —
// see drainOutboxes.
func (h *wsHub) closeAll() {
	h.mu.Lock()
	clients := h.clients
	h.clients = make(map[*websocket.Conn]chan any)
	h.mu.Unlock()

	drainOutboxes(clients, h.log)

	for c := range clients {
		_ = c.Close(websocket.StatusNormalClosure, "musterd shutting down")
	}
}

// broadcast enqueues msg for every connected client, non-blocking: a full outbox drops
// the message for that one client rather than stalling the caller (the ingest worker).
func (h *wsHub) broadcast(msg any) {
	h.mu.Lock()
	defer h.mu.Unlock()
	for _, ch := range h.clients {
		select {
		case ch <- msg:
		default:
		}
	}
}

// wsDrainAck is enqueued behind whatever broadcast() already queued in a client's outbox
// when closeAll is about to close it. handleWS's read loop closes it in place of writing
// it — the same "close it instead of processing it" marker ingestQueue's drainAck uses
// (internal/server/ingest.go) to prove FIFO drain rather than just dequeue: because the
// per-connection loop is single-threaded and processes outbox in order, an ack fired
// means wsjson.Write already returned for every real message ahead of the marker.
type wsDrainAck chan<- struct{}

// closeDrainTimeout bounds drainOutboxes' total wait so one stuck peer (a full outbox, or
// a write hung on a dead TCP peer) can never hold up shutdown — matching closeAll's
// existing "must not block on a slow peer" contract (wshub_closeall_test.go). Fixed rather
// than derived from Shutdown's own ctx: closeAll is the first of several steps
// Server.Shutdown(ctx) still has to run within that same ctx's deadline
// (terminal.closeAll, manager.Stop, every feature's Stop), so drainOutboxes borrows a
// small fixed slice of that budget up front rather than a share of whatever's left in ctx
// — one stuck client must not be able to consume the whole shutdown deadline before
// teardown even starts on the rest.
const closeDrainTimeout = 250 * time.Millisecond

// drainOutboxes gives every client's already-queued broadcast messages a bounded chance
// to be picked up and written before the caller closes the connections. broadcast's
// non-blocking enqueue only guarantees a message is queued, not that handleWS's goroutine
// has been scheduled to dequeue it yet; Close cancels that goroutine's ctx, so its select
// can end up with both the queued message and ctx.Done() ready at once and pick either,
// occasionally dropping a message that was already sitting in the channel. Enqueuing an
// ack marker behind the real message and waiting for it to close proves the message was
// handed to wsjson.Write first, without making broadcast itself block.
//
// A full outbox (already dropping messages per broadcast's contract) is skipped rather
// than waited on. The whole call is bounded by closeDrainTimeout — a stuck client never
// holds up shutdown, it's simply not waited on past the deadline — and, like every other
// bounded shutdown wait in this package (boundedwait.Wait's ingest/apply/bgloop callers),
// hitting that bound is logged at warn rather than failing silently. It does not call
// boundedwait.Wait itself: that helper's contract puts making its WaitGroup reach zero on
// the caller, but a peer whose handleWS loop already returned on ctx.Done() never dequeues
// its ack marker, so that ack's channel never closes; wrapping this in a WaitGroup would
// leave Wait's own `go func() { wg.Wait(); … }()` blocked forever on that one ack instead
// of returning at the deadline. The per-ack select loop below hits the same deadline
// without that leak, because it moves on past an unresponded ack rather than waiting on a
// WaitGroup counter that ack was supposed to decrement.
func drainOutboxes(clients map[*websocket.Conn]chan any, log zerolog.Logger) {
	acks := make([]chan struct{}, 0, len(clients))
	for _, ch := range clients {
		ack := make(chan struct{})
		select {
		case ch <- wsDrainAck(ack):
			acks = append(acks, ack)
		default:
			// Outbox full, or nothing will ever read it; nothing to wait for.
		}
	}

	deadline := time.After(closeDrainTimeout)
	for i, ack := range acks {
		select {
		case <-ack:
		case <-deadline:
			log.Warn().Int("pending", len(acks)-i).Msg("ws outbox drain did not finish before shutdown deadline")
			return
		}
	}
}

// handleWS upgrades to a WebSocket and sends `hello` then `snapshot`. Origin
// checking is coder/websocket's own default behaviour (Accept rejects a present Origin
// whose host doesn't match the request Host with a plain 403, before any upgrade
// happens) — no bespoke check needed.
func (s *Server) handleWS(w http.ResponseWriter, r *http.Request) {
	c, err := websocket.Accept(w, r, nil)
	if err != nil {
		s.log.Info().Err(err).Msg("ws upgrade rejected")
		return
	}
	defer func() { _ = c.CloseNow() }()

	outbox := s.hub.add(c)
	defer s.hub.remove(c)

	// The client never sends application messages on this socket (kb:anchor/ws); CloseRead
	// discards whatever control frames arrive and cancels its context on close.
	ctx := c.CloseRead(r.Context())

	hello := helloMessage{
		Type:            "hello",
		ProtocolVersion: protocolVersion,
		Daemon:          daemonInfo{Version: s.daemonVersion},
		ClaudeCode: claudeCodeWire{
			Installed: s.claudeCode.Installed,
			Floor:     s.claudeCode.Floor,
			Verified:  s.claudeCode.Verified,
			Status:    s.claudeCode.Status,
		},
	}
	if err := wsjson.Write(ctx, c, hello); err != nil {
		return
	}

	snapshot := snapshotMessage{Type: "snapshot", Snapshot: s.currentSnapshot(r.Context())}
	if err := wsjson.Write(ctx, c, snapshot); err != nil {
		return
	}

	// Every subsequent message is a broadcast delta (sessionUpsert, …); there is no
	// replay, only the snapshot above (kb:anchor/ws).
	for {
		select {
		case <-ctx.Done():
			return
		case msg := <-outbox:
			if ack, ok := msg.(wsDrainAck); ok {
				close(ack)
				continue
			}
			if err := wsjson.Write(ctx, c, msg); err != nil {
				return
			}
		}
	}
}
