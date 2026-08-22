package server

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestBuildSnapshot_M0Shape(t *testing.T) {
	// REQ-6/REQ-16: M0's snapshot is fixed — empty sessions, every usage field null except
	// source, prefs.view defaults to "focus". This is the exact object docs/protocol.md
	// §5.2/§8 pins for M0, shared verbatim by GET /api/state and the WS `snapshot` message.
	got, err := json.Marshal(buildSnapshot())
	require.NoError(t, err)

	assert.JSONEq(t, `{
		"sessions": [],
		"usage": {"fiveHour": null, "sevenDay": null, "sampledAt": null, "source": "subscription"},
		"prefs": {"view": "focus"}
	}`, string(got))
}

func TestHandleState_ReturnsSnapshotJSON(t *testing.T) {
	srv := newTestServer(t, ClaudeCodeInfo{})

	req := httptest.NewRequest(http.MethodGet, "/api/state", nil)
	req.AddCookie(&http.Cookie{Name: cookieName, Value: testUIToken})
	rec := httptest.NewRecorder()
	srv.Handler().ServeHTTP(rec, req)

	require.Equal(t, http.StatusOK, rec.Code)
	assert.Equal(t, "application/json", rec.Header().Get("Content-Type"))

	var snap Snapshot
	require.NoError(t, json.Unmarshal(rec.Body.Bytes(), &snap))
	assert.Empty(t, snap.Sessions)
	assert.Nil(t, snap.Usage.FiveHour)
	assert.Nil(t, snap.Usage.SevenDay)
	assert.Nil(t, snap.Usage.SampledAt)
	assert.Equal(t, "subscription", snap.Usage.Source)
	assert.Equal(t, "focus", snap.Prefs.View)
}
