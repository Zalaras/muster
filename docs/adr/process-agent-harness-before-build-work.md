---
id: process-agent-harness-before-build-work
type: decision
status: accepted
date: 2026-08-16
summary: A separate session built the AI build harness, the agents and skills that develop Muster, before any feature work; features go through that pipeline.
features: []
tags: [pipeline, user-decision]
files: [.claude/agents/**, .claude/skills/**]
tests: []
refs: [SPEC.md, docs/history/interview-notes.md, CLAUDE.md, kb:adr/process-doc-upkeep-backstop-in-orchestrator, kb:adr/process-land-skill-is-the-landing-ritual]
supersedes: []
---
**Context.** Muster is built largely by Claude Code sessions. Starting the first milestone with bare sessions would have meant every plan re-deciding how implementation, tests, E2E and review divide the work.

**Options.** (A) Start building features immediately and grow tooling as friction appears. (B) Spend a dedicated session first on the harness: agents for daemon and web implementation and tests, E2E authoring and validation, review, and skills for spec, plan, orchestrate and land.

**Decision.** B, agreed in the interview and kept out of the spec itself.

**Consequences.** Feature work goes through the pipeline by default; trivial fixes and doc work may skip it. Boundaries the harness enforces, such as implementation agents never editing tests, bind outside it too. The harness has its own retro loop that amends the pipeline documents after each run.
