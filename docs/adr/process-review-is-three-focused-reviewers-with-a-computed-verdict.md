---
id: process-review-is-three-focused-reviewers-with-a-computed-verdict
type: decision
status: accepted
date: 2026-09-22
summary: Review is three parallel Opus reviewers — correctness, browser, maintainability — each owning one class of defect, merged into one review.md whose verdict a script computes.
features: []
tags: [pipeline]
files: [.claude/agents/review-work.md, .claude/agents/review-browser.md, .claude/agents/review-maintainability.md, .claude/skills/orchestrate/SKILL.md, .claude/skills/orchestrate/scripts/orch-state.py, internal/kb/pack.go]
tests: [TestPack_IncludesOnlyTheConventionsSectionsForTheRole]
refs: [kb:adr/process-gates-run-once-by-orchestrator-before-review, kb:adr/process-doc-reconcile-after-review, kb:lesson/surface-never-measured-against-its-host, kb:lesson/finding-severity-misrouted, kb:lesson/handoff-commit-defects, plans/_audit/code-quality-2026-09-22.md]
supersedes: []
---
**Context.** One 347-line review agent ran the gates, drove the browser, reviewed both code
trees, checked tokens, tests, comments, Doc Delta and diagrams, and wrote one verdict. Across all 58
review files it sampled rather than swept: markdown-viewing spent five cycles finding one
browser-measured Critical per cycle on a different host each time
(kb:lesson/surface-never-measured-against-its-host). It never looked for maintainability — 0 of 221
agent-tagged findings concern patterns, coupling or principles, 3 duplication, 5 concurrency —
because its checklist is conformance and it reads only the files the implementation logs name. Its
pack ran at 18,700 words against an 8,000 budget.

**Options.** (A) Trim the one agent. (B) Split by code tree: daemon reviewer, web reviewer, an
overall reviewer. (C) Split by the *kind of evidence* each job needs: correctness against the plan
(statements), a browser matrix (observation), a newcomer's read with the plan withheld (shape).

**Decision.** C. The previous two splits that paid off — e2e-validate and doc-reconcile — each moved
a *job* out of review, not a directory. B was rejected: Go findings are sparse and mostly Minor,
the cross-cutting checks (protocol on both sides, Doc Delta, diagrams) need one reader who saw
both trees, and daemon-only plans would spawn an empty web reviewer. The maintainability reviewer
deliberately does not read the plan, so it judges the code the way a newcomer would; it reads the
implementation logs' `design:` lines instead. Each definition states what it owns, so a defect is
filed once. The verdict is the worst of the parts and the gates — `needs-changes` on any
agent-tagged issue at any severity — computed by `orch-state.py merge-review`, which demotes each
part's own verdict line so the merged file carries exactly one `**Verdict**:`; the substring
checks in the state script and `/land` stay valid. Reviewers do not commit: three parallel commits
race on the index, and the merger owns the artifact (the rule in
kb:lesson/handoff-commit-defects is honoured by the orchestrator's single commit).

**Consequences.** `review.md` remains the artifact; its parts are `review.code.md`,
`review.browser.md`, `review.maintainability.md`, archived per cycle beside it. The browser
reviewer is skipped for daemon-only plans and, on a delta cycle, when no web source changed since
the previous review commit (`review_commits[N]` in state); the maintainability reviewer is skipped
on a delta cycle when no source changed. Per-cycle review cost rises (roughly 1.5–2× for a UI
plan); a saved cycle saves its fix waves, wave gates and re-validate. The maintainability reviewer
is expected to *add* findings at first — that is the price of the goal, not a regression. Each
reviewer has its own `kb pack` role, so no pack carries another job's records.
