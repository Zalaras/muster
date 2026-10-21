---
id: notes-ended-row-sweep-takes-its-note
type: decision
status: accepted
date: 2026-10-21
summary: A note lives and dies with its session row, so the start-up sweep of an already-ended row deletes its note; a restart keeps the note of every row it keeps.
features: [notes, lifecycle]
tags: [store]
files: []
tests: []
refs: [plan:session-notes, kb:adr/lifecycle-reconcile-converges-with-the-socket, kb:adr/notes-muster-owned-session-field-whole-text]
supersedes: []
---
**Context.** The plan's E6 asked that a note survive a musterd restart "staying readable and
editable on the ended session". Measured at web-impl's smoke run: a session ended and then put
through a restart is gone from the dashboard, because reconcile deletes a row that was already
ended in an earlier daemon lifetime (kb:adr/lifecycle-reconcile-converges-with-the-socket keeps
that sweep rule). The note is a column on that row.

**Options.** (A) Keep the note somewhere that outlives its row. (B) Let the note follow its row.

**Decision.** B. A restart keeps the note of every row reconcile keeps: a live session, and a
session whose pane died while musterd was down (marked ended at that start and kept until the
next). The sweep of an already-ended row takes its note with it, as Remove does (REQ-4).

**Consequences.** E6 is amended to match; no product code changes. A note on an ended session is
readable and editable until Remove or the next daemon start.
