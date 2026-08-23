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
	assert.JSONEq(t, `{"view":"tiles","density":"3x2"}`, raw)
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
	for i := 0; i < 2; i++ {
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
		View    string `json:"view"`
		Density string `json:"density"`
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
