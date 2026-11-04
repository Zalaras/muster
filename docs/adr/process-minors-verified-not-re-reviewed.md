---
id: process-minors-verified-not-re-reviewed
type: decision
status: accepted
date: 2026-11-04
summary: A Minor never blocks approval or opens a cycle; the orchestrator checks its fix in the diff. Cycle 2+ is a delta by the parts that raised a Critical or Major.
features: []
tags: [pipeline, user-decision]
files: [.claude/skills/orchestrate/review-scale.md, .claude/skills/orchestrate/SKILL.md, .claude/skills/orchestrate/scripts/orch-state.py, .claude/agents/review-work.md, .claude/agents/review-browser.md, .claude/agents/review-maintainability.md, .claude/skills/fix-batch/SKILL.md]
tests: []
refs: [kb:adr/process-review-split-three-reviewers-computed-verdict, kb:lesson/finding-severity-misrouted, kb:lesson/surface-never-measured-against-its-host, plan:review-cycle-cost]
supersedes: []
---
**Context.** Since October every feature run has needed two to four review cycles, median three,
while the pipeline docs grew from 31k to 65k words and the lessons from 59 to 72: retros add a
rule per cause and the next run meets a new one. The verdict rule made any agent-tagged Minor
`needs-changes`, so a naming nit cost a fix wave, its gates and three Opus reviewers again, about
an hour and a half. Later cycles were mostly Minors, bookkeeping, partial fixes and new findings
on unchanged code; whole cycles existed to approve one Minor (see-added-dirs cycle 3,
docs-search-bar cycle 4). The delta re-review applied only after a Minors-only cycle and
still re-ran browser and maintainability whenever `web/src` changed, so always.

**Options.** (A) Keep adding rules per finding class. (B) Cap cycles at two. (C) Price
a Minor at a wave, not a cycle, and make every later cycle a delta by the parts that raised a
Critical or Major.

**Decision.** C, the developer's choice; B was rejected. `approved` is no Critical and no
agent-tagged Major, computed by `merge-review`. Minors still route to their agent's wave; after
its gate the orchestrator reads the diff against the issue's "what a fix must make true" and
records it in `plans/<plan>/minor-check.md`; an unsatisfied Minor goes back once, then to the
proposed backlog. On cycle 2+ `review-work` always runs; the other two only when their own
previous part carried a Critical or Major. Each reviews `git diff review_commits[N-1]..HEAD` and
its own prior items; a finding on untouched code is a `[note]` unless Critical.

**Consequences.** A Minor fix gets gates and a diff read instead of a reviewer's eyes; cycles are
bounded by Criticals and Majors; non-Critical findings on untouched code reach the developer as
backlog. `/retro --audit`'s review-cycle trend measures whether this held.
