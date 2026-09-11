---
id: process-transient-displays-not-oracles
type: decision
status: accepted
date: 2026-09-11
summary: E2E specs assert the state the UI settles in, never a display a later render replaces; the lint rejects the known transient oracle and a soak target proves.
features: []
tags: [testing, pipeline, user-decision]
files: [web/scripts/e2e-lint.sh, web/e2e/terminal.spec.ts, web/e2e/views.spec.ts, Makefile, docs/conventions.md, docs/design/test-strategy.md]
tests: [web/e2e/terminal.spec.ts, TestHandleTerminal_KillingTheTmuxSessionCloses4001AndNudgesLiveness]
refs: [docs/history/todo-done.md, docs/design/test-strategy.md, docs/conventions.md, kb:adr/process-e2e-one-load-policy, kb:adr/process-e2e-lint-mechanises-fixture-rules, kb:adr/process-e2e-no-playwright-retries]
supersedes: []
---
**Context.** The last flaky spec on the default branch asserted the session-ended overlay after a pane kill, blamed attach load in a comment and had widened its timeout. A timed probe showed the overlay is a transient of a few tens of milliseconds: the terminal socket's close paints it, then the liveness poll's dead upsert disposes the surface and mounts the dead surface. When the browser handles the state upsert first, the overlay never exists and no timeout can reach it. A tile test carried the same oracle.

**Options.** (A) Widen the timeout again or retry. (B) Assert the durable end state, socket closed, dead surface visible, region unmounted, and leave the close code to the Go test that already pins it; add the transient oracle to the E2E lint; prove the fix by running the file many times concurrently through a soak target with retries still zero.

**Decision.** B, Damian's call that it be fixed before the first release. The retro rule for a broken rule is to mechanise it.

**Consequences.** A change that touches a flaky spec is proven with the soak target, never a widened timeout or a retry. The rule generalises: any display a later render pass replaces is not an oracle, and the lint is where the next one goes.
