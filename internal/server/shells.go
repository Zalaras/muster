package server

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"os"
	"strconv"
	"sync"
	"time"

	"github.com/coder/websocket"
	"github.com/rs/zerolog"

	"github.com/Zalaras/muster/internal/keyedlock"
	"github.com/Zalaras/muster/internal/session"
	"github.com/Zalaras/muster/internal/tmux"
)

// shellTmuxTimeout bounds every tmux invocation the shell surface makes
// (kb:adr/actions-serialized-per-session): unlike a Claude pane's tmux calls (which run
// under the HTTP request's own context), Ensure/Kill run with context.WithoutCancel and
// would otherwise wait on a wedged tmux forever — hanging End/Remove, which call Kill,
// right along with it.
const shellTmuxTimeout = 5 * time.Second

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

// shellRegistry is the plain-shell surface's daemon-lifetime record
// (kb:anchor/sessions.shell): a shell has no persistent representation anywhere — no SQLite row, no
// Session-object field, no write-only bookkeeping map either; PaneExists is the sole
// source of truth. A daemon restart forgets everything, which is safe because reconcile
// kills every "muster-<n>-shell" tmux session on the socket at startup
// (internal/session.Manager.Reconcile) rather than adopting one.
type shellRegistry struct {
	tmux paneSpawner
	log  zerolog.Logger

	// locks is the per-session-id lock (kb:adr/actions-serialized-per-session: two
	// sessions' Ensure/Kill calls never block each other); the check-then-spawn/kill
	// sequence itself is serialised by each id's own lock. The same keyedlock.Locks type
	// session.Manager.LockSession uses, rather than each package hand-rolling the same
	// map+mutex.
	locks keyedlock.Locks[int64]

	// mu guards activeIDs only.
	mu sync.Mutex
	// activeIDs is the set of session ids this daemon instance believes currently have
	// a shell — Ensure adds, Kill removes. It is deliberately not decremented when a
	// shell exits on its own (`exit`, or an external kill): the shell-activity poller's
	// own tmux read is what notices that (its busy diff drops the session), so
	// overcounting here costs a few extra idle polls, never a stuck indicator. Its only
	// job is HasAny's gate, the poller's own optimisation for the common case of a
	// session with no shell tab ever opened.
	activeIDs map[int64]struct{}
}

// newShellRegistry builds a shellRegistry bound to tmuxClient.
func newShellRegistry(tmuxClient paneSpawner, log zerolog.Logger) *shellRegistry {
	return &shellRegistry{tmux: tmuxClient, log: log}
}

// lockID acquires id's per-session lock (kb:adr/actions-serialized-per-session), creating
// it on first use, and returns the func that releases it.
func (r *shellRegistry) lockID(id int64) (unlock func()) {
	return r.locks.Lock(id)
}

// PaneExists reports whether name's tmux pane is currently live, bounded by
// shellTmuxTimeout like every other tmux call this registry makes.
func (r *shellRegistry) PaneExists(ctx context.Context, name string) (bool, error) {
	checkCtx, cancel := context.WithTimeout(ctx, shellTmuxTimeout)
	defer cancel()
	return r.tmux.PaneExists(checkCtx, name)
}

// interactiveShellArgv returns the argv for the user's interactive shell: $SHELL if set
// in the daemon's own environment, else /bin/zsh, run with -i so it behaves like an
// interactive login terminal (aliases, prompt, etc.) rather than a bare script runner.
func interactiveShellArgv() []string {
	sh := os.Getenv("SHELL")
	if sh == "" {
		sh = "/bin/zsh"
	}
	return []string{sh, "-i"}
}

// Ensure makes sure session id has a running shell in dir, spawning one if its tmux
// session is absent, and reports whether this call did the spawning. The check-then-spawn
// is what makes the respawn-after-exit case work: a previously spawned shell that exited
// (or was killed externally) leaves no pane, so the next Ensure spawns a fresh one.
//
// Deliberately never goes through sessionLauncher: no MUSTER_SESSION in the pane
// environment (isolation from the ingest path is structural, not incidental) and no
// .claude/settings.local.json write.
func (r *shellRegistry) Ensure(ctx context.Context, id int64, dir string) (target string, created bool, err error) {
	unlock := r.lockID(id)
	defer unlock()

	name := tmux.ShellSessionName(id)

	exists, err := r.PaneExists(ctx, name)
	if err != nil {
		return "", false, fmt.Errorf("checking shell pane: %w", err)
	}
	if exists {
		r.markActive(id)
		return name, false, nil
	}

	spawnCtx, cancel := context.WithTimeout(ctx, shellTmuxTimeout)
	_, _, spawnErr := r.tmux.NewNamedSession(spawnCtx, name, dir, nil, interactiveShellArgv())
	cancel()
	if spawnErr != nil {
		if errors.Is(spawnErr, tmux.ErrSessionExists) {
			// A concurrent spawn elsewhere on the socket (or a stale check) beat this one
			// to it — re-check rather than failing with shell_spawn_failed.
			nowExists, recheckErr := r.PaneExists(ctx, name)
			if recheckErr == nil && nowExists {
				r.markActive(id)
				return name, false, nil
			}
		}
		return "", false, fmt.Errorf("spawning shell: %w", spawnErr)
	}
	r.markActive(id)
	return name, true, nil
}

// markActive records id in activeIDs (HasAny's gate). Called only from inside Ensure's
// own per-id lock, but takes r.mu itself since activeIDs is read from other ids'
// goroutines too (HasAny, and Kill for a different id).
func (r *shellRegistry) markActive(id int64) {
	r.mu.Lock()
	if r.activeIDs == nil {
		r.activeIDs = make(map[int64]struct{})
	}
	r.activeIDs[id] = struct{}{}
	r.mu.Unlock()
}

// HasAny reports whether this daemon instance currently believes any session has a
// shell — the shell-activity poller's gate to skip its own tmux exec entirely for the
// common case of no shell ever opened (kb:anchor/ws.shell-activity).
func (r *shellRegistry) HasAny() bool {
	r.mu.Lock()
	defer r.mu.Unlock()
	return len(r.activeIDs) > 0
}

// Kill kills session id's shell tmux session, if any (Remove's path). A no-op, not an
// error surfaced to the caller, when no shell exists — Remove must succeed whether or
// not a shell was ever started. The lock entry is reclaimed afterward: handleRemoveSession
// only calls Kill once session.Manager.Remove has already succeeded, and
// shellFeature.handleCreateShell re-checks the session's existence under that same
// session.Manager.LockSession(id) before ever calling Ensure — so no Ensure for this id can
// start after Remove has completed, and the lock entry can never be contended on again.
func (r *shellRegistry) Kill(ctx context.Context, id int64) {
	unlock := r.lockID(id)

	name := tmux.ShellSessionName(id)
	killCtx, cancel := context.WithTimeout(ctx, shellTmuxTimeout)
	if err := r.tmux.KillSession(killCtx, name); err != nil {
		r.log.Debug().Err(err).Str("tmux_session", name).Int64("session_id", id).Msg("killing shell session failed (already gone?)")
	}
	cancel()
	unlock()

	r.locks.Forget(id)
	r.mu.Lock()
	delete(r.activeIDs, id)
	r.mu.Unlock()
}

// createShellResponse is POST /api/sessions/{id}/shell's response body
// (kb:anchor/sessions.shell).
type createShellResponse struct {
	Target  string `json:"target"`
	Created bool   `json:"created"`
}

// shellFeature owns the plain-shell surface: spawning (POST /api/sessions/{id}/shell)
// and attaching (GET /ws/shell/{id}). terminals is the shared takeover registry also
// used by terminalFeature (Claude surface) and sessionsFeature (End/Remove's socket
// teardown).
type shellFeature struct {
	registry  *shellRegistry
	terminals *terminalRegistry
	manager   *session.Manager
	attach    attachFunc
	// scroll drives the `scroll` control frame's tmux copy-mode commands
	// (kb:anchor/terminal.shell-ws) — independent of registry.tmux (a narrower paneSpawner)
	// so a test can fake copy-mode behaviour without faking session spawning too.
	scroll shellScroller
	log    zerolog.Logger
}

// newShellFeature builds the shell surface. scroll is Config.ShellScroll's override;
// realScroll is the daemon's one real tmux client, substituted whenever scroll is nil —
// the default lives here, beside its one consumer, rather than in the composition root.
func newShellFeature(registry *shellRegistry, terminals *terminalRegistry, manager *session.Manager, attach attachFunc, scroll, realScroll shellScroller, log zerolog.Logger) *shellFeature {
	if scroll == nil {
		scroll = realScroll
	}
	return &shellFeature{registry: registry, terminals: terminals, manager: manager, attach: attach, scroll: scroll, log: log}
}

func (f *shellFeature) mount(mux *http.ServeMux, guard func(http.Handler) http.Handler) {
	mux.Handle("POST /api/sessions/{id}/shell", guard(http.HandlerFunc(f.handleCreateShell)))
	mux.Handle("GET /ws/shell/{id}", guard(http.HandlerFunc(f.handleShellTerminal)))
}

// handleCreateShell is POST /api/sessions/{id}/shell (kb:anchor/sessions.shell).
// Deliberately not gated on alive (kb:adr/surfaces-shell-is-attach-target-not-session) —
// a shell may be started on a dead session and never consults the manager's liveness
// field.
//
// The whole existence-check-then-spawn runs under id's session.Manager lock:
// session.Manager.Remove holds that same lock for its entire removal, so this check can
// never observe a session that a concurrent Remove is in the middle of dropping, and any
// Remove that starts after this check passes must wait for Ensure to finish first —
// either way, a shell can never be spawned for an id whose Remove has started or already
// succeeded. Without this, the earlier sessionOr404 check and the Ensure call below raced
// Remove independently, so a Remove could complete between them and Ensure would spawn a
// shell for an id that no longer exists.
func (f *shellFeature) handleCreateShell(w http.ResponseWriter, r *http.Request) {
	id, ok := parseSessionID(w, r)
	if !ok {
		return
	}

	unlock := f.manager.LockSession(id)
	defer unlock()

	sess, ok := sessionOr404(w, f.manager, id)
	if !ok {
		return
	}
	if info, err := os.Stat(sess.Directory); err != nil || !info.IsDir() {
		writeDirectoryMissing(w, sess.Directory)
		return
	}

	target, created, err := f.registry.Ensure(context.WithoutCancel(r.Context()), id, sess.Directory)
	if err != nil {
		f.log.Error().Err(err).Int64("session_id", id).Msg("spawning shell failed")
		writeJSONError(w, http.StatusInternalServerError, "shell_spawn_failed", msgShellSpawnFailed)
		return
	}

	writeJSON(w, http.StatusOK, createShellResponse{Target: target, Created: created})
}

// handleShellTerminal is GET /ws/shell/{id} (kb:anchor/terminal.shell-ws): pre-upgrade auth
// (the requireCookie wrapper) and Origin check, 404/409 validation, then the attach-and-pump
// lifecycle both surfaces share (attachAndPump). Attach only — POST
// /api/sessions/{id}/shell (handleCreateShell) is the only thing that spawns a shell; alive
// is not consulted, in either direction (kb:adr/surfaces-shell-is-attach-target-not-session).
// The 404 here is its own not_found check
// (manager.Exists, not sessionOr404's manager.Get) because a dead session with no live shell
// still answers no_shell, never not_found.
func (f *shellFeature) handleShellTerminal(w http.ResponseWriter, r *http.Request) {
	id, err := strconv.ParseInt(r.PathValue("id"), 10, 64)
	if err != nil {
		writeJSONError(w, http.StatusNotFound, "not_found", "unknown session id")
		return
	}
	if !f.manager.Exists(id) {
		writeJSONError(w, http.StatusNotFound, "not_found", "unknown session id")
		return
	}
	shellTarget := tmux.ShellSessionName(id)
	// Goes through the registry (bounded by shellTmuxTimeout) rather than f.registry.tmux
	// directly, matching every other tmux call this surface makes.
	exists, perr := f.registry.PaneExists(r.Context(), shellTarget)
	if perr != nil {
		f.log.Error().Err(perr).Int64("session_id", id).Msg("checking shell pane failed")
		writeJSONError(w, http.StatusInternalServerError, "internal_error", msgInternalError)
		return
	}
	if !exists {
		writeJSONError(w, http.StatusConflict, "no_shell", "session has no running shell")
		return
	}

	attachAndPump(w, r, f.log, f.terminals, f.manager, id, f.attach, terminalPump{
		target: shellTarget,
		// The Claude surface's key is untouched
		// (kb:adr/surfaces-one-live-client-per-attach-target), so opening the shell
		// socket never supersedes a live Claude socket for the same session, and vice
		// versa.
		key: terminalKey{sessionID: id, surface: surfaceShell},
		// nudge is nil: a shell's death is not its session's death (kb:anchor/terminal.shell-ws) — a
		// live session must never take a liveness flap because a shell under it exited.
		nudge: nil,
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
