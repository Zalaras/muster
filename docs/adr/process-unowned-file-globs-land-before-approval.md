---
id: process-unowned-file-globs-land-before-approval
type: decision
status: accepted
date: 2026-09-23
summary: New files check-kb reports as owned by no feature get their spec globs before an approval cycle, since a red gate blocks the approval doc-reconcile needs.
features: []
tags: [pipeline, user-decision]
files: [.claude/skills/orchestrate/scripts/orch-state.py, .claude/agents/doc-reconcile.md]
tests: []
refs: [plan:new-session-improvement, plans/new-session-improvement/decisions/check-kb-before-approval/decision.md, kb:adr/process-doc-reconcile-after-review, kb:adr/process-review-split-three-reviewers-computed-verdict]
supersedes: []
---
**Context.** `make check-kb` fails for every new source file no feature spec's glob owns.
Feature specs belong to doc-reconcile, which runs only after an approved review
(kb:adr/process-doc-reconcile-after-review). The merged review verdict is computed, and any red
gate forces `needs-changes` (kb:adr/process-review-split-three-reviewers-computed-verdict). So a
plan that adds files can never be approved: new-session-improvement exhausted its three cycles
on this alone.

**Options.** (A) Land the staged globs before an approval cycle. (B) Treat the plan's own unowned
files as the expected state and let Completion's Final Validation be the binding check, which
needs a merge-script override.

**Decision.** A, the developer's choice. The globs are registry wiring, not present-tense
claims, so landing them early moves no prose ahead of review. The gate stays computed and honest.

**Consequences.** The orchestrator adds the glob entries a plan's `doc-delta.md` stages, to the
frontmatter only, before the review cycle that can approve. Doc-reconcile still owns the spec
bodies and finds the globs already in place. Whether `orchestrate/SKILL.md` should say this is a
proposal for the developer, not decided here.
