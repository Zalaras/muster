---
id: command-hook-session-title-holds
type: fact
status: active
date: 2026-10-15
summary: A command UserPromptSubmit hook printing sessionTitle renames the session as the http reply does, and the name then holds; no auto-generated title replaces it.
features: [rename, ingest]
tags: [claude-code-format]
files: [internal/claudecode/promptreply.go, internal/claudecode/settings.go]
tests: []
refs: [test/rig/captures/capture-3.jsonl, kb:fact/hook-output-sets-session-title, kb:fact/status-session-name-source, kb:fact/session-registry-names-running-sessions, plan:rename-claude-session]
verified: 2.1.300..2.1.300
guard: none
---
A `type:"command"` `UserPromptSubmit` hook that printed
`{"hookSpecificOutput":{"hookEventName":"UserPromptSubmit","sessionTitle":"ProbeCmdHotel71"}}` to
stdout, once, on a session launched without `--name`, renamed it at that prompt: the prompt box
relabelled, the registry read `name: "ProbeCmdHotel71"`, `nameSource: "hook"`, and every status
post from then on carried `session_name: "ProbeCmdHotel71"` (20 of 20; the 3 before it were null).
The http route (kb:fact/hook-output-sets-session-title) and the command route behave the same.

The name held through three more turns with the hook silent: registry and status line unchanged
(1/1). A control session in the same directory, launched without `--name` and never given a hook
title, got an auto-generated status-line `session_name` (`"Simple arithmetic question"`, 13 of 22
posts, the rest null) within the same four prompts. So Claude Code generates a title only for a
session that has no name; a hook-set name is not replaced by one.

The control's registry entry read `name: "repo-0d"`, `nameSource: "derived"` from startup, before
any prompt, and kept it while the status line showed the generated title: for an unnamed session
the registry name and the status-line `session_name` differ.

Evidence: probe sessions s1 (hook) and s2 (control) on capture-3, 2026-10-15, Claude Code 2.1.300.
