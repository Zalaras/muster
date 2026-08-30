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
	// source, prefs.view/density default to "focus"/"2x2" (density added in m2-terminal,
	// REQ-10). This is the exact object docs/protocol.md §5.2/§8 pins, shared verbatim by
	// GET /api/state and the WS `snapshot` message.
	got, err := json.Marshal(buildSnapshot())
	require.NoError(t, err)

	assert.JSONEq(t, `{
		"sessions": [],
		"usage": {
			"fiveHour": null, "sevenDay": null, "model": null, "sampledAt": null, "source": "subscription",
			"modelScoped": null, "modelScopedAt": null, "modelScopedError": null, "modelScopedSource": "subscription-api"
		},
		"prefs": {"view": "focus", "density": "2x2", "usageModel": "Fable", "railSort": "manual"}
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
	assert.Nil(t, snap.Usage.Model)
	assert.Nil(t, snap.Usage.SampledAt)
	assert.Equal(t, "subscription", snap.Usage.Source)
	assert.Nil(t, snap.Usage.ModelScoped)
	assert.Nil(t, snap.Usage.ModelScopedAt)
	assert.Nil(t, snap.Usage.ModelScopedError)
	assert.Equal(t, "subscription-api", snap.Usage.ModelScopedSource)
	assert.Equal(t, "focus", snap.Prefs.View)
	assert.Equal(t, "2x2", snap.Prefs.Density)
	assert.Equal(t, "Fable", snap.Prefs.UsageModel)
	assert.Equal(t, "manual", snap.Prefs.RailSort)
}

// TestCurrentSnapshot_LoadsPersistedPrefsFromKV covers the currentSnapshot half of
// REQ-10 directly (D10's daemon-restart half lives in prefs_test.go): once a prefs PUT
// has landed in kv, a later snapshot (GET /api/state or the WS `snapshot`) reflects it,
// not the fixed default buildSnapshot returns.
func TestCurrentSnapshot_LoadsPersistedPrefsFromKV(t *testing.T) {
	srv := newTestServer(t, ClaudeCodeInfo{})
	rec := putPrefsRequest(t, srv, `{"view":"tiles","density":"3x2"}`)
	require.Equal(t, http.StatusNoContent, rec.Code)

	req := httptest.NewRequest(http.MethodGet, "/api/state", nil)
	req.AddCookie(&http.Cookie{Name: cookieName, Value: testUIToken})
	out := httptest.NewRecorder()
	srv.Handler().ServeHTTP(out, req)

	var snap Snapshot
	require.NoError(t, json.Unmarshal(out.Body.Bytes(), &snap))
	assert.Equal(t, "tiles", snap.Prefs.View)
	assert.Equal(t, "3x2", snap.Prefs.Density)
}
