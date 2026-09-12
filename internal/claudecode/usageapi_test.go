package claudecode

import (
	"context"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// measuredUsageBody is the real GET /api/oauth/usage response shape measured live
// 2026-08-30 against Damian's own token (docs/history/spikes/canary-fields.md "GET /api/oauth/usage
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
	assert.True(t, got.ModelScoped[0].ResetsAt.Equal(time.Date(2026, 9, 1, 13, 59, 59, 522599000, time.UTC)),
		"got %v", got.ModelScoped[0].ResetsAt)
	assert.Equal(t, time.UTC, got.ModelScoped[0].ResetsAt.Location())
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
