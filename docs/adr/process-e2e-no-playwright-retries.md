---
id: process-e2e-no-playwright-retries
type: decision
status: rejected
date: 2026-09-06
summary: Playwright retries are not enabled, on CI or locally; a retry hides exactly the load sensitivity the gates exist to see, and there is no CI to scope one to.
features: []
tags: [testing, pipeline, never]
files: [web/playwright.config.ts, docs/design/test-strategy.md]
tests: []
refs: [docs/history/spec-changelog.md, docs/design/test-strategy.md, kb:adr/process-e2e-one-load-policy, kb:adr/release-no-ci-test-job-yet]
supersedes: []
---
**Context.** Each time the E2E suite flaked under load, a single retry was on the table as the cheap fix, and it was declined each time. The strategy settlement recorded the refusal so it is not re-argued at the next flake.

**Options.** (A) One retry, perhaps scoped to a continuous-integration run. (B) No retries: a red run is a real signal, to be answered by removing the timing dependence or fixing the coupling.

**Decision.** A is rejected, again. A retry converts a load-sensitivity signal into a green run, which is the opposite of what the pipeline gates are for; and no test job runs in CI, so there is nowhere to scope it that is not the developer's machine.

**Consequences.** Flaky specs are proven fixed by concurrent repeats of the one file with retries still off, never by a widened timeout or a retry. The gates treat one red as a failure. If a CI test job is ever added, this record is the one to revisit, and the default answer is still no.
