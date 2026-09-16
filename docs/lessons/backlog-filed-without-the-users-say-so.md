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
**What happened.** Fifteen of the twenty open pre-v1 backlog items were written by four
consecutive runs over three days; only three were named in an approved plan. Four came from
findings tagged `[note]` — "I am not asking for a change", "no change requested", "worth fixing
app-wide one day; not here" — transcribed as open work with the refusal dropped. Two runs a day
apart filed the same `dead-refs` defect twice, into different sections, neither aware of the
other. Because the section they landed in declares its contents v1 blockers, each one silently
became a release blocker.

**Cost.** A release gate the user did not set, carrying duplicates and work its own reviewer had
declined to request; the user read the list and had to ask why it had grown.

**What changed.** A run proposes in `plans/<plan>/proposed-backlog.md` and files nothing; only
the user writes an open `TODO.md` item, except one a plan's now-required `## Out of scope` names
(kb:adr/process-backlog-entries-are-the-users-to-file). Every proposal states whether a change
was requested, in the reviewer's words.

**Why it was not caught by the rule already there.** `kb:lesson/finding-severity-misrouted`
banned deferring *agent-tagged* findings, which left `[orchestrator]` as the one tag that could
still reach the backlog — so the valve moved rather than closing. Grading a finding is a separate
question from who may file it; that lesson governs the first, this one the second.
