package store

import (
	"context"
	"database/sql"
	"fmt"
	"strconv"
	"time"
)

// sessionIDWatermarkKey is the kv-table key REQ-1 uses to persist the highest session id
// ever allocated, so a later delete (rollback, Remove, reconcile's sweep) can never let
// that id come back — the id doubles as the tmux session name and the ingest bearer
// credential MUSTER_SESSION, so reuse is a correctness bug (plan session-lifecycle REQ-1/REQ-2).
const sessionIDWatermarkKey = "session.id_watermark"

// SessionRow is the persisted shape of a session (m1-sessions Schema Changes). It is
// the storage-level twin of internal/session.Session; internal/server converts between
// the two so this package stays free of the kb:anchor/state state machine's own vocabulary.
type SessionRow struct {
	ID                   int64
	TmuxTarget           string
	TmuxPane             *string
	ClaudeSessionID      *string
	RepoID               int64
	Directory            string
	Branch               *string
	IsWorktree           bool
	Title                *string
	State                string
	StateSince           time.Time
	PermissionMode       string
	PermissionModeSource string
	Model                *string
	ModelDisplayName     *string // m3-gauges REQ-8/REQ-16; NULL = derive from Model (id)
	Compactions          int
	AttentionReason      *string
	AttentionSince       *time.Time
	FailureError         *string
	FailureMessage       *string
	LastActivity         *string
	Alive                bool
	EndedAt              *time.Time
	FirstLaunchHere      bool
	CreatedAt            time.Time

	// Context gauge (m3-gauges REQ-8): always all-nil or all-non-nil (INV-2). NULL =
	// unknown — a session that hasn't yet received a post-first-response status post.
	ContextUsedPct          *float64
	ContextTotalInputTokens *int64
	ContextWindowSize       *int64

	// LastSnapshot/LastSnapshotAt (m4-reconcile REQ-4): the last capture-pane text and
	// when it was captured — always both-nil or both-non-nil. Display source only, never
	// read by the state machine; never logged (may hold prompt text).
	LastSnapshot   *string
	LastSnapshotAt *time.Time

	// Pinned/RailPos (plan order-sidebar): user-owned rail order. Display-only —
	// never read by the state machine or the status path (D17).
	Pinned  bool
	RailPos int64

	// TitleOverride (plan ui-text-and-focus REQ-9): the user's rename via PUT
	// .../title. Display-only, nullable, never touched by the status path (INV-2) —
	// wins over Title in the wire "title" (internal/session.Session.DisplayTitle()).
	TitleOverride *string

	// TranscriptPath/PlanPath/PlanExists (plan markdown-viewing Schema Changes): the
	// latest transcript path a routed hook named and the plan derived from it.
	// Display-only, never read by the state machine. TranscriptPath/PlanPath are NULL
	// until a hook/scan sets them; PlanExists defaults to 0.
	TranscriptPath *string
	PlanPath       *string
	PlanExists     bool

	// Unread/LastPrompt (plan rail-card-improvements REQ-7/REQ-12): Unread is true iff
	// the session's turn closed with no terminal client attached, since cleared by a
	// non-idle transition or an attach. LastPrompt is the user's most recent prompt,
	// truncated to 200 chars, NULL until a first prompt or after /clear. Both
	// display-only, never read by the state machine.
	Unread     bool
	LastPrompt *string
}

// InsertSessionParams seeds a new session row (REQ-1/REQ-2): state "started", the
// permission-mode latch seeded with source "seed", alive, created now. TmuxTarget is
// a placeholder ("") until the caller records the real tmux window via UpdateSession —
// the row must exist (and get an id) before the tmux spawn that needs that id in the
// pane environment (plan Implementation Notes: launch sequence).
type InsertSessionParams struct {
	RepoID          int64
	Directory       string
	Branch          *string
	IsWorktree      bool
	Title           *string
	PermissionMode  string
	Model           *string
	FirstLaunchHere bool

	// RailPos is the manual rail position for the new session (plan order-sidebar
	// REQ-1): the caller (internal/session.Manager, under its lock) computes
	// max(existing)+1 so the newest session lands at the bottom of the unpinned
	// block. Pinned always starts false.
	RailPos int64

	// MinID floors the allocated id above this value (0 = no floor) — session-lifecycle
	// REQ-1/REQ-7: the launcher passes its MaxSessionID probe of the tmux socket here, so
	// a new row never lands on an id an orphaned "muster-<N>" tmux session already owns.
	MinID int64
}

// InsertSession allocates the new row's id as
// max(COALESCE(MAX(id) from session, 0), the persisted watermark, p.MinID) + 1, inserted
// with that id explicit, and persists the new watermark — all in one transaction
// (session-lifecycle REQ-1/REQ-2). This is what makes an id un-reissuable: SQLite's
// ROWID (no AUTOINCREMENT on this table) would otherwise reuse max(rowid)+1 the moment
// the highest row is deleted (launch rollback, Remove, reconcile's sweep), and that id
// doubles as both the tmux session name and the ingest bearer credential
// MUSTER_SESSION=<id>.
func (s *Store) InsertSession(ctx context.Context, p InsertSessionParams) (SessionRow, error) {
	now := time.Now().UTC().Format(time.RFC3339)

	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return SessionRow{}, fmt.Errorf("beginning session insert transaction for %q: %w", p.Directory, err)
	}
	defer func() { _ = tx.Rollback() }() // no-op once Commit has succeeded

	var maxExisting sql.NullInt64
	if scanErr := tx.QueryRowContext(ctx, `SELECT MAX(id) FROM session`).Scan(&maxExisting); scanErr != nil {
		return SessionRow{}, fmt.Errorf("reading max session id: %w", scanErr)
	}

	watermarkStr, ok, err := kvGet(ctx, tx, sessionIDWatermarkKey)
	if err != nil {
		return SessionRow{}, fmt.Errorf("reading session id watermark: %w", err)
	}
	var watermark int64
	if ok {
		watermark, err = strconv.ParseInt(watermarkStr, 10, 64)
		if err != nil {
			return SessionRow{}, fmt.Errorf("parsing session id watermark %q: %w", watermarkStr, err)
		}
	}

	id := maxExisting.Int64
	if watermark > id {
		id = watermark
	}
	if p.MinID > id {
		id = p.MinID
	}
	id++

	if _, err := tx.ExecContext(ctx, `
		INSERT INTO session (
			id, tmux_target, tmux_pane, claude_session_id, repo_id, directory, branch, is_worktree,
			title, state, state_since, permission_mode, permission_mode_source, model,
			compactions, attention_reason, attention_since, failure_error, failure_message,
			last_activity, alive, ended_at, first_launch_here, created_at, pinned, rail_pos,
			unread, last_prompt
		) VALUES (
			?, '', NULL, NULL, ?, ?, ?, ?,
			?, 'started', ?, ?, 'seed', ?,
			0, NULL, NULL, NULL, NULL,
			NULL, 1, NULL, ?, ?, 0, ?,
			0, NULL
		)
	`, id, p.RepoID, p.Directory, p.Branch, boolToInt(p.IsWorktree),
		p.Title, now, p.PermissionMode, p.Model,
		boolToInt(p.FirstLaunchHere), now, p.RailPos,
	); err != nil {
		return SessionRow{}, fmt.Errorf("inserting session for %q: %w", p.Directory, err)
	}

	if err := kvSet(ctx, tx, sessionIDWatermarkKey, strconv.FormatInt(id, 10)); err != nil {
		return SessionRow{}, fmt.Errorf("persisting session id watermark: %w", err)
	}

	if err := tx.Commit(); err != nil {
		return SessionRow{}, fmt.Errorf("committing session insert for %q: %w", p.Directory, err)
	}

	return s.GetSession(ctx, id)
}

// BumpIDWatermark raises the persisted session id watermark to at least minID, leaving it
// untouched if it's already higher (session-lifecycle REQ-9: an unknown "muster-<N>" or
// "muster-<N>-shell" tmux session found on the socket during reconcile must still block
// id N from ever being allocated to a new row, even though no row names it).
func (s *Store) BumpIDWatermark(ctx context.Context, minID int64) error {
	current, ok, err := s.KVGet(ctx, sessionIDWatermarkKey)
	if err != nil {
		return fmt.Errorf("reading session id watermark: %w", err)
	}
	var currentVal int64
	if ok {
		currentVal, err = strconv.ParseInt(current, 10, 64)
		if err != nil {
			return fmt.Errorf("parsing session id watermark %q: %w", current, err)
		}
	}
	if minID <= currentVal {
		return nil
	}
	if err := s.KVSet(ctx, sessionIDWatermarkKey, strconv.FormatInt(minID, 10)); err != nil {
		return fmt.Errorf("persisting session id watermark: %w", err)
	}
	return nil
}

// DeleteSession removes a session row — the launch-failure rollback path (plan
// Implementation Notes: "on spawn failure: delete the row").
func (s *Store) DeleteSession(ctx context.Context, id int64) error {
	if _, err := s.db.ExecContext(ctx, `DELETE FROM session WHERE id = ?`, id); err != nil {
		return fmt.Errorf("deleting session %d: %w", id, err)
	}
	return nil
}

// UpdateSession writes back the full row (whole-object, matching the whole-object
// sessionUpsert design — kb:anchor/ws.session) after any mutation.
func (s *Store) UpdateSession(ctx context.Context, row SessionRow) error {
	stateSince := row.StateSince.UTC().Format(time.RFC3339)
	var attentionSince, endedAt *string
	if row.AttentionSince != nil {
		v := row.AttentionSince.UTC().Format(time.RFC3339)
		attentionSince = &v
	}
	if row.EndedAt != nil {
		v := row.EndedAt.UTC().Format(time.RFC3339)
		endedAt = &v
	}

	var lastSnapshotAt *string
	if row.LastSnapshotAt != nil {
		v := row.LastSnapshotAt.UTC().Format(time.RFC3339)
		lastSnapshotAt = &v
	}

	_, err := s.db.ExecContext(ctx, `
		UPDATE session SET
			tmux_target = ?, tmux_pane = ?, claude_session_id = ?, directory = ?, branch = ?,
			is_worktree = ?, title = ?, state = ?, state_since = ?, permission_mode = ?,
			permission_mode_source = ?, model = ?, model_display_name = ?, compactions = ?,
			attention_reason = ?, attention_since = ?, failure_error = ?, failure_message = ?,
			last_activity = ?, alive = ?, ended_at = ?, first_launch_here = ?,
			context_used_pct = ?, context_total_input_tokens = ?, context_window_size = ?,
			last_snapshot = ?, last_snapshot_at = ?, pinned = ?, rail_pos = ?, title_override = ?,
			transcript_file = ?, plan_path = ?, plan_exists = ?, unread = ?, last_prompt = ?
		WHERE id = ?
	`,
		row.TmuxTarget, row.TmuxPane, row.ClaudeSessionID, row.Directory, row.Branch,
		boolToInt(row.IsWorktree), row.Title, row.State, stateSince, row.PermissionMode,
		row.PermissionModeSource, row.Model, row.ModelDisplayName, row.Compactions,
		row.AttentionReason, attentionSince, row.FailureError, row.FailureMessage,
		row.LastActivity, boolToInt(row.Alive), endedAt, boolToInt(row.FirstLaunchHere),
		row.ContextUsedPct, row.ContextTotalInputTokens, row.ContextWindowSize,
		row.LastSnapshot, lastSnapshotAt, boolToInt(row.Pinned), row.RailPos, row.TitleOverride,
		row.TranscriptPath, row.PlanPath, boolToInt(row.PlanExists), boolToInt(row.Unread), row.LastPrompt,
		row.ID,
	)
	if err != nil {
		return fmt.Errorf("updating session %d: %w", row.ID, err)
	}
	return nil
}

const sessionColumns = `
	id, tmux_target, tmux_pane, claude_session_id, repo_id, directory, branch, is_worktree,
	title, state, state_since, permission_mode, permission_mode_source, model,
	model_display_name, compactions, attention_reason, attention_since, failure_error,
	failure_message, last_activity, alive, ended_at, first_launch_here, created_at,
	context_used_pct, context_total_input_tokens, context_window_size,
	last_snapshot, last_snapshot_at, pinned, rail_pos, title_override,
	transcript_file, plan_path, plan_exists, unread, last_prompt
`

func (s *Store) GetSession(ctx context.Context, id int64) (SessionRow, error) {
	row := s.db.QueryRowContext(ctx, `SELECT `+sessionColumns+` FROM session WHERE id = ?`, id)
	r, err := scanSession(row)
	if err != nil {
		return SessionRow{}, fmt.Errorf("getting session %d: %w", id, err)
	}
	return r, nil
}

// ListSessions returns every session row (order unspecified — the client sorts,
// kb:anchor/ws.snapshot), for daemon startup reload (Edge Case 7).
func (s *Store) ListSessions(ctx context.Context) ([]SessionRow, error) {
	rows, err := s.db.QueryContext(ctx, `SELECT `+sessionColumns+` FROM session`)
	if err != nil {
		return nil, fmt.Errorf("listing sessions: %w", err)
	}
	defer rows.Close()

	var out []SessionRow
	for rows.Next() {
		r, err := scanSession(rows)
		if err != nil {
			return nil, fmt.Errorf("scanning session row: %w", err)
		}
		out = append(out, r)
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("listing sessions: %w", err)
	}
	return out, nil
}

func scanSession(row rowScanner) (SessionRow, error) {
	var (
		r                            SessionRow
		isWorktree, alive, firstHere int
		pinned                       int
		planExists                   int
		unread                       int
		stateSince, createdAt        string
		attentionSince, endedAt      *string
		lastSnapshotAt               *string
	)
	if err := row.Scan(
		&r.ID, &r.TmuxTarget, &r.TmuxPane, &r.ClaudeSessionID, &r.RepoID, &r.Directory, &r.Branch, &isWorktree,
		&r.Title, &r.State, &stateSince, &r.PermissionMode, &r.PermissionModeSource, &r.Model,
		&r.ModelDisplayName, &r.Compactions, &r.AttentionReason, &attentionSince, &r.FailureError,
		&r.FailureMessage, &r.LastActivity, &alive, &endedAt, &firstHere, &createdAt,
		&r.ContextUsedPct, &r.ContextTotalInputTokens, &r.ContextWindowSize,
		&r.LastSnapshot, &lastSnapshotAt, &pinned, &r.RailPos, &r.TitleOverride,
		&r.TranscriptPath, &r.PlanPath, &planExists, &unread, &r.LastPrompt,
	); err != nil {
		return SessionRow{}, err
	}
	r.IsWorktree = isWorktree != 0
	r.Alive = alive != 0
	r.FirstLaunchHere = firstHere != 0
	r.Pinned = pinned != 0
	r.PlanExists = planExists != 0
	r.Unread = unread != 0
	r.StateSince, _ = time.Parse(time.RFC3339, stateSince)
	r.CreatedAt, _ = time.Parse(time.RFC3339, createdAt)
	if attentionSince != nil {
		t, _ := time.Parse(time.RFC3339, *attentionSince)
		r.AttentionSince = &t
	}
	if endedAt != nil {
		t, _ := time.Parse(time.RFC3339, *endedAt)
		r.EndedAt = &t
	}
	if lastSnapshotAt != nil {
		t, _ := time.Parse(time.RFC3339, *lastSnapshotAt)
		r.LastSnapshotAt = &t
	}
	return r, nil
}

// UpdateSnapshot persists only the last captured pane screen for id (REQ-4), separate
// from UpdateSession's whole-row write since it happens on every liveness tick for every
// alive session — called only when the captured text actually changed (same pattern as
// usage_sample). Never logged (may hold prompt text).
func (s *Store) UpdateSnapshot(ctx context.Context, id int64, text string, at time.Time) error {
	ts := at.UTC().Format(time.RFC3339)
	if _, err := s.db.ExecContext(ctx, `UPDATE session SET last_snapshot = ?, last_snapshot_at = ? WHERE id = ?`, text, ts, id); err != nil {
		return fmt.Errorf("updating snapshot for session %d: %w", id, err)
	}
	return nil
}
