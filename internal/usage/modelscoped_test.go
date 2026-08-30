package usage

import (
	"context"
	"database/sql"
	"testing"
	"time"

	"github.com/rs/zerolog"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	_ "modernc.org/sqlite"
)

// countUsageModelSampleRows mirrors aggregator_test.go's countUsageSampleRows for the
// second holder's table — ModelScoped exposes no row-count API of its own.
func countUsageModelSampleRows(t *testing.T, dbPath string) int {
	t.Helper()
	db, err := sql.Open("sqlite", dbPath)
	require.NoError(t, err)
	defer func() { _ = db.Close() }()
	var n int
	require.NoError(t, db.QueryRow(`SELECT COUNT(*) FROM usage_model_sample`).Scan(&n))
	return n
}

func fableWindow(pct float64) ModelWindow {
	return ModelWindow{
		DisplayName: "Fable",
		UsedPct:     pct,
		ResetsAt:    time.Date(2026, 9, 1, 13, 59, 59, 0, time.UTC),
	}
}

func opusWindow(pct float64) ModelWindow {
	return ModelWindow{
		DisplayName: "Opus",
		UsedPct:     pct,
		ResetsAt:    time.Date(2026, 9, 2, 6, 0, 0, 0, time.UTC),
	}
}

// TestModelScoped_Current_BootStateIsNilBothWindowsAndAt covers REQ-14/INV-1's boot
// state: nothing has been fetched yet, so both Windows and At are nil (the "never
// fetched" state), Error is nil, and Source is never empty.
func TestModelScoped_Current_BootStateIsNilBothWindowsAndAt(t *testing.T) {
	st, _ := openTestStore(t)
	ms := NewModelScoped(ModelScopedConfig{Store: st, Logger: zerolog.Nop()})

	snap := ms.Current()

	assert.Nil(t, snap.Windows)
	assert.Nil(t, snap.At)
	assert.Nil(t, snap.Error)
	assert.Equal(t, defaultModelScopedSource, snap.Source)
}

// TestModelScoped_Record_FirstSuccessPersistsAndBroadcasts covers REQ-5's happy path:
// a fresh non-empty list persists one row per window, updates Current(), and broadcasts
// exactly once.
func TestModelScoped_Record_FirstSuccessPersistsAndBroadcasts(t *testing.T) {
	st, dbPath := openTestStore(t)
	var got []ModelSnapshot
	ms := NewModelScoped(ModelScopedConfig{Store: st, Logger: zerolog.Nop(), OnChange: func(s ModelSnapshot) { got = append(got, s) }})

	require.NoError(t, ms.Record(context.Background(), []ModelWindow{fableWindow(61)}))

	require.Len(t, got, 1)
	require.NotNil(t, got[0].Windows)
	require.Len(t, got[0].Windows, 1)
	assert.Equal(t, "Fable", got[0].Windows[0].DisplayName)
	assert.Equal(t, 61.0, got[0].Windows[0].UsedPct)
	require.NotNil(t, got[0].At)
	assert.False(t, got[0].At.IsZero())
	assert.Nil(t, got[0].Error)

	assert.Equal(t, 1, countUsageModelSampleRows(t, dbPath))
}

// TestModelScoped_Record_EmptySuccessfulFetchIsDistinctFromNeverFetched covers Edge
// Case 4 and REQ-14/INV-1 directly: a caller passing a non-nil empty slice (the
// poller's own construction, never InterpretUsageReport's ambiguous nil) must produce a
// non-nil Windows and a non-nil At, not the "never fetched" nil/nil state — while
// persisting zero rows, since there is nothing to write.
func TestModelScoped_Record_EmptySuccessfulFetchIsDistinctFromNeverFetched(t *testing.T) {
	st, dbPath := openTestStore(t)
	var calls int
	ms := NewModelScoped(ModelScopedConfig{Store: st, Logger: zerolog.Nop(), OnChange: func(ModelSnapshot) { calls++ }})

	require.NoError(t, ms.Record(context.Background(), []ModelWindow{}))

	snap := ms.Current()
	assert.NotNil(t, snap.Windows, "an empty-but-non-nil fetch result must not collapse back to nil")
	assert.Empty(t, snap.Windows)
	assert.NotNil(t, snap.At, "At must be set even for an empty successful fetch (INV-1)")
	assert.Equal(t, 1, calls, "a fetch that changes 'never fetched' to 'fetched, empty' is a real change and must broadcast")
	assert.Equal(t, 0, countUsageModelSampleRows(t, dbPath), "an empty list has nothing to persist")
}

// TestModelScoped_Record_IdenticalListDedupsNoRowsNoBroadcast covers REQ-5's dedup: an
// identical list produces no broadcast and no rows.
func TestModelScoped_Record_IdenticalListDedupsNoRowsNoBroadcast(t *testing.T) {
	st, dbPath := openTestStore(t)
	var calls int
	ms := NewModelScoped(ModelScopedConfig{Store: st, Logger: zerolog.Nop(), OnChange: func(ModelSnapshot) { calls++ }})

	require.NoError(t, ms.Record(context.Background(), []ModelWindow{fableWindow(61)}))
	require.NoError(t, ms.Record(context.Background(), []ModelWindow{fableWindow(61)}))

	assert.Equal(t, 1, calls, "an identical list must not re-broadcast")
	assert.Equal(t, 1, countUsageModelSampleRows(t, dbPath), "an identical list must not persist a second batch of rows")
}

// TestModelScoped_Record_ChangedListPersistsNewRowsAndBroadcasts covers the other half
// of REQ-5: a changed list persists one row per window and broadcasts again.
func TestModelScoped_Record_ChangedListPersistsNewRowsAndBroadcasts(t *testing.T) {
	st, dbPath := openTestStore(t)
	var calls int
	ms := NewModelScoped(ModelScopedConfig{Store: st, Logger: zerolog.Nop(), OnChange: func(ModelSnapshot) { calls++ }})

	require.NoError(t, ms.Record(context.Background(), []ModelWindow{fableWindow(61)}))
	require.NoError(t, ms.Record(context.Background(), []ModelWindow{fableWindow(61), opusWindow(10)}))

	assert.Equal(t, 2, calls)
	assert.Equal(t, 3, countUsageModelSampleRows(t, dbPath), "1 row for the first fetch + 2 rows for the second, changed fetch")

	snap := ms.Current()
	require.Len(t, snap.Windows, 2)
}

// TestModelScoped_Record_SortsByDisplayNameBeforeDedupIgnoringInputOrder covers REQ-5's
// "dedups on the full list (sorted by displayName)" clause directly: the same windows
// arriving in a different order must still dedup as identical.
func TestModelScoped_Record_SortsByDisplayNameBeforeDedupIgnoringInputOrder(t *testing.T) {
	st, dbPath := openTestStore(t)
	var calls int
	ms := NewModelScoped(ModelScopedConfig{Store: st, Logger: zerolog.Nop(), OnChange: func(ModelSnapshot) { calls++ }})

	require.NoError(t, ms.Record(context.Background(), []ModelWindow{opusWindow(10), fableWindow(61)}))
	require.NoError(t, ms.Record(context.Background(), []ModelWindow{fableWindow(61), opusWindow(10)}))

	assert.Equal(t, 1, calls, "the same windows in a different order must dedup as identical")
	assert.Equal(t, 2, countUsageModelSampleRows(t, dbPath))

	snap := ms.Current()
	require.Len(t, snap.Windows, 2)
	assert.Equal(t, "Fable", snap.Windows[0].DisplayName, "Current() exposes the sorted order")
	assert.Equal(t, "Opus", snap.Windows[1].DisplayName)
}

// TestModelScoped_Record_PersistFailureLeavesMemoryAndDedupStateUnchanged mirrors
// TestAggregator_Record_PersistFailureLeavesMemoryUnchanged (D6): a failed
// usage_model_sample write must leave Current() at its previous value and must not
// advance the dedup state, so the identical list arriving again retries persistence
// instead of being silently deduped away forever.
func TestModelScoped_Record_PersistFailureLeavesMemoryAndDedupStateUnchanged(t *testing.T) {
	st, _ := openTestStore(t)
	var calls int
	ms := NewModelScoped(ModelScopedConfig{Store: st, Logger: zerolog.Nop(), OnChange: func(ModelSnapshot) { calls++ }})

	require.NoError(t, st.Close())

	err := ms.Record(context.Background(), []ModelWindow{fableWindow(61)})
	require.Error(t, err, "a failed persist must be reported, not swallowed")
	assert.Equal(t, 0, calls, "no broadcast for a list that never persisted")

	snap := ms.Current()
	assert.Nil(t, snap.Windows, "Current() must stay at the never-fetched state, not the failed one")
	assert.Nil(t, snap.At)

	// Retry with the identical list: dedup state must not have advanced, so this
	// attempts persistence again (and errors again on the closed store) rather than
	// being silently deduped into a no-op.
	err = ms.Record(context.Background(), []ModelWindow{fableWindow(61)})
	require.Error(t, err, "retry of an unpersisted list must not be deduped away")
}

// TestModelScoped_SetError_FirstOccurrenceBroadcastsRepeatDoesNot covers REQ-6's
// logging/broadcast clause: the first occurrence of an error kind broadcasts, and a
// repeat of the same kind does not.
func TestModelScoped_SetError_FirstOccurrenceBroadcastsRepeatDoesNot(t *testing.T) {
	st, _ := openTestStore(t)
	var calls int
	ms := NewModelScoped(ModelScopedConfig{Store: st, Logger: zerolog.Nop(), OnChange: func(ModelSnapshot) { calls++ }})

	ms.SetError("no-credentials")
	assert.Equal(t, 1, calls)
	require.NotNil(t, ms.Current().Error)
	assert.Equal(t, "no-credentials", *ms.Current().Error)

	ms.SetError("no-credentials")
	assert.Equal(t, 1, calls, "a repeat of the same error kind must not re-broadcast")
}

// TestModelScoped_SetError_DifferentKindTransitionBroadcastsAgain covers the other half:
// a transition to a *different* error kind is a real change and broadcasts again.
func TestModelScoped_SetError_DifferentKindTransitionBroadcastsAgain(t *testing.T) {
	st, _ := openTestStore(t)
	var calls int
	ms := NewModelScoped(ModelScopedConfig{Store: st, Logger: zerolog.Nop(), OnChange: func(ModelSnapshot) { calls++ }})

	ms.SetError("no-credentials")
	ms.SetError("unauthorized")

	assert.Equal(t, 2, calls)
	require.NotNil(t, ms.Current().Error)
	assert.Equal(t, "unauthorized", *ms.Current().Error)
}

// TestModelScoped_SetError_AfterSuccessKeepsLastGoodListAndAt covers REQ-6's
// "leaves the last-good list in place" clause, asserted from the "after a good fetch"
// source state (not just boot) — the m1-sessions lesson that invariants need
// cross-state coverage.
func TestModelScoped_SetError_AfterSuccessKeepsLastGoodListAndAt(t *testing.T) {
	st, _ := openTestStore(t)
	ms := NewModelScoped(ModelScopedConfig{Store: st, Logger: zerolog.Nop()})

	require.NoError(t, ms.Record(context.Background(), []ModelWindow{fableWindow(61)}))
	before := ms.Current()
	require.NotNil(t, before.Windows)
	require.NotNil(t, before.At)

	ms.SetError("unreachable")

	after := ms.Current()
	assert.Equal(t, before.Windows, after.Windows, "a failed poll must never change the last-good list (Edge Case 3/REQ-6)")
	assert.Equal(t, before.At, after.At, "a failed poll must never change the last-good fetch time")
	require.NotNil(t, after.Error)
	assert.Equal(t, "unreachable", *after.Error)
}

// TestModelScoped_Record_SuccessAfterFailureClearsErrorEvenWhenListUnchanged covers the
// Record doc comment directly: "a success after a failure must broadcast even when the
// list itself is unchanged, since modelScopedError changed."
func TestModelScoped_Record_SuccessAfterFailureClearsErrorEvenWhenListUnchanged(t *testing.T) {
	st, _ := openTestStore(t)
	var calls int
	ms := NewModelScoped(ModelScopedConfig{Store: st, Logger: zerolog.Nop(), OnChange: func(ModelSnapshot) { calls++ }})

	require.NoError(t, ms.Record(context.Background(), []ModelWindow{fableWindow(61)}))
	ms.SetError("unauthorized")
	require.NotNil(t, ms.Current().Error)
	callsBefore := calls

	require.NoError(t, ms.Record(context.Background(), []ModelWindow{fableWindow(61)}))

	assert.Greater(t, calls, callsBefore, "a success-after-failure with an unchanged list must still broadcast, since the error cleared")
	assert.Nil(t, ms.Current().Error)
	require.Len(t, ms.Current().Windows, 1)
	assert.Equal(t, 61.0, ms.Current().Windows[0].UsedPct)
}

// TestModelScoped_INV1_AtNullIffWindowsNull asserts REQ-14/INV-1 from every source
// state the plan names: boot, first success, failure-after-success, success-after-
// failure, and an explicit [] result — a nil-check-both-or-neither invariant checked
// after each transition rather than only at the end (m1-sessions lesson: an invariant
// needs cross-state coverage, not just a final-state check).
func TestModelScoped_INV1_AtNullIffWindowsNull(t *testing.T) {
	assertINV1 := func(t *testing.T, snap ModelSnapshot, label string) {
		t.Helper()
		assert.Equal(t, snap.Windows == nil, snap.At == nil, "%s: modelScopedAt must be null iff modelScoped is null", label)
	}

	st, _ := openTestStore(t)
	ms := NewModelScoped(ModelScopedConfig{Store: st, Logger: zerolog.Nop()})

	assertINV1(t, ms.Current(), "boot (never fetched)")

	require.NoError(t, ms.Record(context.Background(), []ModelWindow{fableWindow(61)}))
	assertINV1(t, ms.Current(), "first success")

	ms.SetError("unreachable")
	assertINV1(t, ms.Current(), "failure-after-success")

	require.NoError(t, ms.Record(context.Background(), []ModelWindow{fableWindow(65)}))
	assertINV1(t, ms.Current(), "success-after-failure")

	require.NoError(t, ms.Record(context.Background(), []ModelWindow{}))
	assertINV1(t, ms.Current(), "[] result")
}

// TestModelScoped_INV1_FailureBeforeAnySuccessKeepsBothNil covers the one reachable
// state the happy-path table above never visits: a poll failing before any success has
// ever landed must not manufacture a non-nil Windows or At out of nothing.
func TestModelScoped_INV1_FailureBeforeAnySuccessKeepsBothNil(t *testing.T) {
	st, _ := openTestStore(t)
	ms := NewModelScoped(ModelScopedConfig{Store: st, Logger: zerolog.Nop()})

	ms.SetError("no-credentials")

	snap := ms.Current()
	assert.Nil(t, snap.Windows)
	assert.Nil(t, snap.At)
	require.NotNil(t, snap.Error)
	assert.Equal(t, "no-credentials", *snap.Error)
}

// TestWindowsEqual_NilVsEmptyAreNeverEqual is a pure-function test of the exact
// distinction REQ-14/INV-1 depends on.
func TestWindowsEqual_NilVsEmptyAreNeverEqual(t *testing.T) {
	assert.True(t, windowsEqual(nil, nil))
	assert.True(t, windowsEqual([]ModelWindow{}, []ModelWindow{}))
	assert.False(t, windowsEqual(nil, []ModelWindow{}), "nil ('never fetched') and empty ('fetched, nothing') must never compare equal")
	assert.False(t, windowsEqual([]ModelWindow{}, nil))
}

func TestWindowsEqual_DetectsEveryFieldDifference(t *testing.T) {
	base := []ModelWindow{fableWindow(61)}

	diffPct := []ModelWindow{fableWindow(62)}
	assert.False(t, windowsEqual(base, diffPct))

	diffName := []ModelWindow{{DisplayName: "Opus", UsedPct: 61, ResetsAt: base[0].ResetsAt}}
	assert.False(t, windowsEqual(base, diffName))

	diffResets := []ModelWindow{{DisplayName: "Fable", UsedPct: 61, ResetsAt: base[0].ResetsAt.Add(time.Hour)}}
	assert.False(t, windowsEqual(base, diffResets))

	diffLen := []ModelWindow{fableWindow(61), opusWindow(10)}
	assert.False(t, windowsEqual(base, diffLen))

	same := []ModelWindow{fableWindow(61)}
	assert.True(t, windowsEqual(base, same))
}

// TestSortedWindows_SortsByDisplayNameAndDoesNotAliasInput guards both properties the
// doc comment promises: sorted output, and a copy so ModelScoped's retained slice never
// aliases the caller's.
func TestSortedWindows_SortsByDisplayNameAndDoesNotAliasInput(t *testing.T) {
	input := []ModelWindow{opusWindow(10), fableWindow(61)}

	sorted := sortedWindows(input)

	require.Len(t, sorted, 2)
	assert.Equal(t, "Fable", sorted[0].DisplayName)
	assert.Equal(t, "Opus", sorted[1].DisplayName)

	// Mutating the returned slice must not affect the caller's original.
	sorted[0].UsedPct = 999
	assert.Equal(t, 10.0, input[0].UsedPct, "sortedWindows must return a copy, not an aliased view of the input")
}

func TestSortedWindows_NilInputReturnsNonNilEmpty(t *testing.T) {
	sorted := sortedWindows(nil)
	assert.NotNil(t, sorted)
	assert.Empty(t, sorted)
}
