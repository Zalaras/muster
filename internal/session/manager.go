package session

import (
	"context"
	"errors"
	"fmt"
	"sync"
	"sync/atomic"
	"time"

	"github.com/rs/zerolog"

	"github.com/Zalaras/muster/internal/keyedlock"
	"github.com/Zalaras/muster/internal/store"
)

// PaneChecker reports whether a tmux pane still exists — the liveness poll's only
// signal (kb:anchor/state.liveness; never terminal output, CLAUDE.md hard rule). Defined here
// because internal/session is the consumer; internal/tmux.Client satisfies it.
type PaneChecker interface {
	PaneExists(ctx context.Context, target string) (bool, error)
}

// PaneSnapshotter captures a live pane's current screen text (kb:anchor/sessions.pane) —
// display source only, never read by the state machine and never logged (may hold
// prompt text). internal/tmux.Client satisfies it.
type PaneSnapshotter interface {
	CapturePane(ctx context.Context, target string) (string, error)
}

// TmuxSessions is the Manager's live view of tmux itself: enumerating every session on
// the socket, killing one by name, and resolving a live session's current window/pane
// target. Reconcile's ownership classification and repair
// (kb:adr/lifecycle-reconcile-converges-with-the-socket), End/EndAll/Remove's kill path
// (kb:adr/actions-serialized-per-session) and the shell-lifecycle helpers all go through
// this one port — a *tmux.Client satisfies it. A fake that doesn't support
// ResolveSessionTarget just returns an error, the same shape a real failure already took.
type TmuxSessions interface {
	KillSession(ctx context.Context, name string) error
	ListSessions(ctx context.Context) ([]string, error)
	ResolveSessionTarget(ctx context.Context, name string) (target, pane string, err error)
}

// Watcher answers whether a session currently has a live terminal client attached, on
// either surface (kb:adr/rail-unread-inferred-from-live-terminal-client, kb:anchor/state.tracked) —
// internal/server's terminal registry satisfies it. Apply's turn_closed handling treats
// a nil Watcher (e.g. a Manager built without one, most unit tests) as reporting false
// for every id — unwatched, never a panic.
type Watcher interface {
	Watched(sessionID int64) bool
}

// Sentinel errors the internal/server package branches on to pick an HTTP status
// (kb:anchor/sessions.resume / kb:anchor/sessions.end / kb:anchor/sessions.remove) — the one place callers of End/Remove/RecordResume
// must inspect a specific error rather than treating every failure alike.
var (
	ErrUnknownSession  = errors.New("unknown session")
	ErrSessionNotAlive = errors.New("session not alive")
)

// defaultPollInterval is kb:anchor/state.liveness's "~5s" liveness poll.
const defaultPollInterval = 5 * time.Second

// endRemoveTmuxTimeout bounds every tmux invocation endLocked/removeLocked/
// RepairOwnedSession make: all three run under a per-session-id lock acquired by
// End/Remove/Resume (kb:adr/actions-serialized-per-session), so a wedged tmux there no
// longer just hangs one request — it wedges every later End/Resume/Remove for that same
// id, permanently. Mirrors shellTmuxTimeout's value (internal/server/shells.go).
const endRemoveTmuxTimeout = 5 * time.Second

// Config wires a Manager. Built by internal/server; nothing here starts a goroutine
// until Start is called.
type Config struct {
	Store  *store.Store
	Logger zerolog.Logger
	// PaneChecker, PaneSnapshotter and TmuxSessions are the tmux ports: required (see
	// NewManager) — production always wires all three to the same *tmux.Client
	// (internal/server/server.go).
	PaneChecker     PaneChecker
	PaneSnapshotter PaneSnapshotter
	TmuxSessions    TmuxSessions
	// OnUpsert, OnRemoved and Watcher are wired by production exactly like the three tmux
	// ports above, but stay nil-tolerant rather than required: a nil tmux port has no safe
	// meaning (NewManager panics on one), whereas a nil value here already has a real,
	// defined meaning documented on the field itself (skip the broadcast; count every
	// session as unwatched). Tests lean on that tolerance to build a Manager without wiring
	// a websocket hub or a terminal registry.
	OnUpsert     func(*Session) // broadcasts a sessionUpsert; may be nil in tests
	OnRemoved    func(id int64) // broadcasts sessionRemoved (kb:anchor/ws.session-removed); may be nil in tests
	Watcher      Watcher        // nil counts every session as unwatched
	PollInterval time.Duration  // 0 uses defaultPollInterval
}

// Manager is the in-memory session registry and the kb:anchor/state state machine's home. Every
// mutation persists the full row and (unless OnUpsert is nil) broadcasts the fresh
// Session — the "whole-object sessionUpsert" design (kb:anchor/ws.session).
type Manager struct {
	store           *store.Store
	log             zerolog.Logger
	paneChecker     PaneChecker
	paneSnapshotter PaneSnapshotter
	tmuxSessions    TmuxSessions
	onUpsert        func(*Session)
	onRemoved       func(id int64)
	interval        time.Duration
	watcher         Watcher

	// mu guards sessions, byClaude, writeChain and nextRailPos below: every map's own
	// entries, and every field of a *Session sessions holds — a *Session is mutable only
	// while mu is held. Every exported read (Get/List/Exists/Resolve/PaneOf/…) takes its
	// own Clone() before releasing mu, so a caller never holds a pointer another goroutine
	// can still mutate.
	mu       sync.Mutex
	sessions map[int64]*Session
	byClaude map[string]int64 // claude session id -> muster session id

	// locks is the per-session-id lock (kb:adr/actions-serialized-per-session), guarded by
	// its own mutex, not mu — the same keyedlock.Locks type internal/server's shellRegistry
	// uses, rather than each package hand-rolling the same map. Guards Launch/Resume/
	// End/Remove's whole check-then-act without blocking a different id's. removeSessionRecord
	// reclaims an id's entry once its row is gone (the id is never reissued); see
	// keyedlock.Locks.Forget's doc for what makes that reclaim safe against a
	// client-supplied id racing it.
	locks keyedlock.Locks[int64]

	// writeChain is a per-session write-ordering turnstile, guarded by mu itself (map
	// access only, same discipline locks above keeps for its own map): writeChain[id] is
	// always the completion signal of the most recently *scheduled* persist for id.
	// nextWriteTurnLocked draws a ticket (replacing the entry) while the caller still holds
	// mu, so tickets are handed out in exactly the order their mutations happened;
	// finishWrite waits for the previous ticket to close before persisting, so two setters
	// racing to write the same id can never persist — or broadcast — out of that order.
	// removeSessionRecord draws a ticket the same way every setter does, and reclaims the
	// entry once its own turn comes (dropSessionFromMemory), so a write queued behind a
	// removal always finds the id already gone at its own turn.
	writeChain map[int64]chan struct{}

	// lastPersisted is a per-session cache of the row last actually written to the DB,
	// guarded by mu itself (map access only, same discipline as writeChain). wholeRowPersist
	// and railPersist both call recordPersistedLocked right after a successful store write,
	// inside the same persist closure finishWrite invokes at that write's own turn —
	// restoreChangedFields reads it, under the same mu.Lock() finishWrite already holds on a
	// later failure, as the value to revert a field to instead of that failing write's own
	// stale pre-mutation clone (its doc says why). Never read anywhere else: List/Get/
	// broadcast all use the live *Session in m.sessions.
	lastPersisted map[int64]*Session

	// nextRailPos is the RailPos CreateSession hands to the next new session, guarded by mu
	// itself. Deciding and advancing it in one critical section is what makes two
	// concurrent launches get distinct positions — unlike reading max(existing RailPos)
	// from m.sessions, which two launches can both see before either has registered.
	// LoadAll seeds it from the persisted rows; it only ever increases, so a value skipped
	// by a since-removed session is never reused, which is harmless — a new session only
	// needs to land after every existing one, not at a contiguous next value.
	nextRailPos int64

	cancel context.CancelFunc
	wg     sync.WaitGroup

	// stopped is set by Stop and read only by checkOneLiveness's opportunistic callers
	// (checkLiveness's poll tick, Nudge) — never by End's. terminal.go's PTY-EOF Nudge
	// call is deliberately spawned with context.WithoutCancel(ctx) so a connection
	// tearing down never truncates it mid-flight, which means it can still be
	// mid-PaneExists when shutdownGracefully calls Stop as its first statement. Once
	// Stop has run, shutdown itself is the sole authority on final alive state — the
	// on-exit policy's leave/EndAllSessions, or the next boot's reconcile
	// (kb:adr/lifecycle-reconcile-converges-with-the-socket) — so a nudge reaching its
	// persist step after Stop must not also write one. End's own checkOneLiveness call
	// (endOnCheckError=true) is unaffected: it is shutdown's own deliberate kill, not a
	// race with it.
	stopped atomic.Bool
}

// LockSession acquires id's per-session lock (kb:adr/actions-serialized-per-session) and
// returns the func that releases it. Held across a whole logical action — including its
// tmux I/O — never across mu itself; internal/server's sessionLauncher and shellFeature use
// this directly to serialise their own actions the same way End/Remove do internally, so a
// shell can never be spawned for an id whose Remove has started or finished — both go
// through this same lock. A caller always re-validates id's existence under m.mu once it
// has the lock (every action here does): that check, not id never being lockable again, is
// what makes reclaiming a removed id's lock entry safe against a client-supplied id racing
// a Remove (keyedlock.Locks.Forget's doc).
func (m *Manager) LockSession(id int64) (unlock func()) {
	return m.locks.Lock(id)
}

// NewManager builds a Manager. PaneChecker, PaneSnapshotter and TmuxSessions are all
// required: production always wires all three to the same *tmux.Client, and panicking
// here on a missing one means Reconcile's ownership classification has exactly one code
// path, never a second, untested one a caller could reach by skipping a port. Call
// LoadAll then Start once the caller is ready.
func NewManager(cfg Config) *Manager {
	if cfg.PaneChecker == nil || cfg.PaneSnapshotter == nil || cfg.TmuxSessions == nil {
		panic("session.NewManager: PaneChecker, PaneSnapshotter and TmuxSessions are all required")
	}
	interval := cfg.PollInterval
	if interval <= 0 {
		interval = defaultPollInterval
	}
	return &Manager{
		store:           cfg.Store,
		log:             cfg.Logger,
		paneChecker:     cfg.PaneChecker,
		paneSnapshotter: cfg.PaneSnapshotter,
		tmuxSessions:    cfg.TmuxSessions,
		onUpsert:        cfg.OnUpsert,
		onRemoved:       cfg.OnRemoved,
		interval:        interval,
		watcher:         cfg.Watcher,
		sessions:        make(map[int64]*Session),
		byClaude:        make(map[string]int64),
	}
}

// LoadAll reloads every persisted session into memory (daemon-restart reconcile) — the
// liveness poll re-evaluates alive on its own next tick.
func (m *Manager) LoadAll(ctx context.Context) error {
	rows, err := m.store.ListSessions(ctx)
	if err != nil {
		return fmt.Errorf("loading sessions: %w", err)
	}

	m.mu.Lock()
	defer m.mu.Unlock()
	for _, row := range rows {
		sess := rowToSession(row)
		m.sessions[sess.ID] = sess
		if sess.ClaudeSessionID != "" {
			m.byClaude[sess.ClaudeSessionID] = sess.ID
		}
	}
	m.nextRailPos = m.maxRailPosLocked() + 1
	return nil
}

// CreateParams seeds a new launched session.
type CreateParams struct {
	RepoID          int64
	Directory       string
	Branch          *string
	IsWorktree      bool
	Title           *string
	PermissionMode  PermissionMode
	Model           string
	FirstLaunchHere bool

	// MinID floors the allocated id above this value (0 = no floor) — the launcher's
	// MaxSessionID probe of the tmux socket, passed straight through to
	// store.InsertSessionParams.MinID (kb:adr/lifecycle-session-ids-monotonic-never-reused).
	MinID int64
}

// CreateSession inserts the session row (tmuxTarget still a placeholder — the launcher
// needs this id to build the tmux pane environment before it can spawn the window) and
// registers it in memory. No broadcast yet: staying silent until any hook can arrive is
// satisfied by RecordLaunch, once the real tmux target is known.
func (m *Manager) CreateSession(ctx context.Context, p CreateParams) (*Session, error) {
	model := p.Model

	// Deciding railPos and advancing nextRailPos happen in the same critical section, so
	// two concurrent CreateSession calls can never both see the same value — unlike
	// reading max(m.sessions) here and only registering the new session (invisible to that
	// same read) after InsertSession's round trip.
	m.mu.Lock()
	railPos := m.nextRailPos
	m.nextRailPos++
	m.mu.Unlock()

	row, err := m.store.InsertSession(ctx, store.InsertSessionParams{
		RepoID:          p.RepoID,
		Directory:       p.Directory,
		Branch:          p.Branch,
		IsWorktree:      p.IsWorktree,
		Title:           p.Title,
		PermissionMode:  string(p.PermissionMode),
		Model:           &model,
		FirstLaunchHere: p.FirstLaunchHere,
		RailPos:         railPos,
		MinID:           p.MinID,
	})
	if err != nil {
		return nil, fmt.Errorf("creating session: %w", err)
	}

	sess := rowToSession(row)

	m.mu.Lock()
	m.sessions[sess.ID] = sess
	m.mu.Unlock()

	return sess.Clone(), nil
}

// DeleteSession removes a session that failed to launch after its row was inserted — on
// a spawn failure the row is deleted rather than left behind. No OnRemoved broadcast: the
// row was never announced with a sessionUpsert either.
func (m *Manager) DeleteSession(ctx context.Context, id int64) error {
	return m.removeSessionRecord(ctx, id, false)
}

// removeFromMemory drops id from the in-memory registry and its claude-id index, if
// present. Its one caller is dropSessionFromMemory (removeSessionRecord's tail) — Apply's
// own restore path drops a single stale byClaude entry directly (apply.go) rather than
// through this, since it never removes the session itself, only its own claude-id mapping.
func (m *Manager) removeFromMemory(id int64) {
	m.mu.Lock()
	delete(m.sessions, id)
	for claudeID, sid := range m.byClaude {
		if sid == id {
			delete(m.byClaude, claudeID)
		}
	}
	m.mu.Unlock()
}

// dropSessionFromMemory removes id's in-memory entry, write-ticket chain, last-persisted
// cache and per-id lock — removeSessionRecord's tail once the store side of a removal is
// settled, whichever way (see removeSessionRecord's announced/unannounced split). The id is
// never reissued (kb:adr/lifecycle-session-ids-monotonic-never-reused), so its
// writeChain/lastPersisted/locks entries can never be scheduled, restored against or locked
// again through the ordinary lookup-by-id paths.
func (m *Manager) dropSessionFromMemory(id int64) {
	m.removeFromMemory(id)
	m.mu.Lock()
	delete(m.writeChain, id)
	delete(m.lastPersisted, id)
	m.mu.Unlock()
	m.locks.Forget(id)
}

// removeSessionRecord is the one removal path DeleteSession's launch rollback, Remove and
// Reconcile's sweep all share. It first draws id's write-ticket the same way every setter
// does and waits its turn, so a write already queued for id finishes (persisted, or rolled
// back) before the row is deleted, and any write queued *behind* this call finds the
// session already gone at its own turn and declines to persist or broadcast
// (persistWholeRowLocked's doc) — removal is sequenced through the same turnstile a write is,
// not a side channel next to it.
//
// announced controls the store/memory order, because the two removal callers need
// opposite answers to "what must be true if the store delete fails":
//   - announced=true (Remove): the row's session was already broadcast as a sessionUpsert
//     at least once, so a live client believes it exists. The store delete must succeed
//     *before* memory drops — a failed delete leaves the row exactly as it was, in both
//     places, rather than vanishing from memory while the DB (and every other client)
//     still has it.
//   - announced=false (DeleteSession's launch rollback, Reconcile's startup sweep): no
//     client has ever seen a sessionUpsert for this row — DeleteSession runs before
//     RecordLaunch's first broadcast, and Reconcile runs before the daemon serves its
//     first snapshot at all. A failed delete here must still drop memory, or a session
//     nobody was ever told about becomes visible in the next List()/snapshot purely
//     because a DB error happened to land — visible-because-delete-failed is exactly what
//     announced=true is protecting against, and here there is nothing to protect: the
//     failure is logged instead.
//
// OnRemoved only fires for announced removals — Reconcile's sweep and a launch rollback
// are startup/failure housekeeping no client ever saw a row for
// (kb:anchor/ws.session-removed: "Startup sweeps send nothing").
func (m *Manager) removeSessionRecord(ctx context.Context, id int64, announced bool) error {
	m.mu.Lock()
	wait, done := m.nextWriteTurnLocked(id)
	m.mu.Unlock()
	if wait != nil {
		<-wait
	}
	defer done()

	if err := m.store.DeleteSession(ctx, id); err != nil {
		if !announced {
			// Still surfaced to the caller below (a real DB failure is worth knowing
			// about), but memory drops regardless — see the announced=false case above.
			m.log.Warn().Err(err).Int64("session_id", id).Msg("removing never-announced session's row failed; dropping it from memory anyway")
			m.dropSessionFromMemory(id)
		}
		return fmt.Errorf("removing session %d: %w", id, err)
	}
	m.dropSessionFromMemory(id)

	if announced && m.onRemoved != nil {
		m.onRemoved(id)
	}
	return nil
}

// collectSessions builds a worklist from every session for which include reports true,
// taking a value under m.mu via take — the shared shape behind Reconcile's ownership
// classification, EndAll's alive-id worklist and checkLiveness's alive-target worklist.
func collectSessions[T any](m *Manager, include func(*Session) bool, take func(*Session) T) []T {
	m.mu.Lock()
	defer m.mu.Unlock()
	var out []T
	for _, s := range m.sessions {
		if include(s) {
			out = append(out, take(s))
		}
	}
	return out
}

// sessionRef is a value-copy of one session's id/alive/target taken under m.mu — the
// shape every locked "collect these fields, then work with them after releasing the
// lock" loop needs, since a *Session's fields are mutable only while mu is held. A caller
// uses only the fields relevant to it.
type sessionRef struct {
	id     int64
	alive  bool
	target string
}

// Get returns session id's current snapshot, if known — used by the terminal bridge's
// pre-upgrade checks (kb:anchor/terminal.ws: 404 unknown id, 409 not_attachable when
// Alive is false).
func (m *Manager) Get(id int64) (*Session, bool) {
	m.mu.Lock()
	defer m.mu.Unlock()
	sess, ok := m.sessions[id]
	if !ok {
		return nil, false
	}
	return sess.Clone(), true
}

// Exists reports whether id is a known (not necessarily alive) Muster session — used
// by the ingest worker to validate an envelope's musterSession before trusting it: a
// stale envelope naming an id that no longer exists must persist unrouted, never bind.
func (m *Manager) Exists(id int64) bool {
	m.mu.Lock()
	defer m.mu.Unlock()
	_, ok := m.sessions[id]
	return ok
}

// Resolve returns the Muster session bound to a Claude session id, if any — the routing
// rule for every non-binding event (kb:adr/ingest-envelope-authoritative-binding).
func (m *Manager) Resolve(claudeSessionID string) (int64, bool) {
	m.mu.Lock()
	defer m.mu.Unlock()
	id, ok := m.byClaude[claudeSessionID]
	return id, ok
}

// PaneOf returns id's recorded tmux pane, if id is known — the ingest worker's
// corroboration read (kb:adr/ingest-envelope-pane-must-corroborate): an empty pane with
// ok true is the spawn-to-record window, not "unknown".
func (m *Manager) PaneOf(id int64) (pane string, ok bool) {
	m.mu.Lock()
	defer m.mu.Unlock()
	sess, ok := m.sessions[id]
	if !ok {
		return "", false
	}
	return sess.TmuxPane, true
}

// List returns every known session (order unspecified — the client sorts).
func (m *Manager) List() []*Session {
	m.mu.Lock()
	defer m.mu.Unlock()
	out := make([]*Session, 0, len(m.sessions))
	for _, s := range m.sessions {
		out = append(out, s.Clone())
	}
	return out
}

func (m *Manager) broadcast(s *Session) {
	if m.onUpsert != nil {
		m.onUpsert(s)
	}
}
