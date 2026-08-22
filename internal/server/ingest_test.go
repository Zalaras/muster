package server

import (
	"context"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/rs/zerolog"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/Zalaras/muster/internal/claudecode"
	"github.com/Zalaras/muster/internal/claudecode/claudecodetest"
)

// countEventsForSession queries the store's own SQLite file directly (the same technique
// the E2E harness's sqlite3 oracle uses) since M0's store package deliberately exposes no
// query-by-session API — GET /api/state can't show events until M1 (plan's Schema
// Changes note).
func countEventsForSession(t *testing.T, srv *testServer, sessionID string) int {
	t.Helper()
	var n int
	require.NoError(t, srv.queryDB(t).QueryRowContext(context.Background(),
		`SELECT COUNT(*) FROM event WHERE claude_session_id = ?`, sessionID,
	).Scan(&n))
	return n
}

func totalEventCount(t *testing.T, srv *testServer) int {
	t.Helper()
	var n int
	require.NoError(t, srv.queryDB(t).QueryRowContext(context.Background(),
		`SELECT COUNT(*) FROM event`,
	).Scan(&n))
	return n
}

func eventSeqsForSession(t *testing.T, srv *testServer, sessionID string) []int {
	t.Helper()
	rows, err := srv.queryDB(t).QueryContext(context.Background(),
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

func postIngest(t *testing.T, srv *testServer, path, body string) *httptest.ResponseRecorder {
	t.Helper()
	req := httptest.NewRequest(http.MethodPost, path, strings.NewReader(body))
	rec := httptest.NewRecorder()
	srv.Handler().ServeHTTP(rec, req)
	return rec
}

func TestHandleIngest_WrongTokenReturns404AndPersistsNothing(t *testing.T) {
	srv := newTestServer(t, ClaudeCodeInfo{})
	srv.Start()
	t.Cleanup(func() { srv.Shutdown(context.Background()) })

	// Body content is irrelevant here — the token check happens before any parsing.
	rec := postIngest(t, srv, "/ingest/wrong-token/hook", `{"session_id":"wrong-token-test"}`)

	assert.Equal(t, http.StatusNotFound, rec.Code)
	assert.Equal(t, 0, countEventsForSession(t, srv, "wrong-token-test"))
}

func TestHandleIngest_WrongTokenOnStatusEndpointReturns404(t *testing.T) {
	srv := newTestServer(t, ClaudeCodeInfo{})

	rec := postIngest(t, srv, "/ingest/wrong-token/status", `{"session_id":"s1"}`)

	assert.Equal(t, http.StatusNotFound, rec.Code)
}

func TestHandleIngest_ReturnsBefore200WithNoSynchronousDBWork(t *testing.T) {
	// D10: the handler enqueues and returns 200 with no DB work on the request path.
	// Proof: the ingest worker is never started here, yet the handler still returns 200 —
	// if persistence happened synchronously in the handler this would deadlock or error
	// instead (there'd be nowhere for a synchronous insert to come from but the handler
	// itself, and no way to observe 200 without it happening).
	srv := newTestServer(t, ClaudeCodeInfo{})
	// Deliberately no srv.Start().

	// Body content is irrelevant here too — the worker that would parse it never runs.
	rec := postIngest(t, srv, "/ingest/"+testIngestToken+"/hook", `{"session_id":"async-proof"}`)

	assert.Equal(t, http.StatusOK, rec.Code)
	// The worker never ran, so nothing was persisted despite the 200.
	assert.Equal(t, 0, countEventsForSession(t, srv, "async-proof"))
}

func TestHandleIngest_HookPersistsAsynchronously(t *testing.T) {
	srv := newTestServer(t, ClaudeCodeInfo{})
	srv.Start()
	t.Cleanup(func() { srv.Shutdown(context.Background()) })

	rec := postIngest(t, srv, "/ingest/"+testIngestToken+"/hook",
		claudecodetest.RawHookBody("SessionStart", "ingest-hook-1"))
	assert.Equal(t, http.StatusOK, rec.Code)

	require.Eventually(t, func() bool {
		return countEventsForSession(t, srv, "ingest-hook-1") == 1
	}, 2*time.Second, 10*time.Millisecond, "event was never persisted by the async worker")
}

func TestHandleIngest_StatusPersistsAsTypeStatusLine(t *testing.T) {
	// REQ-11 (E8).
	srv := newTestServer(t, ClaudeCodeInfo{})
	srv.Start()
	t.Cleanup(func() { srv.Shutdown(context.Background()) })

	rec := postIngest(t, srv, "/ingest/"+testIngestToken+"/status",
		`{"session_id":"ingest-status-1","version":"2.1.233"}`)
	assert.Equal(t, http.StatusOK, rec.Code)

	require.Eventually(t, func() bool {
		return countEventsForSession(t, srv, "ingest-status-1") == 1
	}, 2*time.Second, 10*time.Millisecond)

	var eventType string
	require.NoError(t, srv.queryDB(t).QueryRowContext(context.Background(),
		`SELECT type FROM event WHERE claude_session_id = 'ingest-status-1'`).Scan(&eventType))
	assert.Equal(t, "status_line", eventType)
}

func TestHandleIngest_MalformedJSONReturns200AndPersistsNothing(t *testing.T) {
	// REQ-13 (E10).
	srv := newTestServer(t, ClaudeCodeInfo{})
	srv.Start()
	t.Cleanup(func() { srv.Shutdown(context.Background()) })

	before := totalEventCount(t, srv)

	rec := postIngest(t, srv, "/ingest/"+testIngestToken+"/hook", `not valid json`)
	assert.Equal(t, http.StatusOK, rec.Code)

	// Give the async worker a moment to (not) do anything, then assert the count never
	// moved — there is no session id to poll for, so we poll the total instead.
	require.Never(t, func() bool {
		return totalEventCount(t, srv) != before
	}, 200*time.Millisecond, 10*time.Millisecond, "a malformed body must never be persisted")
}

func TestHandleIngest_MissingSessionIDReturns200AndPersistsNothing(t *testing.T) {
	// REQ-13 / Edge Case 4 (E10 sibling).
	srv := newTestServer(t, ClaudeCodeInfo{})
	srv.Start()
	t.Cleanup(func() { srv.Shutdown(context.Background()) })

	before := totalEventCount(t, srv)

	// ParseIngestBody checks session_id before it even looks at the hook-event-name field,
	// so an empty object is enough to exercise this drop path.
	rec := postIngest(t, srv, "/ingest/"+testIngestToken+"/hook", `{}`)
	assert.Equal(t, http.StatusOK, rec.Code)

	require.Never(t, func() bool {
		return totalEventCount(t, srv) != before
	}, 200*time.Millisecond, 10*time.Millisecond)
}

func TestHandleIngest_NeverLogsPayloadBodies(t *testing.T) {
	// D11 / CLAUDE.md hard rule: hook/status payload bodies (which carry prompt text) are
	// never written to any log output — including on the drop paths, which do log a
	// message about the drop.
	srv := newTestServer(t, ClaudeCodeInfo{})
	srv.Start()
	t.Cleanup(func() { srv.Shutdown(context.Background()) })

	const secretMarker = "super-secret-prompt-text-marker-should-never-be-logged"

	// A payload that will be persisted (status endpoint: no hook-event-name field needed)...
	postIngest(t, srv, "/ingest/"+testIngestToken+"/status",
		`{"session_id":"log-test-1","prompt":"`+secretMarker+`"}`)
	// ...one that will be dropped for having no session_id...
	postIngest(t, srv, "/ingest/"+testIngestToken+"/hook",
		`{"prompt":"`+secretMarker+`-dropped"}`)
	// ...and one that is malformed JSON but still contains the marker as raw bytes.
	postIngest(t, srv, "/ingest/"+testIngestToken+"/hook", secretMarker+`-malformed{{{`)

	require.Eventually(t, func() bool {
		return countEventsForSession(t, srv, "log-test-1") == 1
	}, 2*time.Second, 10*time.Millisecond)

	// Give the drop paths a moment to log, then assert none of the three marker variants
	// ever made it into the log buffer.
	time.Sleep(50 * time.Millisecond)
	logged := srv.logs.String()
	assert.NotContains(t, logged, secretMarker)
}

func TestIngestPipeline_SeqAssignmentAcrossHookAndStatusEndpoints(t *testing.T) {
	// D5: seq assignment per claude_session_id, shared across both ingest endpoints
	// (REQ-12), exercised end-to-end through the real HTTP handlers rather than a direct
	// store call.
	srv := newTestServer(t, ClaudeCodeInfo{})
	srv.Start()
	t.Cleanup(func() { srv.Shutdown(context.Background()) })

	const session = "cross-endpoint-seq"

	// One real call through /hook (needs a genuine hook-event-name field to parse) interleaved
	// with a /status call for the same session — enough to prove the seq counter is
	// shared across both endpoints (D5), since both funnel through the same
	// Store.InsertEvent call (internal/server/ingest.go's process()). The exhaustive,
	// endpoint-agnostic seq-assignment logic itself is unit-tested directly against
	// Store.InsertEvent in internal/store/store_test.go.
	postIngest(t, srv, "/ingest/"+testIngestToken+"/hook",
		claudecodetest.EnvelopedHookBody(1, "%12", "SessionStart", session))
	postIngest(t, srv, "/ingest/"+testIngestToken+"/status",
		`{"musterSession":1,"tmuxPane":"%12","payload":{"session_id":"`+session+`"}}`)

	require.Eventually(t, func() bool {
		return len(eventSeqsForSession(t, srv, session)) == 2
	}, 2*time.Second, 10*time.Millisecond)

	assert.Equal(t, []int{1, 2}, eventSeqsForSession(t, srv, session))
}

func TestIngestQueue_OverflowDropsCountsAndLogs(t *testing.T) {
	// REQ-23 / Edge Case 9: a full queue drops the job, counts it, and logs — it must
	// never block the caller. Build a tiny queue directly (bypassing the HTTP layer, which
	// would need a slow store to actually observe backpressure) and never start its
	// worker, so every enqueue after the buffer fills is an overflow.
	var logBuf strings.Builder
	logger := zerolog.New(&logBuf)
	q := newIngestQueue(nil, logger, 1)

	q.enqueue(ingestJob{kind: claudecode.KindHook, body: []byte(`{}`)})
	q.enqueue(ingestJob{kind: claudecode.KindHook, body: []byte(`{}`)}) // overflow #1
	q.enqueue(ingestJob{kind: claudecode.KindHook, body: []byte(`{}`)}) // overflow #2

	assert.Equal(t, int64(2), q.dropped.Load())
	assert.Contains(t, logBuf.String(), "dropping event")
}

func TestIngestQueue_EnqueueNeverBlocksWhenFull(t *testing.T) {
	logger := zerolog.Nop()
	q := newIngestQueue(nil, logger, 1)
	q.enqueue(ingestJob{kind: claudecode.KindHook, body: []byte(`{}`)})

	done := make(chan struct{})
	go func() {
		q.enqueue(ingestJob{kind: claudecode.KindHook, body: []byte(`{}`)})
		close(done)
	}()

	select {
	case <-done:
	case <-time.After(time.Second):
		t.Fatal("enqueue blocked on a full queue instead of dropping")
	}
}
