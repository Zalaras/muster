package claudecode

import (
	"testing"
	"time"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/Zalaras/muster/internal/claudecode/claudecodetest"
)

// TestInterpretStatus_PreFirstResponse: the measured
// pre-first-API-response shape (null percentages, zero tokens, rate_limits entirely
// absent) must surface as unknown, never as "0%"/an account sample.
func TestInterpretStatus_PreFirstResponse(t *testing.T) {
	body := claudecodetest.EnvelopedStatusLinePreFirstResponse("claude-1", claudecodetest.StatusLinePreFirstResponseOpts{MusterSession: 1, TmuxPane: "%12"})
	payload := innerPayload(t, body)

	got := InterpretStatus(payload)

	assert.Nil(t, got.Context, "D7: a null used_percentage with zero tokens must never surface as a context, even 0%")
	assert.Nil(t, got.Account, "D8: rate_limits is entirely absent before the first API response")
	assert.Nil(t, got.Title, "no session_name was given")
	require.NotNil(t, got.Model, "the fixture still carries a model object even pre-first-response")
	assert.Equal(t, "claude-haiku-4-5-20251001", got.Model.ID)
}

func TestInterpretStatus_PreFirstResponse_SessionNameSurfacesAsTitle(t *testing.T) {
	body := claudecodetest.EnvelopedStatusLinePreFirstResponse("claude-1", claudecodetest.StatusLinePreFirstResponseOpts{
		MusterSession: 1, TmuxPane: "%12", SessionName: "Run echo hello bash command",
	})
	payload := innerPayload(t, body)

	got := InterpretStatus(payload)

	require.NotNil(t, got.Title)
	assert.Equal(t, "Run echo hello bash command", *got.Title)
}

// TestInterpretStatus_FullPost: the post-first-API-response shape yields
// every field of StatusUpdate, including the account sample built from the same
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

// TestInterpretStatus_ZeroUsedPercentageIsRealDataNotNull is the converse: a real
// 0% reading (a non-nil pointer to 0.0) must be adopted, never conflated with the null
// case above. StatusLineFullOpts.UsedPct is a *float64 precisely so this shape doesn't
// need a hand-built body (review cycle 1 Minor 6) — the "tests never hand-write
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

// TestInterpretStatus_PromptCache: prompt_cache is adopted only with an integer
// expires_at (Unix seconds) and a ttl of <digits><s|m|h> that is greater than zero; anything
// else, and an absent key, is nothing (kb:fact/prompt-cache-status-shape: absent means
// unknown, never cold). The "measured" row is the fact record's full object.
func TestInterpretStatus_PromptCache(t *testing.T) {
	const measured = `{"warm":true,"ttl":"1h","expires_at":1790840879,"caching_observed":true,"requests":10,` +
		`"hit_ratio":0.966,"cache_write_tokens":13797,"recache_tokens_if_cold":null,"misses":0,` +
		`"miss_recache_tokens":0,"expected_rebuilds":0,"last_miss_at":null,"last_miss_cause":null,"miss_causes":{}}`
	tests := []struct {
		name      string
		cache     string
		wantTTL   int64
		wantUnset bool
	}{
		{name: "measured full object, one hour", cache: measured, wantTTL: 3600},
		{name: "five minutes", cache: `{"expires_at":1790840879,"ttl":"5m"}`, wantTTL: 300},
		{name: "seconds", cache: `{"expires_at":1790840879,"ttl":"90s"}`, wantTTL: 90},
		{name: "a value never seen, thirty minutes", cache: `{"expires_at":1790840879,"ttl":"30m"}`, wantTTL: 1800},
		{name: "a value never seen, two hours", cache: `{"expires_at":1790840879,"ttl":"2h"}`, wantTTL: 7200},
		{name: "leading zeros", cache: `{"expires_at":1790840879,"ttl":"05m"}`, wantTTL: 300},
		{name: "zero minutes", cache: `{"expires_at":1790840879,"ttl":"0m"}`, wantUnset: true},
		{name: "zero seconds", cache: `{"expires_at":1790840879,"ttl":"0s"}`, wantUnset: true},
		{name: "all-zero digits", cache: `{"expires_at":1790840879,"ttl":"00h"}`, wantUnset: true},
		{name: "unit only", cache: `{"expires_at":1790840879,"ttl":"m"}`, wantUnset: true},
		{name: "digits only", cache: `{"expires_at":1790840879,"ttl":"5"}`, wantUnset: true},
		{name: "empty ttl", cache: `{"expires_at":1790840879,"ttl":""}`, wantUnset: true},
		{name: "garbage ttl", cache: `{"expires_at":1790840879,"ttl":"x"}`, wantUnset: true},
		{name: "unknown unit", cache: `{"expires_at":1790840879,"ttl":"1d"}`, wantUnset: true},
		{name: "upper-case unit", cache: `{"expires_at":1790840879,"ttl":"5M"}`, wantUnset: true},
		{name: "negative ttl", cache: `{"expires_at":1790840879,"ttl":"-5m"}`, wantUnset: true},
		{name: "explicit plus sign", cache: `{"expires_at":1790840879,"ttl":"+5m"}`, wantUnset: true},
		{name: "fractional ttl", cache: `{"expires_at":1790840879,"ttl":"1.5h"}`, wantUnset: true},
		{name: "space inside ttl", cache: `{"expires_at":1790840879,"ttl":"5 m"}`, wantUnset: true},
		{name: "ttl overflows when scaled to seconds", cache: `{"expires_at":1790840879,"ttl":"99999999999999999h"}`, wantUnset: true},
		{name: "ttl a number", cache: `{"expires_at":1790840879,"ttl":3600}`, wantUnset: true},
		{name: "ttl null", cache: `{"expires_at":1790840879,"ttl":null}`, wantUnset: true},
		{name: "ttl missing", cache: `{"expires_at":1790840879}`, wantUnset: true},
		{name: "expires_at a string", cache: `{"expires_at":"1790840879","ttl":"1h"}`, wantUnset: true},
		{name: "expires_at fractional", cache: `{"expires_at":1790840879.5,"ttl":"1h"}`, wantUnset: true},
		{name: "expires_at null", cache: `{"expires_at":null,"ttl":"1h"}`, wantUnset: true},
		{name: "expires_at missing", cache: `{"ttl":"1h"}`, wantUnset: true},
		{name: "empty object", cache: `{}`, wantUnset: true},
		{name: "null", cache: `null`, wantUnset: true},
		{name: "a string", cache: `"warm"`, wantUnset: true},
		{name: "an array", cache: `[]`, wantUnset: true},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := InterpretStatus([]byte(`{"session_id":"claude-1","prompt_cache":` + tt.cache + `}`))

			if tt.wantUnset {
				assert.Nil(t, got.Cache)
				return
			}
			require.NotNil(t, got.Cache)
			assert.Equal(t, tt.wantTTL, got.Cache.TTLSeconds)
			assert.Equal(t, time.Unix(1790840879, 0).UTC(), got.Cache.ExpiresAt)
			assert.Equal(t, time.UTC, got.Cache.ExpiresAt.Location())
		})
	}

	t.Run("key absent", func(t *testing.T) {
		got := InterpretStatus([]byte(`{"session_id":"claude-1","session_name":"a"}`))

		assert.Nil(t, got.Cache, "an absent key is unknown, never cold")
		require.NotNil(t, got.Title)
	})
}

// TestInterpretStatus_PromptCacheNeverDisturbsTheRestOfThePayload: a malformed
// prompt_cache must not stop the title, model, context or account sample from decoding,
// and a valid one rides beside them untouched.
func TestInterpretStatus_PromptCacheNeverDisturbsTheRestOfThePayload(t *testing.T) {
	full := claudecodetest.StatusLineFullOpts{SessionName: "My Session"}
	want := InterpretStatus(innerPayload(t, claudecodetest.EnvelopedStatusLineFull("claude-1", full)))

	t.Run("valid cache beside every other field", func(t *testing.T) {
		withCache := full
		withCache.PromptCache = &claudecodetest.PromptCacheOpts{ExpiresAt: 1790840879, TTL: "1h"}

		got := InterpretStatus(innerPayload(t, claudecodetest.EnvelopedStatusLineFull("claude-1", withCache)))

		require.NotNil(t, got.Cache)
		assert.Equal(t, int64(3600), got.Cache.TTLSeconds)
		assert.Equal(t, time.Unix(1790840879, 0).UTC(), got.Cache.ExpiresAt)
		got.Cache = nil
		assert.Equal(t, want, got, "every other field is identical with and without prompt_cache")
	})

	t.Run("unusable cache leaves the rest decoding", func(t *testing.T) {
		bad := full
		bad.PromptCache = &claudecodetest.PromptCacheOpts{ExpiresAt: 1790840879, TTL: "0m"}

		got := InterpretStatus(innerPayload(t, claudecodetest.EnvelopedStatusLineFull("claude-1", bad)))

		assert.Nil(t, got.Cache)
		assert.Equal(t, want, got)
	})

	t.Run("a non-object prompt_cache beside the title", func(t *testing.T) {
		got := InterpretStatus([]byte(`{"session_id":"claude-1","session_name":"a","prompt_cache":"warm"}`))

		assert.Nil(t, got.Cache)
		require.NotNil(t, got.Title)
		assert.Equal(t, "a", *got.Title)
	})
}
