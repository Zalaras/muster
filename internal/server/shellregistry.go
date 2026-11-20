package server

import (
	"context"
	"fmt"
	"os"
	"sort"
	"sync"
	"time"

	"github.com/rs/zerolog"

	"github.com/Zalaras/muster/internal/keyedlock"
	"github.com/Zalaras/muster/internal/tmux"
)

// shellTmuxTimeout bounds every tmux invocation the shell surface makes
// (kb:adr/actions-serialized-per-session): unlike a Claude pane's tmux calls (which run
// under the HTTP request's own context), EnsureAny/New/Close/Kill run with context.WithoutCancel and
// would otherwise wait on a wedged tmux forever — hanging End/Remove, which call Kill,
// right along with it.
const shellTmuxTimeout = 5 * time.Second

// shellRegistry is the terminal surface's daemon-lifetime record
// (kb:anchor/sessions.shell): a session's terminals (one or several) have no persistent
// representation anywhere — no SQLite row, no Session-object field, no write-only
// bookkeeping map either; tmux (ListSessions/PaneExists) is the sole source of truth. A
// daemon restart forgets everything, which is safe because reconcile kills every terminal
// tmux session on the socket at startup (internal/session.Manager.Reconcile) rather than
// adopting one.
type shellRegistry struct {
	tmux paneSpawner
	log  zerolog.Logger

	// locks is this registry's own per-session-id lock (kb:adr/actions-serialized-per-session):
	// its one job is making EnsureAny/New/Close/Kill safe to call concurrently for the same id, verified
	// directly against the registry by this package's own tests
	// (TestShellRegistry_ConcurrentEnsureOnlySpawnsOnce) without relying on any caller
	// holding a lock of their own — two different sessions' calls never block each other.
	// session.Manager.LockSession (held by spawnInSession, shells.go) is a second,
	// different guarantee this lock cannot give: it holds off a concurrent Remove while the
	// existence check and the spawn run, because it and this lock are different mutexes on
	// different owners. The same keyedlock.Locks type session.Manager.LockSession uses,
	// rather than each package hand-rolling the same map+mutex.
	locks keyedlock.Locks[int64]

	names *terminalNames

	// mu guards activeIDs only.
	mu sync.Mutex
	// activeIDs is the set of session ids this daemon instance believes currently have
	// a terminal — spawn and EnsureAny add, Kill removes. It is deliberately not decremented
	// when a terminal exits on its own (`exit`, or an external kill): the terminal-list
	// poller's own tmux read is what notices that (its list diff drops the terminal), so
	// overcounting here costs a few extra idle polls, never a stale list. Its only job is
	// HasAny's gate, the poller's own optimisation for the common case of a session with
	// no terminal ever opened.
	activeIDs map[int64]struct{}
}

// newShellRegistry builds a shellRegistry bound to tmuxClient.
func newShellRegistry(tmuxClient paneSpawner, names *terminalNames, log zerolog.Logger) *shellRegistry {
	return &shellRegistry{tmux: tmuxClient, log: log, names: names}
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

func (r *shellRegistry) running(ctx context.Context, id int64) ([]int, error) {
	listCtx, cancel := context.WithTimeout(ctx, shellTmuxTimeout)
	defer cancel()
	names, err := r.tmux.ListSessions(listCtx)
	if err != nil {
		return nil, fmt.Errorf("listing terminals: %w", err)
	}
	var ns []int
	for _, name := range names {
		if sid, n, ok := tmux.ParseTerminalName(name); ok && sid == id {
			ns = append(ns, n)
		}
	}
	sort.Ints(ns)
	return ns, nil
}

func lowestFree(ns []int) int {
	free := 1
	for _, n := range ns {
		if n != free {
			break
		}
		free++
	}
	return free
}

// spawn starts terminal n of session id in dir. Deliberately never goes through
// sessionLauncher: no MUSTER_SESSION in the pane environment (isolation from the ingest
// path is structural, not incidental) and no .claude/settings.local.json write. Callers
// hold id's lock.
func (r *shellRegistry) spawn(ctx context.Context, id int64, n int, dir string) (target string, err error) {
	name := tmux.TerminalSessionName(id, n)
	spawnCtx, cancel := context.WithTimeout(ctx, shellTmuxTimeout)
	defer cancel()
	if _, _, err = r.tmux.NewNamedSession(spawnCtx, name, dir, nil, interactiveShellArgv()); err != nil {
		return "", fmt.Errorf("spawning shell: %w", err)
	}
	r.names.forget(id, n)
	r.markActive(id)
	return name, nil
}

func (r *shellRegistry) EnsureAny(ctx context.Context, id int64, dir string) (target string, n int, created bool, err error) {
	unlock := r.lockID(id)
	defer unlock()

	ns, err := r.running(ctx, id)
	if err != nil {
		return "", 0, false, err
	}
	if len(ns) > 0 {
		r.markActive(id)
		return tmux.TerminalSessionName(id, ns[0]), ns[0], false, nil
	}
	target, err = r.spawn(ctx, id, 1, dir)
	if err != nil {
		return "", 0, false, err
	}
	return target, 1, true, nil
}

func (r *shellRegistry) New(ctx context.Context, id int64, dir string) (target string, n int, err error) {
	unlock := r.lockID(id)
	defer unlock()

	ns, err := r.running(ctx, id)
	if err != nil {
		return "", 0, err
	}
	n = lowestFree(ns)
	target, err = r.spawn(ctx, id, n, dir)
	if err != nil {
		return "", 0, err
	}
	return target, n, nil
}

func (r *shellRegistry) Close(ctx context.Context, id int64, n int) (bool, error) {
	unlock := r.lockID(id)
	defer unlock()

	name := tmux.TerminalSessionName(id, n)
	exists, err := r.PaneExists(ctx, name)
	if err != nil || !exists {
		return false, err
	}
	killCtx, cancel := context.WithTimeout(ctx, shellTmuxTimeout)
	defer cancel()
	if err := r.tmux.KillSession(killCtx, name); err != nil {
		return false, fmt.Errorf("killing terminal: %w", err)
	}
	r.names.forget(id, n)
	return true, nil
}

// markActive records id in activeIDs (HasAny's gate). Called only from inside the
// registry's per-id lock, but takes r.mu itself since activeIDs is read from other ids'
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
// terminal — the terminal-list poller's gate to skip its own tmux exec entirely for the
// common case of no terminal ever opened (kb:anchor/ws.shell-activity).
func (r *shellRegistry) HasAny() bool {
	r.mu.Lock()
	defer r.mu.Unlock()
	return len(r.activeIDs) > 0
}

// Kill kills every terminal of session id (Remove's path). A no-op, not an error
// surfaced to the caller, when none exists — Remove must succeed whether or not a
// terminal was ever started. The lock entry is reclaimed afterward: handleRemoveSession
// only calls Kill once session.Manager.Remove has already succeeded, and
// shellFeature's spawn handlers re-check the session's existence under that same
// session.Manager.LockSession(id) before ever spawning — so no spawn for this id can
// start after Remove has completed, and the lock entry can never be contended on again.
func (r *shellRegistry) Kill(ctx context.Context, id int64) {
	unlock := r.lockID(id)

	ns, err := r.running(ctx, id)
	if err != nil {
		r.log.Debug().Err(err).Int64("session_id", id).Msg("listing terminals to kill failed; killing terminal 1 only")
		ns = []int{1}
	}
	for _, n := range ns {
		name := tmux.TerminalSessionName(id, n)
		killCtx, cancel := context.WithTimeout(ctx, shellTmuxTimeout)
		if kerr := r.tmux.KillSession(killCtx, name); kerr != nil {
			r.log.Debug().Err(kerr).Str("tmux_session", name).Int64("session_id", id).Msg("killing shell session failed (already gone?)")
		}
		cancel()
	}
	unlock()

	r.names.forgetSession(id)
	r.locks.Forget(id)
	r.mu.Lock()
	delete(r.activeIDs, id)
	r.mu.Unlock()
}
