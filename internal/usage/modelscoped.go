package usage

import (
	"context"
	"fmt"
	"sort"
	"sync"
	"time"

	"github.com/rs/zerolog"

	"github.com/Zalaras/muster/internal/store"
)

// defaultModelScopedSource is the only source in v1 for the per-model weekly windows —
// constant on the wire (kb:anchor/ws.usage modelScopedSource).
const defaultModelScopedSource = "subscription-api"

// ModelScopedConfig wires a ModelScoped. OnChange broadcasts the merged `usage` WS
// message; nil in tests.
type ModelScopedConfig struct {
	Store    *store.Store
	Logger   zerolog.Logger
	OnChange func(ModelSnapshot)
}

// ModelScoped holds the daemon's per-model weekly usage windows in memory — the second,
// independent usage holder the plan Overview requires so Aggregator's single-writer
// assumption (aggregator.go:62-67) stays true: each holder keeps exactly one writer
// (the status-line ingest path for Aggregator, musterd's own poller for this one).
type ModelScoped struct {
	store    *store.Store
	log      zerolog.Logger
	onChange func(ModelSnapshot)

	mu      sync.Mutex
	current []ModelWindow // nil until the first successful fetch (REQ-14)
	at      *time.Time
	errKind *string
}

// NewModelScoped builds a ModelScoped. Nothing here does I/O until Record or SetError is
// called.
func NewModelScoped(cfg ModelScopedConfig) *ModelScoped {
	return &ModelScoped{store: cfg.Store, log: cfg.Logger, onChange: cfg.OnChange}
}

// Record applies one successful fetch: dedups against the current list sorted by
// DisplayName (REQ-5 — pass a non-nil, possibly empty, slice to distinguish "fetched, no
// windows" from "never fetched"), persists one usage_model_sample row per window before
// committing to memory when the list changed, and always clears a standing error — a
// success after a failure must broadcast even when the list itself is unchanged, since
// modelScopedError changed.
func (m *ModelScoped) Record(ctx context.Context, windows []ModelWindow) error {
	sorted := sortedWindows(windows)

	m.mu.Lock()
	listChanged := !windowsEqual(m.current, sorted)
	hadError := m.errKind != nil
	m.mu.Unlock()

	if !listChanged && !hadError {
		m.log.Debug().Msg("usage model-scoped list unchanged, skipping persist and broadcast")
		return nil
	}

	if listChanged {
		rows := make([]store.UsageModelSampleRow, 0, len(sorted))
		for _, w := range sorted {
			rows = append(rows, store.UsageModelSampleRow{
				DisplayName: w.DisplayName,
				Pct:         w.UsedPct,
				ResetsAt:    w.ResetsAt,
				Source:      defaultModelScopedSource,
			})
		}
		// Persist BEFORE the in-memory commit, mirroring Aggregator.Record
		// (aggregator.go:47-90): a failed write must leave Current() reporting the
		// previous list, and must not advance the dedup state, so a retry with the same
		// values attempts persistence again instead of being silently deduped away.
		if err := m.store.InsertUsageModelSamples(ctx, rows); err != nil {
			m.log.Error().Err(err).Msg("persisting usage model-scoped samples failed")
			return fmt.Errorf("persisting usage model-scoped samples: %w", err)
		}
	}

	now := time.Now().UTC()
	m.mu.Lock()
	if listChanged {
		m.current = sorted
		m.at = &now
	}
	m.errKind = nil
	snap := m.snapshotLocked()
	m.mu.Unlock()

	if m.onChange != nil {
		m.onChange(snap)
	}
	return nil
}

// SetError records a failed poll (REQ-6): the last-good list and its timestamp are kept
// untouched. Logged at Warn the first time this error kind is seen in a row, Debug on
// repeats — a broadcast fires only on the Warn transition, since a repeat carries no new
// information the UI doesn't already have (modelScopedError is already that value).
func (m *ModelScoped) SetError(kind string) {
	m.mu.Lock()
	changed := m.errKind == nil || *m.errKind != kind
	if changed {
		k := kind
		m.errKind = &k
	}
	snap := m.snapshotLocked()
	m.mu.Unlock()

	if !changed {
		m.log.Debug().Str("error_kind", kind).Msg("usage model-scoped poll failed again")
		return
	}
	m.log.Warn().Str("error_kind", kind).Msg("usage model-scoped poll failed")
	if m.onChange != nil {
		m.onChange(snap)
	}
}

// Current returns ModelScoped's present snapshot — GET /api/state and the WS `hello`
// handshake's snapshot both read this.
func (m *ModelScoped) Current() ModelSnapshot {
	m.mu.Lock()
	defer m.mu.Unlock()
	return m.snapshotLocked()
}

func (m *ModelScoped) snapshotLocked() ModelSnapshot {
	return ModelSnapshot{Windows: m.current, At: m.at, Error: m.errKind, Source: defaultModelScopedSource}
}

// sortedWindows returns a sorted copy of windows (by DisplayName, REQ-5) — a copy so the
// caller's slice and the one this package retains never alias. A nil input returns a
// non-nil empty slice: callers that mean "a successful fetch found nothing" must pass a
// non-nil (even if len-0) slice in the first place — sortedWindows only sorts, it never
// restores a lost nil-vs-empty distinction.
func sortedWindows(windows []ModelWindow) []ModelWindow {
	sorted := make([]ModelWindow, len(windows))
	copy(sorted, windows)
	sort.Slice(sorted, func(i, j int) bool { return sorted[i].DisplayName < sorted[j].DisplayName })
	return sorted
}

// windowsEqual reports whether a and b carry the same windows in the same order,
// including the nil-vs-empty distinction REQ-14/INV-1 rely on (a nil list is "never
// fetched"; a non-nil empty list is "fetched, no windows" — the two must never compare
// equal).
func windowsEqual(a, b []ModelWindow) bool {
	if (a == nil) != (b == nil) {
		return false
	}
	if len(a) != len(b) {
		return false
	}
	for i := range a {
		if a[i].DisplayName != b[i].DisplayName || a[i].UsedPct != b[i].UsedPct || !a[i].ResetsAt.Equal(b[i].ResetsAt) {
			return false
		}
	}
	return true
}
