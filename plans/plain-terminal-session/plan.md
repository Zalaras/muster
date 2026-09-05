# Plan: Plain terminal session

**Created**: 2026-09-05
**Status**: approved
**Work Type**: full-stack
**E2E Scope**: new-specs
**Description**: A plain `$SHELL` tabbed to an existing Claude session, in that session's directory, switched by a segmented control in the Focus mainhead and every tile footer.

## Overview

Muster can only show you a Claude session. Running `git log` or `rg` means leaving for
Terminal.app or going through Claude Code's `!` prefix. This adds a second surface to
each session — a plain interactive shell in the same directory — and one control that
swaps the surface body between them. It closes
[#21](https://github.com/Zalaras/muster/issues/21) and makes SPEC §2.5's "all sessions
live in one place" true for more than Claude.

The shape is deliberately the cheapest one that removes the itch, settled in
`plans/plain-terminal-session/spec.md`: the shell is **not** a session. It has no row, no
rail card, no state, no SQLite presence, and no `kind: "shell"` on the wire. It is an
ephemeral second attach target hanging off a session that already exists, and the daemon
forgets it on restart. The richer shape (a real session kind, a global untethered
terminal, restore across restarts, several shells per session) is a post-release
follow-up already recorded in `TODO.md` under M5+.

Almost all the machinery exists. `/ws/terminal/{id}` (protocol §6) already enforces a
one-live-client law per attach target and moves geometry ownership with the socket, so
switching surfaces is mechanically what switching sessions already does.
`TerminalSurface` (`web/src/terminal/pane.ts`) is view-agnostic by construction — Focus's
pane and a Tiles tile mount the same component — so file-drop and the
`pty.Setsize`-then-`resize-window` sizing come free. The genuinely new parts are: a
sibling tmux session per shell, a lazy-spawn endpoint, a reconcile sweep that kills
orphans, and one segmented control rendered in two places.

## Requirements

### Must Have

- [ ] **REQ-1**: Each session has at most one shell, spawned lazily on the first switch
      to `shell` for that session, running the user's `$SHELL` interactively (fallback
      `/bin/zsh`) with the session's `directory` as cwd, in its own tmux session named
      `muster-<id>-shell` on the `muster` socket.
- [ ] **REQ-2**: The shell pane's environment contains **no** `MUSTER_SESSION`, and
      Muster writes no `.claude/settings.local.json` on its behalf. (Isolation from the
      ingest path is structural, not incidental — see INV-1/INV-6.)
- [ ] **REQ-3**: No SQLite row of any kind is created, updated or deleted by any shell
      operation — no session row, no event row, no repo upsert.
- [ ] **REQ-4**: A segmented `claude | shell` control swaps the surface body in place. It
      renders in the Focus mainhead (`.mainhead .surfseg`) and in every tile's footer
      (`.tfoot .acts .surfseg`) — the same component in both. A teal pip on the `shell`
      segment is the only indicator that a shell is running.
- [ ] **REQ-5**: Switching disposes the hidden surface's socket and reconnects on switch
      back — the behaviour session-switching already has. tmux repaints the whole screen
      on attach, so nothing is lost, and 3×2 density never holds twelve attach PTYs.
- [ ] **REQ-6**: A shell survives switching sessions, switching views (⌘\), and the
      parent Claude session ending (`alive: false`). A greyed-out card may have a live
      shell under it.
- [ ] **REQ-7**: A shell can be **started** on a dead session, not merely survive into
      one. The shell routes never consult `alive`.
- [ ] **REQ-8**: Typing `exit` (PTY EOF) ends the shell: the socket closes `4001`, the
      segment returns to `claude` (swapping the body back if the shell was on screen) and
      the pip clears. The next switch to `shell` spawns a fresh one.
- [ ] **REQ-9**: Removing a session kills its shell's tmux session alongside the Claude
      one. **Ending** a session does not.
- [ ] **REQ-10**: Reconcile at daemon start kills every `muster-<n>-shell` tmux session on
      the socket, unconditionally, and never adopts one. They are excluded from the
      existing "unknown muster tmux session" warn path.
- [ ] **REQ-11**: File drop and resize behave in a shell surface exactly as in a Claude
      pane — a dropped file pastes its escaped path, and a resize drives `pty.Setsize`
      then `resize-window`.
- [ ] **REQ-12**: A spawn failure (directory gone, tmux failure) surfaces its message in
      the surface area and the segment reverts to `claude`. No half-created shell tab is
      left behind.

### Should Have

- [ ] **REQ-13**: The tile footer absorbs the new control without overflowing. At a
      1152px viewport at 3×2 density no `.tfoot` overflows, and the segment's, Resume's
      and Remove's labels never clip; the `✕ ended <age>` text is the element that
      absorbs a narrow footer (it ellipsizes). See Implementation Notes → Tile footer
      width for the measured numbers and the known 1024px floor.

### Nice to Have

- None. Everything else considered is in the spec's Out of Scope list and in `TODO.md`'s
  M5+ "Richer terminal functionality" entry.

## Protocol Contract

Delta against `docs/protocol.md`, merged there on approval. **The `Session` object
(§5.3) does not change** — a shell is invisible on the state stream, which is what keeps
this pass out of Option A.

### HTTP: POST `/api/sessions/{id}/shell`

Ensures a shell exists for session `{id}`, spawning it if absent. Idempotent: calling it
for a session whose shell is already running is a success with `created: false`.
Deliberately **not** gated on `alive` (REQ-7).

**Auth**: UI cookie (localhost token, SPEC §2.6), as every other `/api/*` route.

**Request:** no body.

**Response 200:**
```json
{
  "target": "string — the shell's tmux session name, always `muster-<id>-shell`",
  "created": "boolean — true if this call spawned it, false if it was already running"
}
```

**Errors** (the `{\"error\": {...}}` envelope of protocol §2):
- `404 unknown_session` — no session with that id.
- `409 directory_missing` — the session's recorded `directory` no longer exists or is
  not a directory. Checked before the spawn so the failure is a clean 409, not a tmux
  error.
- `500 shell_spawn_failed` — tmux refused the spawn. `message` carries the tmux error.

```json
{ "error": { "code": "directory_missing", "message": "/Users/d/gone no longer exists" } }
```

### WS: GET `/ws/shell/{id}` — the shell PTY bridge

One socket per **live** shell surface, bridged to a daemon-owned PTY running `tmux
attach` against `muster-<id>-shell`. Attach only: this route never spawns — `POST
.../shell` above is the only thing that creates a shell.

**Auth**: UI cookie on the upgrade + the §2 Origin check. Pre-upgrade errors (plain
HTTP): `401 unauthorized`, `404 not_found` (unknown session id), `409 no_shell` (the
session exists but has no running shell). Note that a browser cannot read a pre-upgrade
status — see Implementation Notes → Why the spawn is a POST.

**Frames**: byte-for-byte identical to §6 — binary both ways (raw PTY output / raw
input), `{"type":"resize","cols":N,"rows":N}` as the only client→server text frame, same
clamps ([20,500] × [5,300]), same `pty.Setsize`-then-`resize-window` order (FINDINGS
§7(d)), same "unparseable text frame is ignored and logged, never fatal".

**Close codes**: `4000 superseded`, `4001 pane_ended` (the shell exited — `exit`, or an
external kill), normal `1001` on daemon shutdown. Unlike §6's `4001`, the shell's
`pane_ended` does **not** nudge the liveness poll: a shell's death is not a session's
death, and a spurious liveness flap on the parent session is exactly what INV-6 forbids.

**One-live-client law**: enforced per **attach target**, not per session. `muster-<id>`
and `muster-<id>-shell` are different targets, so a session's Claude socket and its shell
socket are independent — opening one never supersedes the other (INV-3). Two browser
tabs both showing the same session's shell still supersede each other, exactly as §6
describes for the Claude pane.

### HTTP: DELETE `/api/sessions/{id}` — behaviour change, no wire change

Now also kills `muster-<id>-shell` (REQ-9). Request and response shapes are unchanged.
`POST /api/sessions/{id}/end` is deliberately **not** changed — ending a session leaves
its shell running (REQ-6).

## Schema Changes

No schema changes required. REQ-3 makes that a requirement rather than an omission: a
shell has no persistent representation anywhere.

## UI Specifications

The design authority is **`plans/plain-terminal-session/mockup.html`** — one page
carrying both views with a working view switch, plus a demo bar for surface
(claude/shell), session (live/ended) and density (3×2 / 2×2). Every Name/Text Pattern in
the table below is transcribed from that file's markup. `plans/plain-terminal-session/mockups/`
holds the three Focus options that were compared and `index.html` recording the decision.

### Views

- **Focus** — the mainhead gains the segmented control between `.meta` and the
  `.acts` row (End/Resume/Remove). The pane area below shows either the Claude terminal,
  the shell, or (when `claude` is selected on a dead session) the existing dead surface.
- **Tiles** — every tile's footer gains the same control at the head of `.acts`, before
  End (live) or before the `✕ ended <age>` text (dead). **The tile header is not
  touched** — see Implementation Notes → Tile footer width for why the spec's original
  `.thead` placement was rejected.

### User Flows

1. Session showing Claude, no shell yet. Click `shell` → `POST /api/sessions/{id}/shell`
   → on 200, mount a shell `TerminalSurface`, open `/ws/shell/{id}`, pip lights.
2. Click `claude` → dispose the shell surface's socket, remount the Claude surface. Pip
   stays lit (a shell is still running).
3. Click `shell` again → POST returns `created: false`, reattach. tmux repaints; the
   scrollback is whatever tmux holds.
4. Type `exit` → `4001`, surface swaps back to Claude, segment returns to `claude`, pip
   clears.
5. Parent session ends while the shell runs → the Claude segment now shows the dead
   surface; the `shell` segment still shows a live shell.
6. Remove the session → both tmux sessions die, the card and tile go.

### States

Every surface has the three mandatory states, and the segment itself has three:

- **No data yet** — before the first switch, the segment reads `claude` selected, `shell`
  unselected, **no pip**. The pip is a positive claim ("a shell is running"), never an
  empty gauge.
- **Data** — a shell is running: pip lit. Selected segment carries `aria-pressed="true"`.
- **Daemon down** — both segment buttons are `disabled` while the WS is down, like every
  other action control (design-system States). A shell surface already on screen shows
  `TerminalSurface`'s existing "disconnected" overlay; nothing auto-reconnects on 4000.
- **Spawn failed** (REQ-12) — the surface area shows the error `message` via the
  surface's existing `role="status"` notice, and the segment reverts to `claude`.

### Testable UI Elements

Transcribed from `mockup.html`. Note that the `.pip` inside the `shell` button is an
empty `<span>`, so the button's accessible name is exactly `shell`.

| Element | Role | Name / Text Pattern | Notes |
|---------|------|---------------------|-------|
| Focus surface switch group | `group` | `Surface` | `.mainhead .surfseg`, `role="group" aria-label="Surface"` |
| Focus `claude` segment | `button` | `claude` | native `<button>`; carries `aria-pressed` |
| Focus `shell` segment | `button` | `shell` | native `<button>`; `aria-pressed`; contains `span.pip` when a shell runs |
| Tile surface switch group | `group` | `Surface` | `.tfoot .acts .surfseg` — same component, same names |
| Tile `claude` / `shell` segments | `button` | `claude` / `shell` | **scope through `article.tile[data-session-id]`** — six tiles carry identically-named buttons, exactly as they already do for `End` |
| Claude terminal container | — | `aria-label="Terminal: <title>"` | unchanged from m2-terminal |
| Shell terminal container | — | `aria-label="Shell: <title>"` | new; same `.terminal-surface` component, different label |
| Shell surface notice | `status` | REQ-12's error `message` | the existing one-per-surface `role="status"` element |

## Affected Files

### Daemon

- `internal/tmux/tmux.go` — add `NewNamedSession(ctx, name, dir, env, command)` and make
  the existing `NewSession` delegate to it (it currently hardcodes `"muster-" + id`); add
  `ShellSessionName(id) string` and `IsShellSessionName(name) (id int64, ok bool)` so the
  `muster-<id>-shell` convention has exactly one definition.
- `internal/server/shells.go` — **new**. The shell registry: a mutex-guarded record of
  which sessions this daemon lifetime has spawned a shell for, plus `Ensure` (check
  `PaneExists`, spawn if absent — the check is what makes REQ-8's respawn-after-`exit`
  work) and `Kill`.
- `internal/server/terminal.go` — key `terminalRegistry` by (session id, surface) instead
  of session id alone, so a Claude socket and a shell socket coexist (INV-3); add
  `handleShellTerminal`; make `closeSession` close only the Claude socket (End) and add a
  variant that closes both (Remove).
- `internal/server/sessions.go` — `handleCreateShell` (the POST); `handleRemoveSession`
  kills the shell before delegating to `manager.Remove`.
- `internal/server/server.go` — wire the two routes and construct the shell registry.
- `internal/session/manager.go` — `Reconcile` kills `muster-<n>-shell` names via the
  existing `sessionKiller` and excludes them from `report.UnknownSessions`; add
  `ShellsKilled` to `ReconcileReport` and the startup log line.

`SPEC.md` and `TODO.md` are **not** listed here — see Implementation Notes → Doc upkeep.

### Web

- `web/src/api.ts` — `createShell(id): Promise<ApiResult<{target: string; created: boolean}>>`.
- `web/src/terminal/pane.ts` — `TerminalSurface` takes a surface kind (`"claude" | "shell"`)
  that picks the WS path (`/ws/terminal/` vs `/ws/shell/`) and the `aria-label` prefix.
  Everything else — drop handling, resize, overlays, theming — is shared unchanged.
- `web/src/terminal/surfaceswitch.ts` — **new**. Builds and updates the segmented control
  (both views), and holds the pure "which surface is selected, is a shell running" state
  shape so it is unit-testable without a DOM. See Implementation Notes → Testability.
- `web/src/render/mainhead.ts` — render the segment in the mainhead.
- `web/src/render/tiles.ts` — render the segment at the head of `.tfoot .acts`, in both
  the live and dead footer shapes.
- `web/src/render/focus.ts` / `web/src/main.ts` — the surface manager keys `surfaces` by
  (session id, kind) rather than id; `renderFocusView`'s dead-session branch becomes
  "show the dead surface **when `claude` is the selected surface**" rather than
  unconditionally.
- `web/index.html` — the `#tile-template` footer gains nothing structural; the segment is
  built by `surfaceswitch.ts` into the existing `.acts` span.
- `web/src/style.css` — `.surfseg` (both sizes) and the `.tfoot` shrink rule REQ-13 needs.
- `web/playwright.config.ts` — **no change expected**; listed only to record that it is
  web-impl's file if one turns out to be needed (e2e-specs must not edit it).

### E2E

- `web/e2e/plain-shell.spec.ts` — **new**. Named `plain-shell`, not `shell` —
  `web/e2e/shell.spec.ts` already exists and is the M0 dashboard-shell suite, nothing to
  do with this feature.
- `web/e2e/helpers/shell.ts` — **new**. Locators for the segment (scoped by tile id) and
  the shell surface, plus the tmux-environment oracle INV-1 needs.
- `web/e2e/helpers/daemon.ts` — a `tmuxShowEnv(target, name)` oracle wrapping `tmux
  show-environment -t <target> <NAME>`, for INV-1. (`tmuxSessions()`, `restart()`,
  `paneStartCommand()` and `dbPath` already exist and cover the rest.)

## Edge Cases

1. **A `claude` run inside the shell.** It fires hooks — the directory already carries
   Muster's `.claude/settings.local.json` from the parent session's launch — but with
   `MUSTER_SESSION` unset the wrapper's envelope omits `musterSession`,
   `resolveSessionID` falls through to `Resolve(ev.SessionID)`, that id was never bound,
   and the event persists unrouted with a NULL `event.session_id`. The parent session's
   `state`, `stateSince`, `claudeSessionId` and context must be untouched. → **E7**, **E15**
2. **Unrouted event accumulation.** The above leaves NULL-`session_id` rows in `event`.
   Already the designed behaviour for stray posts. → untested: pre-existing behaviour,
   not changed by this plan.
3. **Daemon restart with a shell running.** The tmux session outlives musterd; reconcile
   must kill it. → **E8**
4. **Spawn failure — directory deleted.** 409 `directory_missing`; the surface shows the
   message and the segment reverts. → **E9**
5. **Spawn failure — tmux refuses.** 500 `shell_spawn_failed`; same UI path. →
   **D6** (the daemon half); the UI half is E9's.
6. **Shell killed externally** (`tmux kill-session`, `kill`): PTY EOF → `4001`, the same
   path as `exit`, and no liveness nudge on the parent. → **E10**
7. **`exit` while the shell is hidden.** The socket was disposed on switch-away, so
   nothing tells the dashboard. The pip stays lit until the next click, which finds no
   tmux session and spawns a fresh one. **Accepted** (Damian, 2026-09-05): clicking
   always yields a working shell, which is REQ-8's behaviour anyway; the only cost is a
   briefly stale pip. Fixing it properly needs shell liveness on `/ws`, which REQ-11 of
   the spec forbids. → **D7** (the respawn is what must work), pip staleness untested by
   design.
8. **Parent session Resumed after ending, with a live shell under it.** The shell is
   untouched — it was never bound to the Claude session's lifetime except through Remove.
   → **E11**
9. **`SessionEnd`/`SessionStart` `/clear` pair around a live shell.** `/clear` mints a new
   `claudeSessionId` in the Claude pane and rebinds; the shell is a different tmux
   session with no `MUSTER_SESSION`, so no ordering of that pair can reach it. →
   untested: the shell is not reachable from the ingest path at all (INV-6 covers the
   general claim).
10. **Two browser tabs, same session, both on `shell`.** Second supersedes the first with
    `4000`; the first shows the click-to-reclaim overlay. → **E12**
11. **One tab on `claude`, another on `shell`, same session.** Both stay live — different
    attach targets. → **E12**
12. **Remove a session while another session's shell is live.** Only the removed
    session's shell dies. → **E13**
13. **Switching to `shell` on a dead session that never had one.** Allowed (REQ-7): POST
    spawns, socket attaches, neither route consults `alive`. → **E5**
14. **Daemon down while a shell surface is mounted.** Both segment buttons disable; the
    surface shows the existing "disconnected" overlay; on `hello`, `reattachIfDisconnected`
    reattaches the shell exactly as it does a Claude pane. → **W5**
15. **A dead tile's footer at 3×2 on a narrow window.** The footer carries `✕ ended
    <age>` + Resume + Remove + the segment. → **W6**

## Acceptance Criteria

IDs are unique across the whole section — `D*` daemon, `W*` web, `E*` e2e. One clause per
criterion.

### Daemon

- **D1**: `POST /api/sessions/{id}/shell` for a session with no shell creates a tmux
  session named `muster-<id>-shell` and returns 200 with `created: true`.
- **D2**: The same call repeated returns 200 with `created: false` and creates no second
  tmux session.
- **D3**: The shell pane's tmux environment contains no `MUSTER_SESSION` (INV-1).
- **D4**: `POST .../shell` writes no `.claude/settings.local.json` into the session's
  directory (REQ-2).
- **D5**: `POST .../shell` for a session whose `alive` is false succeeds (REQ-7).
- **D6**: `POST .../shell` for a session whose directory no longer exists returns 409
  `directory_missing` and creates no tmux session.
- **D7**: After the shell's tmux session is killed externally, the next `POST .../shell`
  returns `created: true` and a fresh tmux session exists (REQ-8's respawn).
- **D8**: `GET /ws/shell/{id}` for a session with no shell is refused pre-upgrade with
  409 `no_shell`.
- **D9**: `DELETE /api/sessions/{id}` kills `muster-<id>-shell` (REQ-9).
- **D10**: `POST /api/sessions/{id}/end` leaves `muster-<id>-shell` running (REQ-9).
- **D11**: `Reconcile` kills every `muster-<n>-shell` on the socket and reports the count
  in `ReconcileReport.ShellsKilled` (REQ-10).
- **D12**: `Reconcile` does not list any `muster-<n>-shell` name in
  `ReconcileReport.UnknownSessions` (REQ-10).
- **D13**: No shell operation — spawn, attach, exit, remove — writes any row to SQLite
  (INV-2), asserted by a total row count across `session`, `event` and `repo` taken
  before and after.

### Web

- **W1**: The Focus mainhead renders the segment with `claude` pressed and no pip for a
  session that has never had a shell.
- **W2**: Clicking `shell` issues exactly one `POST /api/sessions/{id}/shell` before
  opening any socket (lazy spawn — REQ-1).
- **W3**: A tile footer renders the same segment, and the tile header's children are
  unchanged from today (REQ-4/REQ-13).
- **W4**: A shell surface's container carries `aria-label="Shell: <title>"` and a Claude
  surface's still carries `aria-label="Terminal: <title>"`.
- **W5**: While the WS is down both segment buttons are `disabled` (edge case 14).
- **W6**: At a 1152px viewport at 3×2 density, no `.tfoot` overflows its client width and
  no segment/Resume/Remove label clips (REQ-13, edge case 15).
- **W7**: No `any` types in new web code.

### E2E

- **E1**: Switching to `shell` in Focus shows a live shell whose prompt responds to typed
  input, and switching back to `claude` shows the Claude pane again.
- **E2**: A session never switched to `shell` has no `muster-<id>-shell` tmux session
  (lazy spawn, observed through `daemon.tmuxSessions()`).
- **E3**: The shell runs in the session's own directory (`pwd` echoes it).
- **E4**: A shell started in Focus is still running after switching to Tiles and back
  (REQ-6).
- **E5**: A shell can be started on a session whose `alive` is false, and the tile/pane
  shows it while the `claude` segment still shows the dead surface (REQ-7, edge case 13).
- **E6**: Typing `exit` closes the shell socket with `4001`, swaps the visible surface
  back to Claude and clears the pip (REQ-8).
- **E7**: Running `claude` inside a shell leaves the parent session's `state`,
  `stateSince`, `claudeSessionId` and context gauge unchanged (INV-6, edge case 1).
- **E15**: The events that nested `claude` fires land in the `event` table with a NULL
  `session_id` (edge case 1) — they are neither dropped nor routed to the parent.
- **E8**: After `daemon.restart()`, no `muster-<n>-shell` tmux session remains on the
  socket (REQ-10, edge case 3).
- **E9**: With the session's directory removed, switching to `shell` shows the daemon's
  error message in the surface's `role="status"` notice and leaves the segment on
  `claude` (REQ-12, edge case 4).
- **E10**: `tmux kill-session` on a live shell closes its socket with `4001` and does not
  change the parent session's `state` or `alive` (edge case 6).
- **E11**: Resuming a dead session that has a live shell leaves the shell running (edge
  case 8).
- **E12**: A second tab on the same session's shell supersedes the first with `4000`,
  while a tab on that session's `claude` surface stays open (INV-3, edge cases 10/11).
- **E13**: Removing one session kills only its own shell; a second session's shell keeps
  running (INV-4, edge case 12).
- **E14**: A file dropped on a shell surface pastes its escaped path (REQ-11).
- **E16**: A shell surface's reported geometry matches its tmux window's
  `#{window_width}`/`#{window_height}` after a resize (REQ-11).

### Automated Checks

```checks
D1 make test
D2 make lint
W1 make web-build
W2 make web-test
W3 make contrast
E1 make e2e
```

### Reviewer-Verified

- **W7**: no `any` types in new web code.
- **D3/D13/INV-1/INV-2**: that the assertions named above are real oracles (a tmux
  environment read and a row count), not pattern matches on a string the code produced.
- **REQ-13**: the measured footer numbers in Implementation Notes still hold against the
  shipped CSS, and the 1024px floor is either fixed or still documented.
- **Boundary**: no Claude-Code-format knowledge (hook payloads, status-line JSON, CLI
  flags) leaks out of `internal/claudecode/` — in particular the shell spawn must not
  import it (CLAUDE.md hard rule).

## Invariants

Each is asserted from **every** reachable source state, including with other sessions
present and from **both** views (the interactive surface ships in Focus and Tiles).

- **INV-1**: A shell pane's environment never contains `MUSTER_SESSION`. Source states:
  freshly spawned; respawned after `exit`; spawned on a dead session; spawned after the
  parent was Resumed. → D3, E7
- **INV-2**: No shell operation writes to SQLite. Source states: spawn, attach, `exit`,
  Remove, daemon restart. → D13
- **INV-3**: The one-live-client law holds **per attach target** — connecting a session's
  shell socket never closes its Claude socket, and vice versa, in either view. → E12
- **INV-4**: Killing, ending or removing one session never touches another session's
  shell, socket or tmux session. → E13
- **INV-5**: After a daemon restart, no `muster-<n>-shell` exists on the socket. → D11, E8
- **INV-6**: Nothing that happens inside a shell can mutate any session's state,
  `claudeSessionId`, context or `alive`. → E7, E10

## Implementation Notes

### Why the spawn is a POST and the socket only attaches

Spawn-on-WS-connect was considered and rejected. A browser cannot read a pre-upgrade
HTTP status — the WebSocket API deliberately hides it to prevent port/status scanning, so
a rejected handshake surfaces as close code `1006` with no reason, indistinguishable from
daemon-down. REQ-12 ("the error surfaces in the surface area") is therefore unsatisfiable
that way. The POST also matches what the daemon already does for `Resume` (spawn the tmux
session over HTTP, then attach a socket), keeps the takeover lock doing one job, and makes
lazy spawn directly assertable at the HTTP layer (E2).

### Why the shell needs its own tmux session

The Claude pane's tmux session (`muster-<id>`) is occupied, and the one-live-client law is
keyed per attach target, so the shell runs in a sibling. Because tmux sessions **outlive
musterd** by design (SPEC §2.5), "no persistence" has to mean reconcile actively kills
orphans (REQ-10), not merely that the daemon forgets them.

### Isolation is structural

Panes are normally spawned with `MUSTER_SESSION=<id>` (`internal/server/sessions.go`), and
the envelope binding rule (protocol §4.2) routes on it authoritatively. A shell pane
carrying it would let a `claude` run *inside the shell* bind its `claudeSessionId` to the
parent session and drive its state machine. Verified during the spec interview: with
`MUSTER_SESSION` unset the envelope omits `musterSession`, `resolveSessionID`
(`internal/server/ingest.go`) falls through to `Resolve(ev.SessionID)`, that id was never
bound, and the event is logged and persisted unrouted with a NULL `event.session_id` — the
designed path for stray posts. The nested `claude` *does* still fire hooks, because the
directory already carries Muster's `.claude/settings.local.json`; the isolation comes
entirely from the missing env var. That is why REQ-2 is a requirement and INV-1 is
asserted from four source states rather than one.

`sessionLauncher.Launch` unconditionally writes `.claude/settings.local.json` and refuses
the launch on corrupt JSON. **A shell must not go through that path at all** — it is not a
launch, and REQ-2 forbids the write.

### Tile footer width — measured, and why the spec changed

The spec put the tile control in `.thead`, "without displacing any of them … only the
title's existing ellipsis may absorb the width". Measured against the **shipped** header
in `mockup.html` at 3×2 on a 1152px viewport (383px tiles):

| | titles truncated | repo/branch truncated |
|---|---|---|
| no control (today) | 1 / 6 | 1 / 6 |
| control in `.thead` (as specced) | 6 / 6 | 6 / 6 |
| control in `.tfoot .acts` | 1 / 6 | 1 / 6 |

`.thead`'s `.nm` and `.wh` share the same flex shrink, so anything added to that row is
paid for by the title **and** the repo/branch — "only the title absorbs it" is not a rule
that header's layout can honour. Shrinking the control to an icon (`>_`, 27px vs 45–61px)
only recovers 6/6 → 4/6. The footer restores the header to its exact no-control baseline;
the one remaining truncation in the good rows is `worktree-conflicts-spike`, a title long
enough to truncate today with no control present. **Damian approved the change to the
footer on 2026-09-05.**

Footer slack at 3×2 with the segment present: 190px on a live tile and **42px on a dead
tile** (the tight case — `✕ ended <age>` + Resume + Remove + segment) at 1152px. At
1024px the dead tile overflows by 6px. The cause is that `.tage` cannot absorb the
squeeze: its flex parent is `.tfoot .acts`, which has no `min-width: 0`, so the shrink
never reaches it. Three rule variants were tried in a live DOM and none landed it —
`flex: none` on the buttons made it worse (49px), and `white-space: nowrap` on `.tage`
alone restored its natural 80px. **web-impl owns the exact rule**; W6 is the criterion,
and the plan does not prescribe a CSS declaration it could not verify.

### Testability

REQ-4's selected-surface + pip-lit state must be exposed as a pure function or small
state object in `web/src/terminal/surfaceswitch.ts`, separate from the DOM writer, so
`web-tests` can cover W1/W5 without a fake DOM — the same split `sessions/live.ts` already
uses for tile membership. Do not leave it inline in a render module; a Should-Have with no
unit-testable seam is how coverage goes missing.

### Doc upkeep (orchestrator)

- Merge the Protocol Contract above into `docs/protocol.md` on approval (a new §3.16 for
  the POST, a new §6.1 for `/ws/shell/{id}`, and a note on §3.8's shell kill).
- On completion: tick the `plain-terminal-session` entry in `TODO.md`, and add a
  `SPEC.md` changelog entry recording that a session may carry an ephemeral shell surface
  that is deliberately absent from the data model.
- `spikes/canary-fields.md` needs nothing — this plan learns no new Claude Code wire fact.
