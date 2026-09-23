package store

import (
	"context"
	"database/sql"
	"embed"
	"fmt"
	"io/fs"
	"path"
	"sort"
	"strconv"
	"strings"
	"time"
)

//go:embed migrations/*.sql
var migrationsFS embed.FS

type migration struct {
	version int
	name    string
	sql     string
}

// loadMigrations reads every numbered .sql file under fsys's "migrations" directory,
// sorted ascending by the numeric prefix (e.g. "0001_init.sql" -> version 1). Takes fsys
// rather than reading the package-level migrationsFS directly so a test can pass an
// fstest.MapFS instead of mutating shared package state (docs/conventions.md § Go).
func loadMigrations(fsys fs.FS) ([]migration, error) {
	entries, err := fs.ReadDir(fsys, "migrations")
	if err != nil {
		return nil, fmt.Errorf("reading embedded migrations: %w", err)
	}

	migrations := make([]migration, 0, len(entries))
	seen := make(map[int]string, len(entries)) // a-m6: two files sharing a version is a load error, not a silent skip
	for _, e := range entries {
		if e.IsDir() {
			continue
		}
		name := e.Name()
		versionStr, _, ok := strings.Cut(name, "_")
		if !ok {
			return nil, fmt.Errorf("migration file %q missing version prefix", name)
		}
		version, err := strconv.Atoi(versionStr)
		if err != nil {
			return nil, fmt.Errorf("migration file %q has non-numeric version: %w", name, err)
		}
		if prev, dup := seen[version]; dup {
			return nil, fmt.Errorf("migration files %q and %q share version %d", prev, name, version)
		}
		seen[version] = name
		body, err := fs.ReadFile(fsys, path.Join("migrations", name))
		if err != nil {
			return nil, fmt.Errorf("reading migration %q: %w", name, err)
		}
		migrations = append(migrations, migration{version: version, name: name, sql: string(body)})
	}
	sort.Slice(migrations, func(i, j int) bool { return migrations[i].version < migrations[j].version })
	return migrations, nil
}

// Migrate applies every embedded migration not yet recorded in schema_migrations, in
// ascending version order, and records each as it lands. Forward-only: there is no down
// migration, and calling Migrate again once everything is applied is a no-op.
func Migrate(ctx context.Context, db *sql.DB) error {
	if _, err := db.ExecContext(ctx, `CREATE TABLE IF NOT EXISTS schema_migrations (
		version    INTEGER PRIMARY KEY,
		applied_at TEXT NOT NULL
	)`); err != nil {
		return fmt.Errorf("creating schema_migrations: %w", err)
	}

	migrations, err := loadMigrations(migrationsFS)
	if err != nil {
		return err
	}

	for _, m := range migrations {
		var applied int
		err := db.QueryRowContext(ctx, `SELECT COUNT(*) FROM schema_migrations WHERE version = ?`, m.version).Scan(&applied)
		if err != nil {
			return fmt.Errorf("checking migration %q: %w", m.name, err)
		}
		if applied > 0 {
			continue
		}
		if err := applyOneMigration(ctx, db, m); err != nil {
			return err
		}
	}
	return nil
}

// applyOneMigration runs m's SQL and records it in schema_migrations inside one
// transaction, using the deferred-Rollback idiom InsertSession/BumpIDWatermark already
// use rather than an explicit per-error Rollback call at every branch (a-note-6: one
// transaction idiom for the package). Split out of Migrate's loop so that idiom's defer
// fires per migration, not only once the whole loop returns.
func applyOneMigration(ctx context.Context, db *sql.DB, m migration) error {
	tx, err := db.BeginTx(ctx, nil)
	if err != nil {
		return fmt.Errorf("beginning migration %q: %w", m.name, err)
	}
	defer func() { _ = tx.Rollback() }() // no-op once Commit has succeeded

	if _, err := tx.ExecContext(ctx, m.sql); err != nil {
		return fmt.Errorf("applying migration %q: %w", m.name, err)
	}
	if _, err := tx.ExecContext(ctx,
		`INSERT INTO schema_migrations (version, applied_at) VALUES (?, ?)`,
		m.version, encodeTime(time.Now()),
	); err != nil {
		return fmt.Errorf("recording migration %q: %w", m.name, err)
	}
	if err := tx.Commit(); err != nil {
		return fmt.Errorf("committing migration %q: %w", m.name, err)
	}
	return nil
}
