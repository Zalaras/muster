package store

import (
	"context"
	"fmt"
	"time"
)

// UsageSampleRow is one persisted usage_sample row (m3-gauges Schema Changes) —
// internal/usage's storage-level twin, keeping this package free of internal/usage's own
// domain vocabulary. A row is only ever inserted for a complete sample (REQ-3/REQ-5); a
// partial sample is never persisted, so every field here is required.
type UsageSampleRow struct {
	ModelID          string
	ModelDisplayName string
	FiveHourPct      float64
	FiveHourResetsAt time.Time
	SevenDayPct      float64
	SevenDayResetsAt time.Time
	Source           string
}

// InsertUsageSample persists one usage_sample row, stamping its receipt time itself
// (RFC3339Nano UTC, REQ-10) rather than trusting a caller-supplied timestamp.
func (s *Store) InsertUsageSample(ctx context.Context, r UsageSampleRow) error {
	at := time.Now().UTC().Format(time.RFC3339Nano)
	_, err := s.db.ExecContext(ctx, `
		INSERT INTO usage_sample (
			at, model_id, model_display_name, five_hour_pct, five_hour_resets_at,
			seven_day_pct, seven_day_resets_at, source
		) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
	`,
		at, r.ModelID, r.ModelDisplayName, r.FiveHourPct, r.FiveHourResetsAt.UTC().Format(time.RFC3339),
		r.SevenDayPct, r.SevenDayResetsAt.UTC().Format(time.RFC3339), r.Source,
	)
	if err != nil {
		return fmt.Errorf("inserting usage sample: %w", err)
	}
	return nil
}

// UsageModelSampleRow is one persisted usage_model_sample row (plan usage-model-bar,
// Schema Changes) — internal/usage's storage-level twin, keeping this package free of
// internal/usage's own domain vocabulary. At is not part of this shape: every row in one
// InsertUsageModelSamples batch shares a single receipt timestamp, stamped by the store
// itself (mirrors InsertUsageSample), not trusted from a caller.
type UsageModelSampleRow struct {
	DisplayName string
	Pct         float64
	ResetsAt    time.Time
	Source      string
}

// InsertUsageModelSamples persists rows in one transaction sharing a single receipt
// timestamp (plan Schema Changes: "one per window, same at"). An empty slice is a no-op,
// not an error — Record only calls this when the list actually changed and non-empty
// input is never guaranteed by callers in general.
func (s *Store) InsertUsageModelSamples(ctx context.Context, rows []UsageModelSampleRow) error {
	if len(rows) == 0 {
		return nil
	}
	at := time.Now().UTC().Format(time.RFC3339Nano)

	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return fmt.Errorf("beginning usage model sample tx: %w", err)
	}
	for _, r := range rows {
		if _, err := tx.ExecContext(ctx, `
			INSERT INTO usage_model_sample (at, display_name, pct, resets_at, source)
			VALUES (?, ?, ?, ?, ?)
		`, at, r.DisplayName, r.Pct, r.ResetsAt.UTC().Format(time.RFC3339), r.Source); err != nil {
			_ = tx.Rollback()
			return fmt.Errorf("inserting usage model sample: %w", err)
		}
	}
	if err := tx.Commit(); err != nil {
		return fmt.Errorf("committing usage model sample tx: %w", err)
	}
	return nil
}
