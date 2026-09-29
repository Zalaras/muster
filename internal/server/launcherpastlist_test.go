package server

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"net/url"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"testing"
	"time"

	"github.com/rs/zerolog"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/Zalaras/muster/internal/claudecode/claudecodetest"
)

// fakeAliveLookup is aliveClaudeSessionLookup's test double: a fixed claude-id -> muster-id
// map, so handleListPastSessions' openSessionId marking can be tested without a real
// session.Manager (the "mock the layer below via its consumer-side interface" pattern).
type fakeAliveLookup struct {
	open map[string]int64
}

func (f fakeAliveLookup) AliveByClaudeSessionID(claudeSessionID string) (int64, bool) {
	v, ok := f.open[claudeSessionID]
	return v, ok
}

// listPastSessionsRequest calls handleListPastSessions directly (bypassing mux/guard,
// which TestHandleListPastSessions_RequiresCookie covers separately through the real
// server) — every other test here is about decode/delegate/encode, not routing or auth.
func listPastSessionsRequest(t *testing.T, f *pastSessionsFeature, directory string) *httptest.ResponseRecorder {
	t.Helper()
	req := httptest.NewRequest(http.MethodGet, "/api/past-sessions?directory="+url.QueryEscape(directory), nil)
	rec := httptest.NewRecorder()
	f.handleListPastSessions(rec, req)
	return rec
}

func decodePastSessions(t *testing.T, rec *httptest.ResponseRecorder) pastSessionsResponse {
	t.Helper()
	var out pastSessionsResponse
	require.NoError(t, json.Unmarshal(rec.Body.Bytes(), &out))
	return out
}

// TestHandleListPastSessions_RequiresCookie covers the route's auth wiring through the
// real server — every other test in this file calls the handler directly.
func TestHandleListPastSessions_RequiresCookie(t *testing.T) {
	dir := t.TempDir()
	srv := New(Config{
		Store: openLauncherTestStore(t), Logger: zerolog.Nop(), UIToken: testUIToken, IngestToken: testIngestToken,
		WebDist: t.TempDir(), DaemonVersion: "test-version",
		Launch: LaunchConfig{ProjectsDir: t.TempDir()},
	})

	req := httptest.NewRequest(http.MethodGet, "/api/past-sessions?directory="+url.QueryEscape(dir), nil)
	rec := httptest.NewRecorder()
	srv.Handler().ServeHTTP(rec, req)

	assert.Equal(t, http.StatusUnauthorized, rec.Code)
}

func TestHandleListPastSessions_MissingDirectoryIs400(t *testing.T) {
	f := newPastSessionsFeature(t.TempDir(), fakeAliveLookup{}, zerolog.Nop())

	req := httptest.NewRequest(http.MethodGet, "/api/past-sessions", nil)
	rec := httptest.NewRecorder()
	f.handleListPastSessions(rec, req)

	assert.Equal(t, http.StatusBadRequest, rec.Code)
	assert.Equal(t, "invalid_request", decodeErrorCode(t, rec))
}

func TestHandleListPastSessions_RelativeDirectoryIs400(t *testing.T) {
	f := newPastSessionsFeature(t.TempDir(), fakeAliveLookup{}, zerolog.Nop())

	rec := listPastSessionsRequest(t, f, "relative/dir")

	assert.Equal(t, http.StatusBadRequest, rec.Code)
	assert.Equal(t, "invalid_request", decodeErrorCode(t, rec))
}

func TestHandleListPastSessions_NonexistentDirectoryIs404(t *testing.T) {
	f := newPastSessionsFeature(t.TempDir(), fakeAliveLookup{}, zerolog.Nop())

	rec := listPastSessionsRequest(t, f, "/this/does/not/exist/anywhere")

	assert.Equal(t, http.StatusNotFound, rec.Code)
	assert.Equal(t, "not_found", decodeErrorCode(t, rec))
}

// TestHandleListPastSessions_UnreadableProjectsDirYieldsEmptyList covers D8 at the
// handler: a projects "directory" that is actually a file fails open to an empty, 200
// list rather than refusing the request — claudecode.PastSessions itself never returns
// an error for an unreadable root (its own doc comment), so the handler's Warn-log
// branch on that return is unreachable by construction; this test only pins the wire
// behaviour that branch's *dead* code cannot be blamed for if it regressed.
func TestHandleListPastSessions_UnreadableProjectsDirYieldsEmptyList(t *testing.T) {
	dir := t.TempDir()
	notADir := filepath.Join(t.TempDir(), "not-a-dir")
	require.NoError(t, os.WriteFile(notADir, []byte("x"), 0o600))
	f := newPastSessionsFeature(notADir, fakeAliveLookup{}, zerolog.Nop())

	rec := listPastSessionsRequest(t, f, dir)

	require.Equal(t, http.StatusOK, rec.Code)
	out := decodePastSessions(t, rec)
	assert.Empty(t, out.Sessions)
	assert.False(t, out.Truncated)
}

// TestHandleListPastSessions_OrdersNewestFirstAndMarksOpenSessionID covers D16: three
// fixture sessions come back newest lastActiveAt first, and only the one
// aliveClaudeSessionLookup reports open carries a non-nil openSessionId.
func TestHandleListPastSessions_OrdersNewestFirstAndMarksOpenSessionID(t *testing.T) {
	root := t.TempDir()
	dir := t.TempDir()
	cwd := resolvedCwd(t, dir)

	oldest := claudecodetest.WriteTranscript(t, root, dir, "claude-oldest", claudecodetest.CwdLine(cwd))
	middle := claudecodetest.WriteTranscript(t, root, dir, "claude-middle", claudecodetest.CwdLine(cwd))
	newest := claudecodetest.WriteTranscript(t, root, dir, "claude-newest", claudecodetest.CwdLine(cwd))

	base := time.Date(2020, 1, 1, 0, 0, 0, 0, time.UTC)
	require.NoError(t, os.Chtimes(oldest, base, base))
	require.NoError(t, os.Chtimes(middle, base.Add(time.Hour), base.Add(time.Hour)))
	require.NoError(t, os.Chtimes(newest, base.Add(2*time.Hour), base.Add(2*time.Hour)))

	f := newPastSessionsFeature(root, fakeAliveLookup{open: map[string]int64{"claude-middle": 42}}, zerolog.Nop())

	rec := listPastSessionsRequest(t, f, dir)

	require.Equal(t, http.StatusOK, rec.Code)
	out := decodePastSessions(t, rec)
	require.Len(t, out.Sessions, 3)
	assert.Equal(t, []string{"claude-newest", "claude-middle", "claude-oldest"}, []string{
		out.Sessions[0].ClaudeSessionID, out.Sessions[1].ClaudeSessionID, out.Sessions[2].ClaudeSessionID,
	})

	for _, s := range out.Sessions {
		if s.ClaudeSessionID == "claude-middle" {
			require.NotNil(t, s.OpenSessionID)
			assert.Equal(t, int64(42), *s.OpenSessionID)
		} else {
			assert.Nil(t, s.OpenSessionID, "%s must not be marked open", s.ClaudeSessionID)
		}
	}
}

// TestHandleListPastSessions_TruncatesAt200 covers the Protocol Contract's truncated
// rule: more than 200 matching sessions yields only the newest 200 plus truncated:true.
func TestHandleListPastSessions_TruncatesAt200(t *testing.T) {
	root := t.TempDir()
	dir := t.TempDir()
	cwd := resolvedCwd(t, dir)

	base := time.Date(2020, 1, 1, 0, 0, 0, 0, time.UTC)
	const total = 201
	for i := range total {
		id := "claude-" + strconv.Itoa(i)
		path := claudecodetest.WriteTranscript(t, root, dir, id, claudecodetest.CwdLine(cwd))
		mtime := base.Add(time.Duration(i) * time.Minute)
		require.NoError(t, os.Chtimes(path, mtime, mtime))
	}

	f := newPastSessionsFeature(root, fakeAliveLookup{}, zerolog.Nop())

	rec := listPastSessionsRequest(t, f, dir)

	require.Equal(t, http.StatusOK, rec.Code)
	out := decodePastSessions(t, rec)
	assert.Len(t, out.Sessions, maxPastSessions)
	assert.True(t, out.Truncated)
	// The newest 200 of 201, i.e. every one except index 0 (the very oldest), must survive.
	assert.NotEqual(t, "claude-0", out.Sessions[len(out.Sessions)-1].ClaudeSessionID)
}

// TestHandleListPastSessions_LastPromptTruncatedToFirstLineAnd200Chars covers the wire
// lastPrompt rule: first line only, then cut to 200 runes — independent of the raw
// transcript-scan LastPrompt field, which carries the whole line untruncated.
func TestHandleListPastSessions_LastPromptTruncatedToFirstLineAnd200Chars(t *testing.T) {
	root := t.TempDir()
	dir := t.TempDir()
	cwd := resolvedCwd(t, dir)
	longLine := strings.Repeat("x", 250)
	rawPrompt := longLine + "\nsecond line never shown"

	claudecodetest.WriteTranscript(t, root, dir, "claude-1", claudecodetest.CwdLine(cwd), claudecodetest.LastPromptTranscriptLine(rawPrompt))

	f := newPastSessionsFeature(root, fakeAliveLookup{}, zerolog.Nop())

	rec := listPastSessionsRequest(t, f, dir)

	require.Equal(t, http.StatusOK, rec.Code)
	out := decodePastSessions(t, rec)
	require.Len(t, out.Sessions, 1)
	require.NotNil(t, out.Sessions[0].LastPrompt)
	assert.Equal(t, strings.Repeat("x", 200), *out.Sessions[0].LastPrompt)
}

// TestHandleListPastSessions_NullFieldsForAStub covers a session with no title, prompt
// or permission-mode line at all: every optional wire field is null, never an empty
// string standing in for "unknown".
func TestHandleListPastSessions_NullFieldsForAStub(t *testing.T) {
	root := t.TempDir()
	dir := t.TempDir()
	cwd := resolvedCwd(t, dir)
	claudecodetest.WriteTranscript(t, root, dir, "claude-stub", claudecodetest.CwdLine(cwd))

	f := newPastSessionsFeature(root, fakeAliveLookup{}, zerolog.Nop())

	rec := listPastSessionsRequest(t, f, dir)

	require.Equal(t, http.StatusOK, rec.Code)
	out := decodePastSessions(t, rec)
	require.Len(t, out.Sessions, 1)
	s := out.Sessions[0]
	assert.Nil(t, s.Title)
	assert.Nil(t, s.LastPrompt)
	assert.Nil(t, s.PermissionMode)
	assert.Nil(t, s.OpenSessionID)
}

// TestListPastSessions_OrdersCapsMarksOpenAndCutsPrompt calls listPastSessions itself,
// rather than through handleListPastSessions' decode/encode indirection the
// TestHandleListPastSessions_* suite above already covers end to end: the domain
// function's own order, openSessionId marking and wire prompt cut, in one direct call.
func TestListPastSessions_OrdersCapsMarksOpenAndCutsPrompt(t *testing.T) {
	root := t.TempDir()
	dir := t.TempDir()
	cwd := resolvedCwd(t, dir)
	longLine := strings.Repeat("y", 250)

	base := time.Date(2020, 1, 1, 0, 0, 0, 0, time.UTC)
	oldest := claudecodetest.WriteTranscript(t, root, dir, "claude-oldest", claudecodetest.CwdLine(cwd))
	newest := claudecodetest.WriteTranscript(t, root, dir, "claude-newest", claudecodetest.CwdLine(cwd),
		claudecodetest.LastPromptTranscriptLine(longLine+"\nsecond line never shown"))
	require.NoError(t, os.Chtimes(oldest, base, base))
	require.NoError(t, os.Chtimes(newest, base.Add(time.Hour), base.Add(time.Hour)))

	resp, err := listPastSessions(root, dir, fakeAliveLookup{open: map[string]int64{"claude-newest": 7}})

	require.NoError(t, err)
	require.Len(t, resp.Sessions, 2)
	assert.Equal(t, "claude-newest", resp.Sessions[0].ClaudeSessionID, "newest first")
	assert.Equal(t, "claude-oldest", resp.Sessions[1].ClaudeSessionID)
	require.NotNil(t, resp.Sessions[0].OpenSessionID)
	assert.Equal(t, int64(7), *resp.Sessions[0].OpenSessionID)
	assert.Nil(t, resp.Sessions[1].OpenSessionID, "only the row the lookup reports open may carry one")
	require.NotNil(t, resp.Sessions[0].LastPrompt)
	assert.Equal(t, strings.Repeat("y", 200), *resp.Sessions[0].LastPrompt, "first line only, then cut to 200 runes")
	assert.False(t, resp.Truncated)
}

// TestListPastSessions_CapsAtMaxAndSetsTruncated pins the domain function's own cap,
// independent of the handler's encode step TestHandleListPastSessions_TruncatesAt200
// already covers.
func TestListPastSessions_CapsAtMaxAndSetsTruncated(t *testing.T) {
	root := t.TempDir()
	dir := t.TempDir()
	cwd := resolvedCwd(t, dir)
	base := time.Date(2020, 1, 1, 0, 0, 0, 0, time.UTC)
	const total = maxPastSessions + 1
	for i := range total {
		id := "claude-" + strconv.Itoa(i)
		path := claudecodetest.WriteTranscript(t, root, dir, id, claudecodetest.CwdLine(cwd))
		mtime := base.Add(time.Duration(i) * time.Minute)
		require.NoError(t, os.Chtimes(path, mtime, mtime))
	}

	resp, err := listPastSessions(root, dir, fakeAliveLookup{})

	require.NoError(t, err)
	assert.Len(t, resp.Sessions, maxPastSessions)
	assert.True(t, resp.Truncated)
}

// TestHandleListPastSessions_NeverSeenDirectoryIs200EmptyNotFound covers the Protocol
// Contract's "a directory Claude Code has never run in yields {sessions: [], truncated:
// false}" at the wire — distinct from the 404 case, which is for a directory that does
// not exist on disk at all.
func TestHandleListPastSessions_NeverSeenDirectoryIs200EmptyNotFound(t *testing.T) {
	root := t.TempDir()
	dir := t.TempDir() // exists on disk, but PastSessions has no folder for it

	f := newPastSessionsFeature(root, fakeAliveLookup{}, zerolog.Nop())

	rec := listPastSessionsRequest(t, f, dir)

	require.Equal(t, http.StatusOK, rec.Code)
	out := decodePastSessions(t, rec)
	assert.Empty(t, out.Sessions)
	assert.False(t, out.Truncated)
}
