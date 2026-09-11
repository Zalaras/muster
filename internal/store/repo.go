package store

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
	"time"
)

// Repo is one row of the MRU directory picker (kb:anchor/repos.list), also the home
// of the per-directory launch defaults (m1-sessions REQ-5).
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

// UpsertRepoParams are the values a launch records on the repo row (REQ-3).
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
func (s *Store) UpsertRepo(ctx context.Context, p UpsertRepoParams) (Repo, bool, error) {
	now := time.Now().UTC().Format(time.RFC3339)

	existing, err := s.repoByPath(ctx, p.Path)
	if errors.Is(err, sql.ErrNoRows) {
		var res sql.Result
		res, err = s.db.ExecContext(ctx, `
			INSERT INTO repo (path, name, is_git, pinned, last_launched_at, launch_count, last_model, last_permission_mode, created_at)
			VALUES (?, ?, ?, 0, ?, 1, ?, ?, ?)
		`, p.Path, p.Name, boolToInt(p.IsGit), now, p.Model, p.PermissionMode, now)
		if err != nil {
			return Repo{}, false, fmt.Errorf("inserting repo %q: %w", p.Path, err)
		}
		var id int64
		id, err = res.LastInsertId()
		if err != nil {
			return Repo{}, false, fmt.Errorf("reading new repo id for %q: %w", p.Path, err)
		}
		createdAt, _ := time.Parse(time.RFC3339, now)
		lastLaunchedAt, _ := time.Parse(time.RFC3339, now)
		return Repo{
			ID:                 id,
			Path:               p.Path,
			Name:               p.Name,
			IsGit:              p.IsGit,
			LastLaunchedAt:     lastLaunchedAt,
			LaunchCount:        1,
			LastModel:          &p.Model,
			LastPermissionMode: &p.PermissionMode,
			CreatedAt:          createdAt,
		}, true, nil
	}
	if err != nil {
		return Repo{}, false, fmt.Errorf("looking up repo %q: %w", p.Path, err)
	}

	_, err = s.db.ExecContext(ctx, `
		UPDATE repo SET name = ?, is_git = ?, last_launched_at = ?, launch_count = launch_count + 1,
			last_model = ?, last_permission_mode = ?
		WHERE id = ?
	`, p.Name, boolToInt(p.IsGit), now, p.Model, p.PermissionMode, existing.ID)
	if err != nil {
		return Repo{}, false, fmt.Errorf("updating repo %q: %w", p.Path, err)
	}

	existing.Name = p.Name
	existing.IsGit = p.IsGit
	existing.LastLaunchedAt, _ = time.Parse(time.RFC3339, now)
	existing.LaunchCount++
	existing.LastModel = &p.Model
	existing.LastPermissionMode = &p.PermissionMode
	return existing, false, nil
}

// repoByPath looks up a repo row by its absolute directory path, returning
// sql.ErrNoRows (wrapped by errors.Is) when absent.
func (s *Store) repoByPath(ctx context.Context, path string) (Repo, error) {
	row := s.db.QueryRowContext(ctx, `
		SELECT id, path, name, is_git, pinned, last_launched_at, launch_count, last_model, last_permission_mode, created_at
		FROM repo WHERE path = ?
	`, path)
	return scanRepo(row)
}

// GetRepo looks up a repo row by id (used when building a Session's repo/branch wire
// fields).
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
// (kb:anchor/repos.list / REQ-5), for the launch modal's MRU list.
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
	r.LastLaunchedAt, _ = time.Parse(time.RFC3339, lastLaunchedAt)
	r.CreatedAt, _ = time.Parse(time.RFC3339, createdAt)
	return r, nil
}

func boolToInt(b bool) int {
	if b {
		return 1
	}
	return 0
}
