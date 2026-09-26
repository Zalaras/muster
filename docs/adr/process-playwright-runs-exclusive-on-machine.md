---
id: process-playwright-runs-exclusive-on-machine
type: decision
status: accepted
date: 2026-09-26
summary: Every Playwright run holds a per-user machine-wide flock exclusively and unit-test runs hold it shared; a busy lock waits, names its holder, then exits 75.
features: []
tags: [testing, pipeline, user-decision]
files: [tools/gatelock/main.go, tools/gatelock/lock.go, web/e2e/helpers/gatelock.ts, web/playwright.config.ts, Makefile, .claude/skills/orchestrate/scripts/gates.sh, .claude/skills/orchestrate/scripts/orch-cleanup.sh]
tests: [TestRunBusyCombinations, TestReentrancy, TestHoldUntilStdinCloses]
refs: [kb:lesson/concurrent-e2e-across-worktrees-goes-red, kb:lesson/concurrent-build-invalidates-running-e2e, docs/history/design/test-strategy.md, docs/conventions.md]
supersedes: []
---
**Context.** Parallel worktrees were measured before they were built: two `make e2e` on this machine go red, one beside `make test-race` goes red, halving Playwright's workers does not help, two unit-test runs are fine (kb:lesson/concurrent-e2e-across-worktrees-goes-red). Agents start Playwright directly (`npx playwright test <file>`), so a Makefile-only guard misses the runs that matter. macOS has no `flock(1)`; `lockf(1)` is exclusive-only.

**Options.** (A) Fewer workers when sharing — measured, still red. (B) A lock in the Makefile only — misses direct runs. (C) A Go flock tool with shared and exclusive modes, held from Playwright's `globalSetup` by a child that releases on stdin EOF (a SIGKILLed runner cannot keep it), shared by `make test`/`test-race`, once around a `gates.sh` run, and by `orch-cleanup.sh` while it kills and sweeps. (D) A daemon-side scheduler — parked with the product's merge queue.

**Decision.** C, the developer's choice. Re-entrancy rides `MUSTER_GATELOCK=<mode>` in the child's environment: exclusive covers everything, shared covers shared, exclusive under a shared ancestor is refused (exit 1), never deadlocked. A busy lock waits (240 s default; `gates.sh` 150 s, the Bash tool's 10-minute ceiling minus a ~390 s baseline), names its holder every 15 s, and exits 75 (`EX_TEMPFAIL`): rerun, nothing failed. Callers build `bin/gatelock` — `go run` exits 1 for any non-zero program exit, and make exits 2 on a failed recipe, so 75 survives only a direct invocation; elsewhere the `gatelock: busy` message is the contract.

**Consequences.** A second worktree's sweep waits up to one full sweep. A killed `gatelock run` releases while its child runs on (unprotected, never deadlocked); the fd is never inherited, so a leaked daemon cannot hold the lock. Open: a sweep beside `make lint` or a human build is unmeasured and unlocked; `make canary` takes the lock on the same reasoning, unmeasured.
