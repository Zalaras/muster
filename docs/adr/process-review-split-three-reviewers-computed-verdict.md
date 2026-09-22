---
id: process-review-split-three-reviewers-computed-verdict
type: decision
status: accepted
date: 2026-09-22
summary: Three parallel Opus reviewers (correctness, browser, maintainability) each own one defect class; their parts merge into one review.md with a computed verdict.
features: []
tags: [pipeline]
files: [.claude/agents/review-work.md, .claude/agents/review-browser.md, .claude/agents/review-maintainability.md, .claude/skills/orchestrate/SKILL.md, .claude/skills/orchestrate/scripts/orch-state.py, internal/kb/pack.go]
tests: [TestPack_IncludesOnlyTheConventionsSectionsForTheRole]
refs: [kb:adr/process-gates-run-once-by-orchestrator-before-review, kb:adr/process-doc-reconcile-after-review, kb:lesson/surface-never-measured-against-its-host, kb:lesson/finding-severity-misrouted, kb:lesson/handoff-commit-defects, plans/_audit/code-quality-2026-09-22.md]
supersedes: []
---
**Context.** One 347-line review agent did everything. Across 58 review files it sampled rather
than swept: markdown-viewing spent five cycles finding one browser-measured Critical per cycle
(kb:lesson/surface-never-measured-against-its-host). It never looked for maintainability — 0 of 221
agent-tagged findings concern patterns or coupling — because its checklist is conformance and it
reads only the files the logs name.

**Options.** (A) Trim the one agent. (B) Split by code tree. (C) Split by the evidence each job
needs: statements against the plan, a browser matrix, a newcomer's read without the plan.

**Decision.** C. The two earlier splits that paid off (e2e-validate, doc-reconcile) each moved a *job*
out of review, not a directory. B was rejected: Go findings are sparse, the cross-cutting checks need
one reader who saw both trees, and a daemon-only plan would spawn an empty web reviewer. The maintainability reviewer never reads the plan, so it judges the code as a
newcomer would, from the logs' `design:` lines. Each definition states what it owns, so a defect is
filed once. `orch-state.py merge-review` computes the verdict — worst of the parts and the gates,
`needs-changes` on any agent-tagged issue — and demotes each part's own verdict line so the merged
file carries exactly one `**Verdict**:` for the substring checks in the state script and `/land`.
Reviewers do not commit: parallel commits race on the index (kb:lesson/handoff-commit-defects).

**Consequences.** `review.md` remains the artifact; its parts (`review.code.md`,
`review.browser.md`, `review.maintainability.md`) are archived per cycle beside it. Browser is
skipped for daemon-only plans and, on a delta cycle, when no web source changed since
`review_commits[N-1]`; maintainability is skipped on a delta cycle with no source change.
Per-cycle cost rises (roughly 1.5–2× for a UI plan); a saved cycle saves its fix waves. The
maintainability reviewer will *add* findings at first — the price of the goal.
