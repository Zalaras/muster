---
id: ingest-seq-assigned-at-ingest
type: decision
status: accepted
date: 2026-08-16
summary: Events carry no timestamps or order, so the daemon assigns a monotonic seq at ingest, returns 200 at once, and processes asynchronously.
features: [ingest, lifecycle]
tags: [envelope, claude-code-format, state-machine]
files: [internal/server/ingest.go, internal/store/store.go]
tests: [TestIngestPipeline_SeqAssignmentAcrossHookAndStatusEndpoints, TestInsertEvent_SeqAssignmentPerClaudeSessionID]
refs: [docs/history/spec-changelog.md, kb:fact/hook-delivery-best-effort, kb:anchor/ingest, kb:anchor/state.ordering]
supersedes: []
---
**Context.** Hooks are fired at most once, are never retried or replayed, interleave across concurrent tool calls and carry no timestamp or sequence number. A slow receiver stalls every turn for its full timeout, additively per hook.

**Options.** (A) Last-write-wins keyed on a wire timestamp, which does not exist. (B) Trust arrival order. (C) Assign a daemon-side sequence at ingest, persist the event first, and make the state machine order-tolerant.

**Decision.** C. The ingest handler returns success immediately and all interpretation happens off the request path.

**Consequences.** Hook timeouts are set short, never the default. The event table is the source of ordering and the prompt and tool-use ids are the only correlation keys. Every state-machine rule is written for loss: a missing event must degrade the display, never wedge it.
