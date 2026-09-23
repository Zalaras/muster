---
id: retention-rule-decided-outside-the-owners-lock
type: lesson
status: active
date: 2026-09-23
summary: A keep-or-replace plan rule read the stored value, released the lock, then wrote; two goroutines ran it, so a scan could clear a plan set in between.
features: [reader, lifecycle]
tags: [state-machine]
roles: [daemon-impl, plan-work]
files: [internal/session/manager.go, internal/server/reader.go]
tests: []
refs: [plan:frontmatter, plans/frontmatter/review.maintainability.cycle1.md]
---
**What happened.** The plan made a planless transcript scan keep a session's known plan, and let the implementer put the rule in the caller (`scanPlan`) or the setter (`Manager.SetPlan`), weighing only who calls it. The implementer chose the caller: read the plan with `Get`, decide, then write with `SetPlan` — two separate holds of `Manager.mu`. `scanPlan` runs on the ingest worker and on every reader-list request goroutine, so a request could read "no plan", the worker could commit one, and the request would then write null over it. `make test-race` stayed green: every access was locked, so it was a lost update, not a data race.

**Cost.** A cycle-1 maintainability Major, a 15-minute implementation fix that moved the rule into `Manager.ApplyPlanScan`, and a test wave behind it.

**The lesson.** A rule that reads stored state and decides what to write back, reachable from two goroutines, is decided inside the owner's lock; a plan offering the caller as its home is offering a lost update.
