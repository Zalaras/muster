package server

import (
	"context"
	"database/sql"
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strconv"
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

// postShellRequest fires POST /api/sessions/{id}/shell through srv's mux (no real HTTP
// server needed for a plain POST) and decodes the createShellResponse body on a 200.
func postShellRequest(t *testing.T, srv *testServer, id int64) (rec *httptest.ResponseRecorder, target string, created bool) {
	t.Helper()
	req := httptest.NewRequest(http.MethodPost, "/api/sessions/"+strconv.FormatInt(id, 10)+"/shell", nil)
	req.AddCookie(&http.Cookie{Name: cookieName, Value: testUIToken})
	rec = httptest.NewRecorder()
	srv.Handler().ServeHTTP(rec, req)
	if rec.Code == http.StatusOK {
		var body struct {
			Target  string `json:"target"`
			Created bool   `json:"created"`
		}
		require.NoError(t, json.Unmarshal(rec.Body.Bytes(), &body))
		target, created = body.Target, body.Created
	}
	return rec, target, created
}

// dialShell opens a WS connection to /ws/shell/{id}, sending the UI cookie — the
// shell-surface counterpart to terminal_test.go's dialTerminal.
func dialShell(t *testing.T, httpSrv *httptest.Server, id int64) (*websocket.Conn, *http.Response, error) {
	t.Helper()
	wsURL := "ws" + httpSrv.URL[len("http"):] + "/ws/shell/" + strconv.FormatInt(id, 10)
	header := http.Header{"Cookie": {cookieName + "=" + testUIToken}}
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	return websocket.Dial(ctx, wsURL, &websocket.DialOptions{HTTPHeader: header}) //nolint:bodyclose
}

// dialShellOK is dialShell for the success path (see terminal_test.go's dialTerminalOK
// for why the handshake *http.Response needs no explicit close here).
func dialShellOK(t *testing.T, httpSrv *httptest.Server, id int64) *websocket.Conn {
	t.Helper()
	c, _, err := dialShell(t, httpSrv, id) //nolint:bodyclose
	require.NoError(t, err)
	return c
}

// seedDeadSessionWithBogusClaudeTarget seeds a session row that is Alive:true but whose
// TmuxTarget names a Claude tmux session that was never actually created — used only by
// TestHandleShellTerminal_ShellDeathNeverNudgesTheParentsLiveness, where the point is
// that if handleShellTerminal's PTY-EOF path incorrectly nudged the liveness poll (using
// nudgeOnEOF:true, the Claude-surface behaviour, instead of the shell surface's false),
// the nudge's PaneExists check against this bogus target would report "gone" and flip
// Alive to false immediately — a real, observable divergence, unlike nudging a target
// that genuinely still exists (which would be a silent no-op either way).
func seedDeadSessionWithBogusClaudeTarget(t *testing.T, srv *testServer) (id int64, dir string) {
	t.Helper()
	dir = t.TempDir()
	ctx := context.Background()
	repo, _, err := srv.store.UpsertRepo(ctx, store.UpsertRepoParams{
		Path: dir, Name: filepath.Base(dir), Model: "sonnet", PermissionMode: "default",
	})
	require.NoError(t, err)
	sess, err := srv.manager.CreateSession(ctx, session.CreateParams{
		RepoID: repo.ID, Directory: dir, PermissionMode: session.PermissionDefault,
		Model: "sonnet", FirstLaunchHere: true,
	})
	require.NoError(t, err)
	// A target that was never spawned in this test's tmux socket at all — PaneExists
	// on it reports "gone" instantly, with no need to wait out a real process's exit.
	_, err = srv.manager.RecordLaunch(ctx, sess.ID, "muster-bogus-999999:@1", "%1")
	require.NoError(t, err)
	return sess.ID, dir
}

// countAllRows sums every row across the three tables a shell operation must never
// write to (INV-2/D13: no session, event or repo row of any kind). A single scalar
// rather than three separate counts because INV-2's own wording is "no row of any
// kind" — one number before, one number after, unchanged, is the whole assertion.
func countAllRows(t *testing.T, dbPath string) int {
	t.Helper()
	db, err := sql.Open("sqlite", dbPath)
	require.NoError(t, err)
	defer func() { _ = db.Close() }()
	var n int
	require.NoError(t, db.QueryRow(`SELECT
		(SELECT COUNT(*) FROM session) +
		(SELECT COUNT(*) FROM repo) +
		(SELECT COUNT(*) FROM event)`).Scan(&n))
	return n
}

// TestHandleCreateShell_NoShellYetSpawnsOneAndReturnsCreatedTrue covers D1 at the HTTP
// layer. Uses newFakeTmuxTestServer (REQ-3): the assertion is that the handler calls
// through to Ensure and reports its result faithfully, not that a real interactive
// shell actually runs — that is StreamsPTYOutputAndAcceptsInput's job, on the keep-real
// list.
func TestHandleCreateShell_NoShellYetSpawnsOneAndReturnsCreatedTrue(t *testing.T) {
	srv, fake := newFakeTmuxTestServer(t)
	sess := launchRealSession(t, srv, sleepForeverCommand())

	rec, target, created := postShellRequest(t, srv, sess.ID)

	require.Equal(t, http.StatusOK, rec.Code)
	assert.True(t, created)
	assert.Equal(t, tmux.ShellSessionName(sess.ID), target)
	assert.Equal(t, 1, fake.newNamedSessionCalls)

	exists, err := srv.tmuxClient.PaneExists(context.Background(), target)
	require.NoError(t, err)
	assert.True(t, exists)
}

// TestHandleCreateShell_RepeatCallReturnsCreatedFalse covers D2 at the HTTP layer.
func TestHandleCreateShell_RepeatCallReturnsCreatedFalse(t *testing.T) {
	srv, fake := newFakeTmuxTestServer(t)
	sess := launchRealSession(t, srv, sleepForeverCommand())

	_, _, created1 := postShellRequest(t, srv, sess.ID)
	require.True(t, created1)

	rec2, target2, created2 := postShellRequest(t, srv, sess.ID)

	assert.Equal(t, http.StatusOK, rec2.Code)
	assert.False(t, created2)
	assert.Equal(t, tmux.ShellSessionName(sess.ID), target2)
	assert.Equal(t, 1, fake.newNamedSessionCalls, "a repeat call must never spawn a second tmux session")
}

// TestHandleCreateShell_UnknownSessionIs404 covers the Protocol Contract's 404
// unknown_session.
func TestHandleCreateShell_UnknownSessionIs404(t *testing.T) {
	srv, _ := newFakeTmuxTestServer(t)

	rec, _, _ := postShellRequest(t, srv, 999999)

	assert.Equal(t, http.StatusNotFound, rec.Code)
	assert.Equal(t, "unknown_session", decodeErrorCode(t, rec))
}

// TestHandleCreateShell_DirectoryMissingIs409 covers D6: the session's recorded
// directory no longer exists on disk, checked before the spawn so no tmux session is
// ever created.
func TestHandleCreateShell_DirectoryMissingIs409(t *testing.T) {
	srv, fake := newFakeTmuxTestServer(t)
	sess := launchRealSession(t, srv, sleepForeverCommand())
	require.NoError(t, os.RemoveAll(sess.Directory))

	rec, _, _ := postShellRequest(t, srv, sess.ID)

	assert.Equal(t, http.StatusConflict, rec.Code)
	assert.Equal(t, "directory_missing", decodeErrorCode(t, rec))
	assert.Equal(t, 0, fake.newNamedSessionCalls, "a 409 must leave no tmux session behind")
}

// TestHandleCreateShell_DeadSessionSucceeds covers D5/REQ-7: a shell can be started on a
// session whose alive is false — the route never consults it. markSessionDead (a direct
// store flip) stands in for a real kill+liveness-nudge cycle (see its doc comment).
func TestHandleCreateShell_DeadSessionSucceeds(t *testing.T) {
	srv, _ := newFakeTmuxTestServer(t)
	sess := launchRealSession(t, srv, sleepForeverCommand())
	markSessionDead(t, srv, sess.ID)

	rec, target, created := postShellRequest(t, srv, sess.ID)

	assert.Equal(t, http.StatusOK, rec.Code)
	assert.True(t, created)
	exists, err := srv.tmuxClient.PaneExists(context.Background(), target)
	require.NoError(t, err)
	assert.True(t, exists, "D5: a shell must actually spawn for a dead session")
}

// TestHandleCreateShell_SpawnFailureIs500ShellSpawnFailed covers Edge Case 3/D9: a
// spawner error propagates as 500 shell_spawn_failed — the seam this plan adds must not
// change which error surfaces. Not exercisable against a real tmux server (sessions_test.go's
// closing note: tmux new-session has no environment-independent way to be made to fail
// synchronously), so this is new coverage the fake makes possible.
func TestHandleCreateShell_SpawnFailureIs500ShellSpawnFailed(t *testing.T) {
	srv, fake := newFakeTmuxTestServer(t)
	sess := launchRealSession(t, srv, sleepForeverCommand())
	fake.newNamedSessionErr = fmt.Errorf("boom: tmux new-session failed")

	rec, _, _ := postShellRequest(t, srv, sess.ID)

	assert.Equal(t, http.StatusInternalServerError, rec.Code)
	assert.Equal(t, "shell_spawn_failed", decodeErrorCode(t, rec))
}

// TestHandleCreateShell_RequiresCookie covers the auth wiring for the new endpoint.
func TestHandleCreateShell_RequiresCookie(t *testing.T) {
	srv, _ := newFakeTmuxTestServer(t)
	sess := launchRealSession(t, srv, sleepForeverCommand())

	req := httptest.NewRequest(http.MethodPost, "/api/sessions/"+strconv.FormatInt(sess.ID, 10)+"/shell", nil)
	rec := httptest.NewRecorder()
	srv.Handler().ServeHTTP(rec, req)

	assert.Equal(t, http.StatusUnauthorized, rec.Code)
}

// TestHandleCreateShell_LeavesSettingsLocalJSONUnchanged covers REQ-2's settings half:
// "no settings.local.json write" (the review's Major 2 coverage gap — grepping every
// test file and the E2E spec for "settings.local.json" previously returned nothing).
//
// Unlike every other test in this file, this one cannot use launchRealSession: that
// helper bypasses sessionLauncher.Launch entirely (it spawns the tmux window directly
// via srv.tmuxClient.NewSession), so it never calls writeSettings and the directory
// would start with no settings.local.json at all — which would let a test assert
// "absent" and pass for the wrong reason. A real parent launch (via sessionLauncher, the
// same path the HTTP POST /api/sessions route uses) always writes that file first, so
// the correct oracle is "byte- and mtime-identical across the shell POST", never
// "absent" — exactly the caveat the fix-mode task named.
func TestHandleCreateShell_LeavesSettingsLocalJSONUnchanged(t *testing.T) {
	srv, _ := newFakeTmuxTestServer(t)

	dir := t.TempDir()
	l := &sessionLauncher{
		store: srv.store, manager: srv.manager, tmux: srv.tmuxClient, log: zerolog.Nop(),
		claudeBin:  "irrelevant-never-reached",
		hookScript: "/bin/true", statusLineScript: "/bin/true",
	}
	sess, lerr := l.Launch(context.Background(), createSessionRequest{
		Directory: dir, Model: "sonnet", PermissionMode: "default",
	})
	require.Nil(t, lerr)

	settingsPath := filepath.Join(dir, ".claude", "settings.local.json")
	beforeContent, err := os.ReadFile(settingsPath)
	require.NoError(t, err, "the parent session's own launch must have written settings.local.json before the shell POST")
	beforeInfo, err := os.Stat(settingsPath)
	require.NoError(t, err)

	rec, _, created := postShellRequest(t, srv, sess.ID)
	require.Equal(t, http.StatusOK, rec.Code)
	require.True(t, created)

	afterContent, err := os.ReadFile(settingsPath)
	require.NoError(t, err)
	afterInfo, err := os.Stat(settingsPath)
	require.NoError(t, err)

	assert.Equal(t, beforeContent, afterContent, "REQ-2: POST .../shell must never modify settings.local.json's content")
	assert.Equal(t, beforeInfo.ModTime(), afterInfo.ModTime(), "REQ-2: POST .../shell must never rewrite settings.local.json, even byte-identically")
}

// TestHandleShellTerminal_NoShellIs409NoShell covers D8: attaching before any POST
// .../shell has ever created one is refused pre-upgrade.
func TestHandleShellTerminal_NoShellIs409NoShell(t *testing.T) {
	srv, _ := newFakeTmuxTestServer(t)
	sess := launchRealSession(t, srv, sleepForeverCommand())
	httpSrv := httptest.NewServer(srv.Handler())
	t.Cleanup(httpSrv.Close)

	_, resp, err := dialShell(t, httpSrv, sess.ID)

	require.Error(t, err)
	require.NotNil(t, resp)
	defer func() { _ = resp.Body.Close() }()
	assert.Equal(t, http.StatusConflict, resp.StatusCode)
}

// TestHandleShellTerminal_UnknownSessionIs404 covers the Protocol Contract's pre-upgrade
// 404 not_found for an id with no session at all.
func TestHandleShellTerminal_UnknownSessionIs404(t *testing.T) {
	srv, _ := newFakeTmuxTestServer(t)
	httpSrv := httptest.NewServer(srv.Handler())
	t.Cleanup(httpSrv.Close)

	_, resp, err := dialShell(t, httpSrv, 999999)

	require.Error(t, err)
	require.NotNil(t, resp)
	defer func() { _ = resp.Body.Close() }()
	assert.Equal(t, http.StatusNotFound, resp.StatusCode)
}

// TestHandleShellTerminal_AttachOnlyNeverSpawns covers the Protocol Contract's "Attach
// only: this route never spawns" clause directly: dialing before a POST fails 409 (D8,
// above), and a *successful* dial only ever follows a POST that already reported
// created:true or false — this test additionally proves the WS route itself performs no
// spawn side effect by checking no shell session appears on the socket after the failed
// dial from TestHandleShellTerminal_NoShellIs409NoShell-style rejection.
func TestHandleShellTerminal_AttachOnlyNeverSpawns(t *testing.T) {
	srv, fake := newFakeTmuxTestServer(t)
	sess := launchRealSession(t, srv, sleepForeverCommand())
	httpSrv := httptest.NewServer(srv.Handler())
	t.Cleanup(httpSrv.Close)

	_, resp, err := dialShell(t, httpSrv, sess.ID)
	require.Error(t, err)
	_ = resp.Body.Close()

	exists, perr := srv.tmuxClient.PaneExists(context.Background(), tmux.ShellSessionName(sess.ID))
	require.NoError(t, perr)
	assert.False(t, exists, "a rejected/attempted WS dial must never itself spawn a shell")
	assert.Equal(t, 0, fake.newNamedSessionCalls, "a rejected/attempted WS dial must never itself spawn a shell")
}

// TestHandleShellTerminal_StreamsPTYOutputAndAcceptsInput is the shell surface's D1/D2
// round trip, mirroring TestHandleTerminal_StreamsPTYOutputAndAcceptsInput for the
// Claude surface.
func TestHandleShellTerminal_StreamsPTYOutputAndAcceptsInput(t *testing.T) {
	srv := newTerminalTestServer(t)
	// interactiveShellArgv() (shells.go) reads os.Getenv("SHELL"); pointing it at a
	// plain, fast shell keeps these tests deterministic and independent of whatever
	// $SHELL happens to be configured on the machine running them (a heavy zshrc with
	// nvm/oh-my-zsh etc. can take multiple seconds to become interactive) — proving the
	// daemon spawns *some* real interactive shell and behaves correctly around it, which
	// is this suite's job; the E2E suite's own REQ-1 note already covers "the user's
	// actual $SHELL really works".
	t.Setenv("SHELL", "/bin/sh")
	sess := launchRealSession(t, srv, sleepForeverCommand())
	httpSrv := httptest.NewServer(srv.Handler())
	t.Cleanup(httpSrv.Close)
	_, _, created := postShellRequest(t, srv, sess.ID)
	require.True(t, created)
	t.Cleanup(func() { _ = srv.tmuxClient.KillSession(context.Background(), tmux.ShellSessionName(sess.ID)) })

	c := dialShellOK(t, httpSrv, sess.ID)
	defer func() { _ = c.CloseNow() }()

	require.NoError(t, c.Write(context.Background(), websocket.MessageBinary, []byte("echo MUSTER_SHELL_MARKER\n")))

	out := readUntilContains(t, c, "MUSTER_SHELL_MARKER", 5*time.Second)
	assert.Contains(t, out, "MUSTER_SHELL_MARKER")
}

// TestHandleShellTerminal_RunsInTheSessionsOwnDirectory covers E3's daemon-side half:
// the shell's cwd is the session's own directory, matching REQ-1.
func TestHandleShellTerminal_RunsInTheSessionsOwnDirectory(t *testing.T) {
	srv := newTerminalTestServer(t)
	// interactiveShellArgv() (shells.go) reads os.Getenv("SHELL"); pointing it at a
	// plain, fast shell keeps these tests deterministic and independent of whatever
	// $SHELL happens to be configured on the machine running them (a heavy zshrc with
	// nvm/oh-my-zsh etc. can take multiple seconds to become interactive) — proving the
	// daemon spawns *some* real interactive shell and behaves correctly around it, which
	// is this suite's job; the E2E suite's own REQ-1 note already covers "the user's
	// actual $SHELL really works".
	t.Setenv("SHELL", "/bin/sh")
	sess := launchRealSession(t, srv, sleepForeverCommand())
	httpSrv := httptest.NewServer(srv.Handler())
	t.Cleanup(httpSrv.Close)
	_, _, created := postShellRequest(t, srv, sess.ID)
	require.True(t, created)
	t.Cleanup(func() { _ = srv.tmuxClient.KillSession(context.Background(), tmux.ShellSessionName(sess.ID)) })

	c := dialShellOK(t, httpSrv, sess.ID)
	defer func() { _ = c.CloseNow() }()

	require.NoError(t, c.Write(context.Background(), websocket.MessageBinary, []byte("pwd\n")))

	// Deliberately NOT filepath.EvalSymlinks(sess.Directory): tmux sets the new pane's
	// $PWD verbatim from -c's argument (confirmed by this test failing against the
	// resolved form on macOS, where t.TempDir() lives under a /var/folders symlink to
	// /private/var/folders) — a shell's logical `pwd` builtin echoes that literal value
	// back, not the physical getcwd() result. internal/tmux's own
	// TestNewSession_SpawnsInTheGivenDirectory resolves both sides before comparing
	// because it spawns a *non-interactive* `sh -c` with no inherited $PWD at all (where
	// the shell falls back to a real getcwd()); this test's shell is the ordinary
	// interactive one REQ-1 specifies, which does inherit tmux's own PWD.
	out := readUntilContains(t, c, sess.Directory, 5*time.Second)
	assert.Contains(t, out, sess.Directory)
}

// TestHandleShellTerminal_SecondSocketSupersedesFirstButNeverTheClaudeSocket covers
// INV-3 from the shell side: a second shell socket supersedes the first (4000), exactly
// like the Claude surface already does, while the same session's Claude socket — opened
// and left untouched throughout — is never closed by any of it.
func TestHandleShellTerminal_SecondSocketSupersedesFirstButNeverTheClaudeSocket(t *testing.T) {
	srv := newTerminalTestServer(t)
	// interactiveShellArgv() (shells.go) reads os.Getenv("SHELL"); pointing it at a
	// plain, fast shell keeps these tests deterministic and independent of whatever
	// $SHELL happens to be configured on the machine running them (a heavy zshrc with
	// nvm/oh-my-zsh etc. can take multiple seconds to become interactive) — proving the
	// daemon spawns *some* real interactive shell and behaves correctly around it, which
	// is this suite's job; the E2E suite's own REQ-1 note already covers "the user's
	// actual $SHELL really works".
	t.Setenv("SHELL", "/bin/sh")
	sess := launchRealSession(t, srv, sleepForeverCommand())
	httpSrv := httptest.NewServer(srv.Handler())
	t.Cleanup(httpSrv.Close)
	_, _, created := postShellRequest(t, srv, sess.ID)
	require.True(t, created)
	t.Cleanup(func() { _ = srv.tmuxClient.KillSession(context.Background(), tmux.ShellSessionName(sess.ID)) })

	claudeConn := dialTerminalOK(t, httpSrv, sess.ID)
	defer func() { _ = claudeConn.CloseNow() }()

	shell1 := dialShellOK(t, httpSrv, sess.ID)
	defer func() { _ = shell1.CloseNow() }()
	shell2 := dialShellOK(t, httpSrv, sess.ID)
	defer func() { _ = shell2.CloseNow() }()

	// readUntilError, not a single Read: shell1 may still have ordinary tmux repaint
	// output queued ahead of the server-initiated close (readUntilError's own doc
	// comment) — a bare single Read here flaked by capturing that output frame instead
	// of the close, exactly the trap terminal_test.go's helper exists to avoid.
	readErr := readUntilError(t, shell1, 3*time.Second)
	require.Error(t, readErr)
	assert.Equal(t, websocket.StatusCode(4000), websocket.CloseStatus(readErr), "INV-3: a second shell socket supersedes the first")

	// The Claude socket, opened before either shell socket and never touched again, must
	// still be perfectly healthy — proves the shell surface's takeover key never crosses
	// into the Claude surface's key.
	require.NoError(t, claudeConn.Write(context.Background(), websocket.MessageBinary, []byte("echo CLAUDE_STILL_FINE\n")))
	out := readUntilContains(t, claudeConn, "CLAUDE_STILL_FINE", 5*time.Second)
	assert.Contains(t, out, "CLAUDE_STILL_FINE", "INV-3: the Claude socket must never be superseded by shell-surface activity")

	// The surviving (second) shell socket must also still work.
	require.NoError(t, shell2.Write(context.Background(), websocket.MessageBinary, []byte("echo SECOND_SHELL_FINE\n")))
	out2 := readUntilContains(t, shell2, "SECOND_SHELL_FINE", 5*time.Second)
	assert.Contains(t, out2, "SECOND_SHELL_FINE")
}

// TestHandleTerminal_OpeningClaudeSocketNeverSupersedesAnOpenShellSocket is INV-3's
// other direction: opening the Claude socket must never evict an already-open shell
// socket for the same session.
func TestHandleTerminal_OpeningClaudeSocketNeverSupersedesAnOpenShellSocket(t *testing.T) {
	srv := newTerminalTestServer(t)
	// interactiveShellArgv() (shells.go) reads os.Getenv("SHELL"); pointing it at a
	// plain, fast shell keeps these tests deterministic and independent of whatever
	// $SHELL happens to be configured on the machine running them (a heavy zshrc with
	// nvm/oh-my-zsh etc. can take multiple seconds to become interactive) — proving the
	// daemon spawns *some* real interactive shell and behaves correctly around it, which
	// is this suite's job; the E2E suite's own REQ-1 note already covers "the user's
	// actual $SHELL really works".
	t.Setenv("SHELL", "/bin/sh")
	sess := launchRealSession(t, srv, sleepForeverCommand())
	httpSrv := httptest.NewServer(srv.Handler())
	t.Cleanup(httpSrv.Close)
	_, _, created := postShellRequest(t, srv, sess.ID)
	require.True(t, created)
	t.Cleanup(func() { _ = srv.tmuxClient.KillSession(context.Background(), tmux.ShellSessionName(sess.ID)) })

	shellConn := dialShellOK(t, httpSrv, sess.ID)
	defer func() { _ = shellConn.CloseNow() }()

	claudeConn := dialTerminalOK(t, httpSrv, sess.ID)
	defer func() { _ = claudeConn.CloseNow() }()

	require.NoError(t, shellConn.Write(context.Background(), websocket.MessageBinary, []byte("echo SHELL_UNTOUCHED\n")))
	out := readUntilContains(t, shellConn, "SHELL_UNTOUCHED", 5*time.Second)
	assert.Contains(t, out, "SHELL_UNTOUCHED", "INV-3: opening the Claude socket must never supersede an open shell socket")
}

// TestHandleShellTerminal_ShellDeathNeverNudgesTheParentsLiveness covers kb:anchor/terminal.shell-ws's
// nudgeOnEOF:false clause — the actual daemon-logic difference from the Claude surface —
// using a parent whose Claude tmux target was never created at all (see
// seedDeadSessionWithBogusClaudeTarget's doc comment): if the shell handler wrongly
// nudged the liveness poll on PTY EOF (as the Claude surface correctly does), Alive would
// flip to false near-instantly since that bogus target is already gone. Typing "exit"
// into a real interactive shell (REQ-1's real $SHELL) is what actually produces the PTY
// EOF here, matching E6/E8's own path rather than an external kill.
func TestHandleShellTerminal_ShellDeathNeverNudgesTheParentsLiveness(t *testing.T) {
	srv := newTerminalTestServer(t)
	// interactiveShellArgv() (shells.go) reads os.Getenv("SHELL"); pointing it at a
	// plain, fast shell keeps these tests deterministic and independent of whatever
	// $SHELL happens to be configured on the machine running them (a heavy zshrc with
	// nvm/oh-my-zsh etc. can take multiple seconds to become interactive) — proving the
	// daemon spawns *some* real interactive shell and behaves correctly around it, which
	// is this suite's job; the E2E suite's own REQ-1 note already covers "the user's
	// actual $SHELL really works".
	t.Setenv("SHELL", "/bin/sh")
	id, _ := seedDeadSessionWithBogusClaudeTarget(t, srv)
	httpSrv := httptest.NewServer(srv.Handler())
	t.Cleanup(httpSrv.Close)
	_, _, created := postShellRequest(t, srv, id)
	require.True(t, created)
	t.Cleanup(func() { _ = srv.tmuxClient.KillSession(context.Background(), tmux.ShellSessionName(id)) })

	c := dialShellOK(t, httpSrv, id)
	defer func() { _ = c.CloseNow() }()

	require.NoError(t, c.Write(context.Background(), websocket.MessageBinary, []byte("exit\n")))

	readErr := readUntilError(t, c, 5*time.Second)
	require.Error(t, readErr)
	assert.Equal(t, websocket.StatusCode(4001), websocket.CloseStatus(readErr))

	// Give any (wrongly-firing) nudge every chance to land before asserting it didn't:
	// a real nudge against a target that was never created resolves in well under this.
	time.Sleep(500 * time.Millisecond)
	got, ok := srv.manager.Get(id)
	require.True(t, ok)
	assert.True(t, got.Alive, "kb:anchor/terminal.shell-ws: a shell's own death must never nudge (and so never flip) its parent session's liveness")
}

// TestHandleShellTerminal_KilledExternallyClosesSocketWith4001 covers the external-kill
// variant of the same PTY-EOF path (edge case 6's shell analogue): tmux kill-session
// produces the same 4001, not merely a graceful "exit".
func TestHandleShellTerminal_KilledExternallyClosesSocketWith4001(t *testing.T) {
	srv := newTerminalTestServer(t)
	// interactiveShellArgv() (shells.go) reads os.Getenv("SHELL"); pointing it at a
	// plain, fast shell keeps these tests deterministic and independent of whatever
	// $SHELL happens to be configured on the machine running them (a heavy zshrc with
	// nvm/oh-my-zsh etc. can take multiple seconds to become interactive) — proving the
	// daemon spawns *some* real interactive shell and behaves correctly around it, which
	// is this suite's job; the E2E suite's own REQ-1 note already covers "the user's
	// actual $SHELL really works".
	t.Setenv("SHELL", "/bin/sh")
	sess := launchRealSession(t, srv, sleepForeverCommand())
	httpSrv := httptest.NewServer(srv.Handler())
	t.Cleanup(httpSrv.Close)
	_, target, created := postShellRequest(t, srv, sess.ID)
	require.True(t, created)

	c := dialShellOK(t, httpSrv, sess.ID)
	defer func() { _ = c.CloseNow() }()

	require.NoError(t, srv.tmuxClient.KillSession(context.Background(), target))

	readErr := readUntilError(t, c, 5*time.Second)
	require.Error(t, readErr)
	assert.Equal(t, websocket.StatusCode(4001), websocket.CloseStatus(readErr))
}

// TestHandleRemoveSession_KillsBothTmuxSessionsForThatSessionOnlyAnotherSurvives covers
// D9/INV-4 together: removing one session kills both its Claude and shell tmux sessions,
// while a second session's Claude and shell sessions (never touched) survive completely
// untouched — the multi-instance destructive-path coverage this class of test requires.
func TestHandleRemoveSession_KillsBothTmuxSessionsForThatSessionOnlyAnotherSurvives(t *testing.T) {
	srv := newTerminalTestServer(t)
	// interactiveShellArgv() (shells.go) reads os.Getenv("SHELL"); pointing it at a
	// plain, fast shell keeps these tests deterministic and independent of whatever
	// $SHELL happens to be configured on the machine running them (a heavy zshrc with
	// nvm/oh-my-zsh etc. can take multiple seconds to become interactive) — proving the
	// daemon spawns *some* real interactive shell and behaves correctly around it, which
	// is this suite's job; the E2E suite's own REQ-1 note already covers "the user's
	// actual $SHELL really works".
	t.Setenv("SHELL", "/bin/sh")
	removed := launchRealSession(t, srv, sleepForeverCommand())
	survivor := launchRealSession(t, srv, sleepForeverCommand())
	t.Cleanup(func() { _ = srv.tmuxClient.KillSession(context.Background(), tmux.ShellSessionName(survivor.ID)) })

	_, removedShellTarget, created1 := postShellRequest(t, srv, removed.ID)
	require.True(t, created1)
	_, survivorShellTarget, created2 := postShellRequest(t, srv, survivor.ID)
	require.True(t, created2)

	rec := sessionActionRequest(t, srv, http.MethodDelete, "/api/sessions/"+strconv.FormatInt(removed.ID, 10))
	assert.Equal(t, http.StatusNoContent, rec.Code)

	claudeGone, err := srv.tmuxClient.PaneExists(context.Background(), removed.TmuxTarget)
	require.NoError(t, err)
	assert.False(t, claudeGone, "D9: Remove must kill the removed session's Claude tmux session")
	shellGone, err := srv.tmuxClient.PaneExists(context.Background(), removedShellTarget)
	require.NoError(t, err)
	assert.False(t, shellGone, "D9/REQ-9: Remove must also kill the removed session's shell tmux session")

	survivorClaudeAlive, err := srv.tmuxClient.PaneExists(context.Background(), survivor.TmuxTarget)
	require.NoError(t, err)
	assert.True(t, survivorClaudeAlive, "INV-4: removing one session must never touch another session's Claude tmux session")
	survivorShellAlive, err := srv.tmuxClient.PaneExists(context.Background(), survivorShellTarget)
	require.NoError(t, err)
	assert.True(t, survivorShellAlive, "INV-4: removing one session must never touch another session's shell tmux session")
}

// TestHandleEndSession_LeavesShellRunning covers D10: ending a session (as opposed to
// removing it) must leave its shell tmux session running.
func TestHandleEndSession_LeavesShellRunning(t *testing.T) {
	srv := newTerminalTestServer(t)
	// interactiveShellArgv() (shells.go) reads os.Getenv("SHELL"); pointing it at a
	// plain, fast shell keeps these tests deterministic and independent of whatever
	// $SHELL happens to be configured on the machine running them (a heavy zshrc with
	// nvm/oh-my-zsh etc. can take multiple seconds to become interactive) — proving the
	// daemon spawns *some* real interactive shell and behaves correctly around it, which
	// is this suite's job; the E2E suite's own REQ-1 note already covers "the user's
	// actual $SHELL really works".
	t.Setenv("SHELL", "/bin/sh")
	sess := launchRealSession(t, srv, sleepForeverCommand())
	_, shellTarget, created := postShellRequest(t, srv, sess.ID)
	require.True(t, created)
	t.Cleanup(func() { _ = srv.tmuxClient.KillSession(context.Background(), shellTarget) })

	rec := sessionActionRequest(t, srv, http.MethodPost, "/api/sessions/"+strconv.FormatInt(sess.ID, 10)+"/end")
	assert.Equal(t, http.StatusOK, rec.Code)

	shellAlive, err := srv.tmuxClient.PaneExists(context.Background(), shellTarget)
	require.NoError(t, err)
	assert.True(t, shellAlive, "D10: End must leave the session's shell running")
}

// TestShellLifecycle_NeverWritesAnySQLiteRow covers D13/INV-2: spawn, attach, type
// input, resize, exit (PTY EOF), then a full respawn, all produce zero net change to the
// total row count across session/repo/event — the tables INV-2 names. The one session
// row that legitimately exists throughout is created *before* the count baseline is
// taken, so only the shell operations themselves are under test.
// TestShellLifecycle_NeverWritesAnySQLiteRow uses newFakeTmuxTestServer (REQ-3): its own
// assertion is the row count, not that the byte stream or geometry genuinely work (which
// StreamsPTYOutputAndAcceptsInput and terminal_test.go's keep-real geometry tests already
// cover for real) — so attach/resize/exit only need to reach the fake without error, and
// "exit" is simulated by fakePaneConn's own "exit"-triggers-Close behaviour rather than a
// real interactive shell.
func TestShellLifecycle_NeverWritesAnySQLiteRow(t *testing.T) {
	srv, fake := newFakeTmuxTestServer(t)
	sess := launchRealSession(t, srv, sleepForeverCommand())
	httpSrv := httptest.NewServer(srv.Handler())
	t.Cleanup(httpSrv.Close)

	before := countAllRows(t, srv.dbPath)

	// Spawn.
	_, _, created := postShellRequest(t, srv, sess.ID)
	require.True(t, created)

	// Attach, type input, resize.
	c := dialShellOK(t, httpSrv, sess.ID)
	require.NoError(t, c.Write(context.Background(), websocket.MessageBinary, []byte("ROW_COUNT_MARKER\n")))
	require.NoError(t, c.Write(context.Background(), websocket.MessageText, []byte(`{"type":"resize","cols":100,"rows":30}`)))
	require.Eventually(t, func() bool {
		conn := fake.lastPaneConn()
		if conn == nil {
			return false
		}
		cols, _ := conn.resize()
		return cols == 100
	}, 3*time.Second, 20*time.Millisecond)

	// Exit (simulated PTY EOF), then respawn (D7).
	require.NoError(t, c.Write(context.Background(), websocket.MessageBinary, []byte("exit\n")))
	_ = readUntilError(t, c, 5*time.Second)
	_, _, created2 := postShellRequest(t, srv, sess.ID)
	require.True(t, created2, "the exit above must have left no pane behind, so this respawns")

	after := countAllRows(t, srv.dbPath)
	assert.Equal(t, before, after, "INV-2: no shell operation may write any session, repo or event row")
}
