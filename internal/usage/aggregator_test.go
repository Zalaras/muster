package usage

import (
	"context"
	"database/sql"
	"path/filepath"
	"testing"
	"time"

	"github.com/rs/zerolog"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/Zalaras/muster/internal/store"

	_ "modernc.org/sqlite"
)

// openTestStore opens a fresh, migrated SQLite store, returning both the Store and its
// backing file path — the aggregator's own tests need to query usage_sample directly,
// since Aggregator exposes no row-count API of its own (mirrors internal/server's
// testServer.queryDB pattern for the same reason).
func openTestStore(t *testing.T) (*store.Store, string) {
	t.Helper()
	path := filepath.Join(t.TempDir(), "muster.db")
	st, err := store.Open(context.Background(), path)
	require.NoError(t, err)
	t.Cleanup(func() { _ = st.Close() })
	return st, path
}

func countUsageSampleRows(t *testing.T, dbPath string) int {
	t.Helper()
	db, err := sql.Open("sqlite", dbPath)
	require.NoError(t, err)
	defer func() { _ = db.Close() }()
	var n int
	require.NoError(t, db.QueryRow(`SELECT COUNT(*) FROM usage_sample`).Scan(&n))
	return n
}

func newTestAggregator(st *store.Store, onChange func(Snapshot)) *Aggregator {
	return NewAggregator(Config{Store: st, Logger: zerolog.Nop(), OnChange: onChange})
}

// fullSample returns a complete Sample (both buckets, a model, source) — the shape
// Record only ever receives, since InterpretStatus never produces a partial one
// (REQ-3/REQ-5). SampledAt is left zero; Record stamps it itself.
func fullSample(fiveHourPct, sevenDayPct float64) Sample {
	return Sample{
		FiveHour: Bucket{UsedPct: fiveHourPct, ResetsAt: time.Date(2026, 8, 23, 11, 0, 0, 0, time.UTC)},
		SevenDay: Bucket{UsedPct: sevenDayPct, ResetsAt: time.Date(2026, 8, 25, 6, 0, 0, 0, time.UTC)},
		Model:    Model{ID: "claude-haiku-4-5-20251001", DisplayName: "Haiku 4.5"},
		Source:   "subscription",
	}
}

// TestAggregator_Current_BootStateIsUnknown covers REQ-7/D10: the aggregator starts
// unknown at construction — no hydration from persisted usage_sample rows.
func TestAggregator_Current_BootStateIsUnknown(t *testing.T) {
	st, _ := openTestStore(t)
	agg := newTestAggregator(st, nil)

	snap := agg.Current()

	assert.Nil(t, snap.FiveHour)
	assert.Nil(t, snap.SevenDay)
	assert.Nil(t, snap.Model)
	assert.Nil(t, snap.SampledAt)
	assert.Equal(t, defaultSource, snap.Source, "Source is the one field that is never null, matching the wire shape")
}

// TestAggregator_Record_FirstSamplePersistsAndBroadcasts covers REQ-5/REQ-6's happy
// path: a fresh sample updates in-memory state, persists exactly one row, and invokes
// OnChange once.
func TestAggregator_Record_FirstSamplePersistsAndBroadcasts(t *testing.T) {
	st, dbPath := openTestStore(t)
	var got []Snapshot
	agg := newTestAggregator(st, func(s Snapshot) { got = append(got, s) })

	require.NoError(t, agg.Record(context.Background(), fullSample(61, 23)))

	require.Len(t, got, 1)
	require.NotNil(t, got[0].FiveHour)
	assert.Equal(t, 61.0, got[0].FiveHour.UsedPct)
	require.NotNil(t, got[0].SevenDay)
	assert.Equal(t, 23.0, got[0].SevenDay.UsedPct)
	require.NotNil(t, got[0].Model)
	assert.Equal(t, "claude-haiku-4-5-20251001", got[0].Model.ID)
	require.NotNil(t, got[0].SampledAt)
	assert.False(t, got[0].SampledAt.IsZero(), "Record stamps SampledAt itself, ignoring any caller-supplied zero value")

	snap := agg.Current()
	assert.Equal(t, got[0].FiveHour, snap.FiveHour)
	assert.Equal(t, 1, countUsageSampleRows(t, dbPath))
}

// TestAggregator_Record_IdenticalBackToBackSamplesDedupToOneRowAndOneBroadcast covers
// D9/INV-5 directly: the ~435ms pair posts (canary-fields.md) carry identical bucket
// and model values and must collapse to one usage_sample row and one broadcast, not two.
func TestAggregator_Record_IdenticalBackToBackSamplesDedupToOneRowAndOneBroadcast(t *testing.T) {
	st, dbPath := openTestStore(t)
	var calls int
	agg := newTestAggregator(st, func(Snapshot) { calls++ })

	require.NoError(t, agg.Record(context.Background(), fullSample(61, 23)))
	firstSampledAt := agg.Current().SampledAt
	require.NotNil(t, firstSampledAt)

	require.NoError(t, agg.Record(context.Background(), fullSample(61, 23)))

	assert.Equal(t, 1, calls, "an identical back-to-back sample must not re-broadcast")
	assert.Equal(t, 1, countUsageSampleRows(t, dbPath), "an identical back-to-back sample must not persist a second row")

	secondSampledAt := agg.Current().SampledAt
	require.NotNil(t, secondSampledAt)
	assert.True(t, firstSampledAt.Equal(*secondSampledAt),
		"a deduped call must not even advance SampledAt — the dedup check runs before the in-memory state would be replaced")
}

// TestAggregator_Record_AThirdChangedSampleAfterTwoIdenticalOnesPersistsASecondRow is
// E6's exact scenario at the unit level: two identical posts, then a changed one.
func TestAggregator_Record_AThirdChangedSampleAfterTwoIdenticalOnesPersistsASecondRow(t *testing.T) {
	st, dbPath := openTestStore(t)
	var calls int
	agg := newTestAggregator(st, func(Snapshot) { calls++ })

	require.NoError(t, agg.Record(context.Background(), fullSample(61, 23)))
	require.NoError(t, agg.Record(context.Background(), fullSample(61, 23)))
	require.NoError(t, agg.Record(context.Background(), fullSample(65, 23)))

	assert.Equal(t, 2, calls)
	assert.Equal(t, 2, countUsageSampleRows(t, dbPath))
}

func TestAggregator_Record_ChangedFiveHourPctTriggersASecondSample(t *testing.T) {
	st, dbPath := openTestStore(t)
	var calls int
	agg := newTestAggregator(st, func(Snapshot) { calls++ })

	require.NoError(t, agg.Record(context.Background(), fullSample(61, 23)))
	require.NoError(t, agg.Record(context.Background(), fullSample(65, 23)))

	assert.Equal(t, 2, calls)
	assert.Equal(t, 2, countUsageSampleRows(t, dbPath))
	snap := agg.Current()
	require.NotNil(t, snap.FiveHour)
	assert.Equal(t, 65.0, snap.FiveHour.UsedPct)
}

func TestAggregator_Record_ChangedSevenDayPctTriggersASecondSample(t *testing.T) {
	st, dbPath := openTestStore(t)
	var calls int
	agg := newTestAggregator(st, func(Snapshot) { calls++ })

	require.NoError(t, agg.Record(context.Background(), fullSample(61, 23)))
	require.NoError(t, agg.Record(context.Background(), fullSample(61, 30)))

	assert.Equal(t, 2, calls)
	assert.Equal(t, 2, countUsageSampleRows(t, dbPath))
}

// TestAggregator_Record_ChangedResetsAtAloneTriggersASecondSample locks in the
// documented aggregator decision (daemon-implementation.md "Decisions"): a bucket
// rolling over to a new window is a real change even when its percentage is unchanged,
// unlike SampledAt which is display-only and deliberately excluded from the comparison.
func TestAggregator_Record_ChangedResetsAtAloneTriggersASecondSample(t *testing.T) {
	st, dbPath := openTestStore(t)
	var calls int
	agg := newTestAggregator(st, func(Snapshot) { calls++ })
	s1 := fullSample(61, 23)
	require.NoError(t, agg.Record(context.Background(), s1))

	s2 := fullSample(61, 23)
	s2.FiveHour.ResetsAt = s1.FiveHour.ResetsAt.Add(5 * time.Hour)
	require.NoError(t, agg.Record(context.Background(), s2))

	assert.Equal(t, 2, calls)
	assert.Equal(t, 2, countUsageSampleRows(t, dbPath))
}

func TestAggregator_Record_ChangedModelAloneTriggersASecondSample(t *testing.T) {
	st, dbPath := openTestStore(t)
	var calls int
	agg := newTestAggregator(st, func(Snapshot) { calls++ })
	require.NoError(t, agg.Record(context.Background(), fullSample(61, 23)))

	s2 := fullSample(61, 23)
	s2.Model = Model{ID: "claude-opus-5", DisplayName: "Opus 5"}
	require.NoError(t, agg.Record(context.Background(), s2))

	assert.Equal(t, 2, calls)
	assert.Equal(t, 2, countUsageSampleRows(t, dbPath))
	snap := agg.Current()
	require.NotNil(t, snap.Model)
	assert.Equal(t, "claude-opus-5", snap.Model.ID)
}

// TestAggregator_Record_SameDisplayNameChangedIDStillCountsAsAChange guards against a
// dedup comparison that only looked at one of Model's two fields.
func TestAggregator_Record_SameDisplayNameDifferentIDStillCountsAsAChange(t *testing.T) {
	st, dbPath := openTestStore(t)
	var calls int
	agg := newTestAggregator(st, func(Snapshot) { calls++ })
	require.NoError(t, agg.Record(context.Background(), fullSample(61, 23)))

	s2 := fullSample(61, 23)
	s2.Model = Model{ID: "claude-haiku-4-5-20251001-preview", DisplayName: "Haiku 4.5"}
	require.NoError(t, agg.Record(context.Background(), s2))

	assert.Equal(t, 2, calls)
	assert.Equal(t, 2, countUsageSampleRows(t, dbPath))
}

func TestAggregator_Record_SourceDefaultsToSubscriptionWhenCallerOmitsIt(t *testing.T) {
	st, _ := openTestStore(t)
	agg := newTestAggregator(st, nil)
	s := fullSample(61, 23)
	s.Source = ""

	require.NoError(t, agg.Record(context.Background(), s))

	assert.Equal(t, "subscription", agg.Current().Source)
}

// TestAggregator_Record_NilOnChangeDoesNotPanic mirrors session.Manager's own
// OnUpsert-nil-in-tests convention (plan Implementation Notes).
func TestAggregator_Record_NilOnChangeDoesNotPanic(t *testing.T) {
	st, _ := openTestStore(t)
	agg := newTestAggregator(st, nil)

	assert.NotPanics(t, func() {
		require.NoError(t, agg.Record(context.Background(), fullSample(61, 23)))
	})
}

// TestAggregator_Record_PersistsExactRowValues checks the persisted row's actual column
// values, not just the count — the store's own converted-forms contract (RFC3339 reset
// times, verbatim floats).
func TestAggregator_Record_PersistsExactRowValues(t *testing.T) {
	st, dbPath := openTestStore(t)
	agg := newTestAggregator(st, nil)
	s := fullSample(61, 23)

	require.NoError(t, agg.Record(context.Background(), s))

	db, err := sql.Open("sqlite", dbPath)
	require.NoError(t, err)
	defer func() { _ = db.Close() }()

	var modelID, modelDisplayName, fiveHourResetsAt, sevenDayResetsAt, source string
	var fiveHourPct, sevenDayPct float64
	require.NoError(t, db.QueryRow(`
		SELECT model_id, model_display_name, five_hour_pct, five_hour_resets_at,
		       seven_day_pct, seven_day_resets_at, source
		FROM usage_sample
	`).Scan(&modelID, &modelDisplayName, &fiveHourPct, &fiveHourResetsAt, &sevenDayPct, &sevenDayResetsAt, &source))

	assert.Equal(t, "claude-haiku-4-5-20251001", modelID)
	assert.Equal(t, "Haiku 4.5", modelDisplayName)
	assert.Equal(t, 61.0, fiveHourPct)
	assert.Equal(t, 23.0, sevenDayPct)
	assert.Equal(t, "2026-08-23T11:00:00Z", fiveHourResetsAt)
	assert.Equal(t, "2026-08-25T06:00:00Z", sevenDayResetsAt)
	assert.Equal(t, "subscription", source)
}

// TestAggregator_Record_PersistFailureLeavesMemoryUnchanged covers the m3 review
// cycle-2 Minor 4 ordering fix: a failed usage_sample write must leave Current()
// reporting the previous sample (snapshots never carry values that have no row), and
// must NOT advance the dedup state — the same values arriving again retry persistence
// instead of being silently deduped away forever.
func TestAggregator_Record_PersistFailureLeavesMemoryUnchanged(t *testing.T) {
	st, _ := openTestStore(t)
	broadcasts := 0
	agg := newTestAggregator(st, func(Snapshot) { broadcasts++ })

	first := fullSample(61, 23)
	require.NoError(t, agg.Record(context.Background(), first))
	require.Equal(t, 1, broadcasts)

	// Kill the store so the next insert fails.
	require.NoError(t, st.Close())

	second := fullSample(70, 30)
	err := agg.Record(context.Background(), second)
	require.Error(t, err, "a failed persist must be reported, not swallowed")
	assert.Equal(t, 1, broadcasts, "no broadcast for a sample that never persisted")

	cur := agg.Current()
	require.NotNil(t, cur.FiveHour)
	assert.Equal(t, 61.0, cur.FiveHour.UsedPct,
		"Current() must keep the last persisted sample, not the failed one")

	// The failed sample must not have advanced the dedup state: recording the same
	// values again attempts persistence again (and errors again on the dead store),
	// rather than being deduped into a silent nil.
	err = agg.Record(context.Background(), fullSample(70, 30))
	require.Error(t, err, "retry of an unpersisted sample must not be deduped away")
}
