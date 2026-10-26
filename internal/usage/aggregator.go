package usage

import (
	"context"
	"fmt"
	"math"
	"sync"
	"time"

	"github.com/rs/zerolog"

	"github.com/Zalaras/muster/internal/store"
)

// defaultSource is the only source in v1 (the kb:adr/usage-no-source-interface seam: "api"/"otel" later).
const defaultSource = "subscription"

// DefaultSource exposes defaultSource for internal/server's emptyUsageInfo placeholder —
// the one caller outside this package that needs the same default, so it reads this
// instead of keeping its own copy of the literal.
const DefaultSource = defaultSource

const fetchSource = defaultModelScopedSource

// Config wires an Aggregator. OnChange broadcasts the `usage` WS message; nil in tests.
type Config struct {
	Store    *store.Store
	Logger   zerolog.Logger
	OnChange func(Snapshot)
}

type Aggregator struct {
	store    *store.Store
	log      zerolog.Logger
	onChange func(Snapshot)

	writeMu sync.Mutex

	mu   sync.Mutex
	snap Snapshot
}

// NewAggregator builds an Aggregator. Nothing here does I/O until Record is called.
func NewAggregator(cfg Config) *Aggregator {
	return &Aggregator{store: cfg.Store, log: cfg.Logger, onChange: cfg.OnChange, snap: Snapshot{Source: defaultSource}}
}

func (a *Aggregator) Record(ctx context.Context, s Sample) error {
	if s.Source == "" {
		s.Source = defaultSource
	}
	return a.adopt(ctx, &s.FiveHour, &s.SevenDay, &s.Model, s.Source)
}

func (a *Aggregator) RecordFetch(ctx context.Context, fiveHour, sevenDay *Bucket) error {
	return a.adopt(ctx, fiveHour, sevenDay, nil, fetchSource)
}

func (a *Aggregator) adopt(ctx context.Context, fiveHour, sevenDay *Bucket, model *Model, source string) error {
	a.writeMu.Lock()
	defer a.writeMu.Unlock()

	now := time.Now().UTC()
	prev := a.snap
	next := prev
	next.FiveHour = adoptBucket(prev.FiveHour, fiveHour, now)
	next.SevenDay = adoptBucket(prev.SevenDay, sevenDay, now)
	modelChanged := model != nil && (prev.Model == nil || *prev.Model != *model)
	if modelChanged {
		next.Model = model
	}

	if !modelChanged && sameBucket(prev.FiveHour, next.FiveHour) && sameBucket(prev.SevenDay, next.SevenDay) {
		a.log.Debug().Msg("usage sample unchanged, skipping persist and broadcast")
		return nil
	}
	if next.FiveHour != nil || next.SevenDay != nil {
		next.SampledAt = &now
	}

	if next.FiveHour != nil && next.SevenDay != nil {
		var rowModel Model
		if next.Model != nil {
			rowModel = *next.Model
		}
		if err := a.store.InsertUsageSample(ctx, store.UsageSampleRow{
			ModelID:          rowModel.ID,
			ModelDisplayName: rowModel.DisplayName,
			FiveHourPct:      next.FiveHour.UsedPct,
			FiveHourResetsAt: next.FiveHour.ResetsAt,
			SevenDayPct:      next.SevenDay.UsedPct,
			SevenDayResetsAt: next.SevenDay.ResetsAt,
			Source:           source,
		}); err != nil {
			a.log.Error().Err(err).Msg("persisting usage sample failed")
			return fmt.Errorf("persisting usage sample: %w", err)
		}
	}

	a.mu.Lock()
	a.snap = next
	a.mu.Unlock()

	if a.onChange != nil && next.SampledAt != nil {
		a.onChange(next)
	}
	return nil
}

// Current returns the aggregator's present snapshot — GET /api/state and the WS `hello`
// handshake's snapshot both read this.
func (a *Aggregator) Current() Snapshot {
	a.mu.Lock()
	defer a.mu.Unlock()
	return a.snap
}

func adoptBucket(current, offered *Bucket, now time.Time) *Bucket {
	if offered == nil || !offered.ResetsAt.After(now) {
		return current
	}
	adopted := *offered
	return &adopted
}

const usedPctTolerance = 1e-9

func sameBucket(a, b *Bucket) bool {
	if a == nil || b == nil {
		return a == b
	}
	return math.Abs(a.UsedPct-b.UsedPct) <= usedPctTolerance && a.ResetsAt.Equal(b.ResetsAt)
}
