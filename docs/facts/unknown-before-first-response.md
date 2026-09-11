---
id: unknown-before-first-response
type: fact
status: active
date: 2026-09-11
summary: Before a session's first API response rate_limits is absent and the context percentages are null: unknown, not 0%.
features: [usage]
tags: [claude-code-format]
files: [internal/claudecode/status.go, web/src/sessions/context.ts]
tests: [TestInterpretStatus_PreFirstResponse, TestInterpretStatus_ZeroUsedPercentageIsRealDataNotNull]
refs: [spikes/FINDINGS.md]
verified: 2.1.233..canary
guard: TestUnknownVersusZero
---
Until a session's first API response the whole `rate_limits` key is absent — not empty, not
null — and in `context_window` the `used_percentage`, `remaining_percentage` and
`current_usage` are `null` with `total_input_tokens: 0`. From the first response on,
`rate_limits` is present on every later post for the life of the session (17 consecutive
posts verified). A null is not "0% used".

When analysing captures, group posts by `session_id`; pooling sessions makes the
absent/present ratio meaningless.

Evidence: 2.1.233 spike captures; on the 2.1.246 canary the pre-response post was captured
1/1 per interactive run, 2/2 runs. The guard checks every pre-response post of run D and skips
honestly when the first captured post already carries `rate_limits`.
