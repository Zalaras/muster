package server

import (
	"context"
	"net/http"
	"net/http/httptest"
	"path/filepath"
	"testing"

	"github.com/rs/zerolog"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/Zalaras/muster/internal/store"
)

// TestLoadPrefs_DefaultRailDensityAndRailActivity covers kb:anchor/prefs.put's
// default-before-any-PUT clause for the two new fields (plan rail-card-improvements
// REQ-3/REQ-13).
func TestLoadPrefs_DefaultRailDensityAndRailActivity(t *testing.T) {
	srv := newTestServer(t, ClaudeCodeInfo{})

	got := loadPrefs(context.Background(), srv.store)

	assert.Equal(t, "comfortable", got.RailDensity)
	assert.Equal(t, "turn", got.RailActivity)
}

// TestHandlePutPrefs_RailDensityValidationErrors covers D13's 400 invalid_request clause
// for railDensity, including the plan's exact error message.
func TestHandlePutPrefs_RailDensityValidationErrors(t *testing.T) {
	tests := []struct {
		name string
		body string
	}{
		{"empty string", `{"railDensity":""}`},
		{"unknown enum value", `{"railDensity":"cosy"}`},
		{"case-sensitive mismatch", `{"railDensity":"Compact"}`},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			srv := newTestServer(t, ClaudeCodeInfo{})

			rec := putPrefsRequest(t, srv, tt.body)

			assert.Equal(t, http.StatusBadRequest, rec.Code)
			assert.Equal(t, "invalid_request", decodeErrorCode(t, rec))
			assert.Equal(t, "railDensity must be one of compact, comfortable, expanded", decodeErrorMessage(t, rec))
		})
	}
}

// TestHandlePutPrefs_RailActivityValidationErrors covers D13's 400 invalid_request
// clause for railActivity, including the plan's exact error message.
func TestHandlePutPrefs_RailActivityValidationErrors(t *testing.T) {
	tests := []struct {
		name string
		body string
	}{
		{"empty string", `{"railActivity":""}`},
		{"unknown enum value", `{"railActivity":"summary"}`},
		{"case-sensitive mismatch", `{"railActivity":"Turn"}`},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			srv := newTestServer(t, ClaudeCodeInfo{})

			rec := putPrefsRequest(t, srv, tt.body)

			assert.Equal(t, http.StatusBadRequest, rec.Code)
			assert.Equal(t, "invalid_request", decodeErrorCode(t, rec))
			assert.Equal(t, "railActivity must be one of turn, prompt, reply, both", decodeErrorMessage(t, rec))
		})
	}
}

// TestHandlePutPrefs_RailDensityAcceptsAllThreeEnumValues covers D13's accepted half for
// railDensity.
func TestHandlePutPrefs_RailDensityAcceptsAllThreeEnumValues(t *testing.T) {
	for _, v := range []string{"compact", "comfortable", "expanded"} {
		t.Run(v, func(t *testing.T) {
			srv := newTestServer(t, ClaudeCodeInfo{})

			rec := putPrefsRequest(t, srv, `{"railDensity":"`+v+`"}`)

			require.Equal(t, http.StatusNoContent, rec.Code)
			assert.Equal(t, v, loadPrefs(context.Background(), srv.store).RailDensity)
		})
	}
}

// TestHandlePutPrefs_RailActivityAcceptsAllFourEnumValues covers D13's accepted half for
// railActivity.
func TestHandlePutPrefs_RailActivityAcceptsAllFourEnumValues(t *testing.T) {
	for _, v := range []string{"turn", "prompt", "reply", "both"} {
		t.Run(v, func(t *testing.T) {
			srv := newTestServer(t, ClaudeCodeInfo{})

			rec := putPrefsRequest(t, srv, `{"railActivity":"`+v+`"}`)

			require.Equal(t, http.StatusNoContent, rec.Code)
			assert.Equal(t, v, loadPrefs(context.Background(), srv.store).RailActivity)
		})
	}
}

// TestHandlePutPrefs_RailDensityAndRailActivityPresentAloneSatisfyAtLeastOneFieldRequired
// mirrors the other fields' own version of this test: a request naming only one of the
// two new fields must not be rejected as empty.
func TestHandlePutPrefs_RailDensityAndRailActivityPresentAloneSatisfyAtLeastOneFieldRequired(t *testing.T) {
	t.Run("railDensity alone", func(t *testing.T) {
		srv := newTestServer(t, ClaudeCodeInfo{})
		rec := putPrefsRequest(t, srv, `{"railDensity":"expanded"}`)
		assert.Equal(t, http.StatusNoContent, rec.Code)
	})
	t.Run("railActivity alone", func(t *testing.T) {
		srv := newTestServer(t, ClaudeCodeInfo{})
		rec := putPrefsRequest(t, srv, `{"railActivity":"both"}`)
		assert.Equal(t, http.StatusNoContent, rec.Code)
	})
}

// TestHandlePutPrefs_SetsRailDensityOnlyLeavesOtherFieldsUntouched covers the per-field
// independence every other pref field already has, extended to the two new ones.
func TestHandlePutPrefs_SetsRailDensityOnlyLeavesOtherFieldsUntouched(t *testing.T) {
	srv := newTestServer(t, ClaudeCodeInfo{})
	require.Equal(t, http.StatusNoContent, putPrefsRequest(t, srv, `{"view":"tiles","density":"3x2","railActivity":"prompt"}`).Code)

	rec := putPrefsRequest(t, srv, `{"railDensity":"compact"}`)

	require.Equal(t, http.StatusNoContent, rec.Code)
	got := loadPrefs(context.Background(), srv.store)
	assert.Equal(t, "tiles", got.View, "a railDensity-only PUT must not reset view")
	assert.Equal(t, "3x2", got.Density, "a railDensity-only PUT must not reset density")
	assert.Equal(t, "prompt", got.RailActivity, "a railDensity-only PUT must not reset railActivity")
	assert.Equal(t, "compact", got.RailDensity)
}

// TestHandlePutPrefs_SetsRailActivityOnlyLeavesOtherFieldsUntouched is the same test for
// the other new field.
func TestHandlePutPrefs_SetsRailActivityOnlyLeavesOtherFieldsUntouched(t *testing.T) {
	srv := newTestServer(t, ClaudeCodeInfo{})
	require.Equal(t, http.StatusNoContent, putPrefsRequest(t, srv, `{"view":"tiles","railDensity":"expanded"}`).Code)

	rec := putPrefsRequest(t, srv, `{"railActivity":"reply"}`)

	require.Equal(t, http.StatusNoContent, rec.Code)
	got := loadPrefs(context.Background(), srv.store)
	assert.Equal(t, "tiles", got.View, "a railActivity-only PUT must not reset view")
	assert.Equal(t, "expanded", got.RailDensity, "a railActivity-only PUT must not reset railDensity")
	assert.Equal(t, "reply", got.RailActivity)
}

// TestLoadPrefs_InvalidRailDensityInKVFallsBackToComfortableIndependently and its
// railActivity twin below extend the per-field-independence coverage every other field
// has: an invalid persisted value falls back to that field's own default, leaving every
// other field's own persisted value (valid or not) alone.
func TestLoadPrefs_InvalidRailDensityInKVFallsBackToComfortableIndependently(t *testing.T) {
	srv := newTestServer(t, ClaudeCodeInfo{})
	require.NoError(t, srv.store.KVSet(context.Background(), "prefs", `{"view":"tiles","railDensity":"cosy","railActivity":"prompt"}`))

	got := loadPrefs(context.Background(), srv.store)

	assert.Equal(t, "comfortable", got.RailDensity, "an invalid persisted railDensity must fall back to the default")
	assert.Equal(t, "prompt", got.RailActivity, "a sibling field's valid persisted value must survive independently")
	assert.Equal(t, "tiles", got.View)
}

func TestLoadPrefs_InvalidRailActivityInKVFallsBackToTurnIndependently(t *testing.T) {
	srv := newTestServer(t, ClaudeCodeInfo{})
	require.NoError(t, srv.store.KVSet(context.Background(), "prefs", `{"view":"tiles","railDensity":"expanded","railActivity":"summary"}`))

	got := loadPrefs(context.Background(), srv.store)

	assert.Equal(t, "turn", got.RailActivity, "an invalid persisted railActivity must fall back to the default")
	assert.Equal(t, "expanded", got.RailDensity, "a sibling field's valid persisted value must survive independently")
}

// TestHandlePutPrefs_PersistsRailDensityAndRailActivityToKV covers D13's persistence
// clause directly against the store, pinning the exact full-object shape (including
// both new keys) the way the other fields' own "PersistsToKV" tests do.
func TestHandlePutPrefs_PersistsRailDensityAndRailActivityToKV(t *testing.T) {
	srv := newTestServer(t, ClaudeCodeInfo{})

	rec := putPrefsRequest(t, srv, `{"railDensity":"compact","railActivity":"both"}`)
	require.Equal(t, http.StatusNoContent, rec.Code)

	raw, ok, err := srv.store.KVGet(context.Background(), "prefs")
	require.NoError(t, err)
	require.True(t, ok)
	assert.JSONEq(t, `{"view":"focus","density":"2x2","usageModel":"Fable","railSort":"manual","theme":"follow","updateCheck":true,"railDensity":"compact","railActivity":"both"}`, raw)
}

// TestHandlePutPrefs_BroadcastsRailDensityAndRailActivityInPrefsMessage covers INV-4's
// echo clause for the two new fields: an accepted PUT broadcasts the full prefs object
// including both to every connected UI socket.
func TestHandlePutPrefs_BroadcastsRailDensityAndRailActivityInPrefsMessage(t *testing.T) {
	srv := newTestServer(t, ClaudeCodeInfo{})
	httpSrv := httptest.NewServer(srv.Handler())
	t.Cleanup(httpSrv.Close)
	wsURL := "ws" + httpSrv.URL[len("http"):] + "/ws"

	c, err := dialWS(t, wsURL, nil)
	require.NoError(t, err)
	defer func() { _ = c.CloseNow() }()
	_ = readJSON[helloWire](t, c)
	_ = readJSON[snapshotWire](t, c)

	rec := putPrefsRequest(t, srv, `{"railDensity":"expanded","railActivity":"reply"}`)
	require.Equal(t, http.StatusNoContent, rec.Code)

	msg := readJSON[prefsWireWithRailCards](t, c)
	assert.Equal(t, "prefs", msg.Type)
	assert.Equal(t, "expanded", msg.Prefs.RailDensity)
	assert.Equal(t, "reply", msg.Prefs.RailActivity)

	assertNoPrefsMessageArrives(t, c)
}

type prefsWireWithRailCards struct {
	Type  string `json:"type"`
	Prefs struct {
		RailDensity  string `json:"railDensity"`
		RailActivity string `json:"railActivity"`
	} `json:"prefs"`
}

// TestPrefs_RailDensityAndRailActivityPersistAcrossADaemonRestart mirrors
// TestPrefs_RailSortPersistsAcrossADaemonRestart (prefs_test.go) for the two new fields:
// a fresh Server opened against the same on-disk store sees the persisted values.
func TestPrefs_RailDensityAndRailActivityPersistAcrossADaemonRestart(t *testing.T) {
	dbPath := filepath.Join(t.TempDir(), "muster.db")
	st1, err := store.Open(context.Background(), dbPath)
	require.NoError(t, err)

	srv1 := New(Config{
		Store: st1, Logger: zerolog.Nop(), UIToken: testUIToken, IngestToken: testIngestToken,
		WebDist: t.TempDir(), DaemonVersion: "test-version",
	})
	rec := putPrefsRequest(t, &testServer{Server: srv1}, `{"railDensity":"compact","railActivity":"both"}`)
	require.Equal(t, http.StatusNoContent, rec.Code)
	require.NoError(t, st1.Close())

	st2, err := store.Open(context.Background(), dbPath)
	require.NoError(t, err)
	t.Cleanup(func() { _ = st2.Close() })
	srv2 := New(Config{
		Store: st2, Logger: zerolog.Nop(), UIToken: testUIToken, IngestToken: testIngestToken,
		WebDist: t.TempDir(), DaemonVersion: "test-version",
	})

	got := loadPrefs(context.Background(), srv2.store)
	assert.Equal(t, "compact", got.RailDensity)
	assert.Equal(t, "both", got.RailActivity)
}
