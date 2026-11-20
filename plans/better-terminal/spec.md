# Spec: Several terminals per session

**Plan**: better-terminal
**Created**: 2026-11-19
**Features**: surfaces
**Touches**: focus, tiles, lifecycle
**Status**: Approved

## Goal

Let a session hold more than one plain terminal, so the developer can leave a long-running command
going in one (a dev server, a watcher, a build) and still type in another, without leaving Muster.
Today a session has exactly one shell. This delivers the "more than one shell per session" part of
TODO.md's **Richer terminal functionality** entry, plus the developer's own ask for a dropdown to
"add terminals" to a session; the entry's other examples stay in the backlog.

The shape was found by prototype (`proto/better-terminal`, 2026-11-17 to 2026-11-19) and accepted
after three rounds.

## Background & Context

- The shell today is an ephemeral second attach target hanging off a session, never a session of
  its own: no row, card, state or wire kind, forgotten on restart
  (kb:adr/surfaces-shell-is-attach-target-not-session). That record left "several shells per
  session" in the backlog; this spec takes it up and keeps every other property of a shell as it
  is. Each terminal is a shell exactly as one is today — same directory, same lifetime, same lack
  of session environment (kb:adr/surfaces-shell-pane-carries-no-session-env), same scroll and key
  handling (kb:adr/surfaces-shell-scroll-via-daemon-copy-mode).
- A shell dies on exit, Remove, reconcile or a kill shutdown, and a kill shutdown counts shells in
  its prompt (kb:adr/surfaces-shell-dies-at-kill-shutdown-too). Every one of those applies to every
  terminal.
- A session's Claude socket and shell socket never supersede each other
  (kb:adr/surfaces-one-live-client-per-attach-target); the same holds between terminals — each is
  its own attach target.
- The busy indicator comes from tmux's process state, never from terminal output
  (kb:adr/surfaces-shell-busy-from-tmux-process-state); a terminal's running/idle in the menu is the
  same reading, per terminal.
- In a tile the surface switch lives in the footer because a header control truncated titles at
  the densest grid (kb:adr/surfaces-shell-control-in-tile-footer). The ▾ adds width to that switch,
  so fit is measured on the built tile, not assumed.
- Focus header and tile footer render the same switch; `focus` and `tiles` only host it.

## Scope

**In Scope:**
- Several terminals per session, added from a menu.
- The ▾ Terminals menu: list, switch, rename, close, add.
- A count on the `shell` segment once there are two or more; the terminal's name on hover.
- Per-terminal running/idle in the menu.
- The same control in the Focus header and every tile footer.

**Out of Scope:**
- Showing the terminal's name on the `shell` tab. Tried in round 1 and rejected in round 2: a long
  name stretched the tab. The tab always reads `shell`.
- Opening the list from the `shell` button itself — tried as layout B (opens on every click once
  there are two or more terminals) and layout C (a second click opens it) and passed over for A.
- Opening the menu on hover, or closing it when the pointer leaves.
- Terminals as an inline tab strip (`shell 1 | shell 2 | +`).
- The rest of the Richer terminal functionality entry: a shell-kind session with its own rail card
  and shortcuts, a global terminal untethered from any session, restoring terminals across daemon
  restarts, a rail-card marker for a terminal running in a session not being viewed.
- Names surviving the terminal or the daemon: a name lasts as long as its terminal.

## Requirements

Journeys:
1. **Add a terminal.** With a session's terminal on screen, the developer opens ▾, chooses **New
   terminal**, and a fresh terminal opens in the session's directory and is shown; the one they left
   keeps running.
2. **Switch terminals.** Choosing a terminal in the menu shows it, with whatever it was doing
   intact; a command left running there is still running.
3. **Back to the last terminal in one click.** Clicking `shell` shows the terminal last shown for
   that session; with no terminal running it starts one, as today.
4. **Rename.** The developer clicks ✎ on a menu row, types a name, presses Enter; the menu shows the
   new name, and hovering `shell` names it while it is on screen. Esc cancels; saving an empty name
   puts back the default `shell N`. The name survives a page reload.
5. **Close.** Clicking × on a row ends that terminal — after a confirmation when it is running a
   command, at once when idle. If it was on screen, another running terminal
   of the session takes its place; closing the last one returns the session to `claude`.
6. **A terminal exits by itself** (`exit`, or killed outside Muster): it leaves the menu, and if it
   was on screen the same fallback as closing applies.
7. **Remove, reconcile and a kill shutdown** end every terminal of the session, and the shutdown
   prompt's count includes all of them.

Properties:
8. The switch reads `claude | shell | ▾ | docs` in the Focus header and every tile footer.
9. The `shell` segment always reads `shell`; a small count beside it shows how many terminals run
   once there are two or more, and none with one or zero.
10. The menu, titled "Terminals", lists each running terminal by name with **running** and a spinner
    while it is running a command, **idle** otherwise; the terminal on screen is highlighted; each
    row has ✎ (shown on hover) and ×; **+ New terminal** sits below the list.
11. A new terminal is named `shell N`, taking the lowest number not in use in that session.
12. The `shell` segment's spinner and tick keep today's behaviour, driven by any of the session's
    terminals.
13. ▾ is disabled while the daemon is unreachable, like the other segment buttons.
14. ▾ opens on click and closes on a click outside it, on Esc, or on choosing an item.
15. The tile footer shows no overflow with the ▾ added at the densest grid.

## Edge Cases & Considerations

- **No cap.** A session may hold any number of terminals. The menu shows up to nine rows and
  scrolls past that, with **+ New terminal** always visible below the list. Problems from very many
  terminals are dealt with if they arise.
- **Closing a busy terminal asks first.** × on a terminal that is running a command asks for
  confirmation, naming the terminal, before ending it; × on an idle terminal ends it at once.
- **Menu while open.** Running/idle follows changes live while the menu is open, as the `shell`
  spinner does — a command that finishes or starts flips its row without reopening the menu.
- **Docs on screen.** A terminal ending while `docs` is showing updates the menu and count; the
  reader stays put.
- **Ended session.** Terminals open and run on a session whose Claude has ended, as a shell does
  today.
- **Two windows.** The one-live-client law holds per terminal: opening the same terminal in a second
  window supersedes the first, as today; different terminals never supersede each other.
- **Daemon restart.** Every terminal and its name is gone; the session starts again with none, as a
  shell does today.

## Acceptance Criteria

- [ ] From a terminal on screen, New terminal shows a second terminal in the session directory and
      the first keeps running a command started in it.
- [ ] The menu lists both, with the running one shown as running, and switching between them shows
      each one's own output.
- [ ] With the claude surface showing, one click on `shell` returns to the terminal last shown.
- [ ] Renaming shows the new name in the menu and the `shell` tooltip, keeps it across a reload, and
      an empty name restores `shell N`.
- [ ] Closing the terminal on screen shows another running one; closing the last returns to claude.
- [ ] × on a running terminal asks before ending it; on an idle one it ends at once.
- [ ] With the menu open, a command finishing flips its row from running to idle without reopening.
- [ ] With ten or more terminals the menu shows nine rows and scrolls, New terminal still visible.
- [ ] A terminal that exits by itself leaves the menu with the same fallback.
- [ ] The count shows 2 with two terminals and nothing with one; the tab text stays `shell`.
- [ ] Remove, reconcile and a kill shutdown leave no terminal of the session running; the shutdown
      prompt counts every terminal.
- [ ] The tile footer has no overflow with ▾ at the densest grid, measured on the build.
- [ ] ▾ is disabled while the daemon is down.

## Feature Spec Delta

**surfaces** — becomes true:
- A session may carry several plain shells, its terminals, each its own attach target, switched by a
  `claude | shell | ▾ | docs` segment in the mainhead and in a tile's footer.
- `shell` shows the terminal last shown, starting one when none is running; ▾ opens a Terminals menu
  listing each running terminal by name, running or idle, with the one on screen marked, a rename,
  a close, and New terminal.
- The `shell` segment always reads `shell`; a count beside it shows once two or more terminals run,
  and its tooltip names the terminal on screen.
- A new terminal is named `shell N`, the lowest number free in its session, until renamed; a name
  lasts as long as its terminal.
- When the terminal on screen ends, another running terminal of the session takes its place, or
  claude when none is left.
- The shell segment's spinner and tick follow any of the session's terminals; the menu shows which
  one is busy.

**surfaces** — stops being true:
- "A session may carry a plain shell as a second attach target, switched by a `claude | shell`
  segment in the mainhead and in a tile's footer"
- "the shell segment shows a spinner while busy and a tick once work finishes" — replaced by the
  any-terminal sentence above (the reduced-motion clause stays).

## References

- `plans/better-terminal/prototype-log.md` — rounds 0–3, accepted 2026-11-19.
- `plans/better-terminal/prototype/` — `focus-shell-two-terminals.png`, `switch-with-count.png`,
  `terminals-menu.png`, `terminals-menu-close-up.png`, `terminals-menu-renaming.png`.
- `plans/better-terminal/prototype-feedback.jsonl` — the feedback batches as sent.
- TODO.md § Enhancements — Richer terminal functionality.
- `plans/plain-terminal-session/spec.md` — the first pass this extends.
- kb:adr/surfaces-shell-is-attach-target-not-session, kb:adr/surfaces-shell-dies-at-kill-shutdown-too,
  kb:adr/surfaces-one-live-client-per-attach-target, kb:adr/surfaces-shell-busy-from-tmux-process-state,
  kb:adr/surfaces-shell-control-in-tile-footer, kb:adr/surfaces-shell-pane-carries-no-session-env.
