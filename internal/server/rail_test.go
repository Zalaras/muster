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

// putSessionOrderRequest issues PUT /api/sessions/order with the UI cookie attached.
func putSessionOrderRequest(t *testing.T, srv *testServer, body string) *httptest.ResponseRecorder {
	t.Helper()
	req := httptest.NewRequest(http.MethodPut, "/api/sessions/order", strings.NewReader(body))
	req.AddCookie(&http.Cookie{Name: cookieName, Value: testUIToken})
	rec := httptest.NewRecorder()
	srv.Handler().ServeHTTP(rec, req)
	return rec
}

// TestHandlePinSession_RequiresCookie covers the auth wiring for plan order-sidebar's
// new endpoint.
func TestHandlePinSession_RequiresCookie(t *testing.T) {
	srv := newTestServer(t, ClaudeCodeInfo{})

	req := httptest.NewRequest(http.MethodPut, "/api/sessions/1/pin", strings.NewReader(`{"pinned":true}`))
	rec := httptest.NewRecorder()
	srv.Handler().ServeHTTP(rec, req)

	assert.Equal(t, http.StatusUnauthorized, rec.Code)
}

// TestHandlePinSession_InvalidBodyIs400 covers kb:anchor/sessions.pin's 400 invalid_request clause: body
// not JSON, or pinned missing/not a boolean.
func TestHandlePinSession_InvalidBodyIs400(t *testing.T) {
	tests := []struct {
		name string
		body string
	}{
		{"not JSON", `not valid json`},
		{"pinned missing", `{}`},
		{"pinned is a string, not a boolean", `{"pinned":"true"}`},
		{"pinned is null", `{"pinned":null}`},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			srv := newTestServer(t, ClaudeCodeInfo{})
			id := seedSessionRow(t, srv, nil)

			rec := putSessionPinRequest(t, srv, id, tt.body)

			assert.Equal(t, http.StatusBadRequest, rec.Code)
			assert.Equal(t, "invalid_request", decodeErrorCode(t, rec))
		})
	}
}

func TestHandlePinSession_UnknownSessionIs404(t *testing.T) {
	srv := newTestServer(t, ClaudeCodeInfo{})

	rec := putSessionPinRequest(t, srv, 999999, `{"pinned":true}`)

	assert.Equal(t, http.StatusNotFound, rec.Code)
	assert.Equal(t, "unknown_session", decodeErrorCode(t, rec))
}

// TestHandlePinSession_SuccessIs204AndPersists covers D6 through the real HTTP handler
// (decode -> delegate -> encode): a valid pin request returns 204 with no body and the
// store row reflects the new pinned flag.
func TestHandlePinSession_SuccessIs204AndPersists(t *testing.T) {
	srv := newTestServer(t, ClaudeCodeInfo{})
	id := seedSessionRow(t, srv, nil)

	rec := putSessionPinRequest(t, srv, id, `{"pinned":true}`)

	assert.Equal(t, http.StatusNoContent, rec.Code)
	assert.Empty(t, rec.Body.Bytes())
	row, err := srv.store.GetSession(context.Background(), id)
	require.NoError(t, err)
	assert.True(t, row.Pinned)
}

// TestHandlePinSession_NoOpIs204WithNoBroadcast covers D8 at the HTTP layer: pinning a
// session already in the requested state is still a 204, and no sessionUpsert reaches a
// connected UI socket.
func TestHandlePinSession_NoOpIs204WithNoBroadcast(t *testing.T) {
	srv := newTestServer(t, ClaudeCodeInfo{})
	id := seedSessionRow(t, srv, nil) // freshly seeded rows start pinned:false

	httpSrv := httptest.NewServer(srv.Handler())
	t.Cleanup(httpSrv.Close)
	wsURL := "ws" + httpSrv.URL[len("http"):] + "/ws"
	c, err := dialWS(t, wsURL, nil)
	require.NoError(t, err)
	defer func() { _ = c.CloseNow() }()
	_ = readJSON[helloWire](t, c)
	_ = readJSON[snapshotWire](t, c)

	rec := putSessionPinRequest(t, srv, id, `{"pinned":false}`) // already false

	assert.Equal(t, http.StatusNoContent, rec.Code)
	assertNoSessionUpsertArrives(t, c)
}

// TestSessionOrderAndPinHandlers_RequireCookie extends the shared cookie-check table
// with the two new endpoints.
func TestSessionOrderAndPinHandlers_RequireCookie(t *testing.T) {
	tests := []struct {
		name   string
		method string
		path   string
		body   string
	}{
		{"pin", http.MethodPut, "/api/sessions/1/pin", `{"pinned":true}`},
		{"order", http.MethodPut, "/api/sessions/order", `{"ids":[],"pinnedCount":0}`},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			srv := newTestServer(t, ClaudeCodeInfo{})

			req := httptest.NewRequest(tt.method, tt.path, strings.NewReader(tt.body))
			rec := httptest.NewRecorder()
			srv.Handler().ServeHTTP(rec, req)

			assert.Equal(t, http.StatusUnauthorized, rec.Code)
		})
	}
}

// TestHandleSetOrder_InvalidBodyIs400 covers kb:anchor/sessions.order's 400 invalid_request clause: body
// not JSON, ids/pinnedCount missing, a duplicate/unknown id, or pinnedCount out of
// range — exercised through the real HTTP handler.
func TestHandleSetOrder_InvalidBodyIs400(t *testing.T) {
	srv := newTestServer(t, ClaudeCodeInfo{})
	id := seedSessionRow(t, srv, nil)

	tests := []struct {
		name string
		body string
	}{
		{"not JSON", `not valid json`},
		{"ids missing", `{"pinnedCount":0}`},
		{"pinnedCount missing", fmt.Sprintf(`{"ids":[%d]}`, id)},
		{"pinnedCount negative", fmt.Sprintf(`{"ids":[%d],"pinnedCount":-1}`, id)},
		{"pinnedCount above len(ids)", fmt.Sprintf(`{"ids":[%d],"pinnedCount":2}`, id)},
		{"duplicate id", fmt.Sprintf(`{"ids":[%d,%d],"pinnedCount":0}`, id, id)},
		{"unknown id", `{"ids":[999999],"pinnedCount":0}`},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			rec := putSessionOrderRequest(t, srv, tt.body)

			assert.Equal(t, http.StatusBadRequest, rec.Code)
			assert.Equal(t, "invalid_request", decodeErrorCode(t, rec))
		})
	}
}

// TestHandleSetOrder_SuccessIs204AndAppliesTheOrder covers D9 through the real HTTP
// handler: a valid order request returns 204 and the store reflects the new
// pinned/railPos values.
func TestHandleSetOrder_SuccessIs204AndAppliesTheOrder(t *testing.T) {
	srv := newTestServer(t, ClaudeCodeInfo{})
	idA := seedSessionRow(t, srv, nil)
	idB := seedSessionRow(t, srv, nil)

	rec := putSessionOrderRequest(t, srv, fmt.Sprintf(`{"ids":[%d,%d],"pinnedCount":1}`, idB, idA))

	assert.Equal(t, http.StatusNoContent, rec.Code)
	rowB, err := srv.store.GetSession(context.Background(), idB)
	require.NoError(t, err)
	rowA, err := srv.store.GetSession(context.Background(), idA)
	require.NoError(t, err)
	assert.True(t, rowB.Pinned)
	assert.False(t, rowA.Pinned)
	assert.Less(t, rowB.RailPos, rowA.RailPos)
}

// TestHandleSetOrder_EmptyIDsIs204AndChangesNothing covers kb:anchor/sessions.order's explicit "empty ids
// is valid (a no-op ...)" clause through the real HTTP handler.
func TestHandleSetOrder_EmptyIDsIs204AndChangesNothing(t *testing.T) {
	srv := newTestServer(t, ClaudeCodeInfo{})
	id := seedSessionRow(t, srv, nil)
	before, err := srv.store.GetSession(context.Background(), id)
	require.NoError(t, err)

	rec := putSessionOrderRequest(t, srv, `{"ids":[],"pinnedCount":0}`)

	assert.Equal(t, http.StatusNoContent, rec.Code)
	after, err := srv.store.GetSession(context.Background(), id)
	require.NoError(t, err)
	assert.Equal(t, before, after)
}

// Note: a dedicated "tmux spawn failure rolls back the row" test was attempted and
// deliberately dropped. Manual probing (`tmux new-window -c <nonexistent dir> --
// <nonexistent binary>`) showed tmux's `new-window` returns exit 0 and a valid
// window/pane in both cases — the fork succeeds synchronously and only the child's
// later exec fails asynchronously in the pane, which tmux.Client.NewWindow has no way
// to observe. There is no environment-independent way to make `tmux.Client.NewWindow`
// itself return a synchronous error from this package (the binary name "tmux" isn't
// injectable), so the rollback code path for that specific step is covered only
// structurally, by TestLauncher_CorruptSettingsFileRefusesAndRollsBackTheSessionRow
// exercising the same `rollback` helper from an earlier failing step.

// --- PUT /api/sessions/order gains groupId ---

// TestSetOrder_GroupIDDistinguishesAbsentNullAndAnInteger is why groupId decodes as a
// json.RawMessage (kb:adr/connection-absent-vs-null-json-fields-decode-as-raw-message): absent
// leaves membership alone, null names Ungrouped, an integer names a group.
func TestSetOrder_GroupIDDistinguishesAbsentNullAndAnInteger(t *testing.T) {
	tests := []struct {
		name      string
		groupJSON func(g int64) string // the groupId member, with its leading comma, or ""
		wantGroup func(g int64) int64  // where the dragged session ends up; it starts in g
	}{
		{"absent leaves membership alone", func(_ int64) string { return "" }, func(g int64) int64 { return g }},
		{"null names Ungrouped", func(_ int64) string { return `,"groupId":null` }, func(_ int64) int64 { return 0 }},
		{"an integer names that group", func(g int64) string { return fmt.Sprintf(`,"groupId":%d`, g) }, func(g int64) int64 { return g }},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			h := newGroupsHarness(t)
			g := h.newGroup("G")
			id := h.launch(&g)
			other := h.launch(nil)
			h.wire.reset()

			rec := h.do(http.MethodPut, pathSessionsOrder, fmt.Sprintf(`{"ids":[%d],"pinnedCount":0%s}`, id, tt.groupJSON(g)))

			assert.Equal(t, http.StatusNoContent, rec.Code, rec.Body.String())
			assert.Equal(t, tt.wantGroup(g), h.sessionGroup(id))
			assert.Equal(t, int64(0), h.sessionGroup(other), "a session outside the request keeps its group")
		})
	}
}

func TestSetOrder_GroupIDJoinsTheListedCardsAndBroadcastsTheMove(t *testing.T) {
	h := newGroupsHarness(t)
	g := h.newGroup("G")
	inGroup, dragged := h.launch(&g), h.launch(nil)
	h.wire.reset()

	rec := h.do(http.MethodPut, pathSessionsOrder, fmt.Sprintf(`{"ids":[%d,%d],"pinnedCount":1,"groupId":%d}`, dragged, inGroup, g))

	require.Equal(t, http.StatusNoContent, rec.Code, rec.Body.String())
	assert.Equal(t, g, h.sessionGroup(dragged))
	s, _ := h.mgr.Get(dragged)
	assert.True(t, s.Pinned, "the pinned prefix applies to the dropped card")
	assert.Contains(t, h.wire.kinds(), fmt.Sprintf("sessionUpsert:%d", dragged))
	assert.Equal(t, 0, h.wire.count("groups"), "a card move broadcasts sessions, never groups")
}

func TestSetOrder_GroupIDRefuses(t *testing.T) {
	tests := []struct {
		name    string
		group   string
		status  int
		code    string
		message string
	}{
		{"an unknown group", `,"groupId":424242`, 404, "unknown_group", "unknown group"},
		{"a string", `,"groupId":"1"`, 400, "invalid_request", "groupId must be an integer or null"},
		{"a boolean", `,"groupId":true`, 400, "invalid_request", "groupId must be an integer or null"},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			h := newGroupsHarness(t)
			g := h.newGroup("G")
			id := h.launch(&g)
			h.wire.reset()

			rec := h.do(http.MethodPut, pathSessionsOrder, fmt.Sprintf(`{"ids":[%d],"pinnedCount":0%s}`, id, tt.group))

			assertErrorResponse(t, rec, tt.status, tt.code, tt.message)
			assert.Equal(t, g, h.sessionGroup(id))
			assert.Empty(t, h.wire.kinds())
		})
	}
}

func TestSetOrder_StillRefusesABadOrderWhenAGroupIsNamed(t *testing.T) {
	h := newGroupsHarness(t)
	g := h.newGroup("G")
	id := h.launch(nil)

	rec := h.do(http.MethodPut, pathSessionsOrder, fmt.Sprintf(`{"ids":[%d,%d],"pinnedCount":0,"groupId":%d}`, id, id, g))

	assertErrorResponse(t, rec, 400, "invalid_request", msgOrderBadBody)
	assert.Equal(t, int64(0), h.sessionGroup(id), "membership is not applied when the order is invalid")
}
