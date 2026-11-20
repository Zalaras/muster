# Prototype log: better-terminal

**Started**: 2026-11-17
**Weekly usage at start**: 23.0%

## Description

Richer terminal functionality (TODO.md § Enhancements): a second pass over the plain shell, which
today is one shell per Claude session, tethered to its directory and ephemeral. The developer adds:
"I also think we should have a dropdown so we can 'add terminals' to the session in case we need to
have more than one long running command."

## Rounds

### Round 0 — 2026-11-17
- Built: the surface switch reads `claude | shell 1 | ▾ | docs`. The ▾ opens a **Terminals** menu
  listing every terminal the session has running (`shell 1`, `shell 2`, …), each with a spinner and
  "running" while a command is in progress or "idle" otherwise, the one on screen highlighted, and
  an × to close it. **+ New terminal** opens another terminal in the session's directory and shows
  it. The shell segment's label names the terminal it shows (`shell 2`). Closing the terminal on
  screen shows another running one; closing the last goes back to `claude`. Same control in Focus
  and in every tile.

### Round 1 — 2026-11-19
- Asked: a way to rename each terminal, e.g. a pencil/edit icon. Also asked whether a dropdown is
  the most usable pattern, versus expanding on hover, or opening on click and closing when the
  mouse leaves; wanted options and what is best practice.
- Changed: each row in the Terminals menu shows a ✎ on hover. Clicking it turns the name into a
  text box (Enter saves, Esc cancels, empty resets to `shell N`). The new name shows in the menu
  and on the shell segment (`claude | build | ▾ | docs`), and lasts until that terminal closes.

### Round 2 — 2026-11-19
- Asked: a long name stretched the shell tab, which they did not like — maybe the tab should still
  read `shell`. Wondered whether clicking `shell` should open the list when there is more than one
  terminal, accepting it costs an extra click.
- Changed: the segment always reads `shell`, with a small count badge once there are two or more
  terminals; hovering it names the terminal on screen. Names still show in the Terminals menu.
  The menu gains a "Try: A B C" switch to compare three click behaviours, remembered across reloads:
  A — a separate ▾ opens the list, `shell` goes to the last terminal (as before);
  B — no separate ▾; `shell` opens the list when there is more than one terminal;
  C — no separate ▾; `shell` goes to the last terminal, and clicking it again opens the list.
  B and C show a small ▾ inside the `shell` button.
- Changed mind: the tab showing the terminal's name → the tab always reads `shell`, because a
  long name made it too wide.

### Round 3 — 2026-11-19
- Asked: chose A (in chat).
- Changed: the Try switch is gone; the control is `claude | shell | ▾ | docs` — `shell` goes
  straight to the last terminal used, the separate ▾ opens the Terminals list.
- Accepted: layout A — a separate ▾ for the list, one click on `shell` back to the last terminal.
  Over B (the list on every `shell` click once there are two or more, an extra click to switch
  back) and C (click `shell` again to open the list).

## Done — 2026-11-19

Accepted by the developer as it stands after round 3.
**Weekly usage at end**: 14.0% (the weekly window reset during the prototype, so it does not
compare with the 23.0% at the start).

Screenshots of the accepted states are in `prototype/`: the Focus view on a terminal with the
`shell 2` count, the switch close up, the Terminals menu open, and a terminal being renamed in it.
