package server

// Test helpers shared by the server package's feature tests: request builders, the
// launcher's store and manager fixtures, and the no-upsert oracle.

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"net/http/httptest"
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
	"github.com/Zalaras/muster/internal/tmux/tmuxtest"
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

func openLauncherTestStore(t *testing.T) *store.Store {
	t.Helper()
	st, err := store.Open(context.Background(), filepath.Join(t.TempDir(), "muster.db"), zerolog.Nop())
	require.NoError(t, err)
	t.Cleanup(func() { _ = st.Close() })
	return st
}

// noopPaneChecker/noopPaneSnapshotter/noopTmuxSessions are minimal doubles for
// session.Manager's three now-required ports (a-M1: NewManager panics on a missing one).
// This file's launcher/handler tests build a Manager directly rather than through
// server.New() (which always wires a real *tmux.Client) and mostly don't exercise tmux at
// all, so a no-op default is enough; the tests that do care already have their own double
// (errKiller, spawnerKiller below) and just need ResolveSessionTarget added.
type noopPaneChecker struct{}

func (noopPaneChecker) PaneExists(context.Context, string) (bool, error) { return false, nil }

type noopPaneSnapshotter struct{}

func (noopPaneSnapshotter) CapturePane(context.Context, string) (string, error) { return "", nil }

type noopTmuxSessions struct{}

func (noopTmuxSessions) KillSession(context.Context, string) error      { return nil }
func (noopTmuxSessions) ListSessions(context.Context) ([]string, error) { return nil, nil }
func (noopTmuxSessions) ResolveSessionTarget(context.Context, string) (string, string, error) {
	return "", "", errors.New("noopTmuxSessions: ResolveSessionTarget not supported")
}

// sessionManagerOpt overrides one field of newSessionTestManager's default Config — this
// package's own copy of internal/session's testManagerOpt (review Minor 8's "per-test
// overrides" constructor); a package-local copy because _test.go doubles can't be
// imported across packages.
type sessionManagerOpt func(*session.Config)

func withOnUpsert(f func(*session.Session)) sessionManagerOpt {
	return func(c *session.Config) { c.OnUpsert = f }
}

func withTmuxSessions(ts session.TmuxSessions) sessionManagerOpt {
	return func(c *session.Config) { c.TmuxSessions = ts }
}

// newSessionTestManager is the one constructor this file's tests build a session.Manager
// through directly (review Minor 8): every port defaults to a no-op double, overridden by
// sessionManagerOpt where a test's scenario needs a real answer.
func newSessionTestManager(t *testing.T, st *store.Store, opts ...sessionManagerOpt) *session.Manager {
	t.Helper()
	cfg := session.Config{
		Store:           st,
		Logger:          zerolog.Nop(),
		PaneChecker:     noopPaneChecker{},
		PaneSnapshotter: noopPaneSnapshotter{},
		TmuxSessions:    noopTmuxSessions{},
	}
	for _, opt := range opts {
		opt(&cfg)
	}
	return session.NewManager(cfg)
}

// stubSessionOutFile is where sharedStubClaude (main_test.go) records the MUSTER_SESSION
// it was handed for sessionID, launched into dir. Reading that back is the only reliable way to observe what
// a tmux `new-window -e` actually passed the spawned process: tmux's own `show-environment`
// reflects a separate update-environment table, not the process env passed at spawn,
// confirmed by manual probe.
func stubSessionOutFile(dir string, sessionID int64) string {
	return filepath.Join(dir, "muster-stub-session-"+strconv.FormatInt(sessionID, 10))
}

// newTestTmuxClient returns a tmux.Client bound to a private, per-test socket (plan
// v1-cleanup REQ-4: tmuxtest.Socket replaces this file's own copy of the shared
// os.MkdirTemp + kill-server idiom) — never a bare -L name in tmux's shared socket
// directory (D12) and never the user's default server (CLAUDE.md hard rule). Used only
// by TestLauncher_SuccessfulLaunchEndToEnd (this file's keep-real test, per REQ-3's
// Implementation Notes list); TestLauncher_AutoPermissionModeSeedsLatchAndRepoDefault
// uses a fakeTmux instead.
func newTestTmuxClient(t *testing.T) *tmux.Client {
	t.Helper()
	return tmux.New(tmuxtest.Socket(t))
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

const (
	pathSessionsEnd    = "/api/sessions/end"
	pathSessionsRemove = "/api/sessions/remove"
	pathSessionsGroup  = "/api/sessions/group"
	pathSessionsOrder  = "/api/sessions/order"
)

const (
	msgBatchBadIDs  = "ids must be a non-empty list of session ids without duplicates"
	msgGroupBadIDs  = "ids must be known session ids without duplicates"
	msgOrderBadBody = "ids must be a duplicate-free list of known session ids, and pinnedCount must be in [0, len(ids)]"
)
