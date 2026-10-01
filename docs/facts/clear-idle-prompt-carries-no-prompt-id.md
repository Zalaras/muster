---
id: clear-idle-prompt-carries-no-prompt-id
type: fact
status: active
date: 2026-09-30
summary: After /clear, an idle_prompt Notification arrives ~60 s later on the new session id with no prompt_id key; the old id's pending idle_prompt never fires.
features: [lifecycle]
tags: [claude-code-format, state-machine]
files: [internal/claudecode/interpret.go, internal/session/machine.go]
tests: []
refs: [test/rig/captures/capture-9.jsonl, kb:fact/notification-types-observed, kb:fact/clear-mints-new-session-id, "#57"]
verified: 2.1.285..2.1.285
guard: none
---
A turn's `Stop`, then `/clear` 4 s later: `SessionEnd{reason:"clear"}` on the old id (it
carries a `prompt_id`, the `/clear` command's own), `SessionStart{source:"clear"}` on the new
id, then — 60.0 s after the `SessionStart` — `Notification{notification_type:"idle_prompt"}`
on the **new** id. Its payload is `hook_event_name`, `message`, `notification_type`,
`session_id` and nothing else: **no `prompt_id` key**. The old id's own idle_prompt, due 60 s
after its `Stop`, never arrived (1 of 1).

A freshly launched session that was never prompted got no `idle_prompt` in ~90 s (1 of 1),
so the prompt-less notice follows `/clear`, not startup.

Consequence for Muster: `applyInput` treats a nil prompt id as an open turn, so this notice
moves a freshly cleared session to `needs_input` with reason `idle` — issue #57.

Evidence: interface probe 2026-09-30, instance 9, 1 interactive haiku session, all 31 hook
events of the 2.1.285 binary registered as command hooks.
