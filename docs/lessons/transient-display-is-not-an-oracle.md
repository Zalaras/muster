---
id: transient-display-is-not-an-oracle
type: lesson
status: active
date: 2026-09-11
summary: E12 flaked for weeks on a ~25 ms overlay a later render pass destroys; assert the settled state and prove a flake fix with e2e-soak, not one green run.
features: [surfaces]
tags: [testing, ux]
roles: [e2e-specs, e2e-validate, web-tests, review]
files: [web/scripts/e2e-lint.sh]
tests: [TestHandleTerminal_KillingTheTmuxSessionCloses4001AndNudgesLiveness]
refs: [kb:adr/process-transient-displays-not-oracles, docs/history/design/test-strategy.md, Makefile]
---
**What happened.** The last flaky spec on `main` asserted the terminal pane's "session ended" overlay after a kill; its comment blamed PTY attach under load and widened the timeout to 15 s. A timed probe, fifteen kills at chosen phases of the liveness tick, cleared the attach path: the overlay painted 5–9 ms after the kill and the `alive:false` upsert replaced it with the dead surface about 30 ms later. The two travel on different WebSockets; in one of fifteen kills the upsert arrived first, `dispose()` ran, and the overlay never existed. No timeout reaches that.

**Cost.** Three weeks of intermittent red. The dead surface had landed three days after the test was written and a neighbouring test was repointed at it; this one kept the old oracle.

**What changed.** Both tests assert the durable end state: socket closed, the dead surface's end cap, the region unmounted; the close code is a unit test. `e2e-lint` rule 4 rejects the overlay oracle. A flake fix is proven with `make e2e-soak SPEC=<file> N=10`, every repetition green with retries at 0; one green sweep cannot tell a fix from a lucky roll, since the spec passed 304/304 the morning the probe reproduced it.
