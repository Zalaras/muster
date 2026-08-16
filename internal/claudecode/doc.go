// Package claudecode is the adapter boundary for everything Claude-Code-specific:
// hook payloads, the status-line payload, CLI invocation and version pinning.
//
// The boundary rule (SPEC.md §8, "Dependency posture"): no package above this one may know
// that the managed agent is Claude Code. They deal in Muster's own domain types — sessions,
// states, usage samples — so that a Claude Code interface change is a one-package fix, and
// supporting another agent CLI later means adding a sibling adapter rather than editing the
// daemon.
//
// Two measured facts shape everything here. Both come from the step-1 spikes against 2.1.233
// and are recorded in spikes/canary-fields.md:
//
//   - Hook payloads carry no timestamp and no sequence number. Ordering must come from a
//     monotonic per-session seq assigned at ingest; prompt_id and tool_use_id are the only
//     correlation keys available.
//   - Hook delivery is best-effort and at-most-once. A dropped event is dropped permanently,
//     with no retry and no replay, so every consumer must tolerate gaps rather than assume a
//     complete event stream.
package claudecode
