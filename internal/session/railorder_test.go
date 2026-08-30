package session

import (
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// assertInvariants is INV-1/INV-2's shared check (docs/protocol.md §5.3, plan
// order-sidebar Invariants): every pinned entry's RailPos is smaller than every
// unpinned entry's (INV-1), and no two entries share a RailPos (INV-2). Used after
// every applyPin/applyOrder case in the table tests below (D13/D14) — asserted
// against the *reconstructed* full set (unchanged entries carried forward plus the
// returned changed ones), never just the changed subset, since the invariant is a
// property of the whole rail.
func assertInvariants(t *testing.T, before, changed []railEntry) {
	t.Helper()
	full := applyChanges(before, changed)

	seen := make(map[int64]bool, len(full))
	for _, e := range full {
		assert.False(t, seen[e.RailPos], "INV-2 violated: RailPos %d used more than once", e.RailPos)
		seen[e.RailPos] = true
	}
	for _, a := range full {
		if !a.Pinned {
			continue
		}
		for _, b := range full {
			if b.Pinned {
				continue
			}
			assert.Less(t, a.RailPos, b.RailPos,
				"INV-1 violated: pinned id=%d (railPos=%d) must precede unpinned id=%d (railPos=%d)",
				a.ID, a.RailPos, b.ID, b.RailPos)
		}
	}
}

// applyChanges overlays changed onto before (by ID) — the same "unchanged entries
// keep their old value, changed ones take the new one" merge SetPinned/SetOrder do at
// the Manager level (applyRailChangesLocked), reconstructed here so the pure-function
// tests can assert the invariant against the *whole* resulting rail, not just the diff.
func applyChanges(before, changed []railEntry) []railEntry {
	byID := make(map[int64]railEntry, len(changed))
	for _, c := range changed {
		byID[c.ID] = c
	}
	out := make([]railEntry, len(before))
	for i, b := range before {
		if c, ok := byID[b.ID]; ok {
			out[i] = c
		} else {
			out[i] = b
		}
	}
	return out
}

func TestApplyPin_UnknownSessionReturnsErrUnknownSession(t *testing.T) {
	sessions := []railEntry{{ID: 1, Pinned: false, RailPos: 0}}

	_, err := applyPin(sessions, 999, true)

	assert.ErrorIs(t, err, ErrUnknownSession)
}

// TestApplyPin_InvariantsHoldFromEveryStartingConfiguration is D13/D14's exhaustive
// table: INV-1/INV-2 are asserted after every pin/unpin, crossed against every starting
// configuration the plan's Invariants section names — no sessions (trivial single
// case), all unpinned, all pinned, mixed — with the mutated session at the top, middle
// and bottom of its own block, and with bystanders present throughout (m1-sessions
// lesson: a table that always mutates the same convenient position proves nothing about
// the invariant).
func TestApplyPin_InvariantsHoldFromEveryStartingConfiguration(t *testing.T) {
	tests := []struct {
		name    string
		before  []railEntry
		id      int64
		pinned  bool
		wantErr bool
	}{
		{
			name:   "single unpinned session, pin it",
			before: []railEntry{{ID: 1, Pinned: false, RailPos: 0}},
			id:     1, pinned: true,
		},
		{
			name:   "single pinned session, unpin it",
			before: []railEntry{{ID: 1, Pinned: true, RailPos: 0}},
			id:     1, pinned: false,
		},
		{
			name: "all unpinned, pin the top one",
			before: []railEntry{
				{ID: 1, Pinned: false, RailPos: 0},
				{ID: 2, Pinned: false, RailPos: 1},
				{ID: 3, Pinned: false, RailPos: 2},
			},
			id: 1, pinned: true,
		},
		{
			name: "all unpinned, pin the middle one",
			before: []railEntry{
				{ID: 1, Pinned: false, RailPos: 0},
				{ID: 2, Pinned: false, RailPos: 1},
				{ID: 3, Pinned: false, RailPos: 2},
			},
			id: 2, pinned: true,
		},
		{
			name: "all unpinned, pin the bottom one",
			before: []railEntry{
				{ID: 1, Pinned: false, RailPos: 0},
				{ID: 2, Pinned: false, RailPos: 1},
				{ID: 3, Pinned: false, RailPos: 2},
			},
			id: 3, pinned: true,
		},
		{
			name: "all pinned, unpin the top one",
			before: []railEntry{
				{ID: 1, Pinned: true, RailPos: 0},
				{ID: 2, Pinned: true, RailPos: 1},
				{ID: 3, Pinned: true, RailPos: 2},
			},
			id: 1, pinned: false,
		},
		{
			name: "all pinned, unpin the middle one",
			before: []railEntry{
				{ID: 1, Pinned: true, RailPos: 0},
				{ID: 2, Pinned: true, RailPos: 1},
				{ID: 3, Pinned: true, RailPos: 2},
			},
			id: 2, pinned: false,
		},
		{
			name: "all pinned, unpin the bottom one",
			before: []railEntry{
				{ID: 1, Pinned: true, RailPos: 0},
				{ID: 2, Pinned: true, RailPos: 1},
				{ID: 3, Pinned: true, RailPos: 2},
			},
			id: 3, pinned: false,
		},
		{
			name: "mixed block, pin an unpinned bystander at the top of the unpinned group",
			before: []railEntry{
				{ID: 1, Pinned: true, RailPos: 0},
				{ID: 2, Pinned: false, RailPos: 1},
				{ID: 3, Pinned: false, RailPos: 2},
				{ID: 4, Pinned: false, RailPos: 3},
			},
			id: 2, pinned: true,
		},
		{
			name: "mixed block, pin the bottom unpinned session",
			before: []railEntry{
				{ID: 1, Pinned: true, RailPos: 0},
				{ID: 2, Pinned: false, RailPos: 1},
				{ID: 3, Pinned: false, RailPos: 2},
				{ID: 4, Pinned: false, RailPos: 3},
			},
			id: 4, pinned: true,
		},
		{
			name: "mixed block, unpin the top pinned session",
			before: []railEntry{
				{ID: 1, Pinned: true, RailPos: 0},
				{ID: 2, Pinned: true, RailPos: 1},
				{ID: 3, Pinned: false, RailPos: 2},
				{ID: 4, Pinned: false, RailPos: 3},
			},
			id: 1, pinned: false,
		},
		{
			name: "mixed block, unpin the bottom pinned session",
			before: []railEntry{
				{ID: 1, Pinned: true, RailPos: 0},
				{ID: 2, Pinned: true, RailPos: 1},
				{ID: 3, Pinned: false, RailPos: 2},
				{ID: 4, Pinned: false, RailPos: 3},
			},
			id: 2, pinned: false,
		},
		{
			name: "already pinned, pin again (no-op) with bystanders present",
			before: []railEntry{
				{ID: 1, Pinned: true, RailPos: 0},
				{ID: 2, Pinned: false, RailPos: 1},
			},
			id: 1, pinned: true,
		},
		{
			name: "already unpinned, unpin again (no-op) with bystanders present",
			before: []railEntry{
				{ID: 1, Pinned: true, RailPos: 0},
				{ID: 2, Pinned: false, RailPos: 1},
			},
			id: 2, pinned: false,
		},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			changed, err := applyPin(tt.before, tt.id, tt.pinned)
			require.NoError(t, err)
			assertInvariants(t, tt.before, changed)
		})
	}
}

// TestApplyPin_PinMovesToBottomOfPinnedBlock covers D6 precisely (docs/protocol.md
// §3.10): pinning places id immediately after the current last pinned session (or at
// the very top, when nothing was pinned before), never reordering the rest of the
// pinned block.
func TestApplyPin_PinMovesToBottomOfPinnedBlock(t *testing.T) {
	before := []railEntry{
		{ID: 1, Pinned: true, RailPos: 0},
		{ID: 2, Pinned: true, RailPos: 1},
		{ID: 3, Pinned: false, RailPos: 2},
		{ID: 4, Pinned: false, RailPos: 3},
	}

	changed, err := applyPin(before, 4, true)
	require.NoError(t, err)

	full := applyChanges(before, changed)
	got := indexByID(full)
	assert.True(t, got[1].Pinned)
	assert.True(t, got[2].Pinned)
	assert.True(t, got[4].Pinned, "id 4 must now be pinned")
	assert.False(t, got[3].Pinned)
	assert.Less(t, got[1].RailPos, got[2].RailPos)
	assert.Less(t, got[2].RailPos, got[4].RailPos, "id 4 lands at the bottom of the pinned block, after the existing pinned sessions")
	assert.Less(t, got[4].RailPos, got[3].RailPos, "id 4 must precede every remaining unpinned session")
}

// TestApplyPin_UnpinMovesToTopOfUnpinnedBlock covers D7 precisely: unpinning places id
// immediately after the last remaining pinned session (top of the unpinned block),
// ahead of every session that was already unpinned.
func TestApplyPin_UnpinMovesToTopOfUnpinnedBlock(t *testing.T) {
	before := []railEntry{
		{ID: 1, Pinned: true, RailPos: 0},
		{ID: 2, Pinned: true, RailPos: 1},
		{ID: 3, Pinned: false, RailPos: 2},
		{ID: 4, Pinned: false, RailPos: 3},
	}

	changed, err := applyPin(before, 1, false)
	require.NoError(t, err)

	full := applyChanges(before, changed)
	got := indexByID(full)
	assert.True(t, got[2].Pinned, "the remaining pinned session stays pinned")
	assert.False(t, got[1].Pinned)
	assert.Less(t, got[2].RailPos, got[1].RailPos, "the sole pinned survivor still precedes the unpinned id 1")
	assert.Less(t, got[1].RailPos, got[3].RailPos, "id 1 lands ahead of the sessions that were already unpinned")
	assert.Less(t, got[1].RailPos, got[4].RailPos)
}

// TestApplyPin_NoOpWhenFlagAlreadyMatchesBroadcastsNothing covers D8/INV-5 from a clean
// (gap-free) starting rail: pinning/unpinning a session already in the requested state
// changes nothing at all, for any bystander configuration.
func TestApplyPin_NoOpWhenFlagAlreadyMatchesBroadcastsNothing(t *testing.T) {
	tests := []struct {
		name   string
		before []railEntry
		id     int64
		pinned bool
	}{
		{
			name:   "single already-pinned session pinned again",
			before: []railEntry{{ID: 1, Pinned: true, RailPos: 0}},
			id:     1, pinned: true,
		},
		{
			name:   "single already-unpinned session unpinned again",
			before: []railEntry{{ID: 1, Pinned: false, RailPos: 0}},
			id:     1, pinned: false,
		},
		{
			name: "mixed block, already-pinned bystanders present",
			before: []railEntry{
				{ID: 1, Pinned: true, RailPos: 0},
				{ID: 2, Pinned: true, RailPos: 1},
				{ID: 3, Pinned: false, RailPos: 2},
			},
			id: 1, pinned: true,
		},
		{
			name: "mixed block, already-unpinned bystanders present",
			before: []railEntry{
				{ID: 1, Pinned: true, RailPos: 0},
				{ID: 2, Pinned: false, RailPos: 1},
				{ID: 3, Pinned: false, RailPos: 2},
			},
			id: 3, pinned: false,
		},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			changed, err := applyPin(tt.before, tt.id, tt.pinned)
			require.NoError(t, err)
			assert.Empty(t, changed, "D8: a pin call matching the current flag must broadcast nothing")
		})
	}
}

// TestApplyPin_NoOpWithPreExistingGapsStillBroadcastsNothing is D8 asserted from a
// *dirty* starting state instead of the clean contiguous rail every other no-op case
// above uses: REQ-14 permits railPos gaps to survive a Remove (removing session 2
// below leaves ids 1 and 3 at railPos 0 and 2, a gap at 1). A pin call whose flag
// already matches must still broadcast nothing — D8 makes no exception for a rail that
// happens to have gaps in it — even though rebuild's own "railPos = index" renumbering
// would silently close that gap and report every bystander whose numeric railPos
// shifted as "changed" if this path did not special-case the true no-op. Both no-op
// directions (already-unpinned/unpin, already-pinned/pin) are covered from the same
// gappy shape: the fix's short-circuit (`current.Pinned == pinned`) is symmetric in the
// flag, and a per-transition test that only exercised one direction would have missed a
// fix that special-cased just that branch.
func TestApplyPin_NoOpWithPreExistingGapsStillBroadcastsNothing(t *testing.T) {
	tests := []struct {
		name   string
		before []railEntry
		id     int64
		pinned bool
	}{
		{
			name: "already-unpinned session unpinned again, gap among unpinned bystanders",
			// Simulates: 3 sessions created (railPos 0,1,2), then the middle one
			// (id 2) is removed — ids 1 and 3 remain at railPos 0 and 2, a
			// REQ-14-sanctioned gap.
			before: []railEntry{
				{ID: 1, Pinned: false, RailPos: 0},
				{ID: 3, Pinned: false, RailPos: 2},
			},
			id: 1, pinned: false,
		},
		{
			name: "already-pinned session pinned again, gap among pinned bystanders",
			// Same shape, mirrored into the pinned block: 3 pinned sessions
			// created (railPos 0,1,2), the middle one removed, leaving ids 1
			// and 3 pinned at railPos 0 and 2.
			before: []railEntry{
				{ID: 1, Pinned: true, RailPos: 0},
				{ID: 3, Pinned: true, RailPos: 2},
			},
			id: 1, pinned: true,
		},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			changed, err := applyPin(tt.before, tt.id, tt.pinned)

			require.NoError(t, err)
			assert.Empty(t, changed, "D8: a pin call matching the current flag must broadcast nothing, even when a bystander's railPos has a pre-existing gap from an earlier Remove")
		})
	}
}

func indexByID(entries []railEntry) map[int64]railEntry {
	out := make(map[int64]railEntry, len(entries))
	for _, e := range entries {
		out[e.ID] = e
	}
	return out
}

// --- applyOrder ---

func TestApplyOrder_NegativePinnedCountReturnsErrInvalidOrder(t *testing.T) {
	sessions := []railEntry{{ID: 1, Pinned: false, RailPos: 0}}

	_, err := applyOrder(sessions, []int64{1}, -1)

	assert.ErrorIs(t, err, ErrInvalidOrder)
}

func TestApplyOrder_PinnedCountAboveLenIDsReturnsErrInvalidOrder(t *testing.T) {
	sessions := []railEntry{{ID: 1, Pinned: false, RailPos: 0}}

	_, err := applyOrder(sessions, []int64{1}, 2)

	assert.ErrorIs(t, err, ErrInvalidOrder)
}

func TestApplyOrder_DuplicateIDReturnsErrInvalidOrder(t *testing.T) {
	sessions := []railEntry{
		{ID: 1, Pinned: false, RailPos: 0},
		{ID: 2, Pinned: false, RailPos: 1},
	}

	_, err := applyOrder(sessions, []int64{1, 2, 1}, 0)

	assert.ErrorIs(t, err, ErrInvalidOrder)
}

func TestApplyOrder_UnknownIDReturnsErrInvalidOrder(t *testing.T) {
	sessions := []railEntry{{ID: 1, Pinned: false, RailPos: 0}}

	_, err := applyOrder(sessions, []int64{1, 999}, 0)

	assert.ErrorIs(t, err, ErrInvalidOrder)
}

// TestApplyOrder_InvalidRequestChangesNothing covers D10/D11's other half: on the
// invalid-request path, nothing at all is computed (nil), not merely an error alongside
// a partial result a careless caller might persist.
func TestApplyOrder_InvalidRequestChangesNothing(t *testing.T) {
	sessions := []railEntry{{ID: 1, Pinned: false, RailPos: 0}}

	changed, err := applyOrder(sessions, []int64{1, 999}, 0)

	require.Error(t, err)
	assert.Nil(t, changed)
}

// TestApplyOrder_EmptyIDsIsALiteralNoOpEvenWithGaps covers the plan's Decisions entry:
// an empty ids list short-circuits before the general rebuild-and-diff path, so a
// bystander's pre-existing REQ-14 gap is never silently closed by a request that is
// supposed to be a pure no-op.
func TestApplyOrder_EmptyIDsIsALiteralNoOpEvenWithGaps(t *testing.T) {
	sessions := []railEntry{
		{ID: 1, Pinned: false, RailPos: 0},
		{ID: 3, Pinned: false, RailPos: 2}, // gap at railPos 1 from an earlier Remove
	}

	changed, err := applyOrder(sessions, []int64{}, 0)

	require.NoError(t, err)
	assert.Nil(t, changed, "an empty ids request is a literal no-op — bystander gaps must survive untouched")
}

func TestApplyOrder_EmptyIDsWithNonZeroPinnedCountIsInvalid(t *testing.T) {
	sessions := []railEntry{{ID: 1, Pinned: false, RailPos: 0}}

	_, err := applyOrder(sessions, []int64{}, 1)

	assert.ErrorIs(t, err, ErrInvalidOrder)
}

// TestApplyOrder_AppliesListedIDsAsPositionsAndFlags covers D9: the first pinnedCount
// listed ids become pinned in listed order, the rest unpinned in listed order, railPos
// = index in the final rebuilt order.
func TestApplyOrder_AppliesListedIDsAsPositionsAndFlags(t *testing.T) {
	sessions := []railEntry{
		{ID: 4, Pinned: false, RailPos: 0},
		{ID: 9, Pinned: false, RailPos: 1},
		{ID: 2, Pinned: false, RailPos: 2},
		{ID: 7, Pinned: false, RailPos: 3},
	}

	changed, err := applyOrder(sessions, []int64{4, 9, 2, 7}, 1)
	require.NoError(t, err)

	full := applyChanges(sessions, changed)
	got := indexByID(full)
	assert.True(t, got[4].Pinned)
	assert.False(t, got[9].Pinned)
	assert.False(t, got[2].Pinned)
	assert.False(t, got[7].Pinned)
	assert.Equal(t, int64(0), got[4].RailPos)
	assert.Equal(t, int64(1), got[9].RailPos)
	assert.Equal(t, int64(2), got[2].RailPos)
	assert.Equal(t, int64(3), got[7].RailPos)
}

// TestApplyOrder_UnlistedSessionsKeepFlagAndFollowInExistingRelativeOrder covers D12:
// a session that exists but isn't named in ids keeps its pinned flag and is placed
// after every listed id, in its own existing relative railPos order among the other
// unlisted ones.
func TestApplyOrder_UnlistedSessionsKeepFlagAndFollowInExistingRelativeOrder(t *testing.T) {
	sessions := []railEntry{
		{ID: 1, Pinned: false, RailPos: 0},
		{ID: 2, Pinned: false, RailPos: 1},
		{ID: 3, Pinned: false, RailPos: 2}, // unlisted
		{ID: 5, Pinned: false, RailPos: 3}, // unlisted, concurrent launch (Edge Case 1)
	}

	changed, err := applyOrder(sessions, []int64{2, 1}, 0)
	require.NoError(t, err)

	full := applyChanges(sessions, changed)
	got := indexByID(full)
	assert.False(t, got[3].Pinned, "unlisted sessions keep their existing flag")
	assert.False(t, got[5].Pinned)
	assert.Less(t, got[2].RailPos, got[1].RailPos, "listed order is honored")
	assert.Less(t, got[1].RailPos, got[3].RailPos, "unlisted sessions follow every listed one")
	assert.Less(t, got[3].RailPos, got[5].RailPos, "unlisted sessions keep their own existing relative order (3 was before 5)")
}

// TestApplyOrder_UnlistedPinnedBystanderIsPushedToEndOfPinnedBlockNotStranded covers the
// applyOrder doc comment's specific invariant-enforcement case: an unlisted session that
// was pinned must still end up inside the pinned block (INV-1), even though the general
// "unlisted sessions follow the listed ones" placement rule would otherwise strand it
// after a listed *unpinned* id.
func TestApplyOrder_UnlistedPinnedBystanderIsPushedToEndOfPinnedBlockNotStranded(t *testing.T) {
	sessions := []railEntry{
		{ID: 1, Pinned: true, RailPos: 0},  // unlisted, pinned bystander
		{ID: 2, Pinned: false, RailPos: 1}, // listed, becomes unpinned
	}

	changed, err := applyOrder(sessions, []int64{2}, 0)
	require.NoError(t, err)

	full := applyChanges(sessions, changed)
	got := indexByID(full)
	assert.True(t, got[1].Pinned, "the unlisted bystander keeps its pinned flag")
	assert.False(t, got[2].Pinned)
	assert.Less(t, got[1].RailPos, got[2].RailPos, "INV-1: the pinned bystander must precede the unpinned listed id, not be stranded after it")
}

// TestApplyOrder_InvariantsHoldFromEveryStartingConfiguration mirrors applyPin's own
// exhaustive table for D13/D14 — every named starting configuration, this time crossed
// with the order-request shapes REQ-4 defines (full reorder, partial reorder with
// bystanders, a boundary-crossing pinnedCount).
func TestApplyOrder_InvariantsHoldFromEveryStartingConfiguration(t *testing.T) {
	tests := []struct {
		name        string
		before      []railEntry
		ids         []int64
		pinnedCount int
	}{
		{
			name:        "single unpinned session, listed and pinned",
			before:      []railEntry{{ID: 1, Pinned: false, RailPos: 0}},
			ids:         []int64{1},
			pinnedCount: 1,
		},
		{
			name:        "single pinned session, listed and unpinned",
			before:      []railEntry{{ID: 1, Pinned: true, RailPos: 0}},
			ids:         []int64{1},
			pinnedCount: 0,
		},
		{
			name: "all unpinned, reversed order, none pinned",
			before: []railEntry{
				{ID: 1, Pinned: false, RailPos: 0},
				{ID: 2, Pinned: false, RailPos: 1},
				{ID: 3, Pinned: false, RailPos: 2},
			},
			ids:         []int64{3, 2, 1},
			pinnedCount: 0,
		},
		{
			name: "all unpinned, first two become pinned",
			before: []railEntry{
				{ID: 1, Pinned: false, RailPos: 0},
				{ID: 2, Pinned: false, RailPos: 1},
				{ID: 3, Pinned: false, RailPos: 2},
			},
			ids:         []int64{2, 1, 3},
			pinnedCount: 2,
		},
		{
			name: "all pinned, reordered and all unpinned",
			before: []railEntry{
				{ID: 1, Pinned: true, RailPos: 0},
				{ID: 2, Pinned: true, RailPos: 1},
				{ID: 3, Pinned: true, RailPos: 2},
			},
			ids:         []int64{3, 1, 2},
			pinnedCount: 0,
		},
		{
			name: "mixed, only some listed, boundary crosses an unlisted pinned bystander",
			before: []railEntry{
				{ID: 1, Pinned: true, RailPos: 0},
				{ID: 2, Pinned: true, RailPos: 1},
				{ID: 3, Pinned: false, RailPos: 2},
				{ID: 4, Pinned: false, RailPos: 3},
			},
			ids:         []int64{3, 1},
			pinnedCount: 1, // 3 becomes pinned; 1 becomes unpinned; 2 and 4 unlisted
		},
		{
			name: "mixed, drop across the boundary both ways",
			before: []railEntry{
				{ID: 1, Pinned: true, RailPos: 0},
				{ID: 2, Pinned: false, RailPos: 1},
				{ID: 3, Pinned: false, RailPos: 2},
			},
			ids:         []int64{2, 1, 3},
			pinnedCount: 1,
		},
		{
			name: "pinnedCount at the upper boundary (all listed become pinned)",
			before: []railEntry{
				{ID: 1, Pinned: false, RailPos: 0},
				{ID: 2, Pinned: false, RailPos: 1},
			},
			ids:         []int64{1, 2},
			pinnedCount: 2,
		},
		{
			name: "pinnedCount at zero with an unlisted pinned bystander",
			before: []railEntry{
				{ID: 1, Pinned: true, RailPos: 0},
				{ID: 2, Pinned: false, RailPos: 1},
				{ID: 3, Pinned: false, RailPos: 2},
			},
			ids:         []int64{2, 3},
			pinnedCount: 0,
		},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			changed, err := applyOrder(tt.before, tt.ids, tt.pinnedCount)
			require.NoError(t, err)
			assertInvariants(t, tt.before, changed)
		})
	}
}

// TestApplyOrder_OnlyChangedSessionsAreReturned covers D15/INV-5 directly: a session
// whose pinned flag and railPos both come out identical to before must not appear in
// the returned diff, even though it was named in ids and rebuild recomputed it.
func TestApplyOrder_OnlyChangedSessionsAreReturned(t *testing.T) {
	sessions := []railEntry{
		{ID: 1, Pinned: false, RailPos: 0},
		{ID: 2, Pinned: false, RailPos: 1},
	}

	// Re-submitting the exact same order/flags is a full no-op for every entry.
	changed, err := applyOrder(sessions, []int64{1, 2}, 0)

	require.NoError(t, err)
	assert.Empty(t, changed, "resubmitting the identical order and flags must change nothing")
}

// TestApplyOrder_PartialChangeOnlyReturnsTheSessionsThatActuallyMoved covers D15/INV-5's
// more realistic case: reordering two sessions must not report a third, untouched
// bystander as changed.
func TestApplyOrder_PartialChangeOnlyReturnsTheSessionsThatActuallyMoved(t *testing.T) {
	sessions := []railEntry{
		{ID: 1, Pinned: false, RailPos: 0},
		{ID: 2, Pinned: false, RailPos: 1},
		{ID: 3, Pinned: false, RailPos: 2},
	}

	// Swap 1 and 2; leave 3 unlisted so it should be untouched (it stays last with the
	// same relative position, hence the same final railPos it already had).
	changed, err := applyOrder(sessions, []int64{2, 1}, 0)
	require.NoError(t, err)

	ids := make(map[int64]bool, len(changed))
	for _, c := range changed {
		ids[c.ID] = true
	}
	assert.True(t, ids[1])
	assert.True(t, ids[2])
	assert.False(t, ids[3], "an unlisted, unmoved bystander must not be reported as changed")
}
