package server

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strconv"
	"testing"
	"time"

	"github.com/coder/websocket"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// revWindow is a /ws client that reads `terminals` messages as the wire carries them,
// as raw JSON maps so nothing here names a Go field the daemon may not have yet.
type revWindow struct {
	t *testing.T
	c *websocket.Conn
}

// newRevServer is newFakeTmuxTestServer with the terminal poller listing the fake tmux
// (wireTerminalList) but still broadcasting to the real hub, so a `terminals` message
// reaches a /ws client exactly as the daemon builds it.
func newRevServer(t *testing.T) *testServer {
	t.Helper()
	srv, fake := newFakeTmuxTestServer(t)
	hubBroadcast := srv.shellActivity.poller.broadcast
	wireTerminalList(srv, fake)
	srv.shellActivity.poller.broadcast = hubBroadcast
	return srv
}

func dialRevWindow(t *testing.T, srv *testServer) *revWindow {
	t.Helper()
	httpSrv := httptest.NewServer(srv.Handler())
	t.Cleanup(httpSrv.Close)
	c, err := dialWS(t, "ws"+httpSrv.URL[len("http"):]+"/ws", nil)
	require.NoError(t, err)
	t.Cleanup(func() { _ = c.CloseNow() })
	_ = readJSON[map[string]any](t, c) // hello
	_ = readJSON[map[string]any](t, c) // snapshot
	return &revWindow{t: t, c: c}
}

// nextTerminals returns the next `terminals` message, skipping every other type.
func (w *revWindow) nextTerminals() map[string]any {
	w.t.Helper()
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	for {
		_, data, err := w.c.Read(ctx)
		require.NoError(w.t, err, "no terminals message arrived")
		var msg map[string]any
		require.NoError(w.t, json.Unmarshal(data, &msg))
		if msg["type"] == "terminals" {
			return msg
		}
	}
}

// revOf reads the integer `rev` (or `terminalsRev`) key from a decoded JSON object;
// a missing key is reported as -1 so the assertion fails on a value, not a panic.
func revOf(m map[string]any, key string) float64 {
	v, ok := m[key].(float64)
	if !ok {
		return -1
	}
	return v
}

func decodeRevBody(t *testing.T, body []byte) map[string]any {
	t.Helper()
	var m map[string]any
	require.NoError(t, json.Unmarshal(body, &m), string(body))
	return m
}

func TestTerminalsRev_RisesByOnePerBroadcastAcrossSessions(t *testing.T) {
	srv := newRevServer(t)
	a := launchRealSession(t, srv, sleepForeverCommand())
	b := launchRealSession(t, srv, sleepForeverCommand())
	w := dialRevWindow(t, srv)

	steps := []struct {
		id int64
	}{{a.ID}, {b.ID}, {a.ID}, {b.ID}}
	for i, st := range steps {
		rec := terminalsRequest(t, srv, http.MethodPost, shellsPath(st.id, ""), "")
		require.Equal(t, http.StatusCreated, rec.Code, rec.Body.String())

		msg := w.nextTerminals()

		assert.EqualValues(t, st.id, msg["sessionId"], "step %d", i)
		assert.Equal(t, float64(i+1), revOf(msg, "rev"), "step %d: one counter across sessions, +1 per broadcast", i)
	}
}

func TestTerminalsRev_EachRouteReplyCarriesTheSessionsLatestBroadcastRev(t *testing.T) {
	srv := newRevServer(t)
	a := launchRealSession(t, srv, sleepForeverCommand())
	b := launchRealSession(t, srv, sleepForeverCommand())
	w := dialRevWindow(t, srv)

	steps := []struct {
		name      string
		method    string
		id        int64
		rest      string
		body      string
		wantCode  int
		broadcast bool    // the call changes the list, so one terminals message follows
		wantRev   float64 // the reply's rev, which is also the session's latest message rev
	}{
		{"POST /shell spawns the first terminal", http.MethodPost, a.ID, "/shell", "", http.StatusOK, true, 1},
		{"POST /shells on another session", http.MethodPost, b.ID, "/shells", "", http.StatusCreated, true, 2},
		{"POST /shells again on the first", http.MethodPost, a.ID, "/shells", "", http.StatusCreated, true, 3},
		{"POST /shell that changes nothing answers its session's own rev, not the counter", http.MethodPost, b.ID, "/shell", "", http.StatusOK, false, 2},
		{"PUT name", http.MethodPut, a.ID, "/shells/2/name", `{"name":"build"}`, http.StatusOK, true, 4},
		{"DELETE one of two", http.MethodDelete, a.ID, "/shells/1", "", http.StatusOK, true, 5},
		{"DELETE the last answers the empty list's rev", http.MethodDelete, a.ID, "/shells/2", "", http.StatusOK, true, 6},
		{"a no-change call after the list went empty keeps the session's latest rev", http.MethodPost, b.ID, "/shell", "", http.StatusOK, false, 2},
	}
	for _, st := range steps {
		path := "/api/sessions/" + strconv.FormatInt(st.id, 10) + st.rest
		rec := terminalsRequest(t, srv, st.method, path, st.body)
		require.Equal(t, st.wantCode, rec.Code, "%s: %s", st.name, rec.Body.String())
		var msgRev float64
		if st.broadcast {
			msgRev = revOf(w.nextTerminals(), "rev")
			assert.Equal(t, st.wantRev, msgRev, "%s: the message's rev", st.name)
		}

		reply := decodeRevBody(t, rec.Body.Bytes())

		assert.Equal(t, st.wantRev, revOf(reply, "rev"), "%s: the reply's rev", st.name)
		if st.broadcast {
			assert.Equal(t, msgRev, revOf(reply, "rev"), "%s: the reply names the list that reflects the call", st.name)
		}
	}
}

func TestTerminalsRev_DeleteAnswers200WithRev(t *testing.T) {
	srv := newRevServer(t)
	sess := launchRealSession(t, srv, sleepForeverCommand())
	for range 2 {
		require.Equal(t, http.StatusCreated, terminalsRequest(t, srv, http.MethodPost, shellsPath(sess.ID, ""), "").Code)
	}

	rec := terminalsRequest(t, srv, http.MethodDelete, shellsPath(sess.ID, "/2"), "")

	require.Equal(t, http.StatusOK, rec.Code, rec.Body.String())
	reply := decodeRevBody(t, rec.Body.Bytes())
	assert.GreaterOrEqual(t, revOf(reply, "rev"), float64(1))

	errRec := terminalsRequest(t, srv, http.MethodDelete, shellsPath(sess.ID, "/2"), "")
	assertErrorResponse(t, errRec, http.StatusNotFound, "no_shell", "no such terminal")
}

func TestTerminalsRev_SnapshotCarriesTerminalsRev(t *testing.T) {
	srv := newRevServer(t)
	sess := launchRealSession(t, srv, sleepForeverCommand())
	state := func() map[string]any {
		rec := terminalsRequest(t, srv, http.MethodGet, "/api/state", "")
		require.Equal(t, http.StatusOK, rec.Code)
		return decodeRevBody(t, rec.Body.Bytes())
	}

	fresh := state()
	require.Contains(t, fresh, "terminalsRev", "always present, even before any broadcast")
	assert.Equal(t, float64(0), revOf(fresh, "terminalsRev"))

	w := dialRevWindow(t, srv)
	require.Equal(t, http.StatusCreated, terminalsRequest(t, srv, http.MethodPost, shellsPath(sess.ID, ""), "").Code)
	msg := w.nextTerminals()

	after := state()
	assert.Equal(t, revOf(msg, "rev"), revOf(after, "terminalsRev"), "the revision of the latest broadcast")
	assert.Equal(t, float64(1), revOf(after, "terminalsRev"))
	lists, ok := after["terminals"].(map[string]any)
	require.True(t, ok)
	assert.Equal(t, msg["terminals"], lists[strconv.FormatInt(sess.ID, 10)], "the lists are the ones that broadcast carried")
}
