package session

import (
	"errors"
	"slices"
	"sort"
)

// ErrInvalidOrder is the validation failure of the list-taking operations
// (kb:anchor/sessions.order): applyOrder for a duplicate or unknown id or a pinnedCount outside
// [0, len(ids)], validateSessionIDs for a repeated id in a group request, and runBatch
// (actions.go) for a repeated id in an End or Remove batch. The server package maps it to 400
// invalid_request; validation happens before anything is computed or run. applyPin's unknown-id
// case reuses the existing ErrUnknownSession sentinel (manager.go) since the HTTP mapping is the
// same 404 unknown_session either way.
var ErrInvalidOrder = errors.New("invalid order")

// railEntry is the pure (pinned, railPos, group) algebra applyPin/applyOrder/applyGroupMove
// operate over — just enough of a Session to decide the invariant, kept as a plain slice so
// the rebuild logic below can be unit tested with no store. Manager's SetPinned/SetOrder and
// the group methods extract this from the live in-memory registry under its lock, apply here,
// then persist+broadcast only the entries that came back changed.
//
// GroupID names the section the session sits in: 0 is the Ungrouped section (a group id is
// at least 1), so Session.GroupID nil maps to 0 and back (groupIDVal/groupIDPtr).
type railEntry struct {
	ID      int64
	Pinned  bool
	RailPos int64
	GroupID int64
}

// applyPin computes the new (pinned, railPos) for every session affected by pinning or
// unpinning id (kb:anchor/sessions.pin): pinning moves id to the bottom of its section's
// pinned block, unpinning moves it to the top of its section's unpinned block, via the same
// rebuild rule as applyOrder. Returns the entries whose Pinned or RailPos changed — empty when id was
// already in the requested state, so a no-op call broadcasts nothing — or
// ErrUnknownSession if id isn't present.
//
// When id's Pinned flag already matches the request, this returns nil, nil immediately,
// before sortedByRailPos/rebuild ever run — mirroring applyOrder's empty-ids short
// circuit. A same-flag call names nothing to change, so it must not run the rebuild at all:
// rebuild re-derives every section, and on a corrupt duplicate-railPos row it renumbers
// 0..n-1, or on a section that already breaks the invariant it moves entries, and
// diffChanged would then report bystanders the request never named as changed.
func applyPin(sessions []railEntry, id int64, pinned bool) ([]railEntry, error) {
	var current railEntry
	found := false
	for _, e := range sessions {
		if e.ID == id {
			current = e
			found = true
			break
		}
	}
	if !found {
		return nil, ErrUnknownSession
	}
	if current.Pinned == pinned {
		return nil, nil
	}

	candidate := sortedByRailPos(sessions)
	for i := range candidate {
		if candidate[i].ID == id {
			candidate[i].Pinned = pinned
		}
	}
	return diffChanged(sessions, rebuild(candidate)), nil
}

// applyOrder computes the new (pinned, railPos) for a full rail-order request
// (kb:anchor/sessions.order): the first pinnedCount listed ids become pinned in listed
// order, the rest unpinned in listed order; sessions that exist but weren't listed keep
// their flag and follow the listed ones in their existing relative railPos order. The
// same rebuild rule as applyPin then re-enforces the invariant, which is what pushes a
// pinned bystander to the end of the pinned block instead of leaving it stranded after
// the listed unpinned ids. join, when non-nil, first moves every listed id into that
// section (0 is Ungrouped) — the drop-between-cards move of a card from another section.
// An empty ids is a literal no-op (no entries recomputed) — still validating pinnedCount
// == 0, which the bounds check below already requires. Returns ErrInvalidOrder for a
// duplicate/unknown id or an out-of-range pinnedCount; nothing is computed on that path.
func applyOrder(sessions []railEntry, ids []int64, pinnedCount int, join *int64) ([]railEntry, error) {
	if pinnedCount < 0 || pinnedCount > len(ids) {
		return nil, ErrInvalidOrder
	}
	if len(ids) == 0 {
		return nil, nil
	}

	byID := make(map[int64]railEntry, len(sessions))
	for _, e := range sessions {
		byID[e.ID] = e
	}

	seen := make(map[int64]bool, len(ids))
	listed := make([]railEntry, 0, len(ids))
	for i, id := range ids {
		if seen[id] {
			return nil, ErrInvalidOrder
		}
		seen[id] = true
		e, ok := byID[id]
		if !ok {
			return nil, ErrInvalidOrder
		}
		e.Pinned = i < pinnedCount
		if join != nil {
			e.GroupID = *join
		}
		listed = append(listed, e)
	}

	candidate := make([]railEntry, 0, len(sessions))
	candidate = append(candidate, listed...)
	for _, e := range sortedByRailPos(sessions) {
		if !seen[e.ID] {
			candidate = append(candidate, e)
		}
	}

	return diffChanged(sessions, rebuild(candidate)), nil
}

// validateSessionIDs checks a group request's id list against the known sessions: an id
// naming no session is ErrUnknownSession, a repeated one ErrInvalidOrder. Shared by
// applyGroupMove and the callers that must refuse before creating anything.
func validateSessionIDs(sessions []railEntry, ids []int64) error {
	known := make(map[int64]bool, len(sessions))
	for _, e := range sessions {
		known[e.ID] = true
	}
	seen := make(map[int64]bool, len(ids))
	for _, id := range ids {
		if seen[id] {
			return ErrInvalidOrder
		}
		seen[id] = true
		if !known[id] {
			return ErrUnknownSession
		}
	}
	return nil
}

// applyGroupMove moves every id whose section differs into section target (0 is Ungrouped)
// and returns each session whose group, pinned flag or railPos changed — nil when every
// listed id already sits in target, so a no-op broadcasts nothing and never closes a
// bystander's railPos gap. With firstPos >= 0 the movers take railPos firstPos, firstPos+1,
// … in listed order, which is the end of the target section (the caller passes a value above
// every railPos); with firstPos < 0 they keep their railPos, which dissolves a group in
// place. The rebuild then re-enforces the per-section invariant, so a pinned mover lands at
// the end of the target's pinned block.
func applyGroupMove(sessions []railEntry, ids []int64, target, firstPos int64) ([]railEntry, error) {
	if err := validateSessionIDs(sessions, ids); err != nil {
		return nil, err
	}
	candidate := sortedByRailPos(sessions)
	index := make(map[int64]int, len(candidate))
	for i, e := range candidate {
		index[e.ID] = i
	}

	moved := false
	next := firstPos
	for _, id := range ids {
		e := &candidate[index[id]]
		if e.GroupID == target {
			continue
		}
		e.GroupID = target
		if firstPos >= 0 {
			e.RailPos = next
			next++
		}
		moved = true
	}
	if !moved {
		return nil, nil
	}
	return diffChanged(sessions, rebuild(sortedByRailPos(candidate))), nil
}

// sortedByRailPos returns a copy of sessions ordered by ascending RailPos — the current
// truth's manual order, and the base candidate order both applyPin and applyOrder
// rebuild from.
func sortedByRailPos(sessions []railEntry) []railEntry {
	out := make([]railEntry, len(sessions))
	copy(out, sessions)
	sort.SliceStable(out, func(i, j int) bool { return out[i].RailPos < out[j].RailPos })
	return out
}

// rebuild re-derives the invariant from a candidate order, one section at a time
// (kb:adr/rail-pin-invariant-scoped-per-section): within each section every Pinned entry (in
// candidate order) precedes every unpinned one. A section reuses the railPos values it
// already holds, handing them back in ascending order to the rebuilt sequence, so
// railPos stays unique across all sessions and a section whose order already satisfies the
// invariant keeps every value — a move in one section never renumbers a bystander in
// another (kb:adr/rail-order-daemon-owned-per-session-fields' whole-list rebuild, scoped).
// Sections come back in order of first appearance in candidate. A candidate that already
// holds one railPos twice (a corrupt row, never a state the daemon writes) cannot be reused
// slot by slot, so it is renumbered 0..n-1 section by section instead — the repair the
// whole-list rebuild always made.
func rebuild(candidate []railEntry) []railEntry {
	type section struct {
		slots  []int64
		pinned []railEntry
		loose  []railEntry
	}
	var order []int64
	sections := make(map[int64]*section)
	for _, e := range candidate {
		sec, ok := sections[e.GroupID]
		if !ok {
			sec = &section{}
			sections[e.GroupID] = sec
			order = append(order, e.GroupID)
		}
		sec.slots = append(sec.slots, e.RailPos)
		if e.Pinned {
			sec.pinned = append(sec.pinned, e)
		} else {
			sec.loose = append(sec.loose, e)
		}
	}

	out := make([]railEntry, 0, len(candidate))
	for _, id := range order {
		sec := sections[id]
		slices.Sort(sec.slots)
		for i, e := range slices.Concat(sec.pinned, sec.loose) {
			e.RailPos = sec.slots[i]
			out = append(out, e)
		}
	}
	if hasDuplicateRailPos(out) {
		for i := range out {
			out[i].RailPos = int64(i)
		}
	}
	return out
}

// hasDuplicateRailPos reports whether two entries share a railPos.
func hasDuplicateRailPos(entries []railEntry) bool {
	positions := make([]int64, len(entries))
	for i, e := range entries {
		positions[i] = e.RailPos
	}
	return hasRepeat(positions)
}

// hasRepeat reports whether any value occurs twice in values.
func hasRepeat(values []int64) bool {
	seen := make(map[int64]bool, len(values))
	for _, v := range values {
		if seen[v] {
			return true
		}
		seen[v] = true
	}
	return false
}

// diffChanged returns, from after (a fully rebuilt order), only the entries whose
// Pinned, RailPos or GroupID differs from before — a no-op call broadcasts nothing.
func diffChanged(before, after []railEntry) []railEntry {
	prev := make(map[int64]railEntry, len(before))
	for _, e := range before {
		prev[e.ID] = e
	}
	var changed []railEntry
	for _, e := range after {
		if p, ok := prev[e.ID]; !ok || p != e {
			changed = append(changed, e)
		}
	}
	return changed
}
