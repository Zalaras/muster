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
	got := toWireUsage(usage.Snapshot{Source: "subscription"}, usage.ModelSnapshot{Source: "subscription-api"})

	assert.Nil(t, got.FiveHour)
	assert.Nil(t, got.SevenDay)
	assert.Nil(t, got.Model)
	assert.Nil(t, got.SampledAt)
	assert.Equal(t, "subscription", got.Source)
	assert.Nil(t, got.ModelScoped)
	assert.Nil(t, got.ModelScopedAt)
	assert.Nil(t, got.ModelScopedError)
	assert.Equal(t, "subscription-api", got.ModelScopedSource)
}

// TestToWireUsage_PopulatedSnapshotFormatsEveryFieldPerTheProtocol covers kb:anchor/ws.usage: buckets
// and sampledAt render as RFC3339 (not RFC3339Nano — the daemon's internal precision
// isn't part of the wire contract here), and model carries both fields verbatim.
func TestToWireUsage_PopulatedSnapshotFormatsEveryFieldPerTheProtocol(t *testing.T) {
	fiveHour := usage.Bucket{UsedPct: 61, ResetsAt: time.Date(2026, 8, 23, 11, 0, 0, 0, time.UTC)}
	sevenDay := usage.Bucket{UsedPct: 23, ResetsAt: time.Date(2026, 8, 25, 6, 0, 0, 0, time.UTC)}
	model := usage.Model{ID: "claude-haiku-4-5-20251001", DisplayName: "Haiku 4.5"}
	sampledAt := time.Date(2026, 8, 23, 9, 15, 31, 0, time.UTC)

	got := toWireUsage(usage.Snapshot{
		FiveHour: &fiveHour, SevenDay: &sevenDay, Model: &model, SampledAt: &sampledAt, Source: "subscription",
	}, usage.ModelSnapshot{Source: "subscription-api"})

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

	got := toWireUsage(usage.Snapshot{FiveHour: &fiveHour, Source: "subscription"}, usage.ModelSnapshot{Source: "subscription-api"})

	require.NotNil(t, got.FiveHour)
	assert.Equal(t, "2026-08-23T11:00:00Z", got.FiveHour.ResetsAt)
}

// TestToWireUsage_ModelScopedPopulatedListFormatsEveryField covers kb:anchor/ws.usage's second-source
// half: a non-nil Windows list maps to the wire's ModelScoped array with UTC RFC3339
// resetsAt, and At/Error/Source render alongside it.
func TestToWireUsage_ModelScopedPopulatedListFormatsEveryField(t *testing.T) {
	at := time.Date(2026, 8, 30, 10, 0, 0, 0, time.UTC)
	windows := []usage.ModelWindow{
		{DisplayName: "Fable", UsedPct: 61, ResetsAt: time.Date(2026, 9, 1, 13, 59, 59, 0, time.UTC)},
	}

	got := toWireUsage(usage.Snapshot{Source: "subscription"}, usage.ModelSnapshot{
		Windows: windows, At: &at, Source: "subscription-api",
	})

	require.NotNil(t, got.ModelScoped)
	require.Len(t, got.ModelScoped, 1)
	assert.Equal(t, "Fable", got.ModelScoped[0].DisplayName)
	assert.Equal(t, 61.0, got.ModelScoped[0].UsedPct)
	assert.Equal(t, "2026-09-01T13:59:59Z", got.ModelScoped[0].ResetsAt)
	require.NotNil(t, got.ModelScopedAt)
	assert.Equal(t, "2026-08-30T10:00:00Z", *got.ModelScopedAt)
	assert.Nil(t, got.ModelScopedError)
	assert.Equal(t, "subscription-api", got.ModelScopedSource)
}

// TestToWireUsage_ModelScopedEmptyNonNilListRendersAnEmptyArrayNotNull covers REQ-14's
// "an empty list [] is a valid successful fetch ... and is distinct from null" directly
// at the wire mapping.
func TestToWireUsage_ModelScopedEmptyNonNilListRendersAnEmptyArrayNotNull(t *testing.T) {
	at := time.Date(2026, 8, 30, 10, 0, 0, 0, time.UTC)

	got := toWireUsage(usage.Snapshot{Source: "subscription"}, usage.ModelSnapshot{
		Windows: []usage.ModelWindow{}, At: &at, Source: "subscription-api",
	})

	assert.NotNil(t, got.ModelScoped, "a non-nil empty Windows must render as [] on the wire, not null")
	assert.Empty(t, got.ModelScoped)
	require.NotNil(t, got.ModelScopedAt)
}

// TestToWireUsage_ModelScopedErrorKeepsLastGoodListAlongsideIt covers REQ-6's wire
// shape: an error kind is present alongside the last-good list, not instead of it.
func TestToWireUsage_ModelScopedErrorKeepsLastGoodListAlongsideIt(t *testing.T) {
	at := time.Date(2026, 8, 30, 10, 0, 0, 0, time.UTC)
	errKind := "unauthorized"
	windows := []usage.ModelWindow{{DisplayName: "Fable", UsedPct: 61, ResetsAt: at}}

	got := toWireUsage(usage.Snapshot{Source: "subscription"}, usage.ModelSnapshot{
		Windows: windows, At: &at, Error: &errKind, Source: "subscription-api",
	})

	require.NotNil(t, got.ModelScoped)
	assert.Len(t, got.ModelScoped, 1)
	require.NotNil(t, got.ModelScopedError)
	assert.Equal(t, "unauthorized", *got.ModelScopedError)
}

// TestToWireUsage_ModelScopedNilWindowsRendersNullEvenWithBothHalvesIndependentlyPopulated
// covers Edge Case 10: the status-line half being populated must never leak into the
// model-scoped half rendering non-null when it hasn't been fetched yet, and vice versa —
// each half of the merged object is built strictly from its own snapshot.
func TestToWireUsage_StatusLineAndModelScopedHalvesAreIndependent(t *testing.T) {
	fiveHour := usage.Bucket{UsedPct: 61, ResetsAt: time.Date(2026, 8, 23, 11, 0, 0, 0, time.UTC)}

	got := toWireUsage(usage.Snapshot{FiveHour: &fiveHour, Source: "subscription"}, usage.ModelSnapshot{Source: "subscription-api"})

	require.NotNil(t, got.FiveHour, "the status-line half must be populated")
	assert.Nil(t, got.ModelScoped, "the model-scoped half must stay null even though the status-line half is populated")
	assert.Nil(t, got.ModelScopedAt)
}
