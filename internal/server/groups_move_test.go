package server

import (
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// --- PUT /api/sessions/group ---

func TestSetSessionsGroup_MovesAndBroadcastsOnlyWhatChanged(t *testing.T) {
	h := newGroupsHarness(t)
	g := h.newGroup("G")
	a, b, already, bystander := h.launch(nil), h.launch(nil), h.launch(&g), h.launch(nil)
	h.wire.reset()

	rec := h.do(http.MethodPut, pathSessionsGroup, fmt.Sprintf(`{"ids":%s,"groupId":%d}`, jsonIDs(a, already, b), g))

	assert.Equal(t, http.StatusNoContent, rec.Code)
	assert.Empty(t, rec.Body.Bytes())
	assert.Equal(t, g, h.sessionGroup(a))
	assert.Equal(t, g, h.sessionGroup(b))
	assert.Equal(t, int64(0), h.sessionGroup(bystander))
	assert.ElementsMatch(t, []string{fmt.Sprintf("sessionUpsert:%d", a), fmt.Sprintf("sessionUpsert:%d", b)}, h.wire.kinds(),
		"the session already in the group and the bystander are not broadcast")
	for _, m := range h.wire.all() {
		assert.Equal(t, float64(g), m["session"].(map[string]any)["groupId"])
	}
}

func TestSetSessionsGroup_NullMovesToUngrouped(t *testing.T) {
	h := newGroupsHarness(t)
	g := h.newGroup("G")
	id := h.launch(&g)
	h.wire.reset()

	rec := h.do(http.MethodPut, pathSessionsGroup, fmt.Sprintf(`{"ids":[%d],"groupId":null}`, id))

	assert.Equal(t, http.StatusNoContent, rec.Code)
	assert.Equal(t, int64(0), h.sessionGroup(id))
	assert.Nil(t, h.wire.last(t, "sessionUpsert")["session"].(map[string]any)["groupId"], "null on the wire")
}

func TestSetSessionsGroup_NothingToDoIsA204WithNoBroadcast(t *testing.T) {
	for name, body := range map[string]string{
		"empty ids":            `{"ids":[],"groupId":null}`,
		"already ungrouped":    `{"ids":[%d],"groupId":null}`,
		"empty ids, a group":   `{"ids":[],"groupId":%d}`,
		"already in the group": `{"ids":[%d],"groupId":%d}`,
	} {
		t.Run(name, func(t *testing.T) {
			h := newGroupsHarness(t)
			g := h.newGroup("G")
			inG, ungrouped := h.launch(&g), h.launch(nil)
			switch name {
			case "already ungrouped":
				body = fmt.Sprintf(body, ungrouped)
			case "empty ids, a group":
				body = fmt.Sprintf(body, g)
			case "already in the group":
				body = fmt.Sprintf(body, inG, g)
			}
			h.wire.reset()

			rec := h.do(http.MethodPut, pathSessionsGroup, body)

			assert.Equal(t, http.StatusNoContent, rec.Code)
			assert.Empty(t, h.wire.kinds())
		})
	}
}

func TestSetSessionsGroup_Refuses(t *testing.T) {
	tests := []struct {
		name   string
		body   func(id, g int64) string
		status int
		code   string
	}{
		{"body not JSON", func(_, _ int64) string { return `{` }, 400, "invalid_request"},
		{"ids missing", func(_, g int64) string { return fmt.Sprintf(`{"groupId":%d}`, g) }, 400, "invalid_request"},
		{"ids not an array", func(_, g int64) string { return fmt.Sprintf(`{"ids":"x","groupId":%d}`, g) }, 400, "invalid_request"},
		{"a duplicate id", func(id, g int64) string { return fmt.Sprintf(`{"ids":[%d,%d],"groupId":%d}`, id, id, g) }, 400, "invalid_request"},
		{"an unknown id", func(id, g int64) string { return fmt.Sprintf(`{"ids":[%d,999999],"groupId":%d}`, id, g) }, 400, "invalid_request"},
		{"groupId key missing", func(id, _ int64) string { return fmt.Sprintf(`{"ids":[%d]}`, id) }, 400, "invalid_request"},
		{"groupId a string", func(id, g int64) string { return fmt.Sprintf(`{"ids":[%d],"groupId":"%d"}`, id, g) }, 400, "invalid_request"},
		{"groupId a fraction", func(id, _ int64) string { return fmt.Sprintf(`{"ids":[%d],"groupId":1.5}`, id) }, 400, "invalid_request"},
		{"an unknown group", func(id, _ int64) string { return fmt.Sprintf(`{"ids":[%d],"groupId":424242}`, id) }, 404, "unknown_group"},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			h := newGroupsHarness(t)
			g := h.newGroup("G")
			id := h.launch(nil)
			h.wire.reset()

			rec := h.do(http.MethodPut, pathSessionsGroup, tt.body(id, g))

			assert.Equal(t, tt.status, rec.Code, rec.Body.String())
			code, message := errorOf(t, rec)
			assert.Equal(t, tt.code, code)
			if tt.code == "invalid_request" && tt.name != "groupId key missing" && !strings.HasPrefix(tt.name, "groupId a ") {
				assert.Equal(t, msgGroupBadIDs, message)
			}
			if tt.code == "unknown_group" {
				assert.Equal(t, "unknown group", message)
			}
			assert.Equal(t, int64(0), h.sessionGroup(id), "nothing changes on an error")
			assert.Empty(t, h.wire.kinds())
		})
	}
}

// --- auth and wiring through the real server ---

// TestGroupEndpoints_RequireTheCookie runs every new route against the real server and its
// real guard: no cookie, no service.
func TestGroupEndpoints_RequireTheCookie(t *testing.T) {
	routes := []struct{ method, path, body string }{
		{http.MethodPost, pathGroups, `{"name":"x"}`},
		{http.MethodPut, groupPath(1), `{"collapsed":true}`},
		{http.MethodPut, pathGroupsOrder, `{"order":[0]}`},
		{http.MethodPut, pathGroupsCollapsed, `{"collapsed":true}`},
		{http.MethodDelete, groupPath(1), ``},
		{http.MethodPut, pathSessionsGroup, `{"ids":[],"groupId":null}`},
		{http.MethodPost, pathSessionsEnd, `{"ids":[1]}`},
		{http.MethodPost, pathSessionsRemove, `{"ids":[1]}`},
	}
	srv := newTestServer(t, ClaudeCodeInfo{})
	for _, rt := range routes {
		t.Run(rt.method+" "+rt.path, func(t *testing.T) {
			req := httptest.NewRequest(rt.method, rt.path, strings.NewReader(rt.body))
			rec := httptest.NewRecorder()

			srv.Handler().ServeHTTP(rec, req)

			assert.Equal(t, http.StatusUnauthorized, rec.Code)
		})
	}
}

// TestGroups_RealServerSnapshotAndBroadcast proves New wires the feature: a snapshot carries
// the two keys, a POST reaches a connected socket as a groups message, and GET /api/state then
// reports the group.
func TestGroups_RealServerSnapshotAndBroadcast(t *testing.T) {
	srv := newTestServer(t, ClaudeCodeInfo{})
	httpSrv := httptest.NewServer(srv.Handler())
	t.Cleanup(httpSrv.Close)
	c, err := dialWS(t, "ws"+httpSrv.URL[len("http"):]+"/ws", nil)
	require.NoError(t, err)
	defer func() { _ = c.CloseNow() }()
	_ = readJSON[helloWire](t, c)
	snap := readJSON[map[string]any](t, c)
	assert.Equal(t, []any{}, snap["groups"])
	assert.Equal(t, map[string]any{"pos": float64(0), "collapsed": false}, snap["ungrouped"])

	req := httptest.NewRequest(http.MethodPost, pathGroups, strings.NewReader(`{"name":"Reviews"}`))
	req.AddCookie(&http.Cookie{Name: cookieName, Value: testUIToken})
	rec := httptest.NewRecorder()
	srv.Handler().ServeHTTP(rec, req)
	require.Equal(t, http.StatusCreated, rec.Code, rec.Body.String())

	msg := readJSON[map[string]any](t, c)
	assert.Equal(t, "groups", msg["type"])
	groups := msg["groups"].([]any)
	require.Len(t, groups, 1)
	assert.Equal(t, "Reviews", groups[0].(map[string]any)["name"])

	req = httptest.NewRequest(http.MethodGet, "/api/state", nil)
	req.AddCookie(&http.Cookie{Name: cookieName, Value: testUIToken})
	rec = httptest.NewRecorder()
	srv.Handler().ServeHTTP(rec, req)
	var state map[string]json.RawMessage
	require.NoError(t, json.Unmarshal(rec.Body.Bytes(), &state))
	assert.Contains(t, string(state["groups"]), `"Reviews"`)
	assert.JSONEq(t, `{"pos":1,"collapsed":false}`, string(state["ungrouped"]))
}
