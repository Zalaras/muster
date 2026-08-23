package server

import (
	"testing"
	"time"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/Zalaras/muster/internal/usage"
)

// TestToWireUsage_ZeroSnapshotRendersEveryFieldNullExceptSource covers REQ-7's boot
// state on the wire: an aggregator that has never recorded a sample must render every
// field null (INV-3: no empty gauge), with Source the one field that's never null.
func TestToWireUsage_ZeroSnapshotRendersEveryFieldNullExceptSource(t *testing.T) {
	got := toWireUsage(usage.Snapshot{Source: "subscription"})

	assert.Nil(t, got.FiveHour)
	assert.Nil(t, got.SevenDay)
	assert.Nil(t, got.Model)
	assert.Nil(t, got.SampledAt)
	assert.Equal(t, "subscription", got.Source)
}

// TestToWireUsage_PopulatedSnapshotFormatsEveryFieldPerTheProtocol covers §5.4: buckets
// and sampledAt render as RFC3339 (not RFC3339Nano — the daemon's internal precision
// isn't part of the wire contract here), and model carries both fields verbatim.
func TestToWireUsage_PopulatedSnapshotFormatsEveryFieldPerTheProtocol(t *testing.T) {
	fiveHour := usage.Bucket{UsedPct: 61, ResetsAt: time.Date(2026, 8, 23, 11, 0, 0, 0, time.UTC)}
	sevenDay := usage.Bucket{UsedPct: 23, ResetsAt: time.Date(2026, 8, 25, 6, 0, 0, 0, time.UTC)}
	model := usage.Model{ID: "claude-haiku-4-5-20251001", DisplayName: "Haiku 4.5"}
	sampledAt := time.Date(2026, 8, 23, 9, 15, 31, 0, time.UTC)

	got := toWireUsage(usage.Snapshot{
		FiveHour: &fiveHour, SevenDay: &sevenDay, Model: &model, SampledAt: &sampledAt, Source: "subscription",
	})

	require.NotNil(t, got.FiveHour)
	assert.Equal(t, 61.0, got.FiveHour.UsedPct)
	assert.Equal(t, "2026-08-23T11:00:00Z", got.FiveHour.ResetsAt)
	require.NotNil(t, got.SevenDay)
	assert.Equal(t, 23.0, got.SevenDay.UsedPct)
	assert.Equal(t, "2026-08-25T06:00:00Z", got.SevenDay.ResetsAt)
	require.NotNil(t, got.Model)
	assert.Equal(t, "claude-haiku-4-5-20251001", got.Model.ID)
	assert.Equal(t, "Haiku 4.5", got.Model.DisplayName)
	require.NotNil(t, got.SampledAt)
	assert.Equal(t, "2026-08-23T09:15:31Z", *got.SampledAt)
	assert.Equal(t, "subscription", got.Source)
}

// TestToWireUsage_ResetsAtConvertsToUTCEvenFromANonUTCTime guards against a caller
// passing a Bucket.ResetsAt in a non-UTC location — the wire must always render UTC.
func TestToWireUsage_ResetsAtConvertsToUTCEvenFromANonUTCTime(t *testing.T) {
	loc := time.FixedZone("UTC-5", -5*60*60)
	fiveHour := usage.Bucket{UsedPct: 61, ResetsAt: time.Date(2026, 8, 23, 6, 0, 0, 0, loc)}

	got := toWireUsage(usage.Snapshot{FiveHour: &fiveHour, Source: "subscription"})

	require.NotNil(t, got.FiveHour)
	assert.Equal(t, "2026-08-23T11:00:00Z", got.FiveHour.ResetsAt)
}
