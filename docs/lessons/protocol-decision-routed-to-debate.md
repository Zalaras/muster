---
id: protocol-decision-routed-to-debate
type: lesson
status: active
date: 2026-08-29
summary: A cycle-1 Critical needing a protocol change was tagged as debatable; the protocol contract is never debated, so it detoured before reaching Damian.
features: [ingest, lifecycle]
tags: [pipeline, user-decision]
roles: [review, orchestrator]
files: []
tests: []
refs: [plan:m4-hook-lifetime, kb:adr/ingest-monotonic-rebind, .claude/agents/review-work.md, .claude/skills/decide/SKILL.md]
---
**What happened.** A cycle-1 Critical, a reordered hook rebinding a session backwards, needed a protocol change. It was tagged as a debatable decision, but the protocol contract is on the decide skill's never-debated list; a debate would have had to refuse it.

**Cost.** A routing detour before the item reached Damian, who decided it in one line.

**What changed.** A decision touching the protocol contract, `SPEC.md`, an ADR or money is tagged `[orchestrator:user-decision]`, still with two labelled options and measured trade-offs, and the orchestrator takes it straight to the user. Doc upkeep and plan defects stay bare `[orchestrator]`.
