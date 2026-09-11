---
id: process-testing-bar-e2e-always-unit-for-logic
type: decision
status: accepted
date: 2026-08-16
summary: The testing bar is functional E2E always against a real daemon in a scratch repo, with unit tests for specific logic; neither alone is enough.
features: []
tags: [testing, user-decision]
files: [web/e2e/**, Makefile]
tests: []
refs: [SPEC.md, docs/history/interview-notes.md, CLAUDE.md, docs/conventions.md, kb:adr/process-web-unit-tests-vitest, kb:adr/process-e2e-explicit-fixtures, kb:adr/canary-drives-installed-claude-through-production-chain]
supersedes: []
---
**Context.** Muster's behaviour lives at the joins: hooks arriving out of order, tmux panes appearing and vanishing, a browser resizing a shared PTY. Unit tests cannot see those joins and E2E tests alone cannot pin a state machine's edge cases.

**Options.** (A) Unit tests as the bar, with E2E as an occasional smoke check. (B) E2E only, driving every behaviour through the UI. (C) Functional E2E always, against a real daemon and a scratch repo, plus unit tests for specific logic such as the state machine, reconcile and the settings merge.

**Decision.** C. A canary E2E additionally asserts that Claude Code's hooks and status line still carry the fields Muster needs before any version is adopted.

**Consequences.** Every plan carries E2E specs authored before implementation, and the pipeline has separate roles for each kind of test. Real Claude runs are rationed to the canary and probes because they spend Damian's subscription; ordinary E2E fakes Claude with synthesised hook and status-line posts.
