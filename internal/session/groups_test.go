package session

import (
	"fmt"
	"slices"
	"strings"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestNormalizeGroupName(t *testing.T) {
	tests := []struct {
		name   string
		raw    string
		want   string
		wantOK bool
	}{
		{"plain", "PR reviews", "PR reviews", true},
		{"trimmed", "  PR reviews \t", "PR reviews", true},
		{"inner spacing kept", "a  b", "a  b", true},
		{"one character", "x", "x", true},
		{"exactly 40 characters", strings.Repeat("a", 40), strings.Repeat("a", 40), true},
		{"41 characters", strings.Repeat("a", 41), strings.Repeat("a", 41), false},
		{"40 multi-byte characters count as 40", strings.Repeat("é", 40), strings.Repeat("é", 40), true},
		{"41 multi-byte characters", strings.Repeat("é", 41), strings.Repeat("é", 41), false},
		{"40 characters once trimmed", " " + strings.Repeat("a", 40) + " ", strings.Repeat("a", 40), true},
		{"empty", "", "", false},
		{"spaces only", "   ", "", false},
		{"tab and newline only", "\t\n", "", false},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got, ok := NormalizeGroupName(tt.raw)

			assert.Equal(t, tt.wantOK, ok)
			assert.Equal(t, tt.want, got)
		})
	}
}

func TestGroupIDConversions(t *testing.T) {
	assert.Equal(t, ungroupedSection, groupIDVal(nil))
	three := int64(3)
	assert.Equal(t, int64(3), groupIDVal(&three))
	assert.Nil(t, groupIDPtr(0))
	got := groupIDPtr(3)
	require.NotNil(t, got)
	assert.Equal(t, int64(3), *got)
}

// --- CreateGroup ---

func TestCreateGroup_LandsAboveUngroupedAndRenumbersEverySection(t *testing.T) {
	r := newGroupsRig(t)

	first, err := r.mgr.CreateGroup(r.ctx, "  First ", nil)
	require.NoError(t, err)

	assert.Equal(t, "First", first.Name, "the name is trimmed")
	assert.Equal(t, int64(0), first.Pos)
	assert.False(t, first.Collapsed)
	groups, ungrouped := r.mgr.Groups()
	assert.Equal(t, []Group{first}, groups)
	assert.Equal(t, UngroupedLayout{Pos: 1}, ungrouped, "Ungrouped moves one place down")

	second, err := r.mgr.CreateGroup(r.ctx, "Second", nil)
	require.NoError(t, err)

	assert.Equal(t, int64(1), second.Pos)
	assert.Equal(t, []string{"First", "Second", "-"}, r.sectionNames())
	assert.Equal(t, []string{"groups", "groups"}, r.log.kinds(), "one groups broadcast per create, carrying the whole list")
	last := r.log.lastGroups(t)
	assert.Len(t, last.groups, 2)
	assert.Equal(t, UngroupedLayout{Pos: 2}, last.ungrouped)
	r.assertConsistent()
}

func TestCreateGroup_AppearsDirectlyAboveUngroupedWhereverItHasBeenDragged(t *testing.T) {
	r := newGroupsRig(t)
	a := r.newGroup("A")
	b := r.newGroup("B")
	require.NoError(t, r.mgr.SetGroupsOrder(r.ctx, []int64{0, a, b})) // Ungrouped dragged to the top

	c, err := r.mgr.CreateGroup(r.ctx, "C", nil)
	require.NoError(t, err)

	assert.Equal(t, []string{"C", "-", "A", "B"}, r.sectionNames())
	assert.Equal(t, int64(0), c.Pos)
	r.assertConsistent()
}

func TestCreateGroup_RefusesAnInvalidNameAndCreatesNothing(t *testing.T) {
	for _, name := range []string{"", "   ", "\t", strings.Repeat("a", 41), strings.Repeat("é", 41)} {
		t.Run(strings.ReplaceAll(name, "\t", "tab"), func(t *testing.T) {
			r := newGroupsRig(t)

			_, err := r.mgr.CreateGroup(r.ctx, name, nil)

			require.ErrorIs(t, err, ErrInvalidGroupName)
			groups, _ := r.mgr.Groups()
			assert.Empty(t, groups)
			assert.Empty(t, r.groupRows())
			assert.Empty(t, r.log.kinds(), "nothing is broadcast")
		})
	}
}

func TestCreateGroup_WithSessionsBroadcastsGroupsBeforeTheUpserts(t *testing.T) {
	r := newFixtureRig(t)
	before := r.snapshotAll()
	// 12 is pinned, 2 and 23 are not; listed with the unpinned one first to prove the pin
	// survives and the section's pinned run still leads.
	listed := r.ids("2", "12", "23")

	g, err := r.mgr.CreateGroup(r.ctx, "New", listed)

	require.NoError(t, err)
	kinds := r.log.kinds()
	require.Len(t, kinds, 4)
	assert.Equal(t, "groups", kinds[0], "D15: the groups message precedes every upsert that joins the new group")
	assert.ElementsMatch(t, upserts(listed), kinds[1:], "one upsert per moved session")
	for _, label := range []string{"2", "12", "23"} {
		assert.Equal(t, g.ID, r.groupOf(label))
	}
	assert.Equal(t, []string{"12", "2", "23"}, r.members(g.ID), "pinned leads, then listed order")
	assert.True(t, r.session("12").Pinned, "a mover keeps its pin")
	assert.Greater(t, r.session("2").RailPos, int64(8), "movers land after every existing railPos")
	// Sections the movers left keep their railPos, gaps included.
	assert.Equal(t, before["11"], factsOf(r.session("11")))
	assert.Equal(t, before["13"], factsOf(r.session("13")))
	r.assertBystandersUntouched(before, "2", "12", "23")
	r.assertConsistent()
}

func TestCreateGroup_RefusesBadSessionIDsAndCreatesNothing(t *testing.T) {
	tests := []struct {
		name    string
		ids     func(r *groupsRig) []int64
		wantErr error
	}{
		{"an unknown session", func(r *groupsRig) []int64 { return []int64{r.id("1"), 999999} }, ErrUnknownSession},
		{"a repeated session", func(r *groupsRig) []int64 { return []int64{r.id("1"), r.id("2"), r.id("1")} }, ErrInvalidOrder},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			r := newFixtureRig(t)
			before := r.snapshotAll()
			groupsBefore, _ := r.mgr.Groups()

			_, err := r.mgr.CreateGroup(r.ctx, "Ghost", tt.ids(r))

			require.ErrorIs(t, err, tt.wantErr)
			groupsAfter, _ := r.mgr.Groups()
			assert.Equal(t, groupsBefore, groupsAfter)
			assert.Len(t, r.groupRows(), 2, "no row was inserted")
			assert.Empty(t, r.log.kinds())
			r.assertBystandersUntouched(before)
		})
	}
}

func upserts(ids []int64) []string {
	out := make([]string, len(ids))
	for i, id := range ids {
		out[i] = fmt.Sprintf("upsert:%d", id)
	}
	return out
}

// --- UpdateGroup ---

func TestUpdateGroup(t *testing.T) {
	str := func(s string) *string { return &s }
	boolp := func(b bool) *bool { return &b }
	tests := []struct {
		name        string
		id          func(r *groupsRig) int64
		newName     *string
		collapsed   *bool
		wantErr     error
		wantBroad   int // groups broadcasts
		wantName    string
		wantCollaps bool
	}{
		{"rename", func(r *groupsRig) int64 { return r.groupA }, str("  Renamed "), nil, nil, 1, "Renamed", false},
		{"collapse", func(r *groupsRig) int64 { return r.groupA }, nil, boolp(true), nil, 1, "A", true},
		{"rename and collapse together broadcast once", func(r *groupsRig) int64 { return r.groupA }, str("Z"), boolp(true), nil, 1, "Z", true},
		{"collapse already collapsed state is a no-op", func(r *groupsRig) int64 { return r.groupA }, nil, boolp(false), nil, 0, "A", false},
		{"rename to the same name is a no-op", func(r *groupsRig) int64 { return r.groupA }, str("A"), nil, nil, 0, "A", false},
		{"rename to the same name once trimmed is a no-op", func(r *groupsRig) int64 { return r.groupA }, str(" A "), nil, nil, 0, "A", false},
		{"a name that trims empty", func(r *groupsRig) int64 { return r.groupA }, str("  "), nil, ErrInvalidGroupName, 0, "A", false},
		{"a name over 40 characters", func(r *groupsRig) int64 { return r.groupA }, str(strings.Repeat("x", 41)), nil, ErrInvalidGroupName, 0, "A", false},
		{"an unknown group", func(_ *groupsRig) int64 { return 424242 }, str("x"), nil, ErrUnknownGroup, 0, "A", false},
		{"an unknown group, collapse only", func(_ *groupsRig) int64 { return 424242 }, nil, boolp(true), ErrUnknownGroup, 0, "A", false},
		{"Ungrouped cannot be renamed", func(_ *groupsRig) int64 { return 0 }, str("x"), nil, ErrUngroupedSection, 0, "A", false},
		{"an invalid name is reported before the Ungrouped refusal is reached", func(_ *groupsRig) int64 { return 0 }, str(""), nil, ErrInvalidGroupName, 0, "A", false},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			r := newGroupsRig(t)
			r.groupA = r.newGroup("A")
			r.log.reset()

			err := r.mgr.UpdateGroup(r.ctx, tt.id(r), tt.newName, tt.collapsed)

			if tt.wantErr != nil {
				require.ErrorIs(t, err, tt.wantErr)
			} else {
				require.NoError(t, err)
			}
			assert.Equal(t, tt.wantBroad, r.log.count("groups"))
			groups, _ := r.mgr.Groups()
			require.Len(t, groups, 1)
			assert.Equal(t, tt.wantName, groups[0].Name)
			assert.Equal(t, tt.wantCollaps, groups[0].Collapsed)
			r.assertConsistent()
		})
	}
}

func TestUpdateGroup_UngroupedCollapsedFlag(t *testing.T) {
	r := newGroupsRig(t)
	r.groupA = r.newGroup("A")
	r.log.reset()
	yes, no := true, false

	require.NoError(t, r.mgr.UpdateGroup(r.ctx, 0, nil, &yes))
	_, ungrouped := r.mgr.Groups()
	assert.True(t, ungrouped.Collapsed)
	assert.Equal(t, 1, r.log.count("groups"))
	assert.True(t, r.log.lastGroups(t).ungrouped.Collapsed)

	require.NoError(t, r.mgr.UpdateGroup(r.ctx, 0, nil, &yes))
	assert.Equal(t, 1, r.log.count("groups"), "already collapsed: no second broadcast")

	require.NoError(t, r.mgr.UpdateGroup(r.ctx, 0, nil, &no))
	_, ungrouped = r.mgr.Groups()
	assert.False(t, ungrouped.Collapsed)
	groups, _ := r.mgr.Groups()
	assert.False(t, groups[0].Collapsed, "collapsing Ungrouped never touches a group")
	r.assertConsistent()
}

func TestUpdateGroup_NeverTouchesAnotherGroupOrAnySession(t *testing.T) {
	r := newFixtureRig(t)
	before := r.snapshotAll()
	name := "Renamed"
	yes := true

	require.NoError(t, r.mgr.UpdateGroup(r.ctx, r.groupA, &name, &yes))

	groups, _ := r.mgr.Groups()
	byID := map[int64]Group{}
	for _, g := range groups {
		byID[g.ID] = g
	}
	assert.Equal(t, "B", byID[r.groupB].Name)
	assert.False(t, byID[r.groupB].Collapsed)
	assert.Equal(t, []string{"groups"}, r.log.kinds(), "a rename or collapse broadcasts no session")
	r.assertBystandersUntouched(before)
}

// --- SetGroupsOrder ---

func TestSetGroupsOrder_ReordersAndBroadcastsOnce(t *testing.T) {
	r := newGroupsRig(t)
	a := r.newGroup("A")
	b := r.newGroup("B")
	r.log.reset()

	require.NoError(t, r.mgr.SetGroupsOrder(r.ctx, []int64{b, 0, a}))

	assert.Equal(t, []string{"B", "-", "A"}, r.sectionNames())
	assert.Equal(t, []string{"groups"}, r.log.kinds())
	groups, ungrouped := r.mgr.Groups()
	byID := map[int64]Group{}
	for _, g := range groups {
		byID[g.ID] = g
	}
	assert.Equal(t, int64(0), byID[b].Pos)
	assert.Equal(t, int64(1), ungrouped.Pos)
	assert.Equal(t, int64(2), byID[a].Pos)
	r.assertConsistent()
}

func TestSetGroupsOrder_UnchangedOrderBroadcastsNothing(t *testing.T) {
	r := newGroupsRig(t)
	a := r.newGroup("A")
	b := r.newGroup("B")
	r.log.reset()

	require.NoError(t, r.mgr.SetGroupsOrder(r.ctx, []int64{a, b, 0}))

	assert.Empty(t, r.log.kinds())
}

// TestSetGroupsOrder_RefusesAnInvalidOrderAndChangesNothing is D12 at the manager.
func TestSetGroupsOrder_RefusesAnInvalidOrderAndChangesNothing(t *testing.T) {
	tests := []struct {
		name  string
		order func(a, b int64) []int64
	}{
		{"missing a group", func(a, _ int64) []int64 { return []int64{a, 0} }},
		{"missing Ungrouped", func(a, b int64) []int64 { return []int64{a, b} }},
		{"a duplicate id", func(a, _ int64) []int64 { return []int64{a, a, 0} }},
		{"an unknown id", func(a, _ int64) []int64 { return []int64{a, 9999, 0} }},
		{"an extra id", func(a, b int64) []int64 { return []int64{a, b, 0, 9999} }},
		{"empty", func(_, _ int64) []int64 { return nil }},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			r := newGroupsRig(t)
			a := r.newGroup("A")
			b := r.newGroup("B")
			namesBefore := r.sectionNames()
			r.log.reset()

			err := r.mgr.SetGroupsOrder(r.ctx, tt.order(a, b))

			require.ErrorIs(t, err, ErrInvalidGroupOrder)
			assert.Equal(t, namesBefore, r.sectionNames())
			assert.Empty(t, r.log.kinds())
			r.assertConsistent()
		})
	}
}

// fullSectionOrder is every section in pos order, a group a launch still holds back included
// (Groups() leaves it out): the layout the store carries.
func fullSectionOrder(r *groupsRig) []int64 {
	r.mgr.groupsMu.Lock()
	defer r.mgr.groupsMu.Unlock()
	return sectionOrder(r.mgr.groupListLocked(), r.mgr.ungrouped)
}

// TestSetGroupsOrder_WithLaunchHeldGroups: a group a launch holds back is not one a client was
// told of, so the order it sends lists the visible sections only. The held group is validated
// out of the list and slotted back just above Ungrouped, two held ones in ascending id order.
func TestSetGroupsOrder_WithLaunchHeldGroups(t *testing.T) {
	// held names how many launch groups are in flight; order builds the client's order from
	// the visible ids (a, b) and the held ids; want is the full layout the store ends with.
	tests := []struct {
		name  string
		held  int
		order func(a, b int64, held []int64) []int64
		want  func(a, b int64, held []int64) []int64
	}{
		{
			"one held group stays above Ungrouped when the others move",
			1,
			func(a, b int64, _ []int64) []int64 { return []int64{b, 0, a} },
			func(a, b int64, h []int64) []int64 { return []int64{b, h[0], 0, a} },
		},
		{
			"one held group follows Ungrouped dragged to the top",
			1,
			func(a, b int64, _ []int64) []int64 { return []int64{0, a, b} },
			func(a, b int64, h []int64) []int64 { return []int64{h[0], 0, a, b} },
		},
		{
			"two held groups go back in ascending id order",
			2,
			func(a, b int64, _ []int64) []int64 { return []int64{b, 0, a} },
			func(a, b int64, h []int64) []int64 { return []int64{b, h[0], h[1], 0, a} },
		},
		{
			"two held groups with Ungrouped first",
			2,
			func(a, b int64, _ []int64) []int64 { return []int64{0, b, a} },
			func(a, b int64, h []int64) []int64 { return []int64{h[0], h[1], 0, b, a} },
		},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			r := newGroupsRig(t)
			a := r.newGroup("A")
			b := r.newGroup("B")
			var held []int64
			for i := range tt.held {
				g, err := r.mgr.CreateLaunchGroup(r.ctx, fmt.Sprintf("Held%d", i))
				require.NoError(t, err)
				held = append(held, g.ID)
			}
			require.True(t, slices.IsSorted(held), "launch groups are minted in ascending id order")
			r.log.reset()

			require.NoError(t, r.mgr.SetGroupsOrder(r.ctx, tt.order(a, b, held)))

			assert.Equal(t, tt.want(a, b, held), fullSectionOrder(r), "the held groups sit just above Ungrouped, in id order")
			groups, ungrouped := r.mgr.Groups()
			for _, g := range groups {
				assert.NotContains(t, held, g.ID, "Groups() still omits a held group")
			}
			announced := r.log.lastGroups(t)
			for _, g := range announced.groups {
				assert.NotContains(t, held, g.ID, "the groups message omits a held group")
			}
			assert.Equal(t, ungrouped, announced.ungrouped)
			assert.Equal(t, []string{"groups"}, r.log.kinds(), "one broadcast")
			for _, row := range r.groupRows() {
				assert.Equal(t, int64(slices.Index(fullSectionOrder(r), row.ID)), row.Pos, "the store carries the full layout (group %d)", row.ID)
			}
			r.assertConsistent()
		})
	}
}

// TestSetGroupsOrder_HeldGroupIsNotPartOfTheClientsOrder keeps the validation honest with a
// launch in flight: the held id is unknown to the client, so naming it is refused, and a
// visible group left out is still refused — either way nothing changes.
func TestSetGroupsOrder_HeldGroupIsNotPartOfTheClientsOrder(t *testing.T) {
	tests := []struct {
		name  string
		order func(a, b, held int64) []int64
	}{
		{"naming the held group", func(a, b, held int64) []int64 { return []int64{a, b, held, 0} }},
		{"a visible group missing", func(a, _, _ int64) []int64 { return []int64{a, 0} }},
		{"Ungrouped missing", func(a, b, _ int64) []int64 { return []int64{a, b} }},
		{"a duplicate id", func(a, _, _ int64) []int64 { return []int64{a, a, 0} }},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			r := newGroupsRig(t)
			a := r.newGroup("A")
			b := r.newGroup("B")
			g, err := r.mgr.CreateLaunchGroup(r.ctx, "Held")
			require.NoError(t, err)
			orderBefore := fullSectionOrder(r)
			r.log.reset()

			err = r.mgr.SetGroupsOrder(r.ctx, tt.order(a, b, g.ID))

			require.ErrorIs(t, err, ErrInvalidGroupOrder)
			assert.Equal(t, orderBefore, fullSectionOrder(r))
			assert.Empty(t, r.log.kinds())
		})
	}
}

// TestSetGroupsOrder_UnchangedOrderWithAHeldGroupBroadcastsNothing: the held group's own slot
// is not a change, so re-sending the order a client already has stays a silent no-op.
func TestSetGroupsOrder_UnchangedOrderWithAHeldGroupBroadcastsNothing(t *testing.T) {
	r := newGroupsRig(t)
	a := r.newGroup("A")
	b := r.newGroup("B")
	g, err := r.mgr.CreateLaunchGroup(r.ctx, "Held")
	require.NoError(t, err)
	orderBefore := fullSectionOrder(r)
	require.Equal(t, []int64{a, b, g.ID, 0}, orderBefore, "a launch group is created just above Ungrouped")
	r.log.reset()

	require.NoError(t, r.mgr.SetGroupsOrder(r.ctx, []int64{a, b, 0}))

	assert.Empty(t, r.log.kinds())
	assert.Equal(t, orderBefore, fullSectionOrder(r))
}

// TestSetGroupsOrder_TheHeldGroupIsAnnouncedWhereTheReorderLeftIt: once RecordLaunch announces
// the group, a client sees it in the slot above Ungrouped the reorder kept for it.
func TestSetGroupsOrder_TheHeldGroupIsAnnouncedWhereTheReorderLeftIt(t *testing.T) {
	r := newGroupsRig(t)
	a := r.newGroup("A")
	b := r.newGroup("B")
	g, err := r.mgr.CreateLaunchGroup(r.ctx, "Held")
	require.NoError(t, err)
	require.NoError(t, r.mgr.SetGroupsOrder(r.ctx, []int64{b, 0, a}))
	p := createParams(r.dir)
	p.RepoID = r.repoID
	p.GroupID = &g.ID
	sess, err := r.mgr.CreateSession(r.ctx, p)
	require.NoError(t, err)
	r.log.reset()

	_, err = r.mgr.RecordLaunch(r.ctx, sess.ID, "muster-9:@1", "%1")

	require.NoError(t, err)
	assert.Equal(t, []string{"B", "Held", "-", "A"}, r.sectionNames())
	r.assertConsistent()
}

// --- SetAllCollapsed ---

func TestSetAllCollapsed(t *testing.T) {
	r := newGroupsRig(t)
	r.newGroup("A")
	r.newGroup("B")
	r.log.reset()

	require.NoError(t, r.mgr.SetAllCollapsed(r.ctx, true))
	groups, ungrouped := r.mgr.Groups()
	for _, g := range groups {
		assert.True(t, g.Collapsed)
	}
	assert.True(t, ungrouped.Collapsed)
	assert.Equal(t, []string{"groups"}, r.log.kinds(), "one broadcast for the whole write")

	require.NoError(t, r.mgr.SetAllCollapsed(r.ctx, true))
	assert.Equal(t, []string{"groups"}, r.log.kinds(), "already collapsed: nothing more")

	// One group expanded by hand: the next Collapse all is a real change again.
	open := false
	require.NoError(t, r.mgr.UpdateGroup(r.ctx, groups[0].ID, nil, &open))
	r.log.reset()
	require.NoError(t, r.mgr.SetAllCollapsed(r.ctx, true))
	assert.Equal(t, []string{"groups"}, r.log.kinds())

	require.NoError(t, r.mgr.SetAllCollapsed(r.ctx, false))
	groups, ungrouped = r.mgr.Groups()
	for _, g := range groups {
		assert.False(t, g.Collapsed)
	}
	assert.False(t, ungrouped.Collapsed)
	r.assertConsistent()
}

// TestSetAllCollapsed_WithNoGroupsStillFlipsUngrouped is edge case 23: a no-groups call is a
// success, and Ungrouped's flag moves (invisible until a group exists).
func TestSetAllCollapsed_WithNoGroupsStillFlipsUngrouped(t *testing.T) {
	r := newGroupsRig(t)

	require.NoError(t, r.mgr.SetAllCollapsed(r.ctx, true))

	_, ungrouped := r.mgr.Groups()
	assert.True(t, ungrouped.Collapsed)
	r.assertConsistent()
}

// --- SetSessionsGroup ---

func TestSetSessionsGroup(t *testing.T) {
	tests := []struct {
		name        string
		ids         []string
		to          string // "A", "B" or "-" for Ungrouped
		wantMembers []string
		wantUpserts []string // labels, in broadcast order
	}{
		{
			name: "cards join the end of the target section in listed order",
			ids:  []string{"3", "2"}, to: "A",
			wantMembers: []string{"11", "12", "13", "3", "2"},
			wantUpserts: []string{"3", "2"},
		},
		{
			name: "a pinned mover keeps its pin and ends the pinned run",
			ids:  []string{"21"}, to: "A",
			wantMembers: []string{"11", "12", "21", "13"},
			wantUpserts: []string{"21", "13"},
		},
		{
			name: "a move to Ungrouped leaves the group",
			ids:  []string{"22"}, to: "-",
			wantMembers: nil, // asserted below via groupOf
			wantUpserts: []string{"22"},
		},
		{
			name: "a session already in the section is untouched",
			ids:  []string{"13", "3"}, to: "A",
			wantMembers: []string{"11", "12", "13", "3"},
			wantUpserts: []string{"3"},
		},
		{
			name: "every listed session already there broadcasts nothing",
			ids:  []string{"11", "13"}, to: "A",
			wantMembers: []string{"11", "12", "13"},
			wantUpserts: nil,
		},
		{
			name: "an empty list is a no-op",
			ids:  nil, to: "A",
			wantMembers: []string{"11", "12", "13"},
			wantUpserts: nil,
		},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			r := newFixtureRig(t)
			before := r.snapshotAll()
			var target *int64
			switch tt.to {
			case "A":
				target = &r.groupA
			case "B":
				target = &r.groupB
			}

			require.NoError(t, r.mgr.SetSessionsGroup(r.ctx, r.ids(tt.ids...), target))

			if tt.wantMembers != nil {
				assert.Equal(t, tt.wantMembers, r.members(r.groupA))
			}
			if tt.to == "-" {
				assert.Equal(t, int64(0), r.groupOf(tt.ids[0]))
			}
			assert.ElementsMatch(t, upserts(r.ids(tt.wantUpserts...)), r.log.kinds(), "only the changed sessions are broadcast")
			r.assertBystandersUntouched(before, append(append([]string{}, tt.ids...), tt.wantUpserts...)...)
			r.assertConsistent()
		})
	}
}

func TestSetSessionsGroup_RefusesAndChangesNothing(t *testing.T) {
	tests := []struct {
		name    string
		ids     func(r *groupsRig) []int64
		group   func(r *groupsRig) *int64
		wantErr error
	}{
		{"an unknown group", func(r *groupsRig) []int64 { return r.ids("1") }, func(*groupsRig) *int64 { v := int64(77777); return &v }, ErrUnknownGroup},
		{"an unknown group with no ids still refuses", func(_ *groupsRig) []int64 { return nil }, func(*groupsRig) *int64 { v := int64(77777); return &v }, ErrUnknownGroup},
		{"an unknown session", func(r *groupsRig) []int64 { return []int64{r.id("1"), 424242} }, func(r *groupsRig) *int64 { return &r.groupA }, ErrUnknownSession},
		{"a repeated session", func(r *groupsRig) []int64 { return []int64{r.id("1"), r.id("1")} }, func(r *groupsRig) *int64 { return &r.groupA }, ErrInvalidOrder},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			r := newFixtureRig(t)
			before := r.snapshotAll()

			err := r.mgr.SetSessionsGroup(r.ctx, tt.ids(r), tt.group(r))

			require.ErrorIs(t, err, tt.wantErr)
			assert.Empty(t, r.log.kinds())
			r.assertBystandersUntouched(before)
			assert.Equal(t, before, r.snapshotAll())
			r.assertConsistent()
		})
	}
}

// --- SetOrder with a group ---

func TestSetOrder_WithAGroupMovesTheListedCardsIntoIt(t *testing.T) {
	r := newFixtureRig(t)
	before := r.snapshotAll()
	b := r.groupB

	// 11 dropped between B's cards: listed with B's own, first one pinned.
	require.NoError(t, r.mgr.SetOrder(r.ctx, r.ids("21", "11", "22", "23"), 2, &GroupRef{ID: &b}))

	assert.Equal(t, r.groupB, r.groupOf("11"))
	assert.Equal(t, []string{"21", "11", "22", "23"}, r.members(r.groupB))
	assert.True(t, r.session("11").Pinned, "the pinned prefix applies to the dropped card")
	r.assertBystandersUntouched(before, "11", "21", "22", "23")
	r.assertConsistent()
}

func TestSetOrder_WithANullGroupMovesTheListedCardsToUngrouped(t *testing.T) {
	r := newFixtureRig(t)

	require.NoError(t, r.mgr.SetOrder(r.ctx, r.ids("13", "2"), 0, &GroupRef{ID: nil}))

	assert.Equal(t, int64(0), r.groupOf("13"))
	r.assertConsistent()
}

func TestSetOrder_WithoutAGroupLeavesMembershipAlone(t *testing.T) {
	r := newFixtureRig(t)
	before := r.snapshotAll()

	require.NoError(t, r.mgr.SetOrder(r.ctx, r.ids("13", "12", "11"), 0, nil))

	for _, label := range []string{"11", "12", "13"} {
		assert.Equal(t, before[label].Group, r.groupOf(label), label)
	}
	assert.Equal(t, []string{"13", "12", "11"}, r.members(r.groupA))
	r.assertConsistent()
}

func TestSetOrder_UnknownGroupIsRefusedAndChangesNothing(t *testing.T) {
	r := newFixtureRig(t)
	before := r.snapshotAll()
	missing := int64(31337)

	err := r.mgr.SetOrder(r.ctx, r.ids("13", "12"), 0, &GroupRef{ID: &missing})

	require.ErrorIs(t, err, ErrUnknownGroup)
	assert.Equal(t, before, r.snapshotAll())
	assert.Empty(t, r.log.kinds())
}

// --- DeleteGroup ---

func TestDeleteGroup_Ungroup(t *testing.T) {
	r := newFixtureRig(t)
	before := r.snapshotAll()

	res, err := r.mgr.DeleteGroup(r.ctx, r.groupA, DispositionUngroup, 0)

	require.NoError(t, err)
	assert.True(t, res.Deleted)
	assert.Equal(t, r.ids("11", "12", "13"), res.Sessions.Done, "the members, in railPos order")
	assert.Empty(t, res.Sessions.Skipped)
	assert.Empty(t, res.Sessions.Failed)
	kinds := r.log.kinds()
	require.Len(t, kinds, 4)
	assert.ElementsMatch(t, upserts(r.ids("11", "12", "13")), kinds[:3], "one upsert per member")
	assert.Equal(t, "groups", kinds[3], "D15: the groups message follows the upserts that leave the group")
	for _, label := range []string{"11", "12", "13"} {
		assert.Nil(t, r.session(label).GroupID, label)
		assert.Equal(t, before[label].RailPos, r.session(label).RailPos, "relative order is kept: railPos untouched, %s", label)
	}
	assert.Equal(t, []string{"B", "-"}, r.sectionNames())
	assert.NotContains(t, r.groupRowIDs(), r.groupA)
	r.assertBystandersUntouched(before, "11", "12", "13")
	r.assertConsistent()
}

func TestDeleteGroup_Move(t *testing.T) {
	r := newFixtureRig(t)
	before := r.snapshotAll()

	res, err := r.mgr.DeleteGroup(r.ctx, r.groupA, DispositionMove, r.groupB)

	require.NoError(t, err)
	assert.True(t, res.Deleted)
	assert.Equal(t, r.ids("11", "12", "13"), res.Sessions.Done)
	for _, label := range []string{"11", "12", "13"} {
		assert.Equal(t, r.groupB, r.groupOf(label), label)
	}
	got := r.members(r.groupB)
	assert.Len(t, got, 6)
	pos := func(label string) int64 { return r.session(label).RailPos }
	assert.Less(t, pos("23"), pos("13"), "an unpinned member lands after B's own unpinned cards")
	assert.True(t, r.session("11").Pinned && r.session("12").Pinned, "pins are kept")
	kinds := r.log.kinds()
	assert.Equal(t, "groups", kinds[len(kinds)-1], "D15: the groups message follows the member upserts")
	assert.Equal(t, 1, r.log.count("groups"))
	assert.Equal(t, 0, r.log.count("removed"))
	assert.Equal(t, []string{"B", "-"}, r.sectionNames())
	r.assertBystandersUntouched(before, "11", "12", "13", "21", "22", "23")
	r.assertConsistent()
}

func TestDeleteGroup_Remove(t *testing.T) {
	r := newFixtureRig(t)
	before := r.snapshotAll()

	res, err := r.mgr.DeleteGroup(r.ctx, r.groupA, DispositionRemove, 0)

	require.NoError(t, err)
	assert.True(t, res.Deleted)
	assert.Equal(t, r.ids("11", "12", "13"), res.Sessions.Done)
	for _, label := range []string{"11", "12", "13"} {
		assert.False(t, r.mgr.Exists(r.labels[label]), "%s is removed", label)
	}
	kinds := r.log.kinds()
	assert.Equal(t, "groups", kinds[len(kinds)-1], "the groups message follows every sessionRemoved")
	assert.Equal(t, 3, r.log.count("removed"))
	assert.ElementsMatch(t, []string{tmuxName(r.labels["11"]), tmuxName(r.labels["12"]), tmuxName(r.labels["13"])}, r.killer.killedNames(), "only the members' tmux sessions are killed")
	assert.NotContains(t, r.groupRowIDs(), r.groupA)
	r.assertBystandersUntouched(before, "11", "12", "13")
	for _, label := range []string{"21", "22", "23", "1", "2", "3"} {
		assert.True(t, r.session(label).Alive, "%s is a bystander and stays alive", label)
	}
	r.assertConsistent()
}

func TestDeleteGroup_EmptyGroupDeletesWithAnyDisposition(t *testing.T) {
	for _, d := range []GroupDisposition{DispositionUngroup, DispositionMove, DispositionRemove} {
		t.Run(string(d), func(t *testing.T) {
			r := newGroupsRig(t)
			empty := r.newGroup("Empty")
			keep := r.newGroup("Keep")
			r.log.reset()

			res, err := r.mgr.DeleteGroup(r.ctx, empty, d, keep)

			require.NoError(t, err)
			assert.True(t, res.Deleted)
			assert.Empty(t, res.Sessions.Done)
			assert.Equal(t, []string{"groups"}, r.log.kinds())
			assert.Equal(t, []string{"Keep", "-"}, r.sectionNames())
			r.assertConsistent()
		})
	}
}

func TestDeleteGroup_RenumbersTheSectionsThatRemain(t *testing.T) {
	r := newGroupsRig(t)
	a := r.newGroup("A")
	r.newGroup("B")
	c := r.newGroup("C")
	require.NoError(t, r.mgr.SetGroupsOrder(r.ctx, []int64{c, 0, a, r.groupIDByName("B")}))

	_, err := r.mgr.DeleteGroup(r.ctx, a, DispositionUngroup, 0)

	require.NoError(t, err)
	assert.Equal(t, []string{"C", "-", "B"}, r.sectionNames())
	groups, ungrouped := r.mgr.Groups()
	assert.Equal(t, int64(0), groups[0].Pos)
	assert.Equal(t, int64(1), ungrouped.Pos)
	assert.Equal(t, int64(2), groups[1].Pos)
	r.assertConsistent()
}

func (r *groupsRig) groupIDByName(name string) int64 {
	r.t.Helper()
	groups, _ := r.mgr.Groups()
	for _, g := range groups {
		if g.Name == name {
			return g.ID
		}
	}
	require.Failf(r.t, "no such group", "%q", name)
	return 0
}

// TestDeleteGroup_RefusesAndChangesNothing covers D13 and the other refusals: every one
// leaves the group, its members and the layout exactly as they were.
func TestDeleteGroup_RefusesAndChangesNothing(t *testing.T) {
	tests := []struct {
		name    string
		id      func(r *groupsRig) int64
		d       GroupDisposition
		to      func(r *groupsRig) int64
		wantErr error
	}{
		{"move to an unknown target", func(r *groupsRig) int64 { return r.groupA }, DispositionMove, func(*groupsRig) int64 { return 9999 }, ErrUnknownTargetGroup},
		{"move onto the group being deleted", func(r *groupsRig) int64 { return r.groupA }, DispositionMove, func(r *groupsRig) int64 { return r.groupA }, ErrInvalidDisposition},
		{"move with no target", func(r *groupsRig) int64 { return r.groupA }, DispositionMove, func(*groupsRig) int64 { return 0 }, ErrUnknownTargetGroup},
		{"an unknown disposition", func(r *groupsRig) int64 { return r.groupA }, GroupDisposition("burn"), func(*groupsRig) int64 { return 0 }, ErrInvalidDisposition},
		{"the Ungrouped section", func(*groupsRig) int64 { return 0 }, DispositionUngroup, func(*groupsRig) int64 { return 0 }, ErrUngroupedSection},
		{"the Ungrouped section with remove", func(*groupsRig) int64 { return 0 }, DispositionRemove, func(*groupsRig) int64 { return 0 }, ErrUngroupedSection},
		{"an unknown group, ungroup", func(*groupsRig) int64 { return 9999 }, DispositionUngroup, func(*groupsRig) int64 { return 0 }, ErrUnknownGroup},
		{"an unknown group, move", func(_ *groupsRig) int64 { return 9999 }, DispositionMove, func(r *groupsRig) int64 { return r.groupB }, ErrUnknownGroup},
		{"an unknown group, remove", func(*groupsRig) int64 { return 9999 }, DispositionRemove, func(*groupsRig) int64 { return 0 }, ErrUnknownGroup},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			r := newFixtureRig(t)
			before := r.snapshotAll()
			groupsBefore, ungroupedBefore := r.mgr.Groups()

			res, err := r.mgr.DeleteGroup(r.ctx, tt.id(r), tt.d, tt.to(r))

			require.ErrorIs(t, err, tt.wantErr)
			assert.False(t, res.Deleted)
			groupsAfter, ungroupedAfter := r.mgr.Groups()
			assert.Equal(t, groupsBefore, groupsAfter)
			assert.Equal(t, ungroupedBefore, ungroupedAfter)
			assert.Empty(t, r.log.kinds(), "nothing is broadcast")
			assert.Empty(t, r.killer.killedNames())
			assert.Equal(t, before, r.snapshotAll())
			r.assertConsistent()
		})
	}
}

// TestDeleteGroup_RemoveWithAFailedKillKeepsTheGroupAndTheMember is D9's delete-group half:
// the kill that genuinely fails leaves its session in the group, the group is kept and
// reports Deleted false, and the other members are gone.
func TestDeleteGroup_RemoveWithAFailedKillKeepsTheGroupAndTheMember(t *testing.T) {
	r := newFixtureRig(t)
	before := r.snapshotAll()
	r.killer.setKillErr(tmuxName(r.id("12")), assert.AnError)

	res, err := r.mgr.DeleteGroup(r.ctx, r.groupA, DispositionRemove, 0)

	require.NoError(t, err, "a failed member is reported in the result, not as an error")
	assert.False(t, res.Deleted)
	assert.Equal(t, r.ids("11", "13"), res.Sessions.Done)
	assert.Equal(t, r.ids("12"), res.Sessions.Failed)
	assert.Empty(t, res.Sessions.Skipped)
	assert.False(t, r.mgr.Exists(r.id("11")))
	assert.False(t, r.mgr.Exists(r.id("13")))
	assert.True(t, r.mgr.Exists(r.id("12")), "the row is kept")
	assert.Equal(t, r.groupA, r.groupOf("12"), "the failed session stays in its group")
	assert.Equal(t, 0, r.log.count("groups"), "the group was not deleted, so no groups message")
	assert.Contains(t, r.groupRowIDs(), r.groupA)
	r.assertBystandersUntouched(before, "11", "12", "13")
	r.assertConsistent()

	// The kill works the second time: the leftover member goes and the group follows it.
	r.killer.setKillErr(tmuxName(r.id("12")), nil)
	res, err = r.mgr.DeleteGroup(r.ctx, r.groupA, DispositionRemove, 0)
	require.NoError(t, err)
	assert.True(t, res.Deleted)
	assert.Equal(t, r.ids("12"), res.Sessions.Done)
	assert.NotContains(t, r.groupRowIDs(), r.groupA)
	r.assertConsistent()
}

// TestDeleteGroup_TwoGroupsCoexisting is the shared-substrate rule for a destructive path:
// deleting one group's sessions leaves the other group's sessions alive with their tmux
// sessions unkilled.
func TestDeleteGroup_TwoGroupsCoexisting(t *testing.T) {
	r := newFixtureRig(t)

	_, err := r.mgr.DeleteGroup(r.ctx, r.groupB, DispositionRemove, 0)

	require.NoError(t, err)
	for _, label := range []string{"11", "12", "13", "1", "2", "3"} {
		got := r.session(label)
		assert.True(t, got.Alive, label)
		assert.NotContains(t, r.killer.killedNames(), tmuxName(got.ID), "%s's tmux session must not be killed", label)
	}
	assert.Equal(t, r.ids("11", "12", "13"), func() []int64 {
		var ids []int64
		for _, l := range r.members(r.groupA) {
			ids = append(ids, r.labels[l])
		}
		return ids
	}())
}
