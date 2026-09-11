package claudecode

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"time"
)

// ErrUnauthorized is returned by FetchUsage when Claude Code's OAuth token was rejected
// (401 or 403) — internal/server maps this to the wire's "unauthorized" error kind.
var ErrUnauthorized = errors.New("usage api: unauthorized")

// usageAPIPath is GET /api/oauth/usage (docs/history/spikes/canary-fields.md "GET /api/oauth/usage
// measured live 2026-08-30") — undocumented, re-checked on every Claude Code pin bump.
const usageAPIPath = "/api/oauth/usage"

// usageAPITimeout bounds one fetch (REQ-3/Edge Case 11): the poll loop must never block
// on a wedged endpoint.
const usageAPITimeout = 5 * time.Second

// UsageWindow is one per-model weekly-scoped usage window read from
// GET /api/oauth/usage's `limits[]`. Neutral vocabulary — internal/usage.ModelWindow is
// this seam's other half; internal/server maps between them (mirrors StatusAccount →
// usage.Sample, m3 review cycle-1 Minor 3).
type UsageWindow struct {
	DisplayName string
	UsedPct     float64
	ResetsAt    time.Time
}

// UsageReport is the neutral result of interpreting one /api/oauth/usage response.
// ModelScoped is nil when the response carried no weekly_scoped entries — InterpretUsageReport
// never distinguishes "no limits key" from "limits present but empty" from "every entry
// filtered out"; all three produce a nil slice, and it is the caller's job (the poller)
// to represent "a successful fetch happened" as a non-nil (possibly empty) list.
type UsageReport struct {
	ModelScoped []UsageWindow
}

// usageAPIResponse is the subset of GET /api/oauth/usage's response InterpretUsageReport
// reads. Many other top-level keys exist in the real response (amber_ladder,
// seven_day_opus, extra_usage, …) and are deliberately ignored (canary-fields.md).
type usageAPIResponse struct {
	Limits []usageAPILimit `json:"limits"`
}

type usageAPILimit struct {
	Kind     string          `json:"kind"`
	Percent  float64         `json:"percent"`
	ResetsAt json.RawMessage `json:"resets_at"`
	Scope    *usageAPIScope  `json:"scope"`
}

type usageAPIScope struct {
	Model *usageAPIScopeModel `json:"model"`
}

type usageAPIScopeModel struct {
	DisplayName *string `json:"display_name"`
}

// FetchUsage calls GET <baseURL>/api/oauth/usage with the Claude Code OAuth token
// (docs/history/spikes/canary-fields.md's measured headers) and decodes the response. token is never
// logged here or by any caller (REQ-2).
func FetchUsage(ctx context.Context, client *http.Client, baseURL, token string) (UsageReport, error) {
	ctx, cancel := context.WithTimeout(ctx, usageAPITimeout)
	defer cancel()

	req, err := http.NewRequestWithContext(ctx, http.MethodGet, baseURL+usageAPIPath, nil)
	if err != nil {
		return UsageReport{}, fmt.Errorf("building usage request: %w", err)
	}
	req.Header.Set("Authorization", "Bearer "+token)
	req.Header.Set("anthropic-beta", "oauth-2025-04-20")
	req.Header.Set("Content-Type", "application/json")

	resp, err := client.Do(req)
	if err != nil {
		return UsageReport{}, fmt.Errorf("requesting usage: %w", err)
	}
	defer func() { _ = resp.Body.Close() }()

	if resp.StatusCode == http.StatusUnauthorized || resp.StatusCode == http.StatusForbidden {
		return UsageReport{}, ErrUnauthorized
	}
	if resp.StatusCode != http.StatusOK {
		return UsageReport{}, fmt.Errorf("usage api returned status %d", resp.StatusCode)
	}

	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return UsageReport{}, fmt.Errorf("reading usage response: %w", err)
	}
	return InterpretUsageReport(body)
}

// InterpretUsageReport is the pure decode InterpretStatus mirrors for the status line —
// it never does I/O. Only `kind == "weekly_scoped"` entries carrying a non-empty
// `scope.model.display_name` become a UsageWindow (REQ-4); a missing `limits` key,
// other kinds, a null/empty display_name, an unparseable resets_at on one entry, and
// unknown top-level keys are all ignored rather than erroring — an undocumented,
// evolving endpoint (canary-fields.md) must not be able to break the whole poll over one
// unexpected entry.
func InterpretUsageReport(body []byte) (UsageReport, error) {
	var resp usageAPIResponse
	if err := json.Unmarshal(body, &resp); err != nil {
		return UsageReport{}, fmt.Errorf("decoding usage response: %w", err)
	}

	var out UsageReport
	for _, l := range resp.Limits {
		if l.Kind != "weekly_scoped" {
			continue
		}
		if l.Scope == nil || l.Scope.Model == nil || l.Scope.Model.DisplayName == nil || *l.Scope.Model.DisplayName == "" {
			continue
		}
		resetsAt, err := parseResetsAt(l.ResetsAt)
		if err != nil {
			continue
		}
		out.ModelScoped = append(out.ModelScoped, UsageWindow{
			DisplayName: *l.Scope.Model.DisplayName,
			UsedPct:     l.Percent,
			ResetsAt:    resetsAt,
		})
	}
	return out, nil
}

// parseResetsAt accepts resets_at either as an RFC3339(Nano)-with-offset string (the
// measured live shape, e.g. "2026-09-01T13:59:59.522599+00:00") or an integer epoch
// seconds (REQ-4's dual format).
func parseResetsAt(raw json.RawMessage) (time.Time, error) {
	var s string
	if err := json.Unmarshal(raw, &s); err == nil {
		t, err := time.Parse(time.RFC3339Nano, s)
		if err != nil {
			return time.Time{}, fmt.Errorf("parsing resets_at %q: %w", s, err)
		}
		return t.UTC(), nil
	}
	var epoch int64
	if err := json.Unmarshal(raw, &epoch); err == nil {
		return time.Unix(epoch, 0).UTC(), nil
	}
	return time.Time{}, fmt.Errorf("resets_at is neither a string nor an integer: %s", string(raw))
}
