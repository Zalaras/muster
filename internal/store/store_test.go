package store

import (
	"context"
	"os"
	"path/filepath"
	"testing"
	"time"

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

	// 0001_init + 0002_sessions (m1-sessions) + 0003_gauges (m3-gauges) + 0004_reconcile
	// (m4-reconcile) + 0005_usage_model (usage-model-bar) + 0006_rail_order
	// (order-sidebar) + 0007_title_override (ui-text-and-focus).
	assert.Equal(t, 7, schemaMigrationsCount(t, st2.db))
}

// TestOpen_RestrictsPermissionsOnDatabaseAndSidecars covers review cycle 2 Major 1: the
// sqlite driver creates the main file (and, once WAL mode has produced them, its -wal/
// -shm sidecars) world-readable by default. From m1-sessions on, hook payload/prompt
// text flows into the database, and the WAL sidecar specifically holds the most
// recently written pages — i.e. the newest such text — so chmod'ing only the main file
// left the freshest data world-readable. This regression guard exists so a future
// change can't silently reopen that hole by touching only one of the three files.
func TestOpen_RestrictsPermissionsOnDatabaseAndSidecars(t *testing.T) {
	path := filepath.Join(t.TempDir(), "muster.db")

	st, err := Open(context.Background(), path)
	require.NoError(t, err)
	t.Cleanup(func() { _ = st.Close() })

	// Force a write past the migrations themselves so the -wal/-shm sidecars are
	// guaranteed to exist on disk (WAL mode creates them lazily on first write).
	require.NoError(t, st.KVSet(context.Background(), "probe", "value"))

	for _, suffix := range []string{"", "-wal", "-shm"} {
		p := path + suffix
		info, statErr := os.Stat(p)
		require.NoError(t, statErr, "expected sidecar %q to exist", p)
		assert.Equal(t, os.FileMode(0o600), info.Mode().Perm(), "%q must be mode 0600, not world/group-readable", p)
	}
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

// TestInsertEvent_ReceivedAtIsRFC3339NanoAndDiffersAcrossImmediateInserts covers
// REQ-10/D13 (M0 review minor): received_at now carries nanosecond precision, so two
// inserts that land within the same wall-clock second still get distinguishable
// timestamps — plain RFC3339's second granularity made that impossible.
func TestInsertEvent_ReceivedAtIsRFC3339NanoAndDiffersAcrossImmediateInserts(t *testing.T) {
	st := openTestStore(t)
	ctx := context.Background()

	require.NoError(t, st.InsertEvent(ctx, Event{ClaudeSessionID: "nano-1", Type: "SessionStart", Payload: []byte(`{}`)}))
	require.NoError(t, st.InsertEvent(ctx, Event{ClaudeSessionID: "nano-2", Type: "SessionStart", Payload: []byte(`{}`)}))

	rows, err := st.db.QueryContext(ctx, `SELECT received_at FROM event ORDER BY id ASC`)
	require.NoError(t, err)
	defer rows.Close()

	var receivedAts []string
	for rows.Next() {
		var v string
		require.NoError(t, rows.Scan(&v))
		receivedAts = append(receivedAts, v)
	}
	require.NoError(t, rows.Err())
	require.Len(t, receivedAts, 2)

	for _, v := range receivedAts {
		_, err := time.Parse(time.RFC3339Nano, v)
		assert.NoError(t, err, "received_at must parse as RFC3339Nano")
	}
	assert.NotEqual(t, receivedAts[0], receivedAts[1], "two immediate inserts must not collapse to the same timestamp")
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

// TestInsertEvent_SessionIDRoutingColumn covers m1-sessions' D8/D9: a routed event
// persists with its Muster session_id populated; an unrouted one (nil SessionID) must
// still persist with a NULL session_id rather than erroring or guessing.
func TestInsertEvent_SessionIDRoutingColumn(t *testing.T) {
	st := openTestStore(t)
	ctx := context.Background()
	repo, _, err := st.UpsertRepo(ctx, UpsertRepoParams{Path: "/tmp/proj", Name: "proj", Model: "sonnet", PermissionMode: "default"})
	require.NoError(t, err)
	sess, err := st.InsertSession(ctx, InsertSessionParams{RepoID: repo.ID, Directory: "/tmp/proj", PermissionMode: "default"})
	require.NoError(t, err)

	require.NoError(t, st.InsertEvent(ctx, Event{
		ClaudeSessionID: "sess-routed", Type: "SessionStart", Payload: []byte(`{}`), SessionID: &sess.ID,
	}))
	require.NoError(t, st.InsertEvent(ctx, Event{
		ClaudeSessionID: "sess-unrouted", Type: "SessionStart", Payload: []byte(`{}`), SessionID: nil,
	}))

	var routed *int64
	require.NoError(t, st.db.QueryRowContext(ctx,
		`SELECT session_id FROM event WHERE claude_session_id = 'sess-routed'`).Scan(&routed))
	require.NotNil(t, routed)
	assert.Equal(t, sess.ID, *routed)

	var unrouted *int64
	require.NoError(t, st.db.QueryRowContext(ctx,
		`SELECT session_id FROM event WHERE claude_session_id = 'sess-unrouted'`).Scan(&unrouted))
	assert.Nil(t, unrouted, "an unrouted event must persist with a NULL session_id, never a guessed one")
}
