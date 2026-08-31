package server

import (
	"context"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"testing"

	"github.com/rs/zerolog"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/Zalaras/muster/internal/store"
)

// newStaticTestServer builds a bare Server with a configurable WebDist, independent of
// newTestServer's fixed t.TempDir() (plan embed-dashboard REQ-2's serving precedence is
// exactly the WebDist value, so the tests below need to control it directly, including
// setting it to "" to reach the embedded branch).
func newStaticTestServer(t *testing.T, webDist string) *Server {
	t.Helper()
	dbPath := filepath.Join(t.TempDir(), "muster.db")
	st, err := store.Open(context.Background(), dbPath)
	require.NoError(t, err)
	t.Cleanup(func() { _ = st.Close() })

	return New(Config{
		Store:       st,
		Logger:      zerolog.Nop(),
		UIToken:     testUIToken,
		IngestToken: testIngestToken,
		WebDist:     webDist,
	})
}

func withAuthCookie(req *http.Request) *http.Request {
	req.AddCookie(&http.Cookie{Name: cookieName, Value: testUIToken})
	return req
}

// TestStaticServing_DiskOverride covers REQ-2's disk branch: WebDist non-empty serves
// exactly that directory's content, and nothing else — a request for a path that exists
// only in the embedded tree (.gitkeep, always present per REQ-4) 404s rather than
// silently falling back to the embedded copy.
func TestStaticServing_DiskOverride(t *testing.T) {
	dir := t.TempDir()
	require.NoError(t, os.WriteFile(filepath.Join(dir, "index.html"), []byte("disk dashboard"), 0o644))
	srv := newStaticTestServer(t, dir)

	t.Run("serves the file present on disk", func(t *testing.T) {
		rec := httptest.NewRecorder()
		// "/" not "/index.html": http.FileServer special-cases a request literally ending
		// in "/index.html" and 301-redirects it to "/" instead of serving it directly.
		srv.Handler().ServeHTTP(rec, withAuthCookie(httptest.NewRequest(http.MethodGet, "/", nil)))

		require.Equal(t, http.StatusOK, rec.Code)
		assert.Equal(t, "disk dashboard", rec.Body.String())
	})

	t.Run("does not fall back to the embedded tree for a path absent on disk", func(t *testing.T) {
		rec := httptest.NewRecorder()
		srv.Handler().ServeHTTP(rec, withAuthCookie(httptest.NewRequest(http.MethodGet, "/.gitkeep", nil)))

		assert.Equal(t, http.StatusNotFound, rec.Code, "the disk override must not silently serve embedded-only content")
	})

	t.Run("still gates on the auth cookie", func(t *testing.T) {
		rec := httptest.NewRecorder()
		srv.Handler().ServeHTTP(rec, httptest.NewRequest(http.MethodGet, "/index.html", nil))

		assert.Equal(t, http.StatusUnauthorized, rec.Code)
	})
}

// TestStaticServing_Embedded covers REQ-2's embedded branch (WebDist empty) and R5's
// auth-gating parity. It deliberately asserts against .gitkeep rather than index.html:
// .gitkeep is always present in the real go:embed-ed tree regardless of whether a web
// build has run in this checkout (REQ-4's whole point), while index.html's presence
// varies with build state and would make this test flaky across machines/CI — see
// cmd/musterd/webdist_test.go's note on the same non-determinism.
func TestStaticServing_Embedded(t *testing.T) {
	srv := newStaticTestServer(t, "")

	t.Run("serves an always-embedded file with no disk override configured", func(t *testing.T) {
		rec := httptest.NewRecorder()
		srv.Handler().ServeHTTP(rec, withAuthCookie(httptest.NewRequest(http.MethodGet, "/.gitkeep", nil)))

		assert.Equal(t, http.StatusOK, rec.Code, ".gitkeep is committed and go:embed all:assets always includes dotfiles")
	})

	t.Run("gates the embedded static handler on the auth cookie same as the disk branch", func(t *testing.T) {
		rec := httptest.NewRecorder()
		srv.Handler().ServeHTTP(rec, httptest.NewRequest(http.MethodGet, "/.gitkeep", nil))

		assert.Equal(t, http.StatusUnauthorized, rec.Code, "requireCookie must wrap the embedded branch identically to the disk branch (R5)")
		assert.Contains(t, rec.Header().Get("Content-Type"), "text/html", "unauthorized static requests get the HTML relaunch page, not the JSON error shape")
	})

	t.Run("wrong cookie value is rejected on the embedded branch too", func(t *testing.T) {
		rec := httptest.NewRecorder()
		req := httptest.NewRequest(http.MethodGet, "/.gitkeep", nil)
		req.AddCookie(&http.Cookie{Name: cookieName, Value: "wrong-token"})
		srv.Handler().ServeHTTP(rec, req)

		assert.Equal(t, http.StatusUnauthorized, rec.Code)
	})
}
