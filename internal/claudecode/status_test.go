package claudecode

import (
	"testing"
	"time"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/Zalaras/muster/internal/claudecode/claudecodetest"
)

// TestInterpretStatus_PreFirstResponse covers REQ-2/REQ-3/D7/D8: the measured
// pre-first-API-response shape (null percentages, zero tokens, rate_limits entirely
// absent) must surface as unknown, never as "0%"/an account sample.
func TestInterpretStatus_PreFirstResponse(t *testing.T) {
	body := claudecodetest.EnvelopedStatusLinePreFirstResponse("claude-1", 1, "%12", "")
	payload := innerPayload(t, body)

	got := InterpretStatus(payload)

	assert.Nil(t, got.Context, "D7: a null used_percentage with zero tokens must never surface as a context, even 0%")
	assert.Nil(t, got.Account, "D8: rate_limits is entirely absent before the first API response")
	assert.Nil(t, got.Title, "no session_name was given")
	require.NotNil(t, got.Model, "the fixture still carries a model object even pre-first-response")
	assert.Equal(t, "claude-haiku-4-5-20251001", got.Model.ID)
}

func TestInterpretStatus_PreFirstResponse_SessionNameSurfacesAsTitle(t *testing.T) {
	body := claudecodetest.EnvelopedStatusLinePreFirstResponse("claude-1", 1, "%12", "Run echo hello bash command")
	payload := innerPayload(t, body)

	got := InterpretStatus(payload)

	require.NotNil(t, got.Title)
	assert.Equal(t, "Run echo hello bash command", *got.Title)
}

// TestInterpretStatus_FullPost covers REQ-1: the post-first-API-response shape yields
// every field of StatusUpdate, including the account sample (REQ-3) built from the same
// payload's model object (Edge Case 9).
func TestInterpretStatus_FullPost(t *testing.T) {
	body := claudecodetest.EnvelopedStatusLineFull("claude-1", claudecodetest.StatusLineFullOpts{
		SessionName: "My Session",
	})
	payload := innerPayload(t, body)

	got := InterpretStatus(payload)

	require.NotNil(t, got.Title)
	assert.Equal(t, "My Session", *got.Title)

	require.NotNil(t, got.Model)
	assert.Equal(t, "claude-haiku-4-5-20251001", got.Model.ID)
	assert.Equal(t, "Haiku 4.5", got.Model.DisplayName)

	require.NotNil(t, got.Context)
	assert.Equal(t, 42.0, got.Context.UsedPct)
	assert.Equal(t, int64(84000), got.Context.TotalInputTokens)
	assert.Equal(t, int64(200000), got.Context.WindowSize)

	require.NotNil(t, got.Account)
	assert.Equal(t, 61.0, got.Account.FiveHour.UsedPct)
	assert.Equal(t, 23.0, got.Account.SevenDay.UsedPct)
	assert.Equal(t, "subscription", got.Account.Source)
	assert.Equal(t, "claude-haiku-4-5-20251001", got.Account.Model.ID)
	assert.Equal(t, "Haiku 4.5", got.Account.Model.DisplayName)
}

// TestInterpretStatus_ResetsAtConvertsEpochToUTC covers canary-fields.md correction #2:
// resets_at is a Unix epoch integer on the wire, not an RFC3339 string.
func TestInterpretStatus_ResetsAtConvertsEpochToUTC(t *testing.T) {
	body := claudecodetest.EnvelopedStatusLineFull("claude-1", claudecodetest.StatusLineFullOpts{
		FiveHourResetsAt: 1786897200, // canary-fields.md's own measured sample value
		SevenDayResetsAt: 1787061600,
	})
	payload := innerPayload(t, body)

	got := InterpretStatus(payload)

	require.NotNil(t, got.Account)
	assert.Equal(t, time.Unix(1786897200, 0).UTC(), got.Account.FiveHour.ResetsAt)
	assert.Equal(t, time.UTC, got.Account.FiveHour.ResetsAt.Location())
	assert.Equal(t, time.Unix(1787061600, 0).UTC(), got.Account.SevenDay.ResetsAt)
}

// TestInterpretStatus_ZeroUsedPercentageIsRealDataNotNull is REQ-2's converse: a real
// 0% reading (a non-nil pointer to 0.0) must be adopted, never conflated with the null
// case above. StatusLineFullOpts.UsedPct is a *float64 precisely so this shape doesn't
// need a hand-built body (review cycle 1 Minor 6) — REQ-15's "tests never hand-write
// wire bodies" stays literal.
func TestInterpretStatus_ZeroUsedPercentageIsRealDataNotNull(t *testing.T) {
	zeroPct := 0.0
	body := claudecodetest.EnvelopedStatusLineFull("claude-1", claudecodetest.StatusLineFullOpts{
		UsedPct: &zeroPct,
	})
	payload := innerPayload(t, body)

	got := InterpretStatus(payload)

	require.NotNil(t, got.Context, "a real 0%% reading must still be adopted")
	assert.Equal(t, 0.0, got.Context.UsedPct)
}

// TestInterpretStatus_RateLimitsPresentButModelAbsentProducesNoSample covers Edge Case
// 9: a sample is recorded only when rate_limits and model are present in the *same*
// payload — never with a stale/last-known model.
func TestInterpretStatus_RateLimitsPresentButModelAbsentProducesNoSample(t *testing.T) {
	payload := []byte(`{
		"session_id": "claude-1",
		"rate_limits": {
			"five_hour": {"used_percentage": 61, "resets_at": 4070908800},
			"seven_day": {"used_percentage": 23, "resets_at": 4070908800}
		}
	}`)

	got := InterpretStatus(payload)

	assert.Nil(t, got.Model)
	assert.Nil(t, got.Account, "no model in the same payload means no account sample, per plan Edge Case 9")
}

func TestInterpretStatus_EmptySessionNameDoesNotSurfaceAsATitle(t *testing.T) {
	payload := []byte(`{"session_id":"claude-1","session_name":""}`)

	got := InterpretStatus(payload)

	assert.Nil(t, got.Title)
}

// TestInterpretStatus_MalformedPayloadReturnsZeroValueWithoutPanicking covers hook
// delivery's loss tolerance (CLAUDE.md hard rule: design for loss) — a garbled body
// must degrade to "nothing surfaced", not a crash.
func TestInterpretStatus_MalformedPayloadReturnsZeroValueWithoutPanicking(t *testing.T) {
	got := InterpretStatus([]byte(`not json`))

	assert.Nil(t, got.Title)
	assert.Nil(t, got.Model)
	assert.Nil(t, got.Context)
	assert.Nil(t, got.Account)
}
