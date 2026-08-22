package server

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestTokensEqual(t *testing.T) {
	tests := []struct {
		name string
		a, b string
		want bool
	}{
		{"equal non-empty tokens", "abc123", "abc123", true},
		{"different tokens, same length", "abc123", "xyz789", false},
		{"different length tokens", "short", "much-longer-token", false},
		{"both empty", "", "", true},
		{"one empty", "", "abc123", false},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			assert.Equal(t, tt.want, tokensEqual(tt.a, tt.b))
		})
	}
}

func TestRequireCookie(t *testing.T) {
	const validToken = "the-valid-token"

	next := http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		w.WriteHeader(http.StatusOK)
		_, _ = w.Write([]byte("reached next handler"))
	})

	tests := []struct {
		name           string
		cookie         *http.Cookie
		wantNextCalled bool
	}{
		{
			name:           "valid cookie passes through to next",
			cookie:         &http.Cookie{Name: cookieName, Value: validToken},
			wantNextCalled: true,
		},
		{
			name:           "missing cookie is rejected",
			cookie:         nil,
			wantNextCalled: false,
		},
		{
			name:           "wrong cookie value is rejected",
			cookie:         &http.Cookie{Name: cookieName, Value: "wrong-token"},
			wantNextCalled: false,
		},
		{
			name:           "empty cookie value is rejected",
			cookie:         &http.Cookie{Name: cookieName, Value: ""},
			wantNextCalled: false,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			unauthorizedCalled := false
			onUnauthorized := func(w http.ResponseWriter, _ *http.Request) {
				unauthorizedCalled = true
				w.WriteHeader(http.StatusUnauthorized)
			}

			handler := requireCookie(validToken, onUnauthorized, next)

			req := httptest.NewRequest(http.MethodGet, "/protected", nil)
			if tt.cookie != nil {
				req.AddCookie(tt.cookie)
			}
			rec := httptest.NewRecorder()

			handler.ServeHTTP(rec, req)

			assert.Equal(t, tt.wantNextCalled, !unauthorizedCalled)
			if tt.wantNextCalled {
				assert.Equal(t, http.StatusOK, rec.Code)
				assert.Equal(t, "reached next handler", rec.Body.String())
			} else {
				assert.Equal(t, http.StatusUnauthorized, rec.Code)
			}
		})
	}
}

func TestWriteJSONUnauthorized(t *testing.T) {
	rec := httptest.NewRecorder()
	writeJSONUnauthorized(rec, httptest.NewRequest(http.MethodGet, "/api/state", nil))

	assert.Equal(t, http.StatusUnauthorized, rec.Code)
	assert.Equal(t, "application/json", rec.Header().Get("Content-Type"))

	var resp errorResponse
	require.NoError(t, json.Unmarshal(rec.Body.Bytes(), &resp))
	assert.Equal(t, "unauthorized", resp.Error.Code)
	assert.NotEmpty(t, resp.Error.Message)
}

func TestWriteHTMLUnauthorized(t *testing.T) {
	rec := httptest.NewRecorder()
	writeHTMLUnauthorized(rec, httptest.NewRequest(http.MethodGet, "/", nil))

	assert.Equal(t, http.StatusUnauthorized, rec.Code)
	assert.Contains(t, rec.Header().Get("Content-Type"), "text/html")
	assert.Regexp(t, `(?i)relaunch`, rec.Body.String())
}

func TestHandleHealthz(t *testing.T) {
	srv := newTestServer(t, ClaudeCodeInfo{Pinned: "2.1.233"})

	req := httptest.NewRequest(http.MethodGet, "/healthz", nil)
	rec := httptest.NewRecorder()
	srv.Handler().ServeHTTP(rec, req)

	assert.Equal(t, http.StatusOK, rec.Code)

	var body map[string]string
	require.NoError(t, json.Unmarshal(rec.Body.Bytes(), &body))
	assert.Equal(t, "ok", body["status"])
	assert.Equal(t, "test-version", body["version"])
}

func TestHandleHealthz_NoCookieRequired(t *testing.T) {
	// REQ-1: /healthz responds with no auth at all, unlike every other route.
	srv := newTestServer(t, ClaudeCodeInfo{})

	req := httptest.NewRequest(http.MethodGet, "/healthz", nil)
	rec := httptest.NewRecorder()
	srv.Handler().ServeHTTP(rec, req)

	assert.Equal(t, http.StatusOK, rec.Code)
}

func TestHandleAuth_ValidTokenSetsCookieAndRedirects(t *testing.T) {
	srv := newTestServer(t, ClaudeCodeInfo{})

	req := httptest.NewRequest(http.MethodGet, "/auth?token="+testUIToken, nil)
	rec := httptest.NewRecorder()
	srv.Handler().ServeHTTP(rec, req)

	require.Equal(t, http.StatusSeeOther, rec.Code)
	assert.Equal(t, "/", rec.Header().Get("Location"))

	cookies := rec.Result().Cookies()
	require.Len(t, cookies, 1)
	c := cookies[0]
	assert.Equal(t, cookieName, c.Name)
	assert.Equal(t, testUIToken, c.Value)
	assert.True(t, c.HttpOnly)
	assert.Equal(t, http.SameSiteStrictMode, c.SameSite)
	assert.Equal(t, "/", c.Path)
	assert.Equal(t, 30*24*60*60, c.MaxAge)
}

func TestHandleAuth_BadTokenGetsRelaunchPage(t *testing.T) {
	srv := newTestServer(t, ClaudeCodeInfo{})

	tests := []struct {
		name string
		url  string
	}{
		{"wrong token", "/auth?token=totally-wrong"},
		{"missing token", "/auth"},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			req := httptest.NewRequest(http.MethodGet, tt.url, nil)
			rec := httptest.NewRecorder()
			srv.Handler().ServeHTTP(rec, req)

			assert.Equal(t, http.StatusUnauthorized, rec.Code)
			assert.Regexp(t, `(?i)relaunch`, rec.Body.String())
			assert.Empty(t, rec.Result().Cookies())
		})
	}
}

func TestRoutes_APIStateRequiresCookie(t *testing.T) {
	srv := newTestServer(t, ClaudeCodeInfo{})

	t.Run("without cookie: 401 JSON", func(t *testing.T) {
		req := httptest.NewRequest(http.MethodGet, "/api/state", nil)
		rec := httptest.NewRecorder()
		srv.Handler().ServeHTTP(rec, req)

		assert.Equal(t, http.StatusUnauthorized, rec.Code)
		assert.Equal(t, "application/json", rec.Header().Get("Content-Type"))
	})

	t.Run("with valid cookie: 200 snapshot", func(t *testing.T) {
		req := httptest.NewRequest(http.MethodGet, "/api/state", nil)
		req.AddCookie(&http.Cookie{Name: cookieName, Value: testUIToken})
		rec := httptest.NewRecorder()
		srv.Handler().ServeHTTP(rec, req)

		assert.Equal(t, http.StatusOK, rec.Code)
	})
}

func TestRoutes_StaticRequiresCookie(t *testing.T) {
	// REQ-5 / Edge Case 14: unauthenticated (or stale/garbage-cookie) static requests get
	// the HTML relaunch page, never the SPA — for any path under "/", not just "/".
	srv := newTestServer(t, ClaudeCodeInfo{})

	tests := []struct {
		name   string
		path   string
		cookie *http.Cookie
	}{
		{"root, no cookie", "/", nil},
		{"nonexistent asset path, no cookie", "/assets/app.js", nil},
		{"root, stale/garbage cookie", "/", &http.Cookie{Name: cookieName, Value: "garbage-not-a-real-token"}},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			req := httptest.NewRequest(http.MethodGet, tt.path, nil)
			if tt.cookie != nil {
				req.AddCookie(tt.cookie)
			}
			rec := httptest.NewRecorder()
			srv.Handler().ServeHTTP(rec, req)

			assert.Equal(t, http.StatusUnauthorized, rec.Code)
			assert.Contains(t, rec.Header().Get("Content-Type"), "text/html")
			assert.Regexp(t, `(?i)relaunch`, rec.Body.String())
		})
	}
}
