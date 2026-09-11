package server

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"os"
	"strconv"
	"sync"

	"github.com/coder/websocket"
	"github.com/rs/zerolog"

	"github.com/Zalaras/muster/internal/session"
	"github.com/Zalaras/muster/internal/tmux"
)

// shellRegistry is the plain-shell surface's daemon-lifetime record (docs/protocol.md
// §3.16): a shell has no persistent representation anywhere — no SQLite row, no
// Session-object field, no write-only bookkeeping map either; PaneExists is the sole
// source of truth. A daemon restart forgets everything, which is safe because reconcile
// kills every "muster-<n>-shell" tmux session on the socket at startup
// (internal/session.Manager.Reconcile) rather than adopting one.
type shellRegistry struct {
	tmux paneSpawner
	log  zerolog.Logger

	// mu guards the whole check-then-spawn sequence in Ensure: two concurrent POSTs for
	// the same session id must never both observe "no pane" and both attempt `tmux
	// new-session -s <name>` (the second would fail with a tmux "duplicate session"
	// error instead of returning created:false cleanly).
	mu sync.Mutex
}

// newShellRegistry builds a shellRegistry bound to tmuxClient.
func newShellRegistry(tmuxClient paneSpawner, log zerolog.Logger) *shellRegistry {
	return &shellRegistry{tmux: tmuxClient, log: log}
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
	r.mu.Lock()
	defer r.mu.Unlock()

	name := tmux.ShellSessionName(id)

	exists, err := r.tmux.PaneExists(ctx, name)
	if err != nil {
		return "", false, fmt.Errorf("checking shell pane: %w", err)
	}
	if exists {
		return name, false, nil
	}

	if _, _, err := r.tmux.NewNamedSession(ctx, name, dir, nil, interactiveShellArgv()); err != nil {
		return "", false, fmt.Errorf("spawning shell: %w", err)
	}
	return name, true, nil
}

// Kill kills session id's shell tmux session, if any (Remove's path). A no-op, not an
// error surfaced to the caller, when no shell exists — Remove must succeed whether or
// not a shell was ever started.
func (r *shellRegistry) Kill(ctx context.Context, id int64) {
	r.mu.Lock()
	defer r.mu.Unlock()

	name := tmux.ShellSessionName(id)
	if err := r.tmux.KillSession(ctx, name); err != nil {
		r.log.Debug().Err(err).Str("tmux_session", name).Int64("session_id", id).Msg("killing shell session failed (already gone?)")
	}
}

// createShellResponse is POST /api/sessions/{id}/shell's response body (docs/protocol.md
// §3.16).
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
	log       zerolog.Logger
}

func newShellFeature(registry *shellRegistry, terminals *terminalRegistry, manager *session.Manager, attach attachFunc, log zerolog.Logger) *shellFeature {
	return &shellFeature{registry: registry, terminals: terminals, manager: manager, attach: attach, log: log}
}

func (f *shellFeature) mount(mux *http.ServeMux, guard func(http.Handler) http.Handler) {
	mux.Handle("POST /api/sessions/{id}/shell", guard(http.HandlerFunc(f.handleCreateShell)))
	mux.Handle("GET /ws/shell/{id}", guard(http.HandlerFunc(f.handleShellTerminal)))
}

// handleCreateShell is POST /api/sessions/{id}/shell (plan plain-terminal-session REQ-1,
// docs/protocol.md §3.16). Deliberately not gated on alive (REQ-7) — a shell may be
// started on a dead session and never consults the manager's liveness field.
func (f *shellFeature) handleCreateShell(w http.ResponseWriter, r *http.Request) {
	id, ok := parseSessionID(w, r)
	if !ok {
		return
	}
	sess, exists := f.manager.Get(id)
	if !exists {
		writeJSONError(w, http.StatusNotFound, "unknown_session", "unknown session id")
		return
	}
	if info, err := os.Stat(sess.Directory); err != nil || !info.IsDir() {
		writeJSONError(w, http.StatusConflict, "directory_missing", fmt.Sprintf("%s no longer exists", sess.Directory))
		return
	}

	target, created, err := f.registry.Ensure(context.WithoutCancel(r.Context()), id, sess.Directory)
	if err != nil {
		f.log.Error().Err(err).Int64("session_id", id).Msg("spawning shell failed")
		writeJSONError(w, http.StatusInternalServerError, "shell_spawn_failed", err.Error())
		return
	}

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)
	_ = json.NewEncoder(w).Encode(createShellResponse{Target: target, Created: created})
}

// handleShellTerminal is GET /ws/shell/{id} (docs/protocol.md §6.1): pre-upgrade auth
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
		writeJSONError(w, http.StatusInternalServerError, "internal_error", perr.Error())
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

	ctx, cancel := context.WithCancel(r.Context())
	defer cancel()

	ptyDone := make(chan struct{})
	go func() {
		defer close(ptyDone)
		defer cancel()
		// nudgeOnEOF is false: a shell's death is not its session's death (§6.1) — a
		// live session must never take a liveness flap because a shell under it exited.
		pumpPTYToSocket(ctx, f.log, c, bridge, id, false, nil)
	}()

	pumpSocketToPTY(ctx, f.log, c, bridge)
	// Same teardown ordering as handleTerminal — see its comment for why.
	cancel()
	_ = bridge.Close()
	<-ptyDone
}
