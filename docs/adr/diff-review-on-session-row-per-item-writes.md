---
id: diff-review-on-session-row-per-item-writes
type: decision
status: accepted
date: 2026-11-20
summary: Diff comments and ticks live in one column of the session row, written per comment and per tick set, never broadcast, deleted by Remove.
features: [diff]
tags: [store, user-decision]
files: []
tests: []
refs: [plan:diff-viewer, kb:adr/notes-muster-owned-session-field-whole-text, kb:adr/notes-ended-row-sweep-takes-its-note]
supersedes: []
---
**Context.** The developer wants comments and ticks kept with the session and the simplest storage that does it, as storage will be revisited. The note is a session-row field with that lifetime.

**Options.** (A) Browser storage. (B) New tables. (C) One JSON column on the session row written whole. (D) One JSON column written per item.

**Decision.** D: the `diff_review` column, with a PUT and DELETE per comment and one POST adding and removing tick keys; no WebSocket broadcast.

**Consequences.** Two windows writing different comments never lose each other's; the same comment is last-write-wins. Other windows see changes on their next open or Refresh. The review is never on the Session object or in an issue snapshot.
