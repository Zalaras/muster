---
id: process-land-decides-proposed-backlog
type: decision
status: accepted
date: 2026-09-23
summary: /land puts every open proposed-backlog entry to the user before the merge, files the chosen ones and records each decision, all in the same squash.
features: []
tags: [pipeline, user-decision]
files: [.claude/skills/land/SKILL.md, .claude/skills/orchestrate/doc-upkeep.md, docs/conventions.md]
tests: []
refs: [kb:adr/process-backlog-entries-are-the-users-to-file, kb:adr/process-land-skill-is-the-landing-ritual]
supersedes: []
---
**Context.** kb:adr/process-backlog-entries-are-the-users-to-file moved run-discovered follow-up
into `plans/<plan>/proposed-backlog.md`, "a file the user reads", but no step put it in front of
the user. Measured 2026-09-23: 16 proposals across 5 plans, none decided; 3 had been fixed since
and 2 were duplicates.

**Options.** (A) `/orchestrate` asks at Completion. (B) `/land` asks before the merge. (C) Each
proposal becomes a GitHub issue that `/triage` pulls in.

**Decision.** B. It is the last step before the merge — `/retro` and any hand fix add to the file
after Completion, which A would miss — the user is certain to be present, where a finished
orchestrate run would stall waiting on them, and the filed entries and decisions ride the same
squash as the fix. C publishes internal pipeline notes on a public repository.

**Consequences.** `/land` now edits `TODO.md` and `proposed-backlog.md` files, on the plan
branch, on the user's per-proposal answers; the user still makes every filing, so the earlier
decision stands unchanged. Each decision is a line in the file's `## Decisions` section, and
`/land` also sweeps other plans' files with none, catching plans committed without it. Each
proposal carries a one-line **Summary** for the prompt, and `/land` checks it still holds before
asking.
