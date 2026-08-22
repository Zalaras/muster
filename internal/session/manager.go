package session

import (
	"context"
	"fmt"
	"sync"
	"time"

	"github.com/rs/zerolog"

	"github.com/Zalaras/muster/internal/claudecode"
	"github.com/Zalaras/muster/internal/store"
)

// PaneChecker reports whether a tmux pane still exists — the liveness poll's only
// signal (protocol §7.5; never terminal output, CLAUDE.md hard rule). Defined here
// because internal/session is the consumer; internal/tmux.Client satisfies it.
type PaneChecker interface {
	PaneExists(ctx context.Context, target string) (bool, error)
}

// defaultPollInterval is protocol §7.5's "~5s" liveness poll.
const defaultPollInterval = 5 * time.Second

// Config wires a Manager. Built by internal/server; nothing here starts a goroutine
// until Start is called.
type Config struct {
	Store        *store.Store
	Logger       zerolog.Logger
	PaneChecker  PaneChecker
	OnUpsert     func(*Session) // broadcasts a sessionUpsert; may be nil in tests
	PollInterval time.Duration  // 0 uses defaultPollInterval
}

// Manager is the in-memory session registry and the §7 state machine's home. Every
// mutation persists the full row and (unless OnUpsert is nil) broadcasts the fresh
// Session — the "whole-object sessionUpsert" design (docs/protocol.md §5.3).
type Manager struct {
	store       *store.Store
	log         zerolog.Logger
	paneChecker PaneChecker
	onUpsert    func(*Session)
	interval    time.Duration

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
		store:       cfg.Store,
		log:         cfg.Logger,
		paneChecker: cfg.PaneChecker,
		onUpsert:    cfg.OnUpsert,
		interval:    interval,
		sessions:    make(map[int64]*Session),
		byClaude:    make(map[string]int64),
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
	row, err := m.store.InsertSession(ctx, store.InsertSessionParams{
		RepoID:          p.RepoID,
		Directory:       p.Directory,
		Branch:          p.Branch,
		IsWorktree:      p.IsWorktree,
		Title:           p.Title,
		PermissionMode:  string(p.PermissionMode),
		Model:           &model,
		FirstLaunchHere: p.FirstLaunchHere,
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
	m.mu.Lock()
	delete(m.sessions, id)
	for claudeID, sid := range m.byClaude {
		if sid == id {
			delete(m.byClaude, claudeID)
		}
	}
	m.mu.Unlock()

	return m.store.DeleteSession(ctx, id)
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
// (protocol §7.3) and persists + broadcasts the result. claudeSessionID and promptID
// are generic identifiers, not Claude Code payload vocabulary; input is the neutral
// StateInput the claudecode interpreter derived.
func (m *Manager) Apply(ctx context.Context, musterSessionID int64, claudeSessionID string, promptID *string, input claudecode.StateInput) (*Session, error) {
	now := time.Now().UTC()

	m.mu.Lock()
	sess, ok := m.sessions[musterSessionID]
	if !ok {
		m.mu.Unlock()
		return nil, fmt.Errorf("apply: unknown session %d", musterSessionID)
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
// the first miss (protocol §7.5). State is never touched here.
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
		exists, err := m.paneChecker.PaneExists(ctx, target.target)
		if err != nil {
			m.log.Warn().Err(err).Str("tmux_target", target.target).Msg("liveness check failed")
			continue
		}
		if exists {
			continue
		}

		m.mu.Lock()
		sess, ok := m.sessions[target.id]
		if !ok || !sess.Alive {
			m.mu.Unlock()
			continue
		}
		sess.Alive = false
		endedAt := time.Now().UTC()
		sess.EndedAt = &endedAt
		row := sessionToRow(sess)
		snapshot := sess.Clone()
		m.mu.Unlock()

		if err := m.store.UpdateSession(ctx, row); err != nil {
			m.log.Error().Err(err).Int64("session_id", target.id).Msg("persisting liveness update failed")
			continue
		}
		m.broadcast(snapshot)
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
	}
	if row.TmuxPane != nil {
		s.TmuxPane = *row.TmuxPane
	}
	if row.ClaudeSessionID != nil {
		s.ClaudeSessionID = *row.ClaudeSessionID
	}
	if row.Model != nil {
		// DisplayName is not persisted separately in M1 (the session table has one
		// `model` column) — it re-derives from the same stored value across a
		// restart, which loses the original launch string once SessionStart has
		// overwritten the id. Not observable within one daemon lifetime; see
		// daemon-implementation.md Decisions.
		s.Model = &Model{ID: *row.Model, DisplayName: *row.Model}
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
	return row
}
