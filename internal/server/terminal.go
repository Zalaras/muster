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

	"github.com/Zalaras/muster/internal/keyedlock"
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
// attach starts.
type terminalConn struct {
	ws     *websocket.Conn
	bridge paneConn
}

// terminalSurface distinguishes a session's Claude pane from its plain-shell surface
// (kb:anchor/sessions.shell / kb:anchor/terminal.shell-ws): the two are different attach targets ("muster-<id>" vs
// "muster-<id>-shell"), so the one-live-client law
// (kb:adr/surfaces-one-live-client-per-attach-target) is enforced per (session, surface),
// not per session alone.
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

// terminalRegistry enforces the one-live-client law
// (kb:adr/surfaces-one-live-client-per-attach-target, kb:anchor/terminal.ws /
// kb:anchor/terminal.shell-ws): at most one open terminal socket per (session, surface).
// A new connection supersedes (close code 4000) and tears down the old PTY before its
// own attach begins; a session's Claude socket and its shell socket are independent keys
// and never supersede each other. It is shared: terminalFeature (Claude surface) and
// shellFeature (shell surface) both take a pointer to the same instance, and
// sessionsFeature closes entries out of it on End/Remove — one registry, three
// consumers, exactly one map.
//
// Two separate guards, never nested in the other order: keyLocks serialises one key's
// whole takeover — including the old socket's Close and the new attach's I/O — so a
// second evict can never race a first attach that hasn't registered yet; mu guards only
// conns/closed reads/writes and is never held across that I/O. session.Manager.Apply calls
// Watched (below) while holding session.Manager.mu, so a takeover that instead held mu
// across a slow peer's close handshake would stall every session read in the daemon for as
// long as that handshake takes — Watched must only ever need mu's brief hold, never
// keyLocks'.
//
// closed is set once by closeAll (daemon shutdown) and checked by takeover both before and
// after its attach call: a takeover already past the first check when closeAll runs finishes
// its attach and is caught by the second check, so a connection can never be installed into
// conns after closeAll has run — it is instead closed with the same shutdown code closeAll
// used.
type terminalRegistry struct {
	keyLocks keyedlock.Locks[terminalKey]

	mu     sync.Mutex
	conns  map[terminalKey]*terminalConn
	closed bool
}

func newTerminalRegistry() *terminalRegistry {
	return &terminalRegistry{conns: make(map[terminalKey]*terminalConn)}
}

// errRegistryClosed is takeover's sentinel for "closeAll has already run" — attachAndPump
// treats it as teardown, not an attach failure worth logging, and is what actually gives
// the refused socket its shutdown close frame: takeover's first check returns it before
// attach ever runs, so the accepted *websocket.Conn is still only known to attachAndPump's
// own scope at that point; takeover's second check (below) already closed the socket
// itself once attach has built it, so attachAndPump's own close on that path is a no-op
// against an already-closed conn (coder/websocket: "Additional calls to Close are
// no-ops"). Either way, attachAndPump closing on this sentinel is what guarantees the
// socket never lingers with no close frame at all.
var errRegistryClosed = errors.New("terminal registry closed")

// closeShutdown closes ws with the daemon-shutdown normal-close code — the one
// implementation shared by takeover's second closed check, closeAll's teardown loop, and
// attachAndPump's errRegistryClosed handling (kb:anchor/terminal.ws).
func closeShutdown(ws *websocket.Conn) {
	_ = ws.Close(websocket.StatusNormalClosure, "musterd shutting down")
}

// takeover evicts whatever connection is currently registered for key — closing its
// socket (4000 superseded) and tearing down its PTY — then calls attach to build the
// replacement and installs it. keyLocks' per-key lock is held across the whole sequence
// (not just the map swap), which is what actually delivers the guarantee that the old PTY
// is torn down before the new attach starts. It also serializes two concurrent connects for
// the same key, so a second evict can never race a first attach that hasn't registered yet.
// mu itself is only ever held for the map read/write on either side of that I/O — a Watched
// call concurrent with a takeover in progress briefly sees no entry for key rather than
// blocking until the takeover finishes.
//
// closed is checked twice: once before evicting (a takeover starting after closeAll has
// nothing to evict and nothing to attach for), and once more after attach returns, since
// closeAll can run while this call's own attach is still in flight — that second check is
// what keeps a slow attach from installing a connection closeAll will never know to close.
func (r *terminalRegistry) takeover(ctx context.Context, key terminalKey, attach func(context.Context) (*terminalConn, error)) (*terminalConn, error) {
	unlock := r.keyLocks.Lock(key)
	defer unlock()

	r.mu.Lock()
	if r.closed {
		r.mu.Unlock()
		return nil, errRegistryClosed
	}
	old := r.conns[key]
	delete(r.conns, key)
	r.mu.Unlock()

	if old != nil {
		_ = old.ws.Close(closeSuperseded, "superseded")
		_ = old.bridge.Close()
	}

	conn, err := attach(ctx)
	if err != nil {
		return nil, err
	}

	r.mu.Lock()
	if r.closed {
		r.mu.Unlock()
		closeShutdown(conn.ws)
		_ = conn.bridge.Close()
		return nil, errRegistryClosed
	}
	r.conns[key] = conn
	r.mu.Unlock()
	return conn, nil
}

// Watched satisfies internal/session.Watcher
// (kb:adr/rail-unread-inferred-from-live-terminal-client): true iff a connection is
// currently registered for sessionID on either surface — the Claude terminal or the
// plain shell.
func (r *terminalRegistry) Watched(sessionID int64) bool {
	r.mu.Lock()
	defer r.mu.Unlock()
	_, claude := r.conns[terminalKey{sessionID: sessionID, surface: surfaceClaude}]
	_, shell := r.conns[terminalKey{sessionID: sessionID, surface: surfaceShell}]
	return claude || shell
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
// socket alone: ending a session does not touch its shell
// (kb:adr/surfaces-shell-dies-at-kill-shutdown-too).
func (r *terminalRegistry) closeSession(sessionID int64) {
	r.closeSurface(terminalKey{sessionID: sessionID, surface: surfaceClaude})
}

// closeSessionAndShell closes both sessionID's Claude and shell terminal sockets — the
// Remove path (removing a session kills its shell alongside the Claude one,
// kb:adr/surfaces-shell-dies-at-kill-shutdown-too).
func (r *terminalRegistry) closeSessionAndShell(sessionID int64) {
	r.closeSurface(terminalKey{sessionID: sessionID, surface: surfaceClaude})
	r.closeSurface(terminalKey{sessionID: sessionID, surface: surfaceShell})
}

// closeAll closes every live terminal socket (daemon shutdown — normal close 1001,
// kb:anchor/terminal.ws), clears the map, and marks the registry closed — so a takeover
// racing shutdown can't re-close an already-closed conn it still thinks is live, and a
// takeover whose attach finishes after this point closes its new connection instead of
// installing it (see takeover's own doc comment).
func (r *terminalRegistry) closeAll() {
	r.mu.Lock()
	conns := r.conns
	r.conns = make(map[terminalKey]*terminalConn)
	r.closed = true
	r.mu.Unlock()

	for _, c := range conns {
		closeShutdown(c.ws)
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

// terminalFeature owns the Claude-surface terminal socket: GET /ws/terminal/{id}.
// registry is shared with shellFeature (the shell surface) and sessionsFeature
// (End/Remove's socket teardown) — see terminalRegistry's doc comment.
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
// validation, then the attach-and-pump lifecycle both surfaces share (attachAndPump).
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

	attachAndPump(w, r, f.log, f.registry, f.manager, id, f.attach, terminalPump{
		target: sess.TmuxTarget,
		key:    terminalKey{sessionID: id, surface: surfaceClaude},
		// nudge is set: a Claude pane's death is its session's death
		// (kb:adr/lifecycle-liveness-from-pane-existence) — a clean PTY EOF nudges the
		// liveness poll rather than waiting out the ~5s interval.
		nudge: f.manager.Nudge,
		socketToPTY: func(ctx context.Context, c *websocket.Conn, bridge paneConn) {
			pumpSocketToPTY(ctx, f.log, c, bridge)
		},
	})
}

// terminalPump is one surface's half of attachAndPump: the tmux target to attach, its
// registry slot, whether a clean PTY EOF should nudge the session's liveness poll (nil:
// never — the shell surface's death is not its session's death, kb:anchor/terminal.shell-ws), and
// how that surface reads client frames off the socket.
type terminalPump struct {
	target      string
	key         terminalKey
	nudge       func(context.Context, int64)
	socketToPTY func(ctx context.Context, c *websocket.Conn, bridge paneConn)
}

// attachAndPump is the terminal-socket lifecycle shared by the Claude surface
// (terminalFeature.handleTerminal) and the shell surface (shellFeature.handleShellTerminal):
// Accept, takeover with an attach closure (evicting whatever was previously registered for
// p.key before the new attach starts — see terminalRegistry.takeover's doc comment),
// MarkSeen, the PTY->socket pump running in the background, the surface's own socket->PTY
// pump, then teardown in the order pumpPTYToSocket's ctx.Err() check depends on.
func attachAndPump(w http.ResponseWriter, r *http.Request, log zerolog.Logger, registry *terminalRegistry, manager *session.Manager, sessionID int64, attach attachFunc, p terminalPump) {
	c, err := websocket.Accept(w, r, nil)
	if err != nil {
		log.Info().Err(err).Msg("terminal ws upgrade rejected")
		return
	}
	defer func() { _ = c.CloseNow() }()

	conn, err := registry.takeover(r.Context(), p.key, func(attachCtx context.Context) (*terminalConn, error) {
		bridge, aerr := attach(attachCtx, p.target)
		if aerr != nil {
			return nil, aerr
		}
		return &terminalConn{ws: c, bridge: bridge}, nil
	})
	if err != nil {
		if errors.Is(err, errRegistryClosed) {
			// takeover refused before attach ever ran (closeAll had already run), so c
			// has never been closed by anything yet — give it the shutdown close frame
			// here. If instead takeover's second check is what produced this error, it
			// already closed c itself; this call is then a no-op against an
			// already-closed conn (coder/websocket: "Additional calls to Close are
			// no-ops"), which is safe either way this sentinel was reached.
			closeShutdown(c)
			return
		}
		log.Error().Err(err).Int64("session_id", sessionID).Str("tmux_target", p.target).Msg("attaching terminal bridge failed")
		_ = c.Close(websocket.StatusInternalError, "attach failed")
		return
	}
	bridge := conn.bridge
	defer func() { _ = bridge.Close() }()
	defer registry.release(p.key, conn)

	// Marking the session seen on attach applies to both surfaces
	// (kb:adr/rail-unread-inferred-from-live-terminal-client): a successful takeover
	// marks the session seen, before any PTY byte is forwarded (kb:anchor/terminal.ws /
	// kb:anchor/terminal.shell-ws).
	if err := manager.MarkSeen(r.Context(), sessionID); err != nil {
		log.Warn().Err(err).Int64("session_id", sessionID).Msg("marking session seen failed")
	}

	ctx, cancel := context.WithCancel(r.Context())
	defer cancel()

	ptyDone := make(chan struct{})
	go func() {
		defer close(ptyDone)
		defer cancel()
		pumpPTYToSocket(ctx, log, c, bridge, sessionID, p.nudge != nil, p.nudge)
	}()

	p.socketToPTY(ctx, c, bridge)
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
// nudge only when nudgeOnEOF is true (the Claude surface,
// kb:adr/lifecycle-liveness-from-pane-existence) — a shell surface's EOF
// (kb:anchor/terminal.shell-ws) must never nudge its session's liveness (a shell's death
// is not its session's death, kb:adr/surfaces-one-live-client-per-attach-target), so
// shellFeature passes nudgeOnEOF=false and a nil nudge.
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
					// that teardown race, same pattern as launcher.go's rollback.
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

// logUnknownTextFrame logs one unparseable/unknown text frame at Debug, truncated to
// maxLoggedFrameLen — shared by applyResizeFrame (kb:anchor/terminal.ws) and
// applyShellTextFrame (kb:anchor/terminal.shell-ws), which both treat this as "ignored,
// never fatal" — including a `scroll` frame arriving on the Claude socket.
func logUnknownTextFrame(log zerolog.Logger, data []byte, err error) {
	logged := data
	if len(logged) > maxLoggedFrameLen {
		logged = logged[:maxLoggedFrameLen]
	}
	log.Debug().Err(err).Str("frame", string(logged)).Msg("ignoring unparseable/unknown terminal text frame")
}

// applyResizeFrame parses and clamps one resize control frame, applying it via
// Bridge.Resize (pty.Setsize then tmux resize-window,
// kb:adr/surfaces-shared-attach-single-pty). An unparseable or unknown text frame is
// ignored and logged, never fatal — including a `scroll` frame, which decodes fine but
// has Type != "resize".
func applyResizeFrame(ctx context.Context, log zerolog.Logger, bridge paneConn, data []byte) {
	var frame resizeFrame
	if err := json.Unmarshal(data, &frame); err != nil || frame.Type != "resize" {
		logUnknownTextFrame(log, data, err)
		return
	}
	applyResize(ctx, log, bridge, frame.Cols, frame.Rows, "terminal resize failed")
}

// applyResize is the one resize implementation both applyResizeFrame (kb:anchor/terminal.ws)
// and the shell surface's "resize" case (applyShellTextFrame, kb:anchor/terminal.shell-ws)
// drive: clamp to the daemon's bounds and apply via Bridge.Resize (pty.Setsize then tmux
// resize-window). logMsg lets each surface keep its own warn wording.
func applyResize(ctx context.Context, log zerolog.Logger, bridge paneConn, cols, rows int, logMsg string) {
	cols = clampInt(cols, minResizeCols, maxResizeCols)
	rows = clampInt(rows, minResizeRows, maxResizeRows)
	if err := bridge.Resize(ctx, cols, rows); err != nil {
		log.Warn().Err(err).Msg(logMsg)
	}
}
