// Package usage holds the account-level usage aggregator (m3-gauges): a neutral Sample
// shape plus one in-memory Aggregator, the kb:adr/usage-no-source-interface seam for a second usage source down
// the line. Nothing here is Claude-Code-format vocabulary — internal/claudecode reads
// the status-line payload keys into its own neutral StatusAccount, and internal/server
// maps that into a Sample at the seam (so this package and the adapter stay mutually
// dependency-free; m3 review cycle-1 Minor 3).
package usage

import "time"

// Bucket is one usage-limit readout (five-hour or seven-day). UsedPct and ResetsAt
// always travel together — a partial bucket is never modeled (REQ-3/REQ-5).
type Bucket struct {
	UsedPct  float64
	ResetsAt time.Time
}

// Model is the sampled status-line model, verbatim.
type Model struct {
	ID          string
	DisplayName string
}

// Sample is one neutral usage reading. SampledAt is stamped by Aggregator.Record, not by
// the caller (mirrors internal/store's own received_at/at stamping) — a caller-supplied
// value here would be ignored.
type Sample struct {
	FiveHour  Bucket
	SevenDay  Bucket
	Model     Model
	SampledAt time.Time
	Source    string // "subscription" in v1
}

// Snapshot is the aggregator's exposed state. Every field is nil until the first
// post-boot sample lands (REQ-7: no hydration from persisted usage_sample rows across a
// daemon restart) — Source is the one field that is never null, matching the wire shape.
type Snapshot struct {
	FiveHour  *Bucket
	SevenDay  *Bucket
	Model     *Model
	SampledAt *time.Time
	Source    string
}

// ModelWindow is one neutral per-model weekly usage window (usage-model-bar,
// 2026-08-30) — internal/claudecode's own UsageWindow is this seam's other half;
// internal/server maps between them at the seam, mirroring StatusAccount → Sample.
type ModelWindow struct {
	DisplayName string
	UsedPct     float64
	ResetsAt    time.Time
}

// ModelSnapshot is ModelScoped's exposed state. Windows is nil until the first
// successful fetch; an empty-but-non-nil slice is a valid, distinct successful result
// (an account with no scoped windows) — REQ-14/INV-1 depend on At mirroring that
// nullability exactly. Error is nil except right after a failed poll — a success clears
// it even when the list itself didn't change. Source is never empty.
type ModelSnapshot struct {
	Windows []ModelWindow
	At      *time.Time
	Error   *string
	Source  string
}
