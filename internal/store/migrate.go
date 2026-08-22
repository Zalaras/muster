package store

import (
	"context"
	"database/sql"
	"embed"
	"fmt"
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

// loadMigrations reads every embedded numbered .sql file, sorted ascending by the
// numeric prefix (e.g. "0001_init.sql" -> version 1).
func loadMigrations() ([]migration, error) {
	entries, err := migrationsFS.ReadDir("migrations")
	if err != nil {
		return nil, fmt.Errorf("reading embedded migrations: %w", err)
	}

	migrations := make([]migration, 0, len(entries))
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
		body, err := migrationsFS.ReadFile(path.Join("migrations", name))
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

	migrations, err := loadMigrations()
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

		tx, err := db.BeginTx(ctx, nil)
		if err != nil {
			return fmt.Errorf("beginning migration %q: %w", m.name, err)
		}
		if _, err := tx.ExecContext(ctx, m.sql); err != nil {
			_ = tx.Rollback()
			return fmt.Errorf("applying migration %q: %w", m.name, err)
		}
		if _, err := tx.ExecContext(ctx,
			`INSERT INTO schema_migrations (version, applied_at) VALUES (?, ?)`,
			m.version, time.Now().UTC().Format(time.RFC3339),
		); err != nil {
			_ = tx.Rollback()
			return fmt.Errorf("recording migration %q: %w", m.name, err)
		}
		if err := tx.Commit(); err != nil {
			return fmt.Errorf("committing migration %q: %w", m.name, err)
		}
	}
	return nil
}
