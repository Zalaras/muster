package server

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func getBrowseRequest(t *testing.T, srv *testServer, query string) *httptest.ResponseRecorder {
	t.Helper()
	req := httptest.NewRequest(http.MethodGet, "/api/browse"+query, nil)
	req.AddCookie(&http.Cookie{Name: cookieName, Value: testUIToken})
	rec := httptest.NewRecorder()
	srv.Handler().ServeHTTP(rec, req)
	return rec
}

func TestHandleBrowse_RequiresCookie(t *testing.T) {
	srv := newTestServer(t, ClaudeCodeInfo{})

	req := httptest.NewRequest(http.MethodGet, "/api/browse", nil)
	rec := httptest.NewRecorder()
	srv.Handler().ServeHTTP(rec, req)

	assert.Equal(t, http.StatusUnauthorized, rec.Code)
}

// TestHandleBrowse_ListsSubdirectoriesSortedByNameExcludingDotfilesAndFiles covers
// REQ-6/D19's response contract.
func TestHandleBrowse_ListsSubdirectoriesSortedByNameExcludingDotfilesAndFiles(t *testing.T) {
	srv := newTestServer(t, ClaudeCodeInfo{})
	dir := t.TempDir()
	require.NoError(t, os.Mkdir(filepath.Join(dir, "zeta"), 0o755))
	require.NoError(t, os.Mkdir(filepath.Join(dir, "alpha"), 0o755))
	require.NoError(t, os.Mkdir(filepath.Join(dir, ".hidden"), 0o755))
	require.NoError(t, os.WriteFile(filepath.Join(dir, "a-file.txt"), []byte("x"), 0o644))

	rec := getBrowseRequest(t, srv, "?path="+dir)
	require.Equal(t, http.StatusOK, rec.Code)

	var out browseResponse
	require.NoError(t, json.Unmarshal(rec.Body.Bytes(), &out))

	names := make([]string, len(out.Dirs))
	for i, d := range out.Dirs {
		names[i] = d.Name
	}
	assert.Equal(t, []string{"alpha", "zeta"}, names, "dotfiles/files excluded; sorted by name")
	assert.Equal(t, filepath.Clean(dir), out.Path)
	require.NotNil(t, out.Parent)
	assert.Equal(t, filepath.Dir(dir), *out.Parent)
}

func TestHandleBrowse_MarksGitCheckoutsAmongSubdirectories(t *testing.T) {
	srv := newTestServer(t, ClaudeCodeInfo{})
	dir := t.TempDir()
	gitDir := filepath.Join(dir, "gitrepo")
	require.NoError(t, os.Mkdir(gitDir, 0o755))
	runGit(t, gitDir, "init", "-q")
	plainDir := filepath.Join(dir, "plaindir")
	require.NoError(t, os.Mkdir(plainDir, 0o755))

	rec := getBrowseRequest(t, srv, "?path="+dir)
	require.Equal(t, http.StatusOK, rec.Code)

	var out browseResponse
	require.NoError(t, json.Unmarshal(rec.Body.Bytes(), &out))

	byName := map[string]browseDirWire{}
	for _, d := range out.Dirs {
		byName[d.Name] = d
	}
	assert.True(t, byName["gitrepo"].IsGit)
	assert.False(t, byName["plaindir"].IsGit)
}

func TestHandleBrowse_NoPathDefaultsToHomeDirectory(t *testing.T) {
	srv := newTestServer(t, ClaudeCodeInfo{})

	rec := getBrowseRequest(t, srv, "")
	require.Equal(t, http.StatusOK, rec.Code)

	home, err := os.UserHomeDir()
	require.NoError(t, err)

	var out browseResponse
	require.NoError(t, json.Unmarshal(rec.Body.Bytes(), &out))
	assert.Equal(t, filepath.Clean(home), out.Path)
}

func TestHandleBrowse_RelativePathIs400(t *testing.T) {
	srv := newTestServer(t, ClaudeCodeInfo{})

	rec := getBrowseRequest(t, srv, "?path=relative/dir")

	assert.Equal(t, http.StatusBadRequest, rec.Code)
	var envelope struct {
		Error struct {
			Code string `json:"code"`
		} `json:"error"`
	}
	require.NoError(t, json.Unmarshal(rec.Body.Bytes(), &envelope))
	assert.Equal(t, "invalid_request", envelope.Error.Code)
}

func TestHandleBrowse_NonExistentPathIs404(t *testing.T) {
	srv := newTestServer(t, ClaudeCodeInfo{})

	rec := getBrowseRequest(t, srv, "?path=/this/path/does/not/exist/anywhere")

	assert.Equal(t, http.StatusNotFound, rec.Code)
	var envelope struct {
		Error struct {
			Code string `json:"code"`
		} `json:"error"`
	}
	require.NoError(t, json.Unmarshal(rec.Body.Bytes(), &envelope))
	assert.Equal(t, "not_found", envelope.Error.Code)
}

func TestHandleBrowse_APathThatIsAFileIs404(t *testing.T) {
	srv := newTestServer(t, ClaudeCodeInfo{})
	dir := t.TempDir()
	file := filepath.Join(dir, "not-a-dir.txt")
	require.NoError(t, os.WriteFile(file, []byte("x"), 0o644))

	rec := getBrowseRequest(t, srv, "?path="+file)

	assert.Equal(t, http.StatusNotFound, rec.Code)
}

func TestHandleBrowse_RootHasNilParent(t *testing.T) {
	srv := newTestServer(t, ClaudeCodeInfo{})

	rec := getBrowseRequest(t, srv, "?path=/")
	require.Equal(t, http.StatusOK, rec.Code)

	var out browseResponse
	require.NoError(t, json.Unmarshal(rec.Body.Bytes(), &out))
	assert.Nil(t, out.Parent)
}
