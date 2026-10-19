---
id: existing-test-cited-without-reaching-new-path
type: lesson
status: active
date: 2026-10-19
summary: An edge case routed to an existing test must name the state that test sets up to reach the new code; one that never reached it cost a review cycle.
features: []
tags: [pipeline, testing]
roles: [planner, orchestrator]
files: []
tests: []
refs: [plan:launch-dialog-fixes, plans/launch-dialog-fixes/review.cycle1.md]
---

**What happened.** The plan's Edge Case 3 routed the new `failed`-branch reset (a vanished first
recent's held values return to the defaults) to the existing deleted-recent test. That test seeds
its recent after the page loads, so the dialog's held list was empty at open and the new reset was
a no-op there: the test passed with or without it.

**Cost.** Review cycle 1's only Major, a fix wave, a second gates run and a re-review.

**What changed.** An edge case routed to an existing test names the state that test sets up and
why that state reaches the new code; when it cannot, the edge case gets a new test.
