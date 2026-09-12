---
id: validate-repair-weakened-the-assertion
type: lesson
status: active
date: 2026-09-03
summary: A narrowed locator pointed where the element is never created, green and asserting nothing; two out-of-delta tests were silently deleted. Majors both.
features: []
tags: [testing]
roles: [e2e-validate, e2e-specs, review]
files: []
tests: []
refs: [plan:file-drop-fix, plan:new-session-dialog, .claude/agents/e2e-specs.md]
---
**What happened.** Two validate repairs made red green by asserting less. A narrowed locator pointed into a subtree where the element is never created, so the test passed while asserting nothing. In another run two tests covering behaviour outside the plan's delta, one of them demanded by a prior review, were deleted without a word.

**Cost.** A review Major each, and coverage a prior review had paid for was briefly gone.

**What changed.** Every repair is declared in the Repairs table with the requirement its assertion still covers, and proven by breaking the implementation deliberately so the repaired assertion is what goes red, then restoring the tree. A test outside the delta is adapted to the new UI, never dropped; one believed obsolete is listed with the reason so the orchestrator and reviewer can veto. If the only way to green is weaker, that is an implementation-bug.
