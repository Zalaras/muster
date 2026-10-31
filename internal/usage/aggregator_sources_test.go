package usage

import (
	"context"
	"database/sql"
	"sync"
	"testing"
	"time"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// usageRow is one usage_sample row as the aggregator persisted it.
type usageRow struct {
	modelID, modelDisplayName, source string
	fiveHourPct, sevenDayPct          float64
	fiveHourResetsAt, sevenDayResetAt string
}

func readUsageRows(t *testing.T, dbPath string) []usageRow {
	t.Helper()
	db, err := sql.Open("sqlite", dbPath)
	require.NoError(t, err)
	defer func() { _ = db.Close() }()
	rows, err := db.Query(`
		SELECT model_id, model_display_name, source, five_hour_pct, seven_day_pct,
		       five_hour_resets_at, seven_day_resets_at
		FROM usage_sample ORDER BY id`)
	require.NoError(t, err)
	defer func() { _ = rows.Close() }()
	var out []usageRow
	for rows.Next() {
		var r usageRow
		require.NoError(t, rows.Scan(&r.modelID, &r.modelDisplayName, &r.source, &r.fiveHourPct, &r.sevenDayPct, &r.fiveHourResetsAt, &r.sevenDayResetAt))
		out = append(out, r)
	}
	require.NoError(t, rows.Err())
	return out
}

func ahead(d time.Duration) time.Time { return time.Now().UTC().Add(d).Truncate(time.Second) }

func bucketAhead(pct float64, d time.Duration) *Bucket {
	return &Bucket{UsedPct: pct, ResetsAt: ahead(d)}
}

// recorder counts broadcasts the way the server's OnChange does.
type recorder struct {
	mu    sync.Mutex
	snaps []Snapshot
}

func (r *recorder) onChange(s Snapshot) {
	r.mu.Lock()
	defer r.mu.Unlock()
	r.snaps = append(r.snaps, s)
}

func (r *recorder) count() int {
	r.mu.Lock()
	defer r.mu.Unlock()
	return len(r.snaps)
}

// arrivalSource is one of the two writers, offering both buckets at once.
type arrivalSource struct {
	name  string
	offer func(a *Aggregator, five, seven *Bucket) error
}

var bothSources = []arrivalSource{
	{"status", func(a *Aggregator, five, seven *Bucket) error {
		return a.Record(context.Background(), Sample{FiveHour: *five, SevenDay: *seven, Model: Model{ID: "m1", DisplayName: "M1"}})
	}},
	{"call", func(a *Aggregator, five, seven *Bucket) error {
		return a.RecordFetch(context.Background(), five, seven)
	}},
}

// seedState brings an aggregator to one of the three starting states a past-reset arrival crosses.
func seedState(t *testing.T, a *Aggregator, state string) {
	t.Helper()
	switch state {
	case "none":
	case "status value":
		require.NoError(t, bothSources[0].offer(a, bucketAhead(10, time.Hour), bucketAhead(20, 48*time.Hour)))
	case "call value":
		require.NoError(t, bothSources[1].offer(a, bucketAhead(11, time.Hour), bucketAhead(21, 48*time.Hour)))
	default:
		t.Fatalf("unknown state %q", state)
	}
}

var startStates = []string{"none", "status value", "call value"}

func assertNoBucketPastReset(t *testing.T, snap Snapshot, since time.Time) {
	t.Helper()
	for name, b := range map[string]*Bucket{"fiveHour": snap.FiveHour, "sevenDay": snap.SevenDay} {
		if b != nil {
			assert.True(t, b.ResetsAt.After(since), "%s holds a value already past its reset: %v", name, b.ResetsAt)
		}
	}
}

// TestAggregator_PastResetNeverAdopted checks from every starting state, for
// both writers as the arriving one and each bucket as the stale one: the refused bucket
// keeps what it held (nil from none), the other bucket still adopts its fresh value.
func TestAggregator_PastResetNeverAdopted(t *testing.T) {
	staleResets := map[string]time.Duration{"an hour past": -time.Hour, "just past": -time.Second, "now": 0}
	for _, state := range startStates {
		for _, src := range bothSources {
			for staleName, off := range staleResets {
				for _, stale := range []string{"fiveHour", "sevenDay"} {
					t.Run(state+"/"+src.name+"/"+stale+"/"+staleName, func(t *testing.T) {
						t.Parallel()
						st, _ := openTestStore(t)
						agg := newTestAggregator(st, nil)
						seedState(t, agg, state)
						before := agg.Current()
						arrival := time.Now().UTC()

						fresh := bucketAhead(77, 3*time.Hour)
						staleBucket := &Bucket{UsedPct: 100, ResetsAt: arrival.Add(off)}
						five, seven := fresh, staleBucket
						beforeStale := before.SevenDay
						if stale == "fiveHour" {
							five, seven = staleBucket, fresh
							beforeStale = before.FiveHour
						}
						require.NoError(t, src.offer(agg, five, seven))

						after := agg.Current()
						gotStale, gotFresh := after.SevenDay, after.FiveHour
						if stale == "fiveHour" {
							gotStale, gotFresh = after.FiveHour, after.SevenDay
						}
						assert.Equal(t, beforeStale, gotStale, "a past-reset value must leave the bucket as it was")
						require.NotNil(t, gotFresh)
						assert.Equal(t, 77.0, gotFresh.UsedPct, "the other bucket still adopts its fresh value")
						assertNoBucketPastReset(t, after, arrival)
					})
				}
			}
		}
	}
}

// TestAggregator_AllPastArrivalIsInert covers the case where nothing in the arrival is
// adoptable: no state change, no broadcast, no row, from every starting state and both writers.
func TestAggregator_AllPastArrivalIsInert(t *testing.T) {
	for _, state := range startStates {
		for _, src := range bothSources {
			t.Run(state+"/"+src.name, func(t *testing.T) {
				t.Parallel()
				st, dbPath := openTestStore(t)
				rec := &recorder{}
				agg := newTestAggregator(st, rec.onChange)
				seedState(t, agg, state)
				before, broadcasts, rows := agg.Current(), rec.count(), countUsageSampleRows(t, dbPath)

				past := time.Now().UTC().Add(-time.Hour)
				require.NoError(t, src.offer(agg, &Bucket{UsedPct: 100, ResetsAt: past}, &Bucket{UsedPct: 100, ResetsAt: past}))

				after := agg.Current()
				assert.Equal(t, before.FiveHour, after.FiveHour)
				assert.Equal(t, before.SevenDay, after.SevenDay)
				wantEvents := 0
				if src.name == "status" && state == "call value" {
					wantEvents = 1 // the status line's model is first seen here, a change in its own right
				} else {
					assert.Equal(t, before.SampledAt, after.SampledAt)
				}
				assert.Equal(t, broadcasts+wantEvents, rec.count(), "nothing adopted means nothing broadcast")
				assert.Equal(t, rows+wantEvents, countUsageSampleRows(t, dbPath), "nothing adopted means no row")
			})
		}
	}
}

// TestAggregator_NewestArrivalWinsPerBucket: whichever source arrived last
// owns each bucket, in both orders, independently per bucket.
func TestAggregator_NewestArrivalWinsPerBucket(t *testing.T) {
	cases := []struct {
		name                    string
		first, last             arrivalSource
		wantFive, wantSeven     float64
		lastOffers, firstOffers [2]float64
	}{
		{name: "call after status", first: bothSources[0], last: bothSources[1], firstOffers: [2]float64{10, 20}, lastOffers: [2]float64{30, 40}, wantFive: 30, wantSeven: 40},
		{name: "status after call", first: bothSources[1], last: bothSources[0], firstOffers: [2]float64{10, 20}, lastOffers: [2]float64{30, 40}, wantFive: 30, wantSeven: 40},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			st, _ := openTestStore(t)
			agg := newTestAggregator(st, nil)
			require.NoError(t, tc.first.offer(agg, bucketAhead(tc.firstOffers[0], time.Hour), bucketAhead(tc.firstOffers[1], 48*time.Hour)))
			require.NoError(t, tc.last.offer(agg, bucketAhead(tc.lastOffers[0], 2*time.Hour), bucketAhead(tc.lastOffers[1], 72*time.Hour)))

			snap := agg.Current()
			require.NotNil(t, snap.FiveHour)
			require.NotNil(t, snap.SevenDay)
			assert.Equal(t, tc.wantFive, snap.FiveHour.UsedPct)
			assert.Equal(t, tc.wantSeven, snap.SevenDay.UsedPct)
		})
	}

	t.Run("a one-bucket call leaves the other bucket from the status line", func(t *testing.T) {
		st, _ := openTestStore(t)
		agg := newTestAggregator(st, nil)
		require.NoError(t, bothSources[0].offer(agg, bucketAhead(10, time.Hour), bucketAhead(20, 48*time.Hour)))

		require.NoError(t, agg.RecordFetch(context.Background(), bucketAhead(55, 2*time.Hour), nil))

		snap := agg.Current()
		assert.Equal(t, 55.0, snap.FiveHour.UsedPct)
		assert.Equal(t, 20.0, snap.SevenDay.UsedPct)
	})
	t.Run("a one-bucket call for the seven-day leaves the five-hour", func(t *testing.T) {
		st, _ := openTestStore(t)
		agg := newTestAggregator(st, nil)
		require.NoError(t, bothSources[0].offer(agg, bucketAhead(10, time.Hour), bucketAhead(20, 48*time.Hour)))

		require.NoError(t, agg.RecordFetch(context.Background(), nil, bucketAhead(66, 72*time.Hour)))

		snap := agg.Current()
		assert.Equal(t, 10.0, snap.FiveHour.UsedPct)
		assert.Equal(t, 66.0, snap.SevenDay.UsedPct)
	})
}

// TestAggregator_RecordFetch_OneBucketOnlyWritesNoRowUntilBothKnown checks.
func TestAggregator_RecordFetch_OneBucketOnlyWritesNoRowUntilBothKnown(t *testing.T) {
	st, dbPath := openTestStore(t)
	rec := &recorder{}
	agg := newTestAggregator(st, rec.onChange)

	require.NoError(t, agg.RecordFetch(context.Background(), bucketAhead(40, time.Hour), nil))

	snap := agg.Current()
	require.NotNil(t, snap.FiveHour)
	assert.Equal(t, 40.0, snap.FiveHour.UsedPct)
	assert.Nil(t, snap.SevenDay, "the bucket the call did not carry stays unknown")
	assert.NotNil(t, snap.SampledAt, "SampledAt is non-nil once either bucket is known")
	assert.Equal(t, 1, rec.count(), "the adopted bucket is broadcast")
	assert.Zero(t, countUsageSampleRows(t, dbPath), "no row while the other bucket has never been known")

	require.NoError(t, agg.RecordFetch(context.Background(), nil, bucketAhead(25, 48*time.Hour)))

	assert.Equal(t, 1, countUsageSampleRows(t, dbPath), "the first moment both are known writes a row")
	assert.Equal(t, 2, rec.count())

	require.NoError(t, agg.RecordFetch(context.Background(), bucketAhead(41, time.Hour), nil))
	assert.Equal(t, 2, countUsageSampleRows(t, dbPath), "a one-bucket change with both known writes a row")
}

// TestAggregator_RecordFetch_NothingToOfferIsInert covers a call whose response carried
// neither window (the missing/null cases): no state, broadcast or row.
func TestAggregator_RecordFetch_NothingToOfferIsInert(t *testing.T) {
	st, dbPath := openTestStore(t)
	rec := &recorder{}
	agg := newTestAggregator(st, rec.onChange)

	require.NoError(t, agg.RecordFetch(context.Background(), nil, nil))

	snap := agg.Current()
	assert.Nil(t, snap.FiveHour)
	assert.Nil(t, snap.SevenDay)
	assert.Nil(t, snap.SampledAt, "SampledAt is nil iff both buckets are nil")
	assert.Zero(t, rec.count())
	assert.Zero(t, countUsageSampleRows(t, dbPath))
}

// TestAggregator_IdenticalValuesFromSecondSourceAreDeduped checks, both orders.
// A status post after a call is the status line's first sighting of its model, which is a
// change in its own right, so that order first lets the model arrive and then repeats.
func TestAggregator_IdenticalValuesFromSecondSourceAreDeduped(t *testing.T) {
	cases := []struct {
		name    string
		seed    []arrivalSource
		repeats arrivalSource
		events  int
	}{
		{"call repeats status", []arrivalSource{bothSources[0]}, bothSources[1], 1},
		{"status repeats call", []arrivalSource{bothSources[1], bothSources[0]}, bothSources[0], 2},
		{"call repeats call after status", []arrivalSource{bothSources[1], bothSources[0]}, bothSources[1], 2},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			st, dbPath := openTestStore(t)
			rec := &recorder{}
			agg := newTestAggregator(st, rec.onChange)
			five, seven := bucketAhead(61, time.Hour), bucketAhead(23, 48*time.Hour)
			for _, src := range tc.seed {
				require.NoError(t, src.offer(agg, five, seven))
			}
			seededAt := agg.Current().SampledAt
			require.Equal(t, tc.events, rec.count())

			require.NoError(t, tc.repeats.offer(agg, five, seven))

			assert.Equal(t, tc.events, rec.count(), "no `usage` message for identical values")
			assert.Equal(t, tc.events, countUsageSampleRows(t, dbPath), "no row for identical values")
			assert.True(t, seededAt.Equal(*agg.Current().SampledAt), "a deduped arrival does not advance SampledAt")
		})
	}
}

// TestAggregator_PercentTolerance_FloatNoiseDedupsRealChangeAdopts covers the value
// comparison (usedPctTolerance, 1e-9 absolute): the status line's float noise (14 stated as
// 14.000000000000002) is the same value as the call's 14, a change beyond the tolerance is
// not, and a reset instant is never fuzzy. Crossed with both orders and each bucket
// carrying the difference, so neither bucket's comparison is the convenient one.
func TestAggregator_PercentTolerance_FloatNoiseDedupsRealChangeAdopts(t *testing.T) {
	deltas := []struct {
		name   string
		delta  float64
		reset  time.Duration
		dedups bool
	}{
		{"identical", 0, 0, true},
		{"float noise", 14.000000000000002 - 14, 0, true},
		{"inside the tolerance", 5e-10, 0, true},
		{"negative inside the tolerance", -5e-10, 0, true},
		{"just beyond the tolerance", 2e-9, 0, false},
		{"a real change", 0.01, 0, false},
		{"same value, reset one nanosecond later", 0, time.Nanosecond, false},
		{"float noise but reset a second later", 14.000000000000002 - 14, time.Second, false},
	}
	for _, d := range deltas {
		for _, order := range [][2]int{{0, 1}, {1, 0}} {
			for _, bucket := range []string{"fiveHour", "sevenDay"} {
				name := d.name + "/" + bothSources[order[0]].name + " then " + bothSources[order[1]].name + "/" + bucket
				t.Run(name, func(t *testing.T) {
					st, dbPath := openTestStore(t)
					rec := &recorder{}
					agg := newTestAggregator(st, rec.onChange)
					five, seven := bucketAhead(14, time.Hour), bucketAhead(30, 48*time.Hour)
					first := bothSources[order[0]]
					second := bothSources[order[1]]
					require.NoError(t, first.offer(agg, five, seven))
					require.NoError(t, bothSources[0].offer(agg, five, seven), "the status line's model arrives once, outside the comparison")
					settled, rows := rec.count(), len(readUsageRows(t, dbPath))

					nextFive, nextSeven := *five, *seven
					target := &nextFive
					if bucket == "sevenDay" {
						target = &nextSeven
					}
					target.UsedPct += d.delta
					target.ResetsAt = target.ResetsAt.Add(d.reset)
					require.NoError(t, second.offer(agg, &nextFive, &nextSeven))

					if d.dedups {
						assert.Equal(t, settled, rec.count(), "no `usage` message")
						assert.Len(t, readUsageRows(t, dbPath), rows, "no row")
						return
					}
					assert.Equal(t, settled+1, rec.count(), "one `usage` message for the change")
					assert.Len(t, readUsageRows(t, dbPath), rows+1, "one row for the change")
				})
			}
		}
	}
}

// TestAggregator_RecordFetch_RowCarriesSourceAndModel checks.
func TestAggregator_RecordFetch_RowCarriesSourceAndModel(t *testing.T) {
	t.Run("no status-line model known yet", func(t *testing.T) {
		st, dbPath := openTestStore(t)
		agg := newTestAggregator(st, nil)

		require.NoError(t, agg.RecordFetch(context.Background(), bucketAhead(40, time.Hour), bucketAhead(25, 48*time.Hour)))

		rows := readUsageRows(t, dbPath)
		require.Len(t, rows, 1)
		assert.Equal(t, "subscription-api", rows[0].source)
		assert.Empty(t, rows[0].modelID)
		assert.Empty(t, rows[0].modelDisplayName)
		assert.Equal(t, 40.0, rows[0].fiveHourPct)
		assert.Equal(t, 25.0, rows[0].sevenDayPct)
		assert.Equal(t, "subscription", agg.Current().Source, "the wire source stays subscription for every snapshot")
	})

	t.Run("carries the last status-line model and status rows keep their source", func(t *testing.T) {
		st, dbPath := openTestStore(t)
		agg := newTestAggregator(st, nil)
		s := fullSample(10, 20)
		require.NoError(t, agg.Record(context.Background(), s))

		require.NoError(t, agg.RecordFetch(context.Background(), bucketAhead(40, time.Hour), bucketAhead(25, 48*time.Hour)))

		rows := readUsageRows(t, dbPath)
		require.Len(t, rows, 2)
		assert.Equal(t, "subscription", rows[0].source)
		assert.Equal(t, "subscription-api", rows[1].source)
		assert.Equal(t, s.Model.ID, rows[1].modelID)
		assert.Equal(t, s.Model.DisplayName, rows[1].modelDisplayName)
	})
}

// TestAggregator_RecordFetch_PersistFailureLeavesMemoryUnchanged mirrors the status-line
// ordering guarantee for the second writer: no row, no state, no broadcast.
func TestAggregator_RecordFetch_PersistFailureLeavesMemoryUnchanged(t *testing.T) {
	st, _ := openTestStore(t)
	rec := &recorder{}
	agg := newTestAggregator(st, rec.onChange)
	require.NoError(t, agg.RecordFetch(context.Background(), bucketAhead(40, time.Hour), bucketAhead(25, 48*time.Hour)))
	before := agg.Current()
	require.NoError(t, st.Close())

	err := agg.RecordFetch(context.Background(), bucketAhead(50, time.Hour), nil)

	require.Error(t, err)
	assert.Equal(t, before.FiveHour, agg.Current().FiveHour)
	assert.Equal(t, 1, rec.count())
}

// TestAggregator_ConcurrentWritersLoseNothingAndRowsMatchBroadcasts: the
// ingest worker (Record) and the poller goroutine (RecordFetch) write at once; with every
// arrival carrying distinct values, every one must be broadcast and persisted, each row
// must equal the snapshot broadcast with it, and the final state is the last broadcast.
// Run under -race.
func TestAggregator_ConcurrentWritersLoseNothingAndRowsMatchBroadcasts(t *testing.T) {
	const perWriter = 20
	st, dbPath := openTestStore(t)
	rec := &recorder{}
	agg := newTestAggregator(st, rec.onChange)
	fiveReset, sevenReset := ahead(time.Hour), ahead(48*time.Hour)
	model := Model{ID: "m1", DisplayName: "M1"}

	var wg sync.WaitGroup
	for i := range perWriter {
		wg.Add(2)
		go func() {
			defer wg.Done()
			s := Sample{FiveHour: Bucket{UsedPct: float64(i), ResetsAt: fiveReset}, SevenDay: Bucket{UsedPct: float64(i), ResetsAt: sevenReset}, Model: model}
			assert.NoError(t, agg.Record(context.Background(), s))
		}()
		go func() {
			defer wg.Done()
			five := &Bucket{UsedPct: float64(1000 + i), ResetsAt: fiveReset}
			seven := &Bucket{UsedPct: float64(1000 + i), ResetsAt: sevenReset}
			assert.NoError(t, agg.RecordFetch(context.Background(), five, seven))
		}()
	}
	wg.Wait()

	rows := readUsageRows(t, dbPath)
	rec.mu.Lock()
	defer rec.mu.Unlock()
	require.Len(t, rec.snaps, 2*perWriter, "no adopted value lost: one broadcast per distinct arrival")
	require.Len(t, rows, len(rec.snaps), "one row per broadcast")
	for i, snap := range rec.snaps {
		assert.Equal(t, snap.FiveHour.UsedPct, rows[i].fiveHourPct, "row %d matches the snapshot broadcast with it", i)
		assert.Equal(t, snap.SevenDay.UsedPct, rows[i].sevenDayPct, "row %d matches the snapshot broadcast with it", i)
	}
	last := rec.snaps[len(rec.snaps)-1]
	cur := agg.Current()
	assert.Equal(t, last.FiveHour, cur.FiveHour)
	assert.Equal(t, last.SevenDay, cur.SevenDay)
}
