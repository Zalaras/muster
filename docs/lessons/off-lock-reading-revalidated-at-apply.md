---
id: off-lock-reading-revalidated-at-apply
type: lesson
status: active
date: 2026-10-01
summary: Two repo-poll races had one cause: a git reading taken outside the manager lock was applied later without re-checking what it was taken against.
features: [card-location, lifecycle]
tags: [pipeline]
roles: [daemon-impl, daemon-tests, plan-work]
files: [internal/server/reporefresh.go, internal/session/repo.go]
tests: []
refs: [plan:stale-dirs-models-branches, plans/stale-dirs-models-branches/review.code.cycle1.md, plans/stale-dirs-models-branches/test-specs.md, plans/stale-dirs-models-branches/daemon-implementation.md]
---
**What happened.** The plan required that no git subprocess run under the session manager's lock
(D15), so the repo poll snapshots its targets, reads git outside the lock, then applies. Twice the
apply trusted a reading whose basis had changed. In review cycle 1, a launch directory removed
between the stat and the git read nulled the card's repo for good. A cycle 2 E2E fold-back then
found a session that died while its reading was in flight getting the new branch on its dead card,
10/60 and 21/60 in a soak. The fixes re-check the directory after the reads and compare a death
counter at apply.

**Cost.** One cycle 1 Critical, and a fold-back inside cycle 2: a daemon fix, a test wave and an
E2E re-run.

**The lesson.** A reading taken outside a lock is applied only after re-checking, under the lock,
everything it was taken against: alive, the same incarnation, the input still present. Each of
those gets a unit test that fails without the check.
