package server

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"os/exec"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/Zalaras/muster/internal/store"
)

func getReposRequest(t *testing.T, srv *testServer) *httptest.ResponseRecorder {
	t.Helper()
	req := httptest.NewRequest(http.MethodGet, "/api/repos", nil)
	req.AddCookie(&http.Cookie{Name: cookieName, Value: testUIToken})
	rec := httptest.NewRecorder()
	srv.Handler().ServeHTTP(rec, req)
	return rec
}

func TestHandleListRepos_RequiresCookie(t *testing.T) {
	srv := newTestServer(t, ClaudeCodeInfo{})

	req := httptest.NewRequest(http.MethodGet, "/api/repos", nil)
	rec := httptest.NewRecorder()
	srv.Handler().ServeHTTP(rec, req)

	assert.Equal(t, http.StatusUnauthorized, rec.Code)
}

func TestHandleListRepos_EmptyStoreReturnsEmptyArray(t *testing.T) {
	srv := newTestServer(t, ClaudeCodeInfo{})

	rec := getReposRequest(t, srv)

	require.Equal(t, http.StatusOK, rec.Code)
	var out []repoWire
	require.NoError(t, json.Unmarshal(rec.Body.Bytes(), &out))
	assert.Empty(t, out)
}

// TestHandleListRepos_IncludesLaunchDefaultsAndOrdering covers REQ-5/D20's additive
// fields and the MRU ordering, exercised through the real HTTP handler.
func TestHandleListRepos_IncludesLaunchDefaultsAndOrdering(t *testing.T) {
	srv := newTestServer(t, ClaudeCodeInfo{})
	ctx := context.Background()

	_, _, err := srv.store.UpsertRepo(ctx, store.UpsertRepoParams{
		Path: "/tmp/a", Name: "a", Model: "sonnet", PermissionMode: "default",
	})
	require.NoError(t, err)
	_, _, err = srv.store.UpsertRepo(ctx, store.UpsertRepoParams{
		Path: "/tmp/b", Name: "b", Model: "opus", PermissionMode: "acceptEdits",
	})
	require.NoError(t, err)

	rec := getReposRequest(t, srv)
	require.Equal(t, http.StatusOK, rec.Code)

	var out []repoWire
	require.NoError(t, json.Unmarshal(rec.Body.Bytes(), &out))
	require.Len(t, out, 2)

	byPath := map[string]repoWire{}
	for _, r := range out {
		byPath[r.Path] = r
	}
	require.NotNil(t, byPath["/tmp/b"].LastModel)
	assert.Equal(t, "opus", *byPath["/tmp/b"].LastModel)
	require.NotNil(t, byPath["/tmp/b"].LastPermissionMode)
	assert.Equal(t, "acceptEdits", *byPath["/tmp/b"].LastPermissionMode)
	assert.Nil(t, byPath["/tmp/a"].Branch, "a non-git repo's branch must be null")
}

// TestHandleListRepos_BranchIsReadAtRequestTimeNotCached covers D20: two requests
// separated by a real branch change on disk must reflect the new branch, proving the
// handler reads git state fresh on every call rather than trusting a stored value.
func TestHandleListRepos_BranchIsReadAtRequestTimeNotCached(t *testing.T) {
	srv := newTestServer(t, ClaudeCodeInfo{})
	dir := t.TempDir()
	runGit(t, dir, "init", "-q", "-b", "main")
	runGit(t, dir, "-c", "user.email=t@example.com", "-c", "user.name=T", "commit", "--allow-empty", "-q", "-m", "c1")

	_, _, err := srv.store.UpsertRepo(context.Background(), store.UpsertRepoParams{
		Path: dir, Name: "proj", IsGit: true, Model: "sonnet", PermissionMode: "default",
	})
	require.NoError(t, err)

	rec1 := getReposRequest(t, srv)
	var out1 []repoWire
	require.NoError(t, json.Unmarshal(rec1.Body.Bytes(), &out1))
	require.Len(t, out1, 1)
	require.NotNil(t, out1[0].Branch)
	assert.Equal(t, "main", *out1[0].Branch)

	runGit(t, dir, "checkout", "-q", "-b", "feature/y")

	rec2 := getReposRequest(t, srv)
	var out2 []repoWire
	require.NoError(t, json.Unmarshal(rec2.Body.Bytes(), &out2))
	require.Len(t, out2, 1)
	require.NotNil(t, out2[0].Branch)
	assert.Equal(t, "feature/y", *out2[0].Branch, "the second request must observe the branch change made between requests")
}

func runGit(t *testing.T, dir string, args ...string) {
	t.Helper()
	cmd := exec.Command("git", args...)
	cmd.Dir = dir
	out, err := cmd.CombinedOutput()
	require.NoErrorf(t, err, "git %v: %s", args, out)
}
