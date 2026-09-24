package store

import (
	"context"
	"fmt"
	"time"
)

// Repo is one row of the MRU directory picker (kb:anchor/repos.list), also the home
// of the per-directory launch defaults (kb:ref/data-model).
type Repo struct {
	ID                 int64
	Path               string
	Name               string
	IsGit              bool
	Pinned             bool
	LastLaunchedAt     time.Time
	LaunchCount        int
	LastModel          *string
	LastPermissionMode *string
	CreatedAt          time.Time
}

// UpsertRepoParams are the values a launch records on the repo row.
type UpsertRepoParams struct {
	Path           string
	Name           string
	IsGit          bool
	Model          string
	PermissionMode string
}

// UpsertRepo creates the repo row for p.Path if absent (launch_count starts at 1) or
// updates the launch defaults and increments launch_count if present. The bool return
// is true iff the row was newly created — the source of the Session's firstLaunchHere
// field (kb:anchor/ws.session).
//
// A single `INSERT ... ON CONFLICT(path) DO UPDATE ... RETURNING` statement, not a
// SELECT followed by an INSERT/UPDATE: the prior two-step check-then-insert let two
// concurrent launches into the same never-before-seen directory both see "not found"
// and both attempt an INSERT, so the loser hit `UNIQUE constraint failed: repo.path`
// and sessionLauncher.Launch surfaced a plain 500 (daemon-tests,
// TestLauncher_ConcurrentLaunchesForTheSameDirectoryProduceTwoDistinctRows). The store
// already serializes all writes onto one connection (SetMaxOpenConns(1), this package's
// CLAUDE.md), so a single statement is atomic with respect to every other caller; two
// separate round trips through the connection pool were not. "Was this call's branch
// the INSERT" is read off the returned launch_count rather than a follow-up existence
// check (which would reopen the same race): every pre-existing row already has
// launch_count >= 1 from its own first insert, so the UPDATE branch's `+ 1` can never
// produce 1 — a returned launch_count of 1 is only reachable via the INSERT branch.
func (s *Store) UpsertRepo(ctx context.Context, p UpsertRepoParams) (Repo, bool, error) {
	now := encodeTime(time.Now())

	row := s.db.QueryRowContext(ctx, `
		INSERT INTO repo (path, name, is_git, pinned, last_launched_at, launch_count, last_model, last_permission_mode, created_at)
		VALUES (?, ?, ?, 0, ?, 1, ?, ?, ?)
		ON CONFLICT(path) DO UPDATE SET
			name = excluded.name,
			is_git = excluded.is_git,
			last_launched_at = excluded.last_launched_at,
			launch_count = repo.launch_count + 1,
			last_model = excluded.last_model,
			last_permission_mode = excluded.last_permission_mode
		RETURNING id, path, name, is_git, pinned, last_launched_at, launch_count, last_model, last_permission_mode, created_at
	`, p.Path, p.Name, boolToInt(p.IsGit), now, p.Model, p.PermissionMode, now)

	r, err := scanRepo(row)
	if err != nil {
		return Repo{}, false, fmt.Errorf("upserting repo %q: %w", p.Path, err)
	}
	return r, r.LaunchCount == 1, nil
}

// GetRepo looks up a repo row by id. No production code calls this today — production
// always already has the row it needs from ListRepos or UpsertRepo's own return value.
// It exists for test setup that wants one row back after UpsertRepo without listing
// every repo.
func (s *Store) GetRepo(ctx context.Context, id int64) (Repo, error) {
	row := s.db.QueryRowContext(ctx, `
		SELECT id, path, name, is_git, pinned, last_launched_at, launch_count, last_model, last_permission_mode, created_at
		FROM repo WHERE id = ?
	`, id)
	r, err := scanRepo(row)
	if err != nil {
		return Repo{}, fmt.Errorf("getting repo %d: %w", id, err)
	}
	return r, nil
}

// ListRepos returns every repo row ordered `pinned DESC, last_launched_at DESC`
// (kb:anchor/repos.list), for the launch modal's MRU list.
func (s *Store) ListRepos(ctx context.Context) ([]Repo, error) {
	rows, err := s.db.QueryContext(ctx, `
		SELECT id, path, name, is_git, pinned, last_launched_at, launch_count, last_model, last_permission_mode, created_at
		FROM repo ORDER BY pinned DESC, last_launched_at DESC
	`)
	if err != nil {
		return nil, fmt.Errorf("listing repos: %w", err)
	}
	defer rows.Close()

	var out []Repo
	for rows.Next() {
		r, err := scanRepo(rows)
		if err != nil {
			return nil, fmt.Errorf("scanning repo row: %w", err)
		}
		out = append(out, r)
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("listing repos: %w", err)
	}
	return out, nil
}

// rowScanner is satisfied by both *sql.Row and *sql.Rows.
type rowScanner interface {
	Scan(dest ...any) error
}

func scanRepo(row rowScanner) (Repo, error) {
	var (
		r              Repo
		isGit, pinned  int
		lastLaunchedAt string
		createdAt      string
	)
	if err := row.Scan(&r.ID, &r.Path, &r.Name, &isGit, &pinned, &lastLaunchedAt, &r.LaunchCount, &r.LastModel, &r.LastPermissionMode, &createdAt); err != nil {
		return Repo{}, err
	}
	r.IsGit = isGit != 0
	r.Pinned = pinned != 0
	var err error
	if r.LastLaunchedAt, err = decodeTime(lastLaunchedAt); err != nil {
		return Repo{}, fmt.Errorf("scanning repo %d: last_launched_at: %w", r.ID, err)
	}
	if r.CreatedAt, err = decodeTime(createdAt); err != nil {
		return Repo{}, fmt.Errorf("scanning repo %d: created_at: %w", r.ID, err)
	}
	return r, nil
}

func boolToInt(b bool) int {
	if b {
		return 1
	}
	return 0
}
