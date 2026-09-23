---
id: stopfailure-error-taxonomy
type: fact
status: retired
date: 2026-09-11
summary: Retired: through 2.1.267 StopFailure.error had ten values in the binary, three observed; 2.1.280 has thirteen and the per-status mapping is measured.
features: [lifecycle, ingest]
tags: [claude-code-format]
files: [internal/claudecode/interpret.go, internal/session/machine.go]
tests: [TestInterpret_StopFailure]
refs: [spikes/FINDINGS.md, kb:fact/stopfailure-error-by-status]
verified: 2.1.233..2.1.267
guard: none
---
`StopFailure.error` observed values: `"authentication_failed"`, `"server_error"`, `"unknown"`.
The full taxonomy in the binary: `rate_limit`, `overloaded`, `authentication_failed`,
`oauth_org_not_allowed`, `billing_error`, `invalid_request`, `model_not_found`,
`server_error`, `max_output_tokens`, `unknown`. The mapping is not pass-through: an injected
HTTP 400 with an Anthropic-shaped `invalid_request_error` body surfaced as `"unknown"`, not
`"invalid_request"`.

Evidence: 2.1.233 H2 probe (FINDINGS §3). `TestStopFailureReplacesStop` asserts only the
`authentication_failed` value; the rest is ritual (static inspection).

By 2.1.280 the enum had grown to thirteen values, and nine are induced. See
kb:fact/stopfailure-error-by-status.
