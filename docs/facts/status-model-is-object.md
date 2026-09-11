---
id: status-model-is-object
type: fact
status: active
date: 2026-09-11
summary: The status line's model is an {id, display_name} object; only SessionStart.model is a bare string.
features: [usage, lifecycle]
tags: [claude-code-format]
files: [internal/claudecode/status.go]
tests: [TestInterpretStatus_FullPost, TestInterpretStatus_RateLimitsPresentButModelAbsentProducesNoSample]
refs: [spikes/FINDINGS.md]
verified: 2.1.233..canary
guard: TestStatusLineFields
---
`model` in the status line is an object `{id, display_name}`, e.g.
`{"id":"claude-haiku-4-5-20251001","display_name":"Haiku 4.5"}`. The object shape belongs to
the status line only; `SessionStart.model` is a bare string
(kb:fact/sessionstart-model-optional-string).

Evidence: 2.1.233 spike captures; the guard asserts the object, its `id` equal to the launched
model and a `display_name` key, and that `InterpretStatus` reads the same id.
