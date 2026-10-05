package session

import (
	"sort"
)

// ungroupedSection is the section id the layout algebra, PUT /api/groups/{id} and the order
// list give the Ungrouped section (kb:adr/rail-ungrouped-is-section-zero-on-the-wire); a
// group id is at least 1.
const ungroupedSection int64 = 0

// newSection stands in for a group that is about to be inserted: the database assigns its
// real id, but its place among the other sections is decided first.
const newSection int64 = -1

// sectionOrder returns every section's id in display order — groups and the Ungrouped
// section (id 0) sorted by pos. A tie, which only a crash mid-write could leave, puts
// Ungrouped last and otherwise follows id, so the order is always deterministic. The pure
// algebra groups.go applies under its lock, the way railorder.go serves the rail's own
// writes.
func sectionOrder(groups []Group, ungrouped UngroupedLayout) []int64 {
	type slot struct{ id, pos int64 }
	slots := make([]slot, 0, len(groups)+1)
	for _, g := range groups {
		slots = append(slots, slot{g.ID, g.Pos})
	}
	slots = append(slots, slot{ungroupedSection, ungrouped.Pos})
	sort.Slice(slots, func(i, j int) bool {
		a, b := slots[i], slots[j]
		if a.pos != b.pos {
			return a.pos < b.pos
		}
		if (a.id == ungroupedSection) != (b.id == ungroupedSection) {
			return b.id == ungroupedSection
		}
		return a.id < b.id
	})
	order := make([]int64, len(slots))
	for i, s := range slots {
		order[i] = s.id
	}
	return order
}

// insertBeforeUngrouped returns order with id placed immediately above the Ungrouped
// section, which moves down one place: a new group always appears just above Ungrouped.
func insertBeforeUngrouped(order []int64, id int64) []int64 {
	out := make([]int64, 0, len(order)+1)
	for _, s := range order {
		if s == ungroupedSection {
			out = append(out, id)
		}
		out = append(out, s)
	}
	return out
}

// withHeldAboveUngrouped returns order with each held group placed immediately above the
// Ungrouped section, where a group is created: a reorder of the sections a client knows
// leaves a group still being launched where it was.
func withHeldAboveUngrouped(order, held []int64) []int64 {
	for _, id := range held {
		order = insertBeforeUngrouped(order, id)
	}
	return order
}

// removeSection returns order without id.
func removeSection(order []int64, id int64) []int64 {
	out := make([]int64, 0, len(order))
	for _, s := range order {
		if s != id {
			out = append(out, s)
		}
	}
	return out
}

// validateSectionOrder reports whether order lists every group id exactly once plus the
// Ungrouped section (0) exactly once — PUT /api/groups/order's only rule.
func validateSectionOrder(order []int64, groups []Group) error {
	if len(order) != len(groups)+1 {
		return ErrInvalidGroupOrder
	}
	want := map[int64]bool{ungroupedSection: true}
	for _, g := range groups {
		want[g.ID] = true
	}
	for _, id := range order {
		if !want[id] {
			return ErrInvalidGroupOrder
		}
		delete(want, id)
	}
	return nil
}

// positionsOf maps each section id in order to its index, the section's new pos.
func positionsOf(order []int64) map[int64]int64 {
	pos := make(map[int64]int64, len(order))
	for i, id := range order {
		pos[id] = int64(i)
	}
	return pos
}

// withPositions returns copies of groups and ungrouped carrying the positions pos assigns;
// a section pos does not name keeps its place.
func withPositions(groups []Group, ungrouped UngroupedLayout, pos map[int64]int64) ([]Group, UngroupedLayout) {
	out := make([]Group, len(groups))
	for i, g := range groups {
		if p, ok := pos[g.ID]; ok {
			g.Pos = p
		}
		out[i] = g
	}
	if p, ok := pos[ungroupedSection]; ok {
		ungrouped.Pos = p
	}
	return out, ungrouped
}
