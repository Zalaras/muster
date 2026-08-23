package server

import (
	"context"
	"encoding/json"
	"errors"
	"io"
	"net/http"
	"strconv"
	"sync"

	"github.com/coder/websocket"

	"github.com/Zalaras/muster/internal/termbridge"
)

// Close codes the daemon initiates on a terminal socket (docs/protocol.md §6).
const (
	closeSuperseded websocket.StatusCode = 4000
	closePaneEnded  websocket.StatusCode = 4001
)

// Resize clamps (docs/protocol.md §6).
const (
	minResizeCols = 20
	maxResizeCols = 500
	minResizeRows = 5
	maxResizeRows = 300
)

// terminalReadBufSize bounds one PTY->socket binary frame. tmux output arrives in
// bursts well under this; a larger read just means fewer, bigger frames.
const terminalReadBufSize = 32 * 1024

// terminalConn is one live terminal socket's paired WS connection and PTY bridge, held
// by the takeover registry so a superseding connect can tear both down before its own
// attach starts (REQ-2).
type terminalConn struct {
	ws     *websocket.Conn
	bridge *termbridge.Bridge
}

// terminalRegistry enforces the one-live-client law (INV-1, protocol §6): at most one
// open terminal socket per session. A new connection supersedes (close code 4000) and
// tears down the old PTY before its own attach begins.
type terminalRegistry struct {
	mu    sync.Mutex
	conns map[int64]*terminalConn
}

func newTerminalRegistry() *terminalRegistry {
	return &terminalRegistry{conns: make(map[int64]*terminalConn)}
}

// takeover evicts whatever connection is currently registered for sessionID — closing
// its socket (4000 superseded) and tearing down its PTY — and, still holding the
// registry lock, calls attach to build the replacement and installs it. Holding the lock
// across both steps (not just around the map swap) is what actually delivers REQ-2's
// "old PTY torn down before the new attach starts": the previous version evicted and
// installed atomically but ran the new termbridge.Attach *after* releasing the lock and
// after already being installed, so a slow attach let two PTYs/tmux clients coexist on
// the session for its duration (review.md Major 1). It also serializes two concurrent
// connects for the same sessionID, so a second evict can never race a first attach that
// hasn't registered yet.
func (r *terminalRegistry) takeover(ctx context.Context, sessionID int64, attach func(context.Context) (*terminalConn, error)) (*terminalConn, error) {
	r.mu.Lock()
	defer r.mu.Unlock()

	if old := r.conns[sessionID]; old != nil {
		delete(r.conns, sessionID)
		_ = old.ws.Close(closeSuperseded, "superseded")
		_ = old.bridge.Close()
	}

	conn, err := attach(ctx)
	if err != nil {
		return nil, err
	}
	r.conns[sessionID] = conn
	return conn, nil
}

// release removes conn from the registry iff it is still the registered connection for
// sessionID (a later takeover may already have replaced it).
func (r *terminalRegistry) release(sessionID int64, conn *terminalConn) {
	r.mu.Lock()
	defer r.mu.Unlock()
	if r.conns[sessionID] == conn {
		delete(r.conns, sessionID)
	}
}

// closeAll closes every live terminal socket (daemon shutdown — normal close 1001,
// protocol §6) and clears the map, so a takeover racing shutdown can't re-close an
// already-closed conn it still thinks is live (review.md Minor 3).
func (r *terminalRegistry) closeAll() {
	r.mu.Lock()
	conns := r.conns
	r.conns = make(map[int64]*terminalConn)
	r.mu.Unlock()

	for _, c := range conns {
		_ = c.ws.Close(websocket.StatusNormalClosure, "musterd shutting down")
		_ = c.bridge.Close()
	}
}

// resizeFrame is the only client->server JSON on this socket (docs/protocol.md §6).
type resizeFrame struct {
	Type string `json:"type"`
	Cols int    `json:"cols"`
	Rows int    `json:"rows"`
}

func clampInt(v, lo, hi int) int {
	if v < lo {
		return lo
	}
	if v > hi {
		return hi
	}
	return v
}

// handleTerminal is GET /ws/terminal/{id} (docs/protocol.md §6): pre-upgrade auth (the
// requireCookie wrapper) and Origin check (websocket.Accept's own default), 404/409
// validation, takeover, and the two byte pumps.
func (s *Server) handleTerminal(w http.ResponseWriter, r *http.Request) {
	id, err := strconv.ParseInt(r.PathValue("id"), 10, 64)
	if err != nil {
		writeJSONError(w, http.StatusNotFound, "not_found", "unknown session id")
		return
	}
	sess, ok := s.manager.Get(id)
	if !ok {
		writeJSONError(w, http.StatusNotFound, "not_found", "unknown session id")
		return
	}
	if !sess.Alive {
		writeJSONError(w, http.StatusConflict, "not_attachable", "session is not alive")
		return
	}

	c, err := websocket.Accept(w, r, nil)
	if err != nil {
		s.log.Info().Err(err).Msg("terminal ws upgrade rejected")
		return
	}
	defer func() { _ = c.CloseNow() }()

	// takeover evicts any prior connection for this session (closing its socket and PTY)
	// before attach runs, so the old PTY is gone before the new attach starts (REQ-2,
	// Major 1) — see terminalRegistry.takeover's doc comment.
	conn, err := s.terminals.takeover(r.Context(), id, func(attachCtx context.Context) (*terminalConn, error) {
		bridge, aerr := termbridge.Attach(attachCtx, s.tmuxClient, sess.TmuxTarget)
		if aerr != nil {
			return nil, aerr
		}
		return &terminalConn{ws: c, bridge: bridge}, nil
	})
	if err != nil {
		s.log.Error().Err(err).Int64("session_id", id).Str("tmux_target", sess.TmuxTarget).Msg("attaching terminal bridge failed")
		_ = c.Close(websocket.StatusInternalError, "attach failed")
		return
	}
	bridge := conn.bridge
	defer func() { _ = bridge.Close() }()
	defer s.terminals.release(id, conn)

	ctx, cancel := context.WithCancel(r.Context())
	defer cancel()

	ptyDone := make(chan struct{})
	go func() {
		defer close(ptyDone)
		defer cancel()
		s.pumpPTYToSocket(ctx, c, bridge, id)
	}()

	s.pumpSocketToPTY(ctx, c, bridge)
	// The client side is gone (socket closed by the peer, or ctx canceled for another
	// reason such as shutdown): cancel ctx *before* closing the bridge, so
	// pumpPTYToSocket's ctx.Err() check below recognizes the read error this produces as
	// teardown rather than a real pane death, then close the bridge so its still-blocked
	// bridge.Read unblocks now instead of leaking the PTY and tmux attach client until
	// the pane happens to emit output on its own (review.md Critical 4). Bridge.Close
	// kills the attach process, which is what actually unblocks a pending PTY read on
	// macOS — closing the PTY file alone does not (measured: a bare pty.Close() left a
	// concurrent blocked Read still blocked after 2s; adding Process.Kill()+Wait(), which
	// Bridge.Close already does, unblocked it with io.EOF in 5/5 runs).
	cancel()
	_ = bridge.Close()
	<-ptyDone
}

// pumpPTYToSocket streams raw PTY output to the client verbatim (protocol §6) until EOF
// or the socket dies. A clean EOF (tmux pane gone) closes with 4001 and nudges the
// liveness poll (REQ-6) rather than waiting out the ~5s interval.
func (s *Server) pumpPTYToSocket(ctx context.Context, c *websocket.Conn, bridge *termbridge.Bridge, sessionID int64) {
	buf := make([]byte, terminalReadBufSize)
	for {
		n, err := bridge.Read(buf)
		if n > 0 {
			if werr := c.Write(ctx, websocket.MessageBinary, buf[:n]); werr != nil {
				return
			}
		}
		if err != nil {
			if ctx.Err() != nil {
				// ctx was already canceled by handleTerminal's own teardown (the client
				// side went away and it closed the bridge to unblock this Read — Critical
				// 4) before this read error occurred. That makes this read error a
				// teardown artifact, not a real pane death: no 4001 (the socket is
				// already gone from the client's perspective) and no Nudge (a live
				// session must never get a spurious liveness flap because its viewer
				// merely navigated away).
				s.log.Debug().Err(err).Int64("session_id", sessionID).Msg("terminal pty read ended by local teardown")
				return
			}
			if errors.Is(err, io.EOF) {
				_ = c.Close(closePaneEnded, "pane_ended")
				// context.WithoutCancel: closing the socket here unblocks the sibling
				// pumpSocketToPTY goroutine's blocked Read, which returns and cancels
				// the shared ctx almost immediately — racing (and normally beating) this
				// Nudge's in-flight tmux list-panes call. The nudge must outlive that
				// teardown race, same pattern as sessions.go's rollback.
				s.manager.Nudge(context.WithoutCancel(ctx), sessionID)
			} else {
				s.log.Debug().Err(err).Int64("session_id", sessionID).Msg("terminal pty read ended")
			}
			return
		}
	}
}

// pumpSocketToPTY reads client frames until the socket closes: binary frames are raw
// input bytes, text frames are resize control frames; anything unparseable/unknown is
// ignored and logged, never fatal (Edge Case 9).
func (s *Server) pumpSocketToPTY(ctx context.Context, c *websocket.Conn, bridge *termbridge.Bridge) {
	for {
		msgType, data, err := c.Read(ctx)
		if err != nil {
			return
		}
		switch msgType {
		case websocket.MessageBinary:
			if _, werr := bridge.Write(data); werr != nil {
				s.log.Debug().Err(werr).Msg("terminal pty write failed")
				return
			}
		case websocket.MessageText:
			s.applyResizeFrame(ctx, bridge, data)
		}
	}
}

// maxLoggedFrameLen caps how much of an unparseable text frame's raw bytes ever reach a
// log line (review.md Minor 6). Keystrokes travel as binary frames and are never logged;
// this is the one place client-supplied bytes reach a log line at all, so even though a
// resize frame is not sensitive payload today, capping it keeps that true by default
// rather than by accident.
const maxLoggedFrameLen = 200

// applyResizeFrame parses and clamps one resize control frame, applying it via
// Bridge.Resize (pty.Setsize then tmux resize-window — FINDINGS §7(d)). An unparseable
// or unknown text frame is ignored and logged, never fatal (Edge Case 9).
func (s *Server) applyResizeFrame(ctx context.Context, bridge *termbridge.Bridge, data []byte) {
	var frame resizeFrame
	if err := json.Unmarshal(data, &frame); err != nil || frame.Type != "resize" {
		logged := data
		if len(logged) > maxLoggedFrameLen {
			logged = logged[:maxLoggedFrameLen]
		}
		s.log.Debug().Err(err).Str("frame", string(logged)).Msg("ignoring unparseable/unknown terminal text frame")
		return
	}
	cols := clampInt(frame.Cols, minResizeCols, maxResizeCols)
	rows := clampInt(frame.Rows, minResizeRows, maxResizeRows)
	if err := bridge.Resize(ctx, cols, rows); err != nil {
		s.log.Warn().Err(err).Msg("terminal resize failed")
	}
}
