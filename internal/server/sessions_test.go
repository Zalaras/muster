package server

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"os"
	"os/exec"
	"path/filepath"
	"strconv"
	"strings"
	"testing"
	"time"

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
		hookURL: "http://127.0.0.1:0/ingest/tok/hook", statusURL: "http://127.0.0.1:0/ingest/tok/status",
		sessionStartScript: "/bin/true", statusLineScript: "/bin/true",
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

// newTestTmuxClient returns a tmux.Client bound to a private, per-test socket — never
// "-L muster" and never the user's default server (CLAUDE.md hard rule).
func newTestTmuxClient(t *testing.T) *tmux.Client {
	t.Helper()
	b := make([]byte, 8)
	_, err := rand.Read(b)
	require.NoError(t, err)
	socket := "muster-server-test-" + hex.EncodeToString(b)
	t.Cleanup(func() {
		_ = exec.Command("tmux", "-L", socket, "kill-server").Run()
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
		hookURL: "http://127.0.0.1:0/ingest/tok/hook", statusURL: "http://127.0.0.1:0/ingest/tok/status",
		sessionStartScript: "/bin/true", statusLineScript: "/bin/true",
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
