---
id: process-e2e-one-load-policy
type: decision
status: accepted
date: 2026-09-06
summary: One load policy in the Playwright config: four workers, 15 s expect and 60 s test timeouts; specs may shorten a timeout, never lengthen one.
features: []
tags: [testing, pipeline, user-decision]
files: [web/playwright.config.ts, web/e2e/helpers/fixtures.ts, docs/conventions.md]
tests: []
refs: [docs/history/spec-changelog.md, docs/design/test-strategy.md, docs/conventions.md, plan:file-drop-fix, kb:adr/process-e2e-explicit-fixtures, kb:adr/process-e2e-no-playwright-retries]
supersedes: []
---
**Context.** Three load-sensitivity flakes in a row each failed a different unrelated spec on a default expect timeout, while sibling assertions in the same files carried a longer one by hand. The interim fix for the third had been to run the new spec file serially, which caps its load but lets one red test mask the rest of the file. Per-site timeouts were a threshold the suite would keep crossing as plans added tests.

**Options.** (A) Raise the timeouts that are marginal, site by site. (B) Serial mode on the heaviest files. (C) One policy in the config: a worker cap that bounds the daemons alive at once, one expect timeout and one test timeout that every wait inherits, with shortening allowed and lengthening forbidden.

**Decision.** C, settled with Damian. A timing gate on a shared machine is a flake generator, so the policy sets bounds once and removes per-test numbers rather than tuning them.

**Consequences.** Most polls and the stub-ready waits that had sat on the default now inherit the longer bound with no per-site edits. Redundant per-test timeout lines and fixed sleeps were removed; a stays-unchanged check uses the one sanctioned hold. The config and the fixtures module belong to the web implementer, never the E2E author, to keep the gate honest.
