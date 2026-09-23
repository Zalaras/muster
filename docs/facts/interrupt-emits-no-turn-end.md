---
id: interrupt-emits-no-turn-end
type: fact
status: active
date: 2026-09-23
summary: An Esc interrupt ends the turn with no hook at all (no Stop, StopFailure, PostToolUse, PostToolUseFailure or PostToolBatch), and no idle_prompt follows.
features: [lifecycle]
tags: [claude-code-format, state-machine]
files: [internal/session/machine.go, internal/claudecode/interpret.go]
tests: []
refs: [test/rig/captures/capture-8.jsonl, kb:fact/notification-types-observed, kb:fact/stopfailure-replaces-stop, kb:fact/hook-delivery-best-effort]
verified: 2.1.280..canary
guard: TestInterruptEmitsNoTurnEnd
---
Pressing Esc in the TUI ends the turn ("Interrupted · What should Claude do instead?") and emits
**no hook event**:

- **Mid-stream** (text streaming, no tool): after `UserPromptSubmit`, nothing. No `Stop`, no
  `StopFailure`.
- **Mid-tool** (`echo start && sleep 30 && echo end`, Esc 3.7 s in): after the tool's
  `PreToolUse`, nothing. No `PostToolUse`, no `PostToolUseFailure` (so its `is_interrupt`
  field did not fire), no `PostToolBatch`, no `Stop`. The transcript records the tool result
  as rejected, plus `[Request interrupted by user for tool use]`.

**No `idle_prompt` follows** an interrupt. The sessions were watched for 3 m 53 s and 8 m 32 s
with no `Notification` at all. The control, a normal "say hi" turn in the same session, got
`idle_prompt` 60.08 s after its `Stop`. The next hook after an interrupt is the next prompt's
`UserPromptSubmit`.

Consequence for Muster: replaying both captured sequences through `Interpret` + `applyInput`
leaves the session `working` indefinitely. The prompt is never closed, and nothing arrives to
close it until the next prompt. The status line still posts after the interrupt, twice, but it
is not a state source.

Evidence: interface probe 2026-09-23, instance 8. 2 interactive haiku sessions, 1 interrupt
each, plus 1 control turn. The replay used a temporary test, not committed. Guarded since
2026-09-23 by `TestInterruptEmitsNoTurnEnd` (canary run G), for the mid-tool case: Esc 3 s into a
`sleep 30` Bash call, then 70 s with no hook at all (2 of 2 runs). The mid-stream case stays a
probe question.
