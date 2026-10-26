---
id: rate-limit-resets-differ-in-precision-across-sources
type: fact
status: active
date: 2026-10-26
summary: Status-line rate-limit resets fall on whole 10-minute boundaries; the usage API states the same window with microseconds just before one.
features: [usage]
tags: [claude-code-format]
files: [internal/claudecode/usageapi.go, internal/claudecode/status.go]
tests: []
refs: [kb:fact/rate-limits-wire-shape, kb:fact/usage-api-oauth-shape, plan:usage-bar-consistency]
verified: 2.1.237..2.1.310
guard: none
---
Every `rate_limits.five_hour.resets_at` and `rate_limits.seven_day.resets_at` the status line
posted in the rig captures (`test/rig/captures/*.jsonl`, 2.1.237–2.1.310, 27 distinct real
values) is a whole multiple of 600 seconds: the window ends on a 10-minute boundary, stated to
the second. Its `used_percentage` carries float noise (`14.000000000000002`, `7.000000000000001`).

The one recorded usage-API sample (kb:fact/usage-api-oauth-shape, 2026-08-30) gives
`resets_at: "2026-08-30T13:39:59.522275+00:00"`, 0.48 s before the 13:40:00 boundary, with
`utilization: 7.0`.

So the same window reaches Muster as `13:40:00` from one source and `13:39:59.522275` from the
other, and the percentages differ in their last bits. Rounding the API's instant up to the whole
second meets the status line's value. That rests on one API sample; no capture pairs both sources
for one window, which is why `guard` is none.
