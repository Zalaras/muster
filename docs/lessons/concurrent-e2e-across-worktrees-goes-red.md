---
id: concurrent-e2e-across-worktrees-goes-red
type: lesson
status: active
date: 2026-09-26
summary: Two Playwright suites in two worktrees, or one beside make test-race, went red on the same four timing specs; a machine-wide lock now serialises sweeps.
features: []
tags: [testing, pipeline]
roles: [orchestrator, e2e-specs, web-impl, web-tests, daemon-tests, review]
files: [tools/gatelock/main.go, web/e2e/helpers/gatelock.ts, web/playwright.config.ts, Makefile, .claude/skills/orchestrate/scripts/gates.sh]
tests: [TestRunBusyCombinations, TestRunWaitsUntilReleased, TestReentrancy]
refs: [docs/history/design/test-strategy.md, kb:lesson/concurrent-build-invalidates-running-e2e, kb:adr/process-playwright-runs-exclusive-on-machine, Makefile]
---
**What happened.** Measured on 2026-09-26 (i7-9750H 6c/12t, 16 GB) before adding worktree tooling: `make e2e` alone is 202 s, 463 green, 4.4 cores average. Two `make e2e` in two worktrees at once: 316 and 327 s, 1 and 4 red. The same at 2 workers each: 375 and 387 s, still 1 and 4 red. One `make e2e` beside `make test-race` in the other tree: e2e red. Two `make test` at once: both green, 7 % slower. Always the same specs: `shell.spec.ts:47`, `update.spec.ts:456`, `rail-cards.spec.ts:226`, `embedded.spec.ts:76`. No swap, no leftover processes — scheduling latency, not resource exhaustion.

**Cost.** Nothing shipped, because it was measured before two pipelines ever ran side by side. Unmeasured, every overlap would have been a red review cycle and a fix wave chasing a regression that was not there.

**What changed.** `tools/gatelock` is a per-user flock every Playwright run holds exclusive (`web/playwright.config.ts` globalSetup, so a direct `npx playwright test` is covered too) and `make test` / `make test-race` hold shared; `gates.sh` holds it once around a gate run. A busy lock waits, names its holder every 15 s, and exits 75 when the wait expires: rerun, nothing failed. A red sweep is still re-run alone before it is believed.
