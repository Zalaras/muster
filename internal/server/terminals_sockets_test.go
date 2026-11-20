package server

import (
	"context"
	"net/http"
	"net/http/httptest"
	"os"
	"strconv"
	"testing"
	"time"

	"github.com/coder/websocket"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/Zalaras/muster/internal/session"
	"github.com/Zalaras/muster/internal/tmux"
)

// wireTerminalList points srv's terminal-list poller at the fake tmux's session list and a
// recorder (the real poller lists a real tmux socket, which the fake server never starts), and
// returns the recorder. Called before any request, so nothing races the swapped fields.
func wireTerminalList(srv *testServer, fake *fakeTmux) *recordingActivityBroadcaster {
	rec := &recordingActivityBroadcaster{}
	p := srv.shellActivity.poller
	p.lister = func(ctx context.Context) ([]tmux.PaneActivity, error) {
		names, err := fake.ListSessions(ctx)
		if err != nil {
			return nil, err
		}
		var out []tmux.PaneActivity
		for _, name := range names {
			out = append(out, tmux.PaneActivity{SessionName: name})
		}
		return out, nil
	}
	p.canonical = func(string) (bool, error) { return false, nil }
	p.broadcast = rec.broadcast
	return rec
}

// launchSessionsUpTo launches real (fake-tmux) sessions until one has id want, so sessions 1
// and 12 can coexist (tmux's "muster-1" is a string prefix of "muster-12-shell").
func launchSessionsUpTo(t *testing.T, srv *testServer, want int64) (first, last *session.Session) {
	t.Helper()
	for {
		s := launchRealSession(t, srv, sleepForeverCommand())
		if first == nil {
			first = s
		}
		last = s
		if s.ID >= want {
			break
		}
	}
	require.Equal(t, int64(1), first.ID)
	require.Equal(t, want, last.ID)
	return first, last
}

func spawnTerminals(t *testing.T, srv *testServer, id int64, count int) {
	t.Helper()
	for range count {
		require.Equal(t, http.StatusCreated, terminalsRequest(t, srv, http.MethodPost, shellsPath(id, ""), "").Code)
	}
}

func TestHandleCloseTerminal_SocketsAndBroadcastAcrossSessions1And12(t *testing.T) {
	srv, fake := newFakeTmuxTestServer(t)
	fake.panesSurviveBridgeClose = true
	s1, s12 := launchSessionsUpTo(t, srv, 12)
	spawnTerminals(t, srv, s1.ID, 2)
	spawnTerminals(t, srv, s12.ID, 2)
	b := wireTerminalList(srv, fake)
	srv.shellActivity.poller.sync(context.Background())
	b.reset()

	httpSrv := httptest.NewServer(srv.Handler())
	t.Cleanup(httpSrv.Close)
	dial := func(id int64, n int) *websocket.Conn {
		c, _, err := dialTerminalN(t, httpSrv, id, n) //nolint:bodyclose // success path, nothing to close
		require.NoError(t, err)
		t.Cleanup(func() { _ = c.CloseNow() })
		return c
	}
	closing := dial(s1.ID, 1)
	conns := map[string]*websocket.Conn{
		"session 1 terminal 2":  dial(s1.ID, 2),
		"session 1 claude":      dialTerminalOK(t, httpSrv, s1.ID),
		"session 12 terminal 1": dial(s12.ID, 1),
		"session 12 terminal 2": dial(s12.ID, 2),
		"session 12 claude":     dialTerminalOK(t, httpSrv, s12.ID),
	}
	t.Cleanup(func() {
		for _, c := range conns {
			_ = c.CloseNow()
		}
	})

	rec := terminalsRequest(t, srv, http.MethodDelete, shellsPath(s1.ID, "/1"), "")
	require.Equal(t, http.StatusOK, rec.Code, rec.Body.String())

	assert.Equal(t, websocket.StatusCode(4001), websocket.CloseStatus(readUntilError(t, closing, 3*time.Second)),
		"the deleted terminal's socket closes pane_ended")
	for name, c := range conns {
		ctx, cancel := context.WithTimeout(context.Background(), 300*time.Millisecond)
		_, _, rerr := c.Read(ctx)
		cancel()
		require.ErrorIs(t, rerr, context.DeadlineExceeded, "%s stays open (no 4001, no other close)", name)
	}

	assert.Equal(t, []terminalsBroadcast{
		{sessionID: s1.ID, terminals: []terminalWire{{N: 2, Name: "shell 2"}}},
	}, b.all(), "one terminals broadcast: session 1's whole remaining list; session 12 is never re-broadcast")
	listed, err := fake.ListSessions(context.Background())
	require.NoError(t, err)
	assert.ElementsMatch(t, []string{
		tmux.TerminalSessionName(s1.ID, 2), tmux.TerminalSessionName(s12.ID, 1), tmux.TerminalSessionName(s12.ID, 2),
	}, listed)
}

func TestHandleRemoveSession_KillOfSession1LeavesSession12Untouched(t *testing.T) {
	srv, fake := newFakeTmuxTestServer(t)
	fake.panesSurviveBridgeClose = true
	s1, s12 := launchSessionsUpTo(t, srv, 12)
	spawnTerminals(t, srv, s1.ID, 2)
	spawnTerminals(t, srv, s12.ID, 2)
	require.Equal(t, http.StatusOK, terminalsRequest(t, srv, http.MethodPut, shellsPath(s12.ID, "/2/name"), `{"name":"keep"}`).Code)
	b := wireTerminalList(srv, fake)
	srv.shellActivity.poller.sync(context.Background())
	b.reset()
	httpSrv := httptest.NewServer(srv.Handler())
	t.Cleanup(httpSrv.Close)
	survivor, _, err := dialTerminalN(t, httpSrv, s12.ID, 1) //nolint:bodyclose // success path, nothing to close
	require.NoError(t, err)
	t.Cleanup(func() { _ = survivor.CloseNow() })

	rec := sessionActionRequest(t, srv, http.MethodDelete, "/api/sessions/"+strconv.FormatInt(s1.ID, 10))
	require.Equal(t, http.StatusNoContent, rec.Code)
	srv.shellActivity.poller.sync(context.Background())

	listed, err := fake.ListSessions(context.Background())
	require.NoError(t, err)
	assert.ElementsMatch(t, []string{tmux.TerminalSessionName(s12.ID, 1), tmux.TerminalSessionName(s12.ID, 2)}, listed,
		"session 12's terminals survive session 1's Kill despite the shared name prefix")
	assert.Equal(t, "keep", srv.shellActivity.poller.names.effective(s12.ID, 2))
	assert.Equal(t, []terminalsBroadcast{{sessionID: s1.ID, terminals: []terminalWire{}}}, b.all(),
		"only session 1's list is emptied")
	ctx, cancel := context.WithTimeout(context.Background(), 300*time.Millisecond)
	defer cancel()
	_, _, rerr := survivor.Read(ctx)
	assert.ErrorIs(t, rerr, context.DeadlineExceeded, "session 12's terminal socket stays open")
}

// TestHandleShellTerminal_PTYEndBroadcastsTheRemainingList: a terminal's attach pump ending on
// PTY EOF nudges the shell feature's changed (the poller's sync), so the list goes out at once.
func TestHandleShellTerminal_PTYEndBroadcastsTheRemainingList(t *testing.T) {
	srv, fake := newFakeTmuxTestServer(t)
	s1, s12 := launchSessionsUpTo(t, srv, 12)
	spawnTerminals(t, srv, s1.ID, 2)
	spawnTerminals(t, srv, s12.ID, 1)
	b := wireTerminalList(srv, fake)
	srv.shellActivity.poller.sync(context.Background())
	b.reset()
	httpSrv := httptest.NewServer(srv.Handler())
	t.Cleanup(httpSrv.Close)
	c, _, err := dialTerminalN(t, httpSrv, s1.ID, 2) //nolint:bodyclose // success path, nothing to close
	require.NoError(t, err)
	t.Cleanup(func() { _ = c.CloseNow() })

	require.NoError(t, c.Write(context.Background(), websocket.MessageBinary, []byte("exit\n")))

	assert.Equal(t, websocket.StatusCode(4001), websocket.CloseStatus(readUntilError(t, c, 3*time.Second)))
	require.Eventually(t, func() bool { return len(b.all()) > 0 }, 3*time.Second, 10*time.Millisecond,
		"the PTY ending broadcasts without waiting for a poll tick")
	assert.Equal(t, []terminalsBroadcast{
		{sessionID: s1.ID, terminals: []terminalWire{{N: 1, Name: "shell 1"}}},
	}, b.all())
	got, ok := srv.manager.Get(s1.ID)
	require.True(t, ok)
	assert.True(t, got.Alive, "a terminal's end never touches its session's liveness")
}

func TestSpawnInSession_FailureWritesTheErrorOnlyAndNeverBroadcasts(t *testing.T) {
	for _, route := range []struct {
		name string
		path func(id int64) string
		ok   int
	}{
		{"POST shells", func(id int64) string { return shellsPath(id, "") }, http.StatusCreated},
		{"POST shell", func(id int64) string { return "/api/sessions/" + strconv.FormatInt(id, 10) + "/shell" }, http.StatusOK},
	} {
		for _, tt := range []struct {
			name   string
			setup  func(t *testing.T, fake *fakeTmux, sess *session.Session) int64
			status int
			code   string
		}{
			{"unknown session", func(*testing.T, *fakeTmux, *session.Session) int64 { return 999999 }, http.StatusNotFound, "unknown_session"},
			{"directory missing", func(t *testing.T, _ *fakeTmux, s *session.Session) int64 {
				require.NoError(t, os.RemoveAll(s.Directory))
				return s.ID
			}, http.StatusConflict, "directory_missing"},
			{"spawn fails", func(_ *testing.T, f *fakeTmux, s *session.Session) int64 {
				f.newNamedSessionErr = assert.AnError
				return s.ID
			}, http.StatusInternalServerError, "shell_spawn_failed"},
			{"success", func(_ *testing.T, _ *fakeTmux, s *session.Session) int64 { return s.ID }, route.ok, ""},
		} {
			t.Run(route.name+"/"+tt.name, func(t *testing.T) {
				srv, fake := newFakeTmuxTestServer(t)
				sess := launchRealSession(t, srv, sleepForeverCommand())
				b := wireTerminalList(srv, fake)
				id := tt.setup(t, fake, sess)

				rec := terminalsRequest(t, srv, http.MethodPost, route.path(id), "")

				require.Equal(t, tt.status, rec.Code, rec.Body.String())
				listed, err := fake.ListSessions(context.Background())
				require.NoError(t, err)
				if tt.code == "" {
					assert.Len(t, listed, 1)
					assert.Len(t, b.all(), 1, "a successful spawn broadcasts once")
					return
				}
				assert.Contains(t, rec.Body.String(), `"`+tt.code+`"`)
				assert.NotContains(t, rec.Body.String(), `"target"`, "the error body is the whole response")
				assert.Empty(t, listed, "nothing spawned")
				assert.Empty(t, b.all(), "a failed spawn never broadcasts")
			})
		}
	}
}
