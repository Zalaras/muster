package server

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"net/http/httptest"
	"os"
	"os/exec"
	"strings"
	"testing"

	"github.com/rs/zerolog"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/Zalaras/muster/internal/gitdiff"
	"github.com/Zalaras/muster/internal/store"
)

type fakeDiffReader struct {
	summary    gitdiff.Summary
	diff       gitdiff.Diff
	err        error
	gotDir     string
	gotScope   gitdiff.Scope
	summaryHit int
}

func (f *fakeDiffReader) Summary(_ context.Context, dir string) (gitdiff.Summary, error) {
	f.gotDir = dir
	f.summaryHit++
	return f.summary, f.err
}

func (f *fakeDiffReader) Read(_ context.Context, dir string, scope gitdiff.Scope) (gitdiff.Diff, error) {
	f.gotDir, f.gotScope = dir, scope
	return f.diff, f.err
}

// diffRig serves the diff routes over a fake reader without the cookie guard, so a test
// reaches the handler directly; auth is covered through the full server.
type diffRig struct {
	srv    *testServer
	reader *fakeDiffReader
	mux    *http.ServeMux
	logs   *syncBuffer
}

func newDiffRig(t *testing.T) *diffRig {
	t.Helper()
	srv := newTestServer(t, ClaudeCodeInfo{})
	logs := &syncBuffer{}
	reader := &fakeDiffReader{}
	mux := http.NewServeMux()
	newDiffFeature(srv.manager, reader, zerolog.New(logs)).mount(mux, func(h http.Handler) http.Handler { return h })
	return &diffRig{srv: srv, reader: reader, mux: mux, logs: logs}
}

func (r *diffRig) do(method, path, body string) *httptest.ResponseRecorder {
	req := httptest.NewRequest(method, path, strings.NewReader(body))
	rec := httptest.NewRecorder()
	r.mux.ServeHTTP(rec, req)
	return rec
}

func (r *diffRig) seed(t *testing.T) int64 {
	t.Helper()
	return seedSessionRow(t, r.srv, nil)
}

const validComment = `{"path":"a.go","start":{"side":"new","line":3},"end":{"side":"new","line":4},"quote":["x","y"],"body":"fix this","resolved":false}`

func TestDiffRoutes_RequireTheCookie(t *testing.T) {
	srv := newTestServer(t, ClaudeCodeInfo{})
	id := seedSessionRow(t, srv, nil)
	routes := []struct{ method, path, body string }{
		{http.MethodGet, "/diff/summary", ""},
		{http.MethodGet, "/diff", ""},
		{http.MethodGet, "/diff/review", ""},
		{http.MethodPut, "/diff/comments/c1", validComment},
		{http.MethodDelete, "/diff/comments/c1", ""},
		{http.MethodPost, "/diff/ticks", `{"add":["k"],"remove":[]}`},
	}
	for _, rt := range routes {
		t.Run(rt.method+" "+rt.path, func(t *testing.T) {
			req := httptest.NewRequest(rt.method, fmt.Sprintf("/api/sessions/%d%s", id, rt.path), strings.NewReader(rt.body))
			rec := httptest.NewRecorder()
			srv.Handler().ServeHTTP(rec, req)
			assert.Equal(t, http.StatusUnauthorized, rec.Code)
		})
	}
	sess, ok := srv.manager.Get(id)
	require.True(t, ok)
	assert.Nil(t, sess.DiffReview, "an unauthenticated write stores nothing")
}

func TestDiffRoutes_UnknownSession(t *testing.T) {
	r := newDiffRig(t)
	routes := []struct{ method, path, body string }{
		{http.MethodGet, "/diff/summary", ""},
		{http.MethodGet, "/diff", ""},
		{http.MethodGet, "/diff/review", ""},
		{http.MethodPut, "/diff/comments/c1", validComment},
		{http.MethodDelete, "/diff/comments/c1", ""},
		{http.MethodPost, "/diff/ticks", `{"add":["k"],"remove":[]}`},
	}
	for _, id := range []string{"999", "abc", "-1"} {
		for _, rt := range routes {
			t.Run(id+" "+rt.method+" "+rt.path, func(t *testing.T) {
				rec := r.do(rt.method, "/api/sessions/"+id+rt.path, rt.body)
				assert.Equal(t, http.StatusNotFound, rec.Code)
				code, msg := errorEnvelope(t, rec)
				assert.Equal(t, "unknown_session", code)
				assert.Equal(t, "unknown session id", msg)
			})
		}
	}
}

func TestHandleDiffSummary(t *testing.T) {
	t.Run("wraps the reader's counts with the open comment count, from the launch directory", func(t *testing.T) {
		r := newDiffRig(t)
		id := r.seed(t)
		sess, _ := r.srv.manager.Get(id)
		r.reader.summary = gitdiff.Summary{Repo: true, Uncommitted: gitdiff.Counts{Files: 3, Additions: 40, Deletions: 12, Fingerprint: "9f2c41d0"}}
		require.Equal(t, http.StatusNoContent, r.do(http.MethodPut, fmt.Sprintf("/api/sessions/%d/diff/comments/open", id), validComment).Code)
		resolved := strings.Replace(validComment, `"resolved":false`, `"resolved":true`, 1)
		require.Equal(t, http.StatusNoContent, r.do(http.MethodPut, fmt.Sprintf("/api/sessions/%d/diff/comments/done", id), resolved).Code)

		rec := r.do(http.MethodGet, fmt.Sprintf("/api/sessions/%d/diff/summary", id), "")

		require.Equal(t, http.StatusOK, rec.Code)
		var got map[string]any
		require.NoError(t, json.Unmarshal(rec.Body.Bytes(), &got))
		assert.Equal(t, true, got["repo"])
		assert.EqualValues(t, 1, got["openComments"])
		assert.Equal(t, map[string]any{"files": 3.0, "additions": 40.0, "deletions": 12.0, "fingerprint": "9f2c41d0"}, got["uncommitted"])
		assert.Contains(t, got, "branch")
		assert.Equal(t, sess.Directory, r.reader.gotDir)
	})

	t.Run("a reader failure is 500 diff_failed with no raw error on the wire, and a log line", func(t *testing.T) {
		r := newDiffRig(t)
		id := r.seed(t)
		r.reader.err = errors.New("git exploded: secret detail")

		rec := r.do(http.MethodGet, fmt.Sprintf("/api/sessions/%d/diff/summary", id), "")

		assert.Equal(t, http.StatusInternalServerError, rec.Code)
		code, msg := errorEnvelope(t, rec)
		assert.Equal(t, "diff_failed", code)
		assert.Equal(t, "could not read the diff", msg)
		assert.NotContains(t, rec.Body.String(), "secret detail")
		assert.Contains(t, r.logs.String(), "secret detail")
	})

	t.Run("a missing directory is 409 directory_missing and git is never asked", func(t *testing.T) {
		r := newDiffRig(t)
		gone := t.TempDir() + "/gone"
		id := seedSessionRow(t, r.srv, func(row *store.SessionRow) { row.Directory = gone })

		rec := r.do(http.MethodGet, fmt.Sprintf("/api/sessions/%d/diff/summary", id), "")

		assert.Equal(t, http.StatusConflict, rec.Code)
		code, msg := errorEnvelope(t, rec)
		assert.Equal(t, "directory_missing", code)
		assert.Equal(t, gone+" no longer exists", msg)
		assert.Zero(t, r.reader.summaryHit)
	})

	t.Run("a directory that is a file counts as missing", func(t *testing.T) {
		r := newDiffRig(t)
		file := t.TempDir() + "/f"
		require.NoError(t, os.WriteFile(file, nil, 0o644))
		id := seedSessionRow(t, r.srv, func(row *store.SessionRow) { row.Directory = file })

		rec := r.do(http.MethodGet, fmt.Sprintf("/api/sessions/%d/diff/summary", id), "")

		assert.Equal(t, http.StatusConflict, rec.Code)
	})
}

func TestHandleDiffRead(t *testing.T) {
	scopes := []struct {
		name, query string
		want        gitdiff.Scope
	}{
		{"absent scope is uncommitted", "", gitdiff.ScopeUncommitted},
		{"empty scope is uncommitted", "?scope=", gitdiff.ScopeUncommitted},
		{"uncommitted", "?scope=uncommitted", gitdiff.ScopeUncommitted},
		{"branch", "?scope=branch", gitdiff.ScopeBranch},
	}
	for _, tt := range scopes {
		t.Run(tt.name, func(t *testing.T) {
			r := newDiffRig(t)
			id := r.seed(t)
			r.reader.diff = gitdiff.Diff{Scope: tt.want, Base: "HEAD (abc)", Fingerprint: "f", Files: []gitdiff.File{}}

			rec := r.do(http.MethodGet, fmt.Sprintf("/api/sessions/%d/diff%s", id, tt.query), "")

			require.Equal(t, http.StatusOK, rec.Code)
			assert.Equal(t, tt.want, r.reader.gotScope)
			var got gitdiff.Diff
			require.NoError(t, json.Unmarshal(rec.Body.Bytes(), &got))
			assert.Equal(t, r.reader.diff, got)
			assert.Contains(t, rec.Body.String(), `"files":[]`)
		})
	}

	t.Run("a bad scope is 400 before the session is looked up", func(t *testing.T) {
		r := newDiffRig(t)
		id := r.seed(t)

		rec := r.do(http.MethodGet, fmt.Sprintf("/api/sessions/%d/diff?scope=staged", id), "")

		assert.Equal(t, http.StatusBadRequest, rec.Code)
		code, msg := errorEnvelope(t, rec)
		assert.Equal(t, "invalid_request", code)
		assert.Equal(t, "scope must be uncommitted or branch", msg)
	})

	t.Run("not a repository is 409 not_a_repo", func(t *testing.T) {
		r := newDiffRig(t)
		id := r.seed(t)
		r.reader.err = fmt.Errorf("wrapped: %w", gitdiff.ErrNotRepo)

		rec := r.do(http.MethodGet, fmt.Sprintf("/api/sessions/%d/diff", id), "")

		assert.Equal(t, http.StatusConflict, rec.Code)
		code, msg := errorEnvelope(t, rec)
		assert.Equal(t, "not_a_repo", code)
		assert.Equal(t, "not a git repository", msg)
	})

	t.Run("another failure is 500 diff_failed", func(t *testing.T) {
		r := newDiffRig(t)
		id := r.seed(t)
		r.reader.err = errors.New("timeout")

		rec := r.do(http.MethodGet, fmt.Sprintf("/api/sessions/%d/diff", id), "")

		assert.Equal(t, http.StatusInternalServerError, rec.Code)
		code, _ := errorEnvelope(t, rec)
		assert.Equal(t, "diff_failed", code)
	})

	t.Run("a missing directory is 409 directory_missing", func(t *testing.T) {
		r := newDiffRig(t)
		id := seedSessionRow(t, r.srv, func(row *store.SessionRow) { row.Directory = t.TempDir() + "/gone" })

		rec := r.do(http.MethodGet, fmt.Sprintf("/api/sessions/%d/diff", id), "")

		assert.Equal(t, http.StatusConflict, rec.Code)
		code, _ := errorEnvelope(t, rec)
		assert.Equal(t, "directory_missing", code)
	})
}

// TestDiffRoutes_RealReaderThroughTheFullServer proves the wiring: a session whose directory is
// a real checkout reads its diff, summary and fingerprint agree, an ended session reads the same,
// and a plain directory answers repo false on the summary and 409 on the diff.
func TestDiffRoutes_RealReaderThroughTheFullServer(t *testing.T) {
	srv := newTestServer(t, ClaudeCodeInfo{})
	repo := t.TempDir()
	for _, args := range [][]string{{"init", "-q", "-b", "main"}, {"-c", "user.email=t@e.c", "-c", "user.name=T", "commit", "-q", "--allow-empty", "-m", "base"}} {
		cmd := exec.Command("git", args...)
		cmd.Dir = repo
		out, err := cmd.CombinedOutput()
		require.NoError(t, err, string(out))
	}
	require.NoError(t, os.WriteFile(repo+"/new.txt", []byte("a\nb\n"), 0o644))
	inRepo := seedSessionRow(t, srv, func(row *store.SessionRow) { row.Directory = repo })
	plain := seedSessionRow(t, srv, nil)
	get := func(id int64, path string) *httptest.ResponseRecorder {
		req := httptest.NewRequest(http.MethodGet, fmt.Sprintf("/api/sessions/%d/%s", id, path), nil)
		req.AddCookie(&http.Cookie{Name: cookieBaseName, Value: testUIToken})
		rec := httptest.NewRecorder()
		srv.Handler().ServeHTTP(rec, req)
		return rec
	}

	var summary struct {
		Repo        bool `json:"repo"`
		Uncommitted struct {
			Files, Additions int
			Fingerprint      string
		} `json:"uncommitted"`
	}
	rec := get(inRepo, "diff/summary")
	require.Equal(t, http.StatusOK, rec.Code, rec.Body.String())
	require.NoError(t, json.Unmarshal(rec.Body.Bytes(), &summary))
	var diff gitdiff.Diff
	rec = get(inRepo, "diff?scope=uncommitted")
	require.Equal(t, http.StatusOK, rec.Code, rec.Body.String())
	require.NoError(t, json.Unmarshal(rec.Body.Bytes(), &diff))

	assert.True(t, summary.Repo)
	assert.Equal(t, 1, summary.Uncommitted.Files)
	assert.Equal(t, 2, summary.Uncommitted.Additions)
	assert.Equal(t, diff.Fingerprint, summary.Uncommitted.Fingerprint, "the summary's fingerprint equals the diff's")
	require.Len(t, diff.Files, 1)
	assert.Equal(t, "new.txt", diff.Files[0].Path)

	rec = get(plain, "diff/summary")
	require.Equal(t, http.StatusOK, rec.Code)
	assert.JSONEq(t, `{"repo":false,"uncommitted":{"files":0,"additions":0,"deletions":0,"fingerprint":""},"branch":{"files":0,"additions":0,"deletions":0,"fingerprint":""},"openComments":0}`, rec.Body.String())
	rec = get(plain, "diff")
	assert.Equal(t, http.StatusConflict, rec.Code)
	code, _ := errorEnvelope(t, rec)
	assert.Equal(t, "not_a_repo", code)
}
