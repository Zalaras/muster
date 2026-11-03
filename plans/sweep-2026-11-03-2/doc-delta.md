# Doc delta: sweep-2026-11-03-2

**focus** — becomes true: a Dismiss that hides the strip while it holds focus returns focus to the
selected terminal, or to the header's Session actions `⋯` when none shows
(`docs/features/focus/spec.md`, the "Dismiss clears both" sentence).
**rail** — becomes true: the card menu reads one Mark as read/unread toggle by the session's state,
then Stop… or Resume and Remove…, then Pin or Unpin, then Move to last; the selection menu reads the
toggle (Mark as read when any is unread), Stop…, Remove…, then Move to. Stops being true: "Move to,
Pin or Unpin, then Mark as read and Mark as unread, always" and the selection's "Move to and the
marks"; the citation moves to the new superseding ADR
(`docs/adr/rail-card-menu-read-toggle-first-move-to-last.md`, proposed on this branch, superseding
kb:adr/rail-card-menu-offers-remove-and-marks-whatever-the-state and restating its other decisions).
**groups / design system** — becomes true: `docs/design/design-system.md` § Section header names the
caret's size (20px button, about 9×6 px triangle).


## From the logs
- web-implementation.md: doc-delta: `design-system.md` § Section header should name the 20px caret button with a ~9x6 triangle (already in plan Doc Delta).
