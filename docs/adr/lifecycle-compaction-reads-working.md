---
id: lifecycle-compaction-reads-working
type: decision
status: accepted
date: 2026-10-13
summary: A compaction begun outside a turn reads working until its compact SessionStart lands idle; a compaction inside a turn only counts.
features: [lifecycle]
tags: [state-machine]
files: [internal/claudecode/interpret.go, internal/session/machine.go, internal/session/apply.go]
tests: [TestApplyInput_CompactionBegan, TestApplyInput_CompactionEnded, TestApply_CompactionStateThroughTheManager]
refs: [plan:state-issues, kb:fact/compact-hook-sequence, "#65", "#66"]
supersedes: []
---
**Context.** `/compact` fires `PreCompact` under a fresh `prompt_id`, then
`SessionStart{source:"compact"}` under the same id, with no `UserPromptSubmit` or `Stop`. The card
read `idle` during the 10–15 s compaction, when the session takes no input (#65). The
`SessionStart` was handled as a plain bind and landed `started` (#66).

**Options.** (A) A new `compacting` state: a protocol and UI change. (B) Reuse `working`. (C) Leave
the card idle and only fix the `started` landing.

**Decision.** B, chosen by the developer 2026-10-12. A `PreCompact` in `started`, `idle` or `failed`
adopts its prompt and enters `working`, never `planning`. The compact `SessionStart` for that
prompt closes it into `idle`, with `unread` as `Stop`. A `PreCompact` inside a turn
(auto-compaction) and any other compact `SessionStart` change no state.

**Consequences.** No protocol or UI change. A lost `SessionStart`, an empty compaction, or a daemon
restart mid-compaction is healed by the `idle_prompt` 60 s later
(kb:adr/lifecycle-idle-prompt-ends-turn-never-attention). An interrupted compaction is not healed
(kb:adr/lifecycle-early-interrupt-gap-accepted). Production settings need no `PostCompact`.
