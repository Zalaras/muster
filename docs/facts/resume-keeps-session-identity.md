---
id: resume-keeps-session-identity
type: fact
status: active
date: 2026-09-11
summary: claude --resume <id> emits SessionStart{source:"resume"} with the original session_id and transcript_path.
features: [lifecycle, actions]
tags: [claude-code-format]
files: [internal/session/machine.go]
tests: [TestApplyInput_ResumeBind_SameClaudeIDFromEveryStateLandsIdleWithAttentionAndFailureCleared]
refs: [spikes/FINDINGS.md, plan:m4-reconcile, plan:canary-full-coverage]
verified: 2.1.233..canary
guard: TestLaunchFlags
---
`claude --resume <id>` emits `SessionStart{source:"resume"}` whose `session_id` and
`transcript_path` are the original session's. `SessionStart.source` values observed:
`"startup"`, `"resume"`, `"clear"`.

Evidence: measured headless on 2.1.233; interactive dashboard End → Resume run by hand on
2.1.246 (2026-08-30, same `session_id`, badge `idle`); automated on 2.1.267 (run E: a fresh
tmux session launched through the production `BuildArgv` line, `--resume <id> --model …
--permission-mode plan`, carried run D's `session_id` and `transcript_path`, 1/1).
