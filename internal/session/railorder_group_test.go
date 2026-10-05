package session

import (
	"fmt"
	"sort"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// The per-section half of the rail algebra (kb:adr/rail-pin-invariant-scoped-per-section):
// rebuild, applyPin, applyOrder with a join section and applyGroupMove, all over a fixture
// whose sections interleave in railPos the way production leaves them (new sessions land at
// the end, whatever their group).

// groupedFixture is two groups plus Ungrouped, each with pinned and unpinned members, whose
// railPos values interleave so the sections' slots are not contiguous. Every section
// satisfies the invariant on its own; read globally it does not (unpinned 22@2 sits above
// pinned 12@4), which is what proves the invariant is per section.
//
//	g1: 11P@0  12P@4  13U@7
//	g2: 21P@1  22U@2  23U@6
//	U:   1P@3   2U@5   3U@8
func groupedFixture() []railEntry {
	return []railEntry{
		{ID: 11, Pinned: true, RailPos: 0, GroupID: 1},
		{ID: 21, Pinned: true, RailPos: 1, GroupID: 2},
		{ID: 22, Pinned: false, RailPos: 2, GroupID: 2},
		{ID: 1, Pinned: true, RailPos: 3},
		{ID: 12, Pinned: true, RailPos: 4, GroupID: 1},
		{ID: 2, Pinned: false, RailPos: 5},
		{ID: 23, Pinned: false, RailPos: 6, GroupID: 2},
		{ID: 13, Pinned: false, RailPos: 7, GroupID: 1},
		{ID: 3, Pinned: false, RailPos: 8},
	}
}

// assertSectionInvariants is I1: within every section each pinned entry's RailPos is below
// every unpinned one's, and RailPos is unique across all entries. Asserted against the
// whole reconstructed rail, never the diff.
func assertSectionInvariants(t *testing.T, full []railEntry) {
	t.Helper()
	seen := map[int64]int64{}
	for _, e := range full {
		if other, dup := seen[e.RailPos]; dup {
			assert.Failf(t, "I1 violated", "RailPos %d is held by both %d and %d", e.RailPos, other, e.ID)
		}
		seen[e.RailPos] = e.ID
	}
	for _, a := range full {
		if !a.Pinned {
			continue
		}
		for _, b := range full {
			if b.Pinned || b.GroupID != a.GroupID {
				continue
			}
			assert.Lessf(t, a.RailPos, b.RailPos,
				"I1 violated in section %d: pinned %d@%d must precede unpinned %d@%d", a.GroupID, a.ID, a.RailPos, b.ID, b.RailPos)
		}
	}
}

// changedIDs returns the sorted ids of changed.
func changedIDs(changed []railEntry) []int64 {
	ids := make([]int64, len(changed))
	for i, c := range changed {
		ids[i] = c.ID
	}
	sort.Slice(ids, func(i, j int) bool { return ids[i] < ids[j] })
	return ids
}

func TestAssertSectionInvariants_FixtureIsPerSectionNotGlobal(t *testing.T) {
	full := groupedFixture()

	assertSectionInvariants(t, full)

	// The fixture would fail the old, global rule: pinned 12@4 follows unpinned 22@2.
	byID := indexByID(full)
	assert.Greater(t, byID[12].RailPos, byID[22].RailPos)
	assert.True(t, byID[12].Pinned)
	assert.False(t, byID[22].Pinned)
}

// --- rebuild ---

func TestRebuild_PerSection(t *testing.T) {
	tests := []struct {
		name      string
		candidate []railEntry
		want      map[int64]int64 // id -> railPos
	}{
		{
			name:      "a candidate already valid per section keeps every value",
			candidate: sortedByRailPos(groupedFixture()),
			want:      map[int64]int64{11: 0, 21: 1, 22: 2, 1: 3, 12: 4, 2: 5, 23: 6, 13: 7, 3: 8},
		},
		{
			name: "a pinned entry after an unpinned one takes the section's earlier slot and nothing outside moves",
			candidate: []railEntry{
				{ID: 22, Pinned: false, RailPos: 2, GroupID: 2},
				{ID: 21, Pinned: true, RailPos: 1, GroupID: 2},
				{ID: 1, Pinned: true, RailPos: 3},
			},
			want: map[int64]int64{21: 1, 22: 2, 1: 3},
		},
		{
			name: "a gap inside a section survives",
			candidate: []railEntry{
				{ID: 1, RailPos: 0}, {ID: 2, RailPos: 5}, {ID: 3, RailPos: 9},
			},
			want: map[int64]int64{1: 0, 2: 5, 3: 9},
		},
		{
			name: "listed order reassigns the section's own slots",
			candidate: []railEntry{
				{ID: 3, RailPos: 8}, {ID: 1, RailPos: 3}, {ID: 2, RailPos: 5},
			},
			want: map[int64]int64{3: 3, 1: 5, 2: 8},
		},
		{
			name: "sections that interleave in railPos each reuse their own slots",
			candidate: []railEntry{
				{ID: 31, RailPos: 0, GroupID: 1},
				{ID: 32, RailPos: 1},
				{ID: 33, RailPos: 2, GroupID: 1},
				{ID: 34, RailPos: 3},
			},
			want: map[int64]int64{31: 0, 33: 2, 32: 1, 34: 3},
		},
		{
			name: "a pinned entry reorders only inside its own section",
			candidate: []railEntry{
				{ID: 41, RailPos: 0, GroupID: 1},
				{ID: 42, RailPos: 1},
				{ID: 43, Pinned: true, RailPos: 2, GroupID: 1},
				{ID: 44, RailPos: 3},
			},
			want: map[int64]int64{43: 0, 41: 2, 42: 1, 44: 3},
		},
		{
			name: "a repeated railPos across sections is renumbered 0..n-1, section by section",
			candidate: []railEntry{
				{ID: 1, RailPos: 2, GroupID: 1},
				{ID: 2, RailPos: 2},
			},
			want: map[int64]int64{1: 0, 2: 1},
		},
		{
			name: "a repeated railPos inside one section is renumbered 0..n-1",
			candidate: []railEntry{
				{ID: 1, RailPos: 4}, {ID: 2, RailPos: 4}, {ID: 3, RailPos: 4},
			},
			want: map[int64]int64{1: 0, 2: 1, 3: 2},
		},
		{
			name:      "no entries",
			candidate: nil,
			want:      map[int64]int64{},
		},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := rebuild(tt.candidate)

			gotPos := make(map[int64]int64, len(got))
			for _, e := range got {
				gotPos[e.ID] = e.RailPos
			}
			assert.Equal(t, tt.want, gotPos)
			assertSectionInvariants(t, got)
		})
	}
}

func TestRebuild_NeverChangesPinnedOrGroup(t *testing.T) {
	candidate := sortedByRailPos(groupedFixture())

	got := indexByID(rebuild(candidate))

	for _, e := range candidate {
		assert.Equal(t, e.Pinned, got[e.ID].Pinned)
		assert.Equal(t, e.GroupID, got[e.ID].GroupID)
	}
}

func TestDiffChanged_ReportsAGroupChangeEvenWhenPositionAndPinAreUntouched(t *testing.T) {
	before := []railEntry{{ID: 1, RailPos: 0}, {ID: 2, RailPos: 1, GroupID: 3}}
	after := []railEntry{{ID: 1, RailPos: 0, GroupID: 3}, {ID: 2, RailPos: 1, GroupID: 3}, {ID: 9, RailPos: 2}}

	changed := diffChanged(before, after)

	assert.Equal(t, []int64{1, 9}, changedIDs(changed), "the regrouped entry and the one not in before are changed; the identical one is not")
	assert.Empty(t, diffChanged(before, before))
}

// --- validateSessionIDs ---

func TestValidateSessionIDs(t *testing.T) {
	entries := []railEntry{{ID: 1}, {ID: 2}, {ID: 3}}
	tests := []struct {
		name    string
		ids     []int64
		wantErr error
	}{
		{"known ids", []int64{3, 1}, nil},
		{"empty", []int64{}, nil},
		{"nil", nil, nil},
		{"an unknown id", []int64{1, 99}, ErrUnknownSession},
		{"a repeated id", []int64{1, 2, 1}, ErrInvalidOrder},
		{"a repeated unknown id reports the repeat first", []int64{99, 99}, ErrUnknownSession},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			err := validateSessionIDs(entries, tt.ids)
			if tt.wantErr == nil {
				assert.NoError(t, err)
				return
			}
			assert.ErrorIs(t, err, tt.wantErr)
		})
	}
}

// --- applyPin, scoped to its section ---

func TestApplyPin_ScopedToItsOwnSection(t *testing.T) {
	before := groupedFixture()

	// 23 (g2, unpinned, last) is pinned: it joins g2's pinned block, taking 22's slot.
	changed, err := applyPin(before, 23, true)

	require.NoError(t, err)
	assert.Equal(t, []int64{22, 23}, changedIDs(changed), "only g2's two unpinned entries move")
	got := indexByID(applyChanges(before, changed))
	assert.True(t, got[23].Pinned)
	assert.Equal(t, int64(2), got[23].RailPos, "the new pinned entry takes the first slot of g2's unpinned run")
	assert.Equal(t, int64(6), got[22].RailPos)
	assertSectionInvariants(t, applyChanges(before, changed))
}

func TestApplyPin_UnpinningTopOfASectionLeavesOtherSectionsAlone(t *testing.T) {
	before := groupedFixture()

	changed, err := applyPin(before, 11, false) // g1's first pinned

	require.NoError(t, err)
	for _, c := range changed {
		assert.Equal(t, int64(1), c.GroupID, "only g1 entries may change; got %d", c.ID)
	}
	got := indexByID(applyChanges(before, changed))
	assert.False(t, got[11].Pinned)
	assert.Less(t, got[12].RailPos, got[11].RailPos, "the unpinned entry lands at the top of g1's unpinned block")
	assertSectionInvariants(t, applyChanges(before, changed))
}

// --- applyOrder with a join section ---

func TestApplyOrder_JoinSection(t *testing.T) {
	two, zero := int64(2), int64(0)
	tests := []struct {
		name        string
		ids         []int64
		pinnedCount int
		join        *int64
		wantGroup   map[int64]int64 // id -> section after, for the listed ids
		wantPos     map[int64]int64 // id -> railPos after, for every id that changed
	}{
		{
			name: "cards dropped into g2 take its section and the listed order",
			ids:  []int64{22, 23, 11}, join: &two,
			wantGroup: map[int64]int64{22: 2, 23: 2, 11: 2},
			// g2's slots {0,1,2,6} (11 brings 0): pinned 21 first, then 22, 23, 11.
			wantPos: map[int64]int64{21: 0, 22: 1, 23: 2, 11: 6},
		},
		{
			name: "a drop into Ungrouped leaves the group and takes the drop side's pin state",
			ids:  []int64{11}, join: &zero,
			wantGroup: map[int64]int64{11: 0},
			// Ungrouped's slots {0,3,5,8}: listed 11 is unpinned, so pinned 1 takes slot 0 and 11 slot 3.
			wantPos: map[int64]int64{1: 0, 11: 3},
		},
		{
			name: "a nil join never changes membership",
			ids:  []int64{22, 11}, join: nil,
			wantGroup: map[int64]int64{22: 2, 11: 1},
			wantPos:   nil,
		},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			before := groupedFixture()

			changed, err := applyOrder(before, tt.ids, tt.pinnedCount, tt.join)

			require.NoError(t, err)
			full := applyChanges(before, changed)
			got := indexByID(full)
			for id, group := range tt.wantGroup {
				assert.Equal(t, group, got[id].GroupID, "listed id %d", id)
			}
			for id, pos := range tt.wantPos {
				assert.Equal(t, pos, got[id].RailPos, "id %d", id)
			}
			assertSectionInvariants(t, full)
		})
	}
}

func TestApplyOrder_JoinSectionLeavesTheOtherSectionsByteIdentical(t *testing.T) {
	two := int64(2)
	before := groupedFixture()

	changed, err := applyOrder(before, []int64{22, 23, 11}, 0, &two)

	require.NoError(t, err)
	byID := indexByID(before)
	for _, c := range changed {
		assert.Contains(t, []int64{11, 21, 22, 23}, c.ID, "only g2 and the card that left g1 may be reported")
	}
	for _, id := range []int64{12, 13, 1, 2, 3} {
		assert.Equal(t, byID[id], indexByID(applyChanges(before, changed))[id], "bystander %d must be untouched", id)
	}
}

func TestApplyOrder_JoinAppliesThePinnedPrefixToTheListedCards(t *testing.T) {
	zero := int64(0)
	before := groupedFixture()

	changed, err := applyOrder(before, []int64{13, 3, 2}, 2, &zero)

	require.NoError(t, err)
	got := indexByID(applyChanges(before, changed))
	assert.True(t, got[13].Pinned)
	assert.True(t, got[3].Pinned)
	assert.False(t, got[2].Pinned)
	assert.Equal(t, int64(0), got[13].GroupID)
}

// --- applyGroupMove ---

func TestApplyGroupMove(t *testing.T) {
	tests := []struct {
		name      string
		ids       []int64
		target    int64
		firstPos  int64
		wantIDs   []int64         // ids reported changed
		wantState map[int64]entry // expected (group, pinned, railPos) for the entries that changed
	}{
		{
			name: "an unpinned mover goes to the end of the target section",
			ids:  []int64{22}, target: 1, firstPos: 100,
			wantIDs:   []int64{22},
			wantState: map[int64]entry{22: {1, false, 100}},
		},
		{
			name: "a pinned mover keeps its pin and lands at the end of the target's pinned block",
			ids:  []int64{21}, target: 1, firstPos: 100,
			wantIDs: []int64{13, 21},
			// g1 slots {0,4,7,100}: 11, 12, then the mover, then 13.
			wantState: map[int64]entry{21: {1, true, 7}, 13: {1, false, 100}},
		},
		{
			name: "several movers keep their listed order",
			ids:  []int64{23, 22}, target: 1, firstPos: 100,
			wantIDs:   []int64{22, 23},
			wantState: map[int64]entry{23: {1, false, 100}, 22: {1, false, 101}},
		},
		{
			name: "movers from three sections into a new section",
			ids:  []int64{11, 22, 3}, target: 9, firstPos: 50,
			wantIDs: []int64{3, 11, 22},
			// 11 is pinned so it leads the new section's slots {50,51,52}.
			wantState: map[int64]entry{11: {9, true, 50}, 22: {9, false, 51}, 3: {9, false, 52}},
		},
		{
			name: "a mover already in the target is skipped and the rest still move",
			ids:  []int64{13, 22}, target: 1, firstPos: 100,
			wantIDs:   []int64{22},
			wantState: map[int64]entry{22: {1, false, 100}},
		},
		{
			name: "dissolving a group in place keeps every railPos where the invariant already holds",
			ids:  []int64{11, 12, 13}, target: 0, firstPos: -1,
			wantIDs: []int64{11, 12, 13},
			// Ungrouped slots {0,3,4,5,7,8}: pinned 11, 1, 12 then 2, 13, 3 — the same values each held.
			wantState: map[int64]entry{11: {0, true, 0}, 12: {0, true, 4}, 13: {0, false, 7}},
		},
		{
			name: "a pinned member dissolved between Ungrouped's pinned and unpinned runs changes only its group",
			ids:  []int64{12}, target: 0, firstPos: -1,
			wantIDs:   []int64{12},
			wantState: map[int64]entry{12: {0, true, 4}},
		},
		{
			name: "moving to Ungrouped fresh puts the movers after Ungrouped's own cards",
			ids:  []int64{22}, target: 0, firstPos: 100,
			wantIDs:   []int64{22},
			wantState: map[int64]entry{22: {0, false, 100}},
		},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			before := groupedFixture()

			changed, err := applyGroupMove(before, tt.ids, tt.target, tt.firstPos)

			require.NoError(t, err)
			assert.Equal(t, tt.wantIDs, changedIDs(changed))
			got := indexByID(applyChanges(before, changed))
			for id, want := range tt.wantState {
				assert.Equal(t, want, entry{got[id].GroupID, got[id].Pinned, got[id].RailPos}, "id %d", id)
			}
			assertSectionInvariants(t, applyChanges(before, changed))
		})
	}
}

// entry is a (group, pinned, railPos) triple, a railEntry without its id for want tables.
type entry struct {
	group  int64
	pinned bool
	pos    int64
}

// TestApplyGroupMove_DissolveReEnforcesTheInvariantForAPinnedMember is the other half of the
// dissolve rule: railPos is untouched, then the invariant is re-run, so a pinned member whose
// railPos sits below an unpinned Ungrouped card's moves above it.
func TestApplyGroupMove_DissolveReEnforcesTheInvariantForAPinnedMember(t *testing.T) {
	before := []railEntry{
		{ID: 1, Pinned: false, RailPos: 0},
		{ID: 5, Pinned: true, RailPos: 1, GroupID: 7},
	}

	changed, err := applyGroupMove(before, []int64{5}, 0, -1)

	require.NoError(t, err)
	got := indexByID(applyChanges(before, changed))
	assert.Equal(t, entry{0, true, 0}, entry{got[5].GroupID, got[5].Pinned, got[5].RailPos})
	assert.Equal(t, int64(1), got[1].RailPos)
	assertSectionInvariants(t, applyChanges(before, changed))
}

func TestApplyGroupMove_NoOpReportsNothing(t *testing.T) {
	tests := []struct {
		name   string
		before []railEntry
		ids    []int64
		target int64
	}{
		{"empty ids", groupedFixture(), nil, 1},
		{"every id already in the target", groupedFixture(), []int64{11, 12}, 1},
		{
			"does not close a bystander's railPos gap",
			[]railEntry{{ID: 1, RailPos: 0}, {ID: 2, RailPos: 7, GroupID: 3}, {ID: 3, RailPos: 20}},
			[]int64{1}, 0,
		},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			changed, err := applyGroupMove(tt.before, tt.ids, tt.target, 100)

			require.NoError(t, err)
			assert.Nil(t, changed)
		})
	}
}

func TestApplyGroupMove_RefusesBadIDsBeforeComputing(t *testing.T) {
	tests := []struct {
		name    string
		ids     []int64
		wantErr error
	}{
		{"unknown id", []int64{11, 999}, ErrUnknownSession},
		{"repeated id", []int64{11, 22, 11}, ErrInvalidOrder},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			changed, err := applyGroupMove(groupedFixture(), tt.ids, 1, 100)

			require.ErrorIs(t, err, tt.wantErr)
			assert.Nil(t, changed)
		})
	}
}

func TestApplyGroupMove_DoesNotMutateItsInput(t *testing.T) {
	before := groupedFixture()
	snapshot := append([]railEntry(nil), before...)

	_, err := applyGroupMove(before, []int64{22, 11}, 0, 100)

	require.NoError(t, err)
	assert.Equal(t, snapshot, before)
}

// --- I1 across every source (D4, pure half) ---

// TestI1_HoldsFromEveryMutationSource crosses every pure source of a railPos change with the
// grouped fixture and asserts the per-section invariant on the whole rail afterwards
// (kb:lesson/invariant-missed-by-per-transition-tests): pin and unpin of every session, order
// with and without a join section at every pinned prefix, and group moves in both modes into
// every section including a brand-new one. Each source also runs from two starts a Remove
// left a gap in (12 and 2 gone), since a gap is how production leaves a section.
func TestI1_HoldsFromEveryMutationSource(t *testing.T) {
	type source struct {
		name string
		run  func(before []railEntry) ([]railEntry, error)
	}
	starts := []struct {
		name    string
		entries []railEntry
	}{
		{"fixture", groupedFixture()},
		{"gap where pinned 12 was", withoutEntry(groupedFixture(), 12)},
		{"gap where unpinned 2 was", withoutEntry(groupedFixture(), 2)},
	}

	for _, start := range starts {
		var sources []source
		for _, e := range start.entries {
			sources = append(sources, source{
				name: fmt.Sprintf("toggle pin of %d", e.ID),
				run:  func(before []railEntry) ([]railEntry, error) { return applyPin(before, e.ID, !e.Pinned) },
			})
		}
		for _, join := range []*int64{nil, ptrTo(0), ptrTo(1), ptrTo(2)} {
			for pinned := range 4 {
				sources = append(sources, source{
					name: fmt.Sprintf("order join=%s pinnedCount=%d", joinName(join), pinned),
					run: func(before []railEntry) ([]railEntry, error) {
						return applyOrder(before, []int64{22, 23, 11}, pinned, join)
					},
				})
			}
		}
		for _, target := range []int64{0, 1, 2, 9} {
			for _, first := range []int64{-1, 100} {
				sources = append(sources, source{
					name: fmt.Sprintf("group move to %d firstPos=%d", target, first),
					run: func(before []railEntry) ([]railEntry, error) {
						return applyGroupMove(before, []int64{21, 11, 3, 22}, target, first)
					},
				})
			}
		}
		for _, src := range sources {
			t.Run(start.name+"/"+src.name, func(t *testing.T) {
				changed, err := src.run(start.entries)

				require.NoError(t, err)
				assertSectionInvariants(t, applyChanges(start.entries, changed))
			})
		}
	}
}

func ptrTo(v int64) *int64 { return &v }

func joinName(j *int64) string {
	if j == nil {
		return "none"
	}
	return fmt.Sprint(*j)
}

func withoutEntry(entries []railEntry, id int64) []railEntry {
	out := make([]railEntry, 0, len(entries))
	for _, e := range entries {
		if e.ID != id {
			out = append(out, e)
		}
	}
	return out
}
