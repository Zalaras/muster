package server

import (
	"context"
	"errors"
	"fmt"
	"net/http"
	"os"
	"strconv"
	"sync"
	"time"

	"github.com/coder/websocket"
	"github.com/rs/zerolog"

	"github.com/Zalaras/muster/internal/session"
	"github.com/Zalaras/muster/internal/tmux"
)

// shellTmuxTimeout bounds every tmux invocation the shell surface makes (session-lifecycle
// REQ-12): unlike a Claude pane's tmux calls (which run under the HTTP request's own
// context), Ensure/Kill run with context.WithoutCancel and would otherwise wait on a
// wedged tmux forever — hanging End/Remove, which call Kill, right along with it.
const shellTmuxTimeout = 5 * time.Second

// shellRegistry is the plain-shell surface's daemon-lifetime record
// (kb:anchor/sessions.shell): a shell has no persistent representation anywhere — no SQLite row, no
// Session-object field, no write-only bookkeeping map either; PaneExists is the sole
// source of truth. A daemon restart forgets everything, which is safe because reconcile
// kills every "muster-<n>-shell" tmux session on the socket at startup
// (internal/session.Manager.Reconcile) rather than adopting one.
type shellRegistry struct {
	tmux paneSpawner
	log  zerolog.Logger

	// mu guards idLocks and activeIDs (session-lifecycle REQ-12: the registry's single
	// global mutex became per-id, so two sessions' Ensure/Kill calls never block each
	// other); the check-then-spawn/kill sequence itself is serialised by each id's own
	// lock.
	mu      sync.Mutex
	idLocks map[int64]*sync.Mutex
	// activeIDs is the set of session ids this daemon instance believes currently have
	// a shell — Ensure adds, Kill removes. It is deliberately not decremented when a
	// shell exits on its own (`exit`, or an external kill): the shell-activity poller's
	// own tmux read is what notices that (its busy diff drops the session), so
	// overcounting here costs a few extra idle polls, never a stuck indicator. Its only
	// job is HasAny's gate, the poller's own optimisation for the common case of a
	// session with no shell tab ever opened (plan Gotchas).
	activeIDs map[int64]struct{}
}

// newShellRegistry builds a shellRegistry bound to tmuxClient.
func newShellRegistry(tmuxClient paneSpawner, log zerolog.Logger) *shellRegistry {
	return &shellRegistry{tmux: tmuxClient, log: log}
}

// lockID acquires id's per-session lock (REQ-12), creating it on first use, and returns
// the func that releases it.
func (r *shellRegistry) lockID(id int64) (unlock func()) {
	r.mu.Lock()
	if r.idLocks == nil {
		r.idLocks = make(map[int64]*sync.Mutex)
	}
	l, ok := r.idLocks[id]
	if !ok {
		l = &sync.Mutex{}
		r.idLocks[id] = l
	}
	r.mu.Unlock()

	l.Lock()
	return l.Unlock
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

	checkCtx, cancel := context.WithTimeout(ctx, shellTmuxTimeout)
	exists, err := r.tmux.PaneExists(checkCtx, name)
	cancel()
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
			// REQ-12: a concurrent spawn elsewhere on the socket (or a stale check) beat
			// this one to it — re-check rather than failing with shell_spawn_failed.
			recheckCtx, cancel := context.WithTimeout(ctx, shellTmuxTimeout)
			nowExists, recheckErr := r.tmux.PaneExists(recheckCtx, name)
			cancel()
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
// common case of no shell ever opened (plan Gotchas; kb:anchor/ws.shell-activity).
func (r *shellRegistry) HasAny() bool {
	r.mu.Lock()
	defer r.mu.Unlock()
	return len(r.activeIDs) > 0
}

// Kill kills session id's shell tmux session, if any (Remove's path). A no-op, not an
// error surfaced to the caller, when no shell exists — Remove must succeed whether or
// not a shell was ever started. The lock entry is reclaimed afterward: Remove is the only
// caller and a session id is never reissued (REQ-2), so nothing can contend on it again.
func (r *shellRegistry) Kill(ctx context.Context, id int64) {
	unlock := r.lockID(id)

	name := tmux.ShellSessionName(id)
	killCtx, cancel := context.WithTimeout(ctx, shellTmuxTimeout)
	if err := r.tmux.KillSession(killCtx, name); err != nil {
		r.log.Debug().Err(err).Str("tmux_session", name).Int64("session_id", id).Msg("killing shell session failed (already gone?)")
	}
	cancel()
	unlock()

	r.mu.Lock()
	delete(r.idLocks, id)
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
// and attaching (GET /ws/shell/{id}) — plan code-breakup REQ-6. terminals is the shared
// takeover registry also used by terminalFeature (Claude surface) and sessionsFeature
// (End/Remove's socket teardown).
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

func newShellFeature(registry *shellRegistry, terminals *terminalRegistry, manager *session.Manager, attach attachFunc, scroll shellScroller, log zerolog.Logger) *shellFeature {
	return &shellFeature{registry: registry, terminals: terminals, manager: manager, attach: attach, scroll: scroll, log: log}
}

func (f *shellFeature) mount(mux *http.ServeMux, guard func(http.Handler) http.Handler) {
	mux.Handle("POST /api/sessions/{id}/shell", guard(http.HandlerFunc(f.handleCreateShell)))
	mux.Handle("GET /ws/shell/{id}", guard(http.HandlerFunc(f.handleShellTerminal)))
}

// handleCreateShell is POST /api/sessions/{id}/shell (plan plain-terminal-session REQ-1,
// kb:anchor/sessions.shell). Deliberately not gated on alive (REQ-7) — a shell may be
// started on a dead session and never consults the manager's liveness field.
func (f *shellFeature) handleCreateShell(w http.ResponseWriter, r *http.Request) {
	id, ok := parseSessionID(w, r)
	if !ok {
		return
	}
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
// (the requireCookie wrapper) and Origin check, 404/409 validation, takeover, and the two
// byte pumps. Attach only — POST /api/sessions/{id}/shell (handleCreateShell) is the only
// thing that spawns a shell; alive is not consulted, in either direction (REQ-7).
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
	exists, perr := f.registry.tmux.PaneExists(r.Context(), shellTarget)
	if perr != nil {
		f.log.Error().Err(perr).Int64("session_id", id).Msg("checking shell pane failed")
		writeJSONError(w, http.StatusInternalServerError, "internal_error", msgInternalError)
		return
	}
	if !exists {
		writeJSONError(w, http.StatusConflict, "no_shell", "session has no running shell")
		return
	}

	c, err := websocket.Accept(w, r, nil)
	if err != nil {
		f.log.Info().Err(err).Msg("shell terminal ws upgrade rejected")
		return
	}
	defer func() { _ = c.CloseNow() }()

	// takeover evicts any prior connection for this session's shell surface only — the
	// Claude surface's key is untouched (INV-3), so opening the shell socket never
	// supersedes a live Claude socket for the same session, and vice versa.
	key := terminalKey{sessionID: id, surface: surfaceShell}
	conn, err := f.terminals.takeover(r.Context(), key, func(attachCtx context.Context) (*terminalConn, error) {
		bridge, aerr := f.attach(attachCtx, shellTarget)
		if aerr != nil {
			return nil, aerr
		}
		return &terminalConn{ws: c, bridge: bridge}, nil
	})
	if err != nil {
		f.log.Error().Err(err).Int64("session_id", id).Str("tmux_target", shellTarget).Msg("attaching shell bridge failed")
		_ = c.Close(websocket.StatusInternalError, "attach failed")
		return
	}
	bridge := conn.bridge
	defer func() { _ = bridge.Close() }()
	defer f.terminals.release(key, conn)

	// REQ-8's attach side effect applies to both surfaces: a successful shell takeover
	// also marks the session seen, before any PTY byte is forwarded (kb:anchor/terminal.shell-ws
	// Protocol Contract delta).
	if err := f.manager.MarkSeen(r.Context(), id); err != nil {
		f.log.Warn().Err(err).Int64("session_id", id).Msg("marking session seen failed")
	}

	ctx, cancel := context.WithCancel(r.Context())
	defer cancel()

	ptyDone := make(chan struct{})
	go func() {
		defer close(ptyDone)
		defer cancel()
		// nudgeOnEOF is false: a shell's death is not its session's death (kb:anchor/terminal.shell-ws) — a
		// live session must never take a liveness flap because a shell under it exited.
		pumpPTYToSocket(ctx, f.log, c, bridge, id, false, nil)
	}()

	// The shell socket's own variant: decodes the `scroll` control frame the Claude
	// socket does not accept, and cancels copy-mode before writing input (REQ-10).
	pumpShellSocketToPTY(ctx, f.log, c, bridge, f.scroll, shellTarget)
	// Same teardown ordering as handleTerminal — see its comment for why.
	cancel()
	_ = bridge.Close()
	<-ptyDone
}
