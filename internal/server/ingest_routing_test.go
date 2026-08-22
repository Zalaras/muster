package server

import (
	"context"
	"testing"
	"time"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/Zalaras/muster/internal/claudecode/claudecodetest"
	"github.com/Zalaras/muster/internal/session"
	"github.com/Zalaras/muster/internal/store"
)

// seedLiveSession creates and "launches" a real Muster session through the server's
// own manager (accessible here since this test file lives in package server), giving
// ingest routing something real to bind against — mirrors what sessionLauncher.Launch
// does, minus the tmux spawn.
func seedLiveSession(t *testing.T, srv *testServer) *session.Session {
	t.Helper()
	repo, _, err := srv.store.UpsertRepo(context.Background(), store.UpsertRepoParams{
		Path: "/tmp/routing-test", Name: "routing-test", Model: "sonnet", PermissionMode: "default",
	})
	require.NoError(t, err)

	sess, err := srv.manager.CreateSession(context.Background(), session.CreateParams{
		RepoID: repo.ID, Directory: "/tmp/routing-test", PermissionMode: session.PermissionDefault, Model: "sonnet",
	})
	require.NoError(t, err)

	final, err := srv.manager.RecordLaunch(context.Background(), sess.ID, "muster:@1", "%1")
	require.NoError(t, err)
	return final
}

func eventSessionID(t *testing.T, srv *testServer, claudeSessionID string) *int64 {
	t.Helper()
	var id *int64
	require.NoError(t, srv.queryDB(t).QueryRowContext(context.Background(),
		`SELECT session_id FROM event WHERE claude_session_id = ?`, claudeSessionID).Scan(&id))
	return id
}

// TestIngestRouting_EnvelopedSessionStartBindsThenRawHookRoutesByClaudeSessionID covers
// D8: the enveloped SessionStart's musterSession binds the claude session id, and a
// subsequent raw (non-enveloped) hook for that same claude session id routes to it
// through the manager's byClaude index, with event.session_id populated both times.
func TestIngestRouting_EnvelopedSessionStartBindsThenRawHookRoutesByClaudeSessionID(t *testing.T) {
	srv := newTestServer(t, ClaudeCodeInfo{})
	srv.Start()
	t.Cleanup(func() { srv.Shutdown(context.Background()) })
	sess := seedLiveSession(t, srv)

	const claudeID = "routing-claude-1"
	rec := postIngest(t, srv, "/ingest/"+testIngestToken+"/hook",
		claudecodetest.EnvelopedSessionStart(claudeID, claudecodetest.SessionStartOpts{MusterSession: int(sess.ID), Source: "startup"}))
	require.Equal(t, 200, rec.Code)

	// Poll on the row count (safe to call repeatedly — never errors on "not yet
	// there") before reading session_id: once the row exists its session_id column is
	// already final, since InsertEvent sets every column in one INSERT.
	require.Eventually(t, func() bool {
		return countEventsForSession(t, srv, claudeID) == 1
	}, 2*time.Second, 10*time.Millisecond, "the enveloped SessionStart must be persisted")
	id := eventSessionID(t, srv, claudeID)
	require.NotNil(t, id)
	assert.Equal(t, sess.ID, *id, "the enveloped SessionStart must route via musterSession")

	// A subsequent raw (non-enveloped) hook for the now-bound claude session id must
	// route by the manager's claude-session-id index, with no envelope needed.
	rec2 := postIngest(t, srv, "/ingest/"+testIngestToken+"/hook", claudecodetest.RawStop(claudeID, claudecodetest.StopOpts{}))
	require.Equal(t, 200, rec2.Code)

	require.Eventually(t, func() bool {
		return countEventsForSession(t, srv, claudeID) == 2
	}, 2*time.Second, 10*time.Millisecond)

	id = eventSessionID(t, srv, claudeID)
	require.NotNil(t, id)
	assert.Equal(t, sess.ID, *id, "D8: a raw hook for a bound claude session id must route to the same Muster session")

	// The Stop must also have reached the state machine (idle) — routing feeds Apply,
	// not just persistence.
	got, err := srv.store.GetSession(context.Background(), sess.ID)
	require.NoError(t, err)
	assert.Equal(t, "idle", got.State)
}

// TestIngestRouting_UnknownClaudeSessionIDPersistsUnroutedAndLogs covers D9: a raw
// event whose claude session id has no binding must persist with a NULL
// event.session_id, log a line (never the payload), and cause no state effect —
// nothing to assert state-wise here since no Muster session is even named.
func TestIngestRouting_UnknownClaudeSessionIDPersistsUnroutedAndLogs(t *testing.T) {
	srv := newTestServer(t, ClaudeCodeInfo{})
	srv.Start()
	t.Cleanup(func() { srv.Shutdown(context.Background()) })

	const claudeID = "routing-claude-never-bound"
	rec := postIngest(t, srv, "/ingest/"+testIngestToken+"/hook", claudecodetest.RawStop(claudeID, claudecodetest.StopOpts{}))
	require.Equal(t, 200, rec.Code)

	require.Eventually(t, func() bool {
		return countEventsForSession(t, srv, claudeID) == 1
	}, 2*time.Second, 10*time.Millisecond)

	assert.Nil(t, eventSessionID(t, srv, claudeID), "D9: an unrouted event must persist with a NULL session_id, never a guessed one")

	require.Eventually(t, func() bool {
		return len(srv.logs.String()) > 0
	}, 2*time.Second, 10*time.Millisecond)
	assert.Contains(t, srv.logs.String(), "no bound muster session", "D9 requires a log line for an unrouted event")
}

// TestIngestRouting_EnvelopeNamingAnUnknownMusterSessionPersistsUnrouted covers Edge
// Case 12: a stale envelope (musterSession pointing at a session that doesn't exist,
// e.g. after manual pane surgery) must never be trusted — persist unrouted and log,
// exactly like an unknown claude session id.
func TestIngestRouting_EnvelopeNamingAnUnknownMusterSessionPersistsUnrouted(t *testing.T) {
	srv := newTestServer(t, ClaudeCodeInfo{})
	srv.Start()
	t.Cleanup(func() { srv.Shutdown(context.Background()) })

	const claudeID = "routing-claude-stale-envelope"
	rec := postIngest(t, srv, "/ingest/"+testIngestToken+"/hook",
		claudecodetest.EnvelopedSessionStart(claudeID, claudecodetest.SessionStartOpts{MusterSession: 999999, Source: "startup"}))
	require.Equal(t, 200, rec.Code)

	require.Eventually(t, func() bool {
		return countEventsForSession(t, srv, claudeID) == 1
	}, 2*time.Second, 10*time.Millisecond)

	assert.Nil(t, eventSessionID(t, srv, claudeID))
	require.Eventually(t, func() bool {
		return len(srv.logs.String()) > 0
	}, 2*time.Second, 10*time.Millisecond)
	assert.Contains(t, srv.logs.String(), "unknown muster session")
}
