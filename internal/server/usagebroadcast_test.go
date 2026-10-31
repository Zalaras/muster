package server

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/coder/websocket"
	"github.com/coder/websocket/wsjson"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/Zalaras/muster/internal/claudecode/claudecodetest"
)

// readUntilType reads WS messages until one has the given "type", returning its raw JSON.
// Other messages (session upserts a status post also triggers) are skipped.
func readUntilType(t *testing.T, c *websocket.Conn, typ string) json.RawMessage {
	t.Helper()
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	for {
		var raw json.RawMessage
		require.NoError(t, wsjson.Read(ctx, c, &raw), "waiting for a %q message", typ)
		var head struct {
			Type string `json:"type"`
		}
		require.NoError(t, json.Unmarshal(raw, &head))
		if head.Type == typ {
			return raw
		}
	}
}

func usageObjectKeys(t *testing.T, raw []byte) map[string]json.RawMessage {
	t.Helper()
	var msg struct {
		Usage map[string]json.RawMessage `json:"usage"`
	}
	require.NoError(t, json.Unmarshal(raw, &msg))
	require.NotNil(t, msg.Usage, "message carries a usage object")
	return msg.Usage
}

// modelOnlyScenario runs the real ingest -> aggregator -> hub path for two status posts that
// differ only in the model, returning the server and the two `usage` broadcasts it sent.
func modelOnlyScenario(t *testing.T) (srv *testServer, first, second json.RawMessage) {
	t.Helper()
	srv = newTestServer(t, ClaudeCodeInfo{})
	srv.Start()
	t.Cleanup(func() { srv.Shutdown(context.Background()) })
	sess := seedLiveSession(t, srv)

	httpSrv := httptest.NewServer(srv.Handler())
	t.Cleanup(httpSrv.Close)
	c, err := dialWS(t, "ws"+httpSrv.URL[len("http"):]+"/ws", nil)
	require.NoError(t, err)
	t.Cleanup(func() { _ = c.CloseNow() })
	readUntilType(t, c, "snapshot")

	post := func(opts claudecodetest.StatusLineFullOpts) {
		t.Helper()
		opts.MusterSession, opts.TmuxPane = int(sess.ID), "%1"
		body := claudecodetest.EnvelopedStatusLineFull("claude-model-only", opts)
		require.Equal(t, 200, postIngest(t, srv, "/ingest/"+testIngestToken+"/status", body).Code)
	}

	post(claudecodetest.StatusLineFullOpts{})
	first = readUntilType(t, c, "usage")
	post(claudecodetest.StatusLineFullOpts{ModelID: "claude-opus-5", ModelDisplayName: "Opus 5"})
	second = readUntilType(t, c, "usage")
	return srv, first, second
}

// TestIngestStatusLine_ModelOnlyChangeBroadcastsNoModelAndLeavesWireUnchanged checks (every
// `usage` broadcast has no `model` key, with known buckets) and Edge Case 2 (a model-only
// change leaves the wire usage identical to the previous broadcast).
func TestIngestStatusLine_ModelOnlyChangeBroadcastsNoModelAndLeavesWireUnchanged(t *testing.T) {
	_, first, second := modelOnlyScenario(t)

	for name, raw := range map[string]json.RawMessage{"first": first, "second": second} {
		keys := usageObjectKeys(t, raw)
		assert.NotContains(t, keys, "model", "%s usage broadcast", name)
		assert.JSONEq(t, `{"usedPct":61,"resetsAt":"2099-01-01T00:00:00Z"}`, string(keys["fiveHour"]), "%s broadcast has known buckets", name)
	}

	// sampledAt is stamped from the daemon's wall clock when each sample is recorded, so the two
	// posts can straddle a clock second; every other wire key must be identical.
	firstKeys, secondKeys := usageObjectKeys(t, first), usageObjectKeys(t, second)
	var firstAt, secondAt time.Time
	require.NoError(t, json.Unmarshal(firstKeys["sampledAt"], &firstAt))
	require.NoError(t, json.Unmarshal(secondKeys["sampledAt"], &secondAt))
	assert.False(t, secondAt.Before(firstAt), "sampledAt never moves backwards: %s then %s", firstAt, secondAt)
	delete(firstKeys, "sampledAt")
	delete(secondKeys, "sampledAt")
	assert.Equal(t, firstKeys, secondKeys, "a model-only change must leave the wire usage unchanged")
}

// TestIngestStatusLine_ModelOnlyChangeRecordsRowCarryingModel: a status post
// that changes only the model still writes a usage_sample row carrying that model, so history
// keeps the model even though the wire dropped it.
func TestIngestStatusLine_ModelOnlyChangeRecordsRowCarryingModel(t *testing.T) {
	srv, _, _ := modelOnlyScenario(t)

	require.Eventually(t, func() bool { return countUsageSampleRows(t, srv) == 2 }, 2*time.Second, 10*time.Millisecond)
	rows, err := srv.queryDB(t).QueryContext(context.Background(), `SELECT model_id, model_display_name FROM usage_sample ORDER BY rowid`)
	require.NoError(t, err)
	defer func() { _ = rows.Close() }()
	var got [][2]string
	for rows.Next() {
		var id, name string
		require.NoError(t, rows.Scan(&id, &name))
		got = append(got, [2]string{id, name})
	}
	require.NoError(t, rows.Err())
	assert.Equal(t, [][2]string{
		{"claude-haiku-4-5-20251001", "Haiku 4.5"},
		{"claude-opus-5", "Opus 5"},
	}, got, "history keeps recording the model even though the wire dropped it")
}

// TestIngestStatusLine_ModelOnlyChangeKeepsStateSnapshotFreeOfModel checks for the
// GET /api/state snapshot after a model-bearing status post.
func TestIngestStatusLine_ModelOnlyChangeKeepsStateSnapshotFreeOfModel(t *testing.T) {
	srv, _, _ := modelOnlyScenario(t)

	req := httptest.NewRequest(http.MethodGet, "/api/state", nil)
	req.AddCookie(&http.Cookie{Name: cookieName, Value: testUIToken})
	rec := httptest.NewRecorder()
	srv.Handler().ServeHTTP(rec, req)
	require.Equal(t, http.StatusOK, rec.Code)
	var state struct {
		Usage map[string]json.RawMessage `json:"usage"`
	}
	require.NoError(t, json.Unmarshal(rec.Body.Bytes(), &state))
	assert.NotContains(t, state.Usage, "model", "GET /api/state with known buckets")
	assert.Contains(t, state.Usage, "fiveHour")
	assert.NotEqual(t, "null", string(state.Usage["fiveHour"]))
}
