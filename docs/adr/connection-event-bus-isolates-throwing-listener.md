---
id: connection-event-bus-isolates-throwing-listener
type: decision
status: accepted
date: 2026-10-21
summary: The dashboard's app event bus catches a throwing listener, reports it with console.error and still calls every later listener of that emit.
features: [connection]
tags: [user-decision]
files: [web/src/app.ts]
tests: []
refs: [plan:session-notes, kb:adr/notes-blocked-storage-fixed-in-run-cycle-four, kb:lesson/browser-storage-unavailable-is-a-source-state]
supersedes: []
---
**Context.** In session-notes review cycle 3, blocked storage made one feature's `snapshot`
listener throw. The throw aborted every later listener of that emit, including notes' re-send.
The run fixed the storage cause and deliberately left the bus unchanged. One listener's failure
silently disabling unrelated features is the bus's own defect.

**Options.** (A) Leave `emit` as it is and rely on every listener never throwing. (B) Wrap each
listener in a try/catch, report the error with `console.error` and carry on. (C) Rethrow
asynchronously (`queueMicrotask`) so the error surfaces as uncaught.

**Decision.** B, by the developer at `/land`. Each listener's failure stays its own. Registration
order and the snapshot-before-iterate rule are unchanged. B over C because the existing error
path (`api/http.ts`) reports with `console.error`, and an async rethrow fails unit tests that
emit.

**Consequences.** `emit` never throws. A listener failure shows only as a console error, so
tests must assert the effect, not the throw.
