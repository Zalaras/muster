---
id: bang-command-turn-has-no-prompt-submit
type: fact
status: active
date: 2026-10-01
summary: A `!` shell command typed in the TUI runs, then Claude takes a turn about its output that ends in Stop — with no UserPromptSubmit before it.
features: [lifecycle, ingest]
tags: [claude-code-format]
files: []
tests: [TestBangCommandFiresNoPromptSubmit]
refs: [test/rig/captures/capture-3.jsonl, kb:fact/hook-payload-fields]
verified: 2.1.286..canary
guard: TestBangCommandFiresNoPromptSubmit
---
A line typed with the `!` prefix runs as a shell command in the session's shell, with no
permission prompt. Claude then replies to its output ("You're now in the sub directory…").
That turn ends with `Stop` and `SubagentStop` as usual, but no `UserPromptSubmit` opens it
(0 `UserPromptSubmit` for 5 `!` commands across 2 sessions). It also fires no
`PreToolUse`/`PostToolUse` for the command. If the command changed directory, `CwdChanged`
fires (kb:fact/cwd-changed-hook).

So a `Stop` can arrive for a turn that never started as far as the hooks show.

Evidence: probe instance 3, 2026-10-01, sessions `50447df0` (3 `!` commands, 1
`UserPromptSubmit`, 4 `Stop`) and `8b5e8581` (2 `!` commands, 3 `UserPromptSubmit`, 5 `Stop`).

The guard is canary run N, where every API call fails, so the turn there ends in `StopFailure`. It asserts only that no `UserPromptSubmit` or tool hook fires.
