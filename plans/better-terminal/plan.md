# Plan: better-terminal

**Created**: 2026-11-19
**Status**: completed
**Work Type**: full-stack
**E2E Scope**: new-specs
**Fixture plan**: terminals.spec.ts daemon (the kill-shutdown journey restarts the daemon and the reload journey reads daemon-held names)
**Render fixtures**: shell-busy, shell-idle-tiles, new: terminals-two (one live session in Focus with two terminals, terminal 2 renamed `build` and busy, terminal 1 idle), new: terminals-two-tiles (terminals-two's session in Tiles at 3×2 beside five other live sessions), new: terminals-ten (one session with ten idle terminals, Focus)
**Features**: surfaces, focus
**Touches**: tiles, lifecycle, connection, update, actions, groups, launch, reader
**Description**: Several terminals per session, added, switched, renamed and closed from a ▾ Terminals menu beside the `shell` segment.

## Overview

Today a session carries at most one plain shell, an ephemeral attach target hanging off it
(kb:adr/surfaces-shell-is-attach-target-not-session). This plan lets a session hold any number
of them — its **terminals** — so a dev server or watcher can keep running in one while the
developer types in another. Each terminal is a shell exactly as today: same directory, no
session environment, same scroll and keys, same lifetime rules, its own attach target.

The surface switch becomes `claude | shell | ▾ | docs` in the Focus header and every tile
footer. `shell` goes straight back to the terminal last shown (starting one when none runs);
▾ opens a **Terminals** panel listing each running terminal by name with running/idle, the one
on screen marked, ✎ rename and × close per row, and **+ New terminal** below. The `shell`
segment always reads `shell`; a count beside it appears once two or more run. The shape was
found by prototype (`proto/better-terminal`, accepted 2026-11-19, layout A).

The daemon gains the terminal list as state-stream truth: one `terminals` message per session
(replacing `shellActivity`) carrying each terminal's number, name and busy flag, and
`snapshot.terminals` (replacing `snapshot.shellsBusy`). Names live in daemon memory, so they
survive a page reload and agree across windows, and vanish with the terminal or the daemon.
Closes no issue; delivers the "more than one shell per session" part of TODO.md § Enhancements
**Richer terminal functionality**.

## Requirements

### Must Have
Journeys:
- [ ] REQ-1: **Add.** With a terminal on screen, choosing ▾ → **New terminal** spawns a terminal in the session's directory and shows it; the terminal left keeps running.
- [ ] REQ-2: **Switch.** Choosing a terminal's row shows that terminal with its output intact; a command running there is still running.
- [ ] REQ-3: **Back in one click.** Clicking `shell` shows the terminal last shown for that session in this window; when that one is no longer running it shows the lowest-numbered running terminal; when none runs it starts one, as today.
- [ ] REQ-4: **Rename.** ✎ on a row turns the name into a text field; Enter saves, Esc cancels, saving an empty (or whitespace-only) name restores `shell N`. The new name shows in the menu in every window and survives a page reload.
- [ ] REQ-5: **Close.** × on an idle terminal ends it at once; × on a busy terminal first asks for confirmation naming the terminal, and ends it only on confirm.
- [ ] REQ-6: **Fallback.** When the terminal on screen ends — closed or exited by itself (`exit`, killed outside Muster) — the lowest-numbered running terminal of the session takes its place; with none left the session returns to `claude`. A terminal ending leaves the menu and the count within ~2 s in every window.
- [ ] REQ-7: **Session-wide ends.** Remove, reconcile and a kill shutdown end every terminal of the session; the kill-shutdown prompt's count includes every terminal.

Properties:
- [ ] REQ-8: The switch reads `claude | shell | ▾ | docs` in the Focus header and every tile footer.
- [ ] REQ-9: The `shell` button's text is always `shell`; a count beside it shows the number of running terminals when two or more run, and nothing with one or none.
- [ ] REQ-10: While `shell` is selected, hovering `shell` names the terminal on screen (`title`).
- [ ] REQ-11: The Terminals panel is headed `Terminals`; each row shows the terminal's name, `running` with a spinner while busy or `idle` otherwise, ✎ (visible on row hover or focus) and ×; the terminal on screen is highlighted; **+ New terminal** sits below the list.
- [ ] REQ-12: A new terminal is named `shell N`, N its number — the lowest positive integer not held by a running terminal of that session.
- [ ] REQ-13: The `shell` segment's spinner and tick keep today's behaviour (onset delay, tick, self-clear, reduced motion), driven by whether any of the session's terminals is busy.
- [ ] REQ-14: ▾ is disabled while the daemon is unreachable, like the other segments; an open panel closes when the daemon becomes unreachable.
- [ ] REQ-15: ▾ opens on click and closes on a click outside, on Esc, or on choosing a row or New terminal; focus returns to ▾ on Esc.
- [ ] REQ-16: The tile footer shows no overflow at 3×2 with ▾ and a count present.
- [ ] REQ-17: Running/idle in an open panel follows changes live — a command finishing or starting flips its row without reopening.
- [ ] REQ-18: The panel shows at most nine rows and scrolls past that, **+ New terminal** always visible below the list.

### Should Have
- [ ] REQ-19: A terminal name is at most 40 characters; the field stops input at 40.

## Protocol Contract

Delta against `docs/protocol.md` (merged there on approval; `docs/features/surfaces/contract.md`
regenerates). A **terminal** is identified by `(sessionId, n)`, `n` a positive integer. Its tmux
session is `muster-<id>-shell` for `n = 1` and `muster-<id>-shell-<n>` for `n ≥ 2`; every rule that
named "the shell" / `muster-<id>-shell` (reconcile's kill, the kill-shutdown count and kill, Remove,
the per-target one-live-client law, seen-on-attach, the `Stop` row's watched check) applies to
every terminal of the session.

### WS daemon→UI `terminals` (replaces `shellActivity`)
```json
{ "type": "terminals", "sessionId": 7,
  "terminals": [
    { "n": 1, "name": "shell 1", "busy": false },
    { "n": 2, "name": "build",   "busy": true }
  ] }
```
- `terminals` — array, sorted by `n` ascending; `[]` once the session's last terminal ends. Never null.
- `n` — integer ≥ 1.
- `name` — string, the effective name: the developer's name if set, else `shell <n>`. Never empty.
- `busy` — boolean, the same three-gate reading `shellActivity` carried
  (kb:adr/surfaces-shell-busy-from-tmux-process-state), per terminal.

Broadcast with the session's **whole** list whenever any of it changes: a terminal spawned, closed,
or observed gone (exit/external kill, detected by the ~1 s poll or by its attach PTY ending), a
rename, or a busy flip. Never sent when nothing changed. Not replayed; the current lists are in
`snapshot.terminals`. Delivery is best-effort; the whole-list shape means a later message corrects a
lost one. A client that does not know `sessionId` ignores it. `shellActivity` is no longer sent.

### WS daemon→UI `snapshot.terminals` (replaces `snapshot.shellsBusy`)
```json
{ "terminals": { "7": [ { "n": 1, "name": "shell 1", "busy": false } ] } }
```
Object keyed by session id (decimal string); only sessions with at least one terminal appear;
`{}` when none. Always present. `shellsBusy` is removed.

### HTTP: POST /api/sessions/{id}/shell (changed)
**Auth**: UI cookie (401 `unauthorized`). No body.
Ensures the session has **at least one** terminal: when one runs, returns the lowest-numbered
(`created: false`); when none runs, spawns terminal 1. Idempotent, so two windows clicking `shell`
on a session with none running produce one terminal.
**Response 200:**
```json
{ "target": "muster-7-shell", "n": 1, "created": true }
```
**Errors** (unchanged): 404 `unknown_session`, 409 `directory_missing`, 500 `shell_spawn_failed`, as today.

### HTTP: POST /api/sessions/{id}/shells (new)
**Auth**: UI cookie (401 `unauthorized`). No body.
Always spawns a new terminal, numbered the lowest positive integer not held by a running terminal of
the session, in the session's directory, exactly as a shell is spawned today (no `MUSTER_SESSION`,
no settings written, `alive` not consulted). Broadcasts `terminals`.
**Response 201:**
```json
{ "target": "muster-7-shell-2", "n": 2, "name": "shell 2" }
```
**Errors:**
- 404: `{"error": {"code": "unknown_session", "message": "unknown session id"}}`
- 409: `{"error": {"code": "directory_missing", "message": "/Users/d/gone no longer exists"}}`
- 500: `{"error": {"code": "shell_spawn_failed", "message": "couldn't open a shell — tmux reported an error; see the daemon log"}}`

### HTTP: PUT /api/sessions/{id}/shells/{n}/name (new)
**Auth**: UI cookie (401 `unauthorized`).
**Request:**
```json
{ "name": "build" }
```
`name` is trimmed of surrounding whitespace; empty after trimming clears the developer's name.
Held in daemon memory only; dropped when the terminal ends or the daemon stops. Broadcasts
`terminals` when the effective name changed.
**Response 200:**
```json
{ "n": 2, "name": "build" }
```
`name` — the effective name after the change (`shell 2` after a clear).
**Errors:**
- 400: `{"error": {"code": "bad_request", "message": "invalid body"}}` — unparseable body or `name` not a string.
- 400: `{"error": {"code": "name_too_long", "message": "a terminal name is at most 40 characters"}}` — more than 40 characters (Unicode code points) after trimming.
- 404: `{"error": {"code": "unknown_session", "message": "unknown session id"}}`
- 404: `{"error": {"code": "no_shell", "message": "no such terminal"}}` — terminal `n` is not running.

### HTTP: DELETE /api/sessions/{id}/shells/{n} (new)
**Auth**: UI cookie (401 `unauthorized`). No body.
Ends terminal `n`: kills its tmux session (any live socket on it then closes `4001 pane_ended`),
forgets its name, broadcasts `terminals`. Never touches another terminal, the Claude pane, or the
session's liveness. No confirmation server-side — asking first is the dashboard's.
**Response 204:** no body.
**Errors:**
- 404: `{"error": {"code": "unknown_session", "message": "unknown session id"}}`
- 404: `{"error": {"code": "no_shell", "message": "no such terminal"}}`

### WS `/ws/shell/{id}/{n}` (replaces `/ws/shell/{id}`)
Attach-only bridge to terminal `n`, exactly as `/ws/shell/{id}` today: same frames (`resize`,
`scroll`), clamps, close codes and no-liveness-nudge rule. Pre-upgrade errors: 401 `unauthorized`,
404 `not_found` (unknown session id or `n` not a positive integer), 409 `no_shell` (terminal `n` not
running). The one-live-client law is per terminal: two sockets on the same `(id, n)` supersede
(`4000`); sockets on different terminals, or a terminal and the Claude pane, never do.

## Schema Changes

No schema changes required — terminals and their names have no SQLite representation
(kb:adr/surfaces-shell-is-attach-target-not-session).

## UI Specifications

Governing: `docs/design/design-system.md` §5 Components (Segmented control, Menu, Focus mainhead,
the tile footer), §6 Honesty rules, §7 Terminal rules; `docs/design/ux-flows.md` §3.1 Shape — Focus,
§3.7 Shape — Tiles. The reference renders the browser reviewer compares against are
`plans/better-terminal/prototype/switch-with-count.png`, `terminals-menu-close-up.png`,
`terminals-menu-renaming.png`, `terminals-menu.png` and `focus-shell-two-terminals.png`.

### Views
- **Surface switch** (Focus mainhead and every tile footer, one component) — `claude`, `shell`,
  then a narrow ▾ button, then `docs`, in one segmented track. `shell` keeps its activity indicator
  and gains a small count (mono, `--fs-2xs`, pill on `--bg-hover`) after its text while two or more
  terminals run. The count is `aria-hidden`, so the button's accessible name stays `shell`.
- **Terminals panel** — opened by ▾, anchored below it, `--bg-raised`, 1px `--line-control` border,
  the Menu component's tokens: an uppercase mono `--fs-2xs` header `Terminals`; one row per running
  terminal in `n` order — the name (sans `--fs-sm`, ellipsized), the state word (`running` with the
  shell spinner, or `idle`, mono `--fg-muted`), ✎ (shown on row hover or focus-within) and ×; the
  row on screen takes `--bg-hover` ground; a separator, then **+ New terminal**. The list area holds
  nine rows and scrolls past that; New terminal stays outside the scroll. It is not a `role="menu"`
  (its rows hold their own buttons and a text field): it is the second user of the menu builder's
  shared popover part — anchoring below the opener, closing on outside pointerdown, Esc or a choice,
  repositioning on resize/scroll, returning focus to the opener, and the Menu tokens — with its own
  rows inside. The existing menus keep their behaviour unchanged.
- **Rename** — ✎ swaps the row's name for a text field (`--well`, 1px `--edge`) prefilled and
  selected; Enter saves, Esc cancels and leaves the panel open, blur cancels.
- **Close confirmation** — × on a busy row opens a modal confirm dialog (the existing confirm-dialog
  pattern, `render/confirm.ts`): title `Close <name>?`, body `<name> is running a command. Closing it
  ends the command.`, confirm `Close terminal` (danger), `Cancel`.

### User Flows
1. Focus on session 7 showing `shell` (terminal 1) → click ▾ → panel lists `shell 1  idle` →
   click **+ New terminal** → panel closes, terminal 2 opens and is shown; `shell` shows count `2`.
2. Click ▾ → click the `shell 1` row → panel closes, terminal 1 shown with its earlier output.
3. Click `claude` → click `shell` → terminal 1 (last shown in this window) is shown.
4. ▾ → ✎ on `shell 2` → type `build` → Enter → row reads `build`; hovering `shell` while terminal 2
   is on screen shows `build`. Reload → ▾ still lists `build`.
5. ▾ → × on a busy row → confirm dialog → `Close terminal` → the terminal ends; if it was on screen
   the lowest-numbered running terminal is shown, or `claude` when none is left.
6. `exit` typed in the terminal on screen → it leaves the panel and count; fallback as in 5.

### States
- **No data yet** (before the first snapshot): no count, no indicator; ▾ is enabled once connected
  and the panel lists no rows, only **+ New terminal**.
- **No terminals**: as no data yet — the panel shows only **+ New terminal**; `shell` starts one.
- **Data**: as Views.
- **Daemon down**: `claude`, `shell`, ▾ and `docs` disabled; an open panel closes; the count and
  rows freeze at their last value until the snapshot on reconnect replaces them.
- **Dead session**: terminals open, run and list as on a live one (`alive` never consulted).
- **Docs selected**: the panel works; a terminal ending updates the panel and count, the reader stays.

### Testable UI Elements

| Element | Role | Name / Text Pattern | Notes |
|---------|------|---------------------|-------|
| Surface switch group | `group` | `Surface` | unchanged; Focus mainhead and each tile footer |
| shell segment | `button` | `shell` | unchanged name; `title` = name of the terminal on screen while `shell` is selected, absent otherwise |
| Terminal count | — | `/^\d+$/` | `span.shellcount` inside the `shell` button, `aria-hidden="true"`; absent (not hidden) with fewer than two terminals |
| Terminals opener (▾) | `button` | `Terminals` | native `<button>`, `aria-label="Terminals"`, visible text `▾` `aria-hidden`; `aria-haspopup="dialog"`, `aria-expanded` |
| Terminals panel | `dialog` | `Terminals` | non-modal, `role="dialog"` + `aria-label="Terminals"`; visible header text `Terminals` |
| Terminal row (switch) | `button` | `<terminal name>` | one per terminal; contains only the name; `aria-current="true"` on the row on screen |
| Row state word | — | `running` \| `idle` | text sibling of the row button, not inside its name |
| Rename button | `button` | `Rename <terminal name>` | visible glyph ✎ `aria-hidden` |
| Close button | `button` | `Close <terminal name>` | visible glyph × `aria-hidden` |
| Rename field | `textbox` | `Terminal name` | native `<input>` with `aria-label`; `maxlength="40"` |
| New terminal | `button` | `New terminal` | visible text `+ New terminal`, the `+` `aria-hidden` |
| Close confirm dialog | `dialog` | `Close <terminal name>?` | modal `<dialog>`, named by its title |
| Confirm button | `button` | `Close terminal` | in the confirm dialog |
| Cancel button | `button` | `Cancel` | in the confirm dialog |

#### Invariants

- **INV-1 (bystanders)**: ending terminal `(S, n)` — by ×, `exit`, external kill — never closes a
  socket of, kills, renames or changes the busy flag of any other terminal of `S`, `S`'s Claude
  socket or pane, or any terminal of another session, including one whose id shares a prefix
  (`S = 1` beside session 12, and `muster-1-shell` beside `muster-1-shell-2`). Asserted from: one
  terminal; two terminals with the other attached; the other session's terminal attached; in Focus
  and in Tiles. → D3, E5
- **INV-2 (list is truth)**: after any spawn, close, rename or exit settles, every connected
  window's panel rows and count equal the daemon's `terminals` list for that session — the count
  shows iff the list has ≥ 2 entries. Asserted after every input of the table in W2. → W2, E6
- **INV-3 (no terminal survives its session's end)**: after Remove, reconcile or a kill shutdown, no
  `muster-<id>-shell` or `muster-<id>-shell-<n>` tmux session of that id exists, from states with 1
  and with 3 terminals. → D5, E7
- **INV-4 (indicator)**: the `shell` segment is busy iff at least one terminal in the list is busy
  (subject to today's onset delay), from every combination of terminal count and selected surface
  in W3. → W3
- **INV-5 (the shown terminal is running)**: whenever `shell` is selected, the terminal shown is in
  the session's list; when it leaves the list the fallback of REQ-6 applies in the same render. → W1, E5

Hosting views: the switch and panel live in the Focus mainhead and every tile footer; INV-1, INV-2
and INV-5 are asserted in both.

#### Carried-over measurements

- The busy reading's three gates (kb:adr/surfaces-shell-busy-from-tmux-process-state) were measured
  on one shell per session named `muster-<id>-shell`. Re-checked against this plan: the gates read
  per pane and never depended on the session name beyond mapping it to an id, so they hold per
  terminal; the name→`(id, n)` mapping is new and covered by D1.
- The ~1 s poll cadence carries over; exit detection within ~2 s (REQ-6) rests on it — still valid
  because the poll already lists every pane on the socket each tick.

## Affected Files

### Daemon (daemon-impl)
- `internal/tmux/tmux.go` — REQ-12, INV-1: terminal tmux names for `(id, n)` and parsing a name back to `(id, n)`; `muster-<id>-shell-<n>` recognised as a shell everywhere a shell name is.
- `internal/server/shells.go` — REQ-1, 3, 4, 5, 12, 19: ensure-any, new terminal at lowest free `n`, rename (in-memory names, cleared on end), close, kill every terminal of a session; new routes.
- `internal/server/shellactivity.go` — REQ-6, 13, 17: per-terminal busy and the terminal list per session; broadcasts `terminals` on any change, including a terminal observed gone; stops sending `shellActivity`.
- `internal/server/state.go` — `snapshot.terminals` replaces `shellsBusy`.
- `internal/server/terminal.go` — INV-1: one-live-client key per terminal; the session-wide close covers every terminal; `Watched` counts any terminal socket.
- `internal/server/update.go` — REQ-7: the kill-shutdown count and kill cover every terminal name.
- `internal/session/reconcile.go` — REQ-7, INV-3: reconcile kills every terminal name, not only `muster-<id>-shell`.
- `internal/server/server.go` — one-line registration only, if a new feature module needs it.
- `internal/server/renderfix_scenarios_misc.go` — render scenarios `terminals-two`, `terminals-two-tiles`, `terminals-ten`; `shell-busy`/`shell-idle*` regenerate with `snapshot.terminals`.
- `web/render/fixtures/*.json` — regenerated by `make gen-render-fixtures` for the snapshot shape change (kb:lesson/wire-shape-change-owns-its-fixtures).

### Web (web-impl)
- `web/src/protocol/messages.ts` — parse `terminals` and `snapshot.terminals`; drop `shellActivity`/`shellsBusy`.
- `web/src/api/sessions.ts` — the changed `POST …/shell` result and the three new endpoints.
- `web/src/terminal/surfaceswitch.ts` — REQ-3, 6, INV-5: per session, which terminal is shown and the last shown in this window, the fallback when it ends.
- `web/src/terminal/shellactivity.ts` — REQ-13, INV-4: fed by the any-terminal-busy reading.
- `web/src/render/surfaceseg.ts` — REQ-8, 9, 10, 14: ▾ opener, count, `title`.
- `web/src/render/menu.ts` — REQ-15: its popover part (anchor, outside-pointerdown/Esc close, reposition, focus return, tokens) becomes shared so a second component can use it; every existing menu behaves as today.
- new under `web/src/render/terminals*.ts` — REQ-11, 15, 17, 18, 19: the Terminals panel and its rename field, on the shared popover part.
- `web/src/features/surfaces.ts` — REQ-1–6: wiring the panel's actions to the endpoints, the confirm, the shown terminal and its socket.
- `web/src/terminal/pane.ts` — the shell socket targets `/ws/shell/{id}/{n}`.
- `web/src/app.ts`, `web/src/wsapp.ts` — dispatch the new message in place of `shellActivity`.
- `web/src/render/confirm.ts`, `web/index.html` — REQ-5: the close-terminal confirm dialog.
- `web/src/render/tiles.ts` — REQ-16: footer fit with ▾ at 3×2, if the measured build needs it.
- `web/src/style.css` — the opener, count, panel, rename field.
- `docs/design/design-system.md` — the surface switch reads `claude | shell | ▾ | docs` with the count; a **Terminals panel** component entry.

### Existing tests this breaks
- daemon-tests: `internal/server/state_test.go` (`shellsBusy` in the snapshot), `internal/server/shellactivity_test.go` (`shellActivity` broadcasts), `internal/server/server_test.go` (`shellsBusy`), `internal/server/plainshell_test.go` (dials `/ws/shell/{id}`), `internal/server/shells_test.go` (Ensure's created-once race still holds; result gains `n`), reconcile and tmux name tests for the shell-name parse.
- web-tests: `web/src/terminal/shellactivity.test.ts`, `web/src/protocol/messages` tests (`shellActivity`, `shellsBusy`), `web/src/api/sessions.test.ts:232` (createShell result), surface-switch tests over `shellRunning`.
- render-tests: `web/render/surfaces.spec.ts` (reads the switch and indicator; fixtures regenerate).
- e2e-specs: `web/e2e/shell-activity.spec.ts`, `web/e2e/shell.spec.ts`, `web/e2e/plain-shell.spec.ts` (tile-footer locators, shell end returns to claude, the `**/api/sessions/{id}/shell` route mock at :919), `web/e2e/helpers/shell.ts` (`shellTmuxTarget` per terminal).

## Edge Cases

1. Two windows click `shell` on a session with no terminal at the same moment → `POST …/shell` is idempotent; one terminal exists. → D2
2. Two windows choose New terminal at once → two terminals, distinct `n`. → D2
3. Closing terminal 2 of 3 then New terminal → the new one is `shell 2` (lowest free). → D2
4. A renamed terminal ends and a new one takes its number → the new one reads `shell N`, never the old name. → D4
5. Terminal exits while the panel is open → its row leaves the open panel. → E6
6. Terminal on screen exits while `docs` is selected → panel and count update; reader stays. → W1
7. × on a terminal that already exited (stale row) → 404 `no_shell`; the next `terminals` corrects the panel; no error surfaced. → W4
8. Rename submitted for a terminal that ended meanwhile → 404 `no_shell`; field closes, row is already gone. → W4
9. Rename to 41+ characters via the API → 400 `name_too_long`. → D4
10. Rename to whitespace only → effective name `shell N`. → D4
11. Busy flips between opening × and confirming → the confirm still ends it; idle at click time ends at once. → untested: a race on a 1 s poll cannot be driven deterministically
12. Same terminal opened in a second window → the first is superseded with the reclaim overlay; a different terminal in the second window supersedes nothing. → E8
13. Daemon restart → every terminal and name is gone; reconcile kills `muster-<id>-shell-<n>` left on the socket; snapshot `terminals` is `{}`. → D5
14. `terminals` message lost → the next change's whole list corrects it; reconnect snapshot re-syncs. → untested: loss is the transport's, and the whole-list shape is asserted by D3
15. A `terminals` for an unknown session id → ignored. → W2
16. Session 1 and session 12 each with terminals → ending session 1's never touches session 12's (`muster-1-shell…` vs `muster-12-shell`). → D3
17. Daemon goes down with the panel open → the panel closes and ▾ disables. → R4
18. Remove with three terminals → all three end, the menu state for that session is forgotten. → E7
19. Ten terminals → nine rows visible, the list scrolls, New terminal visible. → R3
20. Hook loss, `/clear` rebinding, `session_id` stragglers → not applicable: terminals key on `(session id, n)` and read no hook. → untested: no hook path

## Acceptance Criteria

### Daemon
- **D1**: tmux name ↔ `(id, n)` round-trips for `n = 1` (`muster-<id>-shell`) and `n ≥ 2`, and rejects non-terminal names, including Claude's `muster-<id>`.
- **D2**: `POST /shells` numbers each new terminal the lowest free `n`, and `POST /shell` spawns at most one terminal under concurrent calls on an empty session.
- **D3**: ending one terminal (DELETE, or its pane gone at poll) closes only that terminal's socket and broadcasts the session's whole remaining list, leaving another terminal of the same session and session 12's terminals untouched.
- **D4**: rename trims, resets on empty, rejects 41+ characters with `name_too_long`, and a terminal reusing an ended terminal's number reads `shell N`.
- **D5**: Remove, reconcile and kill shutdown leave no `muster-<id>-shell*` tmux session for that id, from one and from three terminals.
- **D6**: the kill-shutdown count counts every terminal on the socket.
- **D7**: a busy flip on one terminal broadcasts `terminals` with that terminal's `busy` changed and no other field changed.

### Web
- **W1**: the surface reducer shows the last-shown terminal on `shell`, falls back to the lowest-numbered running one when the shown terminal leaves the list, returns to `claude` when the list empties, and leaves a `docs` selection untouched.
- **W2**: applying `terminals` / `snapshot.terminals` keeps per-session rows and count equal to the list for every input against every starting state (0, 1, 2 terminals; unknown session), and ignores an unknown session.
- **W3**: the activity indicator is busy iff any terminal is busy, across terminal counts and selected surfaces, with today's onset delay and self-clear.
- **W4**: a 404 `no_shell` from close or rename is swallowed without an error notice.

### Render
- **R1**: in `terminals-two`, the Focus switch reads `claude`, `shell`, ▾, `docs` in that order and the `shell` button holds count `2` and text `shell`.
- **R2**: in `terminals-two-tiles` at 3×2, every tile footer's switch and actions fit with no horizontal overflow (scrollWidth ≤ clientWidth).
- **R3**: in `terminals-ten`, the open panel shows nine rows, its list scrolls, and New terminal is visible without scrolling.
- **R4**: with the daemon connection down, ▾ is disabled and no panel is open.
- **R5**: in `terminals-two`, the open panel lists `shell 1` `idle` and `build` `running` with the spinner, ✎ hidden until row hover, and the shown row highlighted.
- **R6**: in `shell-idle-tiles` (one terminal), no count is present in any `shell` button.

### E2E
- **E1**: from terminal 1 running `sleep 600`, New terminal shows a fresh terminal whose `pwd` is the session directory, and terminal 1's command is still running.
- **E2**: switching rows shows each terminal's own earlier output.
- **E3**: after `claude` is selected, one click on `shell` shows the terminal last shown.
- **E4**: renaming shows the name in the panel and as the `shell` title, keeps it across a reload, and an empty save restores `shell N`.
- **E5**: closing the terminal on screen shows the lowest-numbered other terminal; closing the last returns to `claude` — in Focus and in a tile.
- **E6**: `exit` in a terminal removes its row from the open panel and updates the count in a second window.
- **E7**: Remove of a session with three terminals leaves none running.
- **E8**: × on a busy terminal opens the confirm and ends it only on `Close terminal`; × on an idle one ends it at once.
- **E9**: with the panel open, a command finishing flips its row from `running` to `idle`.
- **E10**: the same terminal in a second window supersedes the first; a different terminal does not.
- **E11**: a kill shutdown's prompt counts every terminal of every session.

### Automated Checks

```checks
D1 make test
D2 go build ./...
D3 make lint
D4 make check-render-fixtures
W1 make web-build
W2 make web-test
R1 make render-test
E1 make e2e
```


### Reviewer-Verified
- **V1**: no `any` types in new web code.
- **V2**: the switch and panel match the reference renders in `plans/better-terminal/prototype/` at Focus and at tile 3×2.
- **V3**: the panel's tokens are the Menu component's (§5) and the state word uses the shell spinner, measured in the browser.
- **V6**: the Terminals panel opens, closes, repositions and returns focus through the menu builder's shared popover part, not a copy of it.
- **V4**: no terminal content is read for state anywhere in the diff.
- **V5**: no code under `internal/`, `cmd/` or `web/src/` still sends or parses the retired per-session busy message or snapshot field (a grep, kept here because its pattern would sit in this plan's own text).

## Doc Delta

**surfaces** — becomes true:
- A session may carry several plain shells, its terminals, each its own attach target, switched by a `claude | shell | ▾ | docs` segment in the mainhead and in a tile's footer.
- `shell` shows the terminal last shown, starting one when none is running; ▾ opens a Terminals panel listing each running terminal by name, running or idle, with the one on screen marked, a rename, a close, and New terminal.
- The `shell` segment always reads `shell`; a count beside it shows once two or more terminals run, and its tooltip names the terminal on screen.
- A new terminal is named `shell N`, the lowest number free in its session, until renamed; a name lasts as long as its terminal.
- When the terminal on screen ends, the lowest-numbered running terminal of the session takes its place, or claude when none is left.
- The shell segment's spinner and tick follow any of the session's terminals; the panel shows which one is busy.

**surfaces** — stops being true:
- "A session may carry a plain shell as a second attach target, switched by a `claude | shell` segment in the mainhead and in a tile's footer"
- "the shell segment shows a spinner while busy and a tick once work finishes" — replaced by the any-terminal sentence (the reduced-motion clause stays).

**focus** — becomes true: the right-aligned cluster holds the `claude | shell | ▾ | docs` surface switch.
**focus** — stops being true: "holds the `claude | shell | docs` surface switch".

## Out of scope

- Showing the terminal's name on the `shell` tab (tried and rejected in prototype round 2).
- Opening the list from the `shell` button itself (layouts B and C), on hover, or closing on pointer leave.
- Terminals as an inline tab strip.
- The rest of TODO.md's Richer terminal functionality entry: a shell-kind session with its own rail card and shortcuts, a global terminal, restoring terminals across daemon restarts, a rail-card marker for a terminal running in a session not being viewed — already in the backlog; nothing new filed.
- Names surviving the terminal or the daemon.

## Implementation Notes

**Hints (non-binding):**
- The poller already lists every pane on the socket each tick (`ListPaneActivity`) and maps names via `tmux.IsShellSessionName`; the per-terminal list falls out of the same tick.
- `ShellCount`/`KillAllShells` (`internal/server/update.go:229`) list shell sessions by name, so a widened name parse may be all they need.
- `terminalKey` (`internal/server/terminal.go:73`) is where the per-terminal one-live-client law lives.
- The prototype's bounded `for n := 1..9` kill loops are wrong for an uncapped count — list by name instead.

**Decisions** (proposed ADRs at approval):
- kb:adr/surfaces-terminals-numbered-attach-targets — a terminal is `(session, n)`; tmux names, `/ws/shell/{id}/{n}`, lowest free `n`, `shell N` default, no cap.
- kb:adr/surfaces-terminals-list-on-state-stream — `terminals` / `snapshot.terminals` replace `shellActivity` / `shellsBusy`; names held in daemon memory.
- kb:adr/web-menu-popover-shared-by-terminals-panel — the menu builder's popover part (anchor, close rules, reposition, focus return, tokens) is shared, and the Terminals panel is its second user as a non-modal `role="dialog"` with its own rows, because `role="menu"` cannot hold per-row buttons and a text field; one builder still owns how every popover opens, closes and looks (refines kb:adr/web-menu-component-single-builder).
- kb:adr/surfaces-last-shown-terminal-per-window — the last-shown terminal is per window, in memory; after reload or when it ends, the lowest-numbered running terminal.

Standing ADRs this keeps: kb:adr/surfaces-shell-is-attach-target-not-session,
kb:adr/surfaces-shell-pane-carries-no-session-env, kb:adr/surfaces-shell-dies-at-kill-shutdown-too,
kb:adr/surfaces-one-live-client-per-attach-target, kb:adr/surfaces-shell-busy-from-tmux-process-state,
kb:adr/surfaces-shell-control-in-tile-footer, kb:adr/surfaces-shell-spawn-http-then-attach-ws,
kb:adr/surfaces-shell-scroll-via-daemon-copy-mode.

**Doc upkeep (orchestrator):** the four ADRs above flip to `accepted` at Completion; TODO.md's
Richer terminal functionality entry is edited to drop "more than one shell per session" (the rest
stays); `kb:diagram/domain-model` already names Terminals — check its wording against "several per
session".
