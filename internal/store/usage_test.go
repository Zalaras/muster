package store

import (
	"context"
	"testing"
	"time"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// TestInsertUsageSample_PersistsConvertedValues covers REQ-8's usage_sample row: the
// store persists the aggregator's already-converted forms (RFC3339 reset times,
// verbatim floats) and stamps its own receipt time, rather than trusting a caller value.
func TestInsertUsageSample_PersistsConvertedValues(t *testing.T) {
	st := openTestStore(t)
	ctx := context.Background()

	fiveHourResetsAt := time.Date(2026, 8, 23, 11, 0, 0, 0, time.UTC)
	sevenDayResetsAt := time.Date(2026, 8, 25, 6, 0, 0, 0, time.UTC)

	require.NoError(t, st.InsertUsageSample(ctx, UsageSampleRow{
		ModelID:          "claude-haiku-4-5-20251001",
		ModelDisplayName: "Haiku 4.5",
		FiveHourPct:      61,
		FiveHourResetsAt: fiveHourResetsAt,
		SevenDayPct:      23,
		SevenDayResetsAt: sevenDayResetsAt,
		Source:           "subscription",
	}))

	var (
		modelID, modelDisplayName, at, fiveHourResetsAtCol, sevenDayResetsAtCol, source string
		fiveHourPct, sevenDayPct                                                        float64
	)
	require.NoError(t, st.db.QueryRowContext(ctx, `
		SELECT at, model_id, model_display_name, five_hour_pct, five_hour_resets_at,
		       seven_day_pct, seven_day_resets_at, source
		FROM usage_sample
	`).Scan(&at, &modelID, &modelDisplayName, &fiveHourPct, &fiveHourResetsAtCol, &sevenDayPct, &sevenDayResetsAtCol, &source))

	assert.Equal(t, "claude-haiku-4-5-20251001", modelID)
	assert.Equal(t, "Haiku 4.5", modelDisplayName)
	assert.Equal(t, 61.0, fiveHourPct)
	assert.Equal(t, "2026-08-23T11:00:00Z", fiveHourResetsAtCol)
	assert.Equal(t, 23.0, sevenDayPct)
	assert.Equal(t, "2026-08-25T06:00:00Z", sevenDayResetsAtCol)
	assert.Equal(t, "subscription", source)

	_, err := time.Parse(time.RFC3339Nano, at)
	assert.NoError(t, err, "at is the store's own receipt-time stamp, RFC3339Nano like event.received_at")
}

// TestInsertUsageSample_EachCallInsertsARow covers the store's own contract: dedup is
// the aggregator's job (internal/usage), not the store's — InsertUsageSample itself is
// unconditional, so two calls always produce two rows.
func TestInsertUsageSample_EachCallInsertsARow(t *testing.T) {
	st := openTestStore(t)
	ctx := context.Background()

	row := UsageSampleRow{
		ModelID: "claude-haiku-4-5-20251001", ModelDisplayName: "Haiku 4.5",
		FiveHourPct: 61, FiveHourResetsAt: time.Now().UTC(),
		SevenDayPct: 23, SevenDayResetsAt: time.Now().UTC(),
		Source: "subscription",
	}
	require.NoError(t, st.InsertUsageSample(ctx, row))
	require.NoError(t, st.InsertUsageSample(ctx, row))

	var n int
	require.NoError(t, st.db.QueryRowContext(ctx, `SELECT COUNT(*) FROM usage_sample`).Scan(&n))
	assert.Equal(t, 2, n)
}
