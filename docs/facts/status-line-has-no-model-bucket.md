---
id: status-line-has-no-model-bucket
type: fact
status: active
date: 2026-09-11
summary: The status line carries only five_hour and seven_day (plus spend_limit on gateway accounts); the per-model weekly window is never copied in.
features: [usage]
tags: [claude-code-format]
files: [internal/claudecode/status.go, internal/claudecode/usageapi.go]
tests: []
refs: [spikes/FINDINGS.md, plan:usage-model-bar]
verified: 2.1.251..2.1.267
guard: none
---
The status-line builder copies only `five_hour`, `seven_day` and, for gateway accounts,
`spend_limit` out of the unified rate-limit windows. It discards the per-model window
`seven_day_overage_included` even though the client parses it from the API response headers
`anthropic-ratelimit-unified-7d_oi-{utilization,reset}`. The `/usage` dialog's third bar
("Current week (Fable)") comes from a separate call, `GET /api/oauth/usage`
(kb:fact/usage-api-oauth-shape), whose `limits[]` rows are filtered by the server-side Statsig
allowlist `tengu_usage_overage_included_models`. The embedded status-line schema lists only
`five_hour` / `seven_day` / `spend_limit`.

Evidence: read from the installed 2.1.251 bundle 2026-08-30, not from capture; all 2.1.245
captures (capture-4/5, 27 posts) show exactly `["five_hour", "seven_day"]`. Not automatable
as a canary assertion — re-read the `jt={...}` builder on each version bump; the internal
`unifiedWindows` telemetry schema already carries the third window.
