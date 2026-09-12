package server

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"github.com/coder/websocket"
	"github.com/rs/zerolog"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/Zalaras/muster/internal/store"
)

// putPrefsRequest issues PUT /api/prefs with the UI cookie attached (mirrors
// sessions_test.go's postSessionsRequest for the other write endpoint).
func putPrefsRequest(t *testing.T, srv *testServer, body string) *httptest.ResponseRecorder {
	t.Helper()
	req := httptest.NewRequest(http.MethodPut, "/api/prefs", strings.NewReader(body))
	req.AddCookie(&http.Cookie{Name: cookieName, Value: testUIToken})
	rec := httptest.NewRecorder()
	srv.Handler().ServeHTTP(rec, req)
	return rec
}

func TestHandlePutPrefs_RequiresCookie(t *testing.T) {
	srv := newTestServer(t, ClaudeCodeInfo{})

	req := httptest.NewRequest(http.MethodPut, "/api/prefs", strings.NewReader(`{"view":"tiles"}`))
	rec := httptest.NewRecorder()
	srv.Handler().ServeHTTP(rec, req)

	assert.Equal(t, http.StatusUnauthorized, rec.Code)
}

func TestHandlePutPrefs_InvalidJSONBodyIs400(t *testing.T) {
	srv := newTestServer(t, ClaudeCodeInfo{})

	rec := putPrefsRequest(t, srv, `not valid json`)

	assert.Equal(t, http.StatusBadRequest, rec.Code)
	assert.Equal(t, "invalid_request", decodeErrorCode(t, rec))
}

// TestHandlePutPrefs_ValidationErrors covers the Protocol Contract's 400
// invalid_request clause: no known field present, or a field whose value is outside
// its enum. Every case here must also leave the persisted prefs (and any connected
// socket) completely untouched — see
// TestHandlePutPrefs_RejectedRequestsNeverPersistOrBroadcast.
func TestHandlePutPrefs_ValidationErrors(t *testing.T) {
	tests := []struct {
		name string
		body string
	}{
		{"empty object, no known field", `{}`},
		{"only unknown fields", `{"bogus":"whatever"}`},
		{"invalid view enum", `{"view":"sideways"}`},
		{"invalid density enum", `{"density":"4x4"}`},
		{"empty string view", `{"view":""}`},
		{"empty string density", `{"density":""}`},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			srv := newTestServer(t, ClaudeCodeInfo{})

			rec := putPrefsRequest(t, srv, tt.body)

			assert.Equal(t, http.StatusBadRequest, rec.Code)
			assert.Equal(t, "invalid_request", decodeErrorCode(t, rec))
		})
	}
}

func TestHandlePutPrefs_UnknownFieldsAlongsideAKnownOneAreIgnored(t *testing.T) {
	srv := newTestServer(t, ClaudeCodeInfo{})

	rec := putPrefsRequest(t, srv, `{"view":"tiles","bogus":123}`)

	require.Equal(t, http.StatusNoContent, rec.Code)
	assert.Equal(t, "tiles", srv.loadPrefs(context.Background()).View)
}

func TestHandlePutPrefs_SetsViewOnlyLeavesDensityUntouched(t *testing.T) {
	srv := newTestServer(t, ClaudeCodeInfo{})
	require.Equal(t, http.StatusNoContent, putPrefsRequest(t, srv, `{"density":"3x2"}`).Code)

	rec := putPrefsRequest(t, srv, `{"view":"tiles"}`)

	require.Equal(t, http.StatusNoContent, rec.Code)
	got := srv.loadPrefs(context.Background())
	assert.Equal(t, "tiles", got.View)
	assert.Equal(t, "3x2", got.Density, "a view-only PUT must not reset density back to its default")
}

func TestHandlePutPrefs_SetsDensityOnlyLeavesViewUntouched(t *testing.T) {
	srv := newTestServer(t, ClaudeCodeInfo{})
	require.Equal(t, http.StatusNoContent, putPrefsRequest(t, srv, `{"view":"tiles"}`).Code)

	rec := putPrefsRequest(t, srv, `{"density":"3x2"}`)

	require.Equal(t, http.StatusNoContent, rec.Code)
	got := srv.loadPrefs(context.Background())
	assert.Equal(t, "tiles", got.View, "a density-only PUT must not reset view back to its default")
	assert.Equal(t, "3x2", got.Density)
}

func TestHandlePutPrefs_SetsBothFieldsInOneRequest(t *testing.T) {
	srv := newTestServer(t, ClaudeCodeInfo{})

	rec := putPrefsRequest(t, srv, `{"view":"tiles","density":"3x2"}`)

	require.Equal(t, http.StatusNoContent, rec.Code)
	got := srv.loadPrefs(context.Background())
	assert.Equal(t, "tiles", got.View)
	assert.Equal(t, "3x2", got.Density)
}

// TestHandlePutPrefs_PersistsToKVUnderOneJSONKey covers the plan's Schema Changes note
// directly against the store, not just via loadPrefs/GET /api/state.
func TestHandlePutPrefs_PersistsToKVUnderOneJSONKey(t *testing.T) {
	srv := newTestServer(t, ClaudeCodeInfo{})

	rec := putPrefsRequest(t, srv, `{"view":"tiles","density":"3x2"}`)
	require.Equal(t, http.StatusNoContent, rec.Code)

	raw, ok, err := srv.store.KVGet(context.Background(), "prefs")
	require.NoError(t, err)
	require.True(t, ok)
	assert.JSONEq(t, `{"view":"tiles","density":"3x2","usageModel":"Fable","railSort":"manual","theme":"follow","updateCheck":true}`, raw)
}

func TestLoadPrefs_DefaultsBeforeAnyPUT(t *testing.T) {
	srv := newTestServer(t, ClaudeCodeInfo{})

	got := srv.loadPrefs(context.Background())

	assert.Equal(t, "focus", got.View)
	assert.Equal(t, "2x2", got.Density)
}

// TestLoadPrefs_CorruptKVValueFallsBackToDefaults covers loadPrefs' own doc comment: a
// bad kv row must never fail a snapshot.
func TestLoadPrefs_CorruptKVValueFallsBackToDefaults(t *testing.T) {
	srv := newTestServer(t, ClaudeCodeInfo{})
	require.NoError(t, srv.store.KVSet(context.Background(), "prefs", `{not valid json`))

	got := srv.loadPrefs(context.Background())

	assert.Equal(t, "focus", got.View)
	assert.Equal(t, "2x2", got.Density)
}

// TestLoadPrefs_InvalidEnumValuesInKVFallBackPerField covers a corrupt-but-well-formed
// kv row (e.g. hand-edited, or from a future version with a since-removed enum value):
// each field falls back independently rather than the whole object being discarded.
func TestLoadPrefs_InvalidEnumValuesInKVFallBackPerField(t *testing.T) {
	srv := newTestServer(t, ClaudeCodeInfo{})
	require.NoError(t, srv.store.KVSet(context.Background(), "prefs", `{"view":"sideways","density":"3x2"}`))

	got := srv.loadPrefs(context.Background())

	assert.Equal(t, "focus", got.View, "an invalid persisted view must fall back to the default, not propagate")
	assert.Equal(t, "3x2", got.Density, "a valid sibling field must survive the other field's fallback")
}

// TestHandlePutPrefs_RejectedRequestsNeverPersistOrBroadcast asserts the "iff accepted"
// half of INV-4 from a non-empty starting state (m1-sessions lesson: assert invariants
// from every reachable state, not just the convenient one) — prefs already set to a
// non-default value, then a rejected PUT must change neither the persisted value nor
// produce a broadcast.
func TestHandlePutPrefs_RejectedRequestsNeverPersistOrBroadcast(t *testing.T) {
	srv := newTestServer(t, ClaudeCodeInfo{})
	require.Equal(t, http.StatusNoContent, putPrefsRequest(t, srv, `{"view":"tiles","density":"3x2"}`).Code)

	httpSrv := httptest.NewServer(srv.Handler())
	t.Cleanup(httpSrv.Close)
	wsURL := "ws" + httpSrv.URL[len("http"):] + "/ws"
	c, err := dialWS(t, wsURL, nil)
	require.NoError(t, err)
	defer func() { _ = c.CloseNow() }()
	_ = readJSON[helloWire](t, c)
	_ = readJSON[snapshotWire](t, c)

	rec := putPrefsRequest(t, srv, `{"view":"sideways"}`)
	require.Equal(t, http.StatusBadRequest, rec.Code)

	got := srv.loadPrefs(context.Background())
	assert.Equal(t, "tiles", got.View, "a rejected PUT must not touch the persisted prefs")
	assert.Equal(t, "3x2", got.Density)

	assertNoPrefsMessageArrives(t, c)
}

// TestHandlePutPrefs_BroadcastsExactlyOnePrefsMessageToEveryConnectedUISocket covers
// D11/INV-4: every accepted PUT produces exactly one `prefs` broadcast carrying the
// full object, fanned out to every connected UI socket (not just the one that PUT).
func TestHandlePutPrefs_BroadcastsExactlyOnePrefsMessageToEveryConnectedUISocket(t *testing.T) {
	srv := newTestServer(t, ClaudeCodeInfo{})
	httpSrv := httptest.NewServer(srv.Handler())
	t.Cleanup(httpSrv.Close)
	wsURL := "ws" + httpSrv.URL[len("http"):] + "/ws"

	var conns []*websocket.Conn
	for range 2 {
		c, err := dialWS(t, wsURL, nil)
		require.NoError(t, err)
		defer func() { _ = c.CloseNow() }()
		_ = readJSON[helloWire](t, c)
		_ = readJSON[snapshotWire](t, c)
		conns = append(conns, c)
	}

	rec := putPrefsRequest(t, srv, `{"view":"tiles","density":"3x2"}`)
	require.Equal(t, http.StatusNoContent, rec.Code)

	for i, c := range conns {
		msg := readJSON[prefsWire](t, c)
		assert.Equal(t, "prefs", msg.Type, "socket %d", i)
		assert.Equal(t, "tiles", msg.Prefs.View, "socket %d", i)
		assert.Equal(t, "3x2", msg.Prefs.Density, "socket %d", i)
	}

	// Exactly one, not two: nothing further should arrive on either socket.
	for _, c := range conns {
		assertNoPrefsMessageArrives(t, c)
	}
}

// TestHandlePutPrefs_TwoAcceptedPutsProduceTwoBroadcasts covers the same invariant from
// a second reachable state — a second accepted PUT (last-write-wins per Edge Case 8)
// must broadcast again, not be coalesced/deduplicated away.
func TestHandlePutPrefs_TwoAcceptedPutsProduceTwoBroadcasts(t *testing.T) {
	srv := newTestServer(t, ClaudeCodeInfo{})
	httpSrv := httptest.NewServer(srv.Handler())
	t.Cleanup(httpSrv.Close)
	wsURL := "ws" + httpSrv.URL[len("http"):] + "/ws"

	c, err := dialWS(t, wsURL, nil)
	require.NoError(t, err)
	defer func() { _ = c.CloseNow() }()
	_ = readJSON[helloWire](t, c)
	_ = readJSON[snapshotWire](t, c)

	require.Equal(t, http.StatusNoContent, putPrefsRequest(t, srv, `{"view":"tiles"}`).Code)
	first := readJSON[prefsWire](t, c)
	assert.Equal(t, "tiles", first.Prefs.View)

	require.Equal(t, http.StatusNoContent, putPrefsRequest(t, srv, `{"density":"3x2"}`).Code)
	second := readJSON[prefsWire](t, c)
	assert.Equal(t, "tiles", second.Prefs.View)
	assert.Equal(t, "3x2", second.Prefs.Density)
}

// TestPrefs_PersistAcrossADaemonRestart covers D10: a fresh Server built against the
// same on-disk store (simulating a daemon restart, since tmux/PTY state is irrelevant
// to prefs) still returns the last-written prefs.
func TestPrefs_PersistAcrossADaemonRestart(t *testing.T) {
	dbPath := filepath.Join(t.TempDir(), "muster.db")
	st1, err := store.Open(context.Background(), dbPath)
	require.NoError(t, err)

	srv1 := New(Config{
		Store: st1, Logger: zerolog.Nop(), UIToken: testUIToken, IngestToken: testIngestToken,
		WebDist: t.TempDir(), DaemonVersion: "test-version",
	})
	req := httptest.NewRequest(http.MethodPut, "/api/prefs", strings.NewReader(`{"view":"tiles","density":"3x2"}`))
	req.AddCookie(&http.Cookie{Name: cookieName, Value: testUIToken})
	rec := httptest.NewRecorder()
	srv1.Handler().ServeHTTP(rec, req)
	require.Equal(t, http.StatusNoContent, rec.Code)
	require.NoError(t, st1.Close())

	st2, err := store.Open(context.Background(), dbPath)
	require.NoError(t, err)
	t.Cleanup(func() { _ = st2.Close() })
	srv2 := New(Config{
		Store: st2, Logger: zerolog.Nop(), UIToken: testUIToken, IngestToken: testIngestToken,
		WebDist: t.TempDir(), DaemonVersion: "test-version",
	})

	got := srv2.loadPrefs(context.Background())
	assert.Equal(t, "tiles", got.View, "prefs must survive a daemon restart (D10)")
	assert.Equal(t, "3x2", got.Density)
}

type prefsWire struct {
	Type  string `json:"type"`
	Prefs struct {
		View       string `json:"view"`
		Density    string `json:"density"`
		UsageModel string `json:"usageModel"`
	} `json:"prefs"`
}

// TestLoadPrefs_DefaultUsageModelIsFable covers kb:anchor/prefs.put's default-before-any-PUT clause for
// the new field.
func TestLoadPrefs_DefaultUsageModelIsFable(t *testing.T) {
	srv := newTestServer(t, ClaudeCodeInfo{})

	got := srv.loadPrefs(context.Background())

	assert.Equal(t, "Fable", got.UsageModel)
}

// TestHandlePutPrefs_UsageModelValidationErrors covers kb:anchor/prefs.put's 400 invalid_request
// clause for usageModel: present and empty, or present and over 32 chars after trim.
func TestHandlePutPrefs_UsageModelValidationErrors(t *testing.T) {
	tests := []struct {
		name string
		body string
	}{
		{"empty string", `{"usageModel":""}`},
		{"whitespace-only string trims to empty", `{"usageModel":"   "}`},
		{"33 chars, one over the limit", `{"usageModel":"` + strings.Repeat("x", 33) + `"}`},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			srv := newTestServer(t, ClaudeCodeInfo{})

			rec := putPrefsRequest(t, srv, tt.body)

			assert.Equal(t, http.StatusBadRequest, rec.Code)
			assert.Equal(t, "invalid_request", decodeErrorCode(t, rec))
		})
	}
}

// TestHandlePutPrefs_UsageModelExactly32CharsIsAccepted covers the boundary of kb:anchor/prefs.put's
// "1-32 chars after trim" range.
func TestHandlePutPrefs_UsageModelExactly32CharsIsAccepted(t *testing.T) {
	srv := newTestServer(t, ClaudeCodeInfo{})
	name := strings.Repeat("x", 32)

	rec := putPrefsRequest(t, srv, `{"usageModel":"`+name+`"}`)

	require.Equal(t, http.StatusNoContent, rec.Code)
	assert.Equal(t, name, srv.loadPrefs(context.Background()).UsageModel)
}

// TestHandlePutPrefs_SetsUsageModelOnlyLeavesViewAndDensityUntouched covers the
// per-field independence REQ-8 requires, mirroring
// TestHandlePutPrefs_SetsViewOnlyLeavesDensityUntouched for the third field.
func TestHandlePutPrefs_SetsUsageModelOnlyLeavesViewAndDensityUntouched(t *testing.T) {
	srv := newTestServer(t, ClaudeCodeInfo{})
	require.Equal(t, http.StatusNoContent, putPrefsRequest(t, srv, `{"view":"tiles","density":"3x2"}`).Code)

	rec := putPrefsRequest(t, srv, `{"usageModel":"Opus"}`)

	require.Equal(t, http.StatusNoContent, rec.Code)
	got := srv.loadPrefs(context.Background())
	assert.Equal(t, "tiles", got.View, "a usageModel-only PUT must not reset view")
	assert.Equal(t, "3x2", got.Density, "a usageModel-only PUT must not reset density")
	assert.Equal(t, "Opus", got.UsageModel)
}

// TestHandlePutPrefs_UsageModelIsTrimmedBeforePersisting covers kb:anchor/prefs.put's "optional
// string, 1-32 chars after trim" — the persisted/echoed value itself must be trimmed,
// not just validated as if it were.
func TestHandlePutPrefs_UsageModelIsTrimmedBeforePersisting(t *testing.T) {
	srv := newTestServer(t, ClaudeCodeInfo{})

	rec := putPrefsRequest(t, srv, `{"usageModel":"  Opus  "}`)

	require.Equal(t, http.StatusNoContent, rec.Code)
	assert.Equal(t, "Opus", srv.loadPrefs(context.Background()).UsageModel)
}

// TestHandlePutPrefs_UsageModelPresentAloneSatisfiesAtLeastOneFieldRequired covers the
// "at least one of view, density or usageModel is required" clause from usageModel's
// side — a request naming only usageModel must not be rejected as empty.
func TestHandlePutPrefs_UsageModelPresentAloneSatisfiesAtLeastOneFieldRequired(t *testing.T) {
	srv := newTestServer(t, ClaudeCodeInfo{})

	rec := putPrefsRequest(t, srv, `{"usageModel":"Opus"}`)

	assert.Equal(t, http.StatusNoContent, rec.Code)
}

// TestHandlePutPrefs_UsageModelPersistsToKVAlongsideViewAndDensity covers the plan's
// Schema Changes note ("Prefs stay in the kv JSON blob") for the new field.
func TestHandlePutPrefs_UsageModelPersistsToKVAlongsideViewAndDensity(t *testing.T) {
	srv := newTestServer(t, ClaudeCodeInfo{})

	rec := putPrefsRequest(t, srv, `{"view":"tiles","density":"3x2","usageModel":"Opus"}`)
	require.Equal(t, http.StatusNoContent, rec.Code)

	raw, ok, err := srv.store.KVGet(context.Background(), "prefs")
	require.NoError(t, err)
	require.True(t, ok)
	assert.JSONEq(t, `{"view":"tiles","density":"3x2","usageModel":"Opus","railSort":"manual","theme":"follow","updateCheck":true}`, raw)
}

// TestHandlePutPrefs_BroadcastsUsageModelInPrefsMessage covers D10/INV-4's echo clause
// for the new field: an accepted PUT broadcasts the full prefs object including
// usageModel to every connected UI socket.
func TestHandlePutPrefs_BroadcastsUsageModelInPrefsMessage(t *testing.T) {
	srv := newTestServer(t, ClaudeCodeInfo{})
	httpSrv := httptest.NewServer(srv.Handler())
	t.Cleanup(httpSrv.Close)
	wsURL := "ws" + httpSrv.URL[len("http"):] + "/ws"

	c, err := dialWS(t, wsURL, nil)
	require.NoError(t, err)
	defer func() { _ = c.CloseNow() }()
	_ = readJSON[helloWire](t, c)
	_ = readJSON[snapshotWire](t, c)

	rec := putPrefsRequest(t, srv, `{"usageModel":"Opus"}`)
	require.Equal(t, http.StatusNoContent, rec.Code)

	msg := readJSON[prefsWire](t, c)
	assert.Equal(t, "prefs", msg.Type)
	assert.Equal(t, "Opus", msg.Prefs.UsageModel)
}

// TestLoadPrefs_InvalidUsageModelInKVFallsBackToFableIndependently extends
// TestLoadPrefs_InvalidEnumValuesInKVFallBackPerField's per-field-independence coverage
// to the third field: an over-length usageModel in a hand-edited/legacy kv row must
// fall back to the default without discarding the other two fields.
func TestLoadPrefs_InvalidUsageModelInKVFallsBackToFableIndependently(t *testing.T) {
	srv := newTestServer(t, ClaudeCodeInfo{})
	require.NoError(t, srv.store.KVSet(context.Background(), "prefs", `{"view":"tiles","density":"3x2","usageModel":""}`))

	got := srv.loadPrefs(context.Background())

	assert.Equal(t, "tiles", got.View)
	assert.Equal(t, "3x2", got.Density)
	assert.Equal(t, "Fable", got.UsageModel, "an invalid persisted usageModel must fall back to the default")
}

// TestPrefs_UsageModelPersistsAcrossADaemonRestart mirrors
// TestPrefs_PersistAcrossADaemonRestart for the third field.
func TestPrefs_UsageModelPersistsAcrossADaemonRestart(t *testing.T) {
	dbPath := filepath.Join(t.TempDir(), "muster.db")
	st1, err := store.Open(context.Background(), dbPath)
	require.NoError(t, err)

	srv1 := New(Config{
		Store: st1, Logger: zerolog.Nop(), UIToken: testUIToken, IngestToken: testIngestToken,
		WebDist: t.TempDir(), DaemonVersion: "test-version",
	})
	rec := putPrefsRequest(t, &testServer{Server: srv1}, `{"usageModel":"Opus"}`)
	require.Equal(t, http.StatusNoContent, rec.Code)
	require.NoError(t, st1.Close())

	st2, err := store.Open(context.Background(), dbPath)
	require.NoError(t, err)
	t.Cleanup(func() { _ = st2.Close() })
	srv2 := New(Config{
		Store: st2, Logger: zerolog.Nop(), UIToken: testUIToken, IngestToken: testIngestToken,
		WebDist: t.TempDir(), DaemonVersion: "test-version",
	})

	assert.Equal(t, "Opus", srv2.loadPrefs(context.Background()).UsageModel)
}

// TestLoadPrefs_DefaultRailSortIsManual covers plan order-sidebar kb:anchor/prefs.put's
// default-before-any-PUT clause for the new field.
func TestLoadPrefs_DefaultRailSortIsManual(t *testing.T) {
	srv := newTestServer(t, ClaudeCodeInfo{})

	got := srv.loadPrefs(context.Background())

	assert.Equal(t, "manual", got.RailSort)
}

// TestHandlePutPrefs_RailSortValidationErrors covers kb:anchor/prefs.put's 400 invalid_request clause
// for railSort: anything other than "manual" or "attention".
func TestHandlePutPrefs_RailSortValidationErrors(t *testing.T) {
	tests := []struct {
		name string
		body string
	}{
		{"empty string", `{"railSort":""}`},
		{"unknown enum value", `{"railSort":"alphabetical"}`},
		{"case-sensitive mismatch", `{"railSort":"Manual"}`},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			srv := newTestServer(t, ClaudeCodeInfo{})

			rec := putPrefsRequest(t, srv, tt.body)

			assert.Equal(t, http.StatusBadRequest, rec.Code)
			assert.Equal(t, "invalid_request", decodeErrorCode(t, rec))
		})
	}
}

// TestHandlePutPrefs_RailSortAcceptsBothEnumValues covers both accepted values of the
// new field round-tripping through loadPrefs.
func TestHandlePutPrefs_RailSortAcceptsBothEnumValues(t *testing.T) {
	for _, v := range []string{"manual", "attention"} {
		t.Run(v, func(t *testing.T) {
			srv := newTestServer(t, ClaudeCodeInfo{})

			rec := putPrefsRequest(t, srv, `{"railSort":"`+v+`"}`)

			require.Equal(t, http.StatusNoContent, rec.Code)
			assert.Equal(t, v, srv.loadPrefs(context.Background()).RailSort)
		})
	}
}

// TestHandlePutPrefs_RailSortPresentAloneSatisfiesAtLeastOneFieldRequired mirrors the
// usageModel case: a request naming only railSort must not be rejected as empty.
func TestHandlePutPrefs_RailSortPresentAloneSatisfiesAtLeastOneFieldRequired(t *testing.T) {
	srv := newTestServer(t, ClaudeCodeInfo{})

	rec := putPrefsRequest(t, srv, `{"railSort":"attention"}`)

	assert.Equal(t, http.StatusNoContent, rec.Code)
}

// TestHandlePutPrefs_SetsRailSortOnlyLeavesOtherFieldsUntouched covers the per-field
// independence REQ-5 requires, mirroring the view/density/usageModel equivalents.
func TestHandlePutPrefs_SetsRailSortOnlyLeavesOtherFieldsUntouched(t *testing.T) {
	srv := newTestServer(t, ClaudeCodeInfo{})
	require.Equal(t, http.StatusNoContent, putPrefsRequest(t, srv, `{"view":"tiles","density":"3x2","usageModel":"Opus"}`).Code)

	rec := putPrefsRequest(t, srv, `{"railSort":"attention"}`)

	require.Equal(t, http.StatusNoContent, rec.Code)
	got := srv.loadPrefs(context.Background())
	assert.Equal(t, "tiles", got.View, "a railSort-only PUT must not reset view")
	assert.Equal(t, "3x2", got.Density, "a railSort-only PUT must not reset density")
	assert.Equal(t, "Opus", got.UsageModel, "a railSort-only PUT must not reset usageModel")
	assert.Equal(t, "attention", got.RailSort)
}

// TestLoadPrefs_InvalidRailSortInKVFallsBackToManualIndependently extends the
// per-field-independence coverage to the fourth field: an invalid persisted railSort in
// a hand-edited/legacy kv row must fall back to the default without discarding the
// other three fields.
func TestLoadPrefs_InvalidRailSortInKVFallsBackToManualIndependently(t *testing.T) {
	srv := newTestServer(t, ClaudeCodeInfo{})
	require.NoError(t, srv.store.KVSet(context.Background(), "prefs", `{"view":"tiles","density":"3x2","usageModel":"Opus","railSort":"bogus"}`))

	got := srv.loadPrefs(context.Background())

	assert.Equal(t, "tiles", got.View)
	assert.Equal(t, "3x2", got.Density)
	assert.Equal(t, "Opus", got.UsageModel)
	assert.Equal(t, "manual", got.RailSort, "an invalid persisted railSort must fall back to the default")
}

// TestPrefs_RailSortPersistsAcrossADaemonRestart mirrors
// TestPrefs_UsageModelPersistsAcrossADaemonRestart for the fourth field.
func TestPrefs_RailSortPersistsAcrossADaemonRestart(t *testing.T) {
	dbPath := filepath.Join(t.TempDir(), "muster.db")
	st1, err := store.Open(context.Background(), dbPath)
	require.NoError(t, err)

	srv1 := New(Config{
		Store: st1, Logger: zerolog.Nop(), UIToken: testUIToken, IngestToken: testIngestToken,
		WebDist: t.TempDir(), DaemonVersion: "test-version",
	})
	rec := putPrefsRequest(t, &testServer{Server: srv1}, `{"railSort":"attention"}`)
	require.Equal(t, http.StatusNoContent, rec.Code)
	require.NoError(t, st1.Close())

	st2, err := store.Open(context.Background(), dbPath)
	require.NoError(t, err)
	t.Cleanup(func() { _ = st2.Close() })
	srv2 := New(Config{
		Store: st2, Logger: zerolog.Nop(), UIToken: testUIToken, IngestToken: testIngestToken,
		WebDist: t.TempDir(), DaemonVersion: "test-version",
	})

	assert.Equal(t, "attention", srv2.loadPrefs(context.Background()).RailSort)
}

// TestHandlePutPrefs_BroadcastsRailSortInPrefsMessage covers D16/INV-4's echo clause for
// the new field: an accepted PUT broadcasts the full prefs object including railSort to
// every connected UI socket.
func TestHandlePutPrefs_BroadcastsRailSortInPrefsMessage(t *testing.T) {
	srv := newTestServer(t, ClaudeCodeInfo{})
	httpSrv := httptest.NewServer(srv.Handler())
	t.Cleanup(httpSrv.Close)
	wsURL := "ws" + httpSrv.URL[len("http"):] + "/ws"

	c, err := dialWS(t, wsURL, nil)
	require.NoError(t, err)
	defer func() { _ = c.CloseNow() }()
	_ = readJSON[helloWire](t, c)
	_ = readJSON[snapshotWire](t, c)

	rec := putPrefsRequest(t, srv, `{"railSort":"attention"}`)
	require.Equal(t, http.StatusNoContent, rec.Code)

	msg := readJSON[prefsWireWithRailSort](t, c)
	assert.Equal(t, "prefs", msg.Type)
	assert.Equal(t, "attention", msg.Prefs.RailSort)
}

type prefsWireWithRailSort struct {
	Type  string `json:"type"`
	Prefs struct {
		RailSort string `json:"railSort"`
	} `json:"prefs"`
}

// TestLoadPrefs_DefaultThemeIsFollow covers kb:anchor/prefs.put's default-before-any-PUT clause for the
// new field (plan new-ui-design-colors).
func TestLoadPrefs_DefaultThemeIsFollow(t *testing.T) {
	srv := newTestServer(t, ClaudeCodeInfo{})

	got := srv.loadPrefs(context.Background())

	assert.Equal(t, "follow", got.Theme)
}

// TestHandlePutPrefs_ThemeValidationErrors covers D13 and the Protocol Contract's 400
// invalid_request clause for theme: anything not matching
// ^[a-z][a-z0-9-]{0,31}$.
func TestHandlePutPrefs_ThemeValidationErrors(t *testing.T) {
	tests := []struct {
		name string
		body string
	}{
		{"empty string", `{"theme":""}`},
		{"spaces and punctuation (D13's exact case)", `{"theme":"Dark Mode!"}`},
		{"uppercase", `{"theme":"Dark"}`},
		{"starts with a digit", `{"theme":"1dark"}`},
		{"contains a space", `{"theme":"dark mode"}`},
		{"33 chars, one over the limit", `{"theme":"` + strings.Repeat("a", 33) + `"}`},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			srv := newTestServer(t, ClaudeCodeInfo{})

			rec := putPrefsRequest(t, srv, tt.body)

			assert.Equal(t, http.StatusBadRequest, rec.Code)
			assert.Equal(t, "invalid_request", decodeErrorCode(t, rec))
		})
	}
}

// TestHandlePutPrefs_ThemeAcceptsTheOpaquePattern covers the accepted half of the
// pattern: the daemon never interprets the value beyond validThemePattern (REQ-7's "the
// client owns the theme registry"), so any 1-32 char lowercase/digit/hyphen string
// starting with a letter is accepted, known theme name or not.
func TestHandlePutPrefs_ThemeAcceptsTheOpaquePattern(t *testing.T) {
	tests := []string{"follow", "dark", "light", "instrument", "a", "dark-daltonized", strings.Repeat("a", 32)}
	for _, v := range tests {
		t.Run(v, func(t *testing.T) {
			srv := newTestServer(t, ClaudeCodeInfo{})

			rec := putPrefsRequest(t, srv, `{"theme":"`+v+`"}`)

			require.Equal(t, http.StatusNoContent, rec.Code)
			assert.Equal(t, v, srv.loadPrefs(context.Background()).Theme)
		})
	}
}

// TestHandlePutPrefs_ThemePersistsToKV covers D12: a PUT naming theme lands in the kv
// blob under the existing single "prefs" key.
func TestHandlePutPrefs_ThemePersistsToKV(t *testing.T) {
	srv := newTestServer(t, ClaudeCodeInfo{})

	rec := putPrefsRequest(t, srv, `{"theme":"dark"}`)
	require.Equal(t, http.StatusNoContent, rec.Code)

	raw, ok, err := srv.store.KVGet(context.Background(), "prefs")
	require.NoError(t, err)
	require.True(t, ok)
	assert.JSONEq(t, `{"view":"focus","density":"2x2","usageModel":"Fable","railSort":"manual","theme":"dark","updateCheck":true}`, raw)
}

// TestHandlePutPrefs_ThemeFollowRoundTripsAfterAnOverride covers D14 from the "returning
// to follow" reachable state, not just the fresh-daemon default: after overriding to
// "dark", a PUT of "follow" is accepted and the stored value is exactly "follow".
func TestHandlePutPrefs_ThemeFollowRoundTripsAfterAnOverride(t *testing.T) {
	srv := newTestServer(t, ClaudeCodeInfo{})
	require.Equal(t, http.StatusNoContent, putPrefsRequest(t, srv, `{"theme":"dark"}`).Code)
	require.Equal(t, "dark", srv.loadPrefs(context.Background()).Theme)

	rec := putPrefsRequest(t, srv, `{"theme":"follow"}`)

	require.Equal(t, http.StatusNoContent, rec.Code)
	assert.Equal(t, "follow", srv.loadPrefs(context.Background()).Theme)
}

// TestHandlePutPrefs_ThemePresentAloneSatisfiesAtLeastOneFieldRequired mirrors the other
// fields: a request naming only theme must not be rejected as empty.
func TestHandlePutPrefs_ThemePresentAloneSatisfiesAtLeastOneFieldRequired(t *testing.T) {
	srv := newTestServer(t, ClaudeCodeInfo{})

	rec := putPrefsRequest(t, srv, `{"theme":"dark"}`)

	assert.Equal(t, http.StatusNoContent, rec.Code)
}

// TestHandlePutPrefs_SetsThemeOnlyLeavesOtherFieldsUntouched covers the per-field
// independence REQ-10 requires, mirroring the view/density/usageModel/railSort
// equivalents.
func TestHandlePutPrefs_SetsThemeOnlyLeavesOtherFieldsUntouched(t *testing.T) {
	srv := newTestServer(t, ClaudeCodeInfo{})
	require.Equal(t, http.StatusNoContent, putPrefsRequest(t, srv, `{"view":"tiles","density":"3x2","usageModel":"Opus","railSort":"attention"}`).Code)

	rec := putPrefsRequest(t, srv, `{"theme":"dark"}`)

	require.Equal(t, http.StatusNoContent, rec.Code)
	got := srv.loadPrefs(context.Background())
	assert.Equal(t, "tiles", got.View, "a theme-only PUT must not reset view")
	assert.Equal(t, "3x2", got.Density, "a theme-only PUT must not reset density")
	assert.Equal(t, "Opus", got.UsageModel, "a theme-only PUT must not reset usageModel")
	assert.Equal(t, "attention", got.RailSort, "a theme-only PUT must not reset railSort")
	assert.Equal(t, "dark", got.Theme)
}

// TestLoadPrefs_InvalidThemeInKVFallsBackToFollowIndependently covers D16: a persisted
// theme value that fails validThemePattern (hand-edited, or from a since-removed shape)
// falls back to "follow" without discarding the other fields (m1-sessions per-field
// independence lesson).
func TestLoadPrefs_InvalidThemeInKVFallsBackToFollowIndependently(t *testing.T) {
	srv := newTestServer(t, ClaudeCodeInfo{})
	require.NoError(t, srv.store.KVSet(context.Background(), "prefs", `{"view":"tiles","density":"3x2","usageModel":"Opus","railSort":"attention","theme":"BAD VALUE"}`))

	got := srv.loadPrefs(context.Background())

	assert.Equal(t, "tiles", got.View)
	assert.Equal(t, "3x2", got.Density)
	assert.Equal(t, "Opus", got.UsageModel)
	assert.Equal(t, "attention", got.RailSort)
	assert.Equal(t, "follow", got.Theme, "an invalid persisted theme must fall back to follow")
}

// TestPrefs_ThemePersistsAcrossADaemonRestart mirrors the other fields' restart tests.
func TestPrefs_ThemePersistsAcrossADaemonRestart(t *testing.T) {
	dbPath := filepath.Join(t.TempDir(), "muster.db")
	st1, err := store.Open(context.Background(), dbPath)
	require.NoError(t, err)

	srv1 := New(Config{
		Store: st1, Logger: zerolog.Nop(), UIToken: testUIToken, IngestToken: testIngestToken,
		WebDist: t.TempDir(), DaemonVersion: "test-version",
	})
	rec := putPrefsRequest(t, &testServer{Server: srv1}, `{"theme":"dark"}`)
	require.Equal(t, http.StatusNoContent, rec.Code)
	require.NoError(t, st1.Close())

	st2, err := store.Open(context.Background(), dbPath)
	require.NoError(t, err)
	t.Cleanup(func() { _ = st2.Close() })
	srv2 := New(Config{
		Store: st2, Logger: zerolog.Nop(), UIToken: testUIToken, IngestToken: testIngestToken,
		WebDist: t.TempDir(), DaemonVersion: "test-version",
	})

	assert.Equal(t, "dark", srv2.loadPrefs(context.Background()).Theme)
}

// TestHandlePutPrefs_BroadcastsThemeInPrefsMessage covers D12/INV-4's echo clause for the
// new field: an accepted PUT broadcasts the full prefs object including theme to every
// connected UI socket.
func TestHandlePutPrefs_BroadcastsThemeInPrefsMessage(t *testing.T) {
	srv := newTestServer(t, ClaudeCodeInfo{})
	httpSrv := httptest.NewServer(srv.Handler())
	t.Cleanup(httpSrv.Close)
	wsURL := "ws" + httpSrv.URL[len("http"):] + "/ws"

	c, err := dialWS(t, wsURL, nil)
	require.NoError(t, err)
	defer func() { _ = c.CloseNow() }()
	_ = readJSON[helloWire](t, c)
	_ = readJSON[snapshotWire](t, c)

	rec := putPrefsRequest(t, srv, `{"theme":"dark"}`)
	require.Equal(t, http.StatusNoContent, rec.Code)

	msg := readJSON[prefsWireWithTheme](t, c)
	assert.Equal(t, "prefs", msg.Type)
	assert.Equal(t, "dark", msg.Prefs.Theme)
}

type prefsWireWithTheme struct {
	Type  string `json:"type"`
	Prefs struct {
		Theme string `json:"theme"`
	} `json:"prefs"`
}

// assertNoPrefsMessageArrives reads with a short deadline and requires that either the
// read times out (nothing arrived) or, if something did arrive, it never has type
// "prefs" — used to prove a rejected PUT broadcasts nothing, and that exactly one
// broadcast (not two) follows an accepted one.
func assertNoPrefsMessageArrives(t *testing.T, c *websocket.Conn) {
	t.Helper()
	ctx, cancel := context.WithTimeout(context.Background(), 300*time.Millisecond)
	defer cancel()
	_, data, err := c.Read(ctx)
	if err != nil {
		return // timeout: nothing arrived, as expected
	}
	var msg struct {
		Type string `json:"type"`
	}
	require.NoError(t, json.Unmarshal(data, &msg))
	assert.NotEqual(t, "prefs", msg.Type, "no further prefs broadcast was expected")
}
