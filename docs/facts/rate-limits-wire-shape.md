---
id: rate-limits-wire-shape
type: fact
status: active
date: 2026-09-11
summary: rate_limits has five_hour and seven_day buckets (not weekly), each {used_percentage: float, resets_at: Unix epoch integer}.
features: [usage]
tags: [claude-code-format]
files: [internal/claudecode/status.go]
tests: [TestInterpretStatus_FullPost, TestInterpretStatus_ResetsAtConvertsEpochToUTC]
refs: [spikes/FINDINGS.md]
verified: 2.1.233..canary
guard: TestStatusLineFields
---
```json
"rate_limits": {
  "five_hour": { "used_percentage": 13,                 "resets_at": 1786897200 },
  "seven_day": { "used_percentage": 28.000000000000004, "resets_at": 1787061600 }
}
```

The weekly bucket is keyed `seven_day`, not `weekly`. `resets_at` is a Unix epoch integer, not
an RFC3339 string. `used_percentage` is a float, not an int. Only these two buckets exist in
the status line (kb:fact/status-line-has-no-model-bucket); the whole key is absent before the
first API response (kb:fact/unknown-before-first-response).

Evidence: 2.1.233 spike captures (FINDINGS §2); asserted on every canary run on the last post
of the interactive session.
