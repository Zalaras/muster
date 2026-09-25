---
id: decision-made-inside-a-fix-wave
type: lesson
status: active
date: 2026-08-30
summary: Decision items tagged to an impl agent rode three cycles, a post-approval decision changed code, and a protocol decision detoured through a debate.
features: []
tags: [pipeline, judged, user-decision]
roles: [review, orchestrator]
files: []
tests: []
refs: [plan:m4-reconcile, plan:order-sidebar, plan:m4-hook-lifetime, kb:adr/ingest-monotonic-rebind, .claude/skills/decide/SKILL.md, .claude/agents/review-work.md, .claude/skills/orchestrate/SKILL.md]
---

**What happened.** Two decision items were tagged to an impl agent and rode three review cycles; told to decide, the agent decided inside a fix cycle with no authority, and the next review re-litigated it into the following Critical. In another run cycle 1 approved with a decision open; the winning option changed code, so a second cycle was improvised. In a third, a cycle-1 Critical needing a protocol change was tagged as debatable, but the protocol contract is on the decide skill's never-debated list, so it detoured before reaching the developer.

**Cost.** Three cycles in one run, an unplanned cycle in another, a routing detour in a third.

**What changed.** A reviewer tags a design fork `[orchestrator:decision]` with two labelled options; one touching the protocol contract, `SPEC.md`, an accepted ADR or money is `[orchestrator:user-decision]` and goes straight to the user. The orchestrator settles decision items before any fix wave, at most two debates per run, and quotes the outcome verbatim in the fix-wave prompt; a code-changing outcome after approval runs through the ordinary waves and counts as a review cycle.
