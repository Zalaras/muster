---
id: launch-group-row-moves-between-tabs
type: decision
status: accepted
date: 2026-10-05
summary: The launch dialog's Group row is one set of nodes that sits under Title on New and in a slot under the past-sessions list on Resume.
features: [launch, past-sessions]
tags: [ux]
files: [web/src/features/launchgroup.ts, web/src/render/launch.ts, web/index.html]
tests: []
refs: [plan:groups, plans/groups/web-implementation.md, kb:spec/launch, kb:spec/past-sessions]
supersedes: []
---
**Context.** The plan puts a Group row under Title on both tabs. The Resume tab hides the New tab's `.fields` block whole (`past-sessions.spec.ts` asserts it), so a row kept inside `.fields` is hidden on Resume.

**Options.** (A) Keep the row in `.fields` and hide its siblings on Resume, breaking the existing assertion and the tab's layout. (B) Two rows, one per tab, kept in sync. (C) One row whose nodes move between two homes: under Title in `.fields` on New, into `#group-resume-slot` under the list on Resume.

**Decision.** C. One select, one choice across both tabs, no sync; the existing spec keeps its meaning.

**Consequences.** A choice made on one tab survives switching tabs. The row's position in the Resume tab is below the list rather than under a Title row the tab does not have.
