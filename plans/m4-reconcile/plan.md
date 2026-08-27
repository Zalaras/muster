# Plan: M4 — Reconcile, shutdown policy, end / remove / resume

**Created**: 2026-08-26
**Status**: completed
**Work Type**: full-stack
**E2E Scope**: new-specs
**Description**: Make sessions durable across daemon restarts by policy (they survive; reconcile re-adopts), give the dashboard End / Remove / Resume with confirm dialogs, show an ended session's last captured screen, sweep already-ended rows on startup, and land the D5 regression guard from the m4-hook-quoting review.

## Overview

Today a session already survives a daemon restart by accident: `Manager.LoadAll` reloads
the row and the ~5 s liveness poll eventually flips dead panes. Nothing makes that a
*policy*: shutdown never looks at tmux (the 2026-08-25 orphan), the first snapshot after a
restart can carry stale `alive:true` for up to one poll tick, unknown panes on the socket
are never reported, and a dead session's card stays forever with no way to end, remove or
resume it (`docs/protocol.md` §5.5 reserves `sessionRemoved`; `Manager.DeleteSession`
exists only as the launch-rollback path; no `kill-*` in a production path).

This plan settles the durability policy and builds the three session actions on it.
Decisions taken with Damian in planning (2026-08-26), not re-opened here:

- **Sessions survive daemon shutdown** by default. On shutdown, if stdin is a TTY and
  live sessions exist, musterd asks once — *"N live sessions on tmux socket X — kill
  them? [y/N]"*, 10 s timeout → **No**. Non-TTY, crash, or timeout: sessions keep running
  untouched. A `-on-exit` flag (`ask` default | `leave` | `kill`) makes both paths
  testable and scriptable.
- **Reconcile on start is synchronous and runs before the first snapshot** is served.
  Rows already `alive=0` (ended in an earlier daemon lifetime — the user had their resume
  chance) are **deleted** — "a fresh start keeps the UI clean". Rows `alive=1` whose pane
  is gone (died while the daemon was down, or a reboot) are marked ended and **kept**, so
  the resume chance is not lost; the *following* startup sweeps them. Panes on the
  socket with no row are logged and never adopted (protocol §7.5, unchanged).
- **End** kills a live session's tmux session; it is recoverable because the daemon
  already holds `claudeSessionId` from the envelope — the same hash `claude` prints on
  exit. Both **End** and **Remove** go through a confirm dialog. **Remove is allowed on a
  live session**: its dialog says it ends the session first.
- **Resume** spawns `claude --resume <claudeSessionId>` in a fresh `muster-<id>` tmux
  session; the enveloped `SessionStart(source:"resume")` lands the session in `idle`
  (protocol §7.3 — the code currently lands it in `started`; this plan fixes that).
- **Ended sessions fall to the bottom** of the rail (struck-through name, dimmed, `ended
  <age>` timer) and carry Resume + Remove; they leave only on Remove or the next startup.
- **Last snapshot is in**: the daemon captures each live pane's screen on every liveness
  tick (`capture-pane`, display source only — never a state source) and serves the last
  one for a dead session; the UI shows it dimmed under a *session ended* cap that carries
  Resume. Protocol §3.4's deferral is closed here.
- **Placement C — both**: a mainhead above the focused terminal with End / Resume /
  Remove *and* an action row on rail cards; tile footers gain the same (they already act
  as the tile's header bar). Reference renders: `plans/m4-reconcile/mockups/` —
  `opt-c-both.html` (Focus) and `tiles-dead.html` (Tiles); `index.html` explains them.

Out of scope (plan B `m4-hook-lifetime`, plan C `m4-canary`): hook-entry lifetime, the
"daemon down" surface for unmanaged sessions, unrouted-event policy, canary unskip.

## Requirements

### Must Have
- [ ] REQ-1 **Reconcile on start, before serving.** `Server.Start` walks every loaded row
      synchronously before `/ws` or `GET /api/state` can answer: `alive=0` → row deleted
      (count logged at info); `alive=1` + pane exists → unchanged; `alive=1` + pane gone →
      `alive=false`, `endedAt = now` (the startup time — the true death time is unknown
      and is not guessed), persisted. Then the poll starts.
- [ ] REQ-2 **Unknown panes are reported, never adopted.** Reconcile lists sessions on the
      muster socket (`tmux ls -F '#{session_name}'`); every `muster-<n>` with no row is
      logged at warn with its name. No row is created.
- [ ] REQ-3 **Shutdown policy.** `-on-exit` flag: `ask` (default), `leave`, `kill`. On
      SIGINT/SIGTERM with ≥1 live session: `leave` → log `leaving N live sessions running
      on tmux socket <socket>` and exit; `kill` → for each live session, final snapshot
      then `kill-session`, row set `alive=false`/`endedAt`, then exit; `ask` → if stdin is
      a character device, print the prompt to stderr and read one line with a 10 s
      timeout (`y`/`Y`/`yes` → kill path, anything else or timeout → leave path); if stdin
      is not a TTY, `ask` behaves as `leave`. Zero live sessions → no prompt, no log line.
- [ ] REQ-4 **Pane snapshots.** On every liveness tick (and in `Nudge`), for each alive
      session the daemon runs `capture-pane -p -t <target>` and stores the text in memory;
      when it differs from the last stored value it persists `last_snapshot` +
      `last_snapshot_at`. `GET /api/sessions/{id}/pane` serves it. Snapshot text is never
      logged and never read by the state machine.
- [ ] REQ-5 **End.** `POST /api/sessions/{id}/end`: 404 unknown, 409 `not_alive`;
      otherwise final snapshot → `tmux kill-session -t muster-<id>` → liveness nudge →
      `200` + Session (`alive:false`). Open terminal sockets for that id close with
      `4001`. No other session is touched.
- [ ] REQ-6 **Remove.** `DELETE /api/sessions/{id}`: 404 unknown; if alive, runs the End
      path first; deletes the row; broadcasts `sessionRemoved`; `204`. `event` rows keep
      their `session_id` (audit trail); `usage_sample` is account-level and unaffected.
- [ ] REQ-7 **Resume.** `POST /api/sessions/{id}/resume`: 404 unknown; 409
      `not_resumable` when alive or `claudeSessionId` is null; 409 `directory_missing`
      when the directory no longer exists; otherwise rewrite the directory's
      `.claude/settings.local.json` (existing `writeSettings`), spawn
      `claude --resume <claudeSessionId> --model <model.id> [--permission-mode <latched>]`
      via `claudecode.BuildArgv` in a new tmux session named `muster-<id>` with the same
      pane env as launch, update the row (`tmuxTarget`/`tmuxPane` new, `alive:true`,
      `endedAt:null`, snapshot cleared), broadcast, `200` + Session. `state` is unchanged
      until the enveloped `SessionStart(source:"resume")` arrives.
- [ ] REQ-8 **Resume lands in `idle`.** `interpretSessionStart` maps `source:"resume"` to
      a new `KindResumeBind`; the machine re-binds the (same) claude id, clears
      `attention`/`failure`, leaves `compactions`, `lastActivity`, `context` alone, and
      sets `state := idle`. A `source:"resume"` with a *different* claude id still
      escalates to clear-rebind (Edge Case 5 loss tolerance) and lands in `started`.
- [ ] REQ-9 **Ended sort + styling.** `sortSessions` puts `alive:false` after every live
      session (within ended: most recently ended first, then id). Ended card: `ended`
      class, struck-through name, dimmed, timer reads `ended <age>` from `endedAt`; state
      badge keeps the last known state.
- [ ] REQ-10 **Focus mainhead.** Above the focused session's terminal slot: name, meta
      (repo/branch · model · `ended <age>` when dead), and buttons **End** (enabled iff
      alive), **Resume** (enabled iff `!alive && claudeSessionId`), **Remove** (always
      enabled). Hidden when there is no focused session.
- [ ] REQ-11 **Card action row.** Live card: **End**. Ended card: **Resume** + **Remove**.
      Clicks on the buttons do not change focus (`stopPropagation`).
- [ ] REQ-12 **Tiles.** Live tile footer gains **End**. A dead tile keeps its grid slot
      (sticky membership, m2) and shows the snapshot dimmed under the ended cap; footer
      shows `ended <age>` and **Resume** + **Remove** instead of the geometry readout.
      Strip cards for ended sessions carry **Resume** + **Remove**.
- [ ] REQ-13 **Dead-session surface (Focus + tile).** When the focused/tiled session is
      `alive:false`, the UI fetches `GET /api/sessions/{id}/pane` and renders the text in
      a `<pre>` dimmed, with an *end bar* (`ended <age> · last state <state> · last captured
      screen, not a live client`) and a centred cap `session ended` containing **Resume**.
      404 `no_snapshot` renders the cap over an empty dimmed area with the text `no
      snapshot captured`. The UI never opens a terminal socket for a dead session.
- [ ] REQ-14 **Confirm dialogs.** End → `<dialog>` "End session?" naming the session, copy
      that it stays as ended and can be resumed; buttons **Cancel** / **End session**.
      Remove → "Remove session?" copy that it disappears and cannot be resumed from here
      (and, when alive, "ends the session first"); **Cancel** / **Remove**. Escape cancels.
- [ ] REQ-15 **`sessionRemoved` on the client.** Removes the session from the store, the
      rail, the tile live set and the strip; disposes any terminal surface for it; if it
      was focused, focus moves to the top of the sorted list (or the empty placeholder).
- [ ] REQ-16 **D5 regression guard** (m4-hook-quoting review Major 1): a unit test in
      `internal/claudecode/settings_test.go` merges over a foreign `type:"command"`
      `SessionStart` hook and asserts both the foreign and Muster's quoted entry are
      present, and that a re-merge does not duplicate the foreign one.

### Should Have
- [ ] REQ-17 Reconcile logs one summary line: `reconciled sessions: kept N alive, marked
      M ended, swept K`.
- [ ] REQ-18 `⌘1–9` on an ended session in Focus focuses it (shows the dead surface); in
      Tiles it promotes as today. No keyboard shortcut for End/Remove (destructive).

### Nice to Have
- [ ] REQ-19 The end bar shows the snapshot's `capturedAt` age ("captured 6m ago").

## Protocol Contract

Delta against `docs/protocol.md` (merged there on approval).

### HTTP: POST /api/sessions/{id}/end
**Auth**: UI cookie (§2).
**Request:** no body.
**Response 200:** the Session object (§5.3) with `alive:false`, `endedAt` set.
**Errors:**
- 404 `unknown_session`
- 409 `not_alive` — already ended.

Side effects: final pane snapshot captured; `tmux kill-session -t muster-<id>`; liveness
nudge; terminal sockets for the id close `4001`; a `sessionUpsert` (`alive:false`) is
broadcast before the response is written.

### HTTP: DELETE /api/sessions/{id}
**Auth**: UI cookie.
**Request:** no body.
**Response 204:** empty.
**Errors:**
- 404 `unknown_session`
- 500 `end_failed` — the session was alive and the kill failed; the row is **not** deleted.

Side effects: if alive, the End path runs first (its `sessionUpsert` is broadcast); the
row is deleted; `sessionRemoved` is broadcast before the response.

### HTTP: POST /api/sessions/{id}/resume (refines the existing §3.5 sketch)
**Auth**: UI cookie.
**Request:** no body.
**Response 200:** the Session object with `alive:true`, `endedAt:null`, the new
`tmuxTarget`, `state` unchanged (it becomes `idle` when the enveloped
`SessionStart(source:"resume")` arrives — §7.3).
**Errors:**
- 404 `unknown_session`
- 409 `not_resumable` — alive, or `claudeSessionId` is null.
- 409 `directory_missing` — the session's directory no longer exists.
- 500 `launch_failed` — settings write or tmux spawn failed; row unchanged.

The tmux session name is reused (`muster-<id>`); a spawn failure because that name still
exists is `launch_failed` (it cannot happen after a successful End/reconcile, which is
what makes the row `alive:false`).

### HTTP: GET /api/sessions/{id}/pane (closes the §3.4 deferral)
**Auth**: UI cookie.
**Response 200:**
```json
{ "text": "string — last capture-pane -p output, LF-separated, trailing blank lines trimmed",
  "capturedAt": "ISO8601 — when that capture was taken" }
```
**Errors:**
- 404 `unknown_session`
- 404 `no_snapshot` — no capture has succeeded yet for this session.

Served for live sessions too (the UI only asks for dead ones). Display source only.

### WS: daemon→UI `sessionRemoved`
```json
{ "type": "sessionRemoved", "id": 7 }
```
Sent once per `DELETE`. A client that has never seen `id` ignores it. Startup sweeps
(REQ-1) send nothing — swept rows are absent from the first `snapshot`.

### §7.3 transition change
| `SessionStart` (`source:"resume"`, same `session_id`) | Re-bind, `attention`/`failure` cleared, `compactions`/`lastActivity`/`context` kept → **`idle`** |

Already in the table; this plan makes the code match it (`KindResumeBind`).

### §7.5 additions
- Reconcile runs synchronously before the first snapshot; rows `alive=0` at startup are
  deleted; rows `alive=1` with no pane become `alive:false` with `endedAt` = startup time.
- Daemon shutdown leaves tmux alone unless `-on-exit=kill` or the interactive prompt is
  answered yes; in those cases rows are set `alive:false` before exit.
- The Session object is unchanged. No new fields.

## Schema Changes

Migration `internal/store/migrations/0004_reconcile.sql` (forward-only):

```sql
-- M4 (m4-reconcile): last captured pane screen, served to the UI for ended sessions.
-- Display source only — never read by the state machine.
ALTER TABLE session ADD COLUMN last_snapshot    TEXT;
ALTER TABLE session ADD COLUMN last_snapshot_at TEXT;
```

Written only when the text changes (same pattern as `usage_sample`). Contains prompt
text — the data dir is already 0700 and holds the `event` table; the same care applies:
never logged.

## UI Specifications

Design authority: `plans/m4-reconcile/mockups/opt-c-both.html` and `tiles-dead.html`
(direction A CSS; amber dashed outlines mark what is new — do not ship the outlines).
Design-system tokens from `docs/design/design-system.md`; `--rose` for the destructive
confirm button.

### Views
- **Focus** — new `mainhead` between the banner and the terminal slot; card action rows;
  dead-session surface in the main area.
- **Tiles** — footer actions; dead tile body shows the snapshot surface.
- **Confirm dialogs** — two `<dialog class="modal">` elements (`#end-dialog`,
  `#remove-dialog`), modelled on the launch dialog.

### DOM (feature level)
- `#mainhead` (`<div class="mainhead">`): `.name`, `.meta`, `.acts` with three
  `<button>`s. `hidden` when nothing is focused.
- Card template gains `<div class="acts-row" hidden>` after `.note`; buttons are created
  per state by `render/sessions.ts`.
- Tile template footer gains `<span class="acts">` after `.marker`.
- Dead surface (`#dead-surface` in Focus, and per tile inside `.tbody-slot`):
  `<div class="endbar">`, `<pre class="snapshot ended">`, `<div class="endcap"><div
  class="pill"><b>session ended</b>… <button>Resume</button></div></div>`.
- Strip card (`.scard`) for an ended session: `.acts-row` with Resume + Remove.

### User Flows
1. **End a live session**: click End (card / mainhead / tile footer) → `#end-dialog` opens
   naming the session → *End session* → `POST …/end` → dialog closes; card restyles to
   ended and falls to the bottom; the focused terminal is replaced by the dead surface.
   *Cancel*/Escape → nothing sent.
2. **Remove**: click Remove → `#remove-dialog` (copy adds "ends the session first" when
   alive) → *Remove* → `DELETE` → `sessionRemoved` → card/tile gone; focus moves to the
   top of the list.
3. **Resume**: click Resume (card / mainhead / cap / tile footer / strip) → no dialog →
   `POST …/resume` → card returns to live styling, terminal slot mounts a live surface;
   badge flips to `idle` when the resume SessionStart arrives.
4. **Daemon restarted under live sessions**: dashboard reconnects; live sessions keep
   their terminals (existing); sessions that were already ended are gone.

### States
- **No data yet**: a dead session with no snapshot → cap text `no snapshot captured`;
  mainhead meta shows `ended <age>`; never an empty terminal pretending to be live.
- **Data**: as above.
- **Daemon down**: existing banner; action buttons are disabled while the WS is down
  (an End against a dead daemon cannot be confirmed as done). Dialogs, if open, close.

### Testable UI Elements

| Element | Role | Name / Text Pattern | Notes |
|---------|------|---------------------|-------|
| Mainhead | — | `#mainhead` | contains `.name` = session title |
| Mainhead End | `button` | `End` | scoped inside `#mainhead`; `disabled` iff `alive:false` |
| Mainhead Resume | `button` | `Resume` | `disabled` iff alive or no `claudeSessionId` |
| Mainhead Remove | `button` | `Remove` | never disabled |
| Card End | `button` | `End` | inside `[data-testid="session-card"]`, live cards only |
| Card Resume / Remove | `button` | `Resume` / `Remove` | ended cards only |
| Ended card | — | `.card.ended` | timer text `/^ended /` |
| Tile End | `button` | `End` | inside `.tile .tfoot`, live tiles |
| Tile Resume / Remove | `button` | `Resume` / `Remove` | inside `.tile .tfoot`, dead tiles |
| Tile marker | — | `.marker` | `live` \| `stopped` (existing) |
| Dead surface end bar | — | `.endbar` | text `/^ended /` |
| Dead surface cap | — | `.endcap` | text contains `session ended`; contains a `Resume` button |
| Snapshot | — | `pre.snapshot` | textContent = pane text |
| End dialog | `dialog` | `End session?` | `#end-dialog`, `aria-labelledby` its `<h2>` |
| End dialog confirm | `button` | `End session` | inside `#end-dialog` |
| Remove dialog | `dialog` | `Remove session?` | `#remove-dialog` |
| Remove dialog confirm | `button` | `Remove` | inside `#remove-dialog` |
| Dialog cancel | `button` | `Cancel` | in both dialogs |

### Invariants

- **INV-1 (alive ⇔ pane)**: after reconcile and at every poll, `alive` equals tmux pane
  existence for the target. Assert from: fresh row, live-then-killed, killed-while-daemon-
  down (restart), resumed-then-alive, resumed-then-immediately-dead.
- **INV-2 (bystanders)**: End / Remove / Resume of session X never changes another
  session's `alive`, `state`, tmux session, pane or attached-client count. Assert with
  ≥2 sessions present, from Focus *and* Tiles.
- **INV-3 (removed stays removed)**: after `sessionRemoved`, the id appears in no later
  `snapshot` — including after a daemon restart.
- **INV-4 (snapshot is not a state source)**: no capture changes `state`/`stateSince`/
  `attention`/`failure`; `internal/session` reads capture text only to store it.
- **INV-5 (dead means no client)**: a session with `alive:false` never has a terminal
  WS open or a tmux client attached (existing m2 INV, extended to the dead surface).
- **INV-6 (state-machine invariants hold through resume)**: `attention` non-null iff
  `needs_input`, `failure` non-null iff `failed` — asserted from every source state
  (`started`, `planning`, `working`, `needs_input`, `failed`, `idle`) through
  `KindResumeBind`.

### Carried-over measurements (re-checked against this plan's decisions)

- H2 probe `--resume`: `SessionStart(source:"resume")`, same `session_id`/`transcript_path`
  — measured **headless** (`-p`) on 2.1.233; "interactive resume / different-cwd not
  exercised". Re-check: this plan resumes interactively in the *same* cwd. The same-id
  claim is what REQ-8 relies on; REQ-8 also handles the different-id case (escalates to
  clear-rebind), so a divergence degrades honestly rather than breaking. **Manual
  verification with haiku is part of acceptance (Reviewer-Verified R2).**
- m2 topology (`muster-<id>` per session, `detach-on-destroy on`): Resume reuses
  `tmux.Client.NewSession` unchanged, so the measured config still applies.
- m2: `kill-window` on the single window kills the session — REQ-5 uses `kill-session`
  by name for clarity; equivalent under the one-window topology.
- m1 liveness poll ~5 s: unchanged; snapshot age is therefore ≤ ~5 s at natural death and
  0 s on End (final capture before kill).

## Affected Files

### Daemon
- `internal/store/migrations/0004_reconcile.sql` — two columns (above).
- `internal/store/session.go` — `SessionRow` gains `LastSnapshot`, `LastSnapshotAt`;
  `UpdateSession`/`ListSessions` carry them; new `UpdateSnapshot(ctx, id, text, at)`.
- `internal/tmux/tmux.go` — `ListSessions(ctx) ([]string, error)`, `KillSession(ctx,
  name)`, `CapturePane(ctx, target) (string, error)` (`capture-pane -p`).
- `internal/session/manager.go` — `Reconcile(ctx) (ReconcileReport, error)` (REQ-1/2/17);
  snapshot capture in `checkOneLiveness` (REQ-4) behind a new `PaneSnapshotter`
  interface next to `PaneChecker`; `End(ctx, id)`, `Remove(ctx, id)`, `RecordResume(ctx,
  id, target, pane)`; `Snapshot(id)`; `EndAll(ctx)` for the kill-on-exit path;
  `OnRemoved func(id)` in `Config`.
- `internal/session/machine.go` — `KindResumeBind` handling (REQ-8).
- `internal/claudecode/interpret.go` — `KindResumeBind`; `source:"resume"` mapping.
- `internal/claudecode/launch.go` — `LaunchParams.ResumeSessionID`; emits `--resume <id>`
  (the only place the flag may appear).
- `internal/server/sessions.go` — `resume(ctx, id)` on `sessionLauncher` (shares
  `writeSettings` and the env/argv build); handlers for end/delete/resume/pane.
- `internal/server/server.go` — routes; `Start` calls `Reconcile` before `manager.Start`
  and before the listener accepts; `Shutdown(ctx, onExit)`; `sessionRemoved` broadcast
  via the hub; terminal registry `closeSession(id)`.
- `internal/server/sessionwire.go` — no Session changes; new `paneSnapshotWire`.
- `internal/server/terminal.go` — `closeSession(id)` (4001) used by End.
- `cmd/musterd/main.go` — `-on-exit` flag; TTY detection (`os.Stdin.Stat()` mode
  `ModeCharDevice`, stdlib — no new dependency); the prompt with 10 s timeout.
- `docs/protocol.md` — merged delta (on approval).

### Web
- `web/index.html` — `#mainhead`, `#dead-surface`, `#end-dialog`, `#remove-dialog`;
  card template `.acts-row`; tile template `.tfoot .acts`.
- `web/src/protocol.ts` — `SessionRemoved` message type in the `Message` union; `PaneSnapshot`.
- `web/src/api.ts` — `endSession`, `removeSession`, `resumeSession`, `fetchPane`.
- `web/src/ws.ts` — dispatch `sessionRemoved`.
- `web/src/sessions/store.ts` — `remove(id)`.
- `web/src/sessions/sort.ts` — ended-last ordering (REQ-9).
- `web/src/sessions/card.ts` — `ended` view-model bits: `ended <age>` timer, which actions.
- `web/src/sessions/format.ts` — `formatEndedAge(endedAt, now)`.
- `web/src/sessions/live.ts` — drop a removed id from the live set.
- `web/src/render/sessions.ts` — action row rendering + click wiring.
- `web/src/render/tiles.ts` — footer actions; dead tile body → dead surface.
- `web/src/render/mainhead.ts` (new) — REQ-10.
- `web/src/render/dead.ts` (new) — REQ-13 surface (pure builder + fetch trigger).
- `web/src/render/confirm.ts` (new) — REQ-14 dialogs.
- `web/src/main.ts` — wiring; focus handoff on removal; never mount a terminal for
  `alive:false`.
- `web/src/style.css` — `.mainhead`, `.acts-row`, `.card.ended`, `.endbar`, `.endcap`,
  `.snapshot.ended`, dialog variants (from the mockup CSS, minus outlines).

### E2E (authored by e2e-specs; harness helpers are its to edit)
- `web/e2e/reconcile.spec.ts` (new) — restart/sweep/shutdown-policy flows.
- `web/e2e/actions.spec.ts` (new) — End / Remove / Resume, dialogs, dead surface, tiles.
- `web/e2e/helpers/daemon.ts` — `onExit` option for the spawn (`-on-exit`), `tmuxSessions()`
  (`tmux ls -F '#{session_name}'`), `paneStartCommand(target)` (`#{pane_start_command}`
  to assert the resume argv without a real claude).
- `web/e2e/helpers/payloads.ts` — `sessionStartResume(claudeSessionId)` envelope body.

## Edge Cases

1. **Hook loss around End**: claude may or may not emit `SessionEnd` on SIGHUP; either
   way liveness (nudge) is the authority. A late `SessionEnd` for an ended session is a
   no-op death hint.
2. **`/clear` then End then Resume**: `claudeSessionId` is the *latest* id (rebind on
   clear) — that is the one to resume. Correct by construction.
3. **Resume of an id claude no longer has**: claude prints an error and exits; the pane
   dies within seconds; liveness flips `alive:false` again; the snapshot now holds the
   error text — the honest surface. No special casing.
4. **Resume when directory is gone**: 409 `directory_missing`; UI shows the API error
   under the mainhead (existing error-line pattern from launch).
5. **Remove a live session mid-turn**: End path first; if the kill fails the row stays
   and the response is 500 `end_failed` — never a deleted row with a running pane.
6. **Daemon restart mid-session**: rows reload, reconcile keeps live ones (INV-1);
   terminals reattach (m2). Sessions that ended in the previous lifetime vanish from the
   first snapshot; the UI's stale store is replaced wholesale by `snapshot` (existing).
7. **Reboot**: all rows `alive=1`, no tmux server → every row becomes ended and is kept
   (resume chance); next startup sweeps whatever wasn't resumed.
8. **Two dashboards**: End/Remove from one; the other receives `sessionUpsert` /
   `sessionRemoved` and converges — dialogs in the second window referring to the removed
   id close on `sessionRemoved`.
9. **Snapshot capture failure** (tmux transient error): logged at debug, previous snapshot
   kept; never flips liveness (a capture error is not a pane-missing signal — only
   `PaneExists` is).
10. **`ask` with a TTY but nobody watching** (e.g. `kill <pid>` from another shell): the
    10 s timeout picks *leave*; nothing is killed silently.
11. **Snapshot of a pane containing prompt text**: stored in the 0700 data dir, served
    only over the cookie-authed UI API, never logged (hard rule).
12. **`sessionRemoved` for an unknown id** (client missed the upsert): ignored.
13. **Ended session focused when the snapshot 404s**: cap shows `no snapshot captured`
    (REQ-13) — the "unknown, not empty" rule.
14. **`ended <age>` before `endedAt` is known**: cannot happen — `alive:false` is only
    ever set together with `endedAt` (existing invariant, preserved by REQ-1/3/5).

## Acceptance Criteria

IDs are unique across the whole section — `D*` daemon, `W*` web, `E*` e2e. One clause per
criterion.

### Daemon
- **D1**: `make test` passes.
- **D2**: `go build ./...` succeeds.
- **D3**: `make lint` passes.
- **D4**: no Claude-Code hook field names outside `internal/claudecode` (standing check).
- **D5**: no status-line field names outside `internal/claudecode` (standing check).
- **D6**: the `--resume` CLI flag string appears nowhere outside `internal/claudecode`.
- **D7**: `resize-pane` appears nowhere in the tree (standing m2 check).
- **D8**: the D5-guard test `TestMergeSettings_ForeignCommandHookOnSessionStartSurvives`
  exists in `internal/claudecode/settings_test.go`.
- **D9**: unit test — `Reconcile` deletes `alive=0` rows, marks `alive=1`-no-pane rows
  ended with `endedAt` set, leaves `alive=1`-pane-present rows byte-identical.
- **D10**: unit test — `Reconcile` logs (and reports) unknown `muster-*` sessions on the
  socket without inserting rows.
- **D11**: unit test — `KindResumeBind` from each of the six states yields `idle` with
  `attention == nil` and `failure == nil` (INV-6 table).
- **D12**: unit test — `KindResumeBind` with a different claude id escalates to
  clear-rebind and lands in `started`.
- **D13**: unit test — `BuildArgv` with `ResumeSessionID` emits `--resume <id>` and omits
  `--name`.
- **D14**: unit test — snapshot capture never mutates state fields (INV-4): apply a
  capture on a session in every state, assert `Clone()` equality except snapshot fields.
- **D15**: unit test — `End` on a two-session manager flips only the target's `alive`
  (INV-2).
- **D16**: unit test — `Remove` of an alive session calls the kill path before deleting;
  a failing kill leaves the row.
- **D17**: HTTP test — `POST …/end` on a dead session → 409 `not_alive`; `POST …/resume`
  on a live session → 409 `not_resumable`; on a dead session without claude id → 409
  `not_resumable`; `DELETE` unknown → 404.
- **D18**: HTTP test — `GET …/pane` → 404 `no_snapshot` before any capture, 200 with
  `text`/`capturedAt` after.
- **D19**: `-on-exit=leave` with a live session: process exits 0 and the tmux session
  still exists (Go test using a scratch socket and a `sleep` command).
- **D20**: `-on-exit=kill` with a live session: process exits 0, the tmux session is gone
  and the row reads `alive=0`.
- **D21**: `-on-exit=ask` with non-TTY stdin behaves as `leave`.
- **D22**: migration `0004_reconcile.sql` applies on top of 0003 and on a fresh DB.

### Web
- **W1**: `make web-build` succeeds.
- **W2**: `make web-test` passes.
- **W3**: no `any` types in new web code.
- **W4**: Vitest — `sortSessions` places every `alive:false` session after every live one,
  most-recently-ended first.
- **W5**: Vitest — card view-model for an ended session yields `ended <age>` timer text and
  actions `["Resume","Remove"]`; for a live one `["End"]`.
- **W6**: Vitest — `protocol.ts` parses `sessionRemoved` and rejects a malformed one.
- **W7**: Vitest — `live.ts` drops a removed id from the live set without reshuffling the
  others.
- **W8**: the dashboard never opens `/ws/terminal/{id}` for a session with `alive:false`
  (network assertion).

### E2E
- **E1**: `make e2e` passes.
- **E2**: launch a session, kill its tmux window, restart the daemon → after reconnect the
  card is ended, then remove it, restart again → card absent from the snapshot (INV-3).
- **E3**: launch, restart the daemon (default `ask`, non-TTY) → the tmux session still
  exists and the card is still live with a working terminal (survive policy).
- **E4**: launch, stop the daemon with `-on-exit=kill` → tmux session gone; on restart the
  row is swept (card absent).
- **E5**: launch A and B; End A via the mainhead → End dialog → confirm → A's card is
  ended and sorted below B; B's tmux session, pane and attached-client count unchanged
  (INV-2).
- **E6**: with A ended and focused, the dead surface shows `session ended`, an end bar
  starting `ended`, and a `pre.snapshot` whose text contains the stub's known output.
- **E7**: click Resume in the cap → `POST …/resume` 200 → the card is live again, a
  terminal surface mounts, and `#{pane_start_command}` of the new pane contains
  `--resume <claudeSessionId>`.
- **E8**: post the resume `SessionStart` envelope → badge `idle`, `attention`/`failure`
  absent.
- **E9**: Remove a *live* session from the card row → dialog copy contains "ends the
  session first" → confirm → tmux session gone and card removed; focus moves to the top
  card.
- **E10**: Cancel and Escape on both dialogs send no request (network assertion).
- **E11**: Tiles: End from a tile footer → tile stays in its slot with `stopped` marker,
  dead surface inside, footer shows Resume + Remove; other tiles' geometry unchanged.
- **E12**: Tiles: Remove a dead tile → slot backfilled per m2 rules; `sessionRemoved` seen.
- **E13**: a dead session with no snapshot (killed before the first tick — kill the window
  immediately after launch, before the poll) shows `no snapshot captured`.
- **E14**: while the daemon is down, all action buttons are disabled.
- **E15**: a card started in `needs_input` with attention, ended, then resumed: after the
  resume SessionStart the card carries no attention note (INV-6 end-to-end).

### Automated Checks

Every line is `<ID> <single-line shell command>`, run from the project root; passes iff
exit 0.

```checks
D1 make test
D2 go build ./...
D3 make lint
D4 ! rg -n "hook_event_name" cmd/ internal/ --glob '!internal/claudecode/**'
D5 ! rg -n '"rate_limits"|"used_percentage"|"context_window"|"session_name"|"total_input_tokens"' cmd/ internal/ --glob '!internal/claudecode/**'
D6 ! rg -n '"--resume"' cmd/ internal/ web/ --glob '!internal/claudecode/**' --glob '!web/e2e/**'
D7 ! rg -n "resize-pane" cmd/ internal/ web/ test/
D8 rg -q "func TestMergeSettings_ForeignCommandHookOnSessionStartSurvives" internal/claudecode/settings_test.go
D22 ls internal/store/migrations/0004_reconcile.sql
W1 make web-build
W2 make web-test
E1 make e2e
```

Grep scope notes: `D4`/`D5` include `_test.go` (as in m3/m4 — tests obtain wire bodies
from `claudecodetest`). `D6` includes Go tests and web source but excludes `web/e2e/`,
where E7 legitimately asserts the flag via `#{pane_start_command}`. Dry-run of every
negative grep against this plan file: the plan writes the flag as `` `--resume` `` (backticks,
never the double-quoted Go-literal form) and never spells the banned tmux verb outside these two lines.

### Reviewer-Verified

- **D9–D21**: the listed unit/HTTP tests exist and assert what the criterion says.
- **W3**, **W4–W8**: as stated.
- **E2–E15**: present in the specs and green in the `make e2e` run.
- **R1**: `internal/session` stores capture text and never inspects it (INV-4) — read the
  diff.
- **R2**: manual check with a real `claude --model claude-haiku-4-5-20251001` ("say hi"):
  End from the dashboard kills it; Resume brings the conversation back with the same
  `session_id` in the enveloped `SessionStart`; badge reads `idle`; kill the session
  afterwards. Record the outcome (same-id or not) in `spikes/canary-fields.md`.
- **R3**: snapshot text appears in no log line at any level.
- **R4**: doc upkeep — TODO ticks for the four M4 entries this plan covers, SPEC §11
  changelog entry (shutdown policy, startup sweep, snapshot in, placement C, resume →
  idle fix), protocol §3.4/§3.5/§5.5/§7.5/§8/§9 updated.

## Implementation Notes

- **Order in `Server.Start`**: `LoadAll` → `Reconcile` → `manager.Start()` → `ingest.Start()`;
  `main.go` must not call `ListenAndServe` until `Start` returns. Reconcile's pane checks
  are the same `PaneExists` the poll uses.
- **Snapshot in the poll**: capture *before* `PaneExists`' dead-flip decision is acted on
  is pointless (the pane is gone); capture for panes that exist, on every tick. On End,
  capture then kill so the final screen is exact.
- **`capture-pane -p`** without `-e`: plain text; ANSI colours are a follow-up if wanted.
  Trim trailing blank lines so `pre.snapshot` doesn't scroll into emptiness.
- **`KindResumeBind`** lives in `internal/claudecode` (the `source` string is Claude-Code
  format). The machine's `applyBind` escalation (different id → clear-rebind) runs first,
  as today; only a same-id resume bind sets `idle`.
- **`-on-exit`** is parsed in `main.go`; the prompt reads stdin in a goroutine racing a
  10 s timer; the answer selects between `manager.EndAll` and nothing. Both paths then run
  the existing `Shutdown`.
- **Terminal close on End**: `terminalRegistry.closeSession(id)` sends `4001` to the live
  client before the kill so the UI's overlay arrives ahead of the `alive:false` upsert.
- **UI action wiring**: one `actions.ts`-style dispatcher in `main.ts` (`end(id)`,
  `remove(id)`, `resume(id)`) called from mainhead, card, tile, strip and cap; the dialogs
  are opened by `end`/`remove` and call the API on confirm. Buttons carry `data-action`
  and `data-id`; a single delegated listener per container.
- **Dead surface fetch**: on focus/tile mount of an `alive:false` session, `fetchPane(id)`;
  re-fetch when a `sessionUpsert` flips alive → false (the snapshot may have been
  finalised by End).
- **Mockup fidelity**: transcribe text from `opt-c-both.html` / `tiles-dead.html`
  (`session ended`, `ended 6m ago · last state failed · …`, dialog headings) — do not
  compose new strings.
- Measured Claude Code facts relied on: `SessionStart.source` values `startup|resume|clear`
  (`spikes/canary-fields.md`); `--resume` same-id (H2, headless — R2 re-verifies
  interactively).
