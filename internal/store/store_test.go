package store

import (
	"context"
	"path/filepath"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func openTestStore(t *testing.T) *Store {
	t.Helper()
	path := filepath.Join(t.TempDir(), "muster.db")
	st, err := Open(context.Background(), path)
	require.NoError(t, err)
	t.Cleanup(func() { _ = st.Close() })
	return st
}

func TestOpen_EnablesWALMode(t *testing.T) {
	st := openTestStore(t)

	var mode string
	require.NoError(t, st.db.QueryRowContext(context.Background(), `PRAGMA journal_mode`).Scan(&mode))
	assert.Equal(t, "wal", mode)
}

func TestOpen_SecondOpenOnSamePathDoesNotReapplyMigrations(t *testing.T) {
	path := filepath.Join(t.TempDir(), "muster.db")

	st1, err := Open(context.Background(), path)
	require.NoError(t, err)
	require.NoError(t, st1.Close())

	st2, err := Open(context.Background(), path)
	require.NoError(t, err)
	t.Cleanup(func() { _ = st2.Close() })

	assert.Equal(t, 1, schemaMigrationsCount(t, st2.db))
}

func TestKV_RoundTrip(t *testing.T) {
	st := openTestStore(t)
	ctx := context.Background()

	t.Run("missing key returns ok=false", func(t *testing.T) {
		v, ok, err := st.KVGet(ctx, "does_not_exist")
		require.NoError(t, err)
		assert.False(t, ok)
		assert.Empty(t, v)
	})

	t.Run("set then get round-trips", func(t *testing.T) {
		require.NoError(t, st.KVSet(ctx, "ui_token", "abc123"))

		v, ok, err := st.KVGet(ctx, "ui_token")
		require.NoError(t, err)
		assert.True(t, ok)
		assert.Equal(t, "abc123", v)
	})

	t.Run("set again overwrites the previous value (REQ-2 token reuse across restarts)", func(t *testing.T) {
		require.NoError(t, st.KVSet(ctx, "ingest_token", "first"))
		require.NoError(t, st.KVSet(ctx, "ingest_token", "second"))

		v, ok, err := st.KVGet(ctx, "ingest_token")
		require.NoError(t, err)
		assert.True(t, ok)
		assert.Equal(t, "second", v)
	})
}

func ptr[T any](v T) *T { return &v }

// queryEventSeqs returns the seq values recorded for sessionID, in event.id (global
// arrival) order.
func queryEventSeqs(t *testing.T, st *Store, sessionID string) []int {
	t.Helper()
	rows, err := st.db.QueryContext(context.Background(),
		`SELECT seq FROM event WHERE claude_session_id = ? ORDER BY id ASC`, sessionID)
	require.NoError(t, err)
	defer rows.Close()

	var seqs []int
	for rows.Next() {
		var seq int
		require.NoError(t, rows.Scan(&seq))
		seqs = append(seqs, seq)
	}
	require.NoError(t, rows.Err())
	return seqs
}

func TestInsertEvent_SeqAssignmentPerClaudeSessionID(t *testing.T) {
	st := openTestStore(t)
	ctx := context.Background()

	// Interleaved inserts across two claude_session_id values — the seq counter must be
	// scoped per session, not global (REQ-12, D5). event.id (global arrival order) must
	// still increase monotonically across the interleaving.
	require.NoError(t, st.InsertEvent(ctx, Event{ClaudeSessionID: "sess-a", Type: "SessionStart", Payload: []byte(`{}`)}))
	require.NoError(t, st.InsertEvent(ctx, Event{ClaudeSessionID: "sess-b", Type: "SessionStart", Payload: []byte(`{}`)}))
	require.NoError(t, st.InsertEvent(ctx, Event{ClaudeSessionID: "sess-a", Type: "UserPromptSubmit", Payload: []byte(`{}`)}))
	require.NoError(t, st.InsertEvent(ctx, Event{ClaudeSessionID: "sess-b", Type: "UserPromptSubmit", Payload: []byte(`{}`)}))
	require.NoError(t, st.InsertEvent(ctx, Event{ClaudeSessionID: "sess-a", Type: "Stop", Payload: []byte(`{}`)}))

	assert.Equal(t, []int{1, 2, 3}, queryEventSeqs(t, st, "sess-a"))
	assert.Equal(t, []int{1, 2}, queryEventSeqs(t, st, "sess-b"))
}

func TestInsertEvent_GlobalIDPreservesArrivalOrderAcrossSessions(t *testing.T) {
	// Edge Case 7 / the plan's note: "event.id preserves global arrival order across any
	// rebinding" — simulate a /clear: the same tmux pane's stream restarts seq at 1 under
	// a brand-new claude_session_id, but global id keeps increasing.
	st := openTestStore(t)
	ctx := context.Background()

	require.NoError(t, st.InsertEvent(ctx, Event{ClaudeSessionID: "before-clear", Type: "SessionStart", Payload: []byte(`{}`)}))
	require.NoError(t, st.InsertEvent(ctx, Event{ClaudeSessionID: "before-clear", Type: "Stop", Payload: []byte(`{}`)}))
	require.NoError(t, st.InsertEvent(ctx, Event{ClaudeSessionID: "after-clear", Type: "SessionStart", Payload: []byte(`{}`)}))

	rows, err := st.db.QueryContext(ctx, `SELECT id, claude_session_id, seq FROM event ORDER BY id ASC`)
	require.NoError(t, err)
	defer rows.Close()

	type row struct {
		id        int
		sessionID string
		seq       int
	}
	var got []row
	for rows.Next() {
		var r row
		require.NoError(t, rows.Scan(&r.id, &r.sessionID, &r.seq))
		got = append(got, r)
	}
	require.NoError(t, rows.Err())

	require.Len(t, got, 3)
	assert.Equal(t, []row{
		{id: 1, sessionID: "before-clear", seq: 1},
		{id: 2, sessionID: "before-clear", seq: 2},
		{id: 3, sessionID: "after-clear", seq: 1}, // new session_id restarts seq at 1
	}, got)
}

func TestInsertEvent_NullableEnvelopeAndCorrelationFields(t *testing.T) {
	// Edge Case 2: a raw post (or headless probe with no pane env) leaves the envelope
	// columns NULL; PromptID/ToolUseID are similarly optional per hook (canary-fields.md).
	st := openTestStore(t)
	ctx := context.Background()

	require.NoError(t, st.InsertEvent(ctx, Event{
		ClaudeSessionID: "sess-nullable",
		Type:            "SessionStart",
		PromptID:        nil,
		ToolUseID:       nil,
		MusterSession:   nil,
		TmuxPane:        nil,
		Payload:         []byte(`{"source":"startup"}`),
	}))

	var (
		promptID      *string
		toolUseID     *string
		musterSession *int64
		tmuxPane      *string
		payload       string
		receivedAt    string
	)
	err := st.db.QueryRowContext(ctx,
		`SELECT prompt_id, tool_use_id, muster_session, tmux_pane, payload, received_at FROM event WHERE claude_session_id = 'sess-nullable'`,
	).Scan(&promptID, &toolUseID, &musterSession, &tmuxPane, &payload, &receivedAt)
	require.NoError(t, err)

	assert.Nil(t, promptID)
	assert.Nil(t, toolUseID)
	assert.Nil(t, musterSession)
	assert.Nil(t, tmuxPane)
	assert.Equal(t, `{"source":"startup"}`, payload)
	assert.NotEmpty(t, receivedAt)
}

func TestInsertEvent_PopulatedEnvelopeAndCorrelationFields(t *testing.T) {
	st := openTestStore(t)
	ctx := context.Background()

	require.NoError(t, st.InsertEvent(ctx, Event{
		ClaudeSessionID: "sess-full",
		Type:            "PreToolUse",
		PromptID:        ptr("p1"),
		ToolUseID:       ptr("tu-1"),
		MusterSession:   ptr(int64(7)),
		TmuxPane:        ptr("%3"),
		Payload:         []byte(`{"tool_name":"Bash"}`),
	}))

	var (
		promptID      string
		toolUseID     string
		musterSession int64
		tmuxPane      string
	)
	err := st.db.QueryRowContext(ctx,
		`SELECT prompt_id, tool_use_id, muster_session, tmux_pane FROM event WHERE claude_session_id = 'sess-full'`,
	).Scan(&promptID, &toolUseID, &musterSession, &tmuxPane)
	require.NoError(t, err)

	assert.Equal(t, "p1", promptID)
	assert.Equal(t, "tu-1", toolUseID)
	assert.Equal(t, int64(7), musterSession)
	assert.Equal(t, "%3", tmuxPane)
}
