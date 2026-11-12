package server

import (
	"context"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"testing"
	"time"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/Zalaras/muster/internal/claudecode"
	"github.com/Zalaras/muster/internal/session"
)

func scratchDirFor(t *testing.T, claudeID string) string {
	t.Helper()
	dir := filepath.Join(t.TempDir(), claudeID, "scratchpad")
	require.NoError(t, os.MkdirAll(dir, 0o755))
	return dir
}

func seedScratchSession(t *testing.T, srv *testServer, claudeID, scratch string) *session.Session {
	t.Helper()
	sess := seedLiveSessionInDir(t, srv, t.TempDir())
	_, err := srv.manager.Apply(context.Background(), sess.ID, claudeID, nil, claudecode.StateInput{Kind: claudecode.KindBind}, true)
	require.NoError(t, err)
	if scratch != "" {
		srv.reader.Observe(context.Background(), sess.ID, claudeID, claudecode.FileSignal{ScratchpadDir: scratch})
	}
	return sess
}

func TestReaderObserve_ScratchpadDirMovesOnlyForTheCurrentClaudeSession(t *testing.T) {
	srv := newTestServer(t, ClaudeCodeInfo{})
	a, b := scratchDirFor(t, "claude-A"), scratchDirFor(t, "claude-B")
	sess := seedScratchSession(t, srv, "claude-A", a)
	got, _ := srv.manager.Get(sess.ID)
	require.Equal(t, a, got.ScratchpadDir)

	_, err := srv.manager.Apply(context.Background(), sess.ID, "claude-B", nil, claudecode.StateInput{Kind: claudecode.KindClearRebind}, true)
	require.NoError(t, err)
	srv.reader.Observe(context.Background(), sess.ID, "claude-A", claudecode.FileSignal{ScratchpadDir: scratchDirFor(t, "claude-A")})
	got, _ = srv.manager.Get(sess.ID)
	assert.Equal(t, a, got.ScratchpadDir, "binding moved on; a straggler observe must not move it")

	srv.reader.Observe(context.Background(), sess.ID, "claude-B", claudecode.FileSignal{ScratchpadDir: b})
	got, _ = srv.manager.Get(sess.ID)
	assert.Equal(t, b, got.ScratchpadDir)

	srv.reader.Observe(context.Background(), sess.ID, "claude-B", claudecode.FileSignal{})
	got, _ = srv.manager.Get(sess.ID)
	assert.Equal(t, b, got.ScratchpadDir, "a hook with no folder never clears it")
}

func TestHandleReaderList_ScratchBlock(t *testing.T) {
	t.Run("null until a hook names a folder", func(t *testing.T) {
		srv := newTestServer(t, ClaudeCodeInfo{})
		sess := seedScratchSession(t, srv, "claude-A", "")

		out := readerListingBody(t, getReaderListRequest(t, srv, sess.ID))

		assert.Nil(t, out.Scratch)
	})

	t.Run("lists md files newest first with writtenAt only for recorded writes", func(t *testing.T) {
		srv := newTestServer(t, ClaudeCodeInfo{})
		dir := scratchDirFor(t, "claude-A")
		base := time.Now().Add(-time.Hour)
		for i, rel := range []string{"old.md", "nested/new.md", "data.json", ".dot/h.md"} {
			p := filepath.Join(dir, rel)
			require.NoError(t, os.MkdirAll(filepath.Dir(p), 0o755))
			require.NoError(t, os.WriteFile(p, []byte("x"), 0o644))
			require.NoError(t, os.Chtimes(p, base.Add(time.Duration(i)*time.Minute), base.Add(time.Duration(i)*time.Minute)))
		}
		require.NoError(t, os.MkdirAll(filepath.Join(filepath.Dir(dir), "tasks"), 0o755))
		require.NoError(t, os.WriteFile(filepath.Join(filepath.Dir(dir), "tasks", "t.md"), []byte("x"), 0o644))
		sess := seedScratchSession(t, srv, "claude-A", dir)
		srv.reader.Observe(context.Background(), sess.ID, "claude-A", claudecode.FileSignal{WrittenPath: filepath.Join(dir, "old.md")})

		out := readerListingBody(t, getReaderListRequest(t, srv, sess.ID))

		require.NotNil(t, out.Scratch)
		assert.Equal(t, dir, out.Scratch.Dir)
		require.Len(t, out.Scratch.Files, 2)
		assert.Equal(t, "nested/new.md", out.Scratch.Files[0].Path)
		assert.Equal(t, "old.md", out.Scratch.Files[1].Path)
		assert.Nil(t, out.Scratch.Files[0].WrittenAt)
		assert.NotNil(t, out.Scratch.Files[1].WrittenAt)
		_, err := time.Parse(time.RFC3339Nano, out.Scratch.Files[0].ModifiedAt)
		assert.NoError(t, err)
	})

	t.Run("a deleted folder gives an empty files array, not null", func(t *testing.T) {
		srv := newTestServer(t, ClaudeCodeInfo{})
		dir := scratchDirFor(t, "claude-A")
		sess := seedScratchSession(t, srv, "claude-A", dir)
		require.NoError(t, os.RemoveAll(dir))

		rec := getReaderListRequest(t, srv, sess.ID)

		require.Equal(t, http.StatusOK, rec.Code)
		out := readerListingBody(t, rec)
		require.NotNil(t, out.Scratch)
		assert.NotNil(t, out.Scratch.Files)
		assert.Empty(t, out.Scratch.Files)
		assert.Contains(t, rec.Body.String(), `"files":[]`)
	})

	t.Run("plan modifiedAt is the file's mtime, null when the file is missing", func(t *testing.T) {
		srv := newTestServer(t, ClaudeCodeInfo{})
		sess := seedScratchSession(t, srv, "claude-A", "")
		planPath := filepath.Join(t.TempDir(), "plan.md")
		_, _, err := srv.manager.SetPlan(context.Background(), sess.ID, "claude-A", planPath, false)
		require.NoError(t, err)

		out := readerListingBody(t, getReaderListRequest(t, srv, sess.ID))
		require.NotNil(t, out.Plan)
		assert.Nil(t, out.Plan.ModifiedAt, "plan not written yet")

		require.NoError(t, os.WriteFile(planPath, []byte("# P"), 0o644))
		out = readerListingBody(t, getReaderListRequest(t, srv, sess.ID))
		require.NotNil(t, out.Plan.ModifiedAt)
		_, err = time.Parse(time.RFC3339Nano, *out.Plan.ModifiedAt)
		assert.NoError(t, err)
	})

	t.Run("a second session's folder never appears in the first's listing", func(t *testing.T) {
		srv := newTestServer(t, ClaudeCodeInfo{})
		dirA, dirB := scratchDirFor(t, "claude-A"), scratchDirFor(t, "claude-B")
		require.NoError(t, os.WriteFile(filepath.Join(dirA, "a.md"), []byte("x"), 0o644))
		require.NoError(t, os.WriteFile(filepath.Join(dirB, "b.md"), []byte("x"), 0o644))
		a := seedScratchSession(t, srv, "claude-A", dirA)
		seedScratchSession(t, srv, "claude-B", dirB)

		out := readerListingBody(t, getReaderListRequest(t, srv, a.ID))

		require.NotNil(t, out.Scratch)
		require.Len(t, out.Scratch.Files, 1)
		assert.Equal(t, "a.md", out.Scratch.Files[0].Path)
	})
}

func TestHandleReaderFile_ScratchConfinement(t *testing.T) {
	srv := newTestServer(t, ClaudeCodeInfo{})
	dirA, dirB := scratchDirFor(t, "claude-A"), scratchDirFor(t, "claude-B")
	require.NoError(t, os.WriteFile(filepath.Join(dirA, "a.md"), []byte("# mine"), 0o644))
	require.NoError(t, os.WriteFile(filepath.Join(dirA, "c.txt"), []byte("x"), 0o644))
	require.NoError(t, os.WriteFile(filepath.Join(dirB, "b.md"), []byte("# theirs"), 0o644))
	outside := filepath.Join(t.TempDir(), "secret.md")
	require.NoError(t, os.WriteFile(outside, []byte("secret"), 0o644))
	require.NoError(t, os.Symlink(outside, filepath.Join(dirA, "link.md")))
	a := seedScratchSession(t, srv, "claude-A", dirA)
	b := seedScratchSession(t, srv, "claude-B", dirB)
	noScratch := seedScratchSession(t, srv, "claude-C", "")

	tests := []struct {
		name   string
		id     int64
		path   string
		status int
	}{
		{"own scratch file serves", a.ID, filepath.Join(dirA, "a.md"), http.StatusOK},
		{"another session's scratch file is 404", a.ID, filepath.Join(dirB, "b.md"), http.StatusNotFound},
		{"the other session still serves its own", b.ID, filepath.Join(dirB, "b.md"), http.StatusOK},
		{"non-md in scratch is 404", a.ID, filepath.Join(dirA, "c.txt"), http.StatusNotFound},
		{"symlink out of scratch is 404", a.ID, filepath.Join(dirA, "link.md"), http.StatusNotFound},
		{"session without a folder cannot reach one", noScratch.ID, filepath.Join(dirA, "a.md"), http.StatusNotFound},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			rec := getReaderFileRequest(t, srv, tt.id, tt.path)
			assert.Equal(t, tt.status, rec.Code)
			if tt.status == http.StatusOK {
				assert.Equal(t, "text/markdown; charset=utf-8", rec.Header().Get("Content-Type"))
			} else {
				assert.Equal(t, "not_found", decodeErrorCode(t, rec))
			}
		})
	}
}

func TestReaderObserve_ScratchWriteBroadcastsDocChangedAndIsLogged(t *testing.T) {
	srv := newTestServer(t, ClaudeCodeInfo{})
	dir := scratchDirFor(t, "claude-A")
	sess := seedScratchSession(t, srv, "claude-A", dir)
	other := scratchDirFor(t, "claude-B")

	httpSrv := httptest.NewServer(srv.Handler())
	t.Cleanup(httpSrv.Close)
	c, err := dialWS(t, "ws"+httpSrv.URL[len("http"):]+"/ws", nil)
	require.NoError(t, err)
	defer func() { _ = c.CloseNow() }()
	_ = readJSON[helloWire](t, c)
	_ = readJSON[snapshotWire](t, c)

	srv.reader.Observe(context.Background(), sess.ID, "claude-A", claudecode.FileSignal{WrittenPath: filepath.Join(other, "x.md")})
	srv.reader.Observe(context.Background(), sess.ID, "claude-A", claudecode.FileSignal{WrittenPath: filepath.Join(dir, "data.json")})
	written := filepath.Join(dir, "note.md")
	srv.reader.Observe(context.Background(), sess.ID, "claude-A", claudecode.FileSignal{WrittenPath: written})

	msg := readJSON[docChangedMessage](t, c)
	assert.Equal(t, "docChanged", msg.Type)
	assert.Equal(t, written, msg.Path, "the first docChanged is the scratch write; foreign and non-md writes broadcast nothing")
	_, ok := srv.reader.writes.Get(sess.ID, written)
	assert.True(t, ok)
	_, ok = srv.reader.writes.Get(sess.ID, filepath.Join(other, "x.md"))
	assert.False(t, ok)
}

func TestWireScratchpadDir_ReturnsACopy(t *testing.T) {
	s := minimalSession()
	s.ScratchpadDir = "/private/tmp/c/sid/scratchpad"

	got := wireScratchpadDir(s)
	require.NotNil(t, got)
	*got = "mutated"

	assert.Equal(t, "/private/tmp/c/sid/scratchpad", s.ScratchpadDir, "the wire value never aliases the session field")
}

func TestToWireSession_ScratchpadDir(t *testing.T) {
	s := minimalSession()
	assert.Nil(t, toWireSession(s).ScratchpadDir, "null until a hook names a folder")

	s.ScratchpadDir = "/private/tmp/c/sid/scratchpad"
	got := toWireSession(s).ScratchpadDir
	require.NotNil(t, got)
	assert.Equal(t, "/private/tmp/c/sid/scratchpad", *got)
}
