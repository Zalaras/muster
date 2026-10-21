# Doc delta: session-notes

Seeded by the orchestrator from the plan's `## Doc Delta` (approved), amended with every
`doc-delta:` line in the implementation logs and the pre-review E6 amendment. `plan.md` stays as
approved; this file is doc-reconcile's input.

## From the plan's Doc Delta

**notes** — becomes true:
- `docs/features/notes/spec.md` (new, authored at approval) states REQ-1 to REQ-23 as present-tense
  product truth: the note field and its endpoint, the glyph and both panel forms, autosave and
  browser-kept drafts, the unsaved status, pop-out geometry and per-tab persistence, Tiles hiding,
  the markers and their hover, lifetime and privacy.

**notes** — stops being true: nothing (new feature).

**focus** — becomes true:
- `docs/features/focus/spec.md` says the mainhead's first item is a notebook glyph before the
  session name, muted while the session's note is empty, that opens the note panel (kb:spec/notes),
  and that it never gives way as the header narrows.

**focus** — stops being true:
- "Above the pane sits the mainhead: the session name with its inline rename trigger" becomes
  "Above the pane sits the mainhead: the note glyph (kb:spec/notes), then the session name with its
  inline rename trigger".

**rail** — no sentence changes (rail spec at its word cap; the marker and hover are stated in
`docs/features/notes/spec.md` § "The marker and its hover").

**tiles** — becomes true:
- `docs/features/tiles/spec.md`: "A tile with a note shows the note marker before its context
  readout (kb:spec/notes)."

**tiles** — stops being true: nothing.

**protocol** — `docs/protocol.md` gains the `sessions.note` section and its endpoint-table row,
the Session object's `note` key, and `note` on the issue capture's **Never** list (merged at approval).

**design-system** — done by the orchestrator (`docs/design/design-system.md` §5); not doc-reconcile's.

## Amended from the implementation logs (web-implementation.md § Decisions)

**notes** — becomes true (`docs/features/notes/spec.md`):
- A click on a link in a rendered note opens it in a new tab and does not start editing.
- The glyph, pressed while the panel is popped out, moves focus into the panel.
- A failed save is retried on reconnect and on the next edit; a save the daemon answers
  `404 unknown_session` drops its kept text.

## Amended from web-implementation.md § Fix Attempt 1 (review cycle 1)

**notes** — becomes true (`docs/features/notes/spec.md`, the unsaved-status sentence):
- The header reads `unsaved, musterd unreachable`; in a narrow panel (down to the 260px minimum)
  the `· <title>` label gives way first, then the status shortens with an ellipsis and carries its
  full text as its hover `title`, so the header controls stay inside the panel.

## Amended from the pre-review E6 amendment (kb:adr/notes-ended-row-sweep-takes-its-note)

**notes** — stops being true (`docs/features/notes/spec.md` § The note):
- "An ended session keeps its note… Stop, resume and a daemon restart keep it" becomes: an ended
  session keeps its note, readable and editable, until Remove or the next daemon start; a restart
  keeps the note of every row reconcile keeps (a live session, and one whose pane died while
  musterd was down), and the start-up sweep of an already-ended row deletes its note with the row
  (kb:adr/lifecycle-reconcile-converges-with-the-socket).

**protocol** — stops being true (`docs/protocol.md`, the Session object's `note` comment):
- "deleted with the row by Remove" becomes "deleted with the row by Remove or by the start-up
  sweep of an already-ended row"; "never read or written by … reconcile" stays true for writes
  (reconcile never writes the note) and must not imply the note outlives a swept row.
