package server

import (
	"net/http"
	"sync"

	"github.com/coder/websocket"
	"github.com/coder/websocket/wsjson"
)

// helloMessage is the WS `hello` (docs/protocol.md §5.1). Installed/Drift are nil when
// the startup version check failed — the client renders that as "unknown", never drift.
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
	Pinned    string  `json:"pinned"`
	Installed *string `json:"installed"`
	Drift     *bool   `json:"drift"`
}

// snapshotMessage is Snapshot with the WS "type" envelope added (§5.2). Snapshot is
// embedded anonymously so its fields marshal inline alongside Type.
type snapshotMessage struct {
	Type string `json:"type"`
	Snapshot
}

const protocolVersion = 1

// outboxSize bounds each client's broadcast backlog. A slow/stuck client is dropped
// (messages skipped) rather than allowed to block the broadcaster (m1-sessions "The
// state machine — implementation shape": "slow/stuck clients are dropped, never block
// the worker").
const outboxSize = 16

// wsHub tracks every open /ws connection so Server.Shutdown can close them all —
// otherwise a hijacked WS connection outlives http.Server.Shutdown, which does not wait
// for (or close) connections taken over via Hijack — and so broadcast can fan a
// sessionUpsert out to every connected client (m1-sessions REQ-12).
type wsHub struct {
	mu      sync.Mutex
	clients map[*websocket.Conn]chan any
}

func newWSHub() *wsHub {
	return &wsHub{clients: make(map[*websocket.Conn]chan any)}
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

func (h *wsHub) closeAll() {
	h.mu.Lock()
	defer h.mu.Unlock()
	for c := range h.clients {
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

// handleWS upgrades to a WebSocket and sends `hello` then `snapshot` (REQ-7). Origin
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

	// The client never sends application messages on this socket (protocol §5); CloseRead
	// discards whatever control frames arrive and cancels its context on close.
	ctx := c.CloseRead(r.Context())

	hello := helloMessage{
		Type:            "hello",
		ProtocolVersion: protocolVersion,
		Daemon:          daemonInfo{Version: s.daemonVersion},
		ClaudeCode: claudeCodeWire{
			Pinned:    s.claudeCode.Pinned,
			Installed: s.claudeCode.Installed,
			Drift:     s.claudeCode.Drift,
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
	// replay, only the snapshot above (protocol §5).
	for {
		select {
		case <-ctx.Done():
			return
		case msg := <-outbox:
			if err := wsjson.Write(ctx, c, msg); err != nil {
				return
			}
		}
	}
}
