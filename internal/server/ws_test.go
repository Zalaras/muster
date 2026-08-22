package server

import (
	"context"
	"crypto/rand"
	"encoding/base64"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/coder/websocket"
	"github.com/coder/websocket/wsjson"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// dialWS opens a real WS connection to the server under test, sending the auth cookie.
// extraHeaders lets a test override e.g. Origin. It intentionally discards the handshake
// *http.Response: callers that only care about a successful upgrade have nothing to close
// (coder/websocket's Dial nils out resp.Body on success — "you never need to close
// resp.Body yourself", dial.go); the one test that inspects a failed handshake's response
// dials directly instead so it can close that body itself.
func dialWS(t *testing.T, wsURL string, extraHeaders http.Header) (*websocket.Conn, error) {
	t.Helper()
	header := http.Header{"Cookie": {cookieName + "=" + testUIToken}}
	for k, vs := range extraHeaders {
		header[k] = vs
	}
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	c, _, err := websocket.Dial(ctx, wsURL, &websocket.DialOptions{HTTPHeader: header}) //nolint:bodyclose
	return c, err
}

func readJSON[T any](t *testing.T, c *websocket.Conn) T {
	t.Helper()
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	var v T
	require.NoError(t, wsjson.Read(ctx, c, &v))
	return v
}

type helloWire struct {
	Type            string `json:"type"`
	ProtocolVersion int    `json:"protocolVersion"`
	Daemon          struct {
		Version string `json:"version"`
	} `json:"daemon"`
	ClaudeCode struct {
		Pinned    string  `json:"pinned"`
		Installed *string `json:"installed"`
		Drift     *bool   `json:"drift"`
	} `json:"claudeCode"`
}

type snapshotWire struct {
	Type     string `json:"type"`
	Sessions []any  `json:"sessions"`
	Usage    struct {
		FiveHour  *struct{} `json:"fiveHour"`
		SevenDay  *struct{} `json:"sevenDay"`
		SampledAt *string   `json:"sampledAt"`
		Source    string    `json:"source"`
	} `json:"usage"`
	Prefs struct {
		View string `json:"view"`
	} `json:"prefs"`
}

func TestHandleWS_SendsHelloThenSnapshot(t *testing.T) {
	installed := "2.1.239"
	drift := true
	srv := newTestServer(t, ClaudeCodeInfo{Pinned: "2.1.233", Installed: &installed, Drift: &drift})
	httpSrv := httptest.NewServer(srv.Handler())
	t.Cleanup(httpSrv.Close)

	wsURL := "ws" + httpSrv.URL[len("http"):] + "/ws"
	c, err := dialWS(t, wsURL, nil)
	require.NoError(t, err)
	defer func() { _ = c.CloseNow() }()

	hello := readJSON[helloWire](t, c)
	assert.Equal(t, "hello", hello.Type)
	assert.Equal(t, 1, hello.ProtocolVersion)
	assert.Equal(t, "test-version", hello.Daemon.Version)
	assert.Equal(t, "2.1.233", hello.ClaudeCode.Pinned)
	require.NotNil(t, hello.ClaudeCode.Installed)
	assert.Equal(t, "2.1.239", *hello.ClaudeCode.Installed)
	require.NotNil(t, hello.ClaudeCode.Drift)
	assert.True(t, *hello.ClaudeCode.Drift)

	snap := readJSON[snapshotWire](t, c)
	assert.Equal(t, "snapshot", snap.Type)
	assert.Empty(t, snap.Sessions)
	assert.Nil(t, snap.Usage.FiveHour)
	assert.Nil(t, snap.Usage.SevenDay)
	assert.Nil(t, snap.Usage.SampledAt)
	assert.Equal(t, "subscription", snap.Usage.Source)
	assert.Equal(t, "focus", snap.Prefs.View)
}

func TestHandleWS_ClaudeCodeInstalledAndDriftNullWhenVersionCheckFailed(t *testing.T) {
	// REQ-8/Edge Case 12: installed/drift are null (not false/empty) when the startup
	// `claude --version` check failed — never rendered as drift.
	srv := newTestServer(t, ClaudeCodeInfo{Pinned: "2.1.233", Installed: nil, Drift: nil})
	httpSrv := httptest.NewServer(srv.Handler())
	t.Cleanup(httpSrv.Close)

	wsURL := "ws" + httpSrv.URL[len("http"):] + "/ws"
	c, err := dialWS(t, wsURL, nil)
	require.NoError(t, err)
	defer func() { _ = c.CloseNow() }()

	hello := readJSON[helloWire](t, c)
	assert.Nil(t, hello.ClaudeCode.Installed)
	assert.Nil(t, hello.ClaudeCode.Drift)
}

func TestHandleWS_RequiresCookie(t *testing.T) {
	srv := newTestServer(t, ClaudeCodeInfo{})
	httpSrv := httptest.NewServer(srv.Handler())
	t.Cleanup(httpSrv.Close)

	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	wsURL := "ws" + httpSrv.URL[len("http"):] + "/ws"
	_, resp, err := websocket.Dial(ctx, wsURL, nil) // no cookie at all
	require.Error(t, err)
	require.NotNil(t, resp)
	defer func() { _ = resp.Body.Close() }()
	assert.Equal(t, http.StatusUnauthorized, resp.StatusCode)
}

func TestHandleWS_RejectsForeignOrigin(t *testing.T) {
	// REQ-7 / Edge Case 11: an Origin header present but whose host differs from the
	// request Host is rejected with a plain 403 — the daemon's own default behaviour
	// (coder/websocket's Accept, before any hijack), not a bespoke check.
	srv := newTestServer(t, ClaudeCodeInfo{})
	httpSrv := httptest.NewServer(srv.Handler())
	t.Cleanup(httpSrv.Close)

	req, err := http.NewRequest(http.MethodGet, httpSrv.URL+"/ws", nil)
	require.NoError(t, err)
	req.Header.Set("Cookie", cookieName+"="+testUIToken)
	req.Header.Set("Connection", "Upgrade")
	req.Header.Set("Upgrade", "websocket")
	req.Header.Set("Sec-WebSocket-Version", "13")
	req.Header.Set("Sec-WebSocket-Key", randomSecWebSocketKey(t))
	req.Header.Set("Origin", "http://evil.example.com")

	resp, err := http.DefaultClient.Do(req)
	require.NoError(t, err)
	defer func() { _ = resp.Body.Close() }()

	assert.Equal(t, http.StatusForbidden, resp.StatusCode)
}

func TestHandleWS_AllowsAbsentOrigin(t *testing.T) {
	// Edge Case 11: a non-browser client (curl, tests, coder/websocket's own Dial) sends
	// no Origin header at all, and must be allowed through.
	srv := newTestServer(t, ClaudeCodeInfo{})
	httpSrv := httptest.NewServer(srv.Handler())
	t.Cleanup(httpSrv.Close)

	req, err := http.NewRequest(http.MethodGet, httpSrv.URL+"/ws", nil)
	require.NoError(t, err)
	req.Header.Set("Cookie", cookieName+"="+testUIToken)
	req.Header.Set("Connection", "Upgrade")
	req.Header.Set("Upgrade", "websocket")
	req.Header.Set("Sec-WebSocket-Version", "13")
	req.Header.Set("Sec-WebSocket-Key", randomSecWebSocketKey(t))
	// Deliberately no Origin header.

	resp, err := http.DefaultClient.Do(req)
	require.NoError(t, err)
	defer func() { _ = resp.Body.Close() }()

	assert.Equal(t, http.StatusSwitchingProtocols, resp.StatusCode)
}

func TestHandleWS_MultipleClientsEachGetHelloAndSnapshot(t *testing.T) {
	// Edge Case 13: the registry must handle N clients even though M0 never broadcasts
	// after the initial handshake.
	srv := newTestServer(t, ClaudeCodeInfo{})
	httpSrv := httptest.NewServer(srv.Handler())
	t.Cleanup(httpSrv.Close)

	wsURL := "ws" + httpSrv.URL[len("http"):] + "/ws"

	c1, err := dialWS(t, wsURL, nil)
	require.NoError(t, err)
	defer func() { _ = c1.CloseNow() }()

	c2, err := dialWS(t, wsURL, nil)
	require.NoError(t, err)
	defer func() { _ = c2.CloseNow() }()

	for _, c := range []*websocket.Conn{c1, c2} {
		hello := readJSON[helloWire](t, c)
		assert.Equal(t, "hello", hello.Type)
		snap := readJSON[snapshotWire](t, c)
		assert.Equal(t, "snapshot", snap.Type)
	}
}

func TestServerShutdown_ClosesOpenWSConnections(t *testing.T) {
	srv := newTestServer(t, ClaudeCodeInfo{})
	httpSrv := httptest.NewServer(srv.Handler())
	t.Cleanup(httpSrv.Close)

	wsURL := "ws" + httpSrv.URL[len("http"):] + "/ws"
	c, err := dialWS(t, wsURL, nil)
	require.NoError(t, err)
	defer func() { _ = c.CloseNow() }()

	_ = readJSON[helloWire](t, c)
	_ = readJSON[snapshotWire](t, c)

	// The server's CloseRead means it discards client frames but still needs the client to
	// participate in the close handshake to unblock quickly, exactly like a real reconnect
	// loop's read would. Read concurrently with Shutdown so the close round-trip finishes
	// fast instead of waiting out the library's close-handshake timeout.
	readErr := make(chan error, 1)
	go func() {
		ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
		defer cancel()
		_, _, err := c.Read(ctx)
		readErr <- err
	}()

	srv.Shutdown(context.Background())

	select {
	case err := <-readErr:
		assert.Error(t, err, "client read must fail once the server closes the connection on Shutdown")
	case <-time.After(5 * time.Second):
		t.Fatal("client connection was not closed by Shutdown")
	}
}

func randomSecWebSocketKey(t *testing.T) string {
	t.Helper()
	b := make([]byte, 16)
	_, err := rand.Read(b)
	require.NoError(t, err)
	return base64.StdEncoding.EncodeToString(b)
}
