package claudecode

import (
	"encoding/json"
	"time"
)

// statusPayload is the status-line payload's fields InterpretStatus reads
// (docs/history/spikes/canary-fields.md § "Status-line payload" is the field inventory this
// implements against — this is the only function in Muster that reads them).
type statusPayload struct {
	SessionName   *string           `json:"session_name"`
	Model         *statusModel      `json:"model"`
	ContextWindow *statusContext    `json:"context_window"`
	RateLimits    *statusRateLimits `json:"rate_limits"`
}

type statusModel struct {
	ID          string `json:"id"`
	DisplayName string `json:"display_name"`
}

// statusContext mirrors context_window. UsedPercentage is a pointer because it (and
// remaining_percentage/current_usage, both unused here) are null before a session's
// first API response, with total_input_tokens sitting at 0 in that same window — a null
// is not "0%" (REQ-2, canary-fields.md).
type statusContext struct {
	ContextWindowSize int64    `json:"context_window_size"`
	UsedPercentage    *float64 `json:"used_percentage"`
	TotalInputTokens  int64    `json:"total_input_tokens"`
}

// statusRateLimits mirrors rate_limits. The whole key is absent (not empty, not null)
// until a session's first API response (REQ-3, canary-fields.md).
type statusRateLimits struct {
	FiveHour statusBucket `json:"five_hour"`
	SevenDay statusBucket `json:"seven_day"`
}

// statusBucket's resets_at is a Unix epoch integer on the wire, not RFC3339
// (canary-fields.md correction #2) — InterpretStatus is where that conversion happens.
type statusBucket struct {
	UsedPercentage float64 `json:"used_percentage"`
	ResetsAt       int64   `json:"resets_at"`
}

// StatusModel is the neutral {id, displayName} the status line's model object carries.
type StatusModel struct {
	ID          string
	DisplayName string
}

// StatusContext is the neutral context-gauge triple — always adopted all together
// (INV-2), never partially.
type StatusContext struct {
	UsedPct          float64
	TotalInputTokens int64
	WindowSize       int64
}

// StatusBucket is one neutral usage-limit readout (five-hour or seven-day) with the
// wire's epoch reset time already converted to UTC (REQ-3).
type StatusBucket struct {
	UsedPct  float64
	ResetsAt time.Time
}

// StatusAccount is the neutral account-usage reading a status-line payload carries.
// It is deliberately this package's own type rather than internal/usage's Sample, so
// the adapter stays dependency-free of the aggregator (and, transitively, the storage
// layer) — internal/server maps it into a usage.Sample at the seam (m3 review cycle-1
// Minor 3). Field meanings match usage.Sample one-for-one.
type StatusAccount struct {
	FiveHour StatusBucket
	SevenDay StatusBucket
	Model    StatusModel
	Source   string // "subscription" — the status line is the subscription source
}

// StatusUpdate is the neutral result of interpreting one status-line payload (REQ-1):
// optional title, optional model, optional context, optional account usage sample.
// Every field is nil when the payload didn't carry it — callers apply only what's
// present, never inventing a zero value (REQ-2/REQ-3/REQ-4's "only when present" rules).
type StatusUpdate struct {
	Title   *string
	Model   *StatusModel
	Context *StatusContext
	Account *StatusAccount
}

// InterpretStatus derives the neutral StatusUpdate for one status-line payload. It is a
// pure function of the payload bytes — it never reads the wall clock — so callers that
// need a sample's real timestamp (internal/usage.Aggregator.Record) stamp it themselves,
// mirroring how internal/store stamps its own receipt times rather than trusting a
// caller-supplied one.
func InterpretStatus(payload []byte) StatusUpdate {
	var p statusPayload
	_ = json.Unmarshal(payload, &p)

	var out StatusUpdate

	if p.SessionName != nil && *p.SessionName != "" {
		out.Title = p.SessionName
	}

	if p.Model != nil {
		out.Model = &StatusModel{ID: p.Model.ID, DisplayName: p.Model.DisplayName}
	}

	// REQ-2: adopt the context block only when used_percentage is non-null.
	if p.ContextWindow != nil && p.ContextWindow.UsedPercentage != nil {
		out.Context = &StatusContext{
			UsedPct:          *p.ContextWindow.UsedPercentage,
			TotalInputTokens: p.ContextWindow.TotalInputTokens,
			WindowSize:       p.ContextWindow.ContextWindowSize,
		}
	}

	// REQ-3/Edge Case 9: a sample is produced only when rate_limits is present, and only
	// when the model object is present in the same payload — a sample is never recorded
	// with a stale/last-known model.
	if p.RateLimits != nil && p.Model != nil {
		out.Account = &StatusAccount{
			FiveHour: StatusBucket{
				UsedPct:  p.RateLimits.FiveHour.UsedPercentage,
				ResetsAt: time.Unix(p.RateLimits.FiveHour.ResetsAt, 0).UTC(),
			},
			SevenDay: StatusBucket{
				UsedPct:  p.RateLimits.SevenDay.UsedPercentage,
				ResetsAt: time.Unix(p.RateLimits.SevenDay.ResetsAt, 0).UTC(),
			},
			Model:  StatusModel{ID: p.Model.ID, DisplayName: p.Model.DisplayName},
			Source: "subscription",
		}
	}

	return out
}
