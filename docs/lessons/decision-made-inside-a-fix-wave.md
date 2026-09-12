---
id: decision-made-inside-a-fix-wave
type: lesson
status: active
date: 2026-08-30
summary: Two decision items tagged to an impl agent rode three cycles and one produced the next Critical; a post-approval decision changed code, cycle 2 improvised.
features: []
tags: [pipeline, judged]
roles: [review, orchestrator]
files: []
tests: []
refs: [plan:m4-reconcile, plan:order-sidebar, .claude/skills/decide/SKILL.md, .claude/agents/review-work.md, .claude/skills/orchestrate/SKILL.md]
---
**What happened.** Two decision items were tagged to an impl agent and rode three review cycles; told to make a decision, the agent decided inside a fix cycle with no authority, and the next review re-litigated it and produced the following Critical. In a later run cycle 1 approved with a decision item open; the winning option changed code, so a second cycle had to be improvised, and the debate itself produced six messages of narration for one report line.

**Cost.** Three cycles in one run, an unplanned cycle in another.

**What changed.** A reviewer tags a design fork `[orchestrator:decision]` with two labelled options and measured trade-offs. The orchestrator runs the decide debate before any fix wave, at most two per run, and quotes the outcome verbatim in the fix-wave prompt; a code-changing outcome after approval goes through the ordinary waves and counts as a review cycle. Only the one explicit `consensus` or `no consensus` line is acted on.
