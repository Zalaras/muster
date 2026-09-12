---
id: handoff-commit-defects
type: lesson
status: active
date: 2026-08-31
summary: review.md left untracked; fix-wave commits shipped with the literal '(review cycle N)' or a guessed number. Agents commit their files and copy the label.
features: []
tags: [pipeline]
roles: [review, orchestrator, daemon-impl, web-impl, e2e-specs]
files: []
tests: []
refs: [plan:new-session-dialog, plan:file-drop-fix, docs/conventions.md, .claude/agents/review-work.md, .claude/skills/orchestrate/SKILL.md]
---
**What happened.** A reviewer left `review.md` untracked, and the orchestrator had to commit it as a chore before the gate could read the verdict. Fix-wave agents guessed their commit suffix: two shipped the literal `(review cycle N)`, two more guessed the wrong number, and two pre-review fixes shipped as `(review cycle 1)` because that case had no suffix at all.

**Cost.** A mop-up commit, and a branch history a retro could not read for its cycle count.

**What changed.** Every agent commits its own files before reporting; an uncommitted file is the agent's defect, and the orchestrator commits it only as a labelled chore. The orchestrator hands each fix-wave prompt the exact label, `(review cycle <N>)` or `(pre-review fix)`, the only two forms the agent definitions know, and agents copy it verbatim.
