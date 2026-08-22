// Package store owns Muster's SQLite database: opening it in WAL mode, applying
// migrations, and the hand-written SQL for the kv and event tables. Nothing here knows
// about Claude Code's wire formats — callers pass in neutral values.
package store

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
	"os"
	"time"

	// modernc.org/sqlite registers the "sqlite" driver used by Open below.
	_ "modernc.org/sqlite"
)

// Store owns the daemon's single SQLite connection.
type Store struct {
	db *sql.DB
}

// Open opens (creating if absent) the SQLite database at path, enables WAL mode, and
// applies any pending migrations. A single connection is used deliberately: M0's ingest
// path is a single writer goroutine, and one connection keeps SQLite's own
// one-writer-at-a-time rule from ever surfacing as SQLITE_BUSY.
func Open(ctx context.Context, path string) (*Store, error) {
	db, err := sql.Open("sqlite", path)
	if err != nil {
		return nil, fmt.Errorf("opening sqlite database %q: %w", path, err)
	}
	db.SetMaxOpenConns(1)

	if _, err := db.ExecContext(ctx, `PRAGMA journal_mode = WAL`); err != nil {
		_ = db.Close()
		return nil, fmt.Errorf("enabling WAL mode: %w", err)
	}
	if _, err := db.ExecContext(ctx, `PRAGMA foreign_keys = ON`); err != nil {
		_ = db.Close()
		return nil, fmt.Errorf("enabling foreign keys: %w", err)
	}

	if err := Migrate(ctx, db); err != nil {
		_ = db.Close()
		return nil, fmt.Errorf("migrating %q: %w", path, err)
	}

	// The driver creates the file world-readable by default; M1 is the first milestone
	// where real prompt text actually flows into it (hook payloads), so tighten it
	// (review Minor 3 — adjacent to, not a violation of, the "never log hook payloads"
	// hard rule, since a DB isn't a log). In WAL mode SQLite has, by this point, already
	// created the -wal/-shm sidecars at the driver's default (world-readable) mode too —
	// and the WAL is precisely where the most recently written pages (i.e. the newest
	// hook payloads) live, so it needs the same restriction as the main file (review
	// cycle 2 Major 1: chmod'ing only the main file left the sidecars world-readable).
	for _, p := range []string{path, path + "-wal", path + "-shm"} {
		if err := os.Chmod(p, 0o600); err != nil && !os.IsNotExist(err) {
			_ = db.Close()
			return nil, fmt.Errorf("restricting permissions on %q: %w", p, err)
		}
	}

	return &Store{db: db}, nil
}

// Close closes the underlying database connection.
func (s *Store) Close() error {
	return s.db.Close()
}

// KVGet reads a key from the kv table. The bool return reports whether the key existed.
func (s *Store) KVGet(ctx context.Context, key string) (string, bool, error) {
	var value string
	err := s.db.QueryRowContext(ctx, `SELECT value FROM kv WHERE key = ?`, key).Scan(&value)
	if errors.Is(err, sql.ErrNoRows) {
		return "", false, nil
	}
	if err != nil {
		return "", false, fmt.Errorf("getting kv %q: %w", key, err)
	}
	return value, true, nil
}

// KVSet upserts a key in the kv table.
func (s *Store) KVSet(ctx context.Context, key, value string) error {
	_, err := s.db.ExecContext(ctx,
		`INSERT INTO kv (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
		key, value,
	)
	if err != nil {
		return fmt.Errorf("setting kv %q: %w", key, err)
	}
	return nil
}

// Event is a fully-parsed, storage-ready ingest event. Callers (internal/server) are
// responsible for translating whatever Claude-Code-specific parsing produced into this
// neutral shape — this package never sees Claude Code's own hook/status field names.
type Event struct {
	ClaudeSessionID string
	Type            string
	PromptID        *string
	ToolUseID       *string
	MusterSession   *int64
	TmuxPane        *string
	Payload         []byte // verbatim inner payload JSON

	// SessionID is the Muster session (session.id) this event routed to, resolved by
	// the caller (internal/server/ingest.go, via internal/session's binding map)
	// before persistence. Nil means unrouted (m1-sessions REQ-7/D9): an unknown Claude
	// session id, or a stale/absent envelope — never guessed at by cwd.
	SessionID *int64
}

// InsertEvent persists ev, assigning it the next seq for its ClaudeSessionID as part of
// the same insert (MAX(seq)+1 scoped to that session). Safe under M0's single ingest
// worker; it is not a general-purpose concurrent seq allocator.
func (s *Store) InsertEvent(ctx context.Context, ev Event) error {
	receivedAt := time.Now().UTC().Format(time.RFC3339)
	_, err := s.db.ExecContext(ctx, `
		INSERT INTO event (claude_session_id, seq, type, prompt_id, tool_use_id, muster_session, tmux_pane, payload, received_at, session_id)
		VALUES (?, (SELECT COALESCE(MAX(seq), 0) + 1 FROM event WHERE claude_session_id = ?), ?, ?, ?, ?, ?, ?, ?, ?)
	`,
		ev.ClaudeSessionID, ev.ClaudeSessionID, ev.Type, ev.PromptID, ev.ToolUseID,
		ev.MusterSession, ev.TmuxPane, string(ev.Payload), receivedAt, ev.SessionID,
	)
	if err != nil {
		return fmt.Errorf("inserting event for session %q: %w", ev.ClaudeSessionID, err)
	}
	return nil
}
