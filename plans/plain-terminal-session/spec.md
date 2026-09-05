# Spec: Plain terminal session

**Plan**: plain-terminal-session
**Created**: 2026-09-05
**Status**: Draft

## Goal

Give Muster a plain shell you can type commands into, so running `git log`, `rg`, or any
other one-off command doesn't mean switching to Terminal.app or going through Claude
Code's `!` prefix. This closes [#21](https://github.com/Zalaras/muster/issues/21) and
serves SPEC §2.5's "all sessions live in one place" promise — today that promise is only
true for Claude sessions.

The first pass is deliberately the cheapest shape that removes the itch: a shell **tabbed
to an existing Claude session**, running in that session's directory. Richer terminal
functionality is post-release follow-up (see Out of Scope).

## Background & Context

**Two shapes were considered and one was rejected for this pass.**

*Option A — a plain session is a session row with `kind: "shell"`* (the framing in
TODO.md's #21 entry). Rejected for the first pass, but not because it is hard: most of the
`Session` object's Claude-derived fields (`attention`, `failure`, `model`, `lastActivity`,
`claudeSessionId`, `repo`) are already `| null` on the wire, `context`'s numbers are
already nullable and render "unknown", and only `state` and `permissionMode` are
hard-required — a `"shell"` state is a one-line protocol delta plus four mechanical
lookup-table entries (`web/src/sessions/card.ts:138`, `render/dead.ts:69`,
`render/tiles.ts:67`, `sessions/sort.ts:26`). It was rejected because it buys persistence,
rail presence and shortcut addressability that this pass does not need, and each carries a
decision (what Resume means for a shell, what the state timer counts) that can be settled
later with real usage behind it.

*Option B — an ephemeral shell that is not a session* — chosen, in its tabbed variant.

**Why the tabbed variant is nearly free.** `/ws/terminal/{id}` (protocol §6) already
enforces a one-live-client law per attach target and moves geometry ownership with the
socket, so switching tabs is mechanically identical to switching sessions — the machinery
tabs need already exists and is already tested. `TerminalSurface`
(`web/src/terminal/pane.ts`) is view-agnostic by construction: Focus's pane and a Tiles
tile already mount the same component, so file-drop (#8's Terminal.app-escaped paste) and
the `pty.Setsize`-then-`resize-window` sizing (SPEC §2.4, FINDINGS §7(d)) come free for a
shell surface.

**Why the shell needs its own tmux session.** The Claude pane's tmux session
(`muster-<id>`) is occupied and the one-live-client law is keyed per attach target, so the
shell runs in a sibling — e.g. `muster-<id>-shell`. This matters for reconcile: tmux
sessions **outlive musterd** by design (SPEC §2.5), so "no persistence" has to mean
reconcile actively kills orphans, not merely that the daemon forgets them.

**Why isolation from the ingest path is a requirement, not a hope.** Panes are spawned
with `MUSTER_SESSION=<id>` (`internal/server/sessions.go:158`), and the envelope binding
rule (protocol §4.2) routes on it authoritatively. A shell pane carrying `MUSTER_SESSION`
would let a `claude` run *inside the shell* bind its `claudeSessionId` to the parent
session and drive its state machine. Verified during the interview: with `MUSTER_SESSION`
unset, the wrapper's envelope omits `musterSession`, `resolveSessionID`
(`internal/server/ingest.go:190`) falls through to `Resolve(ev.SessionID)`, that id was
never bound, and the event is logged and persisted unrouted with a NULL `event.session_id`
— the designed path for stray posts. Note the nested `claude` **does** fire hooks
regardless, because the directory already carries Muster's `.claude/settings.local.json`
from the parent session's launch; the isolation comes entirely from the missing env var.

**Related code paths.** `internal/server/sessions.go` `Launch` unconditionally writes
`.claude/settings.local.json` and refuses the launch on corrupt JSON — a shell must not go
through that. `web/index.html`'s `#tile-template` `.thead` is `draggable="true"` (the tile
drag handle) but already contains a clickable control, the rename button inside `.nm`
(plan `ui-text-and-focus`), so a button in a draggable header is precedented here.
`.thead .nm` carries the flex/ellipsis truncation, so a fixed-width control appended to the
header squeezes the title only — by design, not by accident.

## Scope

**In Scope:**

- A shell surface tethered to an existing Claude session, running in that session's
  directory, in its own tmux session.
- One toggle control, the same component in both views, swapping the surface body between
  the Claude terminal and the shell:
  - **Tiles** — in the tile header bar (`.thead`), alongside the existing state dot,
    title, repo/branch, context and timer, without displacing any of them.
  - **Focus** — in the pane area.
  - Reads `shell` while showing Claude, `claude` while showing the shell. Its lit/active
    state is the only indicator that a shell is running.
- Lazy spawn: nothing is started until the toggle is first clicked for that session.
- Reconcile kills orphaned shell tmux sessions at daemon start.
- A design-authority mockup (see Requirements).

**Out of Scope:**

The following are explicitly deferred. They are recorded in `TODO.md` as a single
post-release follow-up on richer terminal functionality, of which these are examples
rather than a committed list:

- **Option A in full** — a `kind: "shell"` session row with its own state, rail card,
  persistence, reconcile/resume behaviour and `⌥⌘1–9` addressability.
- **A global, untethered terminal** — one not bound to any Claude session, which would
  need its own directory picker and its own home in the UI.
- **VS Code-style shell restore** across daemon restarts (an id scheme that survives, or
  adoption of orphaned shell tmux sessions rather than killing them).
- **More than one shell per session**, and any tab strip beyond the single toggle.
- **A rail-card marker** for a shell running in a session you are not currently viewing.
- Any change to the session list, the launcher, the state machine, the `Session` wire
  object, or the rail's sort/pin/order behaviour.

## Requirements

**Functional**

1. Each Claude session can have at most one shell, spawned lazily on the first toggle
   click and running `$SHELL` interactively (fallback `/bin/zsh`) with the session's
   directory as its cwd.
2. The toggle swaps the surface body in place. In Tiles it lives in `.thead` and must not
   displace or truncate the state dot, repo/branch, context or timer; only the title's
   existing ellipsis may absorb the width.
3. Toggling disposes the hidden surface's socket and reconnects on switch back — the same
   behaviour session switching already has. tmux repaints the whole screen on attach, so
   nothing is lost, and 3×2 density never holds twelve attach PTYs.
4. The shell survives tab switches, session switches, view switches (⌘\), and the parent
   Claude session ending (`alive: false`). A greyed-out card may have a live shell under
   it — that is the most useful moment for one.
5. Typing `exit` (PTY EOF) removes the toggle and the shell; if the shell was on screen,
   the view swaps back to the Claude terminal. The next toggle click spawns a fresh shell.
6. Removing the session kills its shell tmux session alongside the Claude one.
7. File drop and resize behave in a shell surface exactly as in a Claude pane.

**Non-functional / constraints**

8. The shell pane is spawned with **no** `MUSTER_SESSION` in its environment, and Muster
   writes no `.claude/settings.local.json` on its behalf.
9. Nothing about a shell is written to SQLite — no session row, no event rows, no repo
   upsert.
10. Reconcile at daemon start kills orphaned `muster-<id>-shell` tmux sessions. No
    adoption: an adopted shell is persistence by the back door and lands back in Option A.
11. No change to the daemon↔UI protocol's `Session` object. A new terminal WS route (or
    route parameter) for the shell attach target is expected and belongs in the plan's
    Protocol Contract.
12. `/plan-work` must produce `plans/plain-terminal-session/mockup.html` as the design
    authority **before** its Testable UI Elements table, and transcribe text patterns from
    that markup rather than composing them (plan-work SKILL.md:148; precedent
    `plans/new-session-dialog/mockup.html`, and `plans/m4-reconcile/mockups/` for option
    comparison). The mockup is load-bearing here: "does not squash the tile header" is a
    claim about a 3×2 tile at real width, and the mockup is how it is proven before code.

## Edge Cases & Considerations

- **A `claude` run inside the shell.** It fires hooks (the directory has Muster's
  settings), but with `MUSTER_SESSION` unset every event resolves to no session and
  persists unrouted. Requires an explicit test, not an assumption — this is the one path
  that could corrupt a real session's state.
- **Unrouted event accumulation.** The above leaves NULL-`session_id` rows in the `event`
  table. Already the designed behaviour for stray posts; noted, not addressed.
- **Daemon restart with a shell running.** The tmux session outlives musterd; reconcile
  must kill it. Untested, this leaks a live shell process with nothing pointing at it.
- **Spawn failure** (directory deleted, tmux failure): the error surfaces in the surface
  area and the toggle reverts to Claude. No half-created shell tab is left behind.
- **Shell killed externally** (`tmux kill-session`, `kill`): PTY EOF closes the socket with
  `4001`, the same path as `exit`.
- **Parent session Resumed after ending** with a live shell under it: the shell is
  untouched — it was never bound to the Claude session's lifetime except through Remove.
- **A forgotten shell.** With no rail-card marker (deliberate), a shell running in a
  session you are not viewing is invisible in Focus view until you open that session. An
  accepted cost of the first pass.

## Acceptance Criteria

- [ ] A tile header and the Focus pane each carry a single toggle that swaps the surface
      body between the Claude terminal and a shell, and the tile header's existing state
      dot, title, repo/branch, context and timer all remain present and legible at 3×2
      density (verified against the mockup at real width).
- [ ] The shell runs `$SHELL` interactively in the session's directory, spawned only on
      the first toggle click — a session never toggled spawns no shell process.
- [ ] The shell pane's environment contains no `MUSTER_SESSION`, and no
      `.claude/settings.local.json` is written on its behalf.
- [ ] Running `claude` inside a shell leaves the parent session's `state`, `stateSince`,
      `claudeSessionId` and context gauge unchanged, and its events persist with a NULL
      `event.session_id`.
- [ ] The shell survives switching tabs, switching sessions, toggling views, and the
      parent Claude session ending; typing `exit` removes the toggle and swaps the view
      back to Claude; Removing the session kills the shell's tmux session.
- [ ] After musterd restarts, no `muster-<id>-shell` tmux session is left running on the
      `muster` socket.
- [ ] No SQLite row of any kind is created for a shell.
- [ ] The toggle's lit state is the only shell indicator — no rail-card marker is added.
- [ ] File drop into a shell surface pastes the escaped path, and resizing a shell surface
      drives `pty.Setsize` then `resize-window`, as for a Claude pane.

## References

- `TODO.md` — [#21](https://github.com/Zalaras/muster/issues/21) "Offer a plain shell
  session, not only a Claude Code one"; and the post-release follow-up entry on richer
  terminal functionality (M5+), which carries this spec's Out of Scope list.
- `SPEC.md` §2.1 (session list), §2.4 (interactive terminal panes — sizing, attach model,
  scrollback), §2.5 (launch & lifecycle, reconcile), §7 (data model).
- `docs/protocol.md` §3.1 (`POST /api/sessions`), §4.2 (the envelope and binding rules),
  §5.3 (the Session object), §6 (`/ws/terminal/{id}`), §7.5 (liveness).
- `docs/design/design-system.md` §4/§5 (Focus and Tiles), `docs/design/ux-flows.md` §3.
- `docs/design/mockups/a-instrument.html` (Focus), `d-tiled.html` (Tiles) — the reference
  renders the new mockup must stay consistent with.
- Code: `internal/server/sessions.go` (`Launch`, `writeSettings`),
  `internal/server/ingest.go:182-204` (`resolveSessionID`),
  `internal/server/terminal.go`, `internal/termbridge/`,
  `web/src/terminal/pane.ts`, `web/src/render/tiles.ts`, `web/index.html`
  (`#tile-template`).
- Mockup precedent: `plans/new-session-dialog/mockup.html`,
  `plans/m4-reconcile/mockups/`.
