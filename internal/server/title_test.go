package server

import (
	"context"
	"fmt"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// putSessionTitleRequest issues PUT /api/sessions/{id}/title with the UI cookie attached
// (mirrors putSessionPinRequest for the plan ui-text-and-focus endpoint).
func putSessionTitleRequest(t *testing.T, srv *testServer, id int64, body string) *httptest.ResponseRecorder {
	t.Helper()
	req := httptest.NewRequest(http.MethodPut, fmt.Sprintf("/api/sessions/%d/title", id), strings.NewReader(body))
	req.AddCookie(&http.Cookie{Name: cookieName, Value: testUIToken})
	rec := httptest.NewRecorder()
	srv.Handler().ServeHTTP(rec, req)
	return rec
}

// TestHandleSetTitle_RequiresCookie covers the auth wiring for §3.15's new endpoint.
func TestHandleSetTitle_RequiresCookie(t *testing.T) {
	srv := newTestServer(t, ClaudeCodeInfo{})

	req := httptest.NewRequest(http.MethodPut, "/api/sessions/1/title", strings.NewReader(`{"title":"x"}`))
	rec := httptest.NewRecorder()
	srv.Handler().ServeHTTP(rec, req)

	assert.Equal(t, http.StatusUnauthorized, rec.Code)
}

// TestHandleSetTitle_AbsentKeyIs400ButExplicitNullIs204 covers D8's core distinction
// (§3.15: "the title key is required (absent key != null)") through the real HTTP
// handler: a body with no "title" key at all is a 400 invalid_request, while a body that
// spells the key with a JSON null value is a 204 (it clears the override — a no-op here,
// since none was ever set, but still success, not an error).
func TestHandleSetTitle_AbsentKeyIs400ButExplicitNullIs204(t *testing.T) {
	srv := newTestServer(t, ClaudeCodeInfo{})
	id := seedSessionRow(t, srv, nil)

	absent := putSessionTitleRequest(t, srv, id, `{}`)
	assert.Equal(t, http.StatusBadRequest, absent.Code)
	assert.Equal(t, "invalid_request", decodeErrorCode(t, absent))

	explicitNull := putSessionTitleRequest(t, srv, id, `{"title":null}`)
	assert.Equal(t, http.StatusNoContent, explicitNull.Code)
	assert.Empty(t, explicitNull.Body.Bytes())
}

// TestHandleSetTitle_InvalidBodyIs400 covers §3.15's 400 invalid_request clause for
// every other kind of bad input: malformed JSON, a non-string/non-null title, and a
// trimmed string outside the 1-100 rune range (including a whitespace-only string, which
// trims to empty).
func TestHandleSetTitle_InvalidBodyIs400(t *testing.T) {
	tooLong := strings.Repeat("x", 101)
	// 101 non-ASCII runes (2 bytes each in UTF-8): 202 bytes, 101 runes — this must be
	// rejected by a rune-count check, and would wrongly pass a byte-length-only check
	// that compared against a raised byte threshold instead (handleSetTitle's own doc
	// comment: "counted in runes, not bytes").
	tooLongMultibyte := strings.Repeat("é", 101)

	tests := []struct {
		name string
		body string
	}{
		{"not JSON", `not valid json`},
		{"title is a number", `{"title":42}`},
		{"title is a boolean", `{"title":true}`},
		{"title is an array", `{"title":["x"]}`},
		{"title is an object", `{"title":{"x":1}}`},
		{"title trims to empty (whitespace only)", `{"title":"   "}`},
		{"title is the empty string", `{"title":""}`},
		{"title exceeds 100 runes", fmt.Sprintf(`{"title":%q}`, tooLong)},
		{"title exceeds 100 runes (multi-byte)", fmt.Sprintf(`{"title":%q}`, tooLongMultibyte)},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			srv := newTestServer(t, ClaudeCodeInfo{})
			id := seedSessionRow(t, srv, nil)

			rec := putSessionTitleRequest(t, srv, id, tt.body)

			assert.Equal(t, http.StatusBadRequest, rec.Code)
			assert.Equal(t, "invalid_request", decodeErrorCode(t, rec))
		})
	}
}

// TestHandleSetTitle_Exactly100RunesIsValid is InvalidBodyIs400's positive boundary twin:
// a trimmed title of exactly 100 runes (including multi-byte ones) is accepted.
func TestHandleSetTitle_Exactly100RunesIsValid(t *testing.T) {
	srv := newTestServer(t, ClaudeCodeInfo{})
	id := seedSessionRow(t, srv, nil)
	exactly100 := strings.Repeat("é", 100)

	rec := putSessionTitleRequest(t, srv, id, fmt.Sprintf(`{"title":%q}`, exactly100))

	assert.Equal(t, http.StatusNoContent, rec.Code)
	row, err := srv.store.GetSession(context.Background(), id)
	require.NoError(t, err)
	require.NotNil(t, row.TitleOverride)
	assert.Equal(t, exactly100, *row.TitleOverride)
}

// TestHandleSetTitle_TrimsLeadingAndTrailingWhitespaceBeforeStorage covers §3.15's
// "leading/trailing whitespace is trimmed before validation and storage" clause.
func TestHandleSetTitle_TrimsLeadingAndTrailingWhitespaceBeforeStorage(t *testing.T) {
	srv := newTestServer(t, ClaudeCodeInfo{})
	id := seedSessionRow(t, srv, nil)

	rec := putSessionTitleRequest(t, srv, id, `{"title":"  padded name  "}`)

	assert.Equal(t, http.StatusNoContent, rec.Code)
	row, err := srv.store.GetSession(context.Background(), id)
	require.NoError(t, err)
	require.NotNil(t, row.TitleOverride)
	assert.Equal(t, "padded name", *row.TitleOverride)
}

// TestHandleSetTitle_UnknownSessionIs404 covers §3.15's 404 unknown_session clause.
func TestHandleSetTitle_UnknownSessionIs404(t *testing.T) {
	srv := newTestServer(t, ClaudeCodeInfo{})

	rec := putSessionTitleRequest(t, srv, 999999, `{"title":"x"}`)

	assert.Equal(t, http.StatusNotFound, rec.Code)
	assert.Equal(t, "unknown_session", decodeErrorCode(t, rec))
}

// TestHandleSetTitle_SuccessIs204AndPersists covers D8 through the real HTTP handler
// (decode -> delegate -> encode): a valid title request returns 204 with no body and the
// store row reflects the new title_override.
func TestHandleSetTitle_SuccessIs204AndPersists(t *testing.T) {
	srv := newTestServer(t, ClaudeCodeInfo{})
	id := seedSessionRow(t, srv, nil)

	rec := putSessionTitleRequest(t, srv, id, `{"title":"Renamed From The Dashboard"}`)

	assert.Equal(t, http.StatusNoContent, rec.Code)
	assert.Empty(t, rec.Body.Bytes())
	row, err := srv.store.GetSession(context.Background(), id)
	require.NoError(t, err)
	require.NotNil(t, row.TitleOverride)
	assert.Equal(t, "Renamed From The Dashboard", *row.TitleOverride)
}

// TestHandleSetTitle_NoOpClearIs204WithNoBroadcast covers edge case 3 at the HTTP layer:
// clearing a title override that was never set is still a 204, and no sessionUpsert
// reaches a connected UI socket (mirrors TestHandlePinSession_NoOpIs204WithNoBroadcast).
func TestHandleSetTitle_NoOpClearIs204WithNoBroadcast(t *testing.T) {
	srv := newTestServer(t, ClaudeCodeInfo{})
	id := seedSessionRow(t, srv, nil) // freshly seeded rows start with no title_override

	httpSrv := httptest.NewServer(srv.Handler())
	t.Cleanup(httpSrv.Close)
	wsURL := "ws" + httpSrv.URL[len("http"):] + "/ws"
	c, err := dialWS(t, wsURL, nil)
	require.NoError(t, err)
	defer func() { _ = c.CloseNow() }()
	_ = readJSON[helloWire](t, c)
	_ = readJSON[snapshotWire](t, c)

	rec := putSessionTitleRequest(t, srv, id, `{"title":null}`)

	assert.Equal(t, http.StatusNoContent, rec.Code)
	assertNoSessionUpsertArrives(t, c)
}
