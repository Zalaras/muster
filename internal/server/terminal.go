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
	"github.com/rs/zerolog"

	"github.com/Zalaras/muster/internal/session"
)

// paneConn is the consumer-side view of a live terminal bridge — exactly the set this
// file calls on one (Read, Write, Resize, Close). *termbridge.Bridge satisfies it
// without knowing; a test fakes it directly instead of holding a live PTY.
type paneConn interface {
	io.ReadWriter
	Resize(ctx context.Context, cols, rows int) error
	Close() error
}

// attachFunc opens a paneConn onto a tmux target. The seam exists because
// termbridge.Attach takes *tmux.Client concretely and returns *termbridge.Bridge, which
// a test cannot fabricate (it holds a live PTY) — attachFunc returns the paneConn
// interface instead.
type attachFunc func(ctx context.Context, target string) (paneConn, error)

// Close codes the daemon initiates on a terminal socket (kb:anchor/terminal.ws).
const (
	closeSuperseded websocket.StatusCode = 4000
	closePaneEnded  websocket.StatusCode = 4001
)

// Resize clamps (kb:anchor/terminal.ws).
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
	bridge paneConn
}

// terminalSurface distinguishes a session's Claude pane from its plain-shell surface
// (kb:anchor/sessions.shell / kb:anchor/terminal.shell-ws): the two are different attach targets ("muster-<id>" vs
// "muster-<id>-shell"), so the one-live-client law (INV-3) is enforced per (session,
// surface), not per session alone.
type terminalSurface int

const (
	surfaceClaude terminalSurface = iota
	surfaceShell
)

// terminalKey identifies one attach target's slot in terminalRegistry.
type terminalKey struct {
	sessionID int64
	surface   terminalSurface
}

// terminalRegistry enforces the one-live-client law (INV-1/INV-3, kb:anchor/terminal.ws / kb:anchor/terminal.shell-ws): at
// most one open terminal socket per (session, surface). A new connection supersedes
// (close code 4000) and tears down the old PTY before its own attach begins; a session's
// Claude socket and its shell socket are independent keys and never supersede each
// other. It is shared: terminalFeature (Claude surface) and shellFeature (shell surface)
// both take a pointer to the same instance, and sessionsFeature closes entries out of it
// on End/Remove — one registry, three consumers, exactly one map (Implementation Notes).
type terminalRegistry struct {
	mu    sync.Mutex
	conns map[terminalKey]*terminalConn
}

func newTerminalRegistry() *terminalRegistry {
	return &terminalRegistry{conns: make(map[terminalKey]*terminalConn)}
}

// takeover evicts whatever connection is currently registered for key — closing
// its socket (4000 superseded) and tearing down its PTY — and, still holding the
// registry lock, calls attach to build the replacement and installs it. Holding the lock
// across both steps (not just around the map swap) is what actually delivers REQ-2's
// "old PTY torn down before the new attach starts": the previous version evicted and
// installed atomically but ran the new termbridge.Attach *after* releasing the lock and
// after already being installed, so a slow attach let two PTYs/tmux clients coexist on
// the session for its duration (review.md Major 1). It also serializes two concurrent
// connects for the same key, so a second evict can never race a first attach that
// hasn't registered yet.
func (r *terminalRegistry) takeover(ctx context.Context, key terminalKey, attach func(context.Context) (*terminalConn, error)) (*terminalConn, error) {
	r.mu.Lock()
	defer r.mu.Unlock()

	if old := r.conns[key]; old != nil {
		delete(r.conns, key)
		_ = old.ws.Close(closeSuperseded, "superseded")
		_ = old.bridge.Close()
	}

	conn, err := attach(ctx)
	if err != nil {
		return nil, err
	}
	r.conns[key] = conn
	return conn, nil
}

// release removes conn from the registry iff it is still the registered connection for
// key (a later takeover may already have replaced it).
func (r *terminalRegistry) release(key terminalKey, conn *terminalConn) {
	r.mu.Lock()
	defer r.mu.Unlock()
	if r.conns[key] == conn {
		delete(r.conns, key)
	}
}

// closeSurface closes key's live terminal socket, if any, with 4001 pane_ended. A no-op
// when no socket is open for key.
func (r *terminalRegistry) closeSurface(key terminalKey) {
	r.mu.Lock()
	conn := r.conns[key]
	if conn != nil {
		delete(r.conns, key)
	}
	r.mu.Unlock()
	if conn == nil {
		return
	}
	_ = conn.ws.Close(closePaneEnded, "pane_ended")
	_ = conn.bridge.Close()
}

// closeSession closes sessionID's live Claude terminal socket, if any, with 4001
// pane_ended — End's pre-kill step (closing here first means the UI's dead-surface
// overlay arrives ahead of the alive:false sessionUpsert). Deliberately leaves the shell
// socket alone (REQ-9: ending a session does not touch its shell).
func (r *terminalRegistry) closeSession(sessionID int64) {
	r.closeSurface(terminalKey{sessionID: sessionID, surface: surfaceClaude})
}

// closeSessionAndShell closes both sessionID's Claude and shell terminal sockets — the
// Remove path (REQ-9: removing a session kills its shell alongside the Claude one).
func (r *terminalRegistry) closeSessionAndShell(sessionID int64) {
	r.closeSurface(terminalKey{sessionID: sessionID, surface: surfaceClaude})
	r.closeSurface(terminalKey{sessionID: sessionID, surface: surfaceShell})
}

// closeAll closes every live terminal socket (daemon shutdown — normal close 1001,
// kb:anchor/terminal.ws) and clears the map, so a takeover racing shutdown can't re-close an
// already-closed conn it still thinks is live.
func (r *terminalRegistry) closeAll() {
	r.mu.Lock()
	conns := r.conns
	r.conns = make(map[terminalKey]*terminalConn)
	r.mu.Unlock()

	for _, c := range conns {
		_ = c.ws.Close(websocket.StatusNormalClosure, "musterd shutting down")
		_ = c.bridge.Close()
	}
}

// resizeFrame is the only client->server JSON on this socket (kb:anchor/terminal.ws).
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

// terminalFeature owns the Claude-surface terminal socket: GET /ws/terminal/{id}
// (plan code-breakup REQ-6). registry is shared with shellFeature (the shell surface)
// and sessionsFeature (End/Remove's socket teardown) — see terminalRegistry's doc
// comment.
type terminalFeature struct {
	registry *terminalRegistry
	manager  *session.Manager
	attach   attachFunc
	log      zerolog.Logger
}

func newTerminalFeature(registry *terminalRegistry, manager *session.Manager, attach attachFunc, log zerolog.Logger) *terminalFeature {
	return &terminalFeature{registry: registry, manager: manager, attach: attach, log: log}
}

func (f *terminalFeature) mount(mux *http.ServeMux, guard func(http.Handler) http.Handler) {
	mux.Handle("GET /ws/terminal/{id}", guard(http.HandlerFunc(f.handleTerminal)))
}

// closeAll closes every live terminal socket (both surfaces — the registry is shared),
// exposed for Server.Shutdown.
func (f *terminalFeature) closeAll() {
	f.registry.closeAll()
}

// handleTerminal is GET /ws/terminal/{id} (kb:anchor/terminal.ws): pre-upgrade auth (the
// requireCookie wrapper) and Origin check (websocket.Accept's own default), 404/409
// validation, takeover, and the two byte pumps.
func (f *terminalFeature) handleTerminal(w http.ResponseWriter, r *http.Request) {
	id, err := strconv.ParseInt(r.PathValue("id"), 10, 64)
	if err != nil {
		writeJSONError(w, http.StatusNotFound, "not_found", "unknown session id")
		return
	}
	sess, ok := f.manager.Get(id)
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
		f.log.Info().Err(err).Msg("terminal ws upgrade rejected")
		return
	}
	defer func() { _ = c.CloseNow() }()

	// takeover evicts any prior connection for this session's Claude surface (closing its
	// socket and PTY) before attach runs, so the old PTY is gone before the new attach
	// starts (REQ-2) — see terminalRegistry.takeover's doc comment.
	key := terminalKey{sessionID: id, surface: surfaceClaude}
	conn, err := f.registry.takeover(r.Context(), key, func(attachCtx context.Context) (*terminalConn, error) {
		bridge, aerr := f.attach(attachCtx, sess.TmuxTarget)
		if aerr != nil {
			return nil, aerr
		}
		return &terminalConn{ws: c, bridge: bridge}, nil
	})
	if err != nil {
		f.log.Error().Err(err).Int64("session_id", id).Str("tmux_target", sess.TmuxTarget).Msg("attaching terminal bridge failed")
		_ = c.Close(websocket.StatusInternalError, "attach failed")
		return
	}
	bridge := conn.bridge
	defer func() { _ = bridge.Close() }()
	defer f.registry.release(key, conn)

	ctx, cancel := context.WithCancel(r.Context())
	defer cancel()

	ptyDone := make(chan struct{})
	go func() {
		defer close(ptyDone)
		defer cancel()
		// nudge is set: a Claude pane's death is its session's death (REQ-6) — a clean
		// PTY EOF here nudges the liveness poll rather than waiting out the ~5s interval.
		pumpPTYToSocket(ctx, f.log, c, bridge, id, true, f.manager.Nudge)
	}()

	pumpSocketToPTY(ctx, f.log, c, bridge)
	// The client side is gone (socket closed by the peer, or ctx canceled for another
	// reason such as shutdown): cancel ctx *before* closing the bridge, so
	// pumpPTYToSocket's ctx.Err() check below recognizes the read error this produces as
	// teardown rather than a real pane death, then close the bridge so its still-blocked
	// bridge.Read unblocks now instead of leaking the PTY and tmux attach client until
	// the pane happens to emit output on its own. Bridge.Close kills the attach process,
	// which is what actually unblocks a pending PTY read on macOS — closing the PTY file
	// alone does not (measured: a bare pty.Close() left a concurrent blocked Read still
	// blocked after 2s; adding Process.Kill()+Wait(), which Bridge.Close already does,
	// unblocked it with io.EOF in 5/5 runs).
	cancel()
	_ = bridge.Close()
	<-ptyDone
}

// pumpPTYToSocket streams raw PTY output to the client verbatim (kb:anchor/terminal.ws / kb:anchor/terminal.shell-ws) until
// EOF or the socket dies. A clean EOF (tmux pane gone) always closes with 4001; it calls
// nudge only when nudgeOnEOF is true (the Claude surface, REQ-6) — a shell surface's EOF
// (kb:anchor/terminal.shell-ws) must never nudge its session's liveness (a shell's death is not its session's
// death), so shellFeature passes nudgeOnEOF=false and a nil nudge.
func pumpPTYToSocket(ctx context.Context, log zerolog.Logger, c *websocket.Conn, bridge paneConn, sessionID int64, nudgeOnEOF bool, nudge func(context.Context, int64)) {
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
				// ctx was already canceled by the handler's own teardown (the client side
				// went away and it closed the bridge to unblock this Read) before this
				// read error occurred. That makes this read error a teardown artifact, not
				// a real pane death: no 4001 (the socket is already gone from the
				// client's perspective) and no nudge (a live session must never get a
				// spurious liveness flap because its viewer merely navigated away).
				log.Debug().Err(err).Int64("session_id", sessionID).Msg("terminal pty read ended by local teardown")
				return
			}
			if errors.Is(err, io.EOF) {
				_ = c.Close(closePaneEnded, "pane_ended")
				if nudgeOnEOF && nudge != nil {
					// context.WithoutCancel: closing the socket here unblocks the sibling
					// pumpSocketToPTY goroutine's blocked Read, which returns and cancels
					// the shared ctx almost immediately — racing (and normally beating)
					// this nudge's in-flight tmux list-panes call. The nudge must outlive
					// that teardown race, same pattern as sessions.go's rollback.
					nudge(context.WithoutCancel(ctx), sessionID)
				}
			} else {
				log.Debug().Err(err).Int64("session_id", sessionID).Msg("terminal pty read ended")
			}
			return
		}
	}
}

// pumpSocketToPTY reads client frames until the socket closes: binary frames are raw
// input bytes, text frames are resize control frames; anything unparseable/unknown is
// ignored and logged, never fatal.
func pumpSocketToPTY(ctx context.Context, log zerolog.Logger, c *websocket.Conn, bridge paneConn) {
	for {
		msgType, data, err := c.Read(ctx)
		if err != nil {
			return
		}
		switch msgType {
		case websocket.MessageBinary:
			if _, werr := bridge.Write(data); werr != nil {
				log.Debug().Err(werr).Msg("terminal pty write failed")
				return
			}
		case websocket.MessageText:
			applyResizeFrame(ctx, log, bridge, data)
		}
	}
}

// maxLoggedFrameLen caps how much of an unparseable text frame's raw bytes ever reach a
// log line. Keystrokes travel as binary frames and are never logged; this is the one
// place client-supplied bytes reach a log line at all, so even though a resize frame is
// not sensitive payload today, capping it keeps that true by default rather than by
// accident.
const maxLoggedFrameLen = 200

// applyResizeFrame parses and clamps one resize control frame, applying it via
// Bridge.Resize (pty.Setsize then tmux resize-window — FINDINGS §7(d)). An unparseable
// or unknown text frame is ignored and logged, never fatal.
func applyResizeFrame(ctx context.Context, log zerolog.Logger, bridge paneConn, data []byte) {
	var frame resizeFrame
	if err := json.Unmarshal(data, &frame); err != nil || frame.Type != "resize" {
		logged := data
		if len(logged) > maxLoggedFrameLen {
			logged = logged[:maxLoggedFrameLen]
		}
		log.Debug().Err(err).Str("frame", string(logged)).Msg("ignoring unparseable/unknown terminal text frame")
		return
	}
	cols := clampInt(frame.Cols, minResizeCols, maxResizeCols)
	rows := clampInt(frame.Rows, minResizeRows, maxResizeRows)
	if err := bridge.Resize(ctx, cols, rows); err != nil {
		log.Warn().Err(err).Msg("terminal resize failed")
	}
}
