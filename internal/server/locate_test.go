package server

import (
	"bytes"
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"io"
	"mime/multipart"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strconv"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/Zalaras/muster/internal/locate"
	"github.com/Zalaras/muster/internal/session"
	"github.com/Zalaras/muster/internal/store"
)

// newLocateTestSession creates a session rooted at dir, without ever touching tmux —
// handleLocateFile only reads sess.Directory via s.manager.Get(id), so CreateSession
// alone (which registers the session in memory, see session.Manager.CreateSession) is
// enough; RecordLaunch/a real tmux pane is irrelevant to this endpoint.
func newLocateTestSession(t *testing.T, srv *testServer, dir string) int64 {
	t.Helper()
	repo, _, err := srv.store.UpsertRepo(context.Background(), store.UpsertRepoParams{
		Path: dir, Name: filepath.Base(dir), Model: "sonnet", PermissionMode: "default",
	})
	require.NoError(t, err)
	sess, err := srv.manager.CreateSession(context.Background(), session.CreateParams{
		RepoID: repo.ID, Directory: dir, PermissionMode: session.PermissionDefault,
		Model: "sonnet", FirstLaunchHere: true,
	})
	require.NoError(t, err)
	return sess.ID
}

// buildLocateRequest builds a POST /api/sessions/{id}/locate multipart request with a
// single "file" part named filename carrying content. authed controls whether the
// muster_auth cookie is attached.
func buildLocateRequest(t *testing.T, id int64, filename string, content []byte, authed bool) *http.Request {
	t.Helper()
	var body bytes.Buffer
	mw := multipart.NewWriter(&body)
	part, err := mw.CreateFormFile("file", filename)
	require.NoError(t, err)
	_, err = part.Write(content)
	require.NoError(t, err)
	require.NoError(t, mw.Close())

	req := httptest.NewRequest(http.MethodPost, fmt.Sprintf("/api/sessions/%d/locate", id), &body)
	req.Header.Set("Content-Type", mw.FormDataContentType())
	if authed {
		req.AddCookie(&http.Cookie{Name: cookieName, Value: testUIToken})
	}
	return req
}

// buildLocateRequestNoFilePart builds a multipart request that has some other field but
// never one named "file".
func buildLocateRequestNoFilePart(t *testing.T, id int64) *http.Request {
	t.Helper()
	var body bytes.Buffer
	mw := multipart.NewWriter(&body)
	part, err := mw.CreateFormFile("not-file", "x.txt")
	require.NoError(t, err)
	_, err = part.Write([]byte("irrelevant"))
	require.NoError(t, err)
	require.NoError(t, mw.Close())

	req := httptest.NewRequest(http.MethodPost, fmt.Sprintf("/api/sessions/%d/locate", id), &body)
	req.Header.Set("Content-Type", mw.FormDataContentType())
	req.AddCookie(&http.Cookie{Name: cookieName, Value: testUIToken})
	return req
}

// zeroReader emits n zero bytes without ever materializing them as one big slice, so
// D13's over-cap test can stream ~50 MiB through the handler without allocating it.
type zeroReader struct{ remaining int64 }

func (z *zeroReader) Read(p []byte) (int, error) {
	if z.remaining <= 0 {
		return 0, io.EOF
	}
	n := int64(len(p))
	if n > z.remaining {
		n = z.remaining
	}
	for i := range n {
		p[i] = 0
	}
	z.remaining -= n
	return int(n), nil
}

// buildOversizeLocateRequest streams a file part sized just over maxLocateUploadBytes so
// http.MaxBytesReader trips (D13), without ever holding the whole body in memory.
func buildOversizeLocateRequest(t *testing.T, id int64) *http.Request {
	t.Helper()
	pr, pw := io.Pipe()
	mw := multipart.NewWriter(pw)

	go func() {
		part, err := mw.CreateFormFile("file", "big.bin")
		if err == nil {
			_, err = io.Copy(part, &zeroReader{remaining: maxLocateUploadBytes + 4096})
		}
		if err == nil {
			err = mw.Close()
		}
		_ = pw.CloseWithError(err)
	}()

	req := httptest.NewRequest(http.MethodPost, fmt.Sprintf("/api/sessions/%d/locate", id), pr)
	req.Header.Set("Content-Type", mw.FormDataContentType())
	req.AddCookie(&http.Cookie{Name: cookieName, Value: testUIToken})
	return req
}

// dirSnapshot lists every file under root keyed by a content hash, for INV-2 ("no locate
// request... creates or modifies any file under... the session directory") at the
// handler level. Review Major 2: hashing content, rather than recording size alone, is
// required to catch an in-place same-size modification — INV-2's own wording forbids
// both "creates or modifies", and a size-only snapshot cannot tell those apart.
func dirSnapshot(t *testing.T, root string) map[string]string {
	t.Helper()
	snap := map[string]string{}
	err := filepath.WalkDir(root, func(path string, d os.DirEntry, err error) error {
		if err != nil {
			return err
		}
		if d.IsDir() {
			return nil
		}
		data, readErr := os.ReadFile(path)
		require.NoError(t, readErr)
		rel, relErr := filepath.Rel(root, path)
		require.NoError(t, relErr)
		sum := sha256.Sum256(data)
		snap[rel] = hex.EncodeToString(sum[:])
		return nil
	})
	require.NoError(t, err)
	return snap
}

// dataDirSnapshot lists the file *set* (relative paths only, no size or content) under
// the daemon's data dir (filepath.Dir(srv.dbPath)) — D16's data-dir half of INV-2, which
// dirSnapshot above never covered (review Major 2). Sizes (or hashes) are deliberately
// not recorded here: the SQLite WAL file the store keeps open in this same directory
// legitimately grows while a request that reads via the store is in flight, so a
// size-or-content-keyed snapshot of the data dir would flake. The file set itself must
// still be exactly the same before and after — the locate endpoint has no business
// creating, removing or renaming anything there.
func dataDirSnapshot(t *testing.T, srv *testServer) map[string]struct{} {
	t.Helper()
	root := filepath.Dir(srv.dbPath)
	snap := map[string]struct{}{}
	err := filepath.WalkDir(root, func(path string, d os.DirEntry, err error) error {
		if err != nil {
			return err
		}
		if d.IsDir() {
			return nil
		}
		rel, relErr := filepath.Rel(root, path)
		require.NoError(t, relErr)
		snap[rel] = struct{}{}
		return nil
	})
	require.NoError(t, err)
	return snap
}

func TestHandleLocateFile_RequiresCookie(t *testing.T) {
	srv := newTestServer(t, ClaudeCodeInfo{})
	req := buildLocateRequest(t, 1, "x.txt", []byte("hello"), false)

	rec := httptest.NewRecorder()
	srv.Handler().ServeHTTP(rec, req)

	assert.Equal(t, http.StatusUnauthorized, rec.Code)
}

func TestHandleLocateFile_UnknownSession(t *testing.T) {
	srv := newTestServer(t, ClaudeCodeInfo{})
	req := buildLocateRequest(t, 999999, "x.txt", []byte("hello"), true)

	rec := httptest.NewRecorder()
	srv.Handler().ServeHTTP(rec, req)

	require.Equal(t, http.StatusNotFound, rec.Code)
	var resp errorResponse
	require.NoError(t, json.Unmarshal(rec.Body.Bytes(), &resp))
	assert.Equal(t, "unknown_session", resp.Error.Code)
}

func TestHandleLocateFile_MissingFilePart(t *testing.T) {
	srv := newTestServer(t, ClaudeCodeInfo{})
	id := newLocateTestSession(t, srv, t.TempDir())
	req := buildLocateRequestNoFilePart(t, id)

	rec := httptest.NewRecorder()
	srv.Handler().ServeHTTP(rec, req)

	require.Equal(t, http.StatusBadRequest, rec.Code)
	var resp errorResponse
	require.NoError(t, json.Unmarshal(rec.Body.Bytes(), &resp))
	assert.Equal(t, "invalid_request", resp.Error.Code)
}

func TestHandleLocateFile_NotMultipartBody(t *testing.T) {
	srv := newTestServer(t, ClaudeCodeInfo{})
	id := newLocateTestSession(t, srv, t.TempDir())

	req := httptest.NewRequest(http.MethodPost, fmt.Sprintf("/api/sessions/%d/locate", id), bytes.NewBufferString(`{"not":"multipart"}`))
	req.Header.Set("Content-Type", "application/json")
	req.AddCookie(&http.Cookie{Name: cookieName, Value: testUIToken})

	rec := httptest.NewRecorder()
	srv.Handler().ServeHTTP(rec, req)

	require.Equal(t, http.StatusBadRequest, rec.Code)
	var resp errorResponse
	require.NoError(t, json.Unmarshal(rec.Body.Bytes(), &resp))
	assert.Equal(t, "invalid_request", resp.Error.Code)
}

// TestHandleLocateFile_BadFilename covers Edge Case 13's empty-filename half: the
// handler must reject an empty part filename as 400 rather than trust it.
//
// The path-separator half of Edge Case 13/the Protocol Contract ("filename... contains
// a path separator" -> 400) is not exercisable as a black-box HTTP test: Go's
// mime/multipart.Part.FileName() unconditionally runs filepath.Base() over the
// Content-Disposition filename parameter before readFilePart ever sees it (RFC 7578
// §4.2's "directory path information must not be used" — see `go doc -src
// mime/multipart.Part.FileName`), for every request that reaches this handler via
// net/http's own multipart.Reader, including one built with a raw Content-Disposition
// header rather than multipart.Writer.CreateFormFile. So the string can never contain
// "/" by the time readFilePart's own strings.Contains(filename, "/") check runs — that
// check is a harmless defensive backstop, not a reachable branch, and not a functional
// gap: no path ever reaches the Locator either way. Confirmed empirically: an attempted
// httptest.NewRequest with filename "sub/dir.txt" reads back as "dir.txt" and reaches
// the Locator, not the 400 branch (which then nil-derefs on this test server's unset
// locator — expected, since this test never sets one). Not treated as an
// implementation-bug: the observable contract ("no path component is ever trusted") is
// still met, just via net/http's normalization rather than the handler's own check.
func TestHandleLocateFile_BadFilename(t *testing.T) {
	srv := newTestServer(t, ClaudeCodeInfo{})
	id := newLocateTestSession(t, srv, t.TempDir())
	req := buildLocateRequest(t, id, "", []byte("hello"), true)

	rec := httptest.NewRecorder()
	srv.Handler().ServeHTTP(rec, req)

	require.Equal(t, http.StatusBadRequest, rec.Code)
	var resp errorResponse
	require.NoError(t, json.Unmarshal(rec.Body.Bytes(), &resp))
	assert.Equal(t, "invalid_request", resp.Error.Code)
}

func TestHandleLocateFile_TooLarge(t *testing.T) {
	srv := newTestServer(t, ClaudeCodeInfo{})
	id := newLocateTestSession(t, srv, t.TempDir())
	req := buildOversizeLocateRequest(t, id)

	rec := httptest.NewRecorder()
	srv.Handler().ServeHTTP(rec, req)

	require.Equal(t, http.StatusRequestEntityTooLarge, rec.Code)
	var resp errorResponse
	require.NoError(t, json.Unmarshal(rec.Body.Bytes(), &resp))
	assert.Equal(t, "too_large", resp.Error.Code)
}

// walkOnlyLocator is the real Locator minus its Spotlight Finder: E2E's own
// Implementation Notes record that scratch temp dirs are not Spotlight-indexed, so
// against t.TempDir() the daemon's locate.New() would only ever fall through to the walk
// anyway — this reaches the same outcome without forking `mdfind` once per call
// (docs/conventions.md §Testing: no unit test runs a real subprocess it doesn't assert on).
func walkOnlyLocator() *locate.Locator {
	return locate.NewWithFinders(locate.NewWalkFinder(locate.DefaultWalkCap))
}

// TestHandleLocateFile_OutcomesMatchLocatorResult (D15) drives the handler with the
// walk-only Locator, which for a session directory under os.TempDir() is exactly the
// path the real daemon's Spotlight-then-walk Locator takes.
func TestHandleLocateFile_OutcomesMatchLocatorResult(t *testing.T) {
	t.Run("200: exactly one byte-identical file", func(t *testing.T) {
		srv := newTestServer(t, ClaudeCodeInfo{})
		srv.locate.locator = walkOnlyLocator()
		dir := t.TempDir()
		content := []byte("D15 single match unique content")
		target := filepath.Join(dir, "found.txt")
		require.NoError(t, os.WriteFile(target, content, 0o644))
		id := newLocateTestSession(t, srv, dir)

		before := dirSnapshot(t, dir)
		dataBefore := dataDirSnapshot(t, srv)
		req := buildLocateRequest(t, id, "found.txt", content, true)
		rec := httptest.NewRecorder()
		srv.Handler().ServeHTTP(rec, req)

		require.Equal(t, http.StatusOK, rec.Code)
		var resp locateResponse
		require.NoError(t, json.Unmarshal(rec.Body.Bytes(), &resp))
		resolved, err := filepath.EvalSymlinks(target)
		require.NoError(t, err)
		assert.Equal(t, resolved, resp.Path)
		assert.Equal(t, before, dirSnapshot(t, dir), "INV-2: locate must not modify the session directory")
		assert.Equal(t, dataBefore, dataDirSnapshot(t, srv), "D16/INV-2: locate must not modify the data dir")
	})

	t.Run("404 not_located: no matching file on disk", func(t *testing.T) {
		srv := newTestServer(t, ClaudeCodeInfo{})
		srv.locate.locator = walkOnlyLocator()
		dir := t.TempDir()
		id := newLocateTestSession(t, srv, dir)

		before := dirSnapshot(t, dir)
		dataBefore := dataDirSnapshot(t, srv)
		req := buildLocateRequest(t, id, "nowhere.txt", []byte("nothing matches this D15 content"), true)
		rec := httptest.NewRecorder()
		srv.Handler().ServeHTTP(rec, req)

		require.Equal(t, http.StatusNotFound, rec.Code)
		var resp errorResponse
		require.NoError(t, json.Unmarshal(rec.Body.Bytes(), &resp))
		assert.Equal(t, "not_located", resp.Error.Code)
		assert.Equal(t, before, dirSnapshot(t, dir), "INV-2: locate must not modify the session directory")
		assert.Equal(t, dataBefore, dataDirSnapshot(t, srv), "D16/INV-2: locate must not modify the data dir")
	})

	t.Run("404 not_located: same name and size but different bytes", func(t *testing.T) {
		srv := newTestServer(t, ClaudeCodeInfo{})
		srv.locate.locator = walkOnlyLocator()
		dir := t.TempDir()
		onDisk := []byte("AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA")
		upload := []byte("BBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB")
		require.Len(t, upload, len(onDisk))
		require.NoError(t, os.WriteFile(filepath.Join(dir, "same-size.txt"), onDisk, 0o644))
		id := newLocateTestSession(t, srv, dir)

		before := dirSnapshot(t, dir)
		dataBefore := dataDirSnapshot(t, srv)
		req := buildLocateRequest(t, id, "same-size.txt", upload, true)
		rec := httptest.NewRecorder()
		srv.Handler().ServeHTTP(rec, req)

		require.Equal(t, http.StatusNotFound, rec.Code)
		var resp errorResponse
		require.NoError(t, json.Unmarshal(rec.Body.Bytes(), &resp))
		assert.Equal(t, "not_located", resp.Error.Code)
		assert.Equal(t, before, dirSnapshot(t, dir), "INV-2: locate must not modify the session directory")
		assert.Equal(t, dataBefore, dataDirSnapshot(t, srv), "D16/INV-2: locate must not modify the data dir")
	})

	t.Run("409 ambiguous: two identical files, paths listed", func(t *testing.T) {
		srv := newTestServer(t, ClaudeCodeInfo{})
		srv.locate.locator = walkOnlyLocator()
		dir := t.TempDir()
		content := []byte("D15 ambiguous duplicated content")
		pathA := filepath.Join(dir, "a", "dup.txt")
		pathB := filepath.Join(dir, "b", "dup.txt")
		require.NoError(t, os.MkdirAll(filepath.Dir(pathA), 0o755))
		require.NoError(t, os.MkdirAll(filepath.Dir(pathB), 0o755))
		require.NoError(t, os.WriteFile(pathA, content, 0o644))
		require.NoError(t, os.WriteFile(pathB, content, 0o644))
		id := newLocateTestSession(t, srv, dir)

		before := dirSnapshot(t, dir)
		dataBefore := dataDirSnapshot(t, srv)
		req := buildLocateRequest(t, id, "dup.txt", content, true)
		rec := httptest.NewRecorder()
		srv.Handler().ServeHTTP(rec, req)

		require.Equal(t, http.StatusConflict, rec.Code)
		var resp struct {
			Error struct {
				Code    string   `json:"code"`
				Message string   `json:"message"`
				Paths   []string `json:"paths"`
			} `json:"error"`
		}
		require.NoError(t, json.Unmarshal(rec.Body.Bytes(), &resp))
		assert.Equal(t, "ambiguous", resp.Error.Code)
		require.Len(t, resp.Error.Paths, 2)
		resolvedA, err := filepath.EvalSymlinks(pathA)
		require.NoError(t, err)
		resolvedB, err := filepath.EvalSymlinks(pathB)
		require.NoError(t, err)
		assert.ElementsMatch(t, []string{resolvedA, resolvedB}, resp.Error.Paths)
		assert.Contains(t, resp.Error.Message, strconv.Itoa(len(resp.Error.Paths)))
		assert.Equal(t, before, dirSnapshot(t, dir), "INV-2: locate must not modify the session directory")
		assert.Equal(t, dataBefore, dataDirSnapshot(t, srv), "D16/INV-2: locate must not modify the data dir")
	})
}

// TestHandleLocateFile_NeverWritesUploadToDisk is INV-2's handler-level pin across every
// error branch that never reaches the Locator at all (400/413), plus 404 unknown_session
// — none of these have any business creating a file anywhere.
func TestHandleLocateFile_NeverWritesUploadToDisk(t *testing.T) {
	srv := newTestServer(t, ClaudeCodeInfo{})
	dir := t.TempDir()
	id := newLocateTestSession(t, srv, dir)
	before := dirSnapshot(t, dir)
	dataBefore := dataDirSnapshot(t, srv)

	// 400: missing file part.
	rec := httptest.NewRecorder()
	srv.Handler().ServeHTTP(rec, buildLocateRequestNoFilePart(t, id))
	require.Equal(t, http.StatusBadRequest, rec.Code)

	// 413: too large.
	rec = httptest.NewRecorder()
	srv.Handler().ServeHTTP(rec, buildOversizeLocateRequest(t, id))
	require.Equal(t, http.StatusRequestEntityTooLarge, rec.Code)

	// 404: unknown session.
	rec = httptest.NewRecorder()
	srv.Handler().ServeHTTP(rec, buildLocateRequest(t, 999999, "x.txt", []byte("y"), true))
	require.Equal(t, http.StatusNotFound, rec.Code)

	assert.Equal(t, before, dirSnapshot(t, dir))
	assert.Equal(t, dataBefore, dataDirSnapshot(t, srv), "D16/INV-2: locate must not modify the data dir")
}

// TestHandleLocateFile_FinderErrorReturnsInternalError drives the handler with the
// walk-only Locator against a session directory that is itself unreadable, so
// WalkFinder.Find surfaces a genuine error (not "nothing found") and Locate wraps and
// returns it rather than swallowing it — see internal/locate/walk_test.go's
// TestWalkFinder_UnreadableRootIsARealError and internal/locate/locate_test.go's
// TestLocate_WrapsAndReturnsARealFinderError. Before this test, the Protocol Contract's
// 500 internal_error branch had no server-side coverage at all (review Minor 4).
func TestHandleLocateFile_FinderErrorReturnsInternalError(t *testing.T) {
	if os.Geteuid() == 0 {
		t.Skip("root ignores directory permission bits")
	}
	srv := newTestServer(t, ClaudeCodeInfo{})
	srv.locate.locator = walkOnlyLocator()
	dir := t.TempDir()
	id := newLocateTestSession(t, srv, dir)

	require.NoError(t, os.Chmod(dir, 0o000))
	t.Cleanup(func() { _ = os.Chmod(dir, 0o755) }) // let TempDir cleanup remove it

	req := buildLocateRequest(t, id, "x.txt", []byte("hello, this is D-500's fingerprint"), true)
	rec := httptest.NewRecorder()
	srv.Handler().ServeHTTP(rec, req)

	require.Equal(t, http.StatusInternalServerError, rec.Code)
	var resp errorResponse
	require.NoError(t, json.Unmarshal(rec.Body.Bytes(), &resp))
	assert.Equal(t, "internal_error", resp.Error.Code)
}

// TestHandleLocateFile_NilLocatorIs500NotAPanic covers REQ-6/D6: a misconfigured server
// (Config.Locator left nil, as every newTestServer in this package's other tests already
// does by not setting it) answers 500 internal_error instead of nil-dereferencing
// s.locator.Locate — and, critically, the server must still be alive to answer that 500
// at all, which a panic reaching net/http's handler goroutine would not guarantee.
// newTestServer never sets Config.Locator, so this needs no explicit srv.locate.locator = nil.
func TestHandleLocateFile_NilLocatorIs500NotAPanic(t *testing.T) {
	srv := newTestServer(t, ClaudeCodeInfo{})
	require.Nil(t, srv.locate.locator, "this test's premise: no Locator configured")
	id := newLocateTestSession(t, srv, t.TempDir())

	req := buildLocateRequest(t, id, "x.txt", []byte("hello"), true)
	rec := httptest.NewRecorder()
	srv.Handler().ServeHTTP(rec, req)

	require.Equal(t, http.StatusInternalServerError, rec.Code)
	var resp errorResponse
	require.NoError(t, json.Unmarshal(rec.Body.Bytes(), &resp))
	assert.Equal(t, "internal_error", resp.Error.Code)

	// D6's "the server stays serving" half: a second, ordinary request must still be
	// answered normally, not by a crashed handler goroutine.
	rec2 := httptest.NewRecorder()
	srv.Handler().ServeHTTP(rec2, buildLocateRequest(t, id, "x.txt", []byte("hello"), true))
	assert.Equal(t, http.StatusInternalServerError, rec2.Code, "the server must still be serving requests after the nil-Locator 500")
}

// TestHandleLocateFile_NilLocatorStillValidatesBodyFirst pins Fix Attempt 1's regression
// directly: with Config.Locator nil (newTestServer's default), a request whose *body* is
// invalid must still answer with the body-validation branch's own status/code — 400
// invalid_request for a missing file part, 413 too_large for an oversize upload — never
// the nil-Locator guard's 500. Before the fix, the guard ran ahead of readFilePart and
// every one of these cases answered 500 instead (see daemon-implementation.md's "Fix
// Attempt 1" and this file's TestHandleLocateFile_MissingFilePart/_TooLarge, which this
// test complements by asserting the same outcomes hold with no Locator configured at
// all, rather than relying on newTestServer's default happening to be nil elsewhere).
func TestHandleLocateFile_NilLocatorStillValidatesBodyFirst(t *testing.T) {
	srv := newTestServer(t, ClaudeCodeInfo{})
	require.Nil(t, srv.locate.locator, "this test's premise: no Locator configured")
	id := newLocateTestSession(t, srv, t.TempDir())

	t.Run("missing_file_part", func(t *testing.T) {
		rec := httptest.NewRecorder()
		srv.Handler().ServeHTTP(rec, buildLocateRequestNoFilePart(t, id))

		require.Equal(t, http.StatusBadRequest, rec.Code, "body validation must win over the nil-Locator guard")
		var resp errorResponse
		require.NoError(t, json.Unmarshal(rec.Body.Bytes(), &resp))
		assert.Equal(t, "invalid_request", resp.Error.Code)
	})

	t.Run("too_large", func(t *testing.T) {
		rec := httptest.NewRecorder()
		srv.Handler().ServeHTTP(rec, buildOversizeLocateRequest(t, id))

		require.Equal(t, http.StatusRequestEntityTooLarge, rec.Code, "body validation must win over the nil-Locator guard")
		var resp errorResponse
		require.NoError(t, json.Unmarshal(rec.Body.Bytes(), &resp))
		assert.Equal(t, "too_large", resp.Error.Code)
	})
}
