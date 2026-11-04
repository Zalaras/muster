# Spec: Popped-out note enhancements

**Plan**: popped-out-note-enhance
**Created**: 2026-11-04
**Features**: notes
**Status**: Approved

## Goal

Close [#112](https://github.com/Zalaras/muster/issues/112) ("Popped out note should stay just on
the session"). Today a popped-out note follows focus: switching sessions shows the newly focused
session's note in the same floating panel, so it is unclear whose note is on screen, and the panel
is confined to the main slot. After this work:

1. Popping out is per session. A session's note is popped out or not independently of every other
   session; focusing a session shows its popped-out panel if it has one, and none otherwise.
2. Each popped-out session keeps its own position and size.
3. The in-page popped-out panel can be placed anywhere in the browser window.
4. The anchored panel gains a close control.
5. A new own-window control opens a session's note in its own popup window (no tab strip), so the
   developer can keep notes on another screen or beside the browser.

The developer chose to keep both pop-out forms: the in-page floating panel (quick, stays with the
dashboard) and the own window (anywhere on the desktop).

## Background & Context

- `docs/features/notes/spec.md` describes today's note: a Muster-owned session field
  (`kb:adr/notes-muster-owned-session-field-whole-text`), saved automatically, unacknowledged text
  kept in the browser and re-sent (`kb:adr/notes-unsaved-text-kept-in-browser-until-acknowledged`),
  Escape handled only from inside the panel (`kb:adr/notes-escape-only-from-inside-the-panel`).
- `kb:adr/notes-popout-hidden-in-tiles-geometry-per-tab` (accepted) assumes one panel that follows
  the focused session and is clamped into the main slot. This work replaces those two parts; its
  "hidden in Tiles" and "kept per browser tab, never a daemon preference" parts stand. `/plan-work`
  writes the superseding ADR.
- The docs reader already has a second page for its pop-out (`/doc.html`, `kb:spec/reader`),
  sharing the component and socket client and staying live with the dashboard; the note window
  follows that precedent, opened as a popup window rather than a tab.
- The dashboard binds `127.0.0.1` (`kb:spec/connection`) and is developed for Chrome only; a popup
  window degrades to a normal window or tab in other browsers, which never blocks a land.
- Behaviour of other features this sits beside: Focus decides which session is shown in the main
  slot; Tiles has no main slot and hides the in-page panel; Remove deletes a session row and its
  note (`kb:adr/lifecycle-ended-rows-kept-until-remove`).
- No diagram covers the note panel; none is proposed.

## Scope

**In Scope:**
- Per-session pop-out state and per-session position and size, remembered per browser tab across
  reloads.
- The in-page popped-out panel placeable and resizable anywhere inside the browser window,
  including over the rail, the masthead and the Focus header.
- A close control on the anchored panel.
- An own-window control on both panel forms, opening the session's note alone in a popup window.

**Out of Scope:**
- Document Picture-in-Picture or any always-on-top window.
- A Save button, or any change to automatic saving.
- Showing in-page popped-out panels in Tiles (they stay hidden there and return in Focus).
- Group-level notes ([#108](https://github.com/Zalaras/muster/issues/108), its own entry).
- Any change to what the note holds or how it is stored; no daemon or daemon↔UI protocol change.

## Requirements

**Journeys**

1. Popping out A's note and then focusing B (never popped out) shows no note panel; focusing A
   again shows A's popped-out panel exactly where it was left.
2. With A and B popped out at different positions and sizes, switching between them shows each at
   its own place; after a reload both are still popped out at those places.
3. Popping in or closing A's popped-out note leaves B popped out.
4. A popped-out panel can be dragged and resized over the rail, the masthead and the Focus header,
   and never leaves the browser window, including when the window shrinks.
5. The anchored panel's close control closes it, saves what was typed, and returns focus to the
   terminal, or to the glyph when no terminal shows.
6. The own-window control opens that session's note in a popup window and closes the panel it was
   pressed in. An edit made in the window is saved and shows in the dashboard; focusing other
   sessions in the dashboard does not change the window; pressing the control again for that
   session brings its existing window to the front rather than opening a second one; several
   sessions can each have their own window open at once.
7. The note window keeps working across its own reload, shows `unsaved, musterd unreachable` while
   musterd is down, stays editable after its session ends, and says the session is gone once it is
   removed.

**Properties**

- P1. The anchored panel's header holds pop-out, own-window and close controls; the popped-out
  panel's header holds pop-in, own-window and close controls. In a panel down to 260px every
  control stays inside the panel.
- P2. The note window shows only the note, headed `Note · <title>`, with the panel's rendering,
  editing and save status.
- P3. A removed session loses its popped-out place; an ended session keeps its popped-out note at
  its place.

## Edge Cases & Considerations

- **A place remembered by today's version** (one panel, one rectangle) is ignored after the
  upgrade: every session starts anchored, and nothing is attributed to the wrong session.
- **Window shrinks under a popped-out panel**: the panel moves in first, then shrinks, never below
  the size that still shows its controls and a few lines.
- **Only one in-page panel at a time**: several sessions may be popped out, but only the focused
  session's panel shows.
- **Session removed**: its in-page panel goes with the card; its note window stays open, says the
  session is gone and stops editing.
- **Opening a note window while musterd is down**: the window opens and reads `connecting…` until
  its first connection, as the docs pop-out does; typed text is kept and sent once musterd is back.
- **Browser blocks the popup**: the panel it was pressed in stays open; nothing is lost.
- **Two dashboard tabs**: pop-out places are per tab; "brings the existing window to the front"
  holds within one dashboard tab, so a second tab may open a second window for the same session,
  and saves stay in sync between them as they do between windows today.
- **Unsent text typed in a note window** is kept and re-sent after a reload or reconnect under the
  panel's existing rules; a save answered `404 unknown_session` drops it.
- Escape remains handled only from inside a panel (`kb:adr/notes-escape-only-from-inside-the-panel`),
  so a panel placed over the rail or header never swallows Escape meant for the terminal.

## Acceptance Criteria

- [ ] Popping out A, then focusing B (never popped out), shows no note panel; focusing A again shows
      A's popped-out panel at the same position and size.
- [ ] A and B popped out at different rectangles each show at their own rectangle when focused;
      after a reload both are still popped out at those rectangles.
- [ ] Popping in or closing A leaves B popped out at B's rectangle.
- [ ] A popped-out panel can be dragged over the rail, the masthead and the Focus header; at every
      window size it stays inside the browser window, and at the minimum size its controls show.
- [ ] The anchored panel's close control closes it, the typed text is saved (present on the
      session after a reload), and focus returns to the terminal, or to the glyph when no terminal
      shows.
- [ ] Both panel forms show the own-window control; in a 260px panel every header control stays
      inside it.
- [ ] The own-window control opens a popup window showing only that session's note, headed
      `Note · <title>`, and closes the panel it was pressed in.
- [ ] An edit in the note window shows in the dashboard; one made in the dashboard shows in the
      window while it is not editing.
- [ ] Focusing another session in the dashboard leaves the note window on its session; pressing the
      control again for that session in the same tab opens no second window; two sessions can each
      have a window open at once.
- [ ] The note window shows `unsaved, musterd unreachable` while musterd is down, keeps unsent text
      across its own reload, and sends it once musterd is back.
- [ ] The note window stays editable after its session ends; after Remove it says the session is
      gone and does not edit.
- [ ] An ended session keeps its popped-out place; a removed one loses it.
- [ ] A pop-out place remembered by today's version leaves every session anchored after the
      upgrade.
- [ ] Tiles shows no in-page popped-out panel, and an open note window stays open in Tiles.

## Feature Spec Delta

**notes** — becomes true:
- The anchored panel's header reads `Note · <title>` and holds pop-out, own-window and close
  controls; close, like the glyph, saves at once and returns focus.
- Popping out is per session: each popped-out session has its own position and size, only the
  focused session's panel shows, and a session never popped out shows none.
- The popped-out panel has pop-in, own-window and close controls, and drags and resizes anywhere
  inside the browser window, over the rail, the masthead and the Focus header included, staying
  inside it through a window resize.
- Which sessions are popped out, and each one's rectangle, is remembered per browser tab across
  reloads; an ended session keeps its rectangle and Remove drops it.
- The own-window control opens the session's note alone in a popup window headed `Note · <title>`,
  with the panel's rendering, editing, saving and unreachable status, and closes the panel it was
  pressed in; the window stays on its session whatever the dashboard focuses or shows, pressing
  again in the same tab brings it to the front, and after Remove it reads that the session is gone
  and no longer edits.

**notes** — stops being true:
- "Its header reads `Note · <title>` and holds a pop-out control."
- "When focus moves to another session it stays where it is and shows that session's note. With no
  session focused, it closes."
- "…and always stays inside the main slot, never covering the rail, the masthead or the Focus
  header, through a window resize too."
- "Whether the panel is popped out, and where and how big it is, is remembered per browser tab
  across reloads."

The body is 785 words of a 1000-word cap; the additions above are offset by these removals.

## References

- Issue [#112](https://github.com/Zalaras/muster/issues/112); `TODO.md` § Tweaks entry "Popped out
  note should stay just on the session".
- `docs/features/notes/spec.md`; `plans/session-notes/spec.md` (requirements 5–8, the original
  pop-out).
- `kb:adr/notes-popout-hidden-in-tiles-geometry-per-tab` (to be partly superseded),
  `kb:adr/notes-escape-only-from-inside-the-panel`,
  `kb:adr/notes-unsaved-text-kept-in-browser-until-acknowledged`,
  `kb:adr/notes-muster-owned-session-field-whole-text`.
- `kb:spec/reader` (the `/doc.html` pop-out precedent), `kb:spec/connection`.
