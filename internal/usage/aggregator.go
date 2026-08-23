package usage

import (
	"context"
	"fmt"
	"sync"
	"time"

	"github.com/rs/zerolog"

	"github.com/Zalaras/muster/internal/store"
)

// defaultSource is the only source in v1 (the SPEC §9.6 seam: "api"/"otel" later).
const defaultSource = "subscription"

// Config wires an Aggregator. OnChange broadcasts the `usage` WS message; nil in tests.
type Config struct {
	Store    *store.Store
	Logger   zerolog.Logger
	OnChange func(Snapshot)
}

// Aggregator holds the daemon's single, account-global usage reading in memory
// (REQ-5/6/7). It starts unknown at construction — no hydration from persisted
// usage_sample rows across a daemon restart (decided 2026-08-23, plan Overview).
type Aggregator struct {
	store    *store.Store
	log      zerolog.Logger
	onChange func(Snapshot)

	mu      sync.Mutex
	current *Sample
}

// NewAggregator builds an Aggregator. Nothing here does I/O until Record is called.
func NewAggregator(cfg Config) *Aggregator {
	return &Aggregator{store: cfg.Store, log: cfg.Logger, onChange: cfg.OnChange}
}

// Record applies one new sample: updates in-memory state, persists a usage_sample row,
// and invokes OnChange — but only when the bucket values or model changed since the last
// recorded sample (REQ-5, INV-5). sampledAt advancing alone is never a change, which is
// why it's stamped here rather than accepted from the caller: the ~435 ms pair posts
// (canary-fields.md) carry identical bucket/model values and must collapse to one
// broadcast and one row, not two.
func (a *Aggregator) Record(ctx context.Context, s Sample) error {
	s.SampledAt = time.Now().UTC()
	if s.Source == "" {
		s.Source = defaultSource
	}

	a.mu.Lock()
	if a.current != nil && unchanged(*a.current, s) {
		a.mu.Unlock()
		a.log.Debug().Msg("usage sample unchanged, skipping persist and broadcast")
		return nil
	}
	a.mu.Unlock()

	// Persist BEFORE the in-memory commit: if the row write fails, Current() must keep
	// reporting the previous sample, so snapshots never carry values that have no row —
	// and because a.current has not advanced, the next post with the same values retries
	// persistence instead of being deduped away (m3 review cycle-2 Minor 4). Dropping the
	// lock across the write is safe: Record only ever runs on the single ingest worker
	// goroutine (R4), so no second Record can interleave — the mutex guards Current()
	// readers on other goroutines.
	if err := a.store.InsertUsageSample(ctx, store.UsageSampleRow{
		ModelID:          s.Model.ID,
		ModelDisplayName: s.Model.DisplayName,
		FiveHourPct:      s.FiveHour.UsedPct,
		FiveHourResetsAt: s.FiveHour.ResetsAt,
		SevenDayPct:      s.SevenDay.UsedPct,
		SevenDayResetsAt: s.SevenDay.ResetsAt,
		Source:           s.Source,
	}); err != nil {
		a.log.Error().Err(err).Msg("persisting usage sample failed")
		return fmt.Errorf("persisting usage sample: %w", err)
	}

	a.mu.Lock()
	a.current = &s
	snap := a.snapshotLocked()
	a.mu.Unlock()

	if a.onChange != nil {
		a.onChange(snap)
	}
	return nil
}

// Current returns the aggregator's present snapshot — GET /api/state and the WS `hello`
// handshake's snapshot both read this.
func (a *Aggregator) Current() Snapshot {
	a.mu.Lock()
	defer a.mu.Unlock()
	return a.snapshotLocked()
}

func (a *Aggregator) snapshotLocked() Snapshot {
	if a.current == nil {
		return Snapshot{Source: defaultSource}
	}
	fiveHour, sevenDay, model, sampledAt := a.current.FiveHour, a.current.SevenDay, a.current.Model, a.current.SampledAt
	return Snapshot{
		FiveHour:  &fiveHour,
		SevenDay:  &sevenDay,
		Model:     &model,
		SampledAt: &sampledAt,
		Source:    a.current.Source,
	}
}

// unchanged reports whether next carries the same bucket values and model as prev —
// the value-level de-dup REQ-5 requires (sampledAt is deliberately excluded).
func unchanged(prev, next Sample) bool {
	return prev.FiveHour.UsedPct == next.FiveHour.UsedPct &&
		prev.FiveHour.ResetsAt.Equal(next.FiveHour.ResetsAt) &&
		prev.SevenDay.UsedPct == next.SevenDay.UsedPct &&
		prev.SevenDay.ResetsAt.Equal(next.SevenDay.ResetsAt) &&
		prev.Model == next.Model
}
