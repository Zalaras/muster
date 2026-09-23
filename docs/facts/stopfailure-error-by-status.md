---
id: stopfailure-error-by-status
type: fact
status: active
date: 2026-09-23
summary: StopFailure.error by induced failure: 429 rate_limit, 5xx/529 server_error, 404 model_not_found, 401/403 authentication_failed; overloaded never occurs.
features: [lifecycle, ingest]
tags: [claude-code-format]
files: [internal/claudecode/interpret.go, internal/session/machine.go]
tests: [TestInterpret_StopFailure]
refs: [test/rig/captures/capture-8.jsonl, kb:fact/stopfailure-error-taxonomy, kb:fact/unknown-model-fails-first-turn]
verified: 2.1.280..canary
guard: TestStopFailureErrorByStatus
---
The binary's `StopFailure.error` enum has 13 values: `authentication_failed`,
`oauth_org_not_allowed`, `account_on_hold`, `verification_required`, `billing_error`,
`rate_limit`, `overloaded`, `invalid_request`, `model_not_found`, `server_error`, `unknown`,
`max_output_tokens`, `cloud_credential_error`. Induced through the fail-proxy with
`CLAUDE_CODE_MAX_RETRIES=0`, every failure below emitted exactly `SessionStart`,
`UserPromptSubmit`, `StopFailure`, `SessionEnd`:

- 400 with a plain message → `unknown`. 408 → `unknown`.
- 400 "prompt is too long…" → `invalid_request`. 413 → `invalid_request`.
- 400 "…credit balance is too low…" → `billing_error`.
- 401 → `authentication_failed`. 403 → `authentication_failed`.
- 403 "OAuth authentication is currently not allowed for this organization" →
  `oauth_org_not_allowed`.
- 404 → `model_not_found`.
- 429 → `rate_limit`, with or without the `anthropic-ratelimit-unified-*` headers. With
  `…-status: rejected` in an interactive session, the TUI also arms an auto-resume
  ("continuing automatically at 9pm"). What that resume emits was not measured.
- 500, 502, 503, **529**, and a refused connection → `server_error`. `overloaded` is in the
  enum but has no code path.
- A real turn capped by `CLAUDE_CODE_MAX_OUTPUT_TOKENS=1` → `max_output_tokens`.

Not induced: `account_on_hold`, `verification_required` (a 403 mentioning verification gave
`authentication_failed`) and `cloud_credential_error`, which is Bedrock/Vertex only.
`last_assistant_message` carries the user-facing sentence, and `error_details` is present
only for the `invalid_request` cases.

Evidence: interface probe 2026-09-23, instance 8. 18 headless fail-proxy sessions, 1 real
capped headless session, 1 interactive 429. Guarded since 2026-09-23 by
`TestStopFailureErrorByStatus` (canary run I, zero tokens): 429, 500, 529, 404, 401 and the three
400 messages. 408, 413, 502, 503, the 403 rows and `max_output_tokens` stay probe-measured.
