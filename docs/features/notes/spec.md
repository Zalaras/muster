---
id: notes
type: spec
status: active
date: 2026-10-20
summary: A persistent, markdown-rendered note per session, edited from the Focus header and peeked from the rail card and tile header.
features: [notes]
tags: [ux]
go: [internal/server/note*.go, internal/session/note*.go]
web: [web/src/features/notes*.ts, web/src/render/notes*.ts, web/render/notes*.spec.ts, web/render/helpers/notes*.ts]
e2e: [web/e2e/notes*.spec.ts, web/e2e/helpers/notes*.ts]
protocol: [sessions.note]
refs: [kb:adr/rename-muster-owned-title-override-wins, kb:adr/issue-payload-allowlist-never-dump, kb:adr/rail-timer-tinted-wherever-cache-warmth-known, kb:adr/theme-warn-tokens-not-amber]
---
A session carries one note: the developer's own text about what they are doing and what to ask
next, separate from the title and the rail's activity line. It is Muster-owned, like the title override
(kb:adr/rename-muster-owned-title-override-wins), and only the dashboard reads it. It never reaches
Claude Code, the activity line, the title or an issue snapshot
(kb:adr/issue-payload-allowlist-never-dump).

## The note

The note is a field on the session row, carried whole on the Session object as `note`, a string or
`null`, in the snapshot and every `sessionUpsert` (`kb:anchor/ws.session`). It is set only by
`kb:anchor/sessions.note`, which replaces the whole text. Empty or whitespace-only text is no note;
any other text is kept exactly as written. A note has no length limit. No hook, status post,
transcript scan, `/clear` rebind, resume, reconcile or liveness change touches it. An ended session
keeps its note, readable and editable, until Remove or the next daemon start. Stop and resume keep
it. A restart keeps the note of every row reconcile keeps (a live session, and one whose pane died
while musterd was down); the start-up sweep of an already-ended row deletes its note with the row
(kb:adr/lifecycle-reconcile-converges-with-the-socket), as Remove does. When two windows save the same note, the last write wins.

## The header glyph and the panel

The Focus header's first item is a notebook glyph button named `Note`, before the session name. It
is muted while the note is empty and in the foreground colour once it has text, on live and ended
sessions alike. It never gives way as the header narrows.

The glyph opens the note panel anchored under it. Its header reads `Note · <title>` and holds a
pop-out control. The body shows the note rendered as the docs reader renders markdown, frontmatter
and mermaid included, and malformed input renders as the reader shows it (kb:spec/reader). An empty
note reads `No note yet. Click to write one (markdown).` The glyph again, a click outside the panel,
or Escape inside it closes the anchored panel. A click on a link in the rendered note opens it in a
new tab and does not start editing. Focusing another session closes it.

One click on the rendered note, or Enter on it, edits the raw text in a plain text field with the
browser's own editing, undo and redo included. Escape, or a click elsewhere in the panel, renders
it again with the panel left open. Saving is automatic: within about a second of typing, and at once
when editing ends, the panel closes, focus moves to another session or the page is hidden. Typed
text is always saved to the session it was typed for. Text musterd has not yet acknowledged is kept
in the browser and sent again after a reload, a reconnect, a daemon restart or the next edit; a
save musterd answers `404 unknown_session` drops its kept text. While a save cannot reach musterd
the panel header reads `unsaved, musterd unreachable` in the warning colour
(kb:adr/theme-warn-tokens-not-amber). In a narrow panel (down to 260px) the `· <title>` label gives way first, then the status
ellipsizes, carrying its full text as its hover `title`, so the controls stay inside the panel. When another window saves, the shown text updates in place
unless this window is editing.

The glyph, pressed while the panel is popped out, moves focus into the panel. The pop-out control turns the panel into a floating panel over the main slot. It has pop-in and
close controls at its top right, and only those or Escape inside it close it, so the terminal keeps
the keyboard while it is open. It drags by its header, resizes from every edge and corner down to a
size that still shows its controls and a few lines, and always stays inside the main slot, never covering the rail, the masthead or the Focus header,
through a window resize too. When focus moves to
another session it stays where it is and shows that session's note. With no session focused, it
closes. It is hidden in Tiles and returns to the same place in Focus. Whether the panel is popped
out, and where and how big it is, is remembered per browser tab across reloads.

## The marker and its hover

While a session's note has text, its rail card and its Tiles strip card end the repo line in a
small note marker. A tile's header carries the same marker before its context readout. Hovering the
marker for 350 ms opens a read-only panel with the note rendered and cut off after twelve lines,
following the cache timer's hover rules (kb:adr/rail-timer-tinted-wherever-cache-warmth-known).
Nothing on a card or a tile edits the note.

## Does not

Notes are not global or per group, are not searched or exported, and have no keyboard chord.
