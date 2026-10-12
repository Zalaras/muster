---
id: local-command-orphan-idle-prompt
type: fact
status: active
date: 2026-10-12
summary: A local slash command such as /context mints a prompt_id with no hook at all; the idle_prompt ~60 s later carries that never-opened, never-closed id.
features: [lifecycle]
tags: [claude-code-format, state-machine]
files: [internal/claudecode/interpret.go, internal/session/machine.go]
tests: []
refs: [test/rig/captures/capture-3-state-2026-10-12.jsonl, kb:fact/notification-types-observed, kb:fact/compact-hook-sequence, "#72"]
verified: 2.1.296..2.1.296
guard: none
---
Running a local slash command (`/context`, measured) mints a new `prompt_id` and fires **no
hook**: no `UserPromptSubmit`, no `Stop`. The status line picks up the new id on its next
post. About 60 s later (60.0 s) an `idle_prompt` `Notification` arrives carrying that id.

After an ordinary turn, the `idle_prompt` carries the `Stop`'s already-closed `prompt_id`. Here
its id belongs to no turn the hooks ever showed. Fed through `Interpret` + `applyInput`, it
moves an `idle` card to `needs_input` with `attention.reason:"idle"`.

A `!` command differs: its turn ends in `Stop` (kb:fact/bang-command-turn-has-no-prompt-submit),
so its `idle_prompt` names a closed prompt and changes nothing (1 of 1).

Evidence: interface probe 2026-10-12, instance 3, session `f7c88c` (1 `/context`, 1 `!ls`).
The developer's live event log for the same day held 2 such `idle_prompt`s, in sessions 14 and
9, each on a prompt id that only one status-line post had named 60 s earlier. Which command
produced those two is not known.
