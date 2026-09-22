package server

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/Zalaras/muster/internal/selfupdate"
)

// ---------------------------------------------------------------------------------------
// POST /api/update/check (kb:anchor/update.check, D1-D13) — checkAvailability's manual
// path. The periodic-tick (manual=false) half of this same method is exercised by the
// checkAvailability tests above (D11 by TestUpdateManager_DisabledCheckingMakesNoRequests,
// D13 by TestUpdateManager_FailedCheckKeepsPreviousResultAndBroadcastsNothing); this file
// covers the manual=true path and handleCheckUpdate's own error mapping.

func postCheckUpdate(t *testing.T, srv *testServer) *httptest.ResponseRecorder {
	t.Helper()
	req := httptest.NewRequest(http.MethodPost, "/api/update/check", strings.NewReader(""))
	req.AddCookie(&http.Cookie{Name: cookieName, Value: testUIToken})
	rec := httptest.NewRecorder()
	srv.Handler().ServeHTTP(rec, req)
	return rec
}

// TestHandleCheckUpdate_Success covers D1 (200 with the update object), D2 (checkedAt
// set to the time of this check), D9 (exactly one broadcast) and the wire presence of
// canCheck.
func TestHandleCheckUpdate_Success(t *testing.T) {
	origin := newFakeOrigin(t)
	origin.setLatest("v0.11.0")
	srv := newUpdateTestServer(t, func(c *Config) {
		c.Update.BaseURL = origin.URL()
		c.Update.Install = selfupdate.Install{Kind: selfupdate.KindInstaller}
	})

	httpSrv := httptest.NewServer(srv.Handler())
	t.Cleanup(httpSrv.Close)
	wsURL := "ws" + httpSrv.URL[len("http"):] + "/ws"
	c, err := dialWS(t, wsURL, nil)
	require.NoError(t, err)
	defer func() { _ = c.CloseNow() }()
	_ = readJSON[helloWire](t, c)
	_ = readJSON[snapshotWire](t, c)

	// checkAvailability formats checkedAt with RFC3339 (whole seconds only), so compare
	// against a similarly truncated "before" rather than a sub-second one.
	before := time.Now().UTC().Truncate(time.Second)
	rec := postCheckUpdate(t, srv)
	require.Equal(t, http.StatusOK, rec.Code)

	var got UpdateInfo
	require.NoError(t, json.Unmarshal(rec.Body.Bytes(), &got))
	require.NotNil(t, got.Available, "D1: sanity — v0.11.0 must have been found available")
	assert.Equal(t, "0.11.0", *got.Available)
	assert.True(t, got.CanCheck, "canCheck must be present and true on a non-dev install with checking enabled")

	require.NotNil(t, got.CheckedAt, "D2: checkedAt must be set on a successful manual check")
	checkedAt, err := time.Parse(time.RFC3339, *got.CheckedAt)
	require.NoError(t, err)
	assert.False(t, checkedAt.Before(before), "D2: checkedAt must be the time of this check, not an earlier one")

	msg := readJSON[updateWireForTest](t, c)
	assert.Equal(t, "update", msg.Type, "D9: the successful check must broadcast an update message")

	extraCtx, cancel := context.WithTimeout(context.Background(), 200*time.Millisecond)
	defer cancel()
	_, _, err = c.Read(extraCtx)
	assert.Error(t, err, "D9: exactly one broadcast — a second must not arrive")
}

// TestHandleCheckUpdate_Errors covers D3-D8's error table.
func TestHandleCheckUpdate_Errors(t *testing.T) {
	t.Run("release host unreachable is 502 check_failed", func(t *testing.T) {
		origin := newFakeOrigin(t)
		origin.setLatest("v0.11.0")
		origin.setFailNext(true)
		srv := newUpdateTestServer(t, func(c *Config) {
			c.Update.BaseURL = origin.URL()
			c.Update.Install = selfupdate.Install{Kind: selfupdate.KindInstaller}
		})

		rec := postCheckUpdate(t, srv)
		assert.Equal(t, http.StatusBadGateway, rec.Code)
		assert.Equal(t, "check_failed", decodeErrorCode(t, rec))
	})

	t.Run("latest tag is not a release version is 502 check_failed", func(t *testing.T) {
		origin := newFakeOrigin(t)
		origin.setLatest("nightly") // fails selfupdate.ParseRelease
		srv := newUpdateTestServer(t, func(c *Config) {
			c.Update.BaseURL = origin.URL()
			c.Update.Install = selfupdate.Install{Kind: selfupdate.KindInstaller}
		})

		rec := postCheckUpdate(t, srv)
		assert.Equal(t, http.StatusBadGateway, rec.Code)
		assert.Equal(t, "check_failed", decodeErrorCode(t, rec))
	})

	t.Run("empty update base URL is 404 not_found", func(t *testing.T) {
		srv := newUpdateTestServer(t, nil) // BaseURL left empty
		rec := postCheckUpdate(t, srv)
		assert.Equal(t, http.StatusNotFound, rec.Code)
		assert.Equal(t, "not_found", decodeErrorCode(t, rec))
	})

	t.Run("dev install is 404 not_found", func(t *testing.T) {
		srv := newUpdateTestServer(t, func(c *Config) {
			c.Update.BaseURL = "http://example.invalid"
			c.Update.Install = selfupdate.Install{Kind: selfupdate.KindDev}
			c.DaemonVersion = "dev"
		})
		rec := postCheckUpdate(t, srv)
		assert.Equal(t, http.StatusNotFound, rec.Code)
		assert.Equal(t, "not_found", decodeErrorCode(t, rec))
	})

	t.Run("shutting down is 409 shutting_down", func(t *testing.T) {
		srv := newUpdateTestServer(t, func(c *Config) {
			c.Update.BaseURL = "http://example.invalid"
			c.Update.Install = selfupdate.Install{Kind: selfupdate.KindInstaller}
		})
		srv.update.um.Stop(context.Background())

		rec := postCheckUpdate(t, srv)
		assert.Equal(t, http.StatusConflict, rec.Code)
		assert.Equal(t, "shutting_down", decodeErrorCode(t, rec))
	})

	t.Run("requires cookie", func(t *testing.T) {
		srv := newUpdateTestServer(t, func(c *Config) { c.Update.BaseURL = "http://example.invalid" })
		req := httptest.NewRequest(http.MethodPost, "/api/update/check", strings.NewReader(""))
		rec := httptest.NewRecorder()
		srv.Handler().ServeHTTP(rec, req)
		assert.Equal(t, http.StatusUnauthorized, rec.Code)
	})
}

// TestHandleCheckUpdate_ManualCheckSurvivesTheAutomaticDiscardGuard covers D10 and Edge
// Cases 8/9: unlike a periodic tick, a manual check's result is kept even though
// prefs.updateCheck is off, both when the pref is already off before the request starts
// and when it is switched off while the request is in flight.
func TestHandleCheckUpdate_ManualCheckSurvivesTheAutomaticDiscardGuard(t *testing.T) {
	t.Run("pref already off", func(t *testing.T) {
		origin := newFakeOrigin(t)
		origin.setLatest("v0.11.0")
		srv := newUpdateTestServer(t, func(c *Config) {
			c.Update.BaseURL = origin.URL()
			c.Update.Install = selfupdate.Install{Kind: selfupdate.KindInstaller}
		})
		srv.update.um.SetCheckEnabled(false)
		require.True(t, srv.update.um.Current().CanCheck, "sanity: canCheck stays true regardless of the pref")

		rec := postCheckUpdate(t, srv)
		require.Equal(t, http.StatusOK, rec.Code)

		got := srv.update.um.Current()
		require.NotNil(t, got.Available, "D10: a manual check's result must be kept while updateCheck is off")
		assert.Equal(t, "0.11.0", *got.Available)
		require.NotNil(t, got.CheckedAt)
	})

	t.Run("pref switched off mid-flight", func(t *testing.T) {
		origin := newFakeOrigin(t)
		origin.setLatest("v0.11.0")
		origin.hold()
		m, changes := newTestUpdateManager(t, func(c *updateManagerConfig) { c.Base = origin.URL() })

		done := make(chan error, 1)
		go func() {
			done <- m.checkAvailability(context.Background(), true)
		}()
		time.Sleep(50 * time.Millisecond) // let the goroutine reach the held HTTP call

		m.SetCheckEnabled(false)
		disableBroadcast := <-changes
		assert.Nil(t, disableBroadcast.Available, "sanity: SetCheckEnabled(false) clears the automatic-path state first")

		origin.release()
		require.NoError(t, <-done, "Edge Case 9: the manual check itself must still succeed")

		got := <-changes
		require.NotNil(t, got.Available, "Edge Case 9: a manual check racing the pref being turned off must keep its result")
		assert.Equal(t, "0.11.0", *got.Available)
		assert.NotNil(t, m.Current().Available, "the committed state must reflect the manual result, not the discard")
	})
}

// TestUpdateManager_CanCheck covers D12: canCheck is true iff the base URL is non-empty
// (a manager only exists when it is) and the install kind is not dev.
func TestUpdateManager_CanCheck(t *testing.T) {
	for _, kind := range []selfupdate.Kind{selfupdate.KindInstaller, selfupdate.KindHomebrew, selfupdate.KindUnmanaged} {
		t.Run(string(kind)+" is checkable", func(t *testing.T) {
			m, _ := newTestUpdateManager(t, func(c *updateManagerConfig) { c.Install = selfupdate.Install{Kind: kind} })
			assert.True(t, m.Current().CanCheck)
		})
	}

	t.Run("dev is not checkable", func(t *testing.T) {
		m, _ := newTestUpdateManager(t, func(c *updateManagerConfig) { c.Install = selfupdate.Install{Kind: selfupdate.KindDev} })
		assert.False(t, m.Current().CanCheck)
	})

	t.Run("empty base URL (no manager at all) is not checkable", func(t *testing.T) {
		srv := newUpdateTestServer(t, nil) // BaseURL left empty
		require.Nil(t, srv.update.um, "sanity: an empty base URL must construct no updateManager")
		assert.False(t, srv.update.current().CanCheck)
	})
}
