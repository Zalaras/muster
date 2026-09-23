---
id: canary-api-failures-induced-in-process
type: decision
status: accepted
date: 2026-09-23
summary: The canary induces API failures at zero tokens by pointing ANTHROPIC_BASE_URL at an in-test fail server with retries off; it never reads headers.
features: [canary]
tags: [claude-code-format, testing]
files: [test/canary/harness_turns_test.go, test/rig/failapi/failapi.go, test/rig/failproxy/main.go]
tests: [TestStopFailureErrorByStatus, TestStatusLineAroundFailedTurns]
refs: [kb:fact/stopfailure-error-by-status, kb:fact/status-line-around-failed-turns, kb:adr/canary-drives-installed-claude-through-production-chain, kb:adr/process-interface-probe-rig-in-repo]
supersedes: []
---
**Context.** Muster shows `StopFailure.error` verbatim, and its usage gauge reads the status line of sessions whose turns fail. The 2026-09-23 probe measured both through the rig's fail-proxy. Before this record the canary's only failure path was the unauthenticated run, which produces `authentication_failed` and nothing else. So every other mapping, and the failed-turn status line, could change on a bump without a red canary.

**Options.** (A) Keep them as probe-only rituals. (B) Have the canary spawn the rig's `failproxy` binary. (C) Serve the same injected response from an `httptest` server inside the test process, and point `ANTHROPIC_BASE_URL` at it with `CLAUDE_CODE_MAX_RETRIES=0`.

**Decision.** C. No request reaches the API, so a run costs nothing and takes a few seconds. An in-process server needs no build step, no port and no orphan to clean up. The response itself lives in `test/rig/failapi`, which the rig binary also serves, so the canary and the probe cannot drift apart on the error body.

**Consequences.** Runs I and J are the canary's only departure from the production environment: two variables that production never sets. Their settings and argv are production's. The fail server never reads request headers, because under subscription OAuth they carry a live token. A mapping the enum has but no status reaches, like `overloaded`, is asserted only by its absence on 529.
