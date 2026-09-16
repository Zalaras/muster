package server

import (
	"context"
	"strconv"
	"testing"
	"time"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/Zalaras/muster/internal/claudecode"
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
		claudecodetest.EnvelopedSessionStart(claudeID, claudecodetest.SessionStartOpts{MusterSession: int(sess.ID), Source: "startup", TmuxPane: "%1"}))
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

// ---------------------------------------------------------------------------------------
// Envelope corroboration table (general-cleanup REQ-12, kb:adr/ingest-envelope-pane-must-corroborate,
// D9/D10, INV-CORROBORATE/INV-EMPTY-PANE-ROUTES).

// corroborationSnapshot is the set of fields INV-CORROBORATE says a mismatched or absent
// envelope pane must never move — captured before and compared after.
type corroborationSnapshot struct {
	State           session.State
	ClaudeSessionID string
	Compactions     int
	TranscriptPath  string
	PlanPath        string
	PlanExists      bool
	Title           *string
}

func snapshotSession(t *testing.T, srv *testServer, id int64) corroborationSnapshot {
	t.Helper()
	sess, ok := srv.manager.Get(id)
	require.True(t, ok)
	return corroborationSnapshot{
		State: sess.State, ClaudeSessionID: sess.ClaudeSessionID, Compactions: sess.Compactions,
		TranscriptPath: sess.TranscriptPath, PlanPath: sess.PlanPath, PlanExists: sess.PlanExists,
		Title: sess.Title,
	}
}

// setupCorroborationSession seeds a live session with a recorded, non-empty pane ("%1",
// seedLiveSession's own fixed pane) and drives its binding and displayed state directly
// through manager.Apply — never through ingest, since this helper's caller is about to
// exercise resolveSessionID (upstream of Apply) itself and setup must not exercise the
// code under test. Returns the session id and the claude session id the "bound"/
// "rebound" cases are bound to (empty for "unbound", where state is always "started" —
// a session cannot reach any other displayed state before its first bind, kb:anchor/state.transitions).
func setupCorroborationSession(t *testing.T, srv *testServer, binding, state string) (id int64, claudeID string) {
	t.Helper()
	sess := seedLiveSession(t, srv)
	ctx := context.Background()

	switch binding {
	case "unbound":
		return sess.ID, ""
	case "bound":
		claudeID = "corrob-claude-" + strconv.FormatInt(sess.ID, 10)
		_, err := srv.manager.Apply(ctx, sess.ID, claudeID, nil, claudecode.StateInput{Kind: claudecode.KindBind}, true)
		require.NoError(t, err)
	case "rebound_after_clear":
		oldClaudeID := "corrob-claude-old-" + strconv.FormatInt(sess.ID, 10)
		_, err := srv.manager.Apply(ctx, sess.ID, oldClaudeID, nil, claudecode.StateInput{Kind: claudecode.KindBind}, true)
		require.NoError(t, err)
		claudeID = "corrob-claude-new-" + strconv.FormatInt(sess.ID, 10)
		_, err = srv.manager.Apply(ctx, sess.ID, claudeID, nil, claudecode.StateInput{Kind: claudecode.KindClearRebind}, true)
		require.NoError(t, err)
	default:
		t.Fatalf("unknown binding %q", binding)
	}

	promptID := "p1"
	switch state {
	case "started":
		// KindBind/KindClearRebind already land in started; nothing further.
	case "working":
		_, err := srv.manager.Apply(ctx, sess.ID, claudeID, &promptID, claudecode.StateInput{Kind: claudecode.KindTurnActivity}, true)
		require.NoError(t, err)
	case "needs_input":
		_, err := srv.manager.Apply(ctx, sess.ID, claudeID, &promptID, claudecode.StateInput{Kind: claudecode.KindTurnActivity}, true)
		require.NoError(t, err)
		_, err = srv.manager.Apply(ctx, sess.ID, claudeID, &promptID, claudecode.StateInput{Kind: claudecode.KindNeedsInputPermission}, true)
		require.NoError(t, err)
	case "idle":
		_, err := srv.manager.Apply(ctx, sess.ID, claudeID, &promptID, claudecode.StateInput{Kind: claudecode.KindTurnActivity}, true)
		require.NoError(t, err)
		_, err = srv.manager.Apply(ctx, sess.ID, claudeID, &promptID, claudecode.StateInput{Kind: claudecode.KindTurnClosed}, true)
		require.NoError(t, err)
	case "failed":
		_, err := srv.manager.Apply(ctx, sess.ID, claudeID, &promptID, claudecode.StateInput{Kind: claudecode.KindTurnActivity}, true)
		require.NoError(t, err)
		_, err = srv.manager.Apply(ctx, sess.ID, claudeID, &promptID, claudecode.StateInput{Kind: claudecode.KindTurnFailed}, true)
		require.NoError(t, err)
	default:
		t.Fatalf("unknown state %q", state)
	}
	return sess.ID, claudeID
}

// TestIngestRouting_CorroborationTable covers D9/INV-CORROBORATE: crossed across every
// reachable (binding, displayed-state) source state, an enveloped event whose pane
// mismatches the session's recorded "%1" pane, and one carrying no pane at all, both
// leave state/binding/compactions/transcript/plan/title byte-identical and persist with a
// NULL event.session_id — and, as the control row proving the corroboration check is
// actually exercised (not merely never reached), a matching pane routes (kb:lesson/invariant-missed-by-per-transition-tests:
// a per-transition-only test would have missed a corroboration bug reachable only from a
// non-started source state).
func TestIngestRouting_CorroborationTable(t *testing.T) {
	bindingStates := map[string][]string{
		"unbound":             {"started"},
		"bound":               {"started", "working", "needs_input", "idle", "failed"},
		"rebound_after_clear": {"started", "working", "needs_input", "idle", "failed"},
	}

	for binding, states := range bindingStates {
		for _, state := range states {
			t.Run(binding+"/"+state, func(t *testing.T) {
				srv := newTestServer(t, ClaudeCodeInfo{})
				srv.Start()
				t.Cleanup(func() { srv.Shutdown(context.Background()) })
				sessID, claudeID := setupCorroborationSession(t, srv, binding, state)
				before := snapshotSession(t, srv, sessID)

				drain := func() {
					t.Helper()
					ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
					defer cancel()
					require.NoError(t, srv.ingest.queue.Drain(ctx))
				}
				// Each sub-case posts under its own claude session id — eventSessionID's
				// query has no ORDER BY, so reusing one id across sub-cases would let an
				// earlier sub-case's row (routed or not) answer a later sub-case's query.
				payloadClaudeID := claudeID
				if payloadClaudeID == "" {
					payloadClaudeID = "corrob-" + strconv.FormatInt(sessID, 10)
				}

				t.Run("mismatched pane persists unrouted and changes nothing", func(t *testing.T) {
					body := claudecodetest.EnvelopedHookBody(int(sessID), "%999", "PreCompact", payloadClaudeID+"-mismatch")
					rec := postIngest(t, srv, "/ingest/"+testIngestToken+"/hook", body)
					require.Equal(t, 200, rec.Code)
					drain()

					assert.Nil(t, eventSessionID(t, srv, payloadClaudeID+"-mismatch"), "D9: a mismatched pane must persist unrouted")
					assert.Equal(t, before, snapshotSession(t, srv, sessID), "D9: a mismatched pane must change nothing")
				})

				t.Run("absent pane persists unrouted and changes nothing", func(t *testing.T) {
					body := claudecodetest.EnvelopedHookBody(int(sessID), "", "PreCompact", payloadClaudeID+"-absent")
					rec := postIngest(t, srv, "/ingest/"+testIngestToken+"/hook", body)
					require.Equal(t, 200, rec.Code)
					drain()

					assert.Nil(t, eventSessionID(t, srv, payloadClaudeID+"-absent"), "D9: an absent pane against a recorded pane must persist unrouted")
					assert.Equal(t, before, snapshotSession(t, srv, sessID), "D9: an absent pane must change nothing")
				})

				t.Run("matching pane routes", func(t *testing.T) {
					// The control row: proves the corroboration check is actually being
					// exercised above, not merely never reached. Uses the already-bound
					// claude id (or, when unbound, a fresh one) so this compaction event
					// carries no incidental rebind side effect to confound the assertion.
					id2 := payloadClaudeID
					if claudeID == "" {
						id2 = payloadClaudeID + "-match"
					}
					body := claudecodetest.EnvelopedHookBody(int(sessID), "%1", "PreCompact", id2)
					rec := postIngest(t, srv, "/ingest/"+testIngestToken+"/hook", body)
					require.Equal(t, 200, rec.Code)
					drain()

					id := eventSessionID(t, srv, id2)
					require.NotNil(t, id, "a matching pane must route")
					assert.Equal(t, sessID, *id)
				})
			})
		}
	}
}

// TestIngestRouting_EmptyStoredPaneRoutesOnMusterSessionAlone covers D10/
// INV-EMPTY-PANE-ROUTES: an enveloped SessionStart arriving while the session's pane is
// still empty (the spawn-to-record window: CreateSession's row before RecordLaunch has
// ever run) routes and binds on musterSession alone — corroboration is "cannot
// corroborate", not "cannot match".
func TestIngestRouting_EmptyStoredPaneRoutesOnMusterSessionAlone(t *testing.T) {
	srv := newTestServer(t, ClaudeCodeInfo{})
	srv.Start()
	t.Cleanup(func() { srv.Shutdown(context.Background()) })

	repo, _, err := srv.store.UpsertRepo(context.Background(), store.UpsertRepoParams{
		Path: "/tmp/routing-test-empty-pane", Name: "routing-test-empty-pane", Model: "sonnet", PermissionMode: "default",
	})
	require.NoError(t, err)
	sess, err := srv.manager.CreateSession(context.Background(), session.CreateParams{
		RepoID: repo.ID, Directory: "/tmp/routing-test-empty-pane", PermissionMode: session.PermissionDefault, Model: "sonnet",
	})
	require.NoError(t, err)
	// Deliberately no RecordLaunch: TmuxPane stays "" — InsertSession's own placeholder
	// (internal/store/session.go's InsertSessionParams doc comment).
	pane, ok := srv.manager.PaneOf(sess.ID)
	require.True(t, ok)
	require.Empty(t, pane, "sanity: the spawn-to-record window")

	const claudeID = "d10-empty-pane-claude"
	rec := postIngest(t, srv, "/ingest/"+testIngestToken+"/hook",
		claudecodetest.EnvelopedSessionStart(claudeID, claudecodetest.SessionStartOpts{MusterSession: int(sess.ID), TmuxPane: "%999"}))
	require.Equal(t, 200, rec.Code)

	drainCtx, drainCancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer drainCancel()
	require.NoError(t, srv.ingest.queue.Drain(drainCtx))

	id := eventSessionID(t, srv, claudeID)
	require.NotNil(t, id, "D10: an enveloped SessionStart against an empty stored pane must route")
	assert.Equal(t, sess.ID, *id)

	got, ok := srv.manager.Get(sess.ID)
	require.True(t, ok)
	assert.Equal(t, claudeID, got.ClaudeSessionID, "D10: it must also bind")
}
