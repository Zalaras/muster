---
id: subagent-hooks-during-permission-wait
type: fact
status: active
date: 2026-09-23
summary: A background subagent keeps emitting tool hooks while the main agent waits on a permission prompt; a parallel foreground tool waits instead.
features: [lifecycle]
tags: [claude-code-format, state-machine]
files: [internal/session/machine.go, internal/claudecode/interpret.go]
tests: []
refs: [test/rig/captures/capture-8.jsonl, kb:fact/subagent-hooks-carry-agent-id, kb:fact/notification-types-observed]
verified: 2.1.280..2.1.280
guard: none
---
When the main agent's Bash call is waiting on the in-terminal permission prompt, the order of
events depends on what else was in its batch:

- **A foreground parallel tool waits.** With `Bash touch` plus `Read` in one message, the
  `Read` fired no hook until the prompt was answered. After that it ran
  `PostToolUse{Bash}` → `PreToolUse{Read}` → `PostToolUse{Read}`, so nothing interleaves (1 of 1).
- **A background subagent does not wait.** With `Agent{run_in_background}` plus `Bash touch`,
  `PermissionRequest{Bash}` was followed by the subagent's `PreToolUse`/`PostToolUse`/
  `PostToolBatch` (each marked with `agent_id`) while the prompt was still on screen. In run 1,
  12 events and `SubagentStop` came before the `permission_prompt` `Notification`, which
  arrived 6.0 s after `PermissionRequest`. In run 2 the subagent kept emitting for 15 s
  *after* that `Notification` (2 of 2).

Consequence for Muster: a replay through `Interpret` + `applyInput` moves the session to
`needs_input` on `PermissionRequest`, then back to `working` (attention cleared) on the first
subagent event. In run 2 it ends `working` while the prompt is still waiting, and stays that
way until the prompt is answered. That's because `KindTurnActivity` from a subagent on an open
prompt clears `Attention` exactly as main-agent activity does.

Evidence: interface probe 2026-09-23, instance 8. 1 interactive haiku session, 3 turns. The
replay used a temporary test, not committed.
