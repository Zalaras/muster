---
id: interrupt-recorded-in-transcript
type: fact
status: active
date: 2026-09-30
summary: Esc, or No on a permission prompt, emits no hook of 31; the transcript gets a user line "[Request interrupted by user…" with the turn's promptId.
features: [lifecycle]
tags: [claude-code-format, state-machine]
files: [internal/claudecode/interpret.go, internal/session/machine.go]
tests: []
refs: [test/rig/captures/capture-9.jsonl, kb:fact/interrupt-emits-no-turn-end, kb:fact/transcript-session-lines, "#59"]
verified: 2.1.285..2.1.285
guard: none
---
With all 31 hook events of the 2.1.285 binary registered, four ways of ending a turn by hand
emit **no hook at all**, and no `idle_prompt` follows within 70 s:

- Esc while text streams (after `UserPromptSubmit` and one `MessageDisplay`).
- Esc while an approved foreground Bash call runs.
- Esc on the permission prompt itself.
- Choosing "No" on the permission prompt.

Each writes one transcript line of `type:"user"` whose top-level `promptId` is the turn's
`prompt_id` and whose `message.content` array holds a text block reading exactly `[Request interrupted by user]`
(mid-stream) or `[Request interrupted by user for tool use]` (the three tool cases), the
latter after a `tool_result` saying the user doesn't want to proceed (4 of 4). Rejecting a
plan with feedback, which continues the turn, writes the `tool_result` but **no** such text
line (0 of 1).

The status line keeps posting after an interrupt, and now carries `prompt_id`, but nothing in
it marks the interrupt.

Evidence: interface probe 2026-09-30, instance 9, 1 interactive haiku session.
