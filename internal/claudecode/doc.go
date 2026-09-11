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
// and are recorded in docs/history/spikes/canary-fields.md:
//
//   - Hook payloads carry no timestamp and no sequence number. Ordering must come from a
//     monotonic per-session seq assigned at ingest; prompt_id and tool_use_id are the only
//     correlation keys available.
//   - Hook delivery is best-effort and at-most-once. A dropped event is dropped permanently,
//     with no retry and no replay, so every consumer must tolerate gaps rather than assume a
//     complete event stream.
//
// Since m4-hook-lifetime (2026-08-27) every hook Muster registers, including SessionStart
// and the status line, is a type:"command" wrapper script rather than a plain HTTP hook —
// Claude Code's own type:"http" transport left an unmanaged session's failures visible
// inline and a stopped daemon noisy on every tool call. The wrapper exits 0 silently in
// both cases (kb:anchor/ingest.transport). Wire shapes on /ingest/* are unchanged.
//
// Since new-ui-design-colors (2026-09-02), theme.go also owns Claude Code's own global
// config file (name, location, and its "theme" key) — read-only, polled for the theme
// family that grounds the terminal pane and drives the dashboard's "Follow Claude Code"
// preference.
//
// Since claude-status-fixes (2026-09-03), Interpret also reads a background subagent's
// agent marker (measured 2.1.259, canary-fields.md "Subagent and background-task
// fields") and exposes it to internal/session only as StateInput.FromSubagent — a
// neutral bool, never the payload key name.
package claudecode
