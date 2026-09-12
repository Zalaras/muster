---
id: stale-fixture-reshaped-the-wire
type: lesson
status: active
date: 2026-08-23
summary: An omitempty added to keep a frozen snapshot green changed the wire and was reverted mid-wave; a gauge bar shipped misordered to fit a textContent fake.
features: [usage]
tags: [testing, envelope]
roles: [daemon-impl, web-impl, daemon-tests, web-tests]
files: []
tests: []
refs: [plan:m3-gauges, .claude/agents/daemon-impl.md, .claude/agents/web-impl.md]
---
**What happened.** The approved protocol delta changed a wire shape and a frozen snapshot test the implementer may not edit went red. Rather than hand off sanctioned breakage, the implementer added `omitempty` to keep the snapshot green, which changed the wire. On the web side a gauge bar shipped after its number because a unit test's fake element supported only `textContent` and could not host the mandated structure.

**Cost.** A mid-wave revert, and a review Major.

**What changed.** Implement the contract exactly: pinned JSON, no key omission, no reordering. A test contradicted by the approved delta is recorded in Handoff as sanctioned breakage citing the delta section, and the test agent updates it next step. The rule cuts both ways: a wrong fixture is never accommodated, and a stale assertion never redesigns the wire.
