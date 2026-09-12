---
id: completion-claimed-before-approved-verdict
type: lesson
status: active
date: 2026-09-06
summary: 'Only approved completes it' was prose only; the state script accepted completed regardless, cycle counts were wrong in 2 of 5 runs. The script refuses now.
features: []
tags: [pipeline]
roles: [orchestrator, retro]
files: []
tests: []
refs: [plans/_audit/skills-agents-audit.md, .claude/skills/orchestrate/scripts/orch-state.py, .claude/skills/orchestrate/SKILL.md]
---
**What happened.** The rule that only an approved review completes a pipeline lived only in prose, restated three times, and the state script accepted `status completed` whatever `review.md` said. The review-cycle count a retro needs was wrong in two of five multi-cycle runs checked, review files followed five naming schemes, and the failed-step fields were never used in 22 runs.

**Cost.** Completion was a claim from memory, and the one number a retro depends on could not be trusted.

**What changed.** `orch-state.py` refuses `status completed` and `done --next completed` unless `review.md` on disk says `**Verdict**: approved`; `archive` names cycle files uniformly; the three prose restatements collapsed to one line. The orchestrator additionally refuses completion while any suite or build is red or the tree is dirty beyond the pre-flight strays.
