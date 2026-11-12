---
id: send-now-mid-stream-stops-under-fresh-prompt-id
type: fact
status: active
date: 2026-11-12
summary: Send-now (ctrl+x ctrl+s) while text streams fires UserPromptSubmit on the running prompt_id; its Stop comes on a fresh, never-opened prompt_id.
features: [lifecycle]
tags: [claude-code-format, state-machine]
files: [internal/session/machine.go]
tests: []
refs: [kb:fact/queued-prompt-shares-prompt-id, kb:fact/interrupt-recorded-in-transcript]
verified: 2.1.322..2.1.322
guard: none
---
A message typed while a turn runs is queued on Enter; the TUI offers "ctrl+x ctrl+s to send
now". The two cases differ:

- **Send now while text streams:** `UserPromptSubmit` fires under the running turn's
  `prompt_id`. The answer to the new message is closed by a `Stop` under a **fresh**
  `prompt_id` that no `UserPromptSubmit` opened. The following `idle_prompt` carries that fresh id,
  and the old id is never closed by any hook. In the transcript, the new message's user line has
  the fresh `promptId` (1 of 1).
- **Send now while a foreground Bash call runs:** the shell moves to the background, and
  `UserPromptSubmit`, `PostToolUse` and `Stop` all stay on the running `prompt_id`. The shell's
  later completion opens its own `<task-notification>` turn (1 of 1).

Neither case writes a `[Request interrupted by user…` line. Plain Enter still queues under the
running `prompt_id` with one `Stop` (kb:fact/queued-prompt-shares-prompt-id, seen again on this
version, 1 of 1). Muster ends up `idle` after each case, which is correct.

Evidence: interface probe 2026-11-12, instance 3, `capture-3.jsonl`, 1 interactive haiku session.
