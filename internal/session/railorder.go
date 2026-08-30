package session

import (
	"errors"
	"sort"
)

// ErrInvalidOrder is applyOrder's validation failure (docs/protocol.md §3.11): a
// duplicate or unknown id in the request, or a pinnedCount outside [0, len(ids)]. The
// server package maps it to 400 invalid_request; nothing is computed on this path
// (D10/D11). applyPin's unknown-id case reuses the existing ErrUnknownSession sentinel
// (manager.go) since the HTTP mapping is the same 404 unknown_session either way.
var ErrInvalidOrder = errors.New("invalid order")

// railEntry is the pure (pinned, railPos) algebra applyPin/applyOrder operate over —
// just enough of a Session to decide the invariant (plan order-sidebar Affected Files:
// "pure over a slice of (id,pinned,railPos) so unit tests need no store"). Manager's
// SetPinned/SetOrder extract this from the live in-memory registry under its lock,
// apply here, then persist+broadcast only the entries that came back changed.
type railEntry struct {
	ID      int64
	Pinned  bool
	RailPos int64
}

// applyPin computes the new (pinned, railPos) for every session affected by pinning or
// unpinning id (docs/protocol.md §3.10): pinning moves id to the bottom of the pinned
// block, unpinning moves it to the top of the unpinned block, via the same rebuild rule
// as applyOrder. Returns the entries whose Pinned or RailPos changed — empty when id was
// already in the requested state (D8, INV-5) — or ErrUnknownSession if id isn't present.
//
// When id's Pinned flag already matches the request, this returns nil, nil immediately,
// before sortedByRailPos/rebuild ever run — mirroring applyOrder's empty-ids short
// circuit. Without this, a same-flag call would still run the general rebuild pass,
// which renumbers every entry as a contiguous 0..n-1 index; if a bystander's railPos
// already has a gap (the only way that happens in production: an earlier Remove, which
// REQ-14 explicitly permits to leave), that renumbering closes the gap and diffChanged
// reports the untouched bystander as "changed" — violating §3.10/REQ-3's "already in the
// requested state → 204 and no broadcast" for a request that never named it.
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

// applyOrder computes the new (pinned, railPos) for a full rail-order request (docs/
// protocol.md §3.11): the first pinnedCount listed ids become pinned in listed order,
// the rest unpinned in listed order; sessions that exist but weren't listed keep their
// flag and follow the listed ones in their existing relative railPos order. The same
// rebuild rule as applyPin then re-enforces the invariant, which is what pushes a
// pinned bystander to the end of the pinned block instead of leaving it stranded after
// the listed unpinned ids. An empty ids is a literal no-op (no entries recomputed) —
// still validating pinnedCount == 0, which the bounds check below already requires.
// Returns ErrInvalidOrder for a duplicate/unknown id or an out-of-range pinnedCount;
// nothing is computed on that path (D10/D11).
func applyOrder(sessions []railEntry, ids []int64, pinnedCount int) ([]railEntry, error) {
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

// sortedByRailPos returns a copy of sessions ordered by ascending RailPos — the current
// truth's manual order, and the base candidate order both applyPin and applyOrder
// rebuild from.
func sortedByRailPos(sessions []railEntry) []railEntry {
	out := make([]railEntry, len(sessions))
	copy(out, sessions)
	sort.SliceStable(out, func(i, j int) bool { return out[i].RailPos < out[j].RailPos })
	return out
}

// rebuild re-derives railPos from a candidate order: every Pinned entry (in candidate
// order) precedes every unpinned one (INV-1), railPos = index (INV-2) — "rebuild the
// whole list as pinned block ++ unpinned block and assign railPos = index" (plan
// Implementation Notes), rather than clever gap arithmetic. Bystanders may end up
// renumbered too when the invariant requires it (plan Invariants: "other sessions must
// be untouched unless renumbering requires it").
func rebuild(candidate []railEntry) []railEntry {
	out := make([]railEntry, 0, len(candidate))
	for _, e := range candidate {
		if e.Pinned {
			out = append(out, e)
		}
	}
	for _, e := range candidate {
		if !e.Pinned {
			out = append(out, e)
		}
	}
	for i := range out {
		out[i].RailPos = int64(i)
	}
	return out
}

// diffChanged returns, from after (a fully rebuilt order), only the entries whose
// Pinned or RailPos differs from before (INV-5: a no-op call broadcasts nothing).
func diffChanged(before, after []railEntry) []railEntry {
	prev := make(map[int64]railEntry, len(before))
	for _, e := range before {
		prev[e.ID] = e
	}
	var changed []railEntry
	for _, e := range after {
		if p, ok := prev[e.ID]; !ok || p.Pinned != e.Pinned || p.RailPos != e.RailPos {
			changed = append(changed, e)
		}
	}
	return changed
}
