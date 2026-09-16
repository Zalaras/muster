package session

import (
	"context"
	"errors"
	"fmt"
	"strconv"
	"strings"
	"sync"
	"sync/atomic"
	"time"

	"github.com/rs/zerolog"

	"github.com/Zalaras/muster/internal/claudecode"
	"github.com/Zalaras/muster/internal/store"
	"github.com/Zalaras/muster/internal/tmux"
)

// PaneChecker reports whether a tmux pane still exists — the liveness poll's only
// signal (kb:anchor/state.liveness; never terminal output, CLAUDE.md hard rule). Defined here
// because internal/session is the consumer; internal/tmux.Client satisfies it.
type PaneChecker interface {
	PaneExists(ctx context.Context, target string) (bool, error)
}

// PaneSnapshotter captures a live pane's current screen text (m4-reconcile REQ-4) —
// display source only, never read by the state machine and never logged (may hold
// prompt text). internal/tmux.Client satisfies it.
type PaneSnapshotter interface {
	CapturePane(ctx context.Context, target string) (string, error)
}

// Killer kills a whole tmux session by name and lists what's on the socket — Reconcile's
// unknown-panes check (REQ-2) and End/EndAll's kill path (REQ-5) both need it.
// internal/tmux.Client satisfies it.
type Killer interface {
	KillSession(ctx context.Context, name string) error
	ListSessions(ctx context.Context) ([]string, error)
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
// RepairOwnedSession make (review cycle 1 Major 3 and cycle 2 Minor, REQ-12): all three
// run under a per-session-id lock acquired by End/Remove/Resume, so a wedged tmux there
// no longer just hangs one request — it wedges every later End/Resume/Remove for that
// same id, permanently. Mirrors shellTmuxTimeout's value (internal/server/shells.go).
const endRemoveTmuxTimeout = 5 * time.Second

// Config wires a Manager. Built by internal/server; nothing here starts a goroutine
// until Start is called.
type Config struct {
	Store           *store.Store
	Logger          zerolog.Logger
	PaneChecker     PaneChecker
	PaneSnapshotter PaneSnapshotter // m4-reconcile REQ-4; may be nil (snapshot capture becomes a no-op)
	SessionKiller   Killer          // m4-reconcile REQ-2/REQ-5; may be nil (Reconcile's unknown-panes check and End/EndAll's kill become no-ops)
	OnUpsert        func(*Session)  // broadcasts a sessionUpsert; may be nil in tests
	OnRemoved       func(id int64)  // broadcasts sessionRemoved (m4-reconcile REQ-6); may be nil in tests
	PollInterval    time.Duration   // 0 uses defaultPollInterval
}

// Manager is the in-memory session registry and the kb:anchor/state state machine's home. Every
// mutation persists the full row and (unless OnUpsert is nil) broadcasts the fresh
// Session — the "whole-object sessionUpsert" design (kb:anchor/ws.session).
type Manager struct {
	store           *store.Store
	log             zerolog.Logger
	paneChecker     PaneChecker
	paneSnapshotter PaneSnapshotter
	sessionKiller   Killer
	onUpsert        func(*Session)
	onRemoved       func(id int64)
	interval        time.Duration

	mu       sync.Mutex
	sessions map[int64]*Session
	byClaude map[string]int64 // claude session id -> muster session id

	// idLocks is session-lifecycle REQ-11's per-session-id lock, guarded by mu itself
	// (map access only — never held across tmux I/O). LockSession serialises one id's
	// Launch/Resume/End/Remove check-then-act without blocking a different id's; Remove
	// reclaims an id's entry once its row is gone (the id is never reissued, so nothing
	// after that could ever contend on it again).
	idLocks map[int64]*sync.Mutex

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

// LockSession acquires id's per-session lock (REQ-11) and returns the func that releases
// it. Held across a whole logical action — including its tmux I/O — never across mu
// itself; internal/server's sessionLauncher uses this directly to serialise Launch and
// Resume the same way End/Remove do internally.
func (m *Manager) LockSession(id int64) (unlock func()) {
	m.mu.Lock()
	if m.idLocks == nil {
		m.idLocks = make(map[int64]*sync.Mutex)
	}
	l, ok := m.idLocks[id]
	if !ok {
		l = &sync.Mutex{}
		m.idLocks[id] = l
	}
	m.mu.Unlock()

	l.Lock()
	return l.Unlock
}

// NewManager builds a Manager. Call LoadAll then Start once the caller is ready.
func NewManager(cfg Config) *Manager {
	interval := cfg.PollInterval
	if interval <= 0 {
		interval = defaultPollInterval
	}
	return &Manager{
		store:           cfg.Store,
		log:             cfg.Logger,
		paneChecker:     cfg.PaneChecker,
		paneSnapshotter: cfg.PaneSnapshotter,
		sessionKiller:   cfg.SessionKiller,
		onUpsert:        cfg.OnUpsert,
		onRemoved:       cfg.OnRemoved,
		interval:        interval,
		sessions:        make(map[int64]*Session),
		byClaude:        make(map[string]int64),
	}
}

// LoadAll reloads every persisted session into memory (daemon-restart reconcile,
// Edge Case 7 — the liveness poll re-evaluates alive on its own next tick).
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
	return nil
}

// Start begins the liveness poll loop. Call once, after LoadAll.
func (m *Manager) Start() {
	ctx, cancel := context.WithCancel(context.Background())
	m.cancel = cancel
	m.wg.Add(1)
	go func() {
		defer m.wg.Done()
		m.pollLoop(ctx)
	}()
}

// Stop cancels the poll loop and waits for it to exit, giving up when ctx is done. Also
// flags checkOneLiveness's opportunistic callers (see the stopped field doc) to stop
// persisting — set first, so it takes effect for a Nudge racing this call regardless of
// how long the poll-loop wait below takes.
func (m *Manager) Stop(ctx context.Context) {
	m.stopped.Store(true)
	if m.cancel != nil {
		m.cancel()
	}
	done := make(chan struct{})
	go func() {
		m.wg.Wait()
		close(done)
	}()
	select {
	case <-done:
	case <-ctx.Done():
		m.log.Warn().Msg("session manager liveness poll did not stop before shutdown deadline")
	}
}

// CreateParams seeds a new launched session (REQ-1/REQ-2).
type CreateParams struct {
	RepoID          int64
	Directory       string
	Branch          *string
	IsWorktree      bool
	Title           *string
	PermissionMode  PermissionMode
	Model           string
	FirstLaunchHere bool

	// MinID floors the allocated id above this value (0 = no floor) — session-lifecycle
	// REQ-1/REQ-7: the launcher's MaxSessionID probe of the tmux socket, passed straight
	// through to store.InsertSessionParams.MinID.
	MinID int64
}

// CreateSession inserts the session row (tmuxTarget still a placeholder — the launcher
// needs this id to build the tmux pane environment before it can spawn the window,
// plan Implementation Notes) and registers it in memory. No broadcast yet: REQ-2's
// "before any hook can arrive" is satisfied by RecordLaunch, once the real tmux target
// is known.
func (m *Manager) CreateSession(ctx context.Context, p CreateParams) (*Session, error) {
	model := p.Model

	// RailPos = max(existing)+1 (plan order-sidebar REQ-1), computed from the manager's
	// own in-memory registry rather than a separate SQL MAX() query (Implementation
	// Notes: "the manager already holds every session in memory under m.mu").
	m.mu.Lock()
	railPos := m.maxRailPosLocked() + 1
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

// rollbackOnPersistFailure is session-lifecycle REQ-14's shared tail: when persistErr is
// non-nil, it re-locks and applies restore to sess — but only if id still maps to the
// very same *Session (it may have been removed entirely in the meantime) — so a failed
// UpdateSession never leaves memory disagreeing with the DB. Returns persistErr wrapped
// with id and verb, or nil.
func (m *Manager) rollbackOnPersistFailure(id int64, sess *Session, persistErr error, verb string, restore func(*Session)) error {
	if persistErr == nil {
		return nil
	}
	m.mu.Lock()
	if cur, ok := m.sessions[id]; ok && cur == sess {
		restore(cur)
	}
	m.mu.Unlock()
	return fmt.Errorf("%s session %d: %w", verb, id, persistErr)
}

// RecordLaunch stamps the real tmux target/pane once the window has been spawned, and
// broadcasts the session for the first time (REQ-2). REQ-14: a persist failure rolls the
// tmux target/pane back to what they were, so memory never claims a target the DB never
// recorded.
func (m *Manager) RecordLaunch(ctx context.Context, id int64, tmuxTarget, tmuxPane string) (*Session, error) {
	m.mu.Lock()
	sess, ok := m.sessions[id]
	if !ok {
		m.mu.Unlock()
		return nil, fmt.Errorf("recording launch: unknown session %d", id)
	}
	prevTarget, prevPane := sess.TmuxTarget, sess.TmuxPane
	sess.TmuxTarget = tmuxTarget
	sess.TmuxPane = tmuxPane
	row := sessionToRow(sess)
	snapshot := sess.Clone()
	m.mu.Unlock()

	if err := m.store.UpdateSession(ctx, row); err != nil {
		return nil, m.rollbackOnPersistFailure(id, sess, err, "persisting launch for", func(cur *Session) {
			cur.TmuxTarget, cur.TmuxPane = prevTarget, prevPane
		})
	}
	m.broadcast(snapshot)
	return snapshot, nil
}

// DeleteSession removes a session that failed to launch after its row was inserted
// (plan Implementation Notes: "on spawn failure: delete the row").
func (m *Manager) DeleteSession(ctx context.Context, id int64) error {
	m.removeFromMemory(id)
	return m.store.DeleteSession(ctx, id)
}

// removeFromMemory drops id from the in-memory registry and its claude-id index, if
// present. Shared by DeleteSession (launch rollback), Reconcile's sweep (REQ-1) and
// Remove (REQ-6).
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

// sessionTmuxName returns the tmux session name Muster spawns for id ("muster-<id>" —
// internal/tmux.Client.NewSession's own naming), used by End/EndAll to name the kill
// target without needing the live tmuxTarget string.
func sessionTmuxName(id int64) string {
	return "muster-" + strconv.FormatInt(id, 10)
}

// ReconcileReport summarizes what Reconcile did (REQ-17's log line; D9/D10's test
// assertions).
type ReconcileReport struct {
	KeptAlive       int
	MarkedEnded     int
	Swept           int
	UnknownSessions []string // muster-<n> tmux sessions on the socket with no row (REQ-2)
	// ShellsKilled counts "muster-<n>-shell" tmux sessions killed unconditionally
	// (kb:anchor/state.liveness, plan plain-terminal-session REQ-10) — never adopted, and
	// never listed in UnknownSessions.
	ShellsKilled int
}

// targetResolver is session-lifecycle REQ-9's repair primitive: given a live
// "muster-<id>" tmux session name, resolve its actual window/pane target. It is
// deliberately not part of the Killer interface — Killer test doubles (fakeKiller) never
// implement it, so Manager discovers the capability with an optional type-assertion on
// sessionKiller; a real *tmux.Client satisfies it and enables repair, a fake safely
// leaves it disabled.
type targetResolver interface {
	ResolveSessionTarget(ctx context.Context, name string) (target, pane string, err error)
}

// Reconcile runs once at daemon startup, synchronously, before the first snapshot is
// served (REQ-1/REQ-2/REQ-17, kb:anchor/state.liveness). Call after LoadAll and before
// Start. session-lifecycle REQ-9 rewrote this to classify every known row from **one**
// ListSessions snapshot, by tmux name ownership, rather than trusting the stored
// alive/target — R3's investigation found that reading was never actually cross-checked
// against tmux, only ever produced for a shell-kill/report side effect:
//   - "muster-<id>" present on the socket → the row owns it: re-derive
//     tmux_target/tmux_pane from tmux, keep alive:=true, persist+broadcast only on an
//     actual change (reviveOwnedSession). This is what stops a live pane from ever being
//     deleted, whatever the stored alive said (Edge Cases 5/6/7/8).
//   - "muster-<id>" absent, row alive=true → marked ended and kept (the resume chance
//     is not lost; the *following* startup's absent case sweeps it).
//   - "muster-<id>" absent, row alive=false → swept (deleted; already had its resume
//     chance in an earlier daemon lifetime).
//   - "muster-<n>" with no matching row → reported in UnknownSessions and warn-logged;
//     never adopted, never killed (kb:adr/lifecycle-reconcile-before-first-snapshot) —
//     its id still raises the watermark so it can never be handed to a new row.
//   - "muster-<n>-shell" → killed unconditionally, whatever its <n>; never adopted or
//     reported unknown; its id also raises the watermark.
//
// A handful of tests predating REQ-9 construct a Manager with no SessionKiller at all —
// there is then no way to ever enumerate the socket, so classifySessions (the pre-REQ-9
// alive+PaneExists logic, unchanged) is the only option and remains the fallback for that
// case.
//
// D26/review cycle 2 Major: a ListSessions call that itself fails is a different case and
// must NOT fall back to classifySessions — its `!r.alive { sweep }` branch has no pane
// check at all, so on a socket that briefly can't be reached it would delete every
// not-alive row while their panes are still running, which is the exact orphan class this
// plan exists to close, reached from a new direction. Instead Reconcile acts on nothing
// this cycle and leaves every row untouched; the next successful poll reconciles once the
// socket is reachable again.
//
// REQ-10: unlike before, a markEnded/DeleteSession failure during the act phase is
// logged and does not stop the rest — in particular the shell sweep, which now runs
// before the act phase, always happens regardless.
func (m *Manager) Reconcile(ctx context.Context) (ReconcileReport, error) {
	var report ReconcileReport

	if m.sessionKiller == nil {
		toEnd, toSweep := m.classifySessions(ctx, &report)
		m.actOnReconcile(ctx, &report, toEnd, toSweep)
		m.logReconcile(report)
		return report, nil
	}

	names, err := m.sessionKiller.ListSessions(ctx)
	if err != nil {
		m.log.Warn().Err(err).Msg("reconcile: listing tmux sessions failed; taking no action this cycle")
		m.logReconcile(report)
		return report, nil
	}

	toEnd, toSweep := m.classifySessionsByOwnership(ctx, names, &report)
	m.actOnReconcile(ctx, &report, toEnd, toSweep)
	m.logReconcile(report)
	return report, nil
}

func (m *Manager) logReconcile(report ReconcileReport) {
	m.log.Info().
		Int("kept_alive", report.KeptAlive).
		Int("marked_ended", report.MarkedEnded).
		Int("swept", report.Swept).
		Int("shells_killed", report.ShellsKilled).
		Msg("reconciled sessions")
}

// actOnReconcile is Reconcile's act phase, shared by every classification path: mark
// every toEnd id ended, then delete every toSweep id. REQ-10: a single id's failure is
// logged and does not stop the rest.
func (m *Manager) actOnReconcile(ctx context.Context, report *ReconcileReport, toEnd, toSweep []int64) {
	for _, id := range toEnd {
		if _, err := m.markEnded(ctx, id); err != nil {
			m.log.Error().Err(err).Int64("session_id", id).Msg("reconcile: marking session ended failed")
			continue
		}
		report.MarkedEnded++
	}
	for _, id := range toSweep {
		m.removeFromMemory(id)
		if err := m.store.DeleteSession(ctx, id); err != nil {
			m.log.Error().Err(err).Int64("session_id", id).Msg("reconcile: sweeping session failed")
			continue
		}
		report.Swept++
	}
}

// classifySessionsByOwnership is REQ-9's classification: names is one ListSessions
// snapshot. Every known row present in it is revived/repaired in place (KeptAlive);
// every known row absent from it follows the old alive-based rule exactly (returned via
// toEnd/toSweep for actOnReconcile). Unknown muster-<n> names are reported+logged and
// muster-<n>-shell names are killed unconditionally — both raise the id watermark.
func (m *Manager) classifySessionsByOwnership(ctx context.Context, names []string, report *ReconcileReport) (toEnd, toSweep []int64) {
	m.mu.Lock()
	rows := make([]reconcileRow, 0, len(m.sessions))
	knownIDs := make(map[int64]bool, len(m.sessions))
	for id, sess := range m.sessions {
		rows = append(rows, reconcileRow{id: id, alive: sess.Alive})
		knownIDs[id] = true
	}
	m.mu.Unlock()

	classified := classifyTmuxNames(names, knownIDs)

	resolver, canResolve := m.sessionKiller.(targetResolver)
	for _, r := range rows {
		name, present := classified.live[r.id]
		if present {
			m.reviveOwnedSession(ctx, r.id, name, resolver, canResolve)
			report.KeptAlive++
			continue
		}
		if r.alive {
			toEnd = append(toEnd, r.id)
		} else {
			toSweep = append(toSweep, r.id)
		}
	}

	m.reportAndSweepUnknown(ctx, classified, report)
	return toEnd, toSweep
}

// reconcileRow is a value-copy snapshot of one in-memory session's id/alive, taken under
// m.mu — the shape classifySessionsByOwnership's row-by-row classification operates on
// once the lock is released.
type reconcileRow struct {
	id    int64
	alive bool
}

// classifiedTmuxNames is classifyTmuxNames' pure result: names split into the live
// muster-<id> claude-pane names found (known or not — the caller decides), the
// muster-<id>-shell ids to kill unconditionally, the unknown names to report, and the
// highest id seen across every shape (REQ-9's watermark-raise floor).
type classifiedTmuxNames struct {
	live         map[int64]string
	shellIDs     []int64
	unknownNames []string
	maxSeen      int64
}

// classifyTmuxNames is REQ-9's pure name-parsing step, split out of
// classifySessionsByOwnership to keep it under the gocyclo ceiling
// (docs/conventions.md § Go): no tmux I/O, no lock, just tmux.ParseSessionName/
// IsShellSessionName against knownIDs (every id classifySessionsByOwnership's own row
// snapshot already owns a row for).
func classifyTmuxNames(names []string, knownIDs map[int64]bool) classifiedTmuxNames {
	out := classifiedTmuxNames{live: make(map[int64]string)}
	for _, name := range names {
		if shellID, ok := tmux.IsShellSessionName(name); ok {
			out.shellIDs = append(out.shellIDs, shellID)
			if shellID > out.maxSeen {
				out.maxSeen = shellID
			}
			continue
		}
		id, ok := tmux.ParseSessionName(name)
		if !ok {
			// REQ-9/D22: a muster-prefixed name matching neither known shape is still
			// reported+logged as unknown, same as main did before this plan (Edge
			// Case 22) — only a name with no muster- prefix at all is an unrelated
			// tmux session ignored entirely. It contributes no id, so it never raises
			// the watermark.
			if strings.HasPrefix(name, "muster-") {
				out.unknownNames = append(out.unknownNames, name)
			}
			continue
		}
		out.live[id] = name
		if id > out.maxSeen {
			out.maxSeen = id
		}
		if !knownIDs[id] {
			out.unknownNames = append(out.unknownNames, name)
		}
	}
	return out
}

// reportAndSweepUnknown is classifySessionsByOwnership's tail: report+log every unknown
// muster-<n> (never adopted, never killed), kill every muster-<n>-shell unconditionally,
// and raise the id watermark above every id seen either way (REQ-9).
func (m *Manager) reportAndSweepUnknown(ctx context.Context, classified classifiedTmuxNames, report *ReconcileReport) {
	for _, name := range classified.unknownNames {
		report.UnknownSessions = append(report.UnknownSessions, name)
		m.log.Warn().Str("tmux_session", name).Msg("unknown muster tmux session on socket; not adopted")
	}
	for _, shellID := range classified.shellIDs {
		name := tmux.ShellSessionName(shellID)
		if err := m.sessionKiller.KillSession(ctx, name); err != nil {
			m.log.Warn().Err(err).Str("tmux_session", name).Int64("session_id", shellID).Msg("reconcile: killing orphaned shell session failed")
			continue
		}
		report.ShellsKilled++
	}

	if classified.maxSeen > 0 {
		if err := m.store.BumpIDWatermark(ctx, classified.maxSeen); err != nil {
			m.log.Warn().Err(err).Msg("reconcile: raising session id watermark failed")
		}
	}
}

// RepairOwnedSession re-derives id's tmux_target/tmux_pane from a muster-<id> tmux
// session that is live even though the row does not currently believe it owns it —
// REQ-8's resume repair: when sessionLauncher.Resume's own spawn collides with
// ErrSessionExists, a live muster-<id> under a not-alive row *is* that row's own pane
// (Edge Case 6: a SIGKILL landed between an earlier resume's spawn and its persist, or a
// race with Reconcile). Returns ErrUnknownSession for an unknown id, or an error naming
// what went wrong if no live pane can actually be confirmed (no target resolver wired, or
// the tmux session named by id turns out not to exist after all) — the caller turns
// that into 500 launch_failed without ever quoting raw tmux stderr.
func (m *Manager) RepairOwnedSession(ctx context.Context, id int64) (*Session, error) {
	resolver, canResolve := m.sessionKiller.(targetResolver)
	if !canResolve {
		return nil, fmt.Errorf("repairing session %d: no tmux target resolver available", id)
	}
	resolveCtx, cancel := context.WithTimeout(ctx, endRemoveTmuxTimeout)
	target, pane, err := resolver.ResolveSessionTarget(resolveCtx, sessionTmuxName(id))
	cancel()
	if err != nil {
		return nil, fmt.Errorf("repairing session %d: %w", id, err)
	}

	m.mu.Lock()
	sess, ok := m.sessions[id]
	if !ok {
		m.mu.Unlock()
		return nil, ErrUnknownSession
	}
	sess.Alive = true
	sess.EndedAt = nil
	sess.TmuxTarget = target
	sess.TmuxPane = pane
	row := sessionToRow(sess)
	snapshot := sess.Clone()
	m.mu.Unlock()

	if err := m.store.UpdateSession(ctx, row); err != nil {
		return nil, fmt.Errorf("persisting repaired session %d: %w", id, err)
	}
	m.broadcast(snapshot)
	return snapshot, nil
}

// reviveOwnedSession is REQ-9's repair step for a row whose muster-<id> tmux session is
// present on the socket: it is kept alive (reviving an alive=false row rather than
// leaving it swept, D9) and, when canResolve, has its tmux_target/tmux_pane re-derived
// from tmux and persisted+broadcast only if either actually changed (D8/D10). A resolve
// failure (tmux raced the ListSessions snapshot) is warn-logged and leaves the stored
// target as-is rather than blocking the alive revival.
func (m *Manager) reviveOwnedSession(ctx context.Context, id int64, tmuxName string, resolver targetResolver, canResolve bool) {
	var target, pane string
	if canResolve {
		var err error
		target, pane, err = resolver.ResolveSessionTarget(ctx, tmuxName)
		if err != nil {
			m.log.Warn().Err(err).Str("tmux_session", tmuxName).Int64("session_id", id).Msg("reconcile: resolving live session's target failed")
		}
	}

	m.mu.Lock()
	sess, ok := m.sessions[id]
	if !ok {
		m.mu.Unlock()
		return
	}
	changed := false
	if !sess.Alive {
		sess.Alive = true
		sess.EndedAt = nil
		changed = true
	}
	if target != "" && (sess.TmuxTarget != target || sess.TmuxPane != pane) {
		sess.TmuxTarget = target
		sess.TmuxPane = pane
		changed = true
	}
	if !changed {
		m.mu.Unlock()
		return
	}
	row := sessionToRow(sess)
	snapshot := sess.Clone()
	m.mu.Unlock()

	if err := m.store.UpdateSession(ctx, row); err != nil {
		m.log.Warn().Err(err).Int64("session_id", id).Msg("reconcile: persisting repaired session failed")
		return
	}
	m.broadcast(snapshot)
}

// classifySessions is Reconcile's first phase: it snapshots the registry under m.mu,
// releases the lock, and only then asks tmux which panes still exist, returning the ids
// to mark ended and the ids to sweep. It writes only report.KeptAlive; the caller owns
// every mutation that follows.
//
// The lock is taken for the snapshot alone and released before the PaneExists calls —
// those are tmux I/O and must never run under m.mu.
func (m *Manager) classifySessions(ctx context.Context, report *ReconcileReport) (toEnd, toSweep []int64) {
	type row struct {
		id     int64
		alive  bool
		target string
	}

	m.mu.Lock()
	rows := make([]row, 0, len(m.sessions))
	for id, sess := range m.sessions {
		rows = append(rows, row{id: id, alive: sess.Alive, target: sess.TmuxTarget})
	}
	m.mu.Unlock()

	for _, r := range rows {
		if !r.alive {
			toSweep = append(toSweep, r.id)
			continue
		}
		exists := true
		if m.paneChecker != nil {
			var err error
			exists, err = m.paneChecker.PaneExists(ctx, r.target)
			if err != nil {
				m.log.Warn().Err(err).Str("tmux_target", r.target).Msg("reconcile: liveness check failed; leaving session as-is")
				report.KeptAlive++
				continue
			}
		}
		if exists {
			report.KeptAlive++
		} else {
			toEnd = append(toEnd, r.id)
		}
	}
	return toEnd, toSweep
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
// by the ingest worker to validate an envelope's musterSession before trusting it
// (Edge Case 12: a stale env must persist unrouted, never bind).
func (m *Manager) Exists(id int64) bool {
	m.mu.Lock()
	defer m.mu.Unlock()
	_, ok := m.sessions[id]
	return ok
}

// Resolve returns the Muster session bound to a Claude session id, if any (REQ-7's
// routing rule for every non-binding event).
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

// Apply feeds one already-routed, already-persisted event into the state machine
// (kb:anchor/state.transitions) and persists + broadcasts the result. claudeSessionID and promptID
// are generic identifiers, not Claude Code payload vocabulary; input is the neutral
// StateInput the claudecode interpreter derived.
//
// enveloped is m4-hook-lifetime's REQ-9 binding-authority signal: it is true iff the
// ingest post carried the kb:anchor/ingest.envelope envelope (i.e. arrived through Muster's own command
// wrapper, never a raw/legacy post). For an enveloped event whose Kind is not itself a
// binder (KindBind/KindClearRebind/KindResumeBind — those already carry their own bind
// logic via applyInput/applyBind below), this session's *actual* claudeSessionID is
// compared against the one this event names before applyInput runs:
//   - never bound (ClaudeSessionID == "") → bind it, no state transition (a lost
//     SessionStart, Edge Case 5).
//   - bound to a different id, and that id has never been this session's → the same
//     rebind SessionStart(source:"clear") gets (reset context/compactions, → started),
//     applied first, so the event that follows lands on a freshly-started session
//     (Edge Case 4).
//   - bound to a different id, but `byClaude[claudeSessionID]` already points at *this*
//     session — meaning this session left that id for its current one already — the
//     event is a reordered straggler from a conversation this session has moved on
//     from (typically the `/clear` pair's own `SessionEnd(reason:"clear")`, since
//     delivery is unordered per CLAUDE.md's hard rule). Rebinding is **monotonic**
//     (kb:anchor/ingest.envelope, decided 2026-08-28, review of this plan, Critical 1): it
//     is routed and applied below, but it never rebinds *backwards* — the current
//     binding, context gauge and compaction counter are left untouched (Edge Case 6a).
//
// Raw (non-enveloped) events never take this path (REQ-10): they keep routing by the
// existing byClaude mapping and never bind or rebind. Status-line posts never call Apply
// at all (REQ-11) — they go through ApplyStatus.
//
// Either way, this function does exactly one persist and one broadcast, whether or not
// the rebind branch ran (D18).
func (m *Manager) Apply(ctx context.Context, musterSessionID int64, claudeSessionID string, promptID *string, input claudecode.StateInput, enveloped bool) (*Session, error) {
	now := time.Now().UTC()

	m.mu.Lock()
	sess, ok := m.sessions[musterSessionID]
	if !ok {
		m.mu.Unlock()
		return nil, fmt.Errorf("apply: unknown session %d", musterSessionID)
	}

	if enveloped && !isBindKind(input.Kind) {
		switch {
		case sess.ClaudeSessionID == "":
			sess.ClaudeSessionID = claudeSessionID
			m.byClaude[claudeSessionID] = musterSessionID
		case sess.ClaudeSessionID != claudeSessionID:
			// Monotonic rebind guard (kb:anchor/ingest.envelope, decided 2026-08-28):
			// byClaude never deletes an old claude id on rebind — only a full session
			// removal does that, via removeFromMemory (DeleteSession, Reconcile's
			// sweep, Remove), and Apply would already have failed the m.sessions
			// lookup above in that case, never reaching this branch. So if the
			// incoming id already maps to *this* musterSessionID, this session bound
			// it once before and has since moved on to sess.ClaudeSessionID. That
			// makes the event a reordered straggler, not a forward rebind: route and
			// apply it below (applyInput), but do not reset state/context/compactions
			// and do not move the binding backwards.
			if owner, known := m.byClaude[claudeSessionID]; !known || owner != musterSessionID {
				applyBind(sess, claudeSessionID, claudecode.StateInput{Kind: claudecode.KindClearRebind}, now)
				m.byClaude[claudeSessionID] = musterSessionID
			}
		}
	}

	applyInput(sess, claudeSessionID, promptID, input, now)
	if input.Kind == claudecode.KindBind || input.Kind == claudecode.KindClearRebind {
		m.byClaude[claudeSessionID] = musterSessionID
	}
	row := sessionToRow(sess)
	snapshot := sess.Clone()
	m.mu.Unlock()

	if err := m.store.UpdateSession(ctx, row); err != nil {
		return nil, fmt.Errorf("persisting session %d: %w", musterSessionID, err)
	}
	m.broadcast(snapshot)
	return snapshot, nil
}

// isBindKind reports whether kind is one of the three inputs applyInput itself routes
// to applyBind — Apply's envelope-authoritative rebind check (above) only runs for
// everything else, since these three already carry their own binding semantics.
func isBindKind(kind claudecode.InputKind) bool {
	switch kind {
	case claudecode.KindBind, claudecode.KindClearRebind, claudecode.KindResumeBind:
		return true
	default:
		return false
	}
}

// ApplyStatus applies one routed status-line post's neutral StatusUpdate (REQ-4):
// title, model, and context refresh, whichever fields the payload actually carried.
// Persists and broadcasts sessionUpsert only when a surfaced field actually changed
// (applyStatusUpdate's return value) — status posts fire on every tool use, and a
// no-op upsert on every one of them would spam the wire (INV-5's session-side twin).
// Never a state source (INV-1): applyStatusUpdate has no path to state/stateSince/
// attention/failure/alive/compactions/permissionMode.
func (m *Manager) ApplyStatus(ctx context.Context, musterSessionID int64, update claudecode.StatusUpdate) (*Session, error) {
	m.mu.Lock()
	sess, ok := m.sessions[musterSessionID]
	if !ok {
		m.mu.Unlock()
		return nil, fmt.Errorf("apply status: unknown session %d", musterSessionID)
	}

	// Captured before applyStatusUpdate mutates sess, so the wire-visible delta (REQ-12)
	// can be judged independently of the persist-worthy delta applyStatusUpdate itself
	// reports: Model/Context are always replaced wholesale on a real change (never
	// mutated in place, per applyStatusUpdate's own doc comment), so a pointer
	// inequality after is exactly "this field changed"; DisplayTitle() folds in
	// TitleOverride so a Claude-name-only change while an override is set compares equal.
	beforeDisplay := sess.DisplayTitle()
	beforeModel := sess.Model
	beforeContext := sess.Context

	if !applyStatusUpdate(sess, update) {
		snapshot := sess.Clone()
		m.mu.Unlock()
		return snapshot, nil
	}
	row := sessionToRow(sess)
	snapshot := sess.Clone()
	// REQ-12: a status post that only refreshed Claude's name while an override is set
	// persists the row (Title changed, above — applyStatusUpdate reported it) but must
	// not broadcast — the wire object (DisplayTitle()/model/context) is unchanged, and
	// kb:anchor/ws.session's no-no-op-upserts rule stands.
	broadcast := !stringPtrEqual(beforeDisplay, sess.DisplayTitle()) || beforeModel != sess.Model || beforeContext != sess.Context
	m.mu.Unlock()

	if err := m.store.UpdateSession(ctx, row); err != nil {
		return nil, fmt.Errorf("persisting status update for session %d: %w", musterSessionID, err)
	}
	if broadcast {
		m.broadcast(snapshot)
	}
	return snapshot, nil
}

// SetTitle applies kb:anchor/sessions.title's PUT .../title mutation (REQ-10/REQ-11):
// sets or clears id's title override under the lock and persists+broadcasts iff the
// wire title or the override itself changed — a no-op request (edge cases 3/4) neither
// writes nor broadcasts. Returns ErrUnknownSession for a missing id (the server maps it
// to 404 unknown_session).
func (m *Manager) SetTitle(ctx context.Context, id int64, title *string) (bool, error) {
	m.mu.Lock()
	sess, ok := m.sessions[id]
	if !ok {
		m.mu.Unlock()
		return false, ErrUnknownSession
	}

	beforeDisplay := sess.DisplayTitle()
	beforeOverride := sess.TitleOverride
	sess.TitleOverride = title

	if stringPtrEqual(beforeDisplay, sess.DisplayTitle()) && stringPtrEqual(beforeOverride, sess.TitleOverride) {
		m.mu.Unlock()
		return false, nil
	}

	row := sessionToRow(sess)
	snapshot := sess.Clone()
	m.mu.Unlock()

	if err := m.store.UpdateSession(ctx, row); err != nil {
		return false, fmt.Errorf("persisting title for session %d: %w", id, err)
	}
	m.broadcast(snapshot)
	return true, nil
}

// SetTranscript records id's latest known transcript path (REQ-16), persisting only
// when it actually changed and never broadcasting (D15 — every hook carries the same
// field, and a no-op write per hook would double the ingest worker's SQLite traffic).
// Refused (no persist, changed=false) when claudeSessionID no longer names id's current
// binding — REQ-26/INV-8: a straggler from before a `/clear` must never move the
// transcript backwards. Returns ErrUnknownSession for an unknown id.
func (m *Manager) SetTranscript(ctx context.Context, id int64, claudeSessionID, path string) (bool, error) {
	m.mu.Lock()
	sess, ok := m.sessions[id]
	if !ok {
		m.mu.Unlock()
		return false, ErrUnknownSession
	}
	if sess.ClaudeSessionID != claudeSessionID || sess.TranscriptPath == path {
		m.mu.Unlock()
		return false, nil
	}
	sess.TranscriptPath = path
	row := sessionToRow(sess)
	m.mu.Unlock()

	if err := m.store.UpdateSession(ctx, row); err != nil {
		return false, fmt.Errorf("persisting transcript path for session %d: %w", id, err)
	}
	return true, nil
}

// SetPlan records id's derived plan file (REQ-16/REQ-17/REQ-18), persisting and
// broadcasting a sessionUpsert only when path or exists actually changed. Refused (no
// persist, changed=false, the session's current snapshot returned) when
// claudeSessionID no longer names id's current binding (REQ-26/INV-8) — a straggler's
// scan or write must never move the plan. path == "" is the wire plan:null.
func (m *Manager) SetPlan(ctx context.Context, id int64, claudeSessionID, path string, exists bool) (*Session, bool, error) {
	m.mu.Lock()
	sess, ok := m.sessions[id]
	if !ok {
		m.mu.Unlock()
		return nil, false, ErrUnknownSession
	}
	if sess.ClaudeSessionID != claudeSessionID || (sess.PlanPath == path && sess.PlanExists == exists) {
		snapshot := sess.Clone()
		m.mu.Unlock()
		return snapshot, false, nil
	}
	sess.PlanPath = path
	sess.PlanExists = exists
	row := sessionToRow(sess)
	snapshot := sess.Clone()
	m.mu.Unlock()

	if err := m.store.UpdateSession(ctx, row); err != nil {
		return nil, false, fmt.Errorf("persisting plan for session %d: %w", id, err)
	}
	m.broadcast(snapshot)
	return snapshot, true, nil
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

// Snapshot returns id's last captured pane screen, if any (REQ-4's GET .../pane read
// path) — display source only, never a state source.
func (m *Manager) Snapshot(id int64) (text string, at time.Time, ok bool) {
	m.mu.Lock()
	defer m.mu.Unlock()
	sess, exists := m.sessions[id]
	// LastSnapshotAt.IsZero() (never captured) is the honest sentinel, not
	// LastSnapshot == "" (review cycle 1 Minor 2) — a genuinely blank pane that was
	// captured successfully has LastSnapshot == "" too, and must still serve 200 text,
	// not a 404 no_snapshot claiming nothing was ever captured.
	if !exists || sess.LastSnapshotAt.IsZero() {
		return "", time.Time{}, false
	}
	return sess.LastSnapshot, sess.LastSnapshotAt, true
}

// captureSnapshot runs capture-pane for an alive session and persists the result only
// when it changed (REQ-4). A capture error (Edge Case 9: transient tmux failure) is not
// a pane-missing signal — the previous snapshot is kept and liveness is never touched.
func (m *Manager) captureSnapshot(ctx context.Context, id int64, target string) {
	if m.paneSnapshotter == nil {
		return
	}
	text, err := m.paneSnapshotter.CapturePane(ctx, target)
	if err != nil {
		m.log.Debug().Err(err).Int64("session_id", id).Msg("pane snapshot capture failed")
		return
	}
	m.storeSnapshot(ctx, id, text)
}

// storeSnapshot persists text for id iff it differs from what's already stored
// (REQ-4/Schema Changes: "written only when the text changes"). Never logs text (may
// hold prompt text) and never broadcasts — the snapshot isn't part of the Session wire
// object (kb:anchor/sessions.pane's own GET endpoint serves it).
func (m *Manager) storeSnapshot(ctx context.Context, id int64, text string) {
	m.mu.Lock()
	sess, ok := m.sessions[id]
	// The diff check alone would short-circuit a genuinely blank first capture (zero
	// value LastSnapshot == "" already equals text == ""), leaving LastSnapshotAt zero
	// forever even though a capture did succeed — Snapshot's IsZero() sentinel would then
	// wrongly report "never captured" (review cycle 2 Minor 2). Requiring LastSnapshotAt
	// to already be set before the diff can skip means the very first capture — blank or
	// not — always persists.
	if !ok || (sess.LastSnapshot == text && !sess.LastSnapshotAt.IsZero()) {
		m.mu.Unlock()
		return
	}
	now := time.Now().UTC()
	sess.LastSnapshot = text
	sess.LastSnapshotAt = now
	m.mu.Unlock()

	if err := m.store.UpdateSnapshot(ctx, id, text, now); err != nil {
		m.log.Error().Err(err).Int64("session_id", id).Msg("persisting pane snapshot failed")
	}
}

// End kills a live session's tmux session (REQ-5, kb:anchor/sessions.end): a final pane
// snapshot is captured, then the tmux session is killed, then the existing liveness
// nudge path (checkOneLiveness/markEnded) observes the now-missing pane and does the
// alive:=false persist + broadcast — the same single code path every other death goes
// through (INV-1). Returns ErrUnknownSession (404) or ErrSessionNotAlive (409
// not_alive, already ended).
//
// REQ-11: id's per-session lock is held for the whole check-then-act, so two concurrent
// Ends can never both pass the alive gate. endLocked is split out because Remove also
// needs to run this same body while already holding the lock itself (End's own
// LockSession call would otherwise deadlock against Remove's).
func (m *Manager) End(ctx context.Context, id int64) (*Session, error) {
	unlock := m.LockSession(id)
	defer unlock()
	return m.endLocked(ctx, id)
}

func (m *Manager) endLocked(ctx context.Context, id int64) (*Session, error) {
	m.mu.Lock()
	sess, ok := m.sessions[id]
	if !ok {
		m.mu.Unlock()
		return nil, ErrUnknownSession
	}
	if !sess.Alive {
		m.mu.Unlock()
		return nil, ErrSessionNotAlive
	}
	target := sess.TmuxTarget
	m.mu.Unlock()

	if m.paneSnapshotter != nil {
		snapCtx, cancel := context.WithTimeout(ctx, endRemoveTmuxTimeout)
		text, err := m.paneSnapshotter.CapturePane(snapCtx, target)
		cancel()
		if err != nil {
			m.log.Debug().Err(err).Int64("session_id", id).Msg("final pane snapshot capture failed")
		} else {
			m.storeSnapshot(ctx, id, text)
		}
	}

	if m.sessionKiller != nil {
		killCtx, cancel := context.WithTimeout(ctx, endRemoveTmuxTimeout)
		err := m.sessionKiller.KillSession(killCtx, sessionTmuxName(id))
		cancel()
		if err != nil {
			return nil, fmt.Errorf("ending session %d: %w", id, err)
		}
	}

	if m.paneChecker != nil {
		// endOnCheckError:=true here (review cycle 1 Minor 1): we just killed the tmux
		// session ourselves, so a PaneExists error on this specific check is not an
		// ordinary transient hiccup to shrug off until the next poll — End must not
		// return alive:true after a kill it just performed. The periodic poll/nudge
		// callers below keep the conservative default (leave as-is on a check error).
		checkCtx, cancel := context.WithTimeout(ctx, endRemoveTmuxTimeout)
		m.checkOneLiveness(checkCtx, id, target, true)
		cancel()
	} else if _, err := m.markEnded(ctx, id); err != nil {
		return nil, err
	}

	snapshot, ok := m.Get(id)
	if !ok {
		return nil, ErrUnknownSession
	}
	return snapshot, nil
}

// EndAll ends every currently alive session — the `-on-exit=kill` shutdown path
// (REQ-3): each gets a final snapshot, is killed, and its row is marked alive:false
// before the daemon exits. One session's failure is logged and does not stop the rest.
// Returns how many were successfully ended.
func (m *Manager) EndAll(ctx context.Context) int {
	m.mu.Lock()
	var ids []int64
	for id, sess := range m.sessions {
		if sess.Alive {
			ids = append(ids, id)
		}
	}
	m.mu.Unlock()

	ended := 0
	for _, id := range ids {
		if _, err := m.End(ctx, id); err != nil {
			m.log.Error().Err(err).Int64("session_id", id).Msg("ending session at shutdown failed")
			continue
		}
		ended++
	}
	return ended
}

// shellNamesOnSocket lists every muster-<n>-shell tmux session name currently on the
// socket — KillAllShells and ShellCount's shared read, matching the same
// tmux.IsShellSessionName predicate reconcile's own unconditional shell-kill loop uses
// (reportAndSweepUnknown above). A nil sessionKiller (tests that don't wire one) reads as
// no shells, never an error.
func (m *Manager) shellNamesOnSocket(ctx context.Context) ([]string, error) {
	if m.sessionKiller == nil {
		return nil, nil
	}
	names, err := m.sessionKiller.ListSessions(ctx)
	if err != nil {
		return nil, fmt.Errorf("listing tmux sessions: %w", err)
	}
	var shells []string
	for _, name := range names {
		if _, ok := tmux.IsShellSessionName(name); ok {
			shells = append(shells, name)
		}
	}
	return shells, nil
}

// KillAllShells kills every muster-<n>-shell tmux session on the socket — the
// `-on-exit=kill` shutdown path's shell companion to EndAll (REQ-13,
// kb:adr/surfaces-shell-dies-at-kill-shutdown-too). An already-gone shell counts as
// killed (KillSession's own idempotence, kb:adr/actions-kill-is-idempotent); one shell's
// failure is logged and does not stop the rest. Returns how many were successfully
// killed.
func (m *Manager) KillAllShells(ctx context.Context) (int, error) {
	shells, err := m.shellNamesOnSocket(ctx)
	if err != nil {
		return 0, err
	}
	killed := 0
	for _, name := range shells {
		if err := m.sessionKiller.KillSession(ctx, name); err != nil {
			m.log.Warn().Err(err).Str("tmux_session", name).Msg("shutdown: killing shell session failed")
			continue
		}
		killed++
	}
	return killed, nil
}

// ShellCount counts every muster-<n>-shell tmux session on the socket — the on-exit
// prompt's shell count (REQ-13). A caller treats an error as zero shells and proceeds
// with shutdown regardless (never a blocker).
func (m *Manager) ShellCount(ctx context.Context) (int, error) {
	shells, err := m.shellNamesOnSocket(ctx)
	if err != nil {
		return 0, err
	}
	return len(shells), nil
}

// Remove deletes id's row (REQ-6, kb:anchor/sessions.remove): if alive, the End path runs
// first; a failing kill (End's own error) leaves the row untouched and propagates — never
// a deleted row with a running pane (Edge Case 5). On success the in-memory entry and the
// row are both gone and OnRemoved fires (the sessionRemoved broadcast).
//
// REQ-11: id's per-session lock is held for the whole check-then-act, so a Remove can
// never race a concurrent End/Resume for the same id. It calls endLocked directly (not
// End) — End would try to reacquire the same lock and deadlock.
func (m *Manager) Remove(ctx context.Context, id int64) error {
	unlock := m.LockSession(id)
	defer unlock()

	if err := m.removeLocked(ctx, id); err != nil {
		return err
	}

	// The id is never reissued (REQ-2), so nothing can ever contend on this lock again —
	// reclaim it rather than growing the map for the life of the daemon.
	m.mu.Lock()
	delete(m.idLocks, id)
	m.mu.Unlock()
	return nil
}

func (m *Manager) removeLocked(ctx context.Context, id int64) error {
	m.mu.Lock()
	sess, ok := m.sessions[id]
	if !ok {
		m.mu.Unlock()
		return ErrUnknownSession
	}
	alive := sess.Alive
	m.mu.Unlock()

	switch {
	case alive:
		if _, err := m.endLocked(ctx, id); err != nil {
			return fmt.Errorf("removing session %d: %w", id, err)
		}
	case m.sessionKiller != nil:
		// REQ-15: a not-alive row's muster-<id> tmux session may still be running (an
		// earlier kill silently failed, or a repair raced in) — kill it idempotently
		// (REQ-6 makes "already gone" a success) so Remove can never leave an orphan.
		killCtx, cancel := context.WithTimeout(ctx, endRemoveTmuxTimeout)
		err := m.sessionKiller.KillSession(killCtx, sessionTmuxName(id))
		cancel()
		if err != nil {
			return fmt.Errorf("removing session %d: %w", id, err)
		}
	}

	// REQ-14: the row is deleted before the in-memory entry is dropped, and OnRemoved
	// fires only once both have actually succeeded — a failed delete must never look like
	// a completed remove.
	if err := m.store.DeleteSession(ctx, id); err != nil {
		return fmt.Errorf("removing session %d: %w", id, err)
	}
	m.removeFromMemory(id)
	if m.onRemoved != nil {
		m.onRemoved(id)
	}
	return nil
}

// RecordResume stamps the new tmux target/pane after a successful resume spawn (REQ-7,
// kb:anchor/sessions.resume): alive:=true, endedAt cleared, the stale snapshot cleared (a
// fresh pane has nothing captured yet), persisted and broadcast. state is left
// untouched — it becomes idle only once the enveloped SessionStart(source:"resume")
// arrives (REQ-8, via the ordinary Apply/KindResumeBind path).
func (m *Manager) RecordResume(ctx context.Context, id int64, tmuxTarget, tmuxPane string) (*Session, error) {
	m.mu.Lock()
	sess, ok := m.sessions[id]
	if !ok {
		m.mu.Unlock()
		return nil, ErrUnknownSession
	}
	prevTarget, prevPane := sess.TmuxTarget, sess.TmuxPane
	prevAlive := sess.Alive
	prevEndedAt := sess.EndedAt
	prevSnapshot := sess.LastSnapshot
	prevSnapshotAt := sess.LastSnapshotAt

	sess.TmuxTarget = tmuxTarget
	sess.TmuxPane = tmuxPane
	sess.Alive = true
	sess.EndedAt = nil
	sess.LastSnapshot = ""
	sess.LastSnapshotAt = time.Time{}
	row := sessionToRow(sess)
	snapshot := sess.Clone()
	m.mu.Unlock()

	// REQ-14: a persist failure rolls every field back — a half-resumed session must
	// never look alive in memory while the DB still has it dead.
	if err := m.store.UpdateSession(ctx, row); err != nil {
		return nil, m.rollbackOnPersistFailure(id, sess, err, "persisting resume for", func(cur *Session) {
			cur.TmuxTarget, cur.TmuxPane = prevTarget, prevPane
			cur.Alive = prevAlive
			cur.EndedAt = prevEndedAt
			cur.LastSnapshot = prevSnapshot
			cur.LastSnapshotAt = prevSnapshotAt
		})
	}
	m.broadcast(snapshot)
	return snapshot, nil
}

// maxRailPosLocked returns the largest RailPos among known sessions, or -1 when there
// are none — CreateSession adds 1 to get "opened order = bottom of the unpinned block"
// (REQ-1). Must be called with m.mu held.
func (m *Manager) maxRailPosLocked() int64 {
	highest := int64(-1)
	for _, s := range m.sessions {
		if s.RailPos > highest {
			highest = s.RailPos
		}
	}
	return highest
}

// railEntriesLocked returns a railEntry view of every known session — the pure input
// railorder.go's applyPin/applyOrder operate over. Must be called with m.mu held.
func (m *Manager) railEntriesLocked() []railEntry {
	out := make([]railEntry, 0, len(m.sessions))
	for _, s := range m.sessions {
		out = append(out, railEntry{ID: s.ID, Pinned: s.Pinned, RailPos: s.RailPos})
	}
	return out
}

// applyRailChangesLocked writes each changed entry's Pinned/RailPos into the live
// in-memory session and returns value-copy snapshots to persist and broadcast once
// unlocked. Must be called with m.mu held; entries naming a session no longer present
// (removed between the read and the write) are silently skipped.
func (m *Manager) applyRailChangesLocked(changed []railEntry) []*Session {
	snapshots := make([]*Session, 0, len(changed))
	for _, c := range changed {
		sess, ok := m.sessions[c.ID]
		if !ok {
			continue
		}
		sess.Pinned = c.Pinned
		sess.RailPos = c.RailPos
		snapshots = append(snapshots, sess.Clone())
	}
	return snapshots
}

// persistAndBroadcastRail persists and broadcasts each of snapshots in turn — the tail
// shared by SetPinned/SetOrder once the in-memory mutation is done and the lock
// released (REQ-3/REQ-4: "every session whose pinned or railPos changed is broadcast").
// Stops and returns the first persist error, wrapped with the session id; sessions
// already persisted in this call have already been broadcast.
func (m *Manager) persistAndBroadcastRail(ctx context.Context, snapshots []*Session) error {
	for _, snap := range snapshots {
		if err := m.store.UpdateSession(ctx, sessionToRow(snap)); err != nil {
			return fmt.Errorf("persisting rail order for session %d: %w", snap.ID, err)
		}
		m.broadcast(snap)
	}
	return nil
}

// SetPinned applies kb:anchor/sessions.pin's pin mutation to id: pins or unpins it,
// renumbering whatever the invariant requires (railorder.go's applyPin), and persists +
// broadcasts every session whose pinned or railPos changed — nothing when id was
// already in the requested state (D8, INV-5). Returns ErrUnknownSession if id doesn't
// exist (the server maps it to 404 unknown_session).
func (m *Manager) SetPinned(ctx context.Context, id int64, pinned bool) error {
	m.mu.Lock()
	changed, err := applyPin(m.railEntriesLocked(), id, pinned)
	if err != nil {
		m.mu.Unlock()
		return err
	}
	snapshots := m.applyRailChangesLocked(changed)
	m.mu.Unlock()

	return m.persistAndBroadcastRail(ctx, snapshots)
}

// SetOrder applies kb:anchor/sessions.order's full rail-order mutation: the pure
// applyOrder computes the new (pinned, railPos) for every session, and this persists +
// broadcasts only the ones that changed. Returns ErrInvalidOrder for a malformed
// request (the server maps it to 400 invalid_request) — nothing changes on that path.
func (m *Manager) SetOrder(ctx context.Context, ids []int64, pinnedCount int) error {
	m.mu.Lock()
	changed, err := applyOrder(m.railEntriesLocked(), ids, pinnedCount)
	if err != nil {
		m.mu.Unlock()
		return err
	}
	snapshots := m.applyRailChangesLocked(changed)
	m.mu.Unlock()

	return m.persistAndBroadcastRail(ctx, snapshots)
}

func (m *Manager) broadcast(s *Session) {
	if m.onUpsert != nil {
		m.onUpsert(s)
	}
}

func (m *Manager) pollLoop(ctx context.Context) {
	ticker := time.NewTicker(m.interval)
	defer ticker.Stop()
	for {
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
			m.checkLiveness(ctx)
		}
	}
}

// checkLiveness polls every alive, fully-launched session's pane and flips it dead on
// the first miss (kb:anchor/state.liveness). State is never touched here.
func (m *Manager) checkLiveness(ctx context.Context) {
	if m.paneChecker == nil {
		return
	}

	// REQ-16/D17: one ListSessions call confirms the tmux server itself is reachable
	// before any pane is believed gone — a server-level failure (tmux unreachable) is
	// transient and must leave every session as-is for the next tick, never read as N
	// simultaneous deaths. Deliberately once per sweep, not once per session.
	if m.sessionKiller != nil {
		if _, err := m.sessionKiller.ListSessions(ctx); err != nil {
			m.log.Warn().Err(err).Msg("liveness sweep: tmux server unreachable; leaving sessions as-is")
			return
		}
	}

	// Collect value copies, not *Session pointers, under the lock (review Major 8):
	// holding a live pointer and reading its field after Unlock races with any writer
	// (e.g. RecordLaunch) mutating the same field concurrently.
	type livenessTarget struct {
		id     int64
		target string
	}
	m.mu.Lock()
	var targets []livenessTarget
	for _, s := range m.sessions {
		if s.Alive && s.TmuxTarget != "" {
			targets = append(targets, livenessTarget{id: s.ID, target: s.TmuxTarget})
		}
	}
	m.mu.Unlock()

	for _, target := range targets {
		m.checkOneLiveness(ctx, target.id, target.target, false)
	}
}

// Nudge immediately re-checks one session's pane liveness rather than waiting for the
// next poll tick (kb:anchor/terminal.ws: a PTY EOF should promptly flip alive:false — "the daemon
// also nudges the liveness poll" — rather than lagging up to the ~5s interval).
func (m *Manager) Nudge(ctx context.Context, sessionID int64) {
	if m.paneChecker == nil {
		return
	}
	m.mu.Lock()
	sess, ok := m.sessions[sessionID]
	var target string
	if ok {
		target = sess.TmuxTarget
	}
	m.mu.Unlock()
	if !ok || target == "" {
		return
	}
	m.checkOneLiveness(ctx, sessionID, target, false)
}

// checkOneLiveness is checkLiveness/Nudge/End's shared body: check one target's pane,
// capture a fresh snapshot while it's alive (REQ-4), and flip the session dead on the
// first miss. endOnCheckError controls what happens when PaneExists itself errors
// (distinct from a clean "pane not found"): the periodic poll/nudge callers pass false
// and leave the session as-is for the next tick (an ordinary transient tmux hiccup —
// review cycle 1 Minor 1), while End passes true because it just killed the session
// itself and a check error there must not leave End reporting alive:true.
func (m *Manager) checkOneLiveness(ctx context.Context, id int64, target string, endOnCheckError bool) {
	exists, err := m.paneChecker.PaneExists(ctx, target)
	if err != nil {
		m.log.Warn().Err(err).Str("tmux_target", target).Msg("liveness check failed")
		if !endOnCheckError {
			return
		}
	} else if exists {
		m.captureSnapshot(ctx, id, target)
		return
	}

	if !endOnCheckError && m.stopped.Load() {
		// Shutdown's Stop has already run (stopped field doc): an opportunistic
		// poll/nudge that was in flight before shutdown began must not persist a
		// pane-gone result after it — shutdown's own on-exit policy or the next boot's
		// reconcile owns the final word now.
		return
	}

	if _, err := m.markEnded(ctx, id); err != nil && !errors.Is(err, ErrUnknownSession) {
		m.log.Error().Err(err).Int64("session_id", id).Msg("persisting liveness update failed")
	}
}

// markEnded flips one session's alive to false with endedAt=now, persists the whole row,
// and broadcasts. Idempotent (already-ended is a no-op, no double broadcast). Shared by
// checkOneLiveness (the ordinary poll/nudge path), Reconcile's mark-ended rows, and End
// (via its own liveness nudge — Implementation Notes: "final snapshot → kill-session →
// liveness nudge"). REQ-14/D16: a persist failure rolls the alive/endedAt flip back, so
// the next poll tick re-checks the session instead of the daemon silently believing it
// dead while the DB still says alive.
func (m *Manager) markEnded(ctx context.Context, id int64) (*Session, error) {
	m.mu.Lock()
	sess, ok := m.sessions[id]
	if !ok {
		m.mu.Unlock()
		return nil, ErrUnknownSession
	}
	if !sess.Alive {
		snapshot := sess.Clone()
		m.mu.Unlock()
		return snapshot, nil
	}
	prevEndedAt := sess.EndedAt
	sess.Alive = false
	endedAt := time.Now().UTC()
	sess.EndedAt = &endedAt
	row := sessionToRow(sess)
	snapshot := sess.Clone()
	m.mu.Unlock()

	if err := m.store.UpdateSession(ctx, row); err != nil {
		return nil, m.rollbackOnPersistFailure(id, sess, err, "persisting ended", func(cur *Session) {
			cur.Alive = true
			cur.EndedAt = prevEndedAt
		})
	}
	m.broadcast(snapshot)
	return snapshot, nil
}

// applyReaderRowFields copies the reader's optional TranscriptPath/PlanPath columns onto
// s — split out of rowToSession to keep it under the gocyclo ceiling (docs/conventions.md
// § Go): two more inline ifs there would have pushed it over 15.
func applyReaderRowFields(s *Session, row store.SessionRow) {
	if row.TranscriptPath != nil {
		s.TranscriptPath = *row.TranscriptPath
	}
	if row.PlanPath != nil {
		s.PlanPath = *row.PlanPath
	}
}

func rowToSession(row store.SessionRow) *Session {
	s := &Session{
		ID:                   row.ID,
		TmuxTarget:           row.TmuxTarget,
		RepoID:               row.RepoID,
		Directory:            row.Directory,
		Branch:               row.Branch,
		IsWorktree:           row.IsWorktree,
		Title:                row.Title,
		State:                State(row.State),
		StateSince:           row.StateSince,
		PermissionMode:       PermissionMode(row.PermissionMode),
		PermissionModeSource: row.PermissionModeSource,
		Compactions:          row.Compactions,
		LastActivity:         row.LastActivity,
		Alive:                row.Alive,
		EndedAt:              row.EndedAt,
		FirstLaunchHere:      row.FirstLaunchHere,
		CreatedAt:            row.CreatedAt,
		Pinned:               row.Pinned,
		RailPos:              row.RailPos,
		TitleOverride:        row.TitleOverride,
		PlanExists:           row.PlanExists,
	}
	applyReaderRowFields(s, row)
	if row.TmuxPane != nil {
		s.TmuxPane = *row.TmuxPane
	}
	if row.ClaudeSessionID != nil {
		s.ClaudeSessionID = *row.ClaudeSessionID
	}
	if row.Model != nil {
		// M3 (REQ-16): model_display_name persists the real display name once a
		// status-line post has provided one, so a restart shows "Haiku 4.5" rather
		// than re-deriving it from the id. Rows written before M3 (or before any
		// status post arrived) have a null column — fall back to the id, matching
		// the pre-M3 behaviour.
		displayName := *row.Model
		if row.ModelDisplayName != nil && *row.ModelDisplayName != "" {
			displayName = *row.ModelDisplayName
		}
		s.Model = &Model{ID: *row.Model, DisplayName: displayName}
	}
	if row.ContextUsedPct != nil && row.ContextTotalInputTokens != nil && row.ContextWindowSize != nil {
		s.Context = &Context{
			UsedPct:          *row.ContextUsedPct,
			TotalInputTokens: *row.ContextTotalInputTokens,
			WindowSize:       *row.ContextWindowSize,
		}
	}
	if row.AttentionReason != nil {
		a := &Attention{Reason: *row.AttentionReason}
		if row.AttentionSince != nil {
			a.Since = *row.AttentionSince
		}
		s.Attention = a
	}
	if row.FailureError != nil {
		f := &Failure{Error: *row.FailureError}
		if row.FailureMessage != nil {
			f.Message = *row.FailureMessage
		}
		s.Failure = f
	}
	if row.LastSnapshot != nil {
		s.LastSnapshot = *row.LastSnapshot
	}
	if row.LastSnapshotAt != nil {
		s.LastSnapshotAt = *row.LastSnapshotAt
	}
	return s
}

func sessionToRow(s *Session) store.SessionRow {
	row := store.SessionRow{
		ID:                   s.ID,
		TmuxTarget:           s.TmuxTarget,
		RepoID:               s.RepoID,
		Directory:            s.Directory,
		Branch:               s.Branch,
		IsWorktree:           s.IsWorktree,
		Title:                s.Title,
		State:                string(s.State),
		StateSince:           s.StateSince,
		PermissionMode:       string(s.PermissionMode),
		PermissionModeSource: s.PermissionModeSource,
		Compactions:          s.Compactions,
		LastActivity:         s.LastActivity,
		Alive:                s.Alive,
		EndedAt:              s.EndedAt,
		FirstLaunchHere:      s.FirstLaunchHere,
		CreatedAt:            s.CreatedAt,
		Pinned:               s.Pinned,
		RailPos:              s.RailPos,
		TitleOverride:        s.TitleOverride,
		PlanExists:           s.PlanExists,
	}
	if s.TranscriptPath != "" {
		transcriptPath := s.TranscriptPath
		row.TranscriptPath = &transcriptPath
	}
	if s.PlanPath != "" {
		planPath := s.PlanPath
		row.PlanPath = &planPath
	}
	if s.TmuxPane != "" {
		pane := s.TmuxPane
		row.TmuxPane = &pane
	}
	if s.ClaudeSessionID != "" {
		claudeID := s.ClaudeSessionID
		row.ClaudeSessionID = &claudeID
	}
	if s.Model != nil {
		id := s.Model.ID
		row.Model = &id
		displayName := s.Model.DisplayName
		row.ModelDisplayName = &displayName
	}
	if s.Context != nil {
		usedPct := s.Context.UsedPct
		totalInputTokens := s.Context.TotalInputTokens
		windowSize := s.Context.WindowSize
		row.ContextUsedPct = &usedPct
		row.ContextTotalInputTokens = &totalInputTokens
		row.ContextWindowSize = &windowSize
	}
	if s.Attention != nil {
		reason := s.Attention.Reason
		since := s.Attention.Since
		row.AttentionReason = &reason
		row.AttentionSince = &since
	}
	if s.Failure != nil {
		errTok := s.Failure.Error
		msg := s.Failure.Message
		row.FailureError = &errTok
		row.FailureMessage = &msg
	}
	if s.LastSnapshot != "" {
		text := s.LastSnapshot
		row.LastSnapshot = &text
	}
	if !s.LastSnapshotAt.IsZero() {
		at := s.LastSnapshotAt
		row.LastSnapshotAt = &at
	}
	return row
}
