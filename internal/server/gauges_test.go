package server

import (
	"context"
	"testing"
	"time"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/Zalaras/muster/internal/claudecode/claudecodetest"
)

// countUsageSampleRows is gauges_test.go's own oracle for the usage_sample table — the
// same out-of-process query technique helpers_test.go's queryDB documents (the store
// package deliberately exposes no query-by-table API for tests).
func countUsageSampleRows(t *testing.T, srv *testServer) int {
	t.Helper()
	var n int
	require.NoError(t, srv.queryDB(t).QueryRowContext(context.Background(),
		`SELECT COUNT(*) FROM usage_sample`,
	).Scan(&n))
	return n
}

// TestIngestStatusLine_UpdatesSessionAndRecordsUsageSample covers m3-gauges' whole
// happy path in one wiring test: a routed, full (post-first-API-response) status post
// refreshes the session's title/model/context (REQ-4) and records an account usage
// sample (REQ-5/6), via the real ingest → InterpretStatus → ApplyStatus/aggregator path
// (R4's "sequentially, on this single ingest worker goroutine").
func TestIngestStatusLine_UpdatesSessionAndRecordsUsageSample(t *testing.T) {
	srv := newTestServer(t, ClaudeCodeInfo{})
	srv.Start()
	t.Cleanup(func() { srv.Shutdown(context.Background()) })
	sess := seedLiveSession(t, srv)

	body := claudecodetest.EnvelopedStatusLineFull("claude-status-1", claudecodetest.StatusLineFullOpts{
		MusterSession: int(sess.ID),
		SessionName:   "From Status Line",
	})
	rec := postIngest(t, srv, "/ingest/"+testIngestToken+"/status", body)
	require.Equal(t, 200, rec.Code)

	require.Eventually(t, func() bool {
		got, ok := srv.manager.Get(sess.ID)
		return ok && got.Title != nil
	}, 2*time.Second, 10*time.Millisecond, "the status post must reach ApplyStatus")

	got, ok := srv.manager.Get(sess.ID)
	require.True(t, ok)
	require.NotNil(t, got.Title)
	assert.Equal(t, "From Status Line", *got.Title)
	require.NotNil(t, got.Model)
	assert.Equal(t, "claude-haiku-4-5-20251001", got.Model.ID)
	assert.Equal(t, "Haiku 4.5", got.Model.DisplayName)
	require.NotNil(t, got.Context)
	assert.Equal(t, 42.0, got.Context.UsedPct)
	assert.Equal(t, int64(84000), got.Context.TotalInputTokens)

	require.Eventually(t, func() bool { return countUsageSampleRows(t, srv) == 1 }, 2*time.Second, 10*time.Millisecond)

	snap := srv.usage.Current()
	require.NotNil(t, snap.FiveHour)
	assert.Equal(t, 61.0, snap.FiveHour.UsedPct)
	require.NotNil(t, snap.SevenDay)
	assert.Equal(t, 23.0, snap.SevenDay.UsedPct)
}

// TestIngestStatusLine_PreFirstResponsePostLeavesContextUnknownAndRecordsNoSample
// covers E2/D7/D8 at the wiring level: the measured pre-first-API-response shape
// (null percentages, zero tokens, rate_limits entirely absent) must never surface as
// "0%" and must never produce an account sample.
func TestIngestStatusLine_PreFirstResponsePostLeavesContextUnknownAndRecordsNoSample(t *testing.T) {
	srv := newTestServer(t, ClaudeCodeInfo{})
	srv.Start()
	t.Cleanup(func() { srv.Shutdown(context.Background()) })
	sess := seedLiveSession(t, srv)

	body := claudecodetest.EnvelopedStatusLinePreFirstResponse("claude-status-2", int(sess.ID), "%12", "")
	rec := postIngest(t, srv, "/ingest/"+testIngestToken+"/status", body)
	require.Equal(t, 200, rec.Code)

	require.Eventually(t, func() bool {
		return countEventsForSession(t, srv, "claude-status-2") == 1
	}, 2*time.Second, 10*time.Millisecond, "the post must at least persist as an event before we can conclude anything else about it")

	got, ok := srv.manager.Get(sess.ID)
	require.True(t, ok)
	assert.Nil(t, got.Context, "D7: null used_percentage + zero tokens must never surface as a context")

	assert.Equal(t, 0, countUsageSampleRows(t, srv), "D8: rate_limits is absent pre-first-response, so no sample is ever recorded")
	snap := srv.usage.Current()
	assert.Nil(t, snap.FiveHour)
}

// TestIngestStatusLine_IdenticalPairPostDedupsThenAThirdChangedPostAddsASecondRow is
// E6/D9/INV-5's exact scenario, exercised through the real HTTP ingest path rather than
// calling the aggregator directly: two identical rapid status posts must persist
// exactly one usage_sample row, and a third with changed values must add a second.
func TestIngestStatusLine_IdenticalPairPostDedupsThenAThirdChangedPostAddsASecondRow(t *testing.T) {
	srv := newTestServer(t, ClaudeCodeInfo{})
	srv.Start()
	t.Cleanup(func() { srv.Shutdown(context.Background()) })
	sess := seedLiveSession(t, srv)

	identical := claudecodetest.EnvelopedStatusLineFull("claude-status-3", claudecodetest.StatusLineFullOpts{MusterSession: int(sess.ID)})
	require.Equal(t, 200, postIngest(t, srv, "/ingest/"+testIngestToken+"/status", identical).Code)
	require.Equal(t, 200, postIngest(t, srv, "/ingest/"+testIngestToken+"/status", identical).Code)

	changed := claudecodetest.EnvelopedStatusLineFull("claude-status-3", claudecodetest.StatusLineFullOpts{
		MusterSession: int(sess.ID), FiveHourPct: 65,
	})
	require.Equal(t, 200, postIngest(t, srv, "/ingest/"+testIngestToken+"/status", changed).Code)

	// The ingest worker processes posts in submission order (R4/plan Note 8): waiting for
	// the third, distinct post's own visible effect guarantees the first two already
	// finished processing (or deduping), without a fixed sleep.
	require.Eventually(t, func() bool {
		snap := srv.usage.Current()
		return snap.FiveHour != nil && snap.FiveHour.UsedPct == 65
	}, 2*time.Second, 10*time.Millisecond)

	assert.Equal(t, 2, countUsageSampleRows(t, srv), "two identical posts collapse to one row; the changed third adds a second")
}

// TestIngestStatusLine_NeverTouchesSessionStateWhileNeedsInput is INV-1's end-to-end
// wiring twin (E8): a status post applied through the real ingest path while a session
// is needs_input must leave its state and attention untouched.
func TestIngestStatusLine_NeverTouchesSessionStateWhileNeedsInput(t *testing.T) {
	srv := newTestServer(t, ClaudeCodeInfo{})
	srv.Start()
	t.Cleanup(func() { srv.Shutdown(context.Background()) })
	sess := seedLiveSession(t, srv)

	const claudeID = "claude-status-4"
	require.Equal(t, 200, postIngest(t, srv, "/ingest/"+testIngestToken+"/hook",
		claudecodetest.EnvelopedSessionStart(claudeID, claudecodetest.SessionStartOpts{MusterSession: int(sess.ID), Source: "startup"})).Code)
	promptID := "p1"
	require.Equal(t, 200, postIngest(t, srv, "/ingest/"+testIngestToken+"/hook",
		claudecodetest.RawPermissionRequest(claudeID, promptID)).Code)

	require.Eventually(t, func() bool {
		got, ok := srv.manager.Get(sess.ID)
		return ok && got.State == "needs_input"
	}, 2*time.Second, 10*time.Millisecond)
	before, ok := srv.manager.Get(sess.ID)
	require.True(t, ok)
	require.NotNil(t, before.Attention)
	beforeSince := before.Attention.Since

	body := claudecodetest.EnvelopedStatusLineFull(claudeID, claudecodetest.StatusLineFullOpts{MusterSession: int(sess.ID)})
	require.Equal(t, 200, postIngest(t, srv, "/ingest/"+testIngestToken+"/status", body).Code)

	require.Eventually(t, func() bool {
		polled, polledOK := srv.manager.Get(sess.ID)
		return polledOK && polled.Context != nil
	}, 2*time.Second, 10*time.Millisecond, "wait for the status post to actually land before asserting nothing else moved")

	after, ok := srv.manager.Get(sess.ID)
	require.True(t, ok)
	assert.Equal(t, "needs_input", string(after.State))
	require.NotNil(t, after.Attention)
	assert.Equal(t, "permission", after.Attention.Reason)
	assert.True(t, beforeSince.Equal(after.Attention.Since))
	assert.True(t, after.Alive)
}

// TestIngestStatusLine_RoutedToOneSessionLeavesTheOtherUnaffected is INV-4's wiring
// twin (E9, m2-terminal retro rule: shared-substrate invariants need multi-instance
// source states): with two live sessions, a status post routed to one must change
// nothing on the other's session object, while the account-global usage aggregator
// updates regardless of which session's post drove it.
func TestIngestStatusLine_RoutedToOneSessionLeavesTheOtherUnaffected(t *testing.T) {
	srv := newTestServer(t, ClaudeCodeInfo{})
	srv.Start()
	t.Cleanup(func() { srv.Shutdown(context.Background()) })
	sessA := seedLiveSession(t, srv)
	sessB := seedLiveSession(t, srv)
	require.NotEqual(t, sessA.ID, sessB.ID)

	beforeA, ok := srv.manager.Get(sessA.ID)
	require.True(t, ok)
	require.Nil(t, beforeA.Title)
	require.Nil(t, beforeA.Context)

	body := claudecodetest.EnvelopedStatusLineFull("claude-status-b", claudecodetest.StatusLineFullOpts{
		MusterSession: int(sessB.ID), SessionName: "Session B",
	})
	require.Equal(t, 200, postIngest(t, srv, "/ingest/"+testIngestToken+"/status", body).Code)

	require.Eventually(t, func() bool {
		polled, polledOK := srv.manager.Get(sessB.ID)
		return polledOK && polled.Context != nil
	}, 2*time.Second, 10*time.Millisecond)

	gotB, ok := srv.manager.Get(sessB.ID)
	require.True(t, ok)
	require.NotNil(t, gotB.Title)
	assert.Equal(t, "Session B", *gotB.Title)

	// The bystander: A's own session object must be exactly as it was.
	afterA, ok := srv.manager.Get(sessA.ID)
	require.True(t, ok)
	assert.Nil(t, afterA.Title, "INV-4: a status post routed to B must not touch A")
	assert.Nil(t, afterA.Context)
	assert.Equal(t, beforeA.State, afterA.State)

	// The account-global masthead still updates, regardless of which session drove it.
	snap := srv.usage.Current()
	require.NotNil(t, snap.FiveHour)
	assert.Equal(t, 61.0, snap.FiveHour.UsedPct)
}

// TestIngestStatusLine_UnroutedPostFeedsNothing covers REQ-6: a status post whose
// envelope names an unknown Muster session is untrusted the same way an unknown
// claude-session-id hook is (ingest_routing_test.go's own pattern) — it persists as an
// event only, never reaching ApplyStatus or the usage aggregator.
func TestIngestStatusLine_UnroutedPostFeedsNothing(t *testing.T) {
	srv := newTestServer(t, ClaudeCodeInfo{})
	srv.Start()
	t.Cleanup(func() { srv.Shutdown(context.Background()) })

	const claudeID = "claude-status-unrouted"
	body := claudecodetest.EnvelopedStatusLineFull(claudeID, claudecodetest.StatusLineFullOpts{MusterSession: 999999})
	require.Equal(t, 200, postIngest(t, srv, "/ingest/"+testIngestToken+"/status", body).Code)

	require.Eventually(t, func() bool {
		return countEventsForSession(t, srv, claudeID) == 1
	}, 2*time.Second, 10*time.Millisecond)

	assert.Nil(t, eventSessionID(t, srv, claudeID), "an unrouted status post must persist with a NULL session_id, never a guessed one")
	assert.Equal(t, 0, countUsageSampleRows(t, srv), "REQ-6: an untrusted envelope's account data must never reach the aggregator")
}
