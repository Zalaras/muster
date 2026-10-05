package server

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/rs/zerolog"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/Zalaras/muster/internal/session"
)

const (
	pathGroups          = "/api/groups"
	pathGroupsOrder     = "/api/groups/order"
	pathGroupsCollapsed = "/api/groups/collapsed"
)

func groupPath(id int64) string { return fmt.Sprintf("/api/groups/%d", id) }

// errorOf decodes an error envelope's code and message.
func errorOf(t *testing.T, rec *httptest.ResponseRecorder) (code, message string) {
	t.Helper()
	var envelope struct {
		Error struct {
			Code    string `json:"code"`
			Message string `json:"message"`
		} `json:"error"`
	}
	require.NoError(t, json.Unmarshal(rec.Body.Bytes(), &envelope), "body: %s", rec.Body.String())
	return envelope.Error.Code, envelope.Error.Message
}

func assertErrorResponse(t *testing.T, rec *httptest.ResponseRecorder, status int, code, message string) {
	t.Helper()
	assert.Equal(t, status, rec.Code, "body: %s", rec.Body.String())
	gotCode, gotMessage := errorOf(t, rec)
	assert.Equal(t, code, gotCode)
	assert.Equal(t, message, gotMessage)
}

// --- the wire shape ---

func TestGroupsWire_MessageShape(t *testing.T) {
	// groups is always an array, never null, and ungrouped is always present
	// (kb:anchor/ws.groups).
	b, err := json.Marshal(groupsWire(nil, session.UngroupedLayout{}))
	require.NoError(t, err)
	assert.JSONEq(t, `{"type":"groups","groups":[],"ungrouped":{"pos":0,"collapsed":false}}`, string(b))
}

func TestToWireSession_GroupIDIsARequiredKey(t *testing.T) {
	tests := []struct {
		name  string
		group *int64
		want  string
	}{
		{"no group is null, never omitted", nil, `null`},
		{"a group is its id", func() *int64 { v := int64(7); return &v }(), `7`},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			s := minimalSession()
			s.GroupID = tt.group

			b, err := json.Marshal(toWireSession(s))
			require.NoError(t, err)

			var got map[string]json.RawMessage
			require.NoError(t, json.Unmarshal(b, &got))
			require.Contains(t, got, "groupId")
			assert.Equal(t, tt.want, string(got["groupId"]))
		})
	}
}

// --- POST /api/groups (D11) ---

func TestCreateGroup_Succeeds(t *testing.T) {
	h := newGroupsHarness(t)

	rec := h.do(http.MethodPost, pathGroups, `{"name":"  PR reviews "}`)

	require.Equal(t, http.StatusCreated, rec.Code, rec.Body.String())
	body := decodeBody(t, rec)
	assert.Equal(t, "PR reviews", body["name"], "the name is trimmed")
	assert.Equal(t, float64(0), body["pos"])
	assert.Equal(t, false, body["collapsed"])
	assert.Greater(t, body["id"], float64(0))
	assert.Equal(t, []string{"groups"}, h.wire.kinds())
	msg := h.wire.last(t, "groups")
	assert.Equal(t, map[string]any{"pos": float64(1), "collapsed": false}, msg["ungrouped"], "Ungrouped moves one place down")
	assert.Len(t, msg["groups"], 1)
}

func TestCreateGroup_SecondGroupLandsAboveUngroupedAndRenumbers(t *testing.T) {
	h := newGroupsHarness(t)
	h.newGroup("First")

	rec := h.do(http.MethodPost, pathGroups, `{"name":"Second"}`)

	require.Equal(t, http.StatusCreated, rec.Code)
	assert.Equal(t, float64(1), decodeBody(t, rec)["pos"])
	assert.Equal(t, map[string]any{"pos": float64(2), "collapsed": false}, h.wire.last(t, "groups")["ungrouped"])
}

// TestCreateGroup_WithSessionsBroadcastsGroupsBeforeEveryUpsert is D15's create half over the
// wire: a client applying messages in order never sees a groupId naming an unknown group.
func TestCreateGroup_WithSessionsBroadcastsGroupsBeforeEveryUpsert(t *testing.T) {
	h := newGroupsHarness(t)
	a, b, bystander := h.launch(nil), h.launch(nil), h.launch(nil)
	h.wire.reset()

	rec := h.do(http.MethodPost, pathGroups, fmt.Sprintf(`{"name":"Hotfix","sessionIds":%s}`, jsonIDs(a, b)))

	require.Equal(t, http.StatusCreated, rec.Code, rec.Body.String())
	gid := int64(decodeBody(t, rec)["id"].(float64))
	kinds := h.wire.kinds()
	require.Len(t, kinds, 3)
	assert.Equal(t, "groups", kinds[0])
	assert.ElementsMatch(t, []string{fmt.Sprintf("sessionUpsert:%d", a), fmt.Sprintf("sessionUpsert:%d", b)}, kinds[1:])
	for _, m := range h.wire.all()[1:] {
		assert.Equal(t, float64(gid), m["session"].(map[string]any)["groupId"], "the upsert carries the new groupId")
	}
	assert.Equal(t, int64(0), h.sessionGroup(bystander))
	assert.NotContains(t, strings.Join(kinds, ","), fmt.Sprintf("sessionUpsert:%d", bystander))
}

func TestCreateGroup_AcceptsAFortyCharacterNameInBytesAndRunes(t *testing.T) {
	for _, name := range []string{strings.Repeat("a", 40), strings.Repeat("é", 40)} {
		t.Run(fmt.Sprintf("%d bytes", len(name)), func(t *testing.T) {
			h := newGroupsHarness(t)

			rec := h.do(http.MethodPost, pathGroups, fmt.Sprintf(`{"name":%q}`, name))

			assert.Equal(t, http.StatusCreated, rec.Code, rec.Body.String())
		})
	}
}

// TestCreateGroup_RefusesAndCreatesNothing is D11 plus the other 400s and the 404: every
// refusal leaves no group, no broadcast and no membership change.
func TestCreateGroup_RefusesAndCreatesNothing(t *testing.T) {
	tests := []struct {
		name    string
		body    string
		status  int
		code    string
		message string
	}{
		{"body not JSON", `not json`, 400, "invalid_request", "invalid JSON body"},
		{"name missing", `{}`, 400, "invalid_request", "name must be 1-40 characters after trimming"},
		{"name empty", `{"name":""}`, 400, "invalid_request", "name must be 1-40 characters after trimming"},
		{"name trims empty", `{"name":"   "}`, 400, "invalid_request", "name must be 1-40 characters after trimming"},
		{"name over 40 characters", `{"name":"` + strings.Repeat("x", 41) + `"}`, 400, "invalid_request", "name must be 1-40 characters after trimming"},
		{"name over 40 multi-byte characters", `{"name":"` + strings.Repeat("é", 41) + `"}`, 400, "invalid_request", "name must be 1-40 characters after trimming"},
		{"name is a number", `{"name":5}`, 400, "invalid_request", "name must be 1-40 characters after trimming"},
		{"sessionIds is not an array", `{"name":"x","sessionIds":"7"}`, 400, "invalid_request", "sessionIds must be session ids without duplicates"},
		{"sessionIds holds a string", `{"name":"x","sessionIds":["a"]}`, 400, "invalid_request", "sessionIds must be session ids without duplicates"},
		{"unknown session", `{"name":"x","sessionIds":[999999]}`, 404, "unknown_session", "unknown session id"},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			h := newGroupsHarness(t)
			existing := h.launch(nil)
			h.wire.reset()

			rec := h.do(http.MethodPost, pathGroups, tt.body)

			assertErrorResponse(t, rec, tt.status, tt.code, tt.message)
			assert.Empty(t, h.groupIDs())
			assert.Equal(t, 0, h.groupRowCount())
			assert.Empty(t, h.wire.kinds())
			assert.Equal(t, int64(0), h.sessionGroup(existing))
		})
	}
}

func TestCreateGroup_ADuplicateSessionIDIs400AndCreatesNothing(t *testing.T) {
	h := newGroupsHarness(t)
	id := h.launch(nil)
	h.wire.reset()

	rec := h.do(http.MethodPost, pathGroups, fmt.Sprintf(`{"name":"x","sessionIds":[%d,%d]}`, id, id))

	code, _ := errorOf(t, rec)
	assert.Equal(t, http.StatusBadRequest, rec.Code)
	assert.Equal(t, "invalid_request", code)
	assert.Equal(t, 0, h.groupRowCount())
	assert.Empty(t, h.wire.kinds())
}

// --- PUT /api/groups/{id} ---

func TestUpdateGroup_Succeeds(t *testing.T) {
	tests := []struct {
		name          string
		body          string
		wantName      string
		wantCollapsed bool
	}{
		{"rename", `{"name":"  Renamed "}`, "Renamed", false},
		{"collapse", `{"collapsed":true}`, "A", true},
		{"rename and collapse", `{"name":"Z","collapsed":true}`, "Z", true},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			h := newGroupsHarness(t)
			id := h.newGroup("A")
			h.wire.reset()

			rec := h.do(http.MethodPut, groupPath(id), tt.body)

			assert.Equal(t, http.StatusNoContent, rec.Code)
			assert.Empty(t, rec.Body.Bytes())
			assert.Equal(t, []string{"groups"}, h.wire.kinds(), "one groups message, no session upsert")
			groups := h.wire.last(t, "groups")["groups"].([]any)
			require.Len(t, groups, 1)
			g := groups[0].(map[string]any)
			assert.Equal(t, tt.wantName, g["name"])
			assert.Equal(t, tt.wantCollapsed, g["collapsed"])
		})
	}
}

// TestUpdateGroup_AlreadyInTheRequestedStateBroadcastsNothing is D14 for PUT /api/groups/{id}.
func TestUpdateGroup_AlreadyInTheRequestedStateBroadcastsNothing(t *testing.T) {
	for _, body := range []string{`{"collapsed":false}`, `{"name":"A"}`, `{"name":" A ","collapsed":false}`} {
		t.Run(body, func(t *testing.T) {
			h := newGroupsHarness(t)
			id := h.newGroup("A")
			h.wire.reset()

			rec := h.do(http.MethodPut, groupPath(id), body)

			assert.Equal(t, http.StatusNoContent, rec.Code)
			assert.Empty(t, h.wire.kinds())
		})
	}
}

func TestUpdateGroup_ZeroIsTheUngroupedSection(t *testing.T) {
	h := newGroupsHarness(t)
	h.newGroup("A")
	h.wire.reset()

	rec := h.do(http.MethodPut, groupPath(0), `{"collapsed":true}`)

	assert.Equal(t, http.StatusNoContent, rec.Code)
	msg := h.wire.last(t, "groups")
	assert.Equal(t, true, msg["ungrouped"].(map[string]any)["collapsed"])
	assert.Equal(t, false, msg["groups"].([]any)[0].(map[string]any)["collapsed"], "collapsing Ungrouped leaves a group alone")
}

func TestUpdateGroup_Refuses(t *testing.T) {
	tests := []struct {
		name    string
		path    func(id int64) string
		body    string
		status  int
		code    string
		message string
	}{
		{"body not JSON", groupPath, `nope`, 400, "invalid_request", "invalid JSON body"},
		{"no known field", groupPath, `{}`, 400, "invalid_request", "name or collapsed is required"},
		{"an unknown field only", groupPath, `{"color":"red"}`, 400, "invalid_request", "name or collapsed is required"},
		{"name trims empty", groupPath, `{"name":"  "}`, 400, "invalid_request", "name must be 1-40 characters after trimming"},
		{"name over 40", groupPath, `{"name":"` + strings.Repeat("x", 41) + `"}`, 400, "invalid_request", "name must be 1-40 characters after trimming"},
		{"name is a number", groupPath, `{"name":3}`, 400, "invalid_request", "name must be 1-40 characters after trimming"},
		{"collapsed is a string", groupPath, `{"collapsed":"yes"}`, 400, "invalid_request", "collapsed is required and must be a boolean"},
		{"Ungrouped cannot be renamed", func(int64) string { return groupPath(0) }, `{"name":"x"}`, 400, "invalid_request", "the Ungrouped section cannot be renamed"},
		{"Ungrouped rename with a collapse still refuses", func(int64) string { return groupPath(0) }, `{"name":"x","collapsed":true}`, 400, "invalid_request", "the Ungrouped section cannot be renamed"},
		{"an unknown group", func(int64) string { return groupPath(424242) }, `{"name":"x"}`, 404, "unknown_group", "unknown group"},
		{"an unknown group, collapse only", func(int64) string { return groupPath(424242) }, `{"collapsed":true}`, 404, "unknown_group", "unknown group"},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			h := newGroupsHarness(t)
			id := h.newGroup("A")
			h.wire.reset()

			rec := h.do(http.MethodPut, tt.path(id), tt.body)

			assertErrorResponse(t, rec, tt.status, tt.code, tt.message)
			assert.Empty(t, h.wire.kinds(), "a refusal broadcasts nothing")
			groups, ungrouped := h.mgr.Groups()
			assert.Equal(t, "A", groups[0].Name)
			assert.False(t, groups[0].Collapsed)
			assert.False(t, ungrouped.Collapsed)
		})
	}
}

// --- PUT /api/groups/order (D12) ---

func TestSetGroupsOrder_Succeeds(t *testing.T) {
	h := newGroupsHarness(t)
	a := h.newGroup("A")
	b := h.newGroup("B")
	h.wire.reset()

	rec := h.do(http.MethodPut, pathGroupsOrder, fmt.Sprintf(`{"order":[%d,0,%d]}`, b, a))

	assert.Equal(t, http.StatusNoContent, rec.Code, "the literal order segment wins over {id}")
	assert.Equal(t, []string{"groups"}, h.wire.kinds())
	msg := h.wire.last(t, "groups")
	byID := map[float64]float64{}
	for _, g := range msg["groups"].([]any) {
		gm := g.(map[string]any)
		byID[gm["id"].(float64)] = gm["pos"].(float64)
	}
	assert.Equal(t, float64(0), byID[float64(b)])
	assert.Equal(t, float64(2), byID[float64(a)])
	assert.Equal(t, float64(1), msg["ungrouped"].(map[string]any)["pos"])
}

func TestSetGroupsOrder_UnchangedBroadcastsNothing(t *testing.T) {
	h := newGroupsHarness(t)
	a := h.newGroup("A")
	b := h.newGroup("B")
	h.wire.reset()

	rec := h.do(http.MethodPut, pathGroupsOrder, fmt.Sprintf(`{"order":[%d,%d,0]}`, a, b))

	assert.Equal(t, http.StatusNoContent, rec.Code)
	assert.Empty(t, h.wire.kinds())
}

// TestSetGroupsOrder_RefusesAnInvalidOrderAndChangesNothing is D12 at the endpoint: a
// missing, duplicate or unknown id, an absent 0, or a non-array each answer 400 with the
// documented message, and the order is as it was.
func TestSetGroupsOrder_RefusesAnInvalidOrderAndChangesNothing(t *testing.T) {
	const msg = "order must list every group id and 0 exactly once"
	tests := []struct {
		name string
		body func(a, b int64) string
	}{
		{"body not JSON", func(_, _ int64) string { return `{` }},
		{"order absent", func(_, _ int64) string { return `{}` }},
		{"order null", func(_, _ int64) string { return `{"order":null}` }},
		{"order not an array", func(_, _ int64) string { return `{"order":"1,2"}` }},
		{"order holds a string", func(a, _ int64) string { return fmt.Sprintf(`{"order":[%d,"x",0]}`, a) }},
		{"missing a group", func(a, _ int64) string { return fmt.Sprintf(`{"order":[%d,0]}`, a) }},
		{"0 absent", func(a, b int64) string { return fmt.Sprintf(`{"order":[%d,%d]}`, a, b) }},
		{"a duplicate id", func(a, b int64) string { return fmt.Sprintf(`{"order":[%d,%d,%d,0]}`, a, a, b) }},
		{"a duplicate 0", func(a, _ int64) string { return fmt.Sprintf(`{"order":[%d,0,0]}`, a) }},
		{"an unknown id", func(a, _ int64) string { return fmt.Sprintf(`{"order":[%d,424242,0]}`, a) }},
		{"empty", func(_, _ int64) string { return `{"order":[]}` }},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			h := newGroupsHarness(t)
			a := h.newGroup("A")
			b := h.newGroup("B")
			before, _ := h.mgr.Groups()
			h.wire.reset()

			rec := h.do(http.MethodPut, pathGroupsOrder, tt.body(a, b))

			assertErrorResponse(t, rec, 400, "invalid_request", msg)
			after, _ := h.mgr.Groups()
			assert.Equal(t, before, after, "nothing changes on a 400")
			assert.Empty(t, h.wire.kinds())
		})
	}
}

// --- PUT /api/groups/collapsed ---

func TestSetAllCollapsed(t *testing.T) {
	h := newGroupsHarness(t)
	h.newGroup("A")
	h.newGroup("B")
	h.wire.reset()

	rec := h.do(http.MethodPut, pathGroupsCollapsed, `{"collapsed":true}`)

	assert.Equal(t, http.StatusNoContent, rec.Code, "the literal collapsed segment wins over {id}")
	assert.Equal(t, []string{"groups"}, h.wire.kinds(), "one broadcast for the whole write")
	msg := h.wire.last(t, "groups")
	for _, g := range msg["groups"].([]any) {
		assert.Equal(t, true, g.(map[string]any)["collapsed"])
	}
	assert.Equal(t, true, msg["ungrouped"].(map[string]any)["collapsed"])

	rec = h.do(http.MethodPut, pathGroupsCollapsed, `{"collapsed":true}`)
	assert.Equal(t, http.StatusNoContent, rec.Code)
	assert.Equal(t, []string{"groups"}, h.wire.kinds(), "D14: already collapsed, no second broadcast")

	rec = h.do(http.MethodPut, pathGroupsCollapsed, `{"collapsed":false}`)
	assert.Equal(t, http.StatusNoContent, rec.Code)
	assert.Equal(t, []string{"groups", "groups"}, h.wire.kinds())
}

func TestSetAllCollapsed_WithNoGroupsIsA204(t *testing.T) {
	h := newGroupsHarness(t)

	rec := h.do(http.MethodPut, pathGroupsCollapsed, `{"collapsed":true}`)

	assert.Equal(t, http.StatusNoContent, rec.Code)
}

func TestSetAllCollapsed_Refuses(t *testing.T) {
	for _, body := range []string{`nope`, `{}`, `{"collapsed":null}`, `{"collapsed":"true"}`, `{"collapsed":1}`} {
		t.Run(body, func(t *testing.T) {
			h := newGroupsHarness(t)
			h.newGroup("A")
			h.wire.reset()

			rec := h.do(http.MethodPut, pathGroupsCollapsed, body)

			assertErrorResponse(t, rec, 400, "invalid_request", "collapsed is required and must be a boolean")
			assert.Empty(t, h.wire.kinds())
		})
	}
}

// --- DELETE /api/groups/{id} ---

// deleteFixture is two groups A and B, three sessions in A, one in B and one Ungrouped.
type deleteFixture struct {
	h              *groupsHarness
	a, b           int64
	a1, a2, a3     int64
	b1, ungrouped1 int64
}

func newDeleteFixture(t *testing.T) *deleteFixture {
	t.Helper()
	h := newGroupsHarness(t)
	f := &deleteFixture{h: h}
	f.a = h.newGroup("A")
	f.b = h.newGroup("B")
	f.a1, f.a2, f.a3 = h.launch(&f.a), h.launch(&f.a), h.launch(&f.a)
	f.b1 = h.launch(&f.b)
	f.ungrouped1 = h.launch(nil)
	h.wire.reset()
	return f
}

func TestDeleteGroup_NoBodyUngroupsTheMembers(t *testing.T) {
	f := newDeleteFixture(t)

	rec := f.h.do(http.MethodDelete, groupPath(f.a), "")

	require.Equal(t, http.StatusOK, rec.Code, rec.Body.String())
	body := decodeBody(t, rec)
	assert.Equal(t, true, body["deleted"])
	sessions := body["sessions"].(map[string]any)
	assert.Equal(t, []int64{f.a1, f.a2, f.a3}, idList(t, sessions["done"]))
	assert.Equal(t, []any{}, sessions["skipped"], "an empty list is [], never null")
	assert.Equal(t, []any{}, sessions["failed"])
	assert.Contains(t, rec.Body.String(), `"skipped":[]`)
	for _, id := range []int64{f.a1, f.a2, f.a3} {
		assert.Equal(t, int64(0), f.h.sessionGroup(id))
	}
	assert.Equal(t, []int64{f.b}, f.h.groupIDs())
}

func TestDeleteGroup_DispositionsOverTheWire(t *testing.T) {
	t.Run("ungroup, explicit", func(t *testing.T) {
		f := newDeleteFixture(t)

		rec := f.h.do(http.MethodDelete, groupPath(f.a), `{"sessions":"ungroup"}`)

		require.Equal(t, http.StatusOK, rec.Code)
		assert.Equal(t, int64(0), f.h.sessionGroup(f.a1))
	})

	t.Run("move to another group", func(t *testing.T) {
		f := newDeleteFixture(t)

		rec := f.h.do(http.MethodDelete, groupPath(f.a), fmt.Sprintf(`{"sessions":"move","to":%d}`, f.b))

		require.Equal(t, http.StatusOK, rec.Code, rec.Body.String())
		for _, id := range []int64{f.a1, f.a2, f.a3} {
			assert.Equal(t, f.b, f.h.sessionGroup(id))
		}
		assert.Equal(t, []int64{f.b}, f.h.groupIDs())
	})

	t.Run("remove", func(t *testing.T) {
		f := newDeleteFixture(t)

		rec := f.h.do(http.MethodDelete, groupPath(f.a), `{"sessions":"remove"}`)

		require.Equal(t, http.StatusOK, rec.Code, rec.Body.String())
		body := decodeBody(t, rec)
		assert.Equal(t, true, body["deleted"])
		assert.Equal(t, []int64{f.a1, f.a2, f.a3}, idList(t, body["sessions"].(map[string]any)["done"]))
		for _, id := range []int64{f.a1, f.a2, f.a3} {
			assert.False(t, f.h.mgr.Exists(id))
		}
		assert.Equal(t, []int64{f.b}, f.h.groupIDs())
		assert.True(t, f.h.mgr.Exists(f.b1), "another group's session is untouched")
		assert.True(t, f.h.mgr.Exists(f.ungrouped1), "an Ungrouped session is untouched")
	})
}

// TestDeleteGroup_BroadcastsMemberChangesBeforeGroups is D15's delete half: the groups
// message follows every upsert or sessionRemoved that leaves the group. A removed live member
// is first stopped, so its alive:false upsert precedes its sessionRemoved.
func TestDeleteGroup_BroadcastsMemberChangesBeforeGroups(t *testing.T) {
	for _, tt := range []struct {
		name string
		body string
		want []string // the member messages that must appear, whatever their order
	}{
		{"ungroup", `{"sessions":"ungroup"}`, []string{"sessionUpsert"}},
		{"remove", `{"sessions":"remove"}`, []string{"sessionRemoved"}},
	} {
		t.Run(tt.name, func(t *testing.T) {
			f := newDeleteFixture(t)

			rec := f.h.do(http.MethodDelete, groupPath(f.a), tt.body)

			require.Equal(t, http.StatusOK, rec.Code)
			kinds := f.h.wire.kinds()
			require.NotEmpty(t, kinds)
			assert.Equal(t, "groups", kinds[len(kinds)-1], "groups is last")
			assert.Equal(t, 1, f.h.wire.count("groups"))
			for _, id := range []int64{f.a1, f.a2, f.a3} {
				for _, kind := range tt.want {
					assert.Contains(t, kinds, fmt.Sprintf("%s:%d", kind, id), "member %d was announced", id)
				}
			}
			assert.NotContains(t, kinds, fmt.Sprintf("sessionUpsert:%d", f.b1), "a bystander is never broadcast")
			assert.NotContains(t, kinds, fmt.Sprintf("sessionUpsert:%d", f.ungrouped1))
		})
	}
}

// TestDeleteGroup_RemoveTearsDownEachRemovedSessionAndNoOther is the server tail of remove:
// every removed session's shell is killed (teardownRemoved), and only theirs.
func TestDeleteGroup_RemoveTearsDownEachRemovedSessionAndNoOther(t *testing.T) {
	f := newDeleteFixture(t)

	rec := f.h.do(http.MethodDelete, groupPath(f.a), `{"sessions":"remove"}`)

	require.Equal(t, http.StatusOK, rec.Code)
	assert.ElementsMatch(t, []string{shellName(f.a1), shellName(f.a2), shellName(f.a3)}, f.h.spawner.shellKills())
	assert.ElementsMatch(t, []string{"muster-" + fmt.Sprint(f.a1), "muster-" + fmt.Sprint(f.a2), "muster-" + fmt.Sprint(f.a3)}, f.h.killer.killedNames(),
		"only the members' Claude tmux sessions are killed")
}

// TestDeleteGroup_RemoveWithAFailedKillKeepsTheGroupAndTearsDownOnlyWhatWasRemoved is D9's
// delete-group half over the wire.
func TestDeleteGroup_RemoveWithAFailedKillKeepsTheGroupAndTearsDownOnlyWhatWasRemoved(t *testing.T) {
	f := newDeleteFixture(t)
	f.h.killer.failKill(fmt.Sprintf("muster-%d", f.a2))

	rec := f.h.do(http.MethodDelete, groupPath(f.a), `{"sessions":"remove"}`)

	require.Equal(t, http.StatusOK, rec.Code, "a failed member is reported, not a 500")
	body := decodeBody(t, rec)
	assert.Equal(t, false, body["deleted"])
	sessions := body["sessions"].(map[string]any)
	assert.Equal(t, []int64{f.a1, f.a3}, idList(t, sessions["done"]))
	assert.Equal(t, []int64{f.a2}, idList(t, sessions["failed"]))
	assert.Equal(t, []any{}, sessions["skipped"])
	assert.True(t, f.h.mgr.Exists(f.a2))
	assert.Equal(t, f.a, f.h.sessionGroup(f.a2), "the failed session stays in the group")
	assert.Equal(t, 0, f.h.wire.count("groups"), "the group was not deleted")
	assert.ElementsMatch(t, []string{shellName(f.a1), shellName(f.a3)}, f.h.spawner.shellKills(), "no teardown for the session that was not removed")
}

func TestDeleteGroup_Refuses(t *testing.T) {
	tests := []struct {
		name    string
		path    func(f *deleteFixture) string
		body    func(f *deleteFixture) string
		status  int
		code    string
		message string
	}{
		{"Ungrouped cannot be deleted", func(*deleteFixture) string { return groupPath(0) }, func(*deleteFixture) string { return "" }, 400, "invalid_request", "the Ungrouped section cannot be deleted"},
		{"an unknown disposition", func(f *deleteFixture) string { return groupPath(f.a) }, func(*deleteFixture) string { return `{"sessions":"burn"}` }, 400, "invalid_request", "sessions must be ungroup, move or remove"},
		{"a disposition of the wrong type", func(f *deleteFixture) string { return groupPath(f.a) }, func(*deleteFixture) string { return `{"sessions":5}` }, 400, "invalid_request", "sessions must be ungroup, move or remove"},
		{"move without to", func(f *deleteFixture) string { return groupPath(f.a) }, func(*deleteFixture) string { return `{"sessions":"move"}` }, 400, "invalid_request", "to is required with sessions move"},
		{"move onto itself", func(f *deleteFixture) string { return groupPath(f.a) }, func(f *deleteFixture) string { return fmt.Sprintf(`{"sessions":"move","to":%d}`, f.a) }, 400, "invalid_request", "to must name another group"},
		{"a body that is not JSON", func(f *deleteFixture) string { return groupPath(f.a) }, func(*deleteFixture) string { return `{` }, 400, "invalid_request", "invalid JSON body"},
		{"an unknown group", func(*deleteFixture) string { return groupPath(424242) }, func(*deleteFixture) string { return "" }, 404, "unknown_group", "unknown group"},
		{"an unknown group with remove", func(*deleteFixture) string { return groupPath(424242) }, func(*deleteFixture) string { return `{"sessions":"remove"}` }, 404, "unknown_group", "unknown group"},
		// D13: the target names no group, and the message says it is the target.
		{"move to an unknown target", func(f *deleteFixture) string { return groupPath(f.a) }, func(*deleteFixture) string { return `{"sessions":"move","to":424242}` }, 404, "unknown_group", "unknown target group"},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			f := newDeleteFixture(t)

			rec := f.h.do(http.MethodDelete, tt.path(f), tt.body(f))

			assertErrorResponse(t, rec, tt.status, tt.code, tt.message)
			assert.Equal(t, []int64{f.a, f.b}, f.h.groupIDs(), "no group is deleted")
			for _, id := range []int64{f.a1, f.a2, f.a3} {
				assert.Equal(t, f.a, f.h.sessionGroup(id), "no member moves")
				assert.True(t, f.h.mgr.Exists(id))
			}
			assert.Empty(t, f.h.wire.kinds(), "nothing is broadcast")
			assert.Empty(t, f.h.killer.killedNames())
		})
	}
}

func TestDeleteGroup_EmptyGroupIs200WithNothingDone(t *testing.T) {
	h := newGroupsHarness(t)
	id := h.newGroup("Empty")
	h.wire.reset()

	rec := h.do(http.MethodDelete, groupPath(id), "")

	require.Equal(t, http.StatusOK, rec.Code)
	assert.JSONEq(t, `{"deleted":true,"sessions":{"done":[],"skipped":[],"failed":[]}}`, rec.Body.String())
	assert.Equal(t, []string{"groups"}, h.wire.kinds())
}

// TestGroupsContribute_SnapshotCarriesTheReloadedGroups is D8's snapshot half: after a daemon
// restart (a fresh manager over the same store, loaded through LoadAll) the snapshot's two
// keys hold every group's name, pos and collapsed state and the Ungrouped layout, and each
// session's groupId rides the Session object.
func TestGroupsContribute_SnapshotCarriesTheReloadedGroups(t *testing.T) {
	h := newGroupsHarness(t)
	a := h.newGroup("Alpha")
	b := h.newGroup("Beta")
	member := h.launch(&b)
	yes := true
	require.NoError(t, h.mgr.UpdateGroup(context.Background(), a, nil, &yes))
	require.NoError(t, h.mgr.UpdateGroup(context.Background(), 0, nil, &yes))
	require.NoError(t, h.mgr.SetGroupsOrder(context.Background(), []int64{0, b, a}))

	restarted := newSessionTestManager(t, h.st)
	require.NoError(t, restarted.LoadAll(context.Background()))
	var snap Snapshot
	newGroupsFeature(restarted, nil, zerolog.Nop()).contribute(context.Background(), &snap)

	b1, err := json.Marshal(snap)
	require.NoError(t, err)
	var got struct {
		Groups    []groupWire   `json:"groups"`
		Ungrouped ungroupedWire `json:"ungrouped"`
	}
	require.NoError(t, json.Unmarshal(b1, &got))
	assert.Equal(t, []groupWire{{ID: b, Name: "Beta", Pos: 1}, {ID: a, Name: "Alpha", Pos: 2, Collapsed: true}}, got.Groups)
	assert.Equal(t, ungroupedWire{Pos: 0, Collapsed: true}, got.Ungrouped)
	reloaded, ok := restarted.Get(member)
	require.True(t, ok)
	require.NotNil(t, reloaded.GroupID)
	wireGroup := toWireSession(reloaded).GroupID
	require.NotNil(t, wireGroup)
	assert.Equal(t, b, *wireGroup, "the member's groupId survives the restart onto the wire")
}
