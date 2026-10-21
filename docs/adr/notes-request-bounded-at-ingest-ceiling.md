---
id: notes-request-bounded-at-ingest-ceiling
type: decision
status: accepted
date: 2026-10-21
summary: A note has no product length cap; the note request body is bounded at the 20 MiB ingest ceiling as a transport guard, answered 413.
features: [notes]
tags: [ux, user-decision]
files: []
tests: []
refs: [plan:session-notes]
supersedes: []
---
**Context.** The spec rules out any size cap on a note, but an unbounded request body on a daemon
endpoint is a resource risk. The ingest route already bounds its bodies at 20 MiB.

**Decision.** There is no length rule on the note. The `PUT /api/sessions/{id}/note` body is read
through the same 20 MiB bound as ingest, and a larger body gets `413 request_too_large` in the
error envelope.

**Consequences.** No typed note comes near the bound. A runaway or malicious body cannot exhaust
the daemon's memory. The dashboard shows a refused save as unsaved, like any other failed save.
