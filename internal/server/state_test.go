package server

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"testing"
	"time"

	"github.com/rs/zerolog"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/Zalaras/muster/internal/store"
)

func TestBuildSnapshot_M0Shape(t *testing.T) {
	// REQ-6/REQ-16: M0's snapshot is fixed — empty sessions, every usage field null except
	// source, prefs.view/density default to "focus"/"2x2" (density added in m2-terminal,
	// REQ-10). This is the exact object kb:anchor/ws.snapshot / docs/history/protocol-changelog.md pins, shared verbatim by
	// GET /api/state and the WS `snapshot` message.
	got, err := json.Marshal(buildSnapshot())
	require.NoError(t, err)

	assert.JSONEq(t, `{
		"sessions": [],
		"usage": {
			"fiveHour": null, "sevenDay": null, "model": null, "sampledAt": null, "source": "subscription",
			"modelScoped": null, "modelScopedAt": null, "modelScopedError": null, "modelScopedSource": "subscription-api"
		},
		"prefs": {"view": "focus", "density": "2x2", "usageModel": "Fable", "railSort": "manual", "theme": "follow", "updateCheck": true},
		"claudeTheme": {"family": "unknown"},
		"update": {
			"running": "", "install": "", "remedy": null, "available": null, "checkedAt": null, "installed": null,
			"apply": {"phase": "idle", "version": null, "error": null}
		}
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
	assert.Equal(t, "follow", snap.Prefs.Theme)
	assert.Equal(t, "unknown", snap.ClaudeTheme.Family)
}

// TestCurrentSnapshot_FreshDaemonHasFollowThemeAndUnknownFamily covers D15 directly: a
// fresh daemon built with the zero-value (polling-disabled) Config has prefs.theme
// "follow" and claudeTheme.family "unknown" — the same assertion as
// TestHandleState_ReturnsSnapshotJSON's added lines, but against currentSnapshot
// directly rather than only through the HTTP handler.
func TestCurrentSnapshot_FreshDaemonHasFollowThemeAndUnknownFamily(t *testing.T) {
	srv := newTestServer(t, ClaudeCodeInfo{})

	snap := srv.currentSnapshot(context.Background())

	assert.Equal(t, "follow", snap.Prefs.Theme)
	assert.Equal(t, "unknown", snap.ClaudeTheme.Family)
}

// TestCurrentSnapshot_UsesThemePollerCurrentFamilyWhenPollingEnabled covers REQ-15's
// wiring in currentSnapshot: once the theme poller has read a known family, a snapshot
// reflects it rather than the fixed "unknown" default buildSnapshot returns. tick() is
// called directly (not Start()) so the test has no goroutine-timing dependency.
func TestCurrentSnapshot_UsesThemePollerCurrentFamilyWhenPollingEnabled(t *testing.T) {
	configPath := filepath.Join(t.TempDir(), "claude-config.json")
	require.NoError(t, os.WriteFile(configPath, []byte(`{"theme":"light"}`), 0o600))

	dbPath := filepath.Join(t.TempDir(), "muster.db")
	st, err := store.Open(context.Background(), dbPath)
	require.NoError(t, err)
	t.Cleanup(func() { _ = st.Close() })

	srv := New(Config{
		Store: st, Logger: zerolog.Nop(), UIToken: testUIToken, IngestToken: testIngestToken,
		WebDist: t.TempDir(), DaemonVersion: "test-version",
		Theme: ThemeConfig{Poll: time.Hour, ConfigFile: configPath},
	})
	require.NotNil(t, srv.theme.poller)
	srv.theme.poller.tick(context.Background())

	snap := srv.currentSnapshot(context.Background())

	assert.Equal(t, "light", snap.ClaudeTheme.Family)
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
