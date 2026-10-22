---
id: triage-section-defaults-to-issues
type: decision
status: superseded
date: 2026-10-15
summary: Every new entry files under the Issues section unless --section or a decisions override says otherwise; the run never asks, and ranking is a hand edit after.
features: [triage]
tags: [pipeline, user-decision]
files: [internal/triage/apply.go, tools/triage/main.go, TODO.md]
tests: [TestApplyFilesByKind]
refs: [kb:adr/process-backlog-entries-are-the-users-to-file, kb:adr/triage-state-derived-from-todo]
supersedes: []
---
**Context.** The skill presented a table and waited for the developer to name a section per issue before writing anything, so a quick or unattended pass could not complete, and in practice every entry went to `## Issues` and was regrouped by hand later anyway.

**Options.** (A) Keep the question. (B) Default to `## Issues`, with a run-wide `--section` and an optional per-issue decisions file, and leave ranking to the hand edit that already happens.

**Decision.** B, settled with the developer, who also noted that `TODO.md`'s structure and the way the backlog is worked want a cleanup pass of their own (filed in the backlog). The proposer's `section_hint` is recorded in the table and the report; it never decides. Only the user files an item into the backlog — triage is the program-driven path that rule names, and the section is part of the entry it files.

**Consequences.** `apply` validates a section name against the known list and refuses an unknown one. `/triage N` is now one fetch, one proposer and one apply.
