---
id: permission-wait-gets-no-idle-prompt
type: fact
status: active
date: 2026-10-12
summary: A permission dialog left unanswered gets its permission_prompt and no idle_prompt; idle_prompt fires only once Claude is back at its input box.
features: [lifecycle]
tags: [claude-code-format, state-machine]
files: [internal/claudecode/interpret.go, internal/session/machine.go]
tests: []
refs: [kb:fact/notification-types-observed, kb:fact/local-command-orphan-idle-prompt]
verified: 2.1.296..2.1.296
guard: none
---
A Bash permission dialog left open for 100 s got `PermissionRequest` and, 6 s later, the
`permission_prompt` `Notification`. No `idle_prompt` followed (0 of 1). So an `idle_prompt`
never stands in for an unanswered permission.

The `idle_prompt`s measured so far all came while the input box sat empty and nothing ran:
60 s after a `Stop`, after a local command (kb:fact/local-command-orphan-idle-prompt), and after
a finished or empty compaction (kb:fact/compact-hook-sequence). None came while text had been
put back in the input box after an Esc (kb:fact/interrupt-before-output-leaves-no-trace, and
the interrupted compaction).

Evidence: interface probe 2026-10-12, instance 3, session `716b0a`.

Raw probe capture (local only, not in git): `capture-3-state-2026-10-12b.jsonl`.
