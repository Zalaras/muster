---
id: clear-mints-new-session-id
type: fact
status: active
date: 2026-09-11
summary: /clear emits SessionEnd{reason:"clear"} for the old session_id, then SessionStart{source:"clear"} with a new id in the same pane.
features: [lifecycle, ingest]
tags: [claude-code-format]
files: [internal/session/machine.go, internal/claudecode/interpret.go]
tests: [TestApplyInput_ClearRebind, TestInterpret_SessionEnd]
refs: [spikes/FINDINGS.md]
verified: 2.1.237..2.1.267
guard: none
---
On `/clear` the old `session_id` receives `SessionEnd` with `reason: "clear"`, then
`SessionStart` fires with `source: "clear"` and a new `session_id` in the same pane. So
`/clear` is directly detectable, a `SessionEnd{reason:"clear"}` is not the pane dying, and
session identity has to key on the tmux target rather than Claude's `session_id`.

Evidence: 2.1.237 probe, 2026-08-20 (capture-3). Not driven by the canary; automatable — a
`/clear` typed into the interactive run would cost no extra turn.
