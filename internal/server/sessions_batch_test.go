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

const (
	pathSessionsEnd    = "/api/sessions/end"
	pathSessionsRemove = "/api/sessions/remove"
	pathSessionsGroup  = "/api/sessions/group"
	pathSessionsOrder  = "/api/sessions/order"
)

const (
	msgBatchBadIDs  = "ids must be a non-empty list of session ids without duplicates"
	msgGroupBadIDs  = "ids must be known session ids without duplicates"
	msgOrderBadBody = "ids must be a duplicate-free list of known session ids, and pinnedCount must be in [0, len(ids)]"
)

// batchBody decodes a batch endpoint's 200 body into its three lists.
func batchBody(t *testing.T, rec *httptest.ResponseRecorder) (done, skipped, failed []int64) {
	t.Helper()
	require.Equal(t, http.StatusOK, rec.Code, rec.Body.String())
	body := decodeBody(t, rec)
	return idList(t, body["done"]), idList(t, body["skipped"]), idList(t, body["failed"])
}

// --- POST /api/sessions/end ---

func TestEndSessions_ReportsDoneSkippedAndFailedAndTouchesNoOtherSession(t *testing.T) {
	h := newGroupsHarness(t)
	live, alreadyEnded, failing, bystander := h.launch(nil), h.launch(nil), h.launch(nil), h.launch(nil)
	_, err := h.mgr.End(t.Context(), alreadyEnded)
	require.NoError(t, err)
	h.killer.failKill(fmt.Sprintf("muster-%d", failing))
	h.killer.mu.Lock()
	h.killer.killed = nil
	h.killer.mu.Unlock()
	h.wire.reset()

	rec := h.do(http.MethodPost, pathSessionsEnd, fmt.Sprintf(`{"ids":%s}`, jsonIDs(live, 999999, alreadyEnded, failing)))

	done, skipped, failed := batchBody(t, rec)
	assert.Equal(t, []int64{live}, done)
	assert.Equal(t, []int64{999999, alreadyEnded}, skipped, "an unknown id and an already ended session are skipped")
	assert.Equal(t, []int64{failing}, failed, "a genuine kill failure is failed, with the response still 200")
	assert.Equal(t, []string{fmt.Sprintf("muster-%d", live)}, h.killer.killedNames())
	s, ok := h.mgr.Get(bystander)
	require.True(t, ok)
	assert.True(t, s.Alive, "a session outside ids is never touched")
	assert.NotContains(t, h.wire.kinds(), fmt.Sprintf("sessionUpsert:%d", bystander))
	assert.Contains(t, h.wire.kinds(), fmt.Sprintf("sessionUpsert:%d", live))
}

func TestEndSessions_EmptyListsSerialiseAsArrays(t *testing.T) {
	h := newGroupsHarness(t)
	id := h.launch(nil)

	rec := h.do(http.MethodPost, pathSessionsEnd, fmt.Sprintf(`{"ids":[%d]}`, id))

	assert.JSONEq(t, fmt.Sprintf(`{"done":[%d],"skipped":[],"failed":[]}`, id), rec.Body.String())
}

func TestBatchEndpoints_RefuseABadIDsList(t *testing.T) {
	bodies := map[string]string{
		"body not JSON":        `{`,
		"ids missing":          `{}`,
		"ids null":             `{"ids":null}`,
		"ids empty":            `{"ids":[]}`,
		"ids not an array":     `{"ids":"1"}`,
		"ids holds a string":   `{"ids":["a"]}`,
		"ids holds a fraction": `{"ids":[1.5]}`,
		"a duplicate id":       `{"ids":[1,2,1]}`,
		"a repeated pair":      `{"ids":[7,7]}`,
	}
	for _, path := range []string{pathSessionsEnd, pathSessionsRemove} {
		for name, body := range bodies {
			t.Run(path+"/"+name, func(t *testing.T) {
				h := newGroupsHarness(t)
				id := h.launch(nil)
				h.wire.reset()

				rec := h.do(http.MethodPost, path, body)

				assertErrorResponse(t, rec, 400, "invalid_request", msgBatchBadIDs)
				assert.True(t, h.mgr.Exists(id))
				assert.Empty(t, h.wire.kinds())
				assert.Empty(t, h.killer.killedNames())
			})
		}
	}
}

// --- POST /api/sessions/remove ---

func TestRemoveSessions_RemovesAndTearsDownEachDoneSessionAndNoOther(t *testing.T) {
	h := newGroupsHarness(t)
	a, b, failing, bystander := h.launch(nil), h.launch(nil), h.launch(nil), h.launch(nil)
	h.killer.failKill(fmt.Sprintf("muster-%d", failing))
	h.wire.reset()

	rec := h.do(http.MethodPost, pathSessionsRemove, fmt.Sprintf(`{"ids":%s}`, jsonIDs(a, 999999, b, failing)))

	done, skipped, failed := batchBody(t, rec)
	assert.Equal(t, []int64{a, b}, done)
	assert.Equal(t, []int64{999999}, skipped)
	assert.Equal(t, []int64{failing}, failed)
	assert.False(t, h.mgr.Exists(a))
	assert.False(t, h.mgr.Exists(b))
	assert.True(t, h.mgr.Exists(failing), "the row is kept when the kill fails")
	assert.True(t, h.mgr.Exists(bystander))
	assert.ElementsMatch(t, []string{shellName(a), shellName(b)}, h.spawner.shellKills(), "the shell is torn down for each removed session, and for no other")
	kinds := h.wire.kinds()
	assert.Contains(t, kinds, fmt.Sprintf("sessionRemoved:%d", a))
	assert.Contains(t, kinds, fmt.Sprintf("sessionRemoved:%d", b))
	assert.NotContains(t, kinds, fmt.Sprintf("sessionRemoved:%d", failing))
	assert.NotContains(t, kinds, fmt.Sprintf("sessionUpsert:%d", bystander))
}

// TestRemoveSessions_RemoveAllLeavesNothing is #27: every session in one request.
func TestRemoveSessions_RemoveAllLeavesNothing(t *testing.T) {
	h := newGroupsHarness(t)
	g := h.newGroup("G")
	ids := []int64{h.launch(nil), h.launch(&g), h.launch(nil), h.launch(&g)}

	rec := h.do(http.MethodPost, pathSessionsRemove, fmt.Sprintf(`{"ids":%s}`, jsonIDs(ids...)))

	done, skipped, failed := batchBody(t, rec)
	assert.Equal(t, ids, done)
	assert.Empty(t, skipped)
	assert.Empty(t, failed)
	assert.Empty(t, h.mgr.List())
	assert.Equal(t, []int64{g}, h.groupIDs(), "removing the sessions never removes their group")
}

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
