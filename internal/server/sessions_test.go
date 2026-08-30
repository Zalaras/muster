package server

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"os"
	"os/exec"
	"path/filepath"
	"strconv"
	"strings"
	"testing"
	"time"

	"github.com/coder/websocket"
	"github.com/rs/zerolog"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/Zalaras/muster/internal/session"
	"github.com/Zalaras/muster/internal/store"
	"github.com/Zalaras/muster/internal/tmux"
)

func postSessionsRequest(t *testing.T, srv *testServer, body string) *httptest.ResponseRecorder {
	t.Helper()
	req := httptest.NewRequest(http.MethodPost, "/api/sessions", strings.NewReader(body))
	req.AddCookie(&http.Cookie{Name: cookieName, Value: testUIToken})
	rec := httptest.NewRecorder()
	srv.Handler().ServeHTTP(rec, req)
	return rec
}

// sessionActionRequest fires one cookie-authed request at srv's mux and returns the
// recorded response — the shared shape D17/D18's End/Resume/Remove/Pane tests all need.
func sessionActionRequest(t *testing.T, srv *testServer, method, path string) *httptest.ResponseRecorder {
	t.Helper()
	req := httptest.NewRequest(method, path, nil)
	req.AddCookie(&http.Cookie{Name: cookieName, Value: testUIToken})
	rec := httptest.NewRecorder()
	srv.Handler().ServeHTTP(rec, req)
	return rec
}

// seedSessionRow inserts a repo+session row directly via the store (no real tmux/launch
// needed for D17/D18's error-path tests) and loads it into srv's manager so the HTTP
// handlers under test can find it. mutate, if non-nil, edits the freshly-inserted row
// before it's persisted and loaded — e.g. to seed a dead session or one with no
// claudeSessionId.
func seedSessionRow(t *testing.T, srv *testServer, mutate func(*store.SessionRow)) int64 {
	t.Helper()
	ctx := context.Background()
	dir := t.TempDir()
	repo, _, err := srv.store.UpsertRepo(ctx, store.UpsertRepoParams{
		Path: dir, Name: "proj", Model: "sonnet", PermissionMode: "default",
	})
	require.NoError(t, err)
	row, err := srv.store.InsertSession(ctx, store.InsertSessionParams{
		RepoID: repo.ID, Directory: dir, PermissionMode: "default",
	})
	require.NoError(t, err)
	if mutate != nil {
		mutate(&row)
		require.NoError(t, srv.store.UpdateSession(ctx, row))
	}
	require.NoError(t, srv.manager.LoadAll(ctx))
	return row.ID
}

func decodeErrorCode(t *testing.T, rec *httptest.ResponseRecorder) string {
	t.Helper()
	var envelope struct {
		Error struct {
			Code    string `json:"code"`
			Message string `json:"message"`
		} `json:"error"`
	}
	require.NoError(t, json.Unmarshal(rec.Body.Bytes(), &envelope))
	return envelope.Error.Code
}

// TestHandleCreateSession_RequiresCookie covers the auth wiring for the new endpoint.
func TestHandleCreateSession_RequiresCookie(t *testing.T) {
	srv := newTestServer(t, ClaudeCodeInfo{})

	req := httptest.NewRequest(http.MethodPost, "/api/sessions", strings.NewReader(`{}`))
	rec := httptest.NewRecorder()
	srv.Handler().ServeHTTP(rec, req)

	assert.Equal(t, http.StatusUnauthorized, rec.Code)
}

func TestHandleCreateSession_InvalidJSONBodyIs400(t *testing.T) {
	srv := newTestServer(t, ClaudeCodeInfo{})

	rec := postSessionsRequest(t, srv, `not valid json`)

	assert.Equal(t, http.StatusBadRequest, rec.Code)
	assert.Equal(t, "invalid_request", decodeErrorCode(t, rec))
}

// TestHandleCreateSession_ValidationErrors covers the Protocol Contract's "400
// invalid_request also covers" list, exercised through the real HTTP handler (decode
// → delegate → encode); none of these ever reach the store or tmux.
func TestHandleCreateSession_ValidationErrors(t *testing.T) {
	tests := []struct {
		name string
		body string
	}{
		{"missing directory", `{"model":"sonnet","permissionMode":"default"}`},
		{"relative directory", `{"directory":"relative/dir","model":"sonnet","permissionMode":"default"}`},
		{"non-existent directory", `{"directory":"/this/does/not/exist/anywhere","model":"sonnet","permissionMode":"default"}`},
		{"empty model", `{"directory":"` + os.TempDir() + `","model":"","permissionMode":"default"}`},
		{"missing model", `{"directory":"` + os.TempDir() + `","permissionMode":"default"}`},
		{"unknown permissionMode", `{"directory":"` + os.TempDir() + `","model":"sonnet","permissionMode":"bogus"}`},
		{"empty permissionMode", `{"directory":"` + os.TempDir() + `","model":"sonnet","permissionMode":""}`},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			srv := newTestServer(t, ClaudeCodeInfo{})

			rec := postSessionsRequest(t, srv, tt.body)

			assert.Equal(t, http.StatusBadRequest, rec.Code)
			assert.Equal(t, "invalid_request", decodeErrorCode(t, rec))
		})
	}
}

// TestHandleCreateSession_ADirectoryThatIsAFileIs400 covers the "not a directory" half
// of the Protocol Contract's validation clause.
func TestHandleCreateSession_ADirectoryThatIsAFileIs400(t *testing.T) {
	srv := newTestServer(t, ClaudeCodeInfo{})
	file := filepath.Join(t.TempDir(), "not-a-dir.txt")
	require.NoError(t, os.WriteFile(file, []byte("x"), 0o644))

	rec := postSessionsRequest(t, srv, `{"directory":"`+file+`","model":"sonnet","permissionMode":"default"}`)

	assert.Equal(t, http.StatusBadRequest, rec.Code)
	assert.Equal(t, "invalid_request", decodeErrorCode(t, rec))
}

// TestLauncher_CorruptSettingsFileRefusesAndRollsBackTheSessionRow covers D7/Edge Case
// 9's other half and the plan's "on spawn failure: delete the row" rollback rule — a
// corrupt settings.local.json is caught before tmux is ever touched, so this needs no
// tmux socket at all.
func TestLauncher_CorruptSettingsFileRefusesAndRollsBackTheSessionRow(t *testing.T) {
	st := openLauncherTestStore(t)
	mgr := session.NewManager(session.Config{Store: st, Logger: zerolog.Nop()})
	dir := t.TempDir()
	require.NoError(t, os.MkdirAll(filepath.Join(dir, ".claude"), 0o700))
	require.NoError(t, os.WriteFile(filepath.Join(dir, ".claude", "settings.local.json"), []byte(`{not valid json`), 0o600))

	l := &sessionLauncher{
		store: st, manager: mgr, log: zerolog.Nop(), claudeBin: "irrelevant-never-reached",
		hookScript: "/bin/true", statusLineScript: "/bin/true",
	}

	_, lerr := l.Launch(context.Background(), createSessionRequest{
		Directory: dir, Model: "sonnet", PermissionMode: "default",
	})

	require.NotNil(t, lerr)
	assert.Equal(t, http.StatusInternalServerError, lerr.status)
	assert.Equal(t, "launch_failed", lerr.code)
	assert.Contains(t, lerr.message, "settings.local.json", "the error must name the offending file (plan's 500 launch_failed clause)")

	rows, err := st.ListSessions(context.Background())
	require.NoError(t, err)
	assert.Empty(t, rows, "the inserted session row must be rolled back on a later launch-step failure")
}

func openLauncherTestStore(t *testing.T) *store.Store {
	t.Helper()
	st, err := store.Open(context.Background(), filepath.Join(t.TempDir(), "muster.db"))
	require.NoError(t, err)
	t.Cleanup(func() { _ = st.Close() })
	return st
}

// newStubClaudeBin writes an executable script that stands in for `claude`: it writes
// its MUSTER_SESSION pane environment variable to envOutFile (the only reliable way to
// observe what a tmux `new-window -e` actually handed the spawned process — tmux's own
// `show-environment` reflects a separate update-environment table, not the process env
// passed at spawn, confirmed by manual probe), then sleeps so a liveness check would
// see it alive. CLAUDE.md forbids ever launching the real `claude` from a unit test —
// this stub is the sanctioned substitute, mirroring the E2E harness's own stub.
func newStubClaudeBin(t *testing.T, envOutFile string) string {
	t.Helper()
	path := filepath.Join(t.TempDir(), "stub-claude.sh")
	script := "#!/bin/sh\necho \"$MUSTER_SESSION\" > " + envOutFile + "\nsleep 60\n"
	require.NoError(t, os.WriteFile(path, []byte(script), 0o755))
	return path
}

// newTestTmuxClient returns a tmux.Client bound to a private, per-test socket *path* —
// never a bare -L name in tmux's shared socket directory (D12) and never the user's
// default server (CLAUDE.md hard rule).
//
// Deliberately not t.TempDir() directly: that path is rooted under this test's full
// name, and with "/tmux.sock" appended it can overflow AF_UNIX's ~104-byte sun_path
// limit on macOS ("File name too long" from tmux itself) — see internal/tmux/tmux_test.go's
// newTestSocket for the same fix. os.MkdirTemp with a short, fixed prefix keeps the
// whole path well under that limit regardless of the test's name length.
func newTestTmuxClient(t *testing.T) *tmux.Client {
	t.Helper()
	dir, err := os.MkdirTemp("", "muster-server-test-")
	require.NoError(t, err)
	t.Cleanup(func() { _ = os.RemoveAll(dir) })
	socket := filepath.Join(dir, "tmux.sock")
	t.Cleanup(func() {
		_ = exec.Command("tmux", "-S", socket, "kill-server").Run()
	})
	return tmux.New(socket)
}

// TestLauncher_SuccessfulLaunchEndToEnd covers D4/D5/D6/D7/REQ-1/REQ-2 at the
// sessionLauncher level (below the HTTP handler, above tmux/store), complementing the
// E2E suite's browser-driven equivalent (E1): a real tmux window is spawned (on a
// private per-test socket) running a stub binary standing in for `claude`, settings
// are written, and the broadcast fires only once the real tmux target is known.
func TestLauncher_SuccessfulLaunchEndToEnd(t *testing.T) {
	st := openLauncherTestStore(t)
	var upserts []*session.Session
	mgr := session.NewManager(session.Config{
		Store:  st,
		Logger: zerolog.Nop(),
		OnUpsert: func(s *session.Session) {
			upserts = append(upserts, s.Clone())
		},
	})
	tmuxClient := newTestTmuxClient(t)
	dir := t.TempDir()
	envOutFile := filepath.Join(t.TempDir(), "env-output.txt")

	l := &sessionLauncher{
		store: st, manager: mgr, tmux: tmuxClient, log: zerolog.Nop(), claudeBin: newStubClaudeBin(t, envOutFile),
		hookScript: "/bin/true", statusLineScript: "/bin/true",
	}

	sess, lerr := l.Launch(context.Background(), createSessionRequest{
		Directory: dir, Title: "My Session", Model: "sonnet", PermissionMode: "default",
	})
	require.Nil(t, lerr)
	t.Cleanup(func() { _ = tmuxClient.KillWindow(context.Background(), sess.TmuxTarget) })

	assert.Equal(t, session.StateStarted, sess.State)
	assert.NotEmpty(t, sess.TmuxTarget)
	assert.True(t, sess.FirstLaunchHere)

	require.Len(t, upserts, 1, "REQ-2: exactly one broadcast, once the real tmux target is known")
	assert.Equal(t, sess.TmuxTarget, upserts[0].TmuxTarget)

	// D4: the pane environment carries MUSTER_SESSION=<id> — proven by the stub binary
	// itself observing it (see newStubClaudeBin's doc comment for why show-environment
	// can't be used here).
	require.Eventually(t, func() bool {
		b, err := os.ReadFile(envOutFile)
		return err == nil && len(b) > 0
	}, 3*time.Second, 20*time.Millisecond)
	got, err := os.ReadFile(envOutFile)
	require.NoError(t, err)
	assert.Equal(t, strconv.FormatInt(sess.ID, 10)+"\n", string(got))

	settingsPath := filepath.Join(dir, ".claude", "settings.local.json")
	require.FileExists(t, settingsPath)

	// D6: launching a second time into the same directory yields one repo row with
	// launch_count == 2 and updated defaults.
	sess2, lerr2 := l.Launch(context.Background(), createSessionRequest{
		Directory: dir, Model: "opus", PermissionMode: "acceptEdits",
	})
	require.Nil(t, lerr2)
	t.Cleanup(func() { _ = tmuxClient.KillWindow(context.Background(), sess2.TmuxTarget) })
	assert.False(t, sess2.FirstLaunchHere, "the second launch into the same directory is not a first launch")

	repo, err := st.GetRepo(context.Background(), sess2.RepoID)
	require.NoError(t, err)
	assert.Equal(t, sess.RepoID, sess2.RepoID, "one repo row for both launches")
	assert.Equal(t, 2, repo.LaunchCount)
	require.NotNil(t, repo.LastModel)
	assert.Equal(t, "opus", *repo.LastModel)

	// D7: relaunching must merge settings idempotently — the file must still exist and
	// still be valid JSON (a corrupt merge would have failed the launch outright).
	require.FileExists(t, settingsPath)
	b, err := os.ReadFile(settingsPath)
	require.NoError(t, err)
	var doc map[string]any
	require.NoError(t, json.Unmarshal(b, &doc))
}

// TestHandleEndSession_AlreadyDeadSessionIs409NotAlive covers D17's first clause
// (docs/protocol.md §3.7): ending an already-ended session is a conflict, not a 404 or a
// silent success.
func TestHandleEndSession_AlreadyDeadSessionIs409NotAlive(t *testing.T) {
	srv := newTestServer(t, ClaudeCodeInfo{})
	endedAt := time.Now().UTC()
	id := seedSessionRow(t, srv, func(row *store.SessionRow) {
		row.Alive = false
		row.EndedAt = &endedAt
	})

	rec := sessionActionRequest(t, srv, http.MethodPost, fmt.Sprintf("/api/sessions/%d/end", id))

	assert.Equal(t, http.StatusConflict, rec.Code)
	assert.Equal(t, "not_alive", decodeErrorCode(t, rec))
}

func TestHandleEndSession_UnknownSessionIs404(t *testing.T) {
	srv := newTestServer(t, ClaudeCodeInfo{})

	rec := sessionActionRequest(t, srv, http.MethodPost, "/api/sessions/999999/end")

	assert.Equal(t, http.StatusNotFound, rec.Code)
	assert.Equal(t, "unknown_session", decodeErrorCode(t, rec))
}

// TestHandleResumeSession_LiveSessionIs409NotResumable covers D17's second clause
// (docs/protocol.md §3.5): resuming a still-alive session is a conflict.
func TestHandleResumeSession_LiveSessionIs409NotResumable(t *testing.T) {
	srv := newTestServer(t, ClaudeCodeInfo{})
	id := seedSessionRow(t, srv, func(row *store.SessionRow) {
		claudeID := "claude-1"
		row.ClaudeSessionID = &claudeID
		// row.Alive is already true from InsertSession.
	})

	rec := sessionActionRequest(t, srv, http.MethodPost, fmt.Sprintf("/api/sessions/%d/resume", id))

	assert.Equal(t, http.StatusConflict, rec.Code)
	assert.Equal(t, "not_resumable", decodeErrorCode(t, rec))
}

// TestHandleResumeSession_DeadSessionWithoutClaudeIDIs409NotResumable covers D17's third
// clause: a dead session that never got a claude session id bound (e.g. it died before its
// first SessionStart hook ever landed) has nothing to resume.
func TestHandleResumeSession_DeadSessionWithoutClaudeIDIs409NotResumable(t *testing.T) {
	srv := newTestServer(t, ClaudeCodeInfo{})
	endedAt := time.Now().UTC()
	id := seedSessionRow(t, srv, func(row *store.SessionRow) {
		row.Alive = false
		row.EndedAt = &endedAt
		row.ClaudeSessionID = nil
	})

	rec := sessionActionRequest(t, srv, http.MethodPost, fmt.Sprintf("/api/sessions/%d/resume", id))

	assert.Equal(t, http.StatusConflict, rec.Code)
	assert.Equal(t, "not_resumable", decodeErrorCode(t, rec))
}

func TestHandleResumeSession_UnknownSessionIs404(t *testing.T) {
	srv := newTestServer(t, ClaudeCodeInfo{})

	rec := sessionActionRequest(t, srv, http.MethodPost, "/api/sessions/999999/resume")

	assert.Equal(t, http.StatusNotFound, rec.Code)
	assert.Equal(t, "unknown_session", decodeErrorCode(t, rec))
}

// TestHandleRemoveSession_UnknownSessionIs404 covers D17's fourth clause (docs/protocol.md
// §3.8): DELETE against an id nothing knows about is a 404, not a silent 204.
func TestHandleRemoveSession_UnknownSessionIs404(t *testing.T) {
	srv := newTestServer(t, ClaudeCodeInfo{})

	rec := sessionActionRequest(t, srv, http.MethodDelete, "/api/sessions/999999")

	assert.Equal(t, http.StatusNotFound, rec.Code)
	assert.Equal(t, "unknown_session", decodeErrorCode(t, rec))
}

// TestHandleRemoveSession_DeadSessionSucceeds covers the ordinary (non-alive) Remove path
// at the HTTP layer: 204 with no body, and the row is actually gone afterward.
func TestHandleRemoveSession_DeadSessionSucceeds(t *testing.T) {
	srv := newTestServer(t, ClaudeCodeInfo{})
	endedAt := time.Now().UTC()
	id := seedSessionRow(t, srv, func(row *store.SessionRow) {
		row.Alive = false
		row.EndedAt = &endedAt
	})

	rec := sessionActionRequest(t, srv, http.MethodDelete, fmt.Sprintf("/api/sessions/%d", id))

	assert.Equal(t, http.StatusNoContent, rec.Code)
	assert.Empty(t, rec.Body.Bytes())
	_, err := srv.store.GetSession(context.Background(), id)
	assert.Error(t, err, "the row must actually be gone from the store")
}

// TestHandlePaneSnapshot_404BeforeCaptureThen200WithTextAfter covers D18 (docs/protocol.md
// §3.4): no capture yet is 404 no_snapshot; once one lands, GET returns text+capturedAt.
func TestHandlePaneSnapshot_404BeforeCaptureThen200WithTextAfter(t *testing.T) {
	srv := newTestServer(t, ClaudeCodeInfo{})
	id := seedSessionRow(t, srv, nil)

	rec := sessionActionRequest(t, srv, http.MethodGet, fmt.Sprintf("/api/sessions/%d/pane", id))
	assert.Equal(t, http.StatusNotFound, rec.Code)
	assert.Equal(t, "no_snapshot", decodeErrorCode(t, rec))

	capturedAt := time.Now().UTC()
	require.NoError(t, srv.store.UpdateSnapshot(context.Background(), id, "captured pane text", capturedAt))
	require.NoError(t, srv.manager.LoadAll(context.Background()))

	rec2 := sessionActionRequest(t, srv, http.MethodGet, fmt.Sprintf("/api/sessions/%d/pane", id))
	assert.Equal(t, http.StatusOK, rec2.Code)
	var body struct {
		Text       string `json:"text"`
		CapturedAt string `json:"capturedAt"`
	}
	require.NoError(t, json.Unmarshal(rec2.Body.Bytes(), &body))
	assert.Equal(t, "captured pane text", body.Text)
	// D18: capturedAt must be the seeded value, not merely non-empty — a wrong-but-
	// non-empty timestamp must fail this test (review cycle 1 Minor 5). The store
	// truncates to RFC3339 seconds precision on write (session.go's UpdateSnapshot) and
	// the handler formats with the same layout, so exact string equality is sound and
	// deterministic, not a flaky sub-second race.
	assert.Equal(t, capturedAt.Format(time.RFC3339), body.CapturedAt)
}

func TestHandlePaneSnapshot_UnknownSessionIs404UnknownSession(t *testing.T) {
	srv := newTestServer(t, ClaudeCodeInfo{})

	rec := sessionActionRequest(t, srv, http.MethodGet, "/api/sessions/999999/pane")

	assert.Equal(t, http.StatusNotFound, rec.Code)
	assert.Equal(t, "unknown_session", decodeErrorCode(t, rec))
}

// TestSessionActionHandlers_RequireCookie covers the auth wiring shared by all four new
// endpoints — none of them may be reachable without the muster_auth cookie.
func TestSessionActionHandlers_RequireCookie(t *testing.T) {
	tests := []struct {
		name   string
		method string
		path   string
	}{
		{"end", http.MethodPost, "/api/sessions/1/end"},
		{"resume", http.MethodPost, "/api/sessions/1/resume"},
		{"remove", http.MethodDelete, "/api/sessions/1"},
		{"pane", http.MethodGet, "/api/sessions/1/pane"},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			srv := newTestServer(t, ClaudeCodeInfo{})

			req := httptest.NewRequest(tt.method, tt.path, nil)
			rec := httptest.NewRecorder()
			srv.Handler().ServeHTTP(rec, req)

			assert.Equal(t, http.StatusUnauthorized, rec.Code)
		})
	}
}

// putSessionPinRequest issues PUT /api/sessions/{id}/pin with the UI cookie attached
// (plan order-sidebar, mirrors putPrefsRequest/postSessionsRequest for the other write
// endpoints).
func putSessionPinRequest(t *testing.T, srv *testServer, id int64, body string) *httptest.ResponseRecorder {
	t.Helper()
	req := httptest.NewRequest(http.MethodPut, fmt.Sprintf("/api/sessions/%d/pin", id), strings.NewReader(body))
	req.AddCookie(&http.Cookie{Name: cookieName, Value: testUIToken})
	rec := httptest.NewRecorder()
	srv.Handler().ServeHTTP(rec, req)
	return rec
}

// putSessionOrderRequest issues PUT /api/sessions/order with the UI cookie attached.
func putSessionOrderRequest(t *testing.T, srv *testServer, body string) *httptest.ResponseRecorder {
	t.Helper()
	req := httptest.NewRequest(http.MethodPut, "/api/sessions/order", strings.NewReader(body))
	req.AddCookie(&http.Cookie{Name: cookieName, Value: testUIToken})
	rec := httptest.NewRecorder()
	srv.Handler().ServeHTTP(rec, req)
	return rec
}

// TestHandlePinSession_RequiresCookie covers the auth wiring for plan order-sidebar's
// new endpoint.
func TestHandlePinSession_RequiresCookie(t *testing.T) {
	srv := newTestServer(t, ClaudeCodeInfo{})

	req := httptest.NewRequest(http.MethodPut, "/api/sessions/1/pin", strings.NewReader(`{"pinned":true}`))
	rec := httptest.NewRecorder()
	srv.Handler().ServeHTTP(rec, req)

	assert.Equal(t, http.StatusUnauthorized, rec.Code)
}

// TestHandlePinSession_InvalidBodyIs400 covers §3.10's 400 invalid_request clause: body
// not JSON, or pinned missing/not a boolean.
func TestHandlePinSession_InvalidBodyIs400(t *testing.T) {
	tests := []struct {
		name string
		body string
	}{
		{"not JSON", `not valid json`},
		{"pinned missing", `{}`},
		{"pinned is a string, not a boolean", `{"pinned":"true"}`},
		{"pinned is null", `{"pinned":null}`},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			srv := newTestServer(t, ClaudeCodeInfo{})
			id := seedSessionRow(t, srv, nil)

			rec := putSessionPinRequest(t, srv, id, tt.body)

			assert.Equal(t, http.StatusBadRequest, rec.Code)
			assert.Equal(t, "invalid_request", decodeErrorCode(t, rec))
		})
	}
}

func TestHandlePinSession_UnknownSessionIs404(t *testing.T) {
	srv := newTestServer(t, ClaudeCodeInfo{})

	rec := putSessionPinRequest(t, srv, 999999, `{"pinned":true}`)

	assert.Equal(t, http.StatusNotFound, rec.Code)
	assert.Equal(t, "unknown_session", decodeErrorCode(t, rec))
}

// TestHandlePinSession_SuccessIs204AndPersists covers D6 through the real HTTP handler
// (decode -> delegate -> encode): a valid pin request returns 204 with no body and the
// store row reflects the new pinned flag.
func TestHandlePinSession_SuccessIs204AndPersists(t *testing.T) {
	srv := newTestServer(t, ClaudeCodeInfo{})
	id := seedSessionRow(t, srv, nil)

	rec := putSessionPinRequest(t, srv, id, `{"pinned":true}`)

	assert.Equal(t, http.StatusNoContent, rec.Code)
	assert.Empty(t, rec.Body.Bytes())
	row, err := srv.store.GetSession(context.Background(), id)
	require.NoError(t, err)
	assert.True(t, row.Pinned)
}

// TestHandlePinSession_NoOpIs204WithNoBroadcast covers D8 at the HTTP layer: pinning a
// session already in the requested state is still a 204, and no sessionUpsert reaches a
// connected UI socket.
func TestHandlePinSession_NoOpIs204WithNoBroadcast(t *testing.T) {
	srv := newTestServer(t, ClaudeCodeInfo{})
	id := seedSessionRow(t, srv, nil) // freshly seeded rows start pinned:false

	httpSrv := httptest.NewServer(srv.Handler())
	t.Cleanup(httpSrv.Close)
	wsURL := "ws" + httpSrv.URL[len("http"):] + "/ws"
	c, err := dialWS(t, wsURL, nil)
	require.NoError(t, err)
	defer func() { _ = c.CloseNow() }()
	_ = readJSON[helloWire](t, c)
	_ = readJSON[snapshotWire](t, c)

	rec := putSessionPinRequest(t, srv, id, `{"pinned":false}`) // already false

	assert.Equal(t, http.StatusNoContent, rec.Code)
	assertNoSessionUpsertArrives(t, c)
}

// assertNoSessionUpsertArrives mirrors prefs_test.go's assertNoPrefsMessageArrives for
// the sessionUpsert message type (D8/INV-5's no-broadcast half): a short read either
// times out (nothing arrived) or, if something did arrive, it must never be a
// sessionUpsert.
func assertNoSessionUpsertArrives(t *testing.T, c *websocket.Conn) {
	t.Helper()
	ctx, cancel := context.WithTimeout(context.Background(), 300*time.Millisecond)
	defer cancel()
	_, data, err := c.Read(ctx)
	if err != nil {
		return // timeout: nothing arrived, as expected
	}
	var msg struct {
		Type string `json:"type"`
	}
	require.NoError(t, json.Unmarshal(data, &msg))
	assert.NotEqual(t, "sessionUpsert", msg.Type, "no sessionUpsert broadcast was expected for a no-op pin call")
}

// TestSessionOrderAndPinHandlers_RequireCookie extends the shared cookie-check table
// with the two new endpoints.
func TestSessionOrderAndPinHandlers_RequireCookie(t *testing.T) {
	tests := []struct {
		name   string
		method string
		path   string
		body   string
	}{
		{"pin", http.MethodPut, "/api/sessions/1/pin", `{"pinned":true}`},
		{"order", http.MethodPut, "/api/sessions/order", `{"ids":[],"pinnedCount":0}`},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			srv := newTestServer(t, ClaudeCodeInfo{})

			req := httptest.NewRequest(tt.method, tt.path, strings.NewReader(tt.body))
			rec := httptest.NewRecorder()
			srv.Handler().ServeHTTP(rec, req)

			assert.Equal(t, http.StatusUnauthorized, rec.Code)
		})
	}
}

// TestHandleSetOrder_InvalidBodyIs400 covers §3.11's 400 invalid_request clause: body
// not JSON, ids/pinnedCount missing, a duplicate/unknown id, or pinnedCount out of
// range — exercised through the real HTTP handler.
func TestHandleSetOrder_InvalidBodyIs400(t *testing.T) {
	srv := newTestServer(t, ClaudeCodeInfo{})
	id := seedSessionRow(t, srv, nil)

	tests := []struct {
		name string
		body string
	}{
		{"not JSON", `not valid json`},
		{"ids missing", `{"pinnedCount":0}`},
		{"pinnedCount missing", fmt.Sprintf(`{"ids":[%d]}`, id)},
		{"pinnedCount negative", fmt.Sprintf(`{"ids":[%d],"pinnedCount":-1}`, id)},
		{"pinnedCount above len(ids)", fmt.Sprintf(`{"ids":[%d],"pinnedCount":2}`, id)},
		{"duplicate id", fmt.Sprintf(`{"ids":[%d,%d],"pinnedCount":0}`, id, id)},
		{"unknown id", `{"ids":[999999],"pinnedCount":0}`},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			rec := putSessionOrderRequest(t, srv, tt.body)

			assert.Equal(t, http.StatusBadRequest, rec.Code)
			assert.Equal(t, "invalid_request", decodeErrorCode(t, rec))
		})
	}
}

// TestHandleSetOrder_SuccessIs204AndAppliesTheOrder covers D9 through the real HTTP
// handler: a valid order request returns 204 and the store reflects the new
// pinned/railPos values.
func TestHandleSetOrder_SuccessIs204AndAppliesTheOrder(t *testing.T) {
	srv := newTestServer(t, ClaudeCodeInfo{})
	idA := seedSessionRow(t, srv, nil)
	idB := seedSessionRow(t, srv, nil)

	rec := putSessionOrderRequest(t, srv, fmt.Sprintf(`{"ids":[%d,%d],"pinnedCount":1}`, idB, idA))

	assert.Equal(t, http.StatusNoContent, rec.Code)
	rowB, err := srv.store.GetSession(context.Background(), idB)
	require.NoError(t, err)
	rowA, err := srv.store.GetSession(context.Background(), idA)
	require.NoError(t, err)
	assert.True(t, rowB.Pinned)
	assert.False(t, rowA.Pinned)
	assert.Less(t, rowB.RailPos, rowA.RailPos)
}

// TestHandleSetOrder_EmptyIDsIs204AndChangesNothing covers §3.11's explicit "empty ids
// is valid (a no-op ...)" clause through the real HTTP handler.
func TestHandleSetOrder_EmptyIDsIs204AndChangesNothing(t *testing.T) {
	srv := newTestServer(t, ClaudeCodeInfo{})
	id := seedSessionRow(t, srv, nil)
	before, err := srv.store.GetSession(context.Background(), id)
	require.NoError(t, err)

	rec := putSessionOrderRequest(t, srv, `{"ids":[],"pinnedCount":0}`)

	assert.Equal(t, http.StatusNoContent, rec.Code)
	after, err := srv.store.GetSession(context.Background(), id)
	require.NoError(t, err)
	assert.Equal(t, before, after)
}

// Note: a dedicated "tmux spawn failure rolls back the row" test was attempted and
// deliberately dropped. Manual probing (`tmux new-window -c <nonexistent dir> --
// <nonexistent binary>`) showed tmux's `new-window` returns exit 0 and a valid
// window/pane in both cases — the fork succeeds synchronously and only the child's
// later exec fails asynchronously in the pane, which tmux.Client.NewWindow has no way
// to observe. There is no environment-independent way to make `tmux.Client.NewWindow`
// itself return a synchronous error from this package (the binary name "tmux" isn't
// injectable), so the rollback code path for that specific step is covered only
// structurally, by TestLauncher_CorruptSettingsFileRefusesAndRollsBackTheSessionRow
// exercising the same `rollback` helper from an earlier failing step.
