package store

import (
	"context"
	"database/sql"
	"path/filepath"
	"testing"
	"testing/fstest"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	_ "modernc.org/sqlite"
)

func openTestDB(t *testing.T) *sql.DB {
	t.Helper()
	path := filepath.Join(t.TempDir(), "muster.db")
	db, err := sql.Open("sqlite", path)
	require.NoError(t, err)
	t.Cleanup(func() { _ = db.Close() })
	return db
}

func schemaMigrationsCount(t *testing.T, db *sql.DB) int {
	t.Helper()
	var n int
	require.NoError(t, db.QueryRow(`SELECT COUNT(*) FROM schema_migrations`).Scan(&n))
	return n
}

func TestMigrate_AppliesInitSchema(t *testing.T) {
	db := openTestDB(t)
	ctx := context.Background()

	require.NoError(t, Migrate(ctx, db))

	// One row per file in migrations/ (0001_init.sql through 0009_rail_cards.sql).
	assert.Equal(t, 9, schemaMigrationsCount(t, db))

	var version int
	require.NoError(t, db.QueryRowContext(ctx, `SELECT MAX(version) FROM schema_migrations`).Scan(&version))
	assert.Equal(t, 9, version)

	// The tables the migration creates are usable.
	_, err := db.ExecContext(ctx, `INSERT INTO kv (key, value) VALUES ('k', 'v')`)
	require.NoError(t, err)
	_, err = db.ExecContext(ctx, `INSERT INTO event (claude_session_id, seq, type, payload, received_at) VALUES ('s1', 1, 'Stop', '{}', '2026-01-01T00:00:00Z')`)
	assert.NoError(t, err)
}

func TestMigrate_SecondCallIsANoOp(t *testing.T) {
	// D8: migration idempotence — a second Migrate call against an already-migrated
	// database applies nothing and errors on nothing.
	db := openTestDB(t)
	ctx := context.Background()

	require.NoError(t, Migrate(ctx, db))
	before := schemaMigrationsCount(t, db)
	require.Equal(t, 9, before) // 0001_init + 0002_sessions (m1-sessions) + 0003_gauges (m3-gauges) + 0004_reconcile (m4-reconcile) + 0005_usage_model (usage-model-bar) + 0006_rail_order (order-sidebar) + 0007_title_override (ui-text-and-focus) + 0008_reader (markdown-viewing) + 0009_rail_cards (rail-card-improvements)

	require.NoError(t, Migrate(ctx, db))
	after := schemaMigrationsCount(t, db)

	assert.Equal(t, before, after)

	// Existing data survives a re-migration untouched.
	_, err := db.ExecContext(ctx, `INSERT INTO kv (key, value) VALUES ('k', 'v')`)
	require.NoError(t, err)
	require.NoError(t, Migrate(ctx, db))

	var value string
	require.NoError(t, db.QueryRowContext(ctx, `SELECT value FROM kv WHERE key = 'k'`).Scan(&value))
	assert.Equal(t, "v", value)
}

// TestLoadMigrations_DuplicateVersionIsLoadError proves two migration files sharing a
// version fail loading, not silently apply only the first and skip the second forever.
// loadMigrations takes an fs.FS (migrate.go), specifically so a test can
// pass an fstest.MapFS instead of mutating the package-level migrationsFS shared with
// every other test in this package (docs/conventions.md § Go).
func TestLoadMigrations_DuplicateVersionIsLoadError(t *testing.T) {
	fsys := fstest.MapFS{
		"migrations/0001_a.sql": {Data: []byte("SELECT 1;")},
		"migrations/0001_b.sql": {Data: []byte("SELECT 1;")}, // shares version 1 with 0001_a.sql on purpose
	}

	_, err := loadMigrations(fsys)

	require.Error(t, err)
	assert.Contains(t, err.Error(), "share version")
	assert.Contains(t, err.Error(), "0001_a.sql")
	assert.Contains(t, err.Error(), "0001_b.sql")
}

func TestMigrate_CreatesSchemaMigrationsTableIfAbsent(t *testing.T) {
	db := openTestDB(t)
	ctx := context.Background()

	// Calling Migrate on a completely fresh database (no schema_migrations table at all
	// yet) must not error — the runner creates the bookkeeping table itself.
	require.NoError(t, Migrate(ctx, db))

	var name string
	err := db.QueryRowContext(ctx, `SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'schema_migrations'`).Scan(&name)
	require.NoError(t, err)
	assert.Equal(t, "schema_migrations", name)
}
