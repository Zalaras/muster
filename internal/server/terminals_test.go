package server

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strconv"
	"strings"
	"testing"
	"time"

	"github.com/coder/websocket"
	"github.com/rs/zerolog"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/Zalaras/muster/internal/tmux"
)

func TestLowestFree_Table(t *testing.T) {
	tests := []struct {
		name string
		ns   []int
		want int
	}{
		{"none running", nil, 1},
		{"only 1", []int{1}, 2},
		{"1 and 2", []int{1, 2}, 3},
		{"hole at 1", []int{2, 3}, 1},
		{"hole in the middle", []int{1, 2, 4}, 3},
		{"only a high number", []int{10}, 1},
		{"past nine into two digits", []int{1, 2, 3, 4, 5, 6, 7, 8, 9, 10}, 11},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			assert.Equal(t, tt.want, lowestFree(tt.ns))
		})
	}
}

func TestTerminalNames_SetEffectiveClearForget(t *testing.T) {
	names := newTerminalNames()
	assert.Equal(t, "shell 3", names.effective(1, 3), "default name")

	names.set(1, 3, "build")
	names.set(1, 4, "web")
	names.set(2, 3, "other session")
	assert.Equal(t, "build", names.effective(1, 3))
	assert.Equal(t, "other session", names.effective(2, 3), "keyed by session and number")

	names.set(1, 3, "")
	assert.Equal(t, "shell 3", names.effective(1, 3), "empty clears")

	names.forgetSession(1)
	assert.Equal(t, "shell 4", names.effective(1, 4))
	assert.Equal(t, "other session", names.effective(2, 3), "forgetting one session leaves another")
}

func TestShellRegistry_NumberingAcrossSpawnAndClose(t *testing.T) {
	ctx := context.Background()
	reg, fake := newFakeShellRegistry()
	const id = int64(31)
	dir := t.TempDir()

	target, n, created, err := reg.EnsureAny(ctx, id, dir)
	require.NoError(t, err)
	assert.Equal(t, tmux.TerminalSessionName(id, 1), target)
	assert.Equal(t, 1, n)
	assert.True(t, created)

	for want := 2; want <= 3; want++ {
		target, n, err = reg.New(ctx, id, dir)
		require.NoError(t, err)
		assert.Equal(t, want, n)
		assert.Equal(t, tmux.TerminalSessionName(id, want), target)
	}

	closed, err := reg.Close(ctx, id, 2)
	require.NoError(t, err)
	assert.True(t, closed)
	_, n, err = reg.New(ctx, id, dir)
	require.NoError(t, err)
	assert.Equal(t, 2, n, "the lowest free number is reused")

	closed, err = reg.Close(ctx, id, 1)
	require.NoError(t, err)
	require.True(t, closed)
	_, n, created, err = reg.EnsureAny(ctx, id, dir)
	require.NoError(t, err)
	assert.Equal(t, 2, n, "EnsureAny returns the lowest running terminal, not terminal 1")
	assert.False(t, created)
	assert.Equal(t, 4, fake.newNamedSessionCalls, "EnsureAny spawned nothing when one ran: 1 + 2 + 1 spawns in all")
}

func TestShellRegistry_CloseOfAMissingTerminalReportsNotRunning(t *testing.T) {
	reg, _ := newFakeShellRegistry()
	_, _, _, err := reg.EnsureAny(context.Background(), 32, t.TempDir())
	require.NoError(t, err)

	closed, err := reg.Close(context.Background(), 32, 5)

	require.NoError(t, err)
	assert.False(t, closed)
}

func TestShellRegistry_RegistryNeverCrossesSessions(t *testing.T) {
	ctx := context.Background()
	reg, fake := newFakeShellRegistry()
	dir := t.TempDir()
	const a, b = int64(41), int64(42)
	for _, id := range []int64{a, b} {
		_, _, _, err := reg.EnsureAny(ctx, id, dir)
		require.NoError(t, err)
		_, _, err = reg.New(ctx, id, dir)
		require.NoError(t, err)
	}
	reg.names.set(a, 2, "build")
	reg.names.set(b, 2, "keep")

	closed, err := reg.Close(ctx, a, 2)
	require.NoError(t, err)
	require.True(t, closed)
	assert.Equal(t, "shell 2", reg.names.effective(a, 2), "closing forgets the name")
	assert.Equal(t, "keep", reg.names.effective(b, 2))

	reg.Kill(ctx, a)

	left, err := fake.ListSessions(ctx)
	require.NoError(t, err)
	assert.Equal(t, []string{tmux.TerminalSessionName(b, 1), tmux.TerminalSessionName(b, 2)}, left, "Kill ends every terminal of a and nothing of b")
	assert.Equal(t, "keep", reg.names.effective(b, 2))
	assert.True(t, reg.HasAny(), "b still has terminals")
}

func TestShellRegistry_KillWithAFailingListStillKillsTerminalOne(t *testing.T) {
	fake := &listFailTmux{fakeTmux: newFakeTmux()}
	reg := newShellRegistry(fake, newTerminalNames(), zerolog.Nop())
	_, _, err := fake.NewNamedSession(context.Background(), tmux.TerminalSessionName(7, 1), "", nil, nil)
	require.NoError(t, err)

	reg.Kill(context.Background(), 7)

	exists, err := fake.PaneExists(context.Background(), tmux.TerminalSessionName(7, 1))
	require.NoError(t, err)
	assert.False(t, exists)
}

type listFailTmux struct{ *fakeTmux }

func (l *listFailTmux) ListSessions(context.Context) ([]string, error) {
	return nil, assert.AnError
}

func TestShellRegistry_SpawnFailsWhenListingFails(t *testing.T) {
	fake := &listFailTmux{fakeTmux: newFakeTmux()}
	reg := newShellRegistry(fake, newTerminalNames(), zerolog.Nop())

	_, _, _, err := reg.EnsureAny(context.Background(), 8, t.TempDir())
	require.ErrorIs(t, err, assert.AnError)
	_, _, err = reg.New(context.Background(), 8, t.TempDir())
	require.ErrorIs(t, err, assert.AnError)
	assert.Zero(t, fake.newNamedSessionCalls, "no spawn on a listing failure")
}

// terminalsRequest sends one authenticated request, with an optional JSON body.
func terminalsRequest(t *testing.T, srv *testServer, method, path, body string) *httptest.ResponseRecorder {
	t.Helper()
	var req *http.Request
	if body == "" {
		req = httptest.NewRequest(method, path, nil)
	} else {
		req = httptest.NewRequest(method, path, strings.NewReader(body))
	}
	req.AddCookie(&http.Cookie{Name: cookieBaseName, Value: testUIToken})
	rec := httptest.NewRecorder()
	srv.Handler().ServeHTTP(rec, req)
	return rec
}

func shellsPath(id int64, rest string) string {
	return "/api/sessions/" + strconv.FormatInt(id, 10) + "/shells" + rest
}

func TestHandleNewTerminal_SpawnsLowestFreeAndReportsDefaultName(t *testing.T) {
	srv, fake := newFakeTmuxTestServer(t)
	sess := launchRealSession(t, srv, sleepForeverCommand())

	for want := 1; want <= 3; want++ {
		rec := terminalsRequest(t, srv, http.MethodPost, shellsPath(sess.ID, ""), "")
		require.Equal(t, http.StatusCreated, rec.Code, rec.Body.String())
		var body newTerminalResponse
		require.NoError(t, json.Unmarshal(rec.Body.Bytes(), &body))
		assert.Equal(t, newTerminalResponse{Target: tmux.TerminalSessionName(sess.ID, want), N: want, Name: "shell " + strconv.Itoa(want)}, body)
	}
	rec := terminalsRequest(t, srv, http.MethodDelete, shellsPath(sess.ID, "/2"), "")
	require.Equal(t, http.StatusNoContent, rec.Code)

	rec = terminalsRequest(t, srv, http.MethodPost, shellsPath(sess.ID, ""), "")
	require.Equal(t, http.StatusCreated, rec.Code)
	var body newTerminalResponse
	require.NoError(t, json.Unmarshal(rec.Body.Bytes(), &body))
	assert.Equal(t, 2, body.N, "the hole left by the close is filled first")

	listed, err := fake.ListSessions(context.Background())
	require.NoError(t, err)
	assert.Len(t, listed, 3)
}

func TestHandleNewTerminal_Errors(t *testing.T) {
	srv, _ := newFakeTmuxTestServer(t)
	sess := launchRealSession(t, srv, sleepForeverCommand())

	t.Run("unknown session", func(t *testing.T) {
		rec := terminalsRequest(t, srv, http.MethodPost, shellsPath(999999, ""), "")
		assertErrorResponse(t, rec, http.StatusNotFound, "unknown_session", "unknown session id")
	})
	t.Run("no cookie", func(t *testing.T) {
		req := httptest.NewRequest(http.MethodPost, shellsPath(sess.ID, ""), nil)
		rec := httptest.NewRecorder()
		srv.Handler().ServeHTTP(rec, req)
		assert.Equal(t, http.StatusUnauthorized, rec.Code)
	})
}

func TestHandleCreateShell_ReturnsLowestRunningTerminalWithN(t *testing.T) {
	srv, _ := newFakeTmuxTestServer(t)
	sess := launchRealSession(t, srv, sleepForeverCommand())

	rec, target, created := postShellRequest(t, srv, sess.ID)
	require.Equal(t, http.StatusOK, rec.Code)
	assert.True(t, created)
	assert.Equal(t, tmux.TerminalSessionName(sess.ID, 1), target)
	assert.Contains(t, rec.Body.String(), `"n":1`)

	require.Equal(t, http.StatusCreated, terminalsRequest(t, srv, http.MethodPost, shellsPath(sess.ID, ""), "").Code)
	require.Equal(t, http.StatusNoContent, terminalsRequest(t, srv, http.MethodDelete, shellsPath(sess.ID, "/1"), "").Code)

	rec, target, created = postShellRequest(t, srv, sess.ID)
	require.Equal(t, http.StatusOK, rec.Code)
	assert.False(t, created, "a terminal is running, so none is spawned")
	assert.Equal(t, tmux.TerminalSessionName(sess.ID, 2), target)
	assert.Contains(t, rec.Body.String(), `"n":2`)
}

func TestHandleRenameTerminal_Table(t *testing.T) {
	tests := []struct {
		name     string
		n        string
		body     string
		wantCode int
		wantErr  string
		wantName string
	}{
		{"sets a name", "2", `{"name":"build"}`, 200, "", "build"},
		{"trims whitespace", "2", `{"name":"  build  "}`, 200, "", "build"},
		{"empty clears to the default", "2", `{"name":""}`, 200, "", "shell 2"},
		{"whitespace only clears", "2", `{"name":"   "}`, 200, "", "shell 2"},
		{"exactly 40 characters is allowed", "2", `{"name":"` + strings.Repeat("a", 40) + `"}`, 200, "", strings.Repeat("a", 40)},
		{"40 multi-byte characters is allowed", "2", `{"name":"` + strings.Repeat("é", 40) + `"}`, 200, "", strings.Repeat("é", 40)},
		{"41 characters is too long", "2", `{"name":"` + strings.Repeat("a", 41) + `"}`, 400, "name_too_long", ""},
		{"41 multi-byte characters is too long", "2", `{"name":"` + strings.Repeat("é", 41) + `"}`, 400, "name_too_long", ""},
		{"padding does not count toward the limit", "2", `{"name":" ` + strings.Repeat("a", 40) + ` "}`, 200, "", strings.Repeat("a", 40)},
		{"unparseable body", "2", `{`, 400, "bad_request", ""},
		{"name not a string", "2", `{"name":5}`, 400, "bad_request", ""},
		{"name missing", "2", `{}`, 400, "bad_request", ""},
		{"name null", "2", `{"name":null}`, 400, "bad_request", ""},
		{"terminal not running", "7", `{"name":"x"}`, 404, "no_shell", ""},
		{"n zero", "0", `{"name":"x"}`, 404, "no_shell", ""},
		{"n not a number", "abc", `{"name":"x"}`, 404, "no_shell", ""},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			srv, _ := newFakeTmuxTestServer(t)
			sess := launchRealSession(t, srv, sleepForeverCommand())
			for range 2 {
				require.Equal(t, http.StatusCreated, terminalsRequest(t, srv, http.MethodPost, shellsPath(sess.ID, ""), "").Code)
			}

			rec := terminalsRequest(t, srv, http.MethodPut, shellsPath(sess.ID, "/"+tt.n+"/name"), tt.body)

			require.Equal(t, tt.wantCode, rec.Code, rec.Body.String())
			if tt.wantErr != "" {
				code, _ := errorOf(t, rec)
				assert.Equal(t, tt.wantErr, code)
				return
			}
			var got terminalNameResponse
			require.NoError(t, json.Unmarshal(rec.Body.Bytes(), &got))
			assert.Equal(t, 2, got.N)
			assert.Equal(t, tt.wantName, got.Name)
			assert.Equal(t, tt.wantName, srv.shellActivity.poller.names.effective(sess.ID, 2))
			assert.Equal(t, "shell 1", srv.shellActivity.poller.names.effective(sess.ID, 1), "another terminal's name is untouched")
		})
	}
}

func TestHandleRenameTerminal_UnknownSessionAndAuth(t *testing.T) {
	srv, _ := newFakeTmuxTestServer(t)

	rec := terminalsRequest(t, srv, http.MethodPut, shellsPath(999999, "/1/name"), `{"name":"x"}`)
	assertErrorResponse(t, rec, http.StatusNotFound, "unknown_session", "unknown session id")

	req := httptest.NewRequest(http.MethodPut, shellsPath(1, "/1/name"), strings.NewReader(`{"name":"x"}`))
	unauth := httptest.NewRecorder()
	srv.Handler().ServeHTTP(unauth, req)
	assert.Equal(t, http.StatusUnauthorized, unauth.Code)
}

func TestHandleCloseTerminal_EndsOnlyThatTerminalOfOnlyThatSession(t *testing.T) {
	srv, fake := newFakeTmuxTestServer(t)
	a := launchRealSession(t, srv, sleepForeverCommand())
	b := launchRealSession(t, srv, sleepForeverCommand())
	for _, id := range []int64{a.ID, b.ID} {
		for range 2 {
			require.Equal(t, http.StatusCreated, terminalsRequest(t, srv, http.MethodPost, shellsPath(id, ""), "").Code)
		}
	}
	require.Equal(t, http.StatusOK, terminalsRequest(t, srv, http.MethodPut, shellsPath(a.ID, "/2/name"), `{"name":"keep"}`).Code)
	require.Equal(t, http.StatusOK, terminalsRequest(t, srv, http.MethodPut, shellsPath(b.ID, "/1/name"), `{"name":"other"}`).Code)

	rec := terminalsRequest(t, srv, http.MethodDelete, shellsPath(a.ID, "/1"), "")

	assert.Equal(t, http.StatusNoContent, rec.Code)
	assert.Empty(t, rec.Body.String())
	listed, err := fake.ListSessions(context.Background())
	require.NoError(t, err)
	assert.ElementsMatch(t, []string{
		tmux.TerminalSessionName(a.ID, 2), tmux.TerminalSessionName(b.ID, 1), tmux.TerminalSessionName(b.ID, 2),
	}, listed)
	assert.Equal(t, "keep", srv.shellActivity.poller.names.effective(a.ID, 2))
	assert.Equal(t, "other", srv.shellActivity.poller.names.effective(b.ID, 1))
	claudeExists, err := fake.PaneExists(context.Background(), a.TmuxTarget)
	require.NoError(t, err)
	assert.True(t, claudeExists, "the Claude pane is never touched")

	again := terminalsRequest(t, srv, http.MethodDelete, shellsPath(a.ID, "/1"), "")
	assertErrorResponse(t, again, http.StatusNotFound, "no_shell", "no such terminal")
	bad := terminalsRequest(t, srv, http.MethodDelete, shellsPath(a.ID, "/0"), "")
	assertErrorResponse(t, bad, http.StatusNotFound, "no_shell", "no such terminal")
	unknown := terminalsRequest(t, srv, http.MethodDelete, shellsPath(999999, "/1"), "")
	assertErrorResponse(t, unknown, http.StatusNotFound, "unknown_session", "unknown session id")
}

func TestHandleRemoveSession_EndsEveryTerminalAndNoOtherSessions(t *testing.T) {
	srv, fake := newFakeTmuxTestServer(t)
	a := launchRealSession(t, srv, sleepForeverCommand())
	b := launchRealSession(t, srv, sleepForeverCommand())
	for _, id := range []int64{a.ID, b.ID} {
		for range 3 {
			require.Equal(t, http.StatusCreated, terminalsRequest(t, srv, http.MethodPost, shellsPath(id, ""), "").Code)
		}
	}

	rec := sessionActionRequest(t, srv, http.MethodDelete, "/api/sessions/"+strconv.FormatInt(a.ID, 10))

	require.Equal(t, http.StatusNoContent, rec.Code)
	listed, err := fake.ListSessions(context.Background())
	require.NoError(t, err)
	assert.ElementsMatch(t, []string{
		tmux.TerminalSessionName(b.ID, 1), tmux.TerminalSessionName(b.ID, 2), tmux.TerminalSessionName(b.ID, 3),
	}, listed, "every terminal of the removed session is gone, the other session's survive")
}

func TestHandleShellTerminal_PerTerminalAttachRules(t *testing.T) {
	srv, _ := newFakeTmuxTestServer(t)
	sess := launchRealSession(t, srv, sleepForeverCommand())
	for range 2 {
		require.Equal(t, http.StatusCreated, terminalsRequest(t, srv, http.MethodPost, shellsPath(sess.ID, ""), "").Code)
	}
	httpSrv := httptest.NewServer(srv.Handler())
	t.Cleanup(httpSrv.Close)

	for _, tt := range []struct {
		name string
		n    int
		want int
	}{
		{"n not running is 409", 3, http.StatusConflict},
		{"n zero is 404", 0, http.StatusNotFound},
	} {
		t.Run(tt.name, func(t *testing.T) {
			_, resp, err := dialTerminalN(t, httpSrv, sess.ID, tt.n)
			require.Error(t, err)
			require.NotNil(t, resp)
			defer func() { _ = resp.Body.Close() }()
			assert.Equal(t, tt.want, resp.StatusCode)
		})
	}
	_, resp, err := dialTerminalN(t, httpSrv, 999999, 1)
	require.Error(t, err)
	require.NotNil(t, resp)
	defer func() { _ = resp.Body.Close() }()
	assert.Equal(t, http.StatusNotFound, resp.StatusCode, "unknown session")

	t.Run("a second socket on the same terminal supersedes the first; other terminals and the Claude socket live", func(t *testing.T) {
		claudeConn := dialTerminalOK(t, httpSrv, sess.ID)
		defer func() { _ = claudeConn.CloseNow() }()
		t1, _, err := dialTerminalN(t, httpSrv, sess.ID, 1) //nolint:bodyclose // success path, nothing to close
		require.NoError(t, err)
		defer func() { _ = t1.CloseNow() }()
		t2first, _, err := dialTerminalN(t, httpSrv, sess.ID, 2) //nolint:bodyclose // success path, nothing to close
		require.NoError(t, err)
		defer func() { _ = t2first.CloseNow() }()
		t2second, _, err := dialTerminalN(t, httpSrv, sess.ID, 2) //nolint:bodyclose // success path, nothing to close
		require.NoError(t, err)
		defer func() { _ = t2second.CloseNow() }()

		readErr := readUntilError(t, t2first, 3*time.Second)
		assert.Equal(t, websocket.StatusCode(4000), websocket.CloseStatus(readErr), "same (id, n) supersedes")

		for name, c := range map[string]*websocket.Conn{"terminal 1": t1, "claude": claudeConn, "new terminal 2": t2second} {
			ctx, cancel := context.WithTimeout(context.Background(), 300*time.Millisecond)
			_, _, rerr := c.Read(ctx)
			cancel()
			assert.NotEqual(t, websocket.StatusCode(4000), websocket.CloseStatus(rerr), "%s must not be superseded", name)
		}
	})
}
