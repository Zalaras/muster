# Plan: Popped-out note enhancements

**Created**: 2026-11-04
**Status**: completed
**Work Type**: web
**E2E Scope**: new-specs
**Fixture plan**: notes.spec.ts daemon (existing choice kept: tests restart and stop the daemon, rely on auto-focus of the only session, and the new note-window tests assert what a second page sees of the same session)
**Render fixtures**: notes, notes-tiles
**Features**: notes
**Touches**: connection, reader, actions
**Description**: Per-session pop-out with its own rectangle, placeable anywhere in the browser window, a close control on the anchored panel, and an own-window note popup (closes #112).

## Overview

Closes [#112](https://github.com/Zalaras/muster/issues/112) and the `TODO.md` § Tweaks entry
"Popped out note should stay just on the session". From the approved
`plans/popped-out-note-enhance/spec.md`.

Today the note panel has one popped-out form, shared by every session: once popped out it follows
focus and shows whichever session is focused, it is clamped into the main slot, and one remembered
rectangle (`muster.note-panel` in session storage) serves all sessions. After this work popping out
is a per-session state with a per-session rectangle. The focused session's panel shows only if that
session is popped out. The panel can be dragged and resized anywhere in the browser window, over the
rail, the masthead and the Focus header, and stays inside the window when it shrinks. The anchored
panel gains a Close control. Both forms gain an own-window control that opens the session's note on
its own page, `note.html?session=<id>`, in a popup window.

The note window follows the docs pop-out precedent (kb:adr/reader-popout-is-a-second-page): a
second Vite entry with its own composition root, the same `App` + `WsClient` shape, sharing the
note rendering, the editor and the save/draft logic with the dashboard. musterd serves any built
file through its static file server (`internal/server/server.go:365-369`), so no daemon change
is needed. The work is web-only, with no protocol or schema change.

## Requirements

### Must Have
- [ ] REQ-1: Popping out is per session. In Focus, the in-page panel shows popped out iff the
  focused session is popped out, at that session's rectangle. Focusing a session that is not popped
  out shows no panel. At most one in-page panel shows at a time. (journey 1, property)
- [ ] REQ-2: Each popped-out session has its own position and size. Switching focus between popped
  sessions shows each at its own rectangle. (journey 2)
- [ ] REQ-3: Which sessions are popped out, and each session's rectangle, is remembered per browser
  tab across reloads (session storage, never a daemon preference). A place stored by today's version
  (the single-panel `muster.note-panel` value) is ignored: after the upgrade every session starts
  anchored, and no rectangle is attributed to any session. (journey 2, edge case)
- [ ] REQ-4: Popping in, closing, or moving A's popped-out note to its own window takes A out of the
  popped-out set and leaves every other session popped out at its own rectangle. A's rectangle is
  kept, so A's next pop-out returns to it. Only Remove forgets a session's rectangle; an ended
  session keeps its popped-out state and rectangle. (journey 3, P3)
- [ ] REQ-5: A popped-out panel drags by its header and resizes from every edge and corner anywhere
  inside the browser window (the viewport), over the rail, the masthead and the Focus header
  included. It never leaves the window: a drag or resize past an edge clamps, and when the window
  shrinks the panel first moves in, then shrinks, never below 260×150. A session popped out for the
  first time opens at 360×300, inset 24px from the main slot's top right, clamped into the window.
  (journey 4)
  *Amended (review cycle 2, browser Major 1; decisions/banner-above-popped-panel, consensus):* the
  daemon-down banner and the masthead's connection readout draw above a popped panel placed under
  them (kb:adr/notes-banner-above-popped-panel).
- [ ] REQ-6: The anchored panel's Close control closes it, saves the typed text at once, and
  returns focus to the selected terminal, or to the glyph when no terminal shows (Docs selected, an
  ended session), the same as the glyph and Escape do today. (journey 5)
- [ ] REQ-7: The anchored panel's header holds Pop out, Open in window and Close; the popped-out
  panel's header holds Pop in, Open in window and Close. In a panel down to 260px wide, every
  visible control lies inside the panel, with the existing give-way order (`· <title>` first, then
  the status ellipsizes). (P1)
- [ ] REQ-8: Open in window opens `note.html?session=<id>` in a popup window (no tab strip in
  Chrome) and closes the panel it was pressed in, flushing any typed text first. Pressing it again
  for the same session in the same dashboard tab while that window is open opens no second window
  and brings the existing one to the front. Several sessions can each have their own window open at
  once. If the browser blocks the popup, the panel it was pressed in stays open and nothing is lost.
  (journey 6)
- [ ] REQ-9: The note window shows only the note: a header reading `Note · <title>` with the
  save/connection status, and the body rendered, edited and auto-saved exactly as in the panel
  (markdown, frontmatter and mermaid; one click or Enter edits; Escape or a click elsewhere leaves
  editing; saving within about a second and at once when editing ends or the page hides). It has no
  pop-out, pop-in, own-window or close control. Escape in the window only leaves edit mode and
  never closes the window. The window's document title is `Note · <title>`. It follows the
  dashboard's theme. (P2)
- [ ] REQ-10: The note window stays on its session whatever the dashboard focuses or shows (Focus,
  Tiles, another session). An edit made in the window is saved to its session and shows in the
  dashboard; an edit saved elsewhere shows in the window in place while the window is not editing.
  (journey 6)
- [ ] REQ-11: The note window reads `connecting…` in its status until its socket's first `hello`.
  An edit that cannot reach musterd shows `unsaved, musterd unreachable` in `--warn`, as the panel
  does, until a save succeeds. Text musterd has not acknowledged is kept and re-sent after the
  window's own reload and on reconnect, under the panel's existing rules
  (kb:adr/notes-unsaved-text-kept-in-browser-until-acknowledged). (journey 7)
- [ ] REQ-12: The note window stays readable and editable after its session ends. Once its session
  is removed (a `sessionRemoved`, or a snapshot without it), the window reads
  `This session has been removed.` and no longer edits or saves; any kept text for it is
  dropped. A window opened for an id musterd does not know, or with no valid `session` query, reads
  the same notice once its snapshot arrives (or at once for a malformed query). (journey 7)
- [ ] REQ-13: With browser storage unavailable (the getter throws, its methods throw, the quota is
  full), per-session pop-out, placing, Close and Open in window all work for the life of the page,
  nothing is remembered, and no page error is raised (kb:lesson/browser-storage-unavailable-is-a-source-state).
- [ ] REQ-14: In Tiles no in-page popped-out panel shows. Back in Focus the focused session's
  popped-out panel shows at its rectangle. An open note window stays open and live in Tiles.

### Should Have
- (none)

### Nice to Have
- (none)

## Protocol Contract

No protocol changes. The note window uses the existing `GET /ws` snapshot/`sessionUpsert`/
`sessionRemoved` messages and `PUT /api/sessions/{id}/note` exactly as the dashboard does.

## Schema Changes

No schema changes required.

## UI Specifications

Design authority: `docs/design/design-system.md` § Note panel (and its reference
`plans/session-notes/mockups/panel.html`), § Focus mainhead; `docs/design/ux-flows.md` for Focus
and Tiles. The new control and the note window reuse the panel's tokens: `--bg-raised` ground,
`--edge` border, `--line-control` control boxes, `--warn` unsaved status. web-impl updates the
design-system's Note panel paragraph to match (see Affected Files).

### Views
- **Anchored note panel** (Focus header): header `Note · <title>`, then the status, then Pop out,
  Open in window, Close.
- **Popped-out note panel** (in-page, `position: fixed` over the whole dashboard): header
  `Note · <title>`, the status, then Pop in, Open in window, Close. Shown only in Focus, only for the
  focused session, only when that session is popped out.
- **Note window** (`note.html?session=<id>`, a new page): the note alone filling the window. Header
  `Note · <title>` and the status; body as the panel. No rail, masthead, banner or panel controls.

### User Flows
1. Focus A → glyph → Pop out: A's panel floats at A's remembered rectangle (or the default for a
   first pop-out). Focus B (not popped out): no panel. Focus A: A's panel at the same rectangle.
2. With A popped out, glyph on A moves keyboard focus into A's panel (unchanged); glyph on B (not
   popped) opens B's anchored panel; A's popped state is untouched.
3. Drag A's panel by its header over the rail or the masthead: it follows the pointer and stays
   inside the window. Shrink the window: it moves in, then shrinks to no less than 260×150.
4. Close (either form), Escape inside the popped panel, or Pop in: A leaves the popped-out set, its
   rectangle kept; B stays popped out.
5. Open in window (either form): a popup opens with A's note; the panel it was pressed in closes and
   A leaves the popped-out set. Pressing Open in window for A again (from a later panel) focuses the
   existing window.
6. In the window: click the note → edit → type; the dashboard shows the text after it saves. Focus
   other sessions in the dashboard: the window stays on A.
7. Remove A from the dashboard: A's card, in-page place and kept text go; A's window reads
   `This session has been removed.` and no longer edits.

### States
- No data yet: the note window, before its first `hello`, shows its header `Note` with the status
  `connecting…` (not `--warn`) and an empty body. The in-page panels never render before the
  snapshot (unchanged: no focused session).
- Data: as above. An empty note reads `No note yet. Click to write one (markdown).` in both the
  panel and the window.
- Daemon down: panels unchanged. The note window keeps showing the last known note, editable; an
  edit that fails to save shows `unsaved, musterd unreachable` in `--warn`.
  *Amended (review cycle 1, browser Critical 1, measured: status empty 3 s after musterd was killed):*
  while its socket is reconnecting, the note window's status reads `musterd unreachable` in
  `--warn`, the note still readable and editable, matching design-system §6.7 and the docs
  pop-out's daemon-down notice (kb:adr/notes-window-says-musterd-unreachable-while-reconnecting).
- Session ended: panel and window unchanged, editable.
- Session removed: in-page panel goes with the card; the window shows the removed notice.
- Storage unavailable: everything works for the life of the page; nothing is remembered.

### Testable UI Elements

Existing names (unchanged) are listed because the new criteria assert them.

| Element | Role | Name / Text Pattern | Notes |
|---------|------|---------------------|-------|
| Focus header note glyph | `button` | `Note` | existing |
| Note panel (both forms) | `dialog` | `Note` | existing, explicit `role="dialog"` + `aria-label` |
| Pop out control | `button` | `Pop out note` | existing; anchored form only |
| Pop in control | `button` | `Pop in note` | existing; popped form only |
| Close control | `button` | `Close note` | existing; now in **both** forms |
| Open in window control | `button` | `Open note in window` | new; both forms; sits between pop control and Close |
| Panel / window status | `status` | `` (empty), `connecting…`, `musterd unreachable` or `unsaved, musterd unreachable` | existing `role="status"`; `connecting…` and `musterd unreachable` only in the note window (*Amended*, review cycle 1 browser Critical 1; see States → Daemon down) |
| Rendered note | `group` | `Rendered note` | existing explicit role + label; also in the note window |
| Note editor | `textbox` | `Note text` | existing `<textarea>`; also in the note window |
| Note window header label | — | text matches `/Note\s*·\s*<title>/` | `textContent` of the header; label and title are sibling spans |
| Note window document title | — | `Note · <title>` | `document.title`; before the first snapshot `Note` |
| Note window removed notice | `status` | `This session has been removed.` | mandated `role="status"`; replaces the body and the editor |

#### Invariants

- **INV-1 (one panel, the focused session's)**: in Focus, an in-page note panel is shown iff the
  focused session is popped out or its anchored panel is open; a shown popped-out panel always
  shows the focused session's note at the focused session's rectangle. Asserted after each of:
  focus switch popped→unpopped, unpopped→popped, popped→popped, to the ended session; Tiles→Focus;
  reload; Remove of another (popped) session; Remove of the focused session; window resize.
  → R1, R2, R3, E1, E2, E4
- **INV-2 (inside the window)**: a shown popped-out panel's box lies inside the viewport after any
  drag, resize, window resize, reload with a stored rectangle larger than the window, and
  focus switch to a session whose stored rectangle no longer fits. → R4, R5, W4
- **INV-3 (typed text goes to its session)**: text typed in a panel or a note window is saved to
  the session it was typed for, whatever the dashboard focuses meanwhile, and from every host: the
  popped panel, the anchored panel, the note window. → E3, E5
- **INV-4 (Escape stays put)**: Escape outside a panel never closes, pops in or changes it, wherever
  the popped panel is placed (over the rail or header included)
  (kb:adr/notes-escape-only-from-inside-the-panel). → R6
- **INV-5 (one window per session per tab)**: pressing Open in window for a session whose window
  this tab opened and is still open never opens a second window. → E3

#### Carried-over measurements

- Header at 260px: the existing render test at 260×150 (`web/render/notes.spec.ts:430`) measured
  Pop in and Close inside the panel with the status ellipsized. This plan adds a third control
  (~22px) to each header; the claim "every control stays inside at 260px" is re-measured by R7 on
  the new header, not carried.
- Popped default 360×300 inset 24px from the slot's top right: carried from the design system; still
  valid because the default position is still computed from the main slot and only the clamping
  bounds change to the window.

## Affected Files

The planner's impact read, not a fence: existing files by path, new code by feature glob; REQs and
behaviour, never shape.

### Web (web-impl)
- `web/src/features/notes.ts` — REQ-1, REQ-2, REQ-4, REQ-5, REQ-6, REQ-8, REQ-13, REQ-14: the
  popped-out state becomes per session; focus switches show/hide by the focused session's state;
  positions clamp to the window; Close in the anchored form; Open in window opens/focuses the
  popup and closes the panel; Remove forgets the session's place.
- `web/src/features/notespanelstate.ts` — REQ-3, REQ-4, REQ-13: the per-tab memory holds a
  per-session popped flag and rectangle under a new key; the old single-panel value is ignored.
- `web/src/features/notesgeometry.ts` — REQ-5: clamping bounds are the window; the default stays
  relative to the main slot.
- `web/src/render/notespanel.ts` — REQ-7, REQ-9: the Open in window control; Close shown in both
  forms; a window form of the panel with no controls.
- new under `web/src/features/notes*.ts` — REQ-8, REQ-9, REQ-10, REQ-11, REQ-12: the note window's
  controller (mount, query parse, removed notice) and any pure helper it needs.
- new `web/note.html` and new `web/src/note.ts` — REQ-9, REQ-11: the note window page and its
  composition root, matching `doc.html`/`doc.ts` (theme hint script, update-restart reload).
  Unowned until the orchestrator adds their globs to `docs/features/notes/spec.md`.
- `web/src/wsapp.ts` — REQ-12: a handler set for the note window that also delivers
  `sessionRemoved` to the app (the docs pop-out's set leaves it unwired).
- `web/vite.config.ts` — REQ-9: a third build entry for `note.html`.
- `web/src/style.css` — REQ-5, REQ-7, REQ-9: the popped panel above the rail/masthead/header (its
  existing fixed `z-index: 55` may already suffice), the third control, and the note window's
  full-window layout.
- `docs/design/design-system.md` — REQ-5, REQ-7, REQ-9: the Note panel paragraph says "a
  free-floating panel over the main slot" and "The anchored header carries the pop-out control; the
  popped-out one carries Pop in, then Close", both stop being true; it describes per-session pop-out
  anywhere in the window, the three controls per form, and the note window.

### Existing tests this breaks
- e2e-specs: `web/e2e/notes.spec.ts:223` (E5) — asserts the popped panel shows the second
  session's note after a focus switch; it now shows no panel (the save-to-A half stays true).
- e2e-specs: `web/e2e/notes.spec.ts:527` (E11) — asserts removing a popped-out session shows the
  next focused session's note; that session is not popped out, so no panel shows.
- e2e-specs: `web/e2e/notes.spec.ts:573` (E12) — reloads one remembered panel; still true per
  session but its storage assumptions may change.
- e2e-specs: `web/e2e/notes.spec.ts:636` — "a new tab starts anchored" stays true; check it.
- render-tests: `web/render/notes.spec.ts:299` (R7) — asserts the panel stays inside the main slot;
  it now stays inside the window.
- render-tests: `web/render/notes.spec.ts:430` — the 260×150 header test names Pop in and Close only.
- render-tests: `web/render/notes.spec.ts:470` — "back inside the slot" after a window resize.
- web-tests: `web/src/features/notespanelstate.test.ts` — the stored shape changes.
- web-tests: `web/src/features/notesgeometry.test.ts` — any case asserting slot-relative clamping.

## Edge Cases

1. A place stored by today's version (`muster.note-panel`, one panel, one rectangle) is present at
   load: ignored, every session anchored, nothing attributed. → W2
2. The window shrinks under a popped-out panel: it moves in, then shrinks, never below 260×150. → R4
3. A stored rectangle no longer fits the window at reload or at a focus switch: clamped in on
   show. → R5
4. Several sessions popped out: only the focused session's panel shows. → R1
5. The focused popped-out session is removed: its panel goes with the card; the next focused
   session shows its own state (no panel unless popped). → E2
6. A popped-out session other than the focused one is removed: its place is forgotten; the focused
   panel is untouched. → E2 (shared with edge case 5)
7. A session is removed while this tab is disconnected (no `sessionRemoved` arrives): the next
   snapshot without it forgets its place. → W5
8. A popped-out session ends (Stop): it keeps its popped-out state and rectangle. → E4
9. Open in window while musterd is down: the window opens and reads `connecting…` until its first
   `hello`; typed text is kept and sent once musterd is back. → E6
10. The browser blocks the popup: the panel it was pressed in stays open, nothing lost. → W6
11. Two dashboard tabs: places are per tab; a second tab may open a second window for the same
    session; saves stay in sync (last write wins). → untested: a second dashboard tab's window
    handle is browser behaviour; sync between windows is already E7 of `notes.spec.ts`.
12. Unsent text in a note window at reload or reconnect: re-sent; a `404 unknown_session` drops it.
    → E6 (shared with edge case 9)
13. The note window and the dashboard panel edit the same note at once: last write wins, the
    non-editing side updates in place. → E5
14. Escape pressed in the terminal while the popped panel sits over the rail or header: reaches the
    terminal, panel unchanged. → R6
15. Storage unavailable: pop-out per session, placing, Close and Open in window work; nothing is
    remembered; no page error. → R8
16. The note window opened with a malformed or missing `session` query: the removed notice. → W7
17. The note window opened for an id musterd does not know: the removed notice once the snapshot
    arrives. → R9
18. The dashboard reloads while a note window is open, then Open in window is pressed for that
    session: no second window opens (the named target is reused). → untested: the reused-name
    navigation is browser behaviour; INV-5 is asserted without the reload by E3.
19. Tiles with a session popped out and its note window open: no in-page panel; the window stays
    open and live. → R10, E5
20. Glyph pressed on a session whose note window is open: the anchored panel opens as normal; both
    edit the same note. → untested: no new behaviour, the panel path is unchanged and E5 covers two
    editors on one note.

## Acceptance Criteria

IDs are unique across the whole section — `D*` daemon logic, `W*` web logic, `R*` render (what
the display shows, no daemon), `E*` e2e (a journey across the live daemon). One clause per
criterion; never mix a runnable command with a judgement call in one item.

### Web
- **W1**: The per-tab panel memory round-trips per-session popped flags and rectangles for several
  sessions through save and load.
- **W2**: Loading with only today's `muster.note-panel` value present yields no popped-out session
  and no rectangle for any session.
- **W3**: A stored value with a malformed entry (non-finite number, wrong type, non-integer id)
  drops that entry and keeps the others.
- **W4**: Clamping a rectangle to a window size moves it in before shrinking it, never below
  260×150, for rectangles past each edge and larger than the window.
- **W5**: Forgetting the ids absent from a snapshot removes only those sessions' entries.
- **W6**: When the popup open returns no window, the panel's state is unchanged and still open.
  (web-tests own it; the implementer makes the open-or-focus decision unit-testable and reports
  the seam as a `design:` line.)
- **W7**: The note window's query parse returns no session for a missing, empty, negative or
  non-integer `session` and the id for a bare non-negative integer.

### Render
- **R1**: (`notes`) With notes-short and notes-long popped out at different rectangles, focusing
  notes-plain shows no note panel, and focusing each popped session shows its panel at its own
  rectangle.
- **R2**: (`notes`) Popping in notes-short leaves notes-long popped out at its rectangle when
  focused, and popping notes-short out again returns it to its previous rectangle.
- **R3**: (`notes`) Closing notes-short's popped panel with Close or Escape leaves notes-long popped
  out at its rectangle.
- **R4**: (`notes`) A popped panel dragged past each window edge, resized past each edge and
  corner, and then the window resized to 800×600 and to 400×300, keeps its box inside the viewport,
  never smaller than 260×150 while the viewport allows.
- **R5**: (`notes`) A popped panel dragged to cover the rail, then the masthead, then the Focus
  header sits at that position, and `elementFromPoint` at its header centre is inside the panel.
- **R6**: (`notes`) With the popped panel over the rail and the terminal focused, Escape leaves the
  panel open and unmoved.
- **R7**: (`notes`) At 260px wide with the unsaved status showing, Pop out, Open note in window and
  Close note lie inside the anchored panel, and Pop in, Open note in window and Close note inside
  the popped panel.
- **R8**: (`notes`) With storage blocked, popping out two sessions, switching focus between them and
  closing one works as in R1 and R3, with no page error.
- **R9**: (`notes`) `note.html?session=<notes-long id>` shows the header `Note · notes-long`, the
  rendered long note with its frontmatter and diagram, and document title `Note · notes-long`;
  `note.html?session=<an id not in the fixture>` shows `This session has been removed.`
- **R10**: (`notes`, `notes-tiles` prefs) Switching to Tiles with a session popped out hides the
  panel, and back in Focus it shows at the same rectangle.
- **R11**: (`notes`) The anchored panel's Close control closes it and focus lands in the Claude
  terminal; on notes-ended it lands on the note glyph.
- **R12**: (`notes`) In the note window, one click on the rendered note edits it, and Escape leaves
  edit mode with the window's note still shown.
- **R13**: The note window before its socket's first `hello` shows `connecting…` in its status.

### E2E
- **E1**: A popped out at a moved rectangle and B never popped out: after a reload, A shows popped
  at that rectangle when focused and B shows no panel.
- **E2**: With A and B popped out, removing B leaves A's panel shown and unchanged, and removing the
  focused A shows no panel; B's place is gone from the tab's memory.
- **E3**: Open note in window opens a popup at `note.html?session=<A id>` showing A's note and
  closes the panel it was pressed in; pressing it again for A from a newly opened panel opens no
  second page; opening B's window gives two windows.
- **E4**: Stopping a popped-out session leaves it popped out at its rectangle when focused.
- **E5**: Text typed in A's note window reaches A on the daemon while the dashboard focuses B and
  then Tiles, and an edit saved from the dashboard panel shows in A's window while it is not
  editing.
- **E6**: With musterd stopped, text typed in a note window shows `unsaved, musterd unreachable`,
  survives a reload of that window, and is on the daemon after musterd restarts with no further
  input.
- **E7**: A note window stays editable after its session is stopped, and after Remove reads
  `This session has been removed.` with no editable note.
- **E8**: With the panel popped out for A, typing and then focusing B saves the text to A and shows
  no panel for B (replaces the old E5).

### Automated Checks

```checks
W1 make web-build
W2 make web-test
W3 make web-lint
R1 make render-test
E1 make e2e
C1 make check
C2 ! grep -rn "muster.note-panel\"" web/src --include=*.ts --exclude=*.test.ts
```

C2 scopes out `*.test.ts`: W2's test legitimately writes today's key to prove it is ignored, and
obtains it as a literal in the test file.

### Reviewer-Verified

- **V1**: no `any` types in new web code.
- **V2**: `web/src/note.ts` only wires (kb:adr/process-composition-roots-registration-only): no DOM
  lookup, listener or state of its own beyond what `doc.ts` holds.
- **V3**: in Chrome, the note window opens without a tab strip, and a second press brings the
  existing window to the front.
- **V4**: the note window's layout fills the window at 320×240 and 1200×900 with the body
  scrolling, measured against the window box (kb:lesson/surface-never-measured-against-its-host).
- **V5**: every new browser-storage access goes through `safeSessionStorage()` /
  `safeLocalStorage()`.
- **V6**: `docs/design/design-system.md` § Note panel describes the per-session pop-out, its window
  bounds, the three controls per form and the note window.

## Doc Delta

**notes** — becomes true:
- The anchored panel's header reads `Note · <title>` and holds Pop out, Open in window and Close
  controls; Close, like the glyph, saves at once and returns focus.
- Popping out is per session: each popped-out session has its own position and size, only the
  focused session's panel shows, and a session not popped out shows none.
- The popped-out panel has Pop in, Open in window and Close controls, and drags and resizes anywhere
  inside the browser window, over the rail, the masthead and the Focus header included, staying
  inside it through a window resize.
- Which sessions are popped out, and each one's rectangle, is remembered per browser tab across
  reloads; popping in or closing keeps the rectangle, an ended session keeps its place, and Remove
  drops it.
- Open in window opens the session's note alone in a popup window headed `Note · <title>`, with the
  panel's rendering, editing, saving and unreachable status, and closes the panel it was pressed in;
  the window stays on its session whatever the dashboard shows, pressing again in the same tab
  brings it to the front, and after Remove it reads `This session has been removed.` and no
  longer edits.

**notes** — stops being true:
- "Its header reads `Note · <title>` and holds a pop-out control."
- "When focus moves to another session it stays where it is and shows that session's note. With no session focused, it closes."
- "and always stays inside the main slot, never covering the rail, the masthead or the Focus header, through a window resize too."
- "Whether the panel is popped out, and where and how big it is, is remembered per browser tab across reloads."

## Out of scope

- Document Picture-in-Picture or any always-on-top window.
- A Save button, or any change to automatic saving.
- Showing in-page popped-out panels in Tiles.
- Group-level notes (#108, its own entry).
- Any change to what the note holds or how it is stored; any daemon or protocol change.

Nothing new is filed to `TODO.md`.

## Implementation Notes

**Hints (non-binding):**
- `doc.html`/`doc.ts` and `mountStandaloneReader`/`parseStandaloneQuery` in
  `web/src/features/reader.ts` are the shape to match for the note window; `popoutWsHandlers` in
  `web/src/wsapp.ts` is the docs pop-out's handler set, lacking `onSessionRemoved`.
- `window.open(url, "muster-note-<id>", "popup,width=…,height=…")` returns `null` when blocked.
  Opening the same name again navigates (reloads) the existing window, so keep the returned handle
  per session and call `focus()` on it while `!closed`; fall back to the named open after a
  dashboard reload. `noopener` would lose the handle.
- `createNoteSaver`, `createDraftStore`, `adoptIncoming`, `unsavedStatus` and `buildNotePanel` are
  reusable as they stand; drafts live in local storage keyed by session, shared by the dashboard
  and the window (same origin).
- `slotBounds()` in `notes.ts` stays useful only for the first-pop-out default.
- Render harness: `page.goto(`${RENDER_ORIGIN}/note.html?session=<id>`)` gets the harness routes
  (see `web/render/reader.spec.ts:739`); a popup window would not.

**Decisions** (written as `proposed` ADRs at approval):
- `notes-popout-per-session-anywhere-in-window` — supersedes
  kb:adr/notes-popout-hidden-in-tiles-geometry-per-tab: popping out and its rectangle are per
  session, clamped to the browser window, kept per tab in session storage under a new key with
  today's key ignored; pop-in/close keep the rectangle, Remove drops it; hidden in Tiles (kept).
- `notes-own-window-is-a-third-page` — the note window is a third Vite page with its own
  composition root, opened as a named popup per session, following
  kb:adr/reader-popout-is-a-second-page; Escape there only leaves edit mode.

**Doc upkeep (orchestrator)**: add `web/note.html` and `web/src/note.ts` to the notes spec's
`web:` globs; tick and move the #112 `TODO.md` entry at Completion; `docs/diagrams` web-components
gains the third entry (`note.ts`) beside `doc.ts`.

Existing records honoured: kb:adr/notes-escape-only-from-inside-the-panel,
kb:adr/notes-unsaved-text-kept-in-browser-until-acknowledged,
kb:adr/notes-muster-owned-session-field-whole-text, kb:adr/connection-storage-accessor-resolves-per-call,
kb:adr/lifecycle-ended-rows-kept-until-remove.
