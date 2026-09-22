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
)

// TestTerminalRegistry_Watched covers D9: Watched(id) is true iff a connection is
// registered for id on either surface (Claude or shell). No real websocket is needed —
// Watched only reads map membership, and terminalConn's zero value is a valid registry
// entry for that purpose (this test's assertion is never about the PTY/websocket fields
// inside it).
func TestTerminalRegistry_Watched(t *testing.T) {
	r := newTerminalRegistry()

	assert.False(t, r.Watched(1), "no connection registered at all")

	claudeKey := terminalKey{sessionID: 1, surface: surfaceClaude}
	r.conns[claudeKey] = &terminalConn{}
	assert.True(t, r.Watched(1), "a Claude-surface connection alone counts as watched")

	shellKey := terminalKey{sessionID: 1, surface: surfaceShell}
	r.conns[shellKey] = &terminalConn{}
	assert.True(t, r.Watched(1), "both surfaces registered still counts as watched")

	delete(r.conns, claudeKey)
	assert.True(t, r.Watched(1), "the shell surface alone still counts as watched")

	delete(r.conns, shellKey)
	assert.False(t, r.Watched(1), "neither surface registered: not watched")
}

// TestTerminalRegistry_Watched_MultiSessionIndependence covers D9's second clause and
// Edge Case 4: registering (and later removing) one session's connection must never
// change another session's Watched answer — asserted with two sessions coexisting on the
// same shared registry, not inferred from a single-session test
// (kb:lesson/detach-on-destroy-misrouted-keystrokes: "nothing else was harmed" is an
// assertion, not an assumption).
func TestTerminalRegistry_Watched_MultiSessionIndependence(t *testing.T) {
	r := newTerminalRegistry()
	keyA := terminalKey{sessionID: 1, surface: surfaceClaude}
	keyB := terminalKey{sessionID: 2, surface: surfaceClaude}

	r.conns[keyA] = &terminalConn{}
	assert.True(t, r.Watched(1))
	assert.False(t, r.Watched(2), "attaching session 1 must never mark session 2 watched")

	r.conns[keyB] = &terminalConn{}
	assert.True(t, r.Watched(1))
	assert.True(t, r.Watched(2))

	delete(r.conns, keyA)
	assert.False(t, r.Watched(1))
	assert.True(t, r.Watched(2), "removing session 1's connection must never affect session 2's")
}

// TestHandleTerminal_SuccessfulAttachMarksSessionSeen covers D8/REQ-8's Claude-surface
// attach side effect: a takeover clears Unread, persists and broadcasts, before any PTY
// byte is forwarded — proven by asserting the clear has already happened by the time the
// very first byte arrives on the socket (MarkSeen is a synchronous call in
// handleTerminal that runs before the pump goroutines even start, terminal.go).
func TestHandleTerminal_SuccessfulAttachMarksSessionSeen(t *testing.T) {
	srv := newTerminalTestServer(t)
	sess := launchRealSession(t, srv, shellCommand())
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
	c := dialTerminalOK(t, httpSrv, sess.ID)
	defer func() { _ = c.CloseNow() }()

	require.NoError(t, c.Write(ctx, websocket.MessageBinary, []byte("echo MUSTER_SEEN_MARKER\n")))
	out := readUntilContains(t, c, "MUSTER_SEEN_MARKER", 5*time.Second)
	require.Contains(t, out, "MUSTER_SEEN_MARKER", "sanity: at least one PTY byte was forwarded")

	after, ok := srv.manager.Get(sess.ID)
	require.True(t, ok)
	assert.False(t, after.Unread, "D8: a successful takeover must mark the session seen")

	persisted, perr := srv.store.GetSession(ctx, sess.ID)
	require.NoError(t, perr)
	assert.False(t, persisted.Unread)
}

// TestHandleTerminal_AttachOnAnAlreadyReadSessionDoesNotBroadcast covers D8's no-op
// half: attaching to a session that was never unread must not produce an extra
// sessionUpsert (MarkSeen returns early without persisting or broadcasting).
func TestHandleTerminal_AttachOnAnAlreadyReadSessionDoesNotBroadcast(t *testing.T) {
	srv := newTerminalTestServer(t)
	sess := launchRealSession(t, srv, shellCommand())
	httpSrv := httptest.NewServer(srv.Handler())
	t.Cleanup(httpSrv.Close)

	uiConn, err := dialWS(t, "ws"+httpSrv.URL[len("http"):]+"/ws", nil)
	require.NoError(t, err)
	defer func() { _ = uiConn.CloseNow() }()
	_ = readJSON[helloWire](t, uiConn)
	_ = readJSON[snapshotWire](t, uiConn)

	c := dialTerminalOK(t, httpSrv, sess.ID)
	defer func() { _ = c.CloseNow() }()
	require.NoError(t, c.Write(context.Background(), websocket.MessageBinary, []byte("echo READY\n")))
	_ = readUntilContains(t, c, "READY", 5*time.Second)

	assertNoSessionUpsertArrives(t, uiConn)
}
