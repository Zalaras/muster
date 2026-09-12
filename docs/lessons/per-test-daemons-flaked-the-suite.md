---
id: per-test-daemons-flaked-the-suite
type: lesson
status: active
date: 2026-09-03
summary: One added spec file made make e2e fail 3 of 6 runs with the implementation innocent: every spec spawned its own daemon. Fixtures are explicit and linted.
features: []
tags: [testing, pipeline]
roles: [e2e-specs, plan-work, review]
files: [web/e2e/helpers/fixtures.ts, web/scripts/e2e-lint.sh, web/playwright.config.ts]
tests: []
refs: [plan:file-drop-fix, kb:adr/process-e2e-explicit-fixtures, kb:adr/process-e2e-one-load-policy, kb:adr/process-e2e-lint-mechanises-fixture-rules, docs/history/design/test-strategy.md]
---
**What happened.** Adding one spec file made `make e2e` fail about half the time on the branch, three of six full-suite runs, and the review filed it Critical against the E2E agent because the implementation was innocent. Each spec had been spawning its own scratch daemon, so load grew with every file and every race widened.

**Cost.** A review Critical, and a re-evaluation of the whole test strategy that took a session.

**What changed.** Fixture choice is explicit and uniform: `daemon`, `startDaemon` or `fileDaemon()` from `helpers/fixtures.ts`, a Fixture plan header in every plan, one load policy in `playwright.config.ts` (4 workers, 15 s expect timeout, retries 0). `e2e-lint` mechanises the rules because prose versions of them had already been broken.
