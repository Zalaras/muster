---
id: compact-hook-sequence
type: fact
status: active
date: 2026-10-12
summary: /compact fires PreCompact, SubagentStop, SessionStart(source:"compact") and PostCompact under one fresh prompt_id, with no UserPromptSubmit or Stop.
features: [lifecycle]
tags: [claude-code-format, state-machine]
files: [internal/claudecode/interpret.go, internal/session/machine.go]
tests: []
refs: [test/rig/captures/capture-3-state-2026-10-12.jsonl, kb:fact/local-command-orphan-idle-prompt, "#65", "#66"]
verified: 2.1.296..2.1.296
guard: none
---
A manual `/compact` that compacts fires, in order, all under one **fresh** `prompt_id` that no
`UserPromptSubmit` opens:

1. `PreCompact{trigger:"manual", custom_instructions}`, as the command is submitted.
2. ~10–14 s of compaction, then `SubagentStop` from the summarising agent (`agent_type:""`,
   `last_assistant_message` = the summary).
3. `SessionStart{source:"compact"}` with the **same** `session_id` and the same `prompt_id`.
4. `PostCompact{trigger:"manual", compact_summary}`.

No `Stop` closes the prompt. About 60 s later an `idle_prompt` `Notification` arrives carrying
the compaction's `prompt_id` (60.04 s, 1 of 1 watched).

Two shorter shapes:

- **Nothing to compact** ("Not enough messages to compact."): `PreCompact` only. No
  `SubagentStop`, `SessionStart` or `PostCompact` follows.
- **Esc during compaction**: `PreCompact`, then a `SubagentStop` whose `last_assistant_message`
  is null, then nothing. The transcript gets no interrupt line, and the `/compact` text is put
  back in the input box.

Fed through `Interpret` + `applyInput`, the full sequence leaves the card `idle` throughout
the compaction, then `started` (from the `SessionStart`), then `needs_input` (from the
`idle_prompt`).

Evidence: interface probe 2026-10-12, instance 3, 1 interactive haiku session `f7c88c`:
2 full compactions (one with custom instructions), 1 empty, 1 interrupted. The developer's
live event log held 2 `PreCompact` the same day. Auto-compaction (`trigger:"auto"`, mid-turn)
was not measured.
