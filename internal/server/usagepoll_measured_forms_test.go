package server

import (
	"context"
	"database/sql"
	"path/filepath"
	"sync/atomic"
	"testing"
	"time"

	"github.com/rs/zerolog"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/Zalaras/muster/internal/claudecode"
	"github.com/Zalaras/muster/internal/claudecode/claudecodetest"
	"github.com/Zalaras/muster/internal/store"
	"github.com/Zalaras/muster/internal/usage"
)

// measuredWindow is one pair of rate-limit windows, stated by each source in the form it
// measured live: the status line as epoch whole seconds with float-noisy percentages, the
// usage call as RFC3339 with microseconds a hair before the same boundary, utilization exact.
type measuredWindow struct {
	five, seven time.Time
}

func (w measuredWindow) statusBody() string {
	return claudecodetest.RawStatusLineFull("measured-forms", claudecodetest.StatusLineFullOpts{
		FiveHourPct: 14.000000000000002, FiveHourResetsAt: w.five.Unix(),
		SevenDayPct: 30.000000000000004, SevenDayResetsAt: w.seven.Unix(),
	})
}

func (w measuredWindow) callBody() string {
	micros := func(t time.Time) string {
		return t.Add(-477725*time.Microsecond).UTC().Format("2006-01-02T15:04:05.000000") + "+00:00"
	}
	return bucketsBody(
		&claudecodetest.UsageBucketOpt{Percent: 14, ResetsAt: micros(w.five)},
		&claudecodetest.UsageBucketOpt{Percent: 30, ResetsAt: micros(w.seven)})
}

// measuredForms drives the status line through claudecode.InterpretStatus and the usage call
// through the real poller (stub endpoint, claudecode.InterpretUsageReport) into one Aggregator
// on one store, counting its broadcasts and rows.
type measuredForms struct {
	t      *testing.T
	agg    *usage.Aggregator
	poller *usagePoller
	stub   *usageAPIStub
	db     *sql.DB
	events atomic.Int32
}

func newMeasuredForms(t *testing.T) *measuredForms {
	t.Helper()
	m := &measuredForms{t: t}
	dbPath := filepath.Join(t.TempDir(), "muster.db")
	st, err := store.Open(context.Background(), dbPath, zerolog.Nop())
	require.NoError(t, err)
	t.Cleanup(func() { _ = st.Close() })
	m.db, err = sql.Open("sqlite", dbPath)
	require.NoError(t, err)
	t.Cleanup(func() { _ = m.db.Close() })
	m.agg = usage.NewAggregator(usage.Config{Store: st, Logger: zerolog.Nop(), OnChange: func(usage.Snapshot) { m.events.Add(1) }})
	ms := usage.NewModelScoped(usage.ModelScopedConfig{Store: st, Logger: zerolog.Nop()})
	m.stub = newUsageAPIStub("success")
	t.Cleanup(m.stub.Close)
	m.poller = newUsagePoller(m.stub.srv.Client(), m.stub.srv.URL, fakeTokenReader(alwaysOKTokenReader), time.Hour, m.agg, ms, zerolog.Nop())
	return m
}

func (m *measuredForms) status(w measuredWindow) {
	m.t.Helper()
	acct := claudecode.InterpretStatus([]byte(w.statusBody())).Account
	require.NotNil(m.t, acct)
	require.NoError(m.t, m.agg.Record(context.Background(), usage.Sample{
		FiveHour: toUsageBucket(acct.FiveHour),
		SevenDay: toUsageBucket(acct.SevenDay),
		Model:    usage.Model{ID: acct.Model.ID, DisplayName: acct.Model.DisplayName},
	}))
}

func (m *measuredForms) call(w measuredWindow) {
	m.t.Helper()
	m.stub.setBody(w.callBody())
	m.poller.tick(context.Background())
}

func (m *measuredForms) rows() int {
	m.t.Helper()
	var n int
	require.NoError(m.t, m.db.QueryRow(`SELECT COUNT(*) FROM usage_sample`).Scan(&n))
	return n
}

// TestMeasuredForms_OneWindowFromBothSourcesIsOneChange covers D8/REQ-9 on the real data: a
// window offered once by each source in its measured form (epoch seconds and float noise
// against RFC3339 micros and an exact value) is one reset instant and one value, so the
// second arrival sends no `usage` message and writes no row, in both orders, and the
// snapshot shows the one whole-second reset. A different window afterwards still adopts.
func TestMeasuredForms_OneWindowFromBothSourcesIsOneChange(t *testing.T) {
	old := measuredWindow{
		five:  time.Date(2099, 1, 1, 8, 40, 0, 0, time.UTC),
		seven: time.Date(2099, 1, 3, 7, 0, 0, 0, time.UTC),
	}
	next := measuredWindow{
		five:  time.Date(2099, 1, 1, 13, 40, 0, 0, time.UTC),
		seven: time.Date(2099, 1, 5, 7, 0, 0, 0, time.UTC),
	}
	orders := []struct {
		name          string
		first, second func(*measuredForms, measuredWindow)
	}{
		{"status then call", (*measuredForms).status, (*measuredForms).call},
		{"call then status", (*measuredForms).call, (*measuredForms).status},
	}
	for _, o := range orders {
		t.Run(o.name, func(t *testing.T) {
			m := newMeasuredForms(t)
			m.status(old)
			o.first(m, next)
			events, rows := m.events.Load(), m.rows()
			require.Equal(t, int32(2), events, "the old window, then the new one adopted from the first source")

			o.second(m, next)

			assert.Equal(t, events, m.events.Load(), "the same window from the second source sends no `usage` message")
			assert.Equal(t, rows, m.rows(), "and writes no row")
			snap := m.agg.Current()
			require.NotNil(t, snap.FiveHour)
			require.NotNil(t, snap.SevenDay)
			assert.True(t, next.five.Equal(snap.FiveHour.ResetsAt), "one five_hour reset: %v", snap.FiveHour.ResetsAt)
			assert.True(t, next.seven.Equal(snap.SevenDay.ResetsAt), "one seven_day reset: %v", snap.SevenDay.ResetsAt)
			assert.InDelta(t, 14, snap.FiveHour.UsedPct, 1e-9)
			assert.InDelta(t, 30, snap.SevenDay.UsedPct, 1e-9)

			third := measuredWindow{five: next.five.Add(5 * time.Hour), seven: next.seven}
			o.second(m, third)
			assert.Equal(t, events+1, m.events.Load(), "a genuinely new window still adopts")
		})
	}
}
