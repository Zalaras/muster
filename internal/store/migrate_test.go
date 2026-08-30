package store

import (
	"context"
	"database/sql"
	"path/filepath"
	"testing"

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

	// m1-sessions added 0002_sessions.sql, m3-gauges added 0003_gauges.sql,
	// m4-reconcile added 0004_reconcile.sql, usage-model-bar added 0005_usage_model.sql,
	// and order-sidebar added 0006_rail_order.sql, so a fresh database now records six
	// migrations (was 1 pre-M1 — see plans/m1-sessions/daemon-implementation.md
	// Handoff).
	assert.Equal(t, 6, schemaMigrationsCount(t, db))

	var version int
	require.NoError(t, db.QueryRowContext(ctx, `SELECT MAX(version) FROM schema_migrations`).Scan(&version))
	assert.Equal(t, 6, version)

	// The tables the migration creates are usable.
	_, err := db.ExecContext(ctx, `INSERT INTO kv (key, value) VALUES ('k', 'v')`)
	assert.NoError(t, err)
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
	require.Equal(t, 6, before) // 0001_init + 0002_sessions (m1-sessions) + 0003_gauges (m3-gauges) + 0004_reconcile (m4-reconcile) + 0005_usage_model (usage-model-bar) + 0006_rail_order (order-sidebar)

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
