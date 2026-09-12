package session

import (
	"context"
	"errors"
	"fmt"
	"strconv"
	"strings"
	"sync"
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

	cancel context.CancelFunc
	wg     sync.WaitGroup
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

// Stop cancels the poll loop and waits for it to exit, giving up when ctx is done.
func (m *Manager) Stop(ctx context.Context) {
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

// RecordLaunch stamps the real tmux target/pane once the window has been spawned, and
// broadcasts the session for the first time (REQ-2).
func (m *Manager) RecordLaunch(ctx context.Context, id int64, tmuxTarget, tmuxPane string) (*Session, error) {
	m.mu.Lock()
	sess, ok := m.sessions[id]
	if !ok {
		m.mu.Unlock()
		return nil, fmt.Errorf("recording launch: unknown session %d", id)
	}
	sess.TmuxTarget = tmuxTarget
	sess.TmuxPane = tmuxPane
	row := sessionToRow(sess)
	snapshot := sess.Clone()
	m.mu.Unlock()

	if err := m.store.UpdateSession(ctx, row); err != nil {
		return nil, fmt.Errorf("persisting launch for session %d: %w", id, err)
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

// Reconcile runs once at daemon startup, synchronously, before the first snapshot is
// served (REQ-1/REQ-2/REQ-17, kb:anchor/state.liveness). Call after LoadAll and before Start:
//   - rows already alive=false (ended in an earlier daemon lifetime — the user had their
//     resume chance) are deleted; nothing is broadcast, they are simply absent from the
//     first snapshot.
//   - rows alive=true whose pane still exists are left untouched.
//   - rows alive=true whose pane is gone (died while the daemon was down, or a reboot)
//     are marked ended (alive:false, endedAt = now, the startup time — the true death
//     time is unknown and is not guessed) and kept, so the resume chance is not lost;
//     the *following* startup sweeps them.
//   - tmux sessions on the socket with no row are logged at warn and never adopted.
func (m *Manager) Reconcile(ctx context.Context) (ReconcileReport, error) {
	var report ReconcileReport

	// Phase 1, classify. Deliberately separate from, and complete before, the acting
	// phase below: PaneExists is tmux I/O and must run with m.mu released, and folding
	// the two phases into one loop would also make the toEnd-then-toSweep order below an
	// accident of map iteration rather than a stated guarantee.
	toEnd, toSweep := m.classifySessions(ctx, &report)

	// Phase 2, act — toEnd fully, then toSweep.
	for _, id := range toEnd {
		if _, err := m.markEnded(ctx, id); err != nil {
			return report, fmt.Errorf("reconcile: marking session %d ended: %w", id, err)
		}
		report.MarkedEnded++
	}
	for _, id := range toSweep {
		m.removeFromMemory(id)
		if err := m.store.DeleteSession(ctx, id); err != nil {
			return report, fmt.Errorf("reconcile: sweeping session %d: %w", id, err)
		}
		report.Swept++
	}

	m.sweepUnknownTmuxSessions(ctx, &report)

	m.log.Info().
		Int("kept_alive", report.KeptAlive).
		Int("marked_ended", report.MarkedEnded).
		Int("swept", report.Swept).
		Int("shells_killed", report.ShellsKilled).
		Msg("reconciled sessions")

	return report, nil
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

// sweepUnknownTmuxSessions kills every orphaned shell session on the socket and logs any
// Muster-shaped tmux session with no row behind it. Nothing here is ever adopted
// (kb:adr/lifecycle-reconcile-before-first-snapshot); a listing failure is a warning, not
// an error, because an unreadable tmux must not fail startup.
func (m *Manager) sweepUnknownTmuxSessions(ctx context.Context, report *ReconcileReport) {
	if m.sessionKiller == nil {
		return
	}
	names, err := m.sessionKiller.ListSessions(ctx)
	if err != nil {
		m.log.Warn().Err(err).Msg("reconcile: listing tmux sessions failed")
		return
	}

	m.mu.Lock()
	known := make(map[string]bool, len(m.sessions))
	for _, sess := range m.sessions {
		if sess.TmuxTarget != "" {
			known[sessionTmuxName(sess.ID)] = true
		}
	}
	m.mu.Unlock()

	for _, name := range names {
		// Shell sessions (kb:anchor/sessions.shell / kb:anchor/state.liveness, REQ-10) are killed
		// unconditionally, whatever their <n>, and never reported as unknown —
		// they are deliberately non-persistent, and since tmux sessions outlive
		// musterd this sweep is what "the daemon forgets them" actually means.
		if shellID, ok := tmux.IsShellSessionName(name); ok {
			if err := m.sessionKiller.KillSession(ctx, name); err != nil {
				m.log.Warn().Err(err).Str("tmux_session", name).Int64("session_id", shellID).Msg("reconcile: killing orphaned shell session failed")
			} else {
				report.ShellsKilled++
			}
			continue
		}
		if !strings.HasPrefix(name, "muster-") || known[name] {
			continue
		}
		report.UnknownSessions = append(report.UnknownSessions, name)
		m.log.Warn().Str("tmux_session", name).Msg("unknown muster tmux session on socket; not adopted")
	}
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
func (m *Manager) End(ctx context.Context, id int64) (*Session, error) {
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
		if text, err := m.paneSnapshotter.CapturePane(ctx, target); err != nil {
			m.log.Debug().Err(err).Int64("session_id", id).Msg("final pane snapshot capture failed")
		} else {
			m.storeSnapshot(ctx, id, text)
		}
	}

	if m.sessionKiller != nil {
		if err := m.sessionKiller.KillSession(ctx, sessionTmuxName(id)); err != nil {
			return nil, fmt.Errorf("ending session %d: %w", id, err)
		}
	}

	if m.paneChecker != nil {
		// endOnCheckError:=true here (review cycle 1 Minor 1): we just killed the tmux
		// session ourselves, so a PaneExists error on this specific check is not an
		// ordinary transient hiccup to shrug off until the next poll — End must not
		// return alive:true after a kill it just performed. The periodic poll/nudge
		// callers below keep the conservative default (leave as-is on a check error).
		m.checkOneLiveness(ctx, id, target, true)
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

// Remove deletes id's row (REQ-6, kb:anchor/sessions.remove): if alive, the End path runs
// first; a failing kill (End's own error) leaves the row untouched and propagates — never
// a deleted row with a running pane (Edge Case 5). On success the in-memory entry and the
// row are both gone and OnRemoved fires (the sessionRemoved broadcast).
func (m *Manager) Remove(ctx context.Context, id int64) error {
	m.mu.Lock()
	sess, ok := m.sessions[id]
	if !ok {
		m.mu.Unlock()
		return ErrUnknownSession
	}
	alive := sess.Alive
	m.mu.Unlock()

	if alive {
		if _, err := m.End(ctx, id); err != nil {
			return fmt.Errorf("removing session %d: %w", id, err)
		}
	}

	m.removeFromMemory(id)
	if err := m.store.DeleteSession(ctx, id); err != nil {
		return fmt.Errorf("removing session %d: %w", id, err)
	}
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
	sess.TmuxTarget = tmuxTarget
	sess.TmuxPane = tmuxPane
	sess.Alive = true
	sess.EndedAt = nil
	sess.LastSnapshot = ""
	sess.LastSnapshotAt = time.Time{}
	row := sessionToRow(sess)
	snapshot := sess.Clone()
	m.mu.Unlock()

	if err := m.store.UpdateSession(ctx, row); err != nil {
		return nil, fmt.Errorf("persisting resume for session %d: %w", id, err)
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

	if _, err := m.markEnded(ctx, id); err != nil && !errors.Is(err, ErrUnknownSession) {
		m.log.Error().Err(err).Int64("session_id", id).Msg("persisting liveness update failed")
	}
}

// markEnded flips one session's alive to false with endedAt=now, persists the whole row,
// and broadcasts. Idempotent (already-ended is a no-op, no double broadcast). Shared by
// checkOneLiveness (the ordinary poll/nudge path), Reconcile's mark-ended rows, and End
// (via its own liveness nudge — Implementation Notes: "final snapshot → kill-session →
// liveness nudge").
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
	sess.Alive = false
	endedAt := time.Now().UTC()
	sess.EndedAt = &endedAt
	row := sessionToRow(sess)
	snapshot := sess.Clone()
	m.mu.Unlock()

	if err := m.store.UpdateSession(ctx, row); err != nil {
		return nil, fmt.Errorf("persisting ended session %d: %w", id, err)
	}
	m.broadcast(snapshot)
	return snapshot, nil
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
	}
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
