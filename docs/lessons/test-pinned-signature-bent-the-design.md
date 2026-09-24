---
id: test-pinned-signature-bent-the-design
type: lesson
status: active
date: 2026-09-24
summary: An implementer kept a test-pinned signature frozen, which pushed broadcasts outside the write turn; two regressions took a third fix wave.
features: [lifecycle]
tags: [state-machine, testing]
roles: [daemon-impl, web-impl, orchestrator]
files: [internal/session/writeorder.go, .claude/agents/daemon-impl.md]
tests: []
refs: [plan:maintainability-cleanup, plans/maintainability-cleanup/findings.md]
---
**What happened.** Fixing the session write turnstile needed the broadcast to happen inside the write's turn. The implementer kept `finishWrite`'s signature unchanged because a white-box test pinned it, and implementers never edit tests. It moved the broadcast outside the turn instead, which reordered upserts and let a removed session's card come back. A verification review measured both regressions.

**Cost.** One extra fix wave, beyond the plan's cap of two, to redesign the turnstile a third time.

**What changed.** An implementer may change a signature that only tests pin. It lists the tests for the test agent instead of bending the design around them.
