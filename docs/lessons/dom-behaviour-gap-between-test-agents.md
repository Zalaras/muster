---
id: dom-behaviour-gap-between-test-agents
type: lesson
status: active
date: 2026-08-22
summary: Fix waves added user-visible behaviour, unit agents rightly left DOM to Playwright, nobody was tagged; seven behaviours shipped untested.
features: []
tags: [testing, pipeline]
roles: [e2e-specs, orchestrator]
files: []
tests: []
refs: [plan:m1-sessions, .claude/agents/e2e-specs.md, .claude/skills/orchestrate/SKILL.md]
---
**What happened.** Fix waves added user-visible behaviour: an error display, markers, a shortcut, a field. The unit-test agents correctly treated DOM behaviour as Playwright's job, and no `[e2e-specs]` issue had been tagged, so nobody asserted any of it.

**Cost.** Seven behaviours shipped untested through a gap that no single agent could see.

**What changed.** The E2E agent runs in wave 3 of every fix cycle with a concrete task, read the implementation logs and assert every user-visible behaviour they added, even with no tagged issue. The gap lives between agents, and only the orchestrator sees all the waves.
