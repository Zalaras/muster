package server

import (
	"context"
	"fmt"
	"os"
	"sync"

	"github.com/rs/zerolog"

	"github.com/Zalaras/muster/internal/tmux"
)

// shellRegistry is the plain-shell surface's daemon-lifetime record (docs/protocol.md
// §3.16, plan plain-terminal-session REQ-1..REQ-3): a shell has no persistent
// representation anywhere — no SQLite row, no Session-object field — so this map is
// purely in-memory bookkeeping. A daemon restart forgets it entirely, which is safe
// because reconcile kills every "muster-<n>-shell" tmux session on the socket at startup
// (REQ-10, internal/session.Manager.Reconcile) rather than adopting one.
type shellRegistry struct {
	tmux *tmux.Client
	log  zerolog.Logger

	// mu guards the whole check-then-spawn sequence in Ensure, not just the map: two
	// concurrent POSTs for the same session id must never both observe "no pane" and
	// both attempt `tmux new-session -s <name>` (the second would fail with a tmux
	// "duplicate session" error instead of returning created:false cleanly).
	mu      sync.Mutex
	spawned map[int64]bool // session id -> this daemon lifetime spawned its shell at least once
}

// newShellRegistry builds a shellRegistry bound to tmuxClient.
func newShellRegistry(tmuxClient *tmux.Client, log zerolog.Logger) *shellRegistry {
	return &shellRegistry{tmux: tmuxClient, log: log, spawned: make(map[int64]bool)}
}

// interactiveShellArgv returns the argv for the user's interactive shell (REQ-1): $SHELL if set
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
// is what makes REQ-8's respawn-after-exit work: a previously spawned shell that exited
// (or was killed externally) leaves no pane, so the next Ensure spawns a fresh one.
//
// Deliberately never goes through sessionLauncher: no MUSTER_SESSION in the pane
// environment (REQ-2/INV-1 — isolation from the ingest path is structural, not
// incidental) and no .claude/settings.local.json write (REQ-2).
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
	r.spawned[id] = true
	return name, true, nil
}

// Kill kills session id's shell tmux session, if any (REQ-9's Remove path). A no-op, not
// an error surfaced to the caller, when no shell exists — Remove must succeed whether or
// not a shell was ever started.
func (r *shellRegistry) Kill(ctx context.Context, id int64) {
	r.mu.Lock()
	defer r.mu.Unlock()

	name := tmux.ShellSessionName(id)
	if err := r.tmux.KillSession(ctx, name); err != nil {
		r.log.Debug().Err(err).Str("tmux_session", name).Int64("session_id", id).Msg("killing shell session failed (already gone?)")
	}
	delete(r.spawned, id)
}
