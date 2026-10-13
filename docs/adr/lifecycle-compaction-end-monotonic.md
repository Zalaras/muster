---
id: lifecycle-compaction-end-monotonic
type: decision
status: accepted
date: 2026-10-13
summary: A compact SessionStart naming a session_id the session already left is a straggler, never a rebind; Apply's monotonic guard decides.
features: [lifecycle, ingest]
tags: [state-machine, consensus]
files: [internal/session/apply.go, internal/session/machine.go]
tests: [TestApply_CompactionEndedFromALeftIdIsAStraggler, TestApply_CompactionEndedBinding]
refs: [plan:state-issues, plans/state-issues/decisions/compact-sessionstart-left-id/decision.md, kb:adr/ingest-monotonic-rebind, kb:fact/compact-hook-sequence, kb:adr/launch-resume-one-alive-row-per-claude-session]
supersedes: []
---
**Context.** A compaction's `SessionStart{source:"compact"}` carries the same `session_id` as its
own `PreCompact` (kb:fact/compact-hook-sequence). The only way it can name an id this session has
already left is reordering after a `/clear`. Treating it as a clear-rebind would move the binding
backwards. The session would then stay on the old conversation: the new one would read as not
open, and Resume would reopen the pre-clear conversation.

**Decision.** A compact `SessionStart` goes through `Apply`'s guarded envelope branch like every
non-bind event (kb:adr/ingest-monotonic-rebind). A new id escalates to the clear-rebind. An id
already in this session's history routes and applies with no rebind. The state machine's
compaction-end arm never decides a rebind itself.

**Consequences.** One place decides forward rebind or straggler for every enveloped kind. A
`resume` `SessionStart` stays exempt, because returning to an earlier conversation is its job.
`startup` and `clear` keep binding directly, since they never carry a left id
(kb:fact/clear-mints-new-session-id).
