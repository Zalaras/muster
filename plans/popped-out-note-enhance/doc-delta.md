# Doc delta — popped-out-note-enhance

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

**notes** — folded in from the implementation logs (web-implementation.md, Decisions and Fix Attempt 2 (review cycle 1)):
- The focus-return sentence ("Closing by Escape, the popped panel's close control or the glyph returns focus…") reads "its Close control" for both forms (the anchored panel now has one).
- While its socket is reconnecting, the note window's status reads `musterd unreachable` in `--warn`, the note still readable and editable; a failed save reads `unsaved, musterd unreachable` (plan amendment, States → Daemon down; kb:adr/notes-window-says-musterd-unreachable-while-reconnecting).
- Before its first `hello`, the note window's status reads `connecting…`.
- The popped panel draws below menus and hover popovers, so a menu opened over it stays fully clickable, and below the daemon-down banner and the masthead's connection readout, so a placed panel never hides the outage (decisions/banner-above-popped-panel, kb:adr/notes-banner-above-popped-panel).

**reader** (Touches) — no behaviour change: `parseStandaloneQuery` now shares its `?session=` rule with the note window via `web/src/reader/query.ts`.

**notes** — folded in from Fix Attempt 3 (review cycle 1) and the cycle-1 wave-3 E2E tests:
- The unsaved status, in the panel and in the note window, clears once the kept text is acknowledged by musterd, whichever host (dashboard tab or note window) re-sent it; while a host still holds unacknowledged text it stays unsaved (kb:adr/notes-unsaved-text-kept-in-browser-until-acknowledged).
