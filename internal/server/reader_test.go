package server

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"github.com/coder/websocket"
	"github.com/rs/zerolog"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/Zalaras/muster/internal/claudecode"
	"github.com/Zalaras/muster/internal/claudecode/claudecodetest"
	"github.com/Zalaras/muster/internal/session"
	"github.com/Zalaras/muster/internal/store"
)

// ---- pure functions: confine, readerPathQualifies, walkMarkdown, writeLog, listMarkdown ----

// TestConfine covers D11/INV-2 from every listed entry point: a plain file under the
// directory, `..` traversal, a symlink inside the directory targeting outside, a
// symlinked directory, the plan path (allowed even though it sits outside the
// directory), and a non-`.md` file.
func TestConfine(t *testing.T) {
	dir := t.TempDir()
	require.NoError(t, os.WriteFile(filepath.Join(dir, "a.md"), []byte("# A"), 0o644))
	require.NoError(t, os.Mkdir(filepath.Join(dir, "sub"), 0o755))
	require.NoError(t, os.WriteFile(filepath.Join(dir, "sub", "b.md"), []byte("# B"), 0o644))
	require.NoError(t, os.WriteFile(filepath.Join(dir, "notes.txt"), []byte("x"), 0o644))

	outside := t.TempDir()
	outsideFile := filepath.Join(outside, "secret.md")
	require.NoError(t, os.WriteFile(outsideFile, []byte("secret"), 0o644))
	require.NoError(t, os.Mkdir(filepath.Join(outside, "outdir"), 0o755))
	require.NoError(t, os.WriteFile(filepath.Join(outside, "outdir", "x.md"), []byte("x"), 0o644))

	// A symlink inside dir pointing at a file outside it.
	require.NoError(t, os.Symlink(outsideFile, filepath.Join(dir, "link.md")))
	// A symlinked directory inside dir pointing at a directory outside it.
	require.NoError(t, os.Symlink(filepath.Join(outside, "outdir"), filepath.Join(dir, "linkdir")))

	planDir := t.TempDir()
	planPath := filepath.Join(planDir, "plan.md")
	require.NoError(t, os.WriteFile(planPath, []byte("# Plan"), 0o644))
	// The plan's -agent- and .workshop.md siblings, sitting next to the real plan but
	// outside the session directory — neither is the plan path itself, so neither may
	// be served.
	agentSibling := filepath.Join(planDir, "plan-agent-helper.md")
	require.NoError(t, os.WriteFile(agentSibling, []byte("x"), 0o644))
	workshopSibling := filepath.Join(planDir, "plan.workshop.md")
	require.NoError(t, os.WriteFile(workshopSibling, []byte("x"), 0o644))

	tests := []struct {
		name      string
		requested string
		wantOK    bool
	}{
		{"a plain file under dir", filepath.Join(dir, "a.md"), true},
		{"a nested file under dir", filepath.Join(dir, "sub", "b.md"), true},
		{"the plan path, outside dir", planPath, true},
		{"a non-.md file under dir", filepath.Join(dir, "notes.txt"), false},
		{"`..` traversal to outside dir", filepath.Join(dir, "..", filepath.Base(outside), "secret.md"), false},
		{"a symlink inside dir targeting an outside file", filepath.Join(dir, "link.md"), false},
		{"a symlinked directory inside dir, reached through it", filepath.Join(dir, "linkdir", "x.md"), false},
		{"the plan's -agent- sibling, outside dir", agentSibling, false},
		{"the plan's .workshop.md sibling, outside dir", workshopSibling, false},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			resolved, ok := confine(dir, planPath, tt.requested)
			assert.Equal(t, tt.wantOK, ok)
			if tt.wantOK {
				want, err := filepath.EvalSymlinks(tt.requested)
				require.NoError(t, err)
				assert.Equal(t, want, resolved)
			}
		})
	}

	t.Run("confine works with no plan path at all", func(t *testing.T) {
		_, ok := confine(dir, "", planPath)
		assert.False(t, ok, "an empty planPath must never itself become an allowed match")
	})
}

// TestReaderPathQualifies covers REQ-18's docChanged scope test: lexical confinement
// (no symlink resolution), a `.md` suffix under dir, or an exact match on planPath.
func TestReaderPathQualifies(t *testing.T) {
	const dir = "/tmp/proj"
	const planPath = "/Users/d/.claude/plans/happy-otter.md"

	tests := []struct {
		name string
		path string
		want bool
	}{
		{"exactly the plan path", planPath, true},
		{"a .md file under dir", "/tmp/proj/TODO.md", true},
		{"a nested .md file under dir, case-insensitive extension", "/tmp/proj/sub/x.MD", true},
		{"a non-.md file under dir", "/tmp/proj/notes.txt", false},
		{"a .md file outside dir and not the plan", "/tmp/other/x.md", false},
		{"dir itself is not a qualifying file", "/tmp/proj", false},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			assert.Equal(t, tt.want, readerPathQualifies(dir, planPath, tt.path))
		})
	}

	t.Run("no plan path configured never matches on path alone", func(t *testing.T) {
		assert.False(t, readerPathQualifies(dir, "", "/tmp/proj/notes.txt"))
	})
}

// TestWalkMarkdown covers D8/REQ-10/REQ-25: every `.md` file (case-insensitive) is
// listed relative to dir, dot-directories are skipped entirely, and results are sorted.
func TestWalkMarkdown(t *testing.T) {
	dir := t.TempDir()
	require.NoError(t, os.WriteFile(filepath.Join(dir, "TODO.md"), []byte("x"), 0o644))
	require.NoError(t, os.WriteFile(filepath.Join(dir, "notes.txt"), []byte("x"), 0o644))
	require.NoError(t, os.Mkdir(filepath.Join(dir, "docs"), 0o755))
	require.NoError(t, os.WriteFile(filepath.Join(dir, "docs", "guide.MD"), []byte("x"), 0o644))
	require.NoError(t, os.Mkdir(filepath.Join(dir, ".git"), 0o755))
	require.NoError(t, os.WriteFile(filepath.Join(dir, ".git", "ignored.md"), []byte("x"), 0o644))

	paths, listing, truncated := walkMarkdown(dir)

	assert.Equal(t, "walk", listing)
	assert.False(t, truncated)
	assert.Equal(t, []string{"TODO.md", "docs/guide.MD"}, paths)
}

// TestWalkMarkdown_CapsAt20000AndReportsTruncated covers REQ-25: the walk stops at
// 20,000 files and reports truncated:true.
func TestWalkMarkdown_CapsAt20000AndReportsTruncated(t *testing.T) {
	dir := t.TempDir()
	const total = maxWalkFiles + 5
	for i := range total {
		require.NoError(t, os.WriteFile(filepath.Join(dir, fmt.Sprintf("f%05d.md", i)), nil, 0o644))
	}

	paths, listing, truncated := walkMarkdown(dir)

	assert.Equal(t, "walk", listing)
	assert.True(t, truncated)
	assert.Len(t, paths, maxWalkFiles)
}

// TestListMarkdown_GitSuccessFiltersToMarkdownAndSorts covers D7's git branch through
// the injectable readerExecFunc — no test executes the real git binary through this
// seam (reader.go's own doc comment on readerExecFunc).
func TestListMarkdown_GitSuccessFiltersToMarkdownAndSorts(t *testing.T) {
	fakeGit := func(_ context.Context, _ string, _ ...string) ([]byte, error) {
		entries := []string{"zeta.md", "notes.txt", "docs/alpha.MD", "docs/"}
		return []byte(strings.Join(entries, "\x00") + "\x00"), nil
	}
	f := &readerFeature{runGit: fakeGit, log: zerolog.Nop()}

	paths, listing, truncated := f.listMarkdown(context.Background(), "/whatever")

	assert.Equal(t, "git", listing)
	assert.False(t, truncated)
	assert.Equal(t, []string{"docs/alpha.MD", "zeta.md"}, paths)
}

// TestListMarkdown_GitFailureFallsBackToWalk covers D7's fallback clause: a git failure
// (not a checkout, or a real error) is not itself an error — it falls back to the walk
// listing rather than failing the request.
func TestListMarkdown_GitFailureFallsBackToWalk(t *testing.T) {
	dir := t.TempDir()
	require.NoError(t, os.WriteFile(filepath.Join(dir, "TODO.md"), []byte("x"), 0o644))
	fakeGit := func(_ context.Context, _ string, _ ...string) ([]byte, error) {
		return nil, errors.New("exit status 128: not a git repository")
	}
	f := &readerFeature{runGit: fakeGit, log: zerolog.Nop()}

	paths, listing, truncated := f.listMarkdown(context.Background(), dir)

	assert.Equal(t, "walk", listing)
	assert.False(t, truncated)
	assert.Equal(t, []string{"TODO.md"}, paths)
}

// TestWriteLog covers the write log's record/get/forget contract and its 512-entry cap
// (Implementation Notes: "when a session's map exceeds 512 entries drop the oldest").
func TestWriteLog(t *testing.T) {
	t.Run("record then get round-trips, scoped per session", func(t *testing.T) {
		l := newWriteLog()
		at := time.Date(2026, 9, 13, 9, 0, 0, 0, time.UTC)

		l.record(1, "/tmp/a.md", at)

		got, ok := l.get(1, "/tmp/a.md")
		require.True(t, ok)
		assert.True(t, got.Equal(at))

		_, ok = l.get(1, "/tmp/other.md")
		assert.False(t, ok, "an unrecorded path must not be found")
		_, ok = l.get(2, "/tmp/a.md")
		assert.False(t, ok, "the write log is scoped per session")
	})

	t.Run("forget drops the whole session", func(t *testing.T) {
		l := newWriteLog()
		l.record(1, "/tmp/a.md", time.Now())

		l.forget(1)

		_, ok := l.get(1, "/tmp/a.md")
		assert.False(t, ok)
	})

	t.Run("exceeding the cap drops exactly the oldest entry", func(t *testing.T) {
		l := newWriteLog()
		base := time.Date(2026, 9, 13, 0, 0, 0, 0, time.UTC)
		for i := range maxWriteLogPaths {
			l.record(1, fmt.Sprintf("/tmp/f%d.md", i), base.Add(time.Duration(i)*time.Second))
		}
		l.mu.Lock()
		require.Len(t, l.bySession[1], maxWriteLogPaths, "sanity: exactly at the cap before the extra insert")
		l.mu.Unlock()

		// One more, strictly newer than every existing entry, must evict the single
		// oldest (f0) and leave every other entry intact.
		l.record(1, "/tmp/newest.md", base.Add(time.Duration(maxWriteLogPaths)*time.Second))

		l.mu.Lock()
		assert.Len(t, l.bySession[1], maxWriteLogPaths, "the cap must never be exceeded")
		l.mu.Unlock()
		_, ok := l.get(1, "/tmp/f0.md")
		assert.False(t, ok, "the single oldest entry must have been dropped")
		_, ok = l.get(1, "/tmp/f1.md")
		assert.True(t, ok, "every other entry must survive")
		_, ok = l.get(1, "/tmp/newest.md")
		assert.True(t, ok)
	})
}

// ---- HTTP-level: GET /api/sessions/{id}/reader and .../reader/file ----

// seedLiveSessionInDir mirrors ingest_routing_test.go's seedLiveSession but against a
// caller-chosen, real, on-disk directory — the reader's handlers stat and list it, so
// "/tmp/routing-test" (seedLiveSession's fixed, likely-nonexistent path) won't do.
func seedLiveSessionInDir(t *testing.T, srv *testServer, dir string) *session.Session {
	t.Helper()
	repo, _, err := srv.store.UpsertRepo(context.Background(), store.UpsertRepoParams{
		Path: dir, Name: filepath.Base(dir), Model: "sonnet", PermissionMode: "default",
	})
	require.NoError(t, err)
	sess, err := srv.manager.CreateSession(context.Background(), session.CreateParams{
		RepoID: repo.ID, Directory: dir, PermissionMode: session.PermissionDefault, Model: "sonnet",
	})
	require.NoError(t, err)
	final, err := srv.manager.RecordLaunch(context.Background(), sess.ID, fmt.Sprintf("muster-%d:@1", sess.ID), "%1")
	require.NoError(t, err)
	return final
}

func getReaderListRequest(t *testing.T, srv *testServer, id int64) *httptest.ResponseRecorder {
	t.Helper()
	req := httptest.NewRequest(http.MethodGet, fmt.Sprintf("/api/sessions/%d/reader", id), nil)
	req.AddCookie(&http.Cookie{Name: cookieName, Value: testUIToken})
	rec := httptest.NewRecorder()
	srv.Handler().ServeHTTP(rec, req)
	return rec
}

func getReaderFileRequest(t *testing.T, srv *testServer, id int64, path string) *httptest.ResponseRecorder {
	t.Helper()
	u := fmt.Sprintf("/api/sessions/%d/reader/file", id)
	if path != "" {
		u += "?path=" + path
	}
	req := httptest.NewRequest(http.MethodGet, u, nil)
	req.AddCookie(&http.Cookie{Name: cookieName, Value: testUIToken})
	rec := httptest.NewRecorder()
	srv.Handler().ServeHTTP(rec, req)
	return rec
}

func TestHandleReaderList_RequiresCookie(t *testing.T) {
	srv := newTestServer(t, ClaudeCodeInfo{})

	req := httptest.NewRequest(http.MethodGet, "/api/sessions/1/reader", nil)
	rec := httptest.NewRecorder()
	srv.Handler().ServeHTTP(rec, req)

	assert.Equal(t, http.StatusUnauthorized, rec.Code)
}

func TestHandleReaderFile_RequiresCookie(t *testing.T) {
	srv := newTestServer(t, ClaudeCodeInfo{})

	req := httptest.NewRequest(http.MethodGet, "/api/sessions/1/reader/file?path=/tmp/x.md", nil)
	rec := httptest.NewRecorder()
	srv.Handler().ServeHTTP(rec, req)

	assert.Equal(t, http.StatusUnauthorized, rec.Code)
}

func TestHandleReaderList_UnknownSessionIs404(t *testing.T) {
	srv := newTestServer(t, ClaudeCodeInfo{})

	rec := getReaderListRequest(t, srv, 999999)

	assert.Equal(t, http.StatusNotFound, rec.Code)
	assert.Equal(t, "unknown_session", decodeErrorCode(t, rec))
}

func TestHandleReaderFile_UnknownSessionIs404(t *testing.T) {
	srv := newTestServer(t, ClaudeCodeInfo{})

	rec := getReaderFileRequest(t, srv, 999999, "/tmp/x.md")

	assert.Equal(t, http.StatusNotFound, rec.Code)
	assert.Equal(t, "unknown_session", decodeErrorCode(t, rec))
}

// TestHandleReaderList_DirectoryMissingIs409 covers D18: the session's directory no
// longer existing (removed underneath it) is a 409 directory_missing, not a 500 or an
// empty listing.
func TestHandleReaderList_DirectoryMissingIs409(t *testing.T) {
	srv := newTestServer(t, ClaudeCodeInfo{})
	dir := t.TempDir()
	sess := seedLiveSessionInDir(t, srv, dir)
	require.NoError(t, os.RemoveAll(dir))

	rec := getReaderListRequest(t, srv, sess.ID)

	assert.Equal(t, http.StatusConflict, rec.Code)
	assert.Equal(t, "directory_missing", decodeErrorCode(t, rec))
}

func readerListingBody(t *testing.T, rec *httptest.ResponseRecorder) readerListingWire {
	t.Helper()
	var out readerListingWire
	require.NoError(t, json.Unmarshal(rec.Body.Bytes(), &out))
	return out
}

// TestHandleReaderList_NoTranscriptRespondsPlanNullAndBroadcastsNothing covers D9's
// negative half: a session with no recorded transcript path responds plan:null and the
// GET's own side-effecting scan never runs (nothing to scan), so no sessionUpsert
// reaches a connected client.
func TestHandleReaderList_NoTranscriptRespondsPlanNullAndBroadcastsNothing(t *testing.T) {
	srv := newTestServer(t, ClaudeCodeInfo{})
	dir := t.TempDir()
	require.NoError(t, os.WriteFile(filepath.Join(dir, "TODO.md"), []byte("x"), 0o644))
	sess := seedLiveSessionInDir(t, srv, dir)

	httpSrv := httptest.NewServer(srv.Handler())
	t.Cleanup(httpSrv.Close)
	wsURL := "ws" + httpSrv.URL[len("http"):] + "/ws"
	c, err := dialWS(t, wsURL, nil)
	require.NoError(t, err)
	defer func() { _ = c.CloseNow() }()
	_ = readJSON[helloWire](t, c)
	_ = readJSON[snapshotWire](t, c)

	rec := getReaderListRequest(t, srv, sess.ID)

	require.Equal(t, http.StatusOK, rec.Code)
	out := readerListingBody(t, rec)
	assert.Nil(t, out.Plan)
	assert.Equal(t, "walk", out.Listing, "a fresh temp dir is never a git checkout")
	require.Len(t, out.Files, 1)
	assert.Equal(t, "TODO.md", out.Files[0].Path)
	assertNoSessionUpsertArrives(t, c)
}

// TestHandleReaderList_KnownTranscriptResolvesPlanAndBroadcastsBeforeResponding covers
// D9's positive half: a session whose recorded transcript names an existing plan file
// gets that plan in the response and has already broadcast the sessionUpsert carrying
// it by the time the response is written.
func TestHandleReaderList_KnownTranscriptResolvesPlanAndBroadcastsBeforeResponding(t *testing.T) {
	srv := newTestServer(t, ClaudeCodeInfo{})
	dir := t.TempDir()
	sess := seedLiveSessionInDir(t, srv, dir)
	_, err := srv.manager.Apply(context.Background(), sess.ID, "claude-1", nil, claudecode.StateInput{Kind: claudecode.KindBind}, true)
	require.NoError(t, err)

	planDir := t.TempDir()
	planPath := filepath.Join(planDir, "happy-otter.md")
	require.NoError(t, os.WriteFile(planPath, []byte("# Plan"), 0o644))
	transcriptPath := filepath.Join(t.TempDir(), "transcript.jsonl")
	require.NoError(t, os.WriteFile(transcriptPath,
		[]byte(claudecodetest.PlanAttachmentLine("plan_mode", planPath, true)+"\n"), 0o644))
	_, err = srv.manager.SetTranscript(context.Background(), sess.ID, "claude-1", transcriptPath)
	require.NoError(t, err)

	httpSrv := httptest.NewServer(srv.Handler())
	t.Cleanup(httpSrv.Close)
	wsURL := "ws" + httpSrv.URL[len("http"):] + "/ws"
	c, err := dialWS(t, wsURL, nil)
	require.NoError(t, err)
	defer func() { _ = c.CloseNow() }()
	_ = readJSON[helloWire](t, c)
	_ = readJSON[snapshotWire](t, c)

	// handleReaderList's own contract (kb:anchor/sessions.reader) is that the scan's
	// sessionUpsert is broadcast before this response is written — so by the time the GET
	// below returns, the message is already queued for this connection; no goroutine is
	// needed to race it.
	rec := getReaderListRequest(t, srv, sess.ID)
	require.Equal(t, http.StatusOK, rec.Code)
	out := readerListingBody(t, rec)
	require.NotNil(t, out.Plan)
	assert.Equal(t, planPath, out.Plan.Path)
	assert.True(t, out.Plan.Exists)

	msg := readJSON[sessionUpsertMessage](t, c)
	assert.Equal(t, "sessionUpsert", msg.Type)
	require.NotNil(t, msg.Session.Plan)
	assert.Equal(t, planPath, msg.Session.Plan.Path)
	assert.True(t, msg.Session.Plan.Exists)
}

// TestScanPlan_StickyOnceNamed covers REQ-8/D7 (kb:adr/reader-plan-sticky-once-named):
// once a session has a plan, a scan that finds nothing must never clear it, and must
// re-derive exists by stat against whichever path is in play; a scan that finds a plan
// always replaces. The table crosses every starting retention state — none yet, a
// retained plan whose file is still on disk, a retained plan whose file has since been
// deleted — against every scan outcome a real transcript can produce, so the invariant
// is checked from every reachable source state rather than only the transition that
// motivated the fix. It also covers D2/D3/D5's broadcast half: each row dials its own WS
// client after setup and computes "changed" from the session's actual pre-scan state
// (read fresh via Get, not from setup's returned retainedPath/retainedExists — those name
// what a scan finding nothing must leave in place, which for the "file since deleted"
// row differs from the session's actual stored exists until a scan re-derives it), then
// asserts a sessionUpsert carrying the final plan arrives exactly once when changed
// (D2/D3), and none at all when the scan reproduced what was already committed (D5).
func TestScanPlan_StickyOnceNamed(t *testing.T) {
	const claudeID = "scan-plan-claude"

	newBoundSession := func(t *testing.T) (*testServer, *session.Session) {
		t.Helper()
		srv := newTestServer(t, ClaudeCodeInfo{})
		sess := seedLiveSessionInDir(t, srv, t.TempDir())
		_, err := srv.manager.Apply(context.Background(), sess.ID, claudeID, nil, claudecode.StateInput{Kind: claudecode.KindBind}, true)
		require.NoError(t, err)
		return srv, sess
	}

	retentionStates := []struct {
		name string
		// setup optionally establishes a retained plan before the scan under test, and
		// reports the path/exists a scan finding nothing must leave in place.
		setup func(t *testing.T, srv *testServer, sess *session.Session) (retainedPath string, retainedExists bool)
	}{
		{
			name: "no plan retained yet",
			setup: func(_ *testing.T, _ *testServer, _ *session.Session) (string, bool) {
				return "", false
			},
		},
		{
			name: "plan retained, its file still on disk",
			setup: func(t *testing.T, srv *testServer, sess *session.Session) (string, bool) {
				p := filepath.Join(t.TempDir(), "retained.md")
				require.NoError(t, os.WriteFile(p, []byte("# Retained"), 0o644))
				_, _, err := srv.manager.SetPlan(context.Background(), sess.ID, claudeID, p, true)
				require.NoError(t, err)
				return p, true
			},
		},
		{
			name: "plan retained, its file since deleted",
			setup: func(t *testing.T, srv *testServer, sess *session.Session) (string, bool) {
				p := filepath.Join(t.TempDir(), "retained.md")
				require.NoError(t, os.WriteFile(p, []byte("# Retained"), 0o644))
				_, _, err := srv.manager.SetPlan(context.Background(), sess.ID, claudeID, p, true)
				require.NoError(t, err)
				require.NoError(t, os.Remove(p))
				return p, false
			},
		},
	}

	scanOutcomes := []struct {
		name string
		// build returns the transcript to scan, and what that scan finds: foundPath ==
		// "" means the scan finds nothing (LocatePlanFile's zero PlanFile, whether from a
		// missing transcript or one with no plan markers).
		build func(t *testing.T) (transcriptPath, foundPath string, foundExists bool)
	}{
		{
			name: "transcript file does not exist",
			build: func(t *testing.T) (string, string, bool) {
				return filepath.Join(t.TempDir(), "missing.jsonl"), "", false
			},
		},
		{
			name: "transcript exists but names no plan",
			build: func(t *testing.T) (string, string, bool) {
				p := filepath.Join(t.TempDir(), "transcript.jsonl")
				require.NoError(t, os.WriteFile(p, []byte(claudecodetest.RawSessionEnd(claudeID, "other")+"\n"), 0o644))
				return p, "", false
			},
		},
		{
			name: "transcript names a plan whose file exists",
			build: func(t *testing.T) (string, string, bool) {
				planPath := filepath.Join(t.TempDir(), "found.md")
				require.NoError(t, os.WriteFile(planPath, []byte("# Found"), 0o644))
				p := filepath.Join(t.TempDir(), "transcript.jsonl")
				require.NoError(t, os.WriteFile(p, []byte(claudecodetest.PlanAttachmentLine("plan_mode", planPath, true)+"\n"), 0o644))
				return p, planPath, true
			},
		},
		{
			name: "transcript names a plan not yet written",
			build: func(t *testing.T) (string, string, bool) {
				planPath := filepath.Join(t.TempDir(), "not-written.md")
				p := filepath.Join(t.TempDir(), "transcript.jsonl")
				require.NoError(t, os.WriteFile(p, []byte(claudecodetest.PlanAttachmentLine("plan_mode", planPath, true)+"\n"), 0o644))
				return p, planPath, false
			},
		},
	}

	for _, rs := range retentionStates {
		for _, so := range scanOutcomes {
			t.Run(rs.name+"/"+so.name, func(t *testing.T) {
				srv, sess := newBoundSession(t)
				retainedPath, retainedExists := rs.setup(t, srv, sess)
				transcriptPath, foundPath, foundExists := so.build(t)

				before, ok := srv.manager.Get(sess.ID)
				require.True(t, ok)

				httpSrv := httptest.NewServer(srv.Handler())
				t.Cleanup(httpSrv.Close)
				wsURL := "ws" + httpSrv.URL[len("http"):] + "/ws"
				c, err := dialWS(t, wsURL, nil)
				require.NoError(t, err)
				defer func() { _ = c.CloseNow() }()
				_ = readJSON[helloWire](t, c)
				_ = readJSON[snapshotWire](t, c)

				srv.reader.scanPlan(context.Background(), sess.ID, claudeID, transcriptPath)

				got, ok := srv.manager.Get(sess.ID)
				require.True(t, ok)

				wantPath, wantExists := retainedPath, retainedExists
				if foundPath != "" {
					wantPath, wantExists = foundPath, foundExists
				}
				assert.Equal(t, wantPath, got.PlanPath,
					"REQ-8: the found plan replaces, else the retained path must survive a scan that finds nothing")
				assert.Equal(t, wantExists, got.PlanExists,
					"exists must be re-derived by stat against whichever path is in play")

				if wantPath != before.PlanPath || wantExists != before.PlanExists {
					msg := readJSON[sessionUpsertMessage](t, c)
					assert.Equal(t, "sessionUpsert", msg.Type)
					if wantPath == "" {
						assert.Nil(t, msg.Session.Plan, "D5: plan:null must be null on the wire")
					} else {
						require.NotNil(t, msg.Session.Plan, "D2/D3: the broadcast must carry the committed plan")
						assert.Equal(t, wantPath, msg.Session.Plan.Path)
						assert.Equal(t, wantExists, msg.Session.Plan.Exists)
					}
					assertNoSessionUpsertArrives(t, c) // D2's "broadcast once": exactly one, not a second
				} else {
					assertNoSessionUpsertArrives(t, c) // D5: a scan reproducing what was already committed broadcasts nothing
				}
			})
		}
	}
}

// TestScanPlan_PlanlessScanOfOneSessionLeavesAnotherSessionsPlanUntouched covers
// D6/edge case 10: a planless scan against one session must never read or write another
// session's retained plan, and must broadcast nothing for it.
func TestScanPlan_PlanlessScanOfOneSessionLeavesAnotherSessionsPlanUntouched(t *testing.T) {
	srv := newTestServer(t, ClaudeCodeInfo{})

	const claudeA = "two-session-scan-a"
	const claudeB = "two-session-scan-b"
	sessA := seedLiveSessionInDir(t, srv, t.TempDir())
	_, err := srv.manager.Apply(context.Background(), sessA.ID, claudeA, nil, claudecode.StateInput{Kind: claudecode.KindBind}, true)
	require.NoError(t, err)
	sessB := seedLiveSessionInDir(t, srv, t.TempDir())
	_, err = srv.manager.Apply(context.Background(), sessB.ID, claudeB, nil, claudecode.StateInput{Kind: claudecode.KindBind}, true)
	require.NoError(t, err)

	planA := filepath.Join(t.TempDir(), "plan-a.md")
	require.NoError(t, os.WriteFile(planA, []byte("# A"), 0o644))
	_, _, err = srv.manager.SetPlan(context.Background(), sessA.ID, claudeA, planA, true)
	require.NoError(t, err)

	planB := filepath.Join(t.TempDir(), "plan-b.md")
	require.NoError(t, os.WriteFile(planB, []byte("# B"), 0o644))
	_, _, err = srv.manager.SetPlan(context.Background(), sessB.ID, claudeB, planB, true)
	require.NoError(t, err)

	// A planless transcript (names no plan) scanned against A only.
	transcriptA := filepath.Join(t.TempDir(), "transcript.jsonl")
	require.NoError(t, os.WriteFile(transcriptA, []byte(claudecodetest.RawSessionEnd(claudeA, "other")+"\n"), 0o644))

	httpSrv := httptest.NewServer(srv.Handler())
	t.Cleanup(httpSrv.Close)
	wsURL := "ws" + httpSrv.URL[len("http"):] + "/ws"
	c, err := dialWS(t, wsURL, nil)
	require.NoError(t, err)
	defer func() { _ = c.CloseNow() }()
	_ = readJSON[helloWire](t, c)
	_ = readJSON[snapshotWire](t, c)

	srv.reader.scanPlan(context.Background(), sessA.ID, claudeA, transcriptA)

	gotB, ok := srv.manager.Get(sessB.ID)
	require.True(t, ok)
	assert.Equal(t, planB, gotB.PlanPath, "D6: a planless scan of A must never touch B's retained plan")
	assert.True(t, gotB.PlanExists)

	gotA, ok := srv.manager.Get(sessA.ID)
	require.True(t, ok)
	assert.Equal(t, planA, gotA.PlanPath, "A's own retained plan must survive a scan finding nothing")
	assert.True(t, gotA.PlanExists)

	// Neither session's plan actually changed (A retained what it already had, B was
	// never touched), so no sessionUpsert for either fires.
	assertNoSessionUpsertArrives(t, c)
}

// TestHandleReaderList_WrittenAtNonNullOnlyForARecordedWrite covers D19: writtenAt is
// non-null exactly for a path a routed write has recorded, and null for every other
// listed file.
func TestHandleReaderList_WrittenAtNonNullOnlyForARecordedWrite(t *testing.T) {
	srv := newTestServer(t, ClaudeCodeInfo{})
	dir := t.TempDir()
	require.NoError(t, os.WriteFile(filepath.Join(dir, "a.md"), []byte("x"), 0o644))
	require.NoError(t, os.WriteFile(filepath.Join(dir, "b.md"), []byte("x"), 0o644))
	sess := seedLiveSessionInDir(t, srv, dir)
	_, err := srv.manager.Apply(context.Background(), sess.ID, "claude-1", nil, claudecode.StateInput{Kind: claudecode.KindBind}, true)
	require.NoError(t, err)

	srv.reader.Observe(context.Background(), sess.ID, "claude-1", claudecode.FileSignal{WrittenPath: filepath.Join(dir, "a.md")})

	rec := getReaderListRequest(t, srv, sess.ID)
	require.Equal(t, http.StatusOK, rec.Code)
	out := readerListingBody(t, rec)

	byPath := map[string]readerFileWire{}
	for _, f := range out.Files {
		byPath[f.Path] = f
	}
	require.Contains(t, byPath, "a.md")
	require.Contains(t, byPath, "b.md")
	assert.NotNil(t, byPath["a.md"].WrittenAt)
	assert.Nil(t, byPath["b.md"].WrittenAt)
}

// TestHandleReaderFile_ServesExactBytesAsMarkdown covers D10.
func TestHandleReaderFile_ServesExactBytesAsMarkdown(t *testing.T) {
	srv := newTestServer(t, ClaudeCodeInfo{})
	dir := t.TempDir()
	content := "# Title\n\nSome *body* text.\n"
	require.NoError(t, os.WriteFile(filepath.Join(dir, "a.md"), []byte(content), 0o644))
	sess := seedLiveSessionInDir(t, srv, dir)

	rec := getReaderFileRequest(t, srv, sess.ID, filepath.Join(dir, "a.md"))

	require.Equal(t, http.StatusOK, rec.Code)
	assert.Equal(t, "text/markdown; charset=utf-8", rec.Header().Get("Content-Type"))
	assert.Equal(t, "no-store", rec.Header().Get("Cache-Control"))
	assert.Equal(t, content, rec.Body.String())
}

// TestHandleReaderFile_MissingOrRelativePathIs400 covers the invalid_request clause.
func TestHandleReaderFile_MissingOrRelativePathIs400(t *testing.T) {
	srv := newTestServer(t, ClaudeCodeInfo{})
	dir := t.TempDir()
	sess := seedLiveSessionInDir(t, srv, dir)

	tests := []struct {
		name string
		path string
	}{
		{"no path query at all", ""},
		{"a relative path", "relative/a.md"},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			rec := getReaderFileRequest(t, srv, sess.ID, tt.path)
			assert.Equal(t, http.StatusBadRequest, rec.Code)
			assert.Equal(t, "invalid_request", decodeErrorCode(t, rec))
		})
	}
}

// TestHandleReaderFile_OutsideConfinementIs404NotFound covers D11 at the HTTP layer:
// every disallowed shape returns 404 not_found, indistinguishable from a missing file,
// while the plan path outside the directory still serves 200 (INV-2's positive half).
func TestHandleReaderFile_OutsideConfinementIs404NotFound(t *testing.T) {
	srv := newTestServer(t, ClaudeCodeInfo{})
	dir := t.TempDir()
	require.NoError(t, os.WriteFile(filepath.Join(dir, "notes.txt"), []byte("x"), 0o644))
	require.NoError(t, os.Mkdir(filepath.Join(dir, "adir.md"), 0o755)) // a directory named with a .md suffix

	outside := t.TempDir()
	outsideFile := filepath.Join(outside, "secret.md")
	require.NoError(t, os.WriteFile(outsideFile, []byte("secret"), 0o644))
	require.NoError(t, os.Symlink(outsideFile, filepath.Join(dir, "link.md")))

	planDir := t.TempDir()
	planPath := filepath.Join(planDir, "plan.md")
	require.NoError(t, os.WriteFile(planPath, []byte("# Plan"), 0o644))
	agentSibling := filepath.Join(planDir, "plan-agent-helper.md")
	require.NoError(t, os.WriteFile(agentSibling, []byte("x"), 0o644))

	sess := seedLiveSessionInDir(t, srv, dir)
	_, _, err := srv.manager.SetPlan(context.Background(), sess.ID, "", planPath, true)
	require.NoError(t, err)

	notFoundCases := []struct {
		name string
		path string
	}{
		{"`..` traversal", filepath.Join(dir, "..", filepath.Base(outside), "secret.md")},
		{"a symlink inside dir targeting outside", filepath.Join(dir, "link.md")},
		{"a non-.md file under dir", filepath.Join(dir, "notes.txt")},
		{"a directory whose name ends in .md", filepath.Join(dir, "adir.md")},
		{"the plan's -agent- sibling, outside dir", agentSibling},
	}
	for _, tt := range notFoundCases {
		t.Run(tt.name, func(t *testing.T) {
			rec := getReaderFileRequest(t, srv, sess.ID, tt.path)
			assert.Equal(t, http.StatusNotFound, rec.Code)
			assert.Equal(t, "not_found", decodeErrorCode(t, rec))
		})
	}

	t.Run("the plan path outside dir still serves 200", func(t *testing.T) {
		rec := getReaderFileRequest(t, srv, sess.ID, planPath)
		assert.Equal(t, http.StatusOK, rec.Code)
		assert.Equal(t, "# Plan", rec.Body.String())
	})
}

// TestHandleReaderFile_SizeCap covers D12: exactly 10 MiB serves 200, one byte over is
// 413 too_large.
func TestHandleReaderFile_SizeCap(t *testing.T) {
	srv := newTestServer(t, ClaudeCodeInfo{})
	dir := t.TempDir()
	sess := seedLiveSessionInDir(t, srv, dir)

	exact := bytes.Repeat([]byte("a"), maxReaderFileBytes)
	require.NoError(t, os.WriteFile(filepath.Join(dir, "exact.md"), exact, 0o644))
	over := bytes.Repeat([]byte("a"), maxReaderFileBytes+1)
	require.NoError(t, os.WriteFile(filepath.Join(dir, "over.md"), over, 0o644))

	rec := getReaderFileRequest(t, srv, sess.ID, filepath.Join(dir, "exact.md"))
	assert.Equal(t, http.StatusOK, rec.Code)

	rec = getReaderFileRequest(t, srv, sess.ID, filepath.Join(dir, "over.md"))
	assert.Equal(t, http.StatusRequestEntityTooLarge, rec.Code)
	assert.Equal(t, "too_large", decodeErrorCode(t, rec))
}

// ---- readerFeature.Observe wiring: docChanged, plan-exists-before-docChanged (D13), subagent (D16), stragglers (D20) ----

// TestReaderObserve_RoutedWriteToPlanPathFlipsExistsBeforeDocChanged covers D13: a
// routed write naming the plan path, when plan.exists was false, must broadcast the
// sessionUpsert carrying exists:true strictly before the docChanged for that path.
func TestReaderObserve_RoutedWriteToPlanPathFlipsExistsBeforeDocChanged(t *testing.T) {
	srv := newTestServer(t, ClaudeCodeInfo{})
	dir := t.TempDir()
	sess := seedLiveSessionInDir(t, srv, dir)
	_, err := srv.manager.Apply(context.Background(), sess.ID, "claude-1", nil, claudecode.StateInput{Kind: claudecode.KindBind}, true)
	require.NoError(t, err)
	planPath := filepath.Join(t.TempDir(), "plan.md")
	_, _, err = srv.manager.SetPlan(context.Background(), sess.ID, "claude-1", planPath, false)
	require.NoError(t, err)

	httpSrv := httptest.NewServer(srv.Handler())
	t.Cleanup(httpSrv.Close)
	wsURL := "ws" + httpSrv.URL[len("http"):] + "/ws"
	c, err := dialWS(t, wsURL, nil)
	require.NoError(t, err)
	defer func() { _ = c.CloseNow() }()
	_ = readJSON[helloWire](t, c)
	_ = readJSON[snapshotWire](t, c)

	srv.reader.Observe(context.Background(), sess.ID, "claude-1", claudecode.FileSignal{WrittenPath: planPath})

	first := readJSON[sessionUpsertMessage](t, c)
	assert.Equal(t, "sessionUpsert", first.Type)
	require.NotNil(t, first.Session.Plan)
	assert.True(t, first.Session.Plan.Exists, "D13: the exists:true upsert must precede docChanged")

	second := readJSON[docChangedMessage](t, c)
	assert.Equal(t, "docChanged", second.Type)
	assert.Equal(t, sess.ID, second.ID)
	assert.Equal(t, planPath, second.Path)
}

// TestReaderObserve_RoutedWriteToOrdinaryMarkdownBroadcastsDocChangedOnly covers D13's
// other positive clause: a write under the directory naming a .md file broadcasts
// exactly one docChanged and no sessionUpsert (there is no plan to flip).
func TestReaderObserve_RoutedWriteToOrdinaryMarkdownBroadcastsDocChangedOnly(t *testing.T) {
	srv := newTestServer(t, ClaudeCodeInfo{})
	dir := t.TempDir()
	require.NoError(t, os.WriteFile(filepath.Join(dir, "TODO.md"), []byte("x"), 0o644))
	sess := seedLiveSessionInDir(t, srv, dir)
	_, err := srv.manager.Apply(context.Background(), sess.ID, "claude-1", nil, claudecode.StateInput{Kind: claudecode.KindBind}, true)
	require.NoError(t, err)

	httpSrv := httptest.NewServer(srv.Handler())
	t.Cleanup(httpSrv.Close)
	wsURL := "ws" + httpSrv.URL[len("http"):] + "/ws"
	c, err := dialWS(t, wsURL, nil)
	require.NoError(t, err)
	defer func() { _ = c.CloseNow() }()
	_ = readJSON[helloWire](t, c)
	_ = readJSON[snapshotWire](t, c)

	written := filepath.Join(dir, "TODO.md")
	srv.reader.Observe(context.Background(), sess.ID, "claude-1", claudecode.FileSignal{WrittenPath: written})

	msg := readJSON[docChangedMessage](t, c)
	assert.Equal(t, "docChanged", msg.Type)
	assert.Equal(t, written, msg.Path)
}

// TestReaderObserve_WriteToNonMarkdownNonPlanPathBroadcastsNothing covers D13's negative
// clause.
func TestReaderObserve_WriteToNonMarkdownNonPlanPathBroadcastsNothing(t *testing.T) {
	srv := newTestServer(t, ClaudeCodeInfo{})
	dir := t.TempDir()
	sess := seedLiveSessionInDir(t, srv, dir)
	_, err := srv.manager.Apply(context.Background(), sess.ID, "claude-1", nil, claudecode.StateInput{Kind: claudecode.KindBind}, true)
	require.NoError(t, err)

	httpSrv := httptest.NewServer(srv.Handler())
	t.Cleanup(httpSrv.Close)
	wsURL := "ws" + httpSrv.URL[len("http"):] + "/ws"
	c, err := dialWS(t, wsURL, nil)
	require.NoError(t, err)
	defer func() { _ = c.CloseNow() }()
	_ = readJSON[helloWire](t, c)
	_ = readJSON[snapshotWire](t, c)

	srv.reader.Observe(context.Background(), sess.ID, "claude-1", claudecode.FileSignal{WrittenPath: filepath.Join(dir, "notes.txt")})

	assertNoSessionUpsertArrives(t, c)
}

// TestIngestRouting_SubagentMarkedWriteBroadcastsDocChanged covers D16 end to end
// through the real ingest pipeline: a subagent-marked PostToolUse Write under the
// directory must still fire docChanged.
func TestIngestRouting_SubagentMarkedWriteBroadcastsDocChanged(t *testing.T) {
	srv := newTestServer(t, ClaudeCodeInfo{})
	srv.Start()
	t.Cleanup(func() { srv.Shutdown(context.Background()) })
	dir := t.TempDir()
	sess := seedLiveSessionInDir(t, srv, dir)

	httpSrv := httptest.NewServer(srv.Handler())
	t.Cleanup(httpSrv.Close)
	wsURL := "ws" + httpSrv.URL[len("http"):] + "/ws"
	c, err := dialWS(t, wsURL, nil)
	require.NoError(t, err)
	defer func() { _ = c.CloseNow() }()
	_ = readJSON[helloWire](t, c)
	_ = readJSON[snapshotWire](t, c)

	const claudeID = "subagent-writer"
	bindRec := postIngest(t, srv, "/ingest/"+testIngestToken+"/hook",
		claudecodetest.EnvelopedSessionStart(claudeID, claudecodetest.SessionStartOpts{MusterSession: int(sess.ID), TmuxPane: "%1"}))
	require.Equal(t, 200, bindRec.Code)
	_ = readJSON[sessionUpsertMessage](t, c) // the bind itself upserts

	written := filepath.Join(dir, "SUBAGENT.md")
	body := claudecodetest.RawPostToolUseFile(claudeID, "Write", written, claudecodetest.ToolFileOpts{AgentID: "agent-1"})
	rec := postIngest(t, srv, "/ingest/"+testIngestToken+"/hook", body)
	require.Equal(t, 200, rec.Code)

	// The PostToolUse also drives its own state transition (started -> working), which
	// broadcasts its own sessionUpsert ahead of the reader's docChanged — read past it
	// rather than assume an exact position.
	msg := readUntilDocChanged(t, c)
	assert.Equal(t, written, msg.Path)
}

// readUntilDocChanged reads WS messages until a docChanged arrives, tolerating any
// number of interleaved sessionUpsert broadcasts (a routed hook's own state transition
// broadcasts independently of the reader's docChanged).
func readUntilDocChanged(t *testing.T, c *websocket.Conn) docChangedMessage {
	t.Helper()
	for range 10 {
		ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
		_, data, err := c.Read(ctx)
		cancel()
		require.NoError(t, err)
		var probe struct {
			Type string `json:"type"`
		}
		require.NoError(t, json.Unmarshal(data, &probe))
		if probe.Type == "docChanged" {
			var msg docChangedMessage
			require.NoError(t, json.Unmarshal(data, &msg))
			return msg
		}
	}
	t.Fatal("no docChanged arrived within 10 messages")
	return docChangedMessage{}
}

// TestIngestRouting_UnroutedWriteBroadcastsNothing covers D13's "an unrouted one
// broadcasts nothing" clause: a hook for a claude session id with no Muster binding at
// all never reaches the reader (ingest.go only calls files.Observe for a routed event).
func TestIngestRouting_UnroutedWriteBroadcastsNothing(t *testing.T) {
	srv := newTestServer(t, ClaudeCodeInfo{})
	srv.Start()
	t.Cleanup(func() { srv.Shutdown(context.Background()) })

	httpSrv := httptest.NewServer(srv.Handler())
	t.Cleanup(httpSrv.Close)
	wsURL := "ws" + httpSrv.URL[len("http"):] + "/ws"
	c, err := dialWS(t, wsURL, nil)
	require.NoError(t, err)
	defer func() { _ = c.CloseNow() }()
	_ = readJSON[helloWire](t, c)
	_ = readJSON[snapshotWire](t, c)

	const claudeID = "never-bound-writer"
	body := claudecodetest.RawPostToolUseFile(claudeID, "Write", "/tmp/whatever/TODO.md", claudecodetest.ToolFileOpts{})
	rec := postIngest(t, srv, "/ingest/"+testIngestToken+"/hook", body)
	require.Equal(t, 200, rec.Code)

	// REQ-3/REQ-14: Drain, not a fixed-duration Eventually — it returns once the post
	// above has been fully processed (through Observe), so the persistence check below
	// is a direct assertion, not a poll.
	drainCtx, drainCancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer drainCancel()
	require.NoError(t, srv.ingest.queue.Drain(drainCtx), "the post must at least persist before we can conclude nothing else happened")
	assert.Equal(t, 1, countEventsForSession(t, srv, claudeID))

	assertNoSessionUpsertArrives(t, c)
}

// TestIngestRouting_StragglerFromBeforeAClearNeverMovesTranscriptOrPlan covers D20/INV-8:
// after a /clear rebinds the session from Claude id A to B, a reordered hook still
// naming A — for a SessionEnd, a PostToolUse Write and a PreToolUse ExitPlanMode — must
// never move transcript_file or plan away from what B already established, though the
// write itself is still recorded (REQ-26's "the write was real").
func TestIngestRouting_StragglerFromBeforeAClearNeverMovesTranscriptOrPlan(t *testing.T) {
	srv := newTestServer(t, ClaudeCodeInfo{})
	srv.Start()
	t.Cleanup(func() { srv.Shutdown(context.Background()) })
	dir := t.TempDir()
	sess := seedLiveSessionInDir(t, srv, dir)

	const claudeA = "straggler-claude-a"
	const claudeB = "straggler-claude-b"
	transcriptA := "/tmp/transcript-a.jsonl"
	transcriptB := "/tmp/transcript-b.jsonl"

	// REQ-3/REQ-14: every wait below on the ingest worker having processed a post is
	// Drain, not a fixed-duration require.Eventually — it returns once every event
	// enqueued before the call has been fully processed (through Observe, the reader's
	// write record), so the assertions that follow are direct, not polled.
	drain := func() {
		t.Helper()
		ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
		defer cancel()
		require.NoError(t, srv.ingest.queue.Drain(ctx))
	}

	// Bind to A, then /clear-rebind to B: SessionEnd(A, reason:"clear") then
	// SessionStart(B, source:"clear") — kb:fact/clear-mints-new-session-id's own
	// sequence, both enveloped (with the seeded pane, REQ-12) so Apply's rebind logic
	// actually runs.
	bindA := postIngest(t, srv, "/ingest/"+testIngestToken+"/hook",
		claudecodetest.EnvelopedSessionStartTranscript(claudeA, transcriptA, claudecodetest.SessionStartOpts{MusterSession: int(sess.ID), TmuxPane: "%1"}))
	require.Equal(t, 200, bindA.Code)
	drain()
	got, ok := srv.manager.Get(sess.ID)
	require.True(t, ok)
	require.Equal(t, transcriptA, got.TranscriptPath, "A's SessionStart must bind and record its transcript")

	endA := postIngest(t, srv, "/ingest/"+testIngestToken+"/hook",
		claudecodetest.EnvelopedHookBody(int(sess.ID), "%1", "SessionEnd", claudeA))
	require.Equal(t, 200, endA.Code)
	rebindB := postIngest(t, srv, "/ingest/"+testIngestToken+"/hook",
		claudecodetest.EnvelopedSessionStartTranscript(claudeB, transcriptB, claudecodetest.SessionStartOpts{MusterSession: int(sess.ID), Source: "clear", TmuxPane: "%1"}))
	require.Equal(t, 200, rebindB.Code)
	drain()
	got, ok = srv.manager.Get(sess.ID)
	require.True(t, ok)
	require.Equal(t, transcriptB, got.TranscriptPath, "B's SessionStart(clear) must rebind and record its own transcript")
	require.Equal(t, claudeB, got.ClaudeSessionID)

	planB := filepath.Join(t.TempDir(), "plan-b.md")
	_, _, err := srv.manager.SetPlan(context.Background(), sess.ID, claudeB, planB, true)
	require.NoError(t, err)

	// Now three reordered, raw (non-enveloped — REQ-10) hooks arrive naming the old id
	// A, which byClaude still remembers as this session's (monotonic rebind, never
	// backwards): a straggler SessionEnd, a straggler PostToolUse Write naming a
	// different transcript path, and a straggler PreToolUse ExitPlanMode.
	staleWrite := filepath.Join(dir, "stale.md")
	strandedEvents := []string{
		claudecodetest.RawSessionEnd(claudeA, "other"),
		claudecodetest.RawPostToolUseFile(claudeA, "Write", staleWrite, claudecodetest.ToolFileOpts{TranscriptPath: transcriptA}),
		claudecodetest.RawPreToolUseTool(claudeA, "ExitPlanMode", claudecodetest.ToolFileOpts{TranscriptPath: transcriptA}),
	}
	for _, body := range strandedEvents {
		rec := postIngest(t, srv, "/ingest/"+testIngestToken+"/hook", body)
		require.Equal(t, 200, rec.Code)
	}
	drain()
	// 5, not 3: bindA and endA above also persist under claude_session_id=claudeA (event
	// persistence happens regardless of routing), plus the 3 stragglers here. The
	// original require.Eventually(..., 2*time.Second, ...) asserted ==3 and passed only
	// because its polling occasionally caught a transient in-between count while the
	// worker was still processing the stragglers one at a time — a race, not a proof;
	// Drain's determinism is exactly what REQ-3 exists to replace that with.
	assert.Equal(t, 5, countEventsForSession(t, srv, claudeA), "all events under claudeA must persist: bindA, endA and all three stragglers")

	got, ok = srv.manager.Get(sess.ID)
	require.True(t, ok)
	assert.Equal(t, transcriptB, got.TranscriptPath, "a straggler naming A must never move the transcript back")
	assert.Equal(t, planB, got.PlanPath, "a straggler's scan must never move the plan")
	assert.True(t, got.PlanExists)

	// REQ-26: the straggler's written path is still recorded as a write (a docChanged
	// would have fired for it), even though it never touched transcript/plan. drain()
	// above already waited past Observe (which records the write) — the same single
	// worker's pipeline Drain's own doc comment names — so this is a direct read.
	_, ok = srv.reader.writes.get(sess.ID, filepath.Clean(staleWrite))
	assert.True(t, ok, "the stale write must still be recorded — the write itself was real")
}

// TestIngestRouting_SessionStartClearAppliedBeforeLateSessionEndPlanRetained covers
// D4/edge case 3: a /clear pair delivered out of order, SessionStart(B) processed before
// A's SessionEnd arrives late. The rebind's own SessionStart(B) fires its own scan
// (PlanMaybeReady, claudecode.InterpretFiles) against a transcript naming no plan, which
// must retain the pre-clear plan on the strength of D7's retention rule alone — not
// because the SessionEnd happened to come first, since here it does not. The late
// SessionEnd(A) that follows must not move anything further: SessionEnd's event type
// never sets PlanMaybeReady, so it triggers no scan regardless of arrival order, and its
// claudeSessionID no longer names the session's current binding (the straggler gate).
func TestIngestRouting_SessionStartClearAppliedBeforeLateSessionEndPlanRetained(t *testing.T) {
	srv := newTestServer(t, ClaudeCodeInfo{})
	srv.Start()
	t.Cleanup(func() { srv.Shutdown(context.Background()) })
	dir := t.TempDir()
	sess := seedLiveSessionInDir(t, srv, dir)

	const claudeA = "clear-before-late-end-a"
	const claudeB = "clear-before-late-end-b"
	transcriptA := "/tmp/transcript-clear-before-late-end-a.jsonl"
	// transcriptB is written for real (unlike transcriptA, which the rebind's own scan
	// never reaches: A has no plan yet when its SessionStart scan runs, before SetPlan
	// below). A missing file and a planless transcript both dead-end at PlanFile{}, but
	// only a written, content-free transcript is the route a real /clear produces
	// (kb:fact/clear-mints-new-session-id) — the rebind's own scan must exercise that
	// route, not LocatePlanFile's missing-file branch.
	transcriptB := filepath.Join(t.TempDir(), "transcript-clear-before-late-end-b.jsonl")
	require.NoError(t, os.WriteFile(transcriptB, []byte(claudecodetest.RawSessionEnd(claudeB, "other")+"\n"), 0o644))

	drain := func() {
		t.Helper()
		ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
		defer cancel()
		require.NoError(t, srv.ingest.queue.Drain(ctx))
	}

	bindA := postIngest(t, srv, "/ingest/"+testIngestToken+"/hook",
		claudecodetest.EnvelopedSessionStartTranscript(claudeA, transcriptA, claudecodetest.SessionStartOpts{MusterSession: int(sess.ID), TmuxPane: "%1"}))
	require.Equal(t, 200, bindA.Code)
	drain()

	planA := filepath.Join(t.TempDir(), "plan-a.md")
	require.NoError(t, os.WriteFile(planA, []byte("# Plan A"), 0o644))
	_, _, err := srv.manager.SetPlan(context.Background(), sess.ID, claudeA, planA, true)
	require.NoError(t, err)

	// The rebind's own SessionStart(clear) is delivered — and fully processed, including
	// its own scan — before A's SessionEnd, the other half of the pair, arrives at all.
	rebindB := postIngest(t, srv, "/ingest/"+testIngestToken+"/hook",
		claudecodetest.EnvelopedSessionStartTranscript(claudeB, transcriptB, claudecodetest.SessionStartOpts{MusterSession: int(sess.ID), Source: "clear", TmuxPane: "%1"}))
	require.Equal(t, 200, rebindB.Code)
	drain()

	got, ok := srv.manager.Get(sess.ID)
	require.True(t, ok)
	require.Equal(t, claudeB, got.ClaudeSessionID)
	require.Equal(t, transcriptB, got.TranscriptPath)
	assert.Equal(t, planA, got.PlanPath, "D4: the rebind's own scan (transcriptB names no plan) must retain the pre-clear plan")
	assert.True(t, got.PlanExists)

	// A's SessionEnd, the other half of the clear pair, arrives only now — late.
	lateEnd := postIngest(t, srv, "/ingest/"+testIngestToken+"/hook",
		claudecodetest.EnvelopedHookBody(int(sess.ID), "%1", "SessionEnd", claudeA))
	require.Equal(t, 200, lateEnd.Code)
	drain()

	got, ok = srv.manager.Get(sess.ID)
	require.True(t, ok)
	assert.Equal(t, claudeB, got.ClaudeSessionID, "the late SessionEnd must not rebind backwards")
	assert.Equal(t, transcriptB, got.TranscriptPath, "the late SessionEnd must not move the transcript")
	assert.Equal(t, planA, got.PlanPath, "the late SessionEnd triggers no scan and must not move the retained plan")
	assert.True(t, got.PlanExists)
}
