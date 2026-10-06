---
id: process-small-track-for-fixes
type: decision
status: accepted
date: 2026-10-06
summary: Fixes, perf changes, refactors and chores go through /fix — a small-shape plan on an in-place branch through the pipeline's own parts, red test first.
features: []
tags: [pipeline, user-decision]
files: [.claude/skills/fix/SKILL.md, .claude/skills/land/SKILL.md, .claude/agents/daemon-tests.md, .claude/agents/web-tests.md, .claude/agents/e2e-specs.md, CLAUDE.md]
tests: []
refs: [kb:adr/process-agent-harness-before-build-work, kb:adr/process-pipeline-runs-in-sibling-worktree, kb:adr/process-release-bumping-types-require-shipped-change, kb:lesson/main-session-gate-list-dropped-check-kb, docs/conventions.md]
supersedes: []
---
**Context.** The harness ADR let "trivial fixes" skip the pipeline, and CLAUDE.md once said so as a
judgement call; the 2026-09-21 rewording gated the pipeline on the shipped artifact and left the
small case undefined. Fix-shaped plans through `/orchestrate` cost 50–105 minutes and 370–450-line
plans, so patch work was done by hand — 11 of 76 `fix`/`perf`/`refactor` commits on `main`
carry `closes #` — and one such run skipped `check-kb`
(kb:lesson/main-session-gate-list-dropped-check-kb). Every reusable part keys on
`plans/<name>/plan.md` on a `plan/<name>` branch, so agents could not be used ad hoc either.

**Options.** (A) A plan-lite flag inside `/orchestrate`, growing a 550-line skill. (B) A plan-less
brief with new tooling: a path-keyed pack, plan-less gates, brief modes for the agents. (C) A
small-shape plan — the full plan's section names, whole sections dropped — run by a main-session
skill through the existing parts.

**Decision.** C. `/fix` routes anything that changes the shipped artifact without a protocol delta,
a new feature spec or a new UI surface needing a Testable UI Elements table; those three go to
`/orchestrate`, and the developer may route either way. Research with pasted evidence precedes the
plan, and the developer confirms the diagnosis before any change, because a backlog entry can be
wrong. The impl-never-edits-tests boundary stays: a test agent writes the regression test and shows
it red, then the impl agent makes it green. The branch is `plan/<name>` in the primary checkout;
the sibling-worktree rule binds `/orchestrate`, and a worktree remains available when a live
session holds the primary. The `**Shape**` header names the squash commit's type.

**Consequences.** `plan-lint.sh`, `gates.sh`, `features-scope.sh`, `commentpass`, `kb pack`,
`orch-state.py` and the impl and review agents are unchanged; the test agents gain a red-first
mode. `/land` lands either track and takes the type from `**Shape**`. Lessons about this track
carry `roles: [orchestrator]`.
