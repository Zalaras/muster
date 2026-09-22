package server

import (
	"context"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/coder/websocket"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/Zalaras/muster/internal/claudecode"
	"github.com/Zalaras/muster/internal/tmux"
)

// TestHandleShellTerminal_SuccessfulAttachMarksSessionSeen covers D8/Edge Case 31: the
// shell surface's attach side effect mirrors the Claude surface's exactly (terminal.go
// and shells.go both call manager.MarkSeen after a successful takeover, before any PTY
// byte is forwarded) — proven here on the shell socket the same way
// TestHandleTerminal_SuccessfulAttachMarksSessionSeen (terminal_rail_test.go) proves it
// on the Claude one.
func TestHandleShellTerminal_SuccessfulAttachMarksSessionSeen(t *testing.T) {
	srv := newTerminalTestServer(t)
	t.Setenv("SHELL", "/bin/sh")
	sess := launchRealSession(t, srv, sleepForeverCommand())
	ctx := context.Background()
	_, err := srv.manager.Apply(ctx, sess.ID, "claude-1", nil, claudecode.StateInput{Kind: claudecode.KindBind}, true)
	require.NoError(t, err)
	_, err = srv.manager.Apply(ctx, sess.ID, "claude-1", nil, claudecode.StateInput{Kind: claudecode.KindTurnClosed}, true)
	require.NoError(t, err)
	before, ok := srv.manager.Get(sess.ID)
	require.True(t, ok)
	require.True(t, before.Unread, "sanity: an unwatched turn_closed set Unread before any attach")

	httpSrv := httptest.NewServer(srv.Handler())
	t.Cleanup(httpSrv.Close)
	_, _, created := postShellRequest(t, srv, sess.ID)
	require.True(t, created)
	t.Cleanup(func() { _ = srv.tmuxClient.KillSession(context.Background(), tmux.ShellSessionName(sess.ID)) })

	c := dialShellOK(t, httpSrv, sess.ID)
	defer func() { _ = c.CloseNow() }()
	require.NoError(t, c.Write(ctx, websocket.MessageBinary, []byte("echo MUSTER_SHELL_SEEN_MARKER\n")))
	out := readUntilContains(t, c, "MUSTER_SHELL_SEEN_MARKER", 5*time.Second)
	require.Contains(t, out, "MUSTER_SHELL_SEEN_MARKER", "sanity: at least one PTY byte was forwarded")

	after, ok := srv.manager.Get(sess.ID)
	require.True(t, ok)
	assert.False(t, after.Unread, "D8/Edge Case 31: a successful shell-surface attach must also mark the session seen")

	persisted, perr := srv.store.GetSession(ctx, sess.ID)
	require.NoError(t, perr)
	assert.False(t, persisted.Unread)
}
