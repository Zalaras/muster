---
id: process-backlog-entries-are-the-users-to-file
type: decision
status: accepted
date: 2026-09-16
summary: A pipeline run proposes backlog entries in the plan's own file; only the user files one into TODO.md, and only a plan's approved Out of scope bypasses that.
features: []
tags: [pipeline]
files: [.claude/skills/orchestrate/SKILL.md, .claude/skills/orchestrate/doc-upkeep.md, .claude/skills/orchestrate/scripts/plan-lint.sh, .claude/agents/review-work.md, .claude/agents/judge.md, .claude/skills/plan-work/SKILL.md, .claude/skills/decide/SKILL.md, .claude/skills/retro/SKILL.md, .claude/skills/interface-probe/SKILL.md, docs/conventions.md]
tests: []
refs: [kb:lesson/backlog-filed-without-the-users-say-so, kb:adr/triage-program-not-model-between-github-and-todo, kb:adr/triage-state-derived-from-todo]
supersedes: []
---
**Context.** Five documents let a run write a new open `TODO.md` item and none gated it — the
orchestrator's doc-upkeep bullet and Completion step 2, plus `/decide`, `/retro` and
`/interface-probe`. Because `## Pre-v1 Cleanup` declares everything under it a v1 blocker,
placement alone promoted a finding to a release blocker. The `/triage` half of the same file had
long since settled the opposite rule: a program splices, the section is a hint, the user chooses.

**Options.** (A) Keep the licence and bound it — a cap, or a named milestone for run-discovered
work. (B) Remove the licence: a run proposes in a file the user reads, and files nothing.

**Decision.** B. A cap still lets a run decide *that* something is worth the user's attention and
*where*, which is the judgement being taken. Proposing costs the run nothing it was already
paying — the reviewer has written the finding either way — and it keeps the "rather than
evaporating" property the old bullet existed for, because `plans/<plan>/` rides the squash onto
`main`. A plan's `## Out of scope` is the single exception, because the user approved that wording
before the run started; it is now a required section, so an absent one cannot read as licence.

**Consequences.** `plans/<plan>/proposed-backlog.md` is a durable artifact, not scratch: a dropped
proposal stays readable on `main`, and the orchestrator commits it at Completion or trips its own
"everything committed" step. Each proposal carries whether a change was requested, so a `[note]`
stays a note. `plan-lint` gains a required `## Out of scope`. Nothing about severity routing moves
— `kb:lesson/finding-severity-misrouted` stands. The dashboard reader will not serve the new file
from the plan route (`kb:adr/reader-served-paths-confined-to-directory-or-plan`).
