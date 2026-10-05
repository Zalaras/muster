package session

import (
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestSectionOrder(t *testing.T) {
	tests := []struct {
		name      string
		groups    []Group
		ungrouped UngroupedLayout
		want      []int64
	}{
		{"no groups is Ungrouped alone", nil, UngroupedLayout{Pos: 0}, []int64{0}},
		{
			"sorted by pos whatever the slice order",
			[]Group{{ID: 7, Pos: 2}, {ID: 3, Pos: 0}},
			UngroupedLayout{Pos: 1},
			[]int64{3, 0, 7},
		},
		{
			"Ungrouped first when it holds pos 0",
			[]Group{{ID: 4, Pos: 1}, {ID: 5, Pos: 2}},
			UngroupedLayout{Pos: 0},
			[]int64{0, 4, 5},
		},
		{
			"a tie puts Ungrouped last",
			[]Group{{ID: 4, Pos: 1}},
			UngroupedLayout{Pos: 1},
			[]int64{4, 0},
		},
		{
			"a tie between groups follows id",
			[]Group{{ID: 9, Pos: 0}, {ID: 2, Pos: 0}},
			UngroupedLayout{Pos: 5},
			[]int64{2, 9, 0},
		},
		{
			"gaps in pos do not matter, only order",
			[]Group{{ID: 1, Pos: 10}, {ID: 2, Pos: 4}},
			UngroupedLayout{Pos: 7},
			[]int64{2, 0, 1},
		},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			assert.Equal(t, tt.want, sectionOrder(tt.groups, tt.ungrouped))
		})
	}
}

func TestSectionOrder_DoesNotReorderTheCallersSlice(t *testing.T) {
	groups := []Group{{ID: 7, Pos: 2}, {ID: 3, Pos: 0}}

	sectionOrder(groups, UngroupedLayout{Pos: 1})

	assert.Equal(t, int64(7), groups[0].ID)
}

func TestInsertBeforeUngrouped(t *testing.T) {
	tests := []struct {
		name  string
		order []int64
		want  []int64
	}{
		{"Ungrouped alone", []int64{0}, []int64{newSection, 0}},
		{"Ungrouped last", []int64{3, 4, 0}, []int64{3, 4, newSection, 0}},
		{"Ungrouped first", []int64{0, 3, 4}, []int64{newSection, 0, 3, 4}},
		{"Ungrouped in the middle", []int64{3, 0, 4}, []int64{3, newSection, 0, 4}},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			before := append([]int64(nil), tt.order...)

			got := insertBeforeUngrouped(tt.order, newSection)

			assert.Equal(t, tt.want, got)
			assert.Equal(t, before, tt.order, "the input order is not modified")
		})
	}
}

func TestWithHeldAboveUngrouped(t *testing.T) {
	tests := []struct {
		name  string
		order []int64
		held  []int64
		want  []int64
	}{
		{"none held leaves the order alone", []int64{3, 0, 4}, nil, []int64{3, 0, 4}},
		{"one held goes just above Ungrouped", []int64{3, 4, 0}, []int64{8}, []int64{3, 4, 8, 0}},
		{"one held with Ungrouped first", []int64{0, 3, 4}, []int64{8}, []int64{8, 0, 3, 4}},
		{"one held with Ungrouped in the middle", []int64{3, 0, 4}, []int64{8}, []int64{3, 8, 0, 4}},
		{"two held keep the order given", []int64{3, 4, 0}, []int64{8, 9}, []int64{3, 4, 8, 9, 0}},
		{"two held with Ungrouped first", []int64{0, 3}, []int64{8, 9}, []int64{8, 9, 0, 3}},
		{"Ungrouped alone", []int64{0}, []int64{8, 9}, []int64{8, 9, 0}},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			before := append([]int64(nil), tt.order...)

			got := withHeldAboveUngrouped(tt.order, tt.held)

			assert.Equal(t, tt.want, got)
			assert.Equal(t, before, tt.order, "the input order is not modified")
		})
	}
}

func TestRemoveSection(t *testing.T) {
	tests := []struct {
		name  string
		order []int64
		id    int64
		want  []int64
	}{
		{"first", []int64{3, 0, 4}, 3, []int64{0, 4}},
		{"middle", []int64{3, 0, 4}, 0, []int64{3, 4}},
		{"last", []int64{3, 0, 4}, 4, []int64{3, 0}},
		{"absent id leaves the order alone", []int64{3, 0, 4}, 9, []int64{3, 0, 4}},
		{"only element", []int64{3}, 3, []int64{}},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			assert.Equal(t, tt.want, removeSection(tt.order, tt.id))
		})
	}
}

// TestValidateSectionOrder is D12's pure half: an order must list every group id and 0
// exactly once — each way of failing that is refused.
func TestValidateSectionOrder(t *testing.T) {
	groups := []Group{{ID: 3}, {ID: 5}}
	tests := []struct {
		name    string
		order   []int64
		groups  []Group
		wantErr bool
	}{
		{"every id once, Ungrouped last", []int64{3, 5, 0}, groups, false},
		{"every id once, Ungrouped first", []int64{0, 5, 3}, groups, false},
		{"no groups, Ungrouped alone", []int64{0}, nil, false},
		{"missing a group", []int64{3, 0}, groups, true},
		{"missing Ungrouped", []int64{3, 5}, groups, true},
		{"a duplicate group id", []int64{3, 3, 0}, groups, true},
		{"a duplicate of 0", []int64{3, 0, 0}, groups, true},
		{"an unknown id in place of a group", []int64{3, 9, 0}, groups, true},
		{"an extra unknown id", []int64{3, 5, 0, 9}, groups, true},
		{"empty order", []int64{}, groups, true},
		{"nil order with no groups", nil, nil, true},
		{"a negative id", []int64{3, 5, -1}, groups, true},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			err := validateSectionOrder(tt.order, tt.groups)
			if tt.wantErr {
				assert.ErrorIs(t, err, ErrInvalidGroupOrder)
				return
			}
			assert.NoError(t, err)
		})
	}
}

func TestPositionsOf(t *testing.T) {
	pos := positionsOf([]int64{4, 0, 7})

	assert.Equal(t, map[int64]int64{4: 0, 0: 1, 7: 2}, pos)
}

func TestWithPositions(t *testing.T) {
	groups := []Group{{ID: 1, Name: "a", Pos: 0, Collapsed: true}, {ID: 2, Name: "b", Pos: 1}}
	ungrouped := UngroupedLayout{Pos: 2, Collapsed: true}

	t.Run("applies each named section's position and keeps every other field", func(t *testing.T) {
		gotGroups, gotUngrouped := withPositions(groups, ungrouped, map[int64]int64{2: 0, 0: 1, 1: 2})

		assert.Equal(t, []Group{{ID: 1, Name: "a", Pos: 2, Collapsed: true}, {ID: 2, Name: "b", Pos: 0}}, gotGroups)
		assert.Equal(t, UngroupedLayout{Pos: 1, Collapsed: true}, gotUngrouped)
	})

	t.Run("a section the map does not name keeps its place", func(t *testing.T) {
		gotGroups, gotUngrouped := withPositions(groups, ungrouped, map[int64]int64{1: 5})

		assert.Equal(t, int64(5), gotGroups[0].Pos)
		assert.Equal(t, int64(1), gotGroups[1].Pos)
		assert.Equal(t, int64(2), gotUngrouped.Pos)
	})

	t.Run("returns copies, never the caller's slice", func(t *testing.T) {
		original := append([]Group(nil), groups...)

		gotGroups, _ := withPositions(groups, ungrouped, map[int64]int64{1: 9})
		require.NotEmpty(t, gotGroups)
		gotGroups[1].Name = "changed"

		assert.Equal(t, original, groups)
	})
}

// TestSectionAlgebra_NewGroupAppearsAboveUngroupedAndEverySectionIsRenumbered chains the
// pieces insertGroupLocked uses: the contract's "a new group's pos is Ungrouped's current
// pos and Ungrouped moves one place down; every section is renumbered 0..n".
func TestSectionAlgebra_NewGroupAppearsAboveUngroupedAndEverySectionIsRenumbered(t *testing.T) {
	tests := []struct {
		name      string
		groups    []Group
		ungrouped UngroupedLayout
		wantNew   int64
		wantOrder []int64
	}{
		{"first group of all", nil, UngroupedLayout{Pos: 0}, 0, []int64{newSection, 0}},
		{
			"Ungrouped last",
			[]Group{{ID: 1, Pos: 0}, {ID: 2, Pos: 1}},
			UngroupedLayout{Pos: 2},
			2,
			[]int64{1, 2, newSection, 0},
		},
		{
			"Ungrouped dragged to the top",
			[]Group{{ID: 1, Pos: 1}, {ID: 2, Pos: 2}},
			UngroupedLayout{Pos: 0},
			0,
			[]int64{newSection, 0, 1, 2},
		},
		{
			"positions with gaps are closed",
			[]Group{{ID: 1, Pos: 3}, {ID: 2, Pos: 9}},
			UngroupedLayout{Pos: 12},
			2,
			[]int64{1, 2, newSection, 0},
		},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			order := insertBeforeUngrouped(sectionOrder(tt.groups, tt.ungrouped), newSection)
			pos := positionsOf(order)

			assert.Equal(t, tt.wantOrder, order)
			assert.Equal(t, tt.wantNew, pos[newSection])
			assert.Equal(t, pos[newSection]+1, pos[ungroupedSection], "Ungrouped sits directly below the new group")
			seen := map[int64]bool{}
			for _, p := range pos {
				assert.False(t, seen[p], "every section holds its own pos")
				seen[p] = true
			}
		})
	}
}
