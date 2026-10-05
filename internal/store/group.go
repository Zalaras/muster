package store

import (
	"context"
	"encoding/json"
	"fmt"
	"time"
)

// ungroupedLayoutKey is the kv key holding the Ungrouped section's place and collapsed
// flag (kb:adr/rail-ungrouped-is-section-zero-on-the-wire): Ungrouped is not a rail_group row,
// so its two fields live here as one JSON blob.
const ungroupedLayoutKey = "rail_ungrouped"

// GroupRow is the persisted shape of a rail group (kb:ref/data-model), the storage twin of
// internal/session.Group.
type GroupRow struct {
	ID        int64
	Name      string
	Pos       int64
	Collapsed bool
}

// UngroupedLayout is the Ungrouped section's place among every section and its collapsed
// flag.
type UngroupedLayout struct {
	Pos       int64 `json:"pos"`
	Collapsed bool  `json:"collapsed"`
}

// GroupLayout is every group's mutable fields plus the Ungrouped section, written wholesale:
// a group list is never more than a dozen long, so each change rewrites it in one
// transaction rather than diffing rows.
type GroupLayout struct {
	Groups    []GroupRow
	Ungrouped UngroupedLayout
}

// ListGroups returns every group row (order unspecified — the caller sorts by pos), for
// daemon startup reload.
func (s *Store) ListGroups(ctx context.Context) ([]GroupRow, error) {
	rows, err := s.db.QueryContext(ctx, `SELECT id, name, pos, collapsed FROM rail_group`)
	if err != nil {
		return nil, fmt.Errorf("listing groups: %w", err)
	}
	defer rows.Close()

	var out []GroupRow
	for rows.Next() {
		var (
			r         GroupRow
			collapsed int
		)
		if err := rows.Scan(&r.ID, &r.Name, &r.Pos, &collapsed); err != nil {
			return nil, fmt.Errorf("scanning group row: %w", err)
		}
		r.Collapsed = collapsed != 0
		out = append(out, r)
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("listing groups: %w", err)
	}
	return out, nil
}

// ReadUngroupedLayout returns the persisted Ungrouped layout; ok is false when none was
// ever written, which the caller reads as last place, expanded. An unparseable value is
// treated as absent: a corrupt kv row must never stop the daemon loading its groups.
func (s *Store) ReadUngroupedLayout(ctx context.Context) (layout UngroupedLayout, ok bool, err error) {
	raw, found, err := kvGet(ctx, s.db, ungroupedLayoutKey)
	if err != nil {
		return UngroupedLayout{}, false, err
	}
	if !found {
		return UngroupedLayout{}, false, nil
	}
	if err := json.Unmarshal([]byte(raw), &layout); err != nil {
		s.log.Warn().Err(err).Str("key", ungroupedLayoutKey).Msg("corrupt ungrouped layout; reading as absent")
		return UngroupedLayout{}, false, nil
	}
	return layout, true, nil
}

// InsertGroup inserts a new group at pos and, in the same transaction, rewrites the layout
// the insert displaced (every other group's pos and the Ungrouped section), so a crash can
// never leave two sections on one place. layout.Groups names the other groups, not the new
// one. The id is SQLite's rowid and may be reused after a delete.
func (s *Store) InsertGroup(ctx context.Context, name string, pos int64, layout GroupLayout) (GroupRow, error) {
	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return GroupRow{}, fmt.Errorf("beginning group insert transaction: %w", err)
	}
	defer func() { _ = tx.Rollback() }() // no-op once Commit has succeeded

	res, err := tx.ExecContext(ctx,
		`INSERT INTO rail_group (name, pos, collapsed, created_at) VALUES (?, ?, 0, ?)`,
		name, pos, encodeTime(time.Now()))
	if err != nil {
		return GroupRow{}, fmt.Errorf("inserting group %q: %w", name, err)
	}
	id, err := res.LastInsertId()
	if err != nil {
		return GroupRow{}, fmt.Errorf("reading new group id: %w", err)
	}
	if err := writeLayout(ctx, tx, layout); err != nil {
		return GroupRow{}, err
	}
	if err := tx.Commit(); err != nil {
		return GroupRow{}, fmt.Errorf("committing group insert: %w", err)
	}
	return GroupRow{ID: id, Name: name, Pos: pos}, nil
}

// SaveGroups rewrites every group in layout and the Ungrouped section in one transaction:
// the one write behind rename, collapse, reorder and collapse-all.
func (s *Store) SaveGroups(ctx context.Context, layout GroupLayout) error {
	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return fmt.Errorf("beginning group save transaction: %w", err)
	}
	defer func() { _ = tx.Rollback() }() // no-op once Commit has succeeded

	if err := writeLayout(ctx, tx, layout); err != nil {
		return err
	}
	if err := tx.Commit(); err != nil {
		return fmt.Errorf("committing group save: %w", err)
	}
	return nil
}

// DeleteGroup removes group id and, in the same transaction, rewrites the layout that
// remains (layout.Groups excludes id). The session.group_id foreign key's ON DELETE SET NULL
// is only a guard: the caller moves members out before it deletes.
func (s *Store) DeleteGroup(ctx context.Context, id int64, layout GroupLayout) error {
	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return fmt.Errorf("beginning group delete transaction: %w", err)
	}
	defer func() { _ = tx.Rollback() }() // no-op once Commit has succeeded

	if _, err := tx.ExecContext(ctx, `DELETE FROM rail_group WHERE id = ?`, id); err != nil {
		return fmt.Errorf("deleting group %d: %w", id, err)
	}
	if err := writeLayout(ctx, tx, layout); err != nil {
		return err
	}
	if err := tx.Commit(); err != nil {
		return fmt.Errorf("committing group delete: %w", err)
	}
	return nil
}

// writeLayout is the shared body of the three writers above: every listed group's mutable
// columns, then the Ungrouped kv blob, on the caller's transaction.
func writeLayout(ctx context.Context, q dbTx, layout GroupLayout) error {
	for _, g := range layout.Groups {
		if _, err := q.ExecContext(ctx,
			`UPDATE rail_group SET name = ?, pos = ?, collapsed = ? WHERE id = ?`,
			g.Name, g.Pos, boolToInt(g.Collapsed), g.ID); err != nil {
			return fmt.Errorf("writing group %d: %w", g.ID, err)
		}
	}
	blob, err := json.Marshal(layout.Ungrouped)
	if err != nil {
		return fmt.Errorf("encoding ungrouped layout: %w", err)
	}
	return kvSet(ctx, q, ungroupedLayoutKey, string(blob))
}
