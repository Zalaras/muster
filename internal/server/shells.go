package server

import (
	"context"
	"encoding/json"
	"net/http"
	"os"
	"strconv"
	"strings"
	"unicode/utf8"

	"github.com/coder/websocket"
	"github.com/rs/zerolog"

	"github.com/Zalaras/muster/internal/session"
	"github.com/Zalaras/muster/internal/tmux"
)

// Scroll magnitude clamp (kb:anchor/terminal.shell-ws) — sign carries direction, so the
// clamp applies to the absolute value.
const (
	minScrollLines = 1
	maxScrollLines = 200
)

// shellScroller is the tmux copy-mode operations only the shell socket needs
// (kb:anchor/terminal.shell-ws, kb:adr/surfaces-shell-scroll-via-daemon-copy-mode).
// *tmux.Client satisfies it without knowing; a test fakes it directly. Both methods
// drive tmux's own process/mode tracking through its query API, never pane content
// (CLAUDE.md hard rule) — the same distinction internal/tmux.displayVar's doc comment
// draws for production callers.
type shellScroller interface {
	ScrollCopyMode(ctx context.Context, target string, lines int) (entered bool, err error)
	CancelCopyMode(ctx context.Context, target string) error
}

// createShellResponse is POST /api/sessions/{id}/shell's response body
// (kb:anchor/sessions.shell).
type createShellResponse struct {
	Target  string `json:"target"`
	N       int    `json:"n"`
	Created bool   `json:"created"`
	Rev     int64  `json:"rev"`
}

type newTerminalResponse struct {
	Target string `json:"target"`
	N      int    `json:"n"`
	Name   string `json:"name"`
	Rev    int64  `json:"rev"`
}

type terminalNameRequest struct {
	Name *string `json:"name"`
}

type terminalNameResponse struct {
	N    int    `json:"n"`
	Name string `json:"name"`
	Rev  int64  `json:"rev"`
}

type terminalClosedResponse struct {
	Rev int64 `json:"rev"`
}

type shellFeature struct {
	registry  *shellRegistry
	terminals *terminalRegistry
	manager   *session.Manager
	attach    attachFunc
	// scroll drives the `scroll` control frame's tmux copy-mode commands
	// (kb:anchor/terminal.shell-ws) — independent of registry.tmux (a narrower paneSpawner)
	// so a test can fake copy-mode behaviour without faking session spawning too.
	scroll  shellScroller
	changed func(context.Context)
	revFor  func(sessionID int64) int64
	log     zerolog.Logger
}

// newShellFeature builds the shell surface. scroll is already resolved — Config.ShellScroll
// when set, else the daemon's one real tmux client (New defaults every Config override
// whose fallback is another root-built object in the one place, alongside spawner/attach/
// httpClient).
func newShellFeature(registry *shellRegistry, terminals *terminalRegistry, manager *session.Manager, attach attachFunc, scroll shellScroller, changed func(context.Context), revFor func(int64) int64, log zerolog.Logger) *shellFeature {
	return &shellFeature{registry: registry, terminals: terminals, manager: manager, attach: attach, scroll: scroll, changed: changed, revFor: revFor, log: log}
}

func (f *shellFeature) mount(mux *http.ServeMux, guard func(http.Handler) http.Handler) {
	mux.Handle("POST /api/sessions/{id}/shell", guard(http.HandlerFunc(f.handleCreateShell)))
	mux.Handle("POST /api/sessions/{id}/shells", guard(http.HandlerFunc(f.handleNewTerminal)))
	mux.Handle("PUT /api/sessions/{id}/shells/{n}/name", guard(http.HandlerFunc(f.handleRenameTerminal)))
	mux.Handle("DELETE /api/sessions/{id}/shells/{n}", guard(http.HandlerFunc(f.handleCloseTerminal)))
	mux.Handle("GET /ws/shell/{id}/{n}", guard(http.HandlerFunc(f.handleShellTerminal)))
}

func parseTerminalN(r *http.Request) (int, bool) {
	n, err := strconv.Atoi(r.PathValue("n"))
	if err != nil || n < 1 {
		return 0, false
	}
	return n, true
}

func writeNoShell(w http.ResponseWriter) {
	writeJSONError(w, http.StatusNotFound, "no_shell", "no such terminal")
}

// spawnInSession is the guard both spawn handlers share. Deliberately not gated on alive
// (kb:adr/surfaces-shell-is-attach-target-not-session) — a terminal may be started on a
// dead session and never consults the manager's liveness field.
//
// The whole existence-check-then-spawn runs under id's session.Manager lock:
// session.Manager.Remove holds that same lock for its entire removal, so this check can
// never observe a session that a concurrent Remove is in the middle of dropping, and any
// Remove that starts after this check passes must wait for the spawn to finish first —
// either way, a terminal can never be spawned for an id whose Remove has started or already
// succeeded. spawn runs with the lock held and the session's directory. It reports whether
// spawn succeeded and the session id; on false the error response is already written.
func (f *shellFeature) spawnInSession(w http.ResponseWriter, r *http.Request, spawn func(ctx context.Context, id int64, dir string) error) (int64, bool) {
	id, ok := parseSessionID(w, r)
	if !ok {
		return 0, false
	}

	unlock := f.manager.LockSession(id)
	defer unlock()

	sess, ok := sessionOr404(w, f.manager, id)
	if !ok {
		return 0, false
	}
	if info, err := os.Stat(sess.Directory); err != nil || !info.IsDir() {
		writeDirectoryMissing(w, sess.Directory)
		return 0, false
	}

	ctx := context.WithoutCancel(r.Context())
	if err := spawn(ctx, id, sess.Directory); err != nil {
		f.log.Error().Err(err).Int64("session_id", id).Msg("spawning shell failed")
		writeJSONError(w, http.StatusInternalServerError, "shell_spawn_failed", msgShellSpawnFailed)
		return 0, false
	}
	f.changed(ctx)
	return id, true
}

func (f *shellFeature) handleCreateShell(w http.ResponseWriter, r *http.Request) {
	var resp createShellResponse
	id, ok := f.spawnInSession(w, r, func(ctx context.Context, id int64, dir string) (err error) {
		resp.Target, resp.N, resp.Created, err = f.registry.EnsureAny(ctx, id, dir)
		return err
	})
	if ok {
		resp.Rev = f.revFor(id)
		writeJSON(w, http.StatusOK, resp)
	}
}

func (f *shellFeature) handleNewTerminal(w http.ResponseWriter, r *http.Request) {
	var resp newTerminalResponse
	id, ok := f.spawnInSession(w, r, func(ctx context.Context, id int64, dir string) (err error) {
		resp.Target, resp.N, err = f.registry.New(ctx, id, dir)
		resp.Name = defaultTerminalName(resp.N)
		return err
	})
	if ok {
		resp.Rev = f.revFor(id)
		writeJSON(w, http.StatusCreated, resp)
	}
}

func (f *shellFeature) handleRenameTerminal(w http.ResponseWriter, r *http.Request) {
	id, ok := parseSessionID(w, r)
	if !ok {
		return
	}
	if _, found := sessionOr404(w, f.manager, id); !found {
		return
	}
	n, ok := parseTerminalN(r)
	if !ok {
		writeNoShell(w)
		return
	}
	var req terminalNameRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil || req.Name == nil {
		writeJSONError(w, http.StatusBadRequest, "bad_request", "invalid body")
		return
	}
	name := strings.TrimSpace(*req.Name)
	if utf8.RuneCountInString(name) > maxTerminalNameLen {
		writeJSONError(w, http.StatusBadRequest, "name_too_long", "a terminal name is at most 40 characters")
		return
	}

	ctx := context.WithoutCancel(r.Context())
	exists, err := f.registry.PaneExists(ctx, tmux.TerminalSessionName(id, n))
	if err != nil {
		f.log.Error().Err(err).Int64("session_id", id).Msg("checking terminal pane failed")
		writeJSONError(w, http.StatusInternalServerError, "internal_error", msgInternalError)
		return
	}
	if !exists {
		writeNoShell(w)
		return
	}
	f.registry.names.set(id, n, name)
	f.changed(ctx)
	writeJSON(w, http.StatusOK, terminalNameResponse{N: n, Name: f.registry.names.effective(id, n), Rev: f.revFor(id)})
}

func (f *shellFeature) handleCloseTerminal(w http.ResponseWriter, r *http.Request) {
	id, ok := parseSessionID(w, r)
	if !ok {
		return
	}
	if _, found := sessionOr404(w, f.manager, id); !found {
		return
	}
	n, ok := parseTerminalN(r)
	if !ok {
		writeNoShell(w)
		return
	}

	ctx := context.WithoutCancel(r.Context())
	f.terminals.closeSurface(terminalKey{sessionID: id, surface: surfaceShell, n: n})
	closed, err := f.registry.Close(ctx, id, n)
	if err != nil {
		f.log.Error().Err(err).Int64("session_id", id).Int("terminal", n).Msg("closing terminal failed")
		writeJSONError(w, http.StatusInternalServerError, "internal_error", msgInternalError)
		return
	}
	if !closed {
		writeNoShell(w)
		return
	}
	f.changed(ctx)
	writeJSON(w, http.StatusOK, terminalClosedResponse{Rev: f.revFor(id)})
}

// handleShellTerminal is GET /ws/shell/{id}/{n} (kb:anchor/terminal.shell-ws): pre-upgrade auth
// (the requireCookie wrapper) and Origin check, 404/409 validation, then the attach-and-pump
// lifecycle both surfaces share (attachAndPump). Attach only — the spawn handlers above are
// the only things that start a terminal; alive is not consulted, in either direction
// (kb:adr/surfaces-shell-is-attach-target-not-session).
// The 404 here is its own not_found check
// (manager.Exists, not sessionOr404's manager.Get) because a dead session with no live shell
// still answers no_shell, never not_found.
func (f *shellFeature) handleShellTerminal(w http.ResponseWriter, r *http.Request) {
	id, err := strconv.ParseInt(r.PathValue("id"), 10, 64)
	n, nOK := parseTerminalN(r)
	if err != nil || !nOK || !f.manager.Exists(id) {
		writeJSONError(w, http.StatusNotFound, "not_found", "unknown session id")
		return
	}
	shellTarget := tmux.TerminalSessionName(id, n)
	// Goes through the registry (bounded by shellTmuxTimeout) rather than f.registry.tmux
	// directly, matching every other tmux call this surface makes.
	exists, perr := f.registry.PaneExists(r.Context(), shellTarget)
	if perr != nil {
		f.log.Error().Err(perr).Int64("session_id", id).Msg("checking shell pane failed")
		writeJSONError(w, http.StatusInternalServerError, "internal_error", msgInternalError)
		return
	}
	if !exists {
		writeJSONError(w, http.StatusConflict, "no_shell", "terminal is not running")
		return
	}

	attachAndPump(w, r, f.log, f.terminals, f.manager, id, f.attach, terminalPump{
		target: shellTarget,
		key:    terminalKey{sessionID: id, surface: surfaceShell, n: n},
		nudge:  func(ctx context.Context, _ int64) { f.changed(ctx) },
		socketToPTY: func(ctx context.Context, c *websocket.Conn, bridge paneConn) {
			// The shell socket's own variant: decodes the `scroll` control frame the Claude
			// socket does not accept, and cancels copy-mode before writing input
			// (kb:adr/surfaces-shell-scroll-via-daemon-copy-mode).
			pumpShellSocketToPTY(ctx, f.log, c, bridge, f.scroll, shellTarget)
		},
	})
}

// shellTextFrame is the shell socket's client→server JSON: everything resizeFrame
// accepts, plus `scroll` (kb:anchor/terminal.shell-ws). The Claude socket keeps decoding
// into resizeFrame/applyResizeFrame unchanged — this type and pumpShellSocketToPTY below
// are reached only from GET /ws/shell/{id}.
type shellTextFrame struct {
	Type  string `json:"type"`
	Cols  int    `json:"cols"`
	Rows  int    `json:"rows"`
	Lines int    `json:"lines"`
}

// clampScrollLines clamps a scroll frame's magnitude to [minScrollLines,
// maxScrollLines] while preserving its sign; 0 stays 0 (nothing to scroll).
func clampScrollLines(v int) int {
	if v == 0 {
		return 0
	}
	sign, mag := 1, v
	if v < 0 {
		sign, mag = -1, -v
	}
	return sign * clampInt(mag, minScrollLines, maxScrollLines)
}

// pumpShellSocketToPTY is pumpSocketToPTY's shell-surface variant (kb:anchor/terminal.shell-ws):
// binary frames are raw input, but the daemon cancels copy-mode first when it knows this
// pane may still be in one (kb:adr/surfaces-shell-scroll-via-daemon-copy-mode), so a
// keystroke always reaches the shell and returns
// it to the live bottom; text frames add `scroll` to the resize frame pumpSocketToPTY
// already accepts. inCopyMode lives only in this one connection's read loop — never
// shared, so it needs no lock.
func pumpShellSocketToPTY(ctx context.Context, log zerolog.Logger, c *websocket.Conn, bridge paneConn, scroller shellScroller, target string) {
	inCopyMode := false
	for {
		msgType, data, err := c.Read(ctx)
		if err != nil {
			return
		}
		switch msgType {
		case websocket.MessageBinary:
			if inCopyMode {
				if cerr := scroller.CancelCopyMode(ctx, target); cerr != nil {
					log.Debug().Err(cerr).Msg("cancelling shell copy-mode before input failed")
				}
				inCopyMode = false
			}
			if _, werr := bridge.Write(data); werr != nil {
				log.Debug().Err(werr).Msg("shell terminal pty write failed")
				return
			}
		case websocket.MessageText:
			applyShellTextFrame(ctx, log, bridge, scroller, target, data, &inCopyMode)
		}
	}
}

// applyShellTextFrame parses one shell-socket text frame and dispatches resize or
// scroll; an unparseable or unknown frame is ignored and logged, never fatal, the same
// contract as applyResizeFrame. inCopyMode is set from ScrollCopyMode's own entered
// result, never assumed from a nil error — ScrollCopyMode's own "nothing to scroll to"
// no-op returns entered=false even though err is nil, and a `lines` of 0 after clamping
// (frame carried 0) never calls ScrollCopyMode at all.
func applyShellTextFrame(ctx context.Context, log zerolog.Logger, bridge paneConn, scroller shellScroller, target string, data []byte, inCopyMode *bool) {
	var frame shellTextFrame
	if err := json.Unmarshal(data, &frame); err != nil {
		logUnknownTextFrame(log, data, err)
		return
	}
	switch frame.Type {
	case "resize":
		applyResize(ctx, log, bridge, frame.Cols, frame.Rows, "shell terminal resize failed")
	case "scroll":
		lines := clampScrollLines(frame.Lines)
		if lines == 0 {
			return
		}
		entered, err := scroller.ScrollCopyMode(ctx, target, lines)
		if err != nil {
			log.Debug().Err(err).Msg("shell scroll failed")
			return
		}
		*inCopyMode = entered
	default:
		logUnknownTextFrame(log, data, nil)
	}
}
