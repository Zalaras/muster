---
id: two-wire-shapes-accepted-hides-disagreement
type: lesson
status: active
date: 2026-08-22
summary: An invented {id, display_name} hook field survived two stages because the daemon accepted both shapes: every test green, contract wrong, Opus probe needed.
features: [ingest, usage]
tags: [envelope, claude-code-format, pipeline]
roles: [daemon-impl, e2e-specs, web-impl, review]
files: []
tests: []
refs: [plan:m1-sessions, kb:fact/status-model-is-object, kb:fact/sessionstart-model-optional-string, .claude/agents/daemon-impl.md, .claude/agents/e2e-specs.md]
---
**What happened.** The E2E agent had no measured shape for a hook's `model` field and reused the status line's `{id, display_name}` object. The daemon implementer, seeing the plan say string and the fixture say object, accepted both. Every test went green while the two sides disagreed about the wire.

**Cost.** The disagreement survived two pipeline stages to the Opus review, which needed a mid-pipeline interface probe to settle it.

**What changed.** A shape measured on the status line is not evidence for a same-named field on a hook; unmeasured means flag it for `/interface-probe` and use the shape the plan asserts. Two shapes for one wire field is a conflict to escalate in Decisions, never a case to handle; the implementer codes the measured shape only.
