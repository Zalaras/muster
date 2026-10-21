package server

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/Zalaras/muster/internal/store"
)

func putSessionNoteRequest(t *testing.T, srv *testServer, idPath, body string) *httptest.ResponseRecorder {
	t.Helper()
	req := httptest.NewRequest(http.MethodPut, "/api/sessions/"+idPath+"/note", strings.NewReader(body))
	req.AddCookie(&http.Cookie{Name: cookieName, Value: testUIToken})
	rec := httptest.NewRecorder()
	srv.Handler().ServeHTTP(rec, req)
	return rec
}

func putNote(t *testing.T, srv *testServer, id int64, body string) *httptest.ResponseRecorder {
	t.Helper()
	return putSessionNoteRequest(t, srv, fmt.Sprint(id), body)
}

func withNote(text string) func(*store.SessionRow) {
	return func(row *store.SessionRow) { row.Note = &text }
}

func storedNote(t *testing.T, srv *testServer, id int64) *string {
	t.Helper()
	row, err := srv.store.GetSession(context.Background(), id)
	require.NoError(t, err)
	return row.Note
}

func noteBody(t *testing.T, text string) string {
	t.Helper()
	b, err := json.Marshal(map[string]string{"note": text})
	require.NoError(t, err)
	return string(b)
}

func errorEnvelope(t *testing.T, rec *httptest.ResponseRecorder) (code, message string) {
	t.Helper()
	var env struct {
		Error struct {
			Code    string `json:"code"`
			Message string `json:"message"`
		} `json:"error"`
	}
	require.NoError(t, json.Unmarshal(rec.Body.Bytes(), &env), "body is the error envelope: %s", rec.Body.String())
	return env.Error.Code, env.Error.Message
}

func dialNoteSocket(t *testing.T, srv *testServer) (read func(typ string) json.RawMessage, none func()) {
	t.Helper()
	httpSrv := httptest.NewServer(srv.Handler())
	t.Cleanup(httpSrv.Close)
	c, err := dialWS(t, "ws"+httpSrv.URL[len("http"):]+"/ws", nil)
	require.NoError(t, err)
	t.Cleanup(func() { _ = c.CloseNow() })
	_ = readJSON[helloWire](t, c)
	return func(typ string) json.RawMessage { return readUntilType(t, c, typ) },
		func() { assertNoSessionUpsertArrives(t, c) }
}

func TestHandleSetNote_RequiresCookie(t *testing.T) {
	srv := newTestServer(t, ClaudeCodeInfo{})
	id := seedSessionRow(t, srv, nil)

	req := httptest.NewRequest(http.MethodPut, fmt.Sprintf("/api/sessions/%d/note", id), strings.NewReader(`{"note":"x"}`))
	rec := httptest.NewRecorder()
	srv.Handler().ServeHTTP(rec, req)

	assert.Equal(t, http.StatusUnauthorized, rec.Code)
	assert.Nil(t, storedNote(t, srv, id), "an unauthenticated request stores nothing")
}

// TestHandleSetNote_204StoresPerTheContract covers D2 through the real handler: text is
// stored byte for byte (whitespace kept), empty, whitespace-only and null store null, and a
// 204 has no body.
func TestHandleSetNote_204StoresPerTheContract(t *testing.T) {
	tests := []struct {
		name string
		seed func(*store.SessionRow)
		body string
		want *string
	}{
		{"text", nil, `{"note":"## Where I am\nPlan written"}`, p("## Where I am\nPlan written")},
		{"padded text is kept verbatim", nil, `{"note":"  hi \n"}`, p("  hi \n")},
		{"CRLF is kept", nil, `{"note":"a\r\nb"}`, p("a\r\nb")},
		{"unicode is kept", nil, `{"note":"naïve ✓ 日本語"}`, p("naïve ✓ 日本語")},
		{"empty clears", withNote("old"), `{"note":""}`, nil},
		{"whitespace-only clears", withNote("old"), `{"note":"  \n\t "}`, nil},
		{"null clears", withNote("old"), `{"note":null}`, nil},
		{"empty on a null note stays null", nil, `{"note":""}`, nil},
		{"text replaces the whole note", withNote("old text"), `{"note":"new"}`, p("new")},
		{"unknown extra keys are ignored", nil, `{"note":"x","other":1}`, p("x")},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			srv := newTestServer(t, ClaudeCodeInfo{})
			id := seedSessionRow(t, srv, tt.seed)

			rec := putNote(t, srv, id, tt.body)

			assert.Equal(t, http.StatusNoContent, rec.Code)
			assert.Empty(t, rec.Body.Bytes())
			assert.Equal(t, tt.want, storedNote(t, srv, id))
			sess, ok := srv.manager.Get(id)
			require.True(t, ok)
			assert.Equal(t, tt.want, sess.Note, "the live session holds what the store holds")
		})
	}
}

// TestHandleSetNote_400LeavesTheNoteAndNeverBroadcasts covers D3's 400 clause: a missing
// key, a body that is not JSON and a non-string non-null value each get the one message
// the contract gives, in the envelope, and change nothing.
func TestHandleSetNote_400LeavesTheNoteAndNeverBroadcasts(t *testing.T) {
	tests := []struct{ name, body string }{
		{"no body", ``},
		{"not JSON", `not valid json`},
		{"truncated JSON", `{"note":"x`},
		{"missing key", `{}`},
		{"other key only", `{"text":"x"}`},
		{"a number", `{"note":3}`},
		{"a boolean", `{"note":true}`},
		{"an array", `{"note":["x"]}`},
		{"an object", `{"note":{"a":1}}`},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			srv := newTestServer(t, ClaudeCodeInfo{})
			id := seedSessionRow(t, srv, withNote("kept"))
			_, none := dialNoteSocket(t, srv)

			rec := putNote(t, srv, id, tt.body)

			assert.Equal(t, http.StatusBadRequest, rec.Code)
			code, message := errorEnvelope(t, rec)
			assert.Equal(t, "invalid_request", code)
			assert.Equal(t, "note must be a string or null", message)
			assert.Equal(t, p("kept"), storedNote(t, srv, id))
			none()
		})
	}
}

func TestHandleSetNote_404ForAnUnknownSession(t *testing.T) {
	srv := newTestServer(t, ClaudeCodeInfo{})
	bystander := seedSessionRow(t, srv, withNote("kept"))

	for _, idPath := range []string{"99999", "not-a-number"} {
		t.Run(idPath, func(t *testing.T) {
			rec := putSessionNoteRequest(t, srv, idPath, `{"note":"x"}`)

			assert.Equal(t, http.StatusNotFound, rec.Code)
			code, message := errorEnvelope(t, rec)
			assert.Equal(t, "unknown_session", code)
			assert.Equal(t, "unknown session id", message)
		})
	}
	assert.Equal(t, p("kept"), storedNote(t, srv, bystander))
}

// TestHandleSetNote_413OverTheBodyBound covers D3's 413 clause and edge case 20: a body
// over 20 MiB is refused in the envelope and stores nothing, while a large body under the
// bound is accepted whole (the note itself has no length limit).
func TestHandleSetNote_413OverTheBodyBound(t *testing.T) {
	t.Run("21 MiB is refused", func(t *testing.T) {
		srv := newTestServer(t, ClaudeCodeInfo{})
		id := seedSessionRow(t, srv, withNote("kept"))
		_, none := dialNoteSocket(t, srv)

		rec := putNote(t, srv, id, noteBody(t, strings.Repeat("a", 21<<20)))

		assert.Equal(t, http.StatusRequestEntityTooLarge, rec.Code)
		code, message := errorEnvelope(t, rec)
		assert.Equal(t, "request_too_large", code)
		assert.Equal(t, "note is too large to save", message)
		assert.Equal(t, p("kept"), storedNote(t, srv, id))
		none()
	})

	t.Run("a multi-megabyte note under the bound is stored whole", func(t *testing.T) {
		srv := newTestServer(t, ClaudeCodeInfo{})
		id := seedSessionRow(t, srv, nil)
		big := strings.Repeat("a line of the developer's own text\n", 100_000)

		rec := putNote(t, srv, id, noteBody(t, big))

		assert.Equal(t, http.StatusNoContent, rec.Code)
		assert.Equal(t, p(big), storedNote(t, srv, id))
	})
}

// TestHandleSetNote_BroadcastsExactlyOncePerChange covers D1 and D8's upsert half: a
// changed note is one sessionUpsert carrying the whole note (null when cleared), the same
// text again is a 204 and nothing broadcast, and another session is never broadcast.
func TestHandleSetNote_BroadcastsExactlyOncePerChange(t *testing.T) {
	srv := newTestServer(t, ClaudeCodeInfo{})
	id := seedSessionRow(t, srv, nil)
	bystander := seedSessionRow(t, srv, withNote("bystander"))
	read, none := dialNoteSocket(t, srv)
	_ = read("snapshot")

	upsertNote := func() (int64, string) {
		var m struct {
			Session struct {
				ID   int64           `json:"id"`
				Note json.RawMessage `json:"note"`
			} `json:"session"`
		}
		require.NoError(t, json.Unmarshal(read("sessionUpsert"), &m))
		return m.Session.ID, string(m.Session.Note)
	}

	// A no-op PUT is followed by a real change: the next upsert on the socket being the
	// change's, not the no-op's, proves the no-op broadcast nothing (a quiet-socket read
	// would close the connection, so it is used once, at the end).
	require.Equal(t, http.StatusNoContent, putNote(t, srv, id, `{"note":"  hello\n"}`).Code)
	gotID, gotNote := upsertNote()
	assert.Equal(t, id, gotID)
	assert.Equal(t, `"  hello\n"`, gotNote)

	assert.Equal(t, http.StatusNoContent, putNote(t, srv, id, `{"note":"  hello\n"}`).Code, "the same text again")
	require.Equal(t, http.StatusNoContent, putNote(t, srv, id, `{"note":"   "}`).Code)
	gotID, gotNote = upsertNote()
	assert.Equal(t, id, gotID)
	assert.Equal(t, "null", gotNote, "the next upsert is the clear, and a cleared note is a present null key")

	assert.Equal(t, http.StatusNoContent, putNote(t, srv, id, `{"note":null}`).Code, "clearing a cleared note")
	assert.Equal(t, http.StatusNoContent, putNote(t, srv, id, `{"note":""}`).Code, "empty on a cleared note")
	none()

	assert.Equal(t, p("bystander"), storedNote(t, srv, bystander))
}

// TestHandleSetNote_DeadSessionsNoteCanBeSet covers D6 and REQ-2: the alive flag is not
// consulted.
func TestHandleSetNote_DeadSessionsNoteCanBeSet(t *testing.T) {
	srv := newTestServer(t, ClaudeCodeInfo{})
	id := seedSessionRow(t, srv, func(row *store.SessionRow) { row.Alive = false })
	sess, ok := srv.manager.Get(id)
	require.True(t, ok)
	require.False(t, sess.Alive, "sanity: the session is dead")
	read, _ := dialNoteSocket(t, srv)
	_ = read("snapshot")

	rec := putNote(t, srv, id, `{"note":"written after the session ended"}`)

	assert.Equal(t, http.StatusNoContent, rec.Code)
	assert.Equal(t, p("written after the session ended"), storedNote(t, srv, id))
	var m struct {
		Session struct {
			Alive bool            `json:"alive"`
			Note  json.RawMessage `json:"note"`
		} `json:"session"`
	}
	require.NoError(t, json.Unmarshal(read("sessionUpsert"), &m))
	assert.False(t, m.Session.Alive)
	assert.JSONEq(t, `"written after the session ended"`, string(m.Session.Note))
}

// TestSessionWire_EverySessionCarriesTheNoteKey covers D8: the key is present on every
// session in the snapshot and in toWireSession, null when there is no note and the text
// verbatim when there is one.
func TestSessionWire_EverySessionCarriesTheNoteKey(t *testing.T) {
	srv := newTestServer(t, ClaudeCodeInfo{})
	seedSessionRow(t, srv, nil)
	seedSessionRow(t, srv, withNote(" padded note \n"))
	seedSessionRow(t, srv, func(row *store.SessionRow) { row.Alive = false; row.Note = p("ended note") })
	read, _ := dialNoteSocket(t, srv)

	var snap struct {
		Sessions []map[string]json.RawMessage `json:"sessions"`
	}
	require.NoError(t, json.Unmarshal(read("snapshot"), &snap))

	require.Len(t, snap.Sessions, 3)
	got := []string{}
	for _, s := range snap.Sessions {
		note, present := s["note"]
		require.True(t, present, "the note key is never omitted")
		got = append(got, string(note))
	}
	assert.ElementsMatch(t, []string{"null", `" padded note \n"`, `"ended note"`}, got)

	w := toWireSession(minimalSession())
	assert.Nil(t, w.Note)
	raw, err := json.Marshal(w)
	require.NoError(t, err)
	assert.Contains(t, string(raw), `"note":null`)
}
