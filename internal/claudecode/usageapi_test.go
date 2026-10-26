package claudecode

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// measuredUsageBody is the real GET /api/oauth/usage response shape measured live
// 2026-08-30 against the developer's own token (docs/history/spikes/canary-fields.md "GET /api/oauth/usage
// measured live 2026-08-30"): limits[] carries "session"/"weekly_all"/"weekly_scoped"
// kinds, resets_at is an RFC3339 string with microseconds and a "+00:00" offset (never
// epoch on the wire in practice, though REQ-4 requires both forms decode), and many
// unrelated top-level/feature-flag keys exist alongside it.
const measuredUsageBody = `{
  "five_hour": {"utilization": 7.0, "resets_at": "2026-08-30T13:39:59.522275+00:00"},
  "seven_day": {"utilization": 23.0, "resets_at": "2026-09-01T06:00:00.000000+00:00"},
  "seven_day_opus": null,
  "seven_day_sonnet": null,
  "seven_day_oauth_apps": null,
  "amber_ladder": {"enabled": false},
  "cinder_cove": true,
  "limits": [
    {"kind": "session", "group": "default", "percent": 12, "severity": "normal", "resets_at": "2026-08-30T13:39:59.522275+00:00", "scope": null, "is_active": true},
    {"kind": "weekly_all", "group": "default", "percent": 30, "severity": "normal", "resets_at": "2026-09-01T06:00:00.000000+00:00", "scope": null, "is_active": true},
    {"kind": "weekly_scoped", "group": "default", "percent": 61, "severity": "normal", "resets_at": "2026-09-01T13:59:59.522599+00:00", "scope": {"model": {"id": null, "display_name": "Fable"}, "surface": null}, "is_active": true}
  ]
}`

func TestInterpretUsageReport_MeasuredLiveShape(t *testing.T) {
	got, err := InterpretUsageReport([]byte(measuredUsageBody))

	require.NoError(t, err)
	require.Len(t, got.ModelScoped, 1, "only the weekly_scoped entry becomes a UsageWindow; session/weekly_all are ignored")
	assert.Equal(t, "Fable", got.ModelScoped[0].DisplayName)
	assert.Equal(t, 61.0, got.ModelScoped[0].UsedPct)
	assert.True(t, got.ModelScoped[0].ResetsAt.Equal(time.Date(2026, 9, 1, 14, 0, 0, 0, time.UTC)),
		"got %v", got.ModelScoped[0].ResetsAt)
	assert.Equal(t, time.UTC, got.ModelScoped[0].ResetsAt.Location())
}

// TestInterpretUsageReport_FiveHourAndSevenDayBuckets covers D1: the measured shape's
// top-level windows become buckets (resets_at rounded up to the whole second), and each window is read on its own — a missing, null,
// non-object, incomplete or unparseable one yields nil for that bucket only.
func TestInterpretUsageReport_FiveHourAndSevenDayBuckets(t *testing.T) {
	five := time.Date(2026, 8, 30, 13, 40, 0, 0, time.UTC)
	seven := time.Date(2026, 9, 1, 6, 0, 0, 0, time.UTC)
	const goodFive = `"five_hour": {"utilization": 7.0, "resets_at": "2026-08-30T13:39:59.522275+00:00"}`
	const goodSeven = `"seven_day": {"utilization": 23.0, "resets_at": "2026-09-01T06:00:00.000000+00:00"}`

	cases := []struct {
		name      string
		body      string
		wantFive  *StatusBucket
		wantSeven *StatusBucket
	}{
		{"measured shape", measuredUsageBody, &StatusBucket{UsedPct: 7, ResetsAt: five}, &StatusBucket{UsedPct: 23, ResetsAt: seven}},
		{"both missing", `{"limits": []}`, nil, nil},
		{"both null", `{"five_hour": null, "seven_day": null}`, nil, nil},
		{"seven_day missing", `{` + goodFive + `}`, &StatusBucket{UsedPct: 7, ResetsAt: five}, nil},
		{"five_hour missing", `{` + goodSeven + `}`, nil, &StatusBucket{UsedPct: 23, ResetsAt: seven}},
		{"seven_day null keeps five_hour", `{` + goodFive + `, "seven_day": null}`, &StatusBucket{UsedPct: 7, ResetsAt: five}, nil},
		{"five_hour without resets_at", `{"five_hour": {"utilization": 7.0}, ` + goodSeven + `}`, nil, &StatusBucket{UsedPct: 23, ResetsAt: seven}},
		{"five_hour with null resets_at", `{"five_hour": {"utilization": 7.0, "resets_at": null}, ` + goodSeven + `}`, nil, &StatusBucket{UsedPct: 23, ResetsAt: seven}},
		{"five_hour without utilization", `{"five_hour": {"resets_at": "2026-08-30T13:39:59Z"}, ` + goodSeven + `}`, nil, &StatusBucket{UsedPct: 23, ResetsAt: seven}},
		{"five_hour with unparseable resets_at", `{"five_hour": {"utilization": 7.0, "resets_at": "soon"}, ` + goodSeven + `}`, nil, &StatusBucket{UsedPct: 23, ResetsAt: seven}},
		{"five_hour not an object", `{"five_hour": "7%", ` + goodSeven + `}`, nil, &StatusBucket{UsedPct: 23, ResetsAt: seven}},
		{"epoch seconds resets_at", `{"seven_day": {"utilization": 40, "resets_at": 1798000000}}`, nil, &StatusBucket{UsedPct: 40, ResetsAt: time.Unix(1798000000, 0).UTC()}},
		{"zero utilization is a value", `{"five_hour": {"utilization": 0, "resets_at": "2026-08-30T13:39:59Z"}}`, &StatusBucket{UsedPct: 0, ResetsAt: time.Date(2026, 8, 30, 13, 39, 59, 0, time.UTC)}, nil},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			got, err := InterpretUsageReport([]byte(tc.body))

			require.NoError(t, err, "a bad window never fails the decode")
			assertBucket(t, tc.wantFive, got.FiveHour, "five_hour")
			assertBucket(t, tc.wantSeven, got.SevenDay, "seven_day")
		})
	}
}

// TestParseResetsAt_RoundsRFC3339UpToTheSecond pins kb:adr/usage-call-resets-rounded-up-to-the-second:
// a sub-second instant rounds up, an instant already on a whole second is unchanged, and an
// epoch-seconds value (always whole) is untouched; the offset never changes the instant.
func TestParseResetsAt_RoundsRFC3339UpToTheSecond(t *testing.T) {
	cases := []struct {
		name string
		raw  string
		want time.Time
	}{
		{"measured micros round up", `"2026-08-30T13:39:59.522275+00:00"`, time.Date(2026, 8, 30, 13, 40, 0, 0, time.UTC)},
		{"one nanosecond past rounds up", `"2026-08-30T13:39:59.000000001Z"`, time.Date(2026, 8, 30, 13, 40, 0, 0, time.UTC)},
		{"just under the next second rounds up", `"2026-08-30T13:39:59.999999999Z"`, time.Date(2026, 8, 30, 13, 40, 0, 0, time.UTC)},
		{"whole second with zero fraction unchanged", `"2026-09-01T06:00:00.000000+00:00"`, time.Date(2026, 9, 1, 6, 0, 0, 0, time.UTC)},
		{"whole second without fraction unchanged", `"2026-08-30T13:39:59Z"`, time.Date(2026, 8, 30, 13, 39, 59, 0, time.UTC)},
		{"rounds across a minute and hour boundary", `"2026-08-30T13:59:59.5Z"`, time.Date(2026, 8, 30, 14, 0, 0, 0, time.UTC)},
		{"non-UTC offset rounds the same instant", `"2026-08-30T15:39:59.522275+02:00"`, time.Date(2026, 8, 30, 13, 40, 0, 0, time.UTC)},
		{"epoch seconds unchanged", `1798000000`, time.Unix(1798000000, 0).UTC()},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			got, err := parseResetsAt(json.RawMessage(tc.raw))

			require.NoError(t, err)
			assert.True(t, tc.want.Equal(got), "want %v got %v", tc.want, got)
			assert.Zero(t, got.Nanosecond(), "a call instant always lands on a whole second")
		})
	}
}

func assertBucket(t *testing.T, want, got *StatusBucket, label string) {
	t.Helper()
	if want == nil {
		assert.Nil(t, got, label)
		return
	}
	require.NotNil(t, got, label)
	assert.Equal(t, want.UsedPct, got.UsedPct, label)
	assert.True(t, want.ResetsAt.Equal(got.ResetsAt), "%s resets: want %v got %v", label, want.ResetsAt, got.ResetsAt)
}

// TestInterpretUsageReport_BucketsDoNotDisturbModelWindows covers D1's independence the
// other way: the model-scoped list reads the same whether the top-level windows are good or not.
func TestInterpretUsageReport_BucketsDoNotDisturbModelWindows(t *testing.T) {
	body := `{"five_hour": "garbage", "seven_day": null, "limits": [
		{"kind": "weekly_scoped", "percent": 61, "resets_at": "2026-09-01T13:59:59Z", "scope": {"model": {"display_name": "Fable"}}}
	]}`

	got, err := InterpretUsageReport([]byte(body))

	require.NoError(t, err)
	assert.Nil(t, got.FiveHour)
	assert.Nil(t, got.SevenDay)
	require.Len(t, got.ModelScoped, 1)
	assert.Equal(t, "Fable", got.ModelScoped[0].DisplayName)
}

func TestInterpretUsageReport_EpochSecondsResetsAt(t *testing.T) {
	body := `{"limits": [
		{"kind": "weekly_scoped", "percent": 40, "resets_at": 1798000000, "scope": {"model": {"display_name": "Fable"}}}
	]}`

	got, err := InterpretUsageReport([]byte(body))

	require.NoError(t, err)
	require.Len(t, got.ModelScoped, 1)
	assert.True(t, got.ModelScoped[0].ResetsAt.Equal(time.Unix(1798000000, 0).UTC()))
}

func TestInterpretUsageReport_MissingLimitsKeyIsNilNotError(t *testing.T) {
	got, err := InterpretUsageReport([]byte(`{"five_hour": {"utilization": 7.0}}`))

	require.NoError(t, err)
	assert.Nil(t, got.ModelScoped)
}

func TestInterpretUsageReport_EmptyLimitsArrayIsNil(t *testing.T) {
	got, err := InterpretUsageReport([]byte(`{"limits": []}`))

	require.NoError(t, err)
	assert.Nil(t, got.ModelScoped)
}

func TestInterpretUsageReport_NonWeeklyScopedKindsAreIgnored(t *testing.T) {
	body := `{"limits": [
		{"kind": "session", "percent": 12, "resets_at": "2026-08-30T13:39:59Z", "scope": null},
		{"kind": "weekly_all", "percent": 30, "resets_at": "2026-08-30T13:39:59Z", "scope": null}
	]}`

	got, err := InterpretUsageReport([]byte(body))

	require.NoError(t, err)
	assert.Nil(t, got.ModelScoped)
}

func TestInterpretUsageReport_NullScopeIsIgnored(t *testing.T) {
	body := `{"limits": [{"kind": "weekly_scoped", "percent": 61, "resets_at": "2026-08-30T13:39:59Z", "scope": null}]}`

	got, err := InterpretUsageReport([]byte(body))

	require.NoError(t, err)
	assert.Nil(t, got.ModelScoped)
}

func TestInterpretUsageReport_NullDisplayNameIsIgnored(t *testing.T) {
	body := `{"limits": [{"kind": "weekly_scoped", "percent": 61, "resets_at": "2026-08-30T13:39:59Z", "scope": {"model": {"id": null, "display_name": null}}}]}`

	got, err := InterpretUsageReport([]byte(body))

	require.NoError(t, err)
	assert.Nil(t, got.ModelScoped)
}

func TestInterpretUsageReport_EmptyDisplayNameIsIgnored(t *testing.T) {
	body := `{"limits": [{"kind": "weekly_scoped", "percent": 61, "resets_at": "2026-08-30T13:39:59Z", "scope": {"model": {"display_name": ""}}}]}`

	got, err := InterpretUsageReport([]byte(body))

	require.NoError(t, err)
	assert.Nil(t, got.ModelScoped)
}

// TestInterpretUsageReport_UnparseableResetsAtOnOneEntrySkipsOnlyThatEntry covers REQ-4's
// "other kinds/unparseable resets_at ... are ignored rather than erroring" — an
// undocumented, evolving endpoint must not break the whole poll over one bad entry.
func TestInterpretUsageReport_UnparseableResetsAtOnOneEntrySkipsOnlyThatEntry(t *testing.T) {
	body := `{"limits": [
		{"kind": "weekly_scoped", "percent": 40, "resets_at": "not-a-date", "scope": {"model": {"display_name": "Opus"}}},
		{"kind": "weekly_scoped", "percent": 61, "resets_at": "2026-08-30T13:39:59Z", "scope": {"model": {"display_name": "Fable"}}}
	]}`

	got, err := InterpretUsageReport([]byte(body))

	require.NoError(t, err)
	require.Len(t, got.ModelScoped, 1, "the malformed Opus entry must be dropped, not fail the whole decode")
	assert.Equal(t, "Fable", got.ModelScoped[0].DisplayName)
}

func TestInterpretUsageReport_UnknownTopLevelKeysAreIgnored(t *testing.T) {
	got, err := InterpretUsageReport([]byte(measuredUsageBody))

	require.NoError(t, err)
	require.Len(t, got.ModelScoped, 1, "amber_ladder/cinder_cove/seven_day_opus etc. must not break decoding")
}

func TestInterpretUsageReport_MultipleWeeklyScopedEntries(t *testing.T) {
	body := `{"limits": [
		{"kind": "weekly_scoped", "percent": 61, "resets_at": "2026-09-01T13:59:59Z", "scope": {"model": {"display_name": "Fable"}}},
		{"kind": "weekly_scoped", "percent": 10, "resets_at": "2026-09-02T06:00:00Z", "scope": {"model": {"display_name": "Opus"}}}
	]}`

	got, err := InterpretUsageReport([]byte(body))

	require.NoError(t, err)
	require.Len(t, got.ModelScoped, 2)
}

func TestInterpretUsageReport_MalformedJSONReturnsError(t *testing.T) {
	_, err := InterpretUsageReport([]byte(`not json at all`))

	require.Error(t, err)
}

func TestInterpretUsageReport_ResetsAtWithoutFractionalSecondsStillParses(t *testing.T) {
	body := `{"limits": [{"kind": "weekly_scoped", "percent": 61, "resets_at": "2026-09-01T13:59:59+02:00", "scope": {"model": {"display_name": "Fable"}}}]}`

	got, err := InterpretUsageReport([]byte(body))

	require.NoError(t, err)
	require.Len(t, got.ModelScoped, 1)
	assert.True(t, got.ModelScoped[0].ResetsAt.Equal(time.Date(2026, 9, 1, 11, 59, 59, 0, time.UTC)), "got %v", got.ModelScoped[0].ResetsAt)
}

// --- FetchUsage ---

func TestFetchUsage_Success_SendsMeasuredHeadersAndPath(t *testing.T) {
	var gotPath, gotAuth, gotBeta, gotContentType string
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		gotPath = r.URL.Path
		gotAuth = r.Header.Get("Authorization")
		gotBeta = r.Header.Get("anthropic-beta")
		gotContentType = r.Header.Get("Content-Type")
		w.WriteHeader(http.StatusOK)
		_, _ = w.Write([]byte(measuredUsageBody))
	}))
	defer srv.Close()

	got, err := FetchUsage(context.Background(), srv.Client(), srv.URL, "secret-token-xyz")

	require.NoError(t, err)
	require.Len(t, got.ModelScoped, 1)
	assert.Equal(t, "/api/oauth/usage", gotPath)
	assert.Equal(t, "Bearer secret-token-xyz", gotAuth)
	assert.Equal(t, "oauth-2025-04-20", gotBeta)
	assert.Equal(t, "application/json", gotContentType)
}

func TestFetchUsage_401ReturnsErrUnauthorized(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		w.WriteHeader(http.StatusUnauthorized)
	}))
	defer srv.Close()

	_, err := FetchUsage(context.Background(), srv.Client(), srv.URL, "tok")

	assert.ErrorIs(t, err, ErrUnauthorized)
}

func TestFetchUsage_403ReturnsErrUnauthorized(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		w.WriteHeader(http.StatusForbidden)
	}))
	defer srv.Close()

	_, err := FetchUsage(context.Background(), srv.Client(), srv.URL, "tok")

	assert.ErrorIs(t, err, ErrUnauthorized)
}

func TestFetchUsage_5xxReturnsGenericErrorNotUnauthorized(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		w.WriteHeader(http.StatusInternalServerError)
	}))
	defer srv.Close()

	_, err := FetchUsage(context.Background(), srv.Client(), srv.URL, "tok")

	require.Error(t, err)
	assert.NotErrorIs(t, err, ErrUnauthorized, "a 500 must map to the generic 'unreachable' error kind upstream, not unauthorized")
}

func TestFetchUsage_ConnectionRefusedReturnsError(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(_ http.ResponseWriter, _ *http.Request) {}))
	closedURL := srv.URL
	srv.Close() // server is now gone; the port refuses connections

	_, err := FetchUsage(context.Background(), http.DefaultClient, closedURL, "tok")

	require.Error(t, err)
}

func TestFetchUsage_MalformedBodyReturnsDecodeError(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		w.WriteHeader(http.StatusOK)
		_, _ = w.Write([]byte(`not json`))
	}))
	defer srv.Close()

	_, err := FetchUsage(context.Background(), srv.Client(), srv.URL, "tok")

	require.Error(t, err)
}

// TestFetchUsage_ErrorMessagesNeverContainTheToken is a defensive unit-level check for
// D9 ("the token string never appears in any log line"): FetchUsage's own returned
// errors — which a careless caller might log — must never echo the token back.
func TestFetchUsage_ErrorMessagesNeverContainTheToken(t *testing.T) {
	const token = "super-secret-oauth-token-value"
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		w.WriteHeader(http.StatusInternalServerError)
	}))
	defer srv.Close()

	_, err := FetchUsage(context.Background(), srv.Client(), srv.URL, token)

	require.Error(t, err)
	assert.NotContains(t, err.Error(), token, "FetchUsage's error text must never contain the token")
}
