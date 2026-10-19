# Spec: Session notes

**Plan**: session-notes
**Created**: 2026-10-19
**Features**: new: notes
**Touches**: focus, rail, tiles, lifecycle, connection, reader
**Status**: Approved

## Goal

The developer can attach a persistent note to any session — what they are doing, what they
want to ask next — separate from the title and from the rail's activity line. It is simple
note-taking with markdown support, not documentation. Closes
[#95](https://github.com/Zalaras/muster/issues/95) (`TODO.md` § "What a session records").

## Background & Context

- **A Muster-owned per-session field already exists**: the title override is a nullable field on
  the session row that wins over Claude Code's name and survives rebinds, resume and reconcile
  (kb:spec/rename, kb:adr/rename-muster-owned-title-override-wins). The note is the same class of
  thing, with no delivery to Claude Code.
- **Read-only hover panels are an established rail pattern**: the cache timer opens a hover panel
  that follows the card and closes when the pointer leaves
  (kb:adr/rail-timer-tinted-wherever-cache-warmth-known, kb:spec/rail), and the approved
  `see-added-dirs` plan adds a location panel on the Focus header's readout using the same `.pop`
  component. The rail-card note hover follows this pattern.
- **The renderer exists**: the docs reader renders sanitized markdown with frontmatter and mermaid
  diagrams (kb:spec/reader). The note renders with the same support, so `reader` is a Touches
  entry for its shared renderer, not a behaviour change.
- **The Focus header** is where session-level controls live: name with inline rename, group
  control, repo readout, model, surface switch and actions (kb:spec/focus). The header gives way in
  a fixed order as it narrows (kb:adr/focus-header-give-way-order-title-last); the glyph joins
  that layout and `/plan-work` places it in the order.
- **Issue snapshots are an explicit allowlist** (kb:adr/issue-payload-allowlist-never-dump), so
  keeping the note out of them is a check, not new exclusion work.
- Diagrams: kb:diagram/domain-model (a Session's fields) and kb:diagram/store-schema (the
  session row) describe the row the note joins; both change in the same commit as the field.
  No new diagram: the panel's states (closed, anchored rendered, anchored editing, popped out)
  are few enough for prose.
- Nothing settled by an accepted or rejected ADR bears on notes; `SPEC.md` leaves them open.

## Scope

**In Scope:**
- A note per session, persisted by the daemon, carried on the session wire so every window sees
  it.
- The Focus header's notebook glyph and its panel: rendered view, inline editor, autosave,
  pop-out with drag and resize.
- A note marker and read-only hover on the rail card and the tile header.
- Note lifetime tied to the session's card: kept while ended, resumed, restarted; deleted on
  Remove.
- Mockups in `plans/session-notes/mockups/` (local HTML + `mock.css`), authored by `/plan-work`,
  for the glyph, the panel in both forms, and the rail marker.

**Out of Scope:**
- Notes not tied to a session (global notes), notes on a group.
- Searching or exporting notes.
- A keyboard chord for the note (kb:spec/shortcuts untouched).
- Sending any part of a note to Claude Code, or a note derived from the session's content.
- Any size cap on a note.

## Requirements

1. **Glyph.** The Focus header shows a small notebook glyph left of the session title. It is muted
   while the session's note is empty and in the foreground colour once the note has text. It is
   reachable by Tab, and Enter or Space opens it as a click does. A dead session shows it too.
2. **Anchored panel.** Clicking the glyph opens a panel anchored under it showing the note
   rendered with everything the docs reader renders (markdown, frontmatter, mermaid). Clicking the
   glyph again or clicking anywhere outside the panel closes it. Escape closes it when not
   editing.
3. **Editing.** One click on the rendered note puts the panel in edit mode on the raw text, and
   leaving edit mode renders it again; the switch is immediate, with no Save button or confirm.
   The usual editing keys work as in any text editor, including undo and redo, selection and
   newline on Enter. Escape while editing leaves edit mode (and saves) without closing the panel.
4. **Autosave.** Text is saved within about a second of typing, and closing the panel, leaving
   edit mode, focusing another session, reloading or closing the browser right after typing keeps
   every character. An empty note is the same as no note: the glyph goes muted and the markers
   disappear.
5. **Pop-out.** A control at the panel's top right pops it out into a free-floating panel over the
   main slot. Popped out, it has a close button at its top right with the pop-in control to its
   left, and only the close button, the pop-in control and Escape (when not editing) close it;
   click-away and the glyph do not, so the developer can type in the terminal with the note open.
   Pop-in returns it to the anchored form.
6. **Drag and resize.** The popped-out panel can be dragged by its header anywhere inside the main
   slot and resized from its edges and corners as a native window is, down to a minimum size that
   still shows its controls and a few lines. It never overlaps the rail, the masthead or the Focus
   header, and a window resize keeps it inside the main slot.
7. **Follows focus.** When the developer focuses another session, a popped-out panel stays where it
   is and shows that session's note; an anchored panel closes.
8. **Remembered per window.** Whether the panel is popped out, and its position and size, persist
   for the window across reloads.
9. **Rail card and tile header.** Each shows a small marker only while the session's note has text.
   Hovering the marker opens a read-only panel with the note rendered, cut off past a length that
   still shows enough of the top to be useful, so a note can be checked without focusing the
   session. Nothing on the card or tile edits the note. The marker's placement and the cut length
   are `/plan-work`'s to decide, with mockups.
10. **Lifetime.** An ended session keeps its note, readable and editable from the header and the
    hovers. Resume, a daemon restart, reconcile and a rebind keep it. Remove deletes it with the
    session; there is no note archive.
11. **Other windows.** A second dashboard window shows the saved text the next time it opens the
    panel, and a panel already open and not in edit mode updates in place. Two windows editing the
    same note at once: last write wins, with no merge and no conflict prompt.
12. **Daemon down.** While musterd is unreachable the editor keeps the text, shows that it is
    unsaved, and saves on its own once the daemon is back; nothing typed in the gap is lost.
13. **Privacy.** A note never appears in an issue snapshot, the rail's activity line, the title,
    or anything sent to Claude Code.

## Edge Cases & Considerations

- **Hook loss is irrelevant**: the note has no Claude Code source, so no hook, status post or
  transcript line ever sets or clears it.
- **Session switch mid-edit**: the pending text saves to the session it was typed for, then the
  popped-out panel shows the new session's note; nothing lands on the wrong session.
- **Remove while the panel is open**: the panel closes with the card; a popped-out panel shows the
  next focused session's note.
- **No data yet / daemon snapshot**: a session with no note renders the muted glyph and no marker;
  the snapshot a reconnecting window receives carries every note, so no window shows a stale one.
- **Very long notes**: no cap, so the anchored panel and the hovers scroll or truncate rather than
  grow past the viewport; the popped-out panel scrolls inside its chosen size.
- **Rendering failures**: malformed frontmatter or mermaid renders the way the docs reader renders
  them (the reader's behaviour, not new), and never blocks editing.
- **Narrow header**: the glyph is part of the header's give-way order; it must not push the action
  cluster out of view.

## Acceptance Criteria

- [ ] On a session with no note the Focus header's glyph is muted; typing text and leaving edit
      mode turns it foreground, and clearing the text turns it muted again.
- [ ] Type a note, close the panel, reload the dashboard: the panel shows the same text rendered.
- [ ] Markdown, frontmatter and a mermaid fence in a note render as the same content does in the
      docs reader.
- [ ] While editing, Escape leaves edit mode with the text saved and the panel open; when not
      editing, Escape closes the anchored panel.
- [ ] Undo and redo while editing reverse and reapply typed text.
- [ ] Popped out, clicking into the terminal and typing leaves the panel open; the close button,
      the pop-in control and Escape (not editing) each close or pop it in.
- [ ] Popped out, dragging moves the panel and resizing from an edge or corner changes its size;
      at every window size the panel stays within the main slot and never overlaps the rail,
      masthead or Focus header.
- [ ] Popped out, focusing another session shows that session's note in the same place; a reload
      brings the panel back popped out at the same position and size.
- [ ] A rail card and a tile header show a marker only while the note has text; hovering shows
      the rendered note, cut off for a long note; no control on either edits it.
- [ ] Stop the session: the note is still readable and editable. Resume it: the note is still
      there. Restart musterd: still there. Remove the session: the note is gone with it.
- [ ] Edit the note in one window: a second window with the panel open and not editing shows the
      new text without a reload.
- [ ] Stop musterd, type in the editor: the panel shows the note unsaved and keeps the text;
      start musterd: the note saves without any action and a reload shows it.
- [ ] An issue snapshot captured on a session with a note contains none of the note's text.

## Feature Spec Delta

**notes** — new feature. `docs/features/notes/spec.md` is authored by `/plan-work` before
`/orchestrate` runs; its body states requirements 1–13 as present-tense product truth.

**focus** — becomes true:
- The mainhead shows a notebook glyph left of the session name, muted while the session's note is
  empty, that opens the note panel (kb:spec/notes).

**focus** — stops being true: nothing.

**rail** — becomes true:
- A card carries a note marker while the session's note has text; hovering it shows the note
  rendered, read-only (kb:spec/notes).

**rail** — stops being true: nothing.

**tiles** — becomes true:
- A tile's header carries the same note marker and hover as the rail card (kb:spec/notes).

**tiles** — stops being true: nothing.

**lifecycle, connection, reader** — Touches: the session row and the `/ws` snapshot carry the
note; the reader's renderer is reused. No sentence in their specs changes.

## References

- [#95](https://github.com/Zalaras/muster/issues/95) — the issue; `TODO.md` § "What a session
  records (#93, #101, #95)".
- kb:spec/rename, kb:adr/rename-muster-owned-title-override-wins — the Muster-owned per-session
  field precedent.
- kb:spec/rail, kb:adr/rail-timer-tinted-wherever-cache-warmth-known — the rail hover panel
  precedent; `plans/see-added-dirs/plan.md` REQ-7 — the Focus header's location panel.
- kb:spec/reader — the renderer the note shares.
- kb:spec/focus, kb:adr/focus-header-give-way-order-title-last — where the glyph sits.
- kb:adr/issue-payload-allowlist-never-dump — why the note stays out of issue snapshots.
- kb:diagram/domain-model, kb:diagram/store-schema — the records that change with the field.
- Mockups: `plans/session-notes/mockups/` (to be authored by `/plan-work`; local HTML, never an
  artifact).
