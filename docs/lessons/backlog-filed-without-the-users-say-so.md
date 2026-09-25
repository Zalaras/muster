---
id: backlog-filed-without-the-users-say-so
type: lesson
status: active
date: 2026-09-16
summary: Four runs wrote 12 unapproved items into the pre-v1 backlog in three days, four of them from notes whose reviewer had said no change was wanted.
features: []
tags: [pipeline]
roles: [orchestrator, review, retro]
files: [.claude/skills/orchestrate/doc-upkeep.md, .claude/skills/orchestrate/SKILL.md, .claude/agents/review-work.md]
tests: []
refs: [plan:mermaid-support, plan:session-lifecycle, plan:markdown-viewing, plan:markdown-render-fixes, kb:lesson/finding-severity-misrouted, kb:adr/process-backlog-entries-are-the-users-to-file]
---

**What happened.** Fifteen of twenty open pre-v1 backlog items were written by four consecutive runs over three days; three were named in an approved plan. Four came from `[note]` findings whose reviewer had said no change was wanted, transcribed as open work with the refusal dropped. Two runs filed the same `dead-refs` defect twice into different sections. The section they landed in declares its contents v1 blockers, so each silently became one.

**Cost.** A release gate the user did not set, carrying duplicates and work its own reviewer had declined; the user had to ask why the list had grown.

**What changed.** A run proposes in `plans/<plan>/proposed-backlog.md` and files nothing; only the user writes an open `TODO.md` item, except one a plan's `## Out of scope` names (kb:adr/process-backlog-entries-are-the-users-to-file). Every proposal states whether a change was requested. Grading a finding (kb:lesson/finding-severity-misrouted) is a separate question from who may file it.
