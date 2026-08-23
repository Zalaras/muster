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
