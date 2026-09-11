---
id: background-tasks-field
type: fact
status: active
date: 2026-09-11
summary: Stop.background_tasks lists running subagents and backgrounded shells with status "running", [] when nothing is outstanding.
features: [ingest, lifecycle]
tags: [claude-code-format]
files: [internal/claudecode/interpret.go]
tests: [TestInterpret_Stop]
refs: [spikes/FINDINGS.md, "#14"]
verified: 2.1.259..2.1.267
guard: none
---
`Stop.background_tasks` is non-empty while background work is still running:
`[{"type":"subagent","id","agent_type","description","status":"running"}]`, and shells the
subagent backgrounded appear as `{"type":"shell","id","command","description",
"status":"running"}`. It is `[]` when nothing is outstanding. Also present on `SubagentStop`,
alongside `session_crons`. Count outstanding work from `background_tasks`, never from the
number of `SubagentStop` events (kb:fact/subagent-hooks-carry-agent-id).

Evidence: 2.1.259 probe 2026-09-03 (capture-6), issue #14. `TestHookFields` asserts the key
exists on `Stop`; the running/empty semantics are ritual-only (needs a backgrounded subagent).
