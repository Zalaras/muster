---
id: comment-truth-is-plan-wide-not-diff-wide
type: lesson
status: active
date: 2026-10-05
summary: Two review Majors in one run were comments that the plan's accepted deviation had made false; the agents' comment grep covered only their own diffs.
features: []
tags: [pipeline]
roles: [daemon-impl, web-impl, daemon-tests, web-tests]
files: []
tests: []
refs: [plan:groups, plans/groups/review.cycle2.md, plans/groups/review.cycle3.md, kb:adr/rail-pin-invariant-scoped-per-section]
---

**What happened.** The daemon implementation chose option C′ (a section reuses its own railPos values; nothing is renumbered 0..n-1). The `applyPin` comment in railorder.go still described the old contiguous renumber and reached review cycle 2 as a Major; the test agent's reword of a second comment in cycle 2 asserted the repair "lowers values too", false for duplicate rows, and reached cycle 3 as a Major. worker-rules § Comments asks each agent to grep for comments describing behaviour *it* changed; neither agent had changed `rebuild`, the plan had.

**Cost.** Two review cycles whose only agent-tagged issues were comment sentences, each with a full gate run.

**What changed.** Before a fix wave's commit, grep every comment that names a symbol the plan's accepted deviations changed (the log's `deviation:` lines and the plan's Implementation Notes name them), not only the symbols the wave's own diff touched; a sentence about a repair path the test does not exercise says so rather than generalising.
