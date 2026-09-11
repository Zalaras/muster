package server

import (
	"context"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"sync/atomic"
	"testing"
	"time"

	"github.com/rs/zerolog"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/Zalaras/muster/internal/claudecode/claudecodetest"
	"github.com/Zalaras/muster/internal/store"
)

// newUsageRefreshTestServer builds a full Server with polling enabled against a fake
// usage endpoint and a scratch token file (REQ-13's test seams) — handleUsageRefresh's
// happy path needs a real, non-nil usagePoller, unlike newTestServer's default (which
// deliberately leaves UsagePoll at zero so no test-server ever touches the network by
// construction).
func newUsageRefreshTestServer(t *testing.T, fakeUsageAPI *httptest.Server) *Server {
	t.Helper()
	dbPath := filepath.Join(t.TempDir(), "muster.db")
	st, err := store.Open(context.Background(), dbPath)
	require.NoError(t, err)
	t.Cleanup(func() { _ = st.Close() })

	tokenFile := filepath.Join(t.TempDir(), "token.json")
	require.NoError(t, os.WriteFile(tokenFile, []byte(claudecodetest.OAuthCredentialsBody("test-token")), 0o600))

	srv := New(Config{
		Store: st, Logger: zerolog.Nop(), UIToken: testUIToken, IngestToken: testIngestToken,
		WebDist: t.TempDir(), DaemonVersion: "test-version",
		Usage:      UsageConfig{Poll: time.Hour, APIURL: fakeUsageAPI.URL, TokenFile: tokenFile},
		HTTPClient: fakeUsageAPI.Client(),
	})
	srv.Start()
	t.Cleanup(func() { srv.Shutdown(context.Background()) })
	return srv
}

func usageRefreshRequest(t *testing.T, srv *Server, withCookie bool) *httptest.ResponseRecorder {
	t.Helper()
	req := httptest.NewRequest(http.MethodPost, "/api/usage/refresh", nil)
	if withCookie {
		req.AddCookie(&http.Cookie{Name: cookieName, Value: testUIToken})
	}
	rec := httptest.NewRecorder()
	srv.Handler().ServeHTTP(rec, req)
	return rec
}

// TestHandleUsageRefresh_DisabledPollingReturns404 covers Edge Case 14/REQ-7's error
// clause: -usage-poll 0 means the poller was never constructed, so refresh 404s.
func TestHandleUsageRefresh_DisabledPollingReturns404(t *testing.T) {
	srv := newTestServer(t, ClaudeCodeInfo{}) // UsagePoll left at zero: no poller

	rec := usageRefreshRequest(t, srv.Server, true)

	assert.Equal(t, http.StatusNotFound, rec.Code)
	assert.Equal(t, "not_found", decodeErrorCode(t, rec))
}

func TestHandleUsageRefresh_RequiresCookie(t *testing.T) {
	srv := newTestServer(t, ClaudeCodeInfo{})

	rec := usageRefreshRequest(t, srv.Server, false)

	assert.Equal(t, http.StatusUnauthorized, rec.Code)
}

// TestHandleUsageRefresh_EnabledPollingReturns202AndTriggersAFetch covers REQ-7's happy
// path end to end through the real HTTP handler.
func TestHandleUsageRefresh_EnabledPollingReturns202AndTriggersAFetch(t *testing.T) {
	var requests int32
	fakeAPI := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		atomic.AddInt32(&requests, 1)
		w.WriteHeader(http.StatusOK)
		_, _ = w.Write([]byte(claudecodetest.UsageAPIBody(claudecodetest.UsageWindowOpt{DisplayName: "Fable", Percent: 61, ResetsAt: "2026-09-01T13:59:59Z"})))
	}))
	defer fakeAPI.Close()

	srv := newUsageRefreshTestServer(t, fakeAPI)
	require.Eventually(t, func() bool { return atomic.LoadInt32(&requests) >= 1 }, time.Second, 5*time.Millisecond, "Start's immediate fetch")

	rec := usageRefreshRequest(t, srv, true)

	assert.Equal(t, http.StatusAccepted, rec.Code)
	assert.Empty(t, rec.Body.Bytes(), "202 must carry no body")
	require.Eventually(t, func() bool { return atomic.LoadInt32(&requests) >= 2 }, time.Second, 5*time.Millisecond, "the refresh must trigger a second fetch")
}

// TestHandleUsageRefresh_TwoRapidPostsBothReturn202 covers Edge Case 7 at the HTTP
// layer: a second refresh click while one is already coalesced must still succeed with
// 202, never an error, even though the daemon serves it as a single coalesced fetch.
func TestHandleUsageRefresh_TwoRapidPostsBothReturn202(t *testing.T) {
	release := make(chan struct{})
	var requests int32
	fakeAPI := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		if atomic.AddInt32(&requests, 1) == 1 {
			<-release
		}
		w.WriteHeader(http.StatusOK)
		_, _ = w.Write([]byte(`{"limits": []}`))
	}))
	defer fakeAPI.Close()

	srv := newUsageRefreshTestServer(t, fakeAPI)
	require.Eventually(t, func() bool { return atomic.LoadInt32(&requests) >= 1 }, time.Second, 5*time.Millisecond)

	rec1 := usageRefreshRequest(t, srv, true)
	rec2 := usageRefreshRequest(t, srv, true)

	assert.Equal(t, http.StatusAccepted, rec1.Code)
	assert.Equal(t, http.StatusAccepted, rec2.Code)

	close(release)
}
