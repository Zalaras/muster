---
id: notes-popout-per-session-anywhere-in-window
type: decision
status: accepted
date: 2026-11-04
summary: Popping out the note is per session, each with its own rectangle clamped to the browser window, kept per tab in session storage; hidden in Tiles.
features: [notes]
tags: [ux, user-decision]
files: []
tests: []
refs: [plan:popped-out-note-enhance]
supersedes: [notes-popout-hidden-in-tiles-geometry-per-tab]
---
**Context.** One popped-out panel followed focus and showed whichever session was focused, so it was
unclear whose note was on screen (#112), and it was clamped into the main slot. One remembered
rectangle served every session.

**Options.** (A) Keep one floating panel that follows focus, only widening its bounds. (B) Make
popping out a per-session state with a per-session rectangle, shown only for the focused session.

**Decision.** B, by the developer. Each session is popped out or not on its own and has its own
rectangle. In Focus the focused session's panel shows iff that session is popped out. The panel
drags and resizes anywhere inside the browser window, over the rail, masthead and Focus header, and
is clamped into the window (moved in first, then shrunk, never below 260×150). A first pop-out opens
at 360×300, 24px in from the main slot's top right. Pop in, Close and Open in window take the
session out of the popped-out set but keep its rectangle; only Remove forgets it, and an ended
session keeps it. The state is kept per browser tab in session storage under a new key; the old
single-panel value is ignored. In Tiles no in-page panel shows (unchanged).

**Consequences.** Switching sessions never shows another session's note in a floating panel. Old
remembered places are dropped once on upgrade. Two tabs can hold different layouts.
