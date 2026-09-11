---
id: stopfailure-error-taxonomy
type: fact
status: active
date: 2026-09-11
summary: StopFailure.error observed: authentication_failed, server_error, unknown; ten values exist in the binary, and the mapping is not pass-through.
features: [lifecycle, ingest]
tags: [claude-code-format]
files: [internal/claudecode/interpret.go, internal/session/machine.go]
tests: [TestInterpret_StopFailure]
refs: [spikes/FINDINGS.md]
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
