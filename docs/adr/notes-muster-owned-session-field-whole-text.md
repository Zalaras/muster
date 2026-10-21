---
id: notes-muster-owned-session-field-whole-text
type: decision
status: accepted
date: 2026-10-21
summary: A note is a nullable session-row field carried whole on the Session object, set only by a whole-text PUT; blank means none, last write wins.
features: [notes]
tags: [store, ux, user-decision]
files: []
tests: []
refs: [plan:session-notes, kb:adr/rename-muster-owned-title-override-wins, kb:adr/connection-whole-object-session-upserts]
supersedes: []
---
**Context.** Every window must show every session's note, including a window that reconnects, and
the note has no Claude Code source. The title override already shows how a Muster-owned,
display-only field lives on the row and rides the Session object.

**Decision.** The note is a nullable `note` column on the session row and a required `note` key on
the Session object, in the snapshot and every `sessionUpsert`. `PUT /api/sessions/{id}/note`
replaces the whole text. Empty or whitespace-only text is stored as null, and anything else is
stored verbatim. Nothing else writes the field. Concurrent saves from two windows are not merged:
the last one the daemon applies wins.

**Consequences.** Every upsert carries the full note text, which is negligible at 3–6 sessions on
localhost. A reconnecting window can never show a stale note. Remove deletes the note with the row.
