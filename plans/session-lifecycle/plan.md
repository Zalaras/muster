# Plan: Session lifecycle robustness

**Created**: 2026-09-14
**Status**: approved
**Work Type**: full-stack (daemon-heavy; the web slice is REQ-17 only)
**E2E Scope**: extend-specs (launch.spec.ts, reconcile.spec.ts, actions.spec.ts)
**Fixture plan**: per-test `daemon` fixture throughout — every scenario restarts its own daemon or
plants a foreign tmux session on its own socket, so none may share the file-scoped `fileDaemon()`.
**Features**: lifecycle, actions, launch, surfaces, ingest
**Description**: Make new / resume / end / remove survive any order of events, restarts and
failures: session ids stop being recycled, spawning never dead-ends on a taken tmux name, reconcile
converges rows with the socket instead of drifting from it, and every action is idempotent, atomic
and visible when it fails. Closes #26.

## Overview

Issue [#26](https://github.com/Zalaras/muster/issues/26) reports that **every** launch fails with
`spawning tmux session: tmux new-session: exit status 1: duplicate session: muster-1` while the
dashboard shows 0 sessions. It reproduces from code reading, and it is permanent rather than
flaky. It is also a *symptom*: the investigation (2026-09-14) found three root causes running
under the whole session lifecycle, and about twenty defects falling out of them. Several are worse
than the reported one.

**R1 — identity is a recyclable integer.** `session.id` is `INTEGER PRIMARY KEY` without
`AUTOINCREMENT` (`internal/store/migrations/0002_sessions.sql:19`), so SQLite reissues an id once
the highest row is deleted — and rows are hard-deleted by launch rollback
(`internal/server/sessions.go:238`), `Remove` (`internal/session/manager.go:833`) and reconcile's
sweep (`:297`). Every tmux name (`muster-<id>`, `muster-<id>-shell`) and the ingest bearer
credential `MUSTER_SESSION=<id>` (`internal/server/sessions.go:149`) derive from that integer.

**R2 — `tmux_target` is the identity of record but is write-once and never verified.** It is set
only by `RecordLaunch` (`manager.go:214`) and `RecordResume` (`:854`), never repaired, and the
empty placeholder `InsertSession` writes (`internal/store/session.go:101`) is read with **four
different meanings**: reconcile reads `""` as death (`PaneExists("")` → `(false, nil)`,
`internal/tmux/tmux.go:224`), the liveness poll reads it as "not launched yet" and skips forever
(`manager.go:998`), `Nudge` skips it (`:1023`), and the unknown-session sweep reads it as "owns no
tmux session" (`:376-379`). Every subsequent hook re-persists the placeholder (`:509`).

**R3 — tmux is consulted to report, never to decide.** `ListSessions` is called once at startup
(`manager.go:368`) and its result is used only to kill shells and print warnings.
`classifySessions` decides purely from the DB, and `!r.alive` short-circuits *before* any pane
check (`:337`), so an ended row is deleted without ever asking whether its pane is still running.

**R4 — failure handling is neither atomic nor idempotent.** Destructive side effects run before
validation (`sessions.go:406`, `:439-440`); memory is mutated before the persist with no rollback
(`:214-220`, `:854-864`, `:1070-1077`); `KillSession` has no "already gone" tolerance
(`tmux.go:251-256`) unlike `PaneExists` (`:231-235`) and `ListSessions` (`:265-268`); and no
per-session lock serialises the actions.

### What this costs today

- **Launch wedges permanently.** Any orphaned `muster-N` plus a freed id N means every
  `POST /api/sessions` 500s, and the rollback re-frees the id so the next attempt fails
  identically. Escape needs `tmux -L muster kill-session` at a terminal. This is #26.
- **Silent cross-session hijack.** `resolveSessionID` (`internal/server/ingest.go:203`) trusts an
  envelope's `musterSession` on bare map membership (`manager.go:420-425`) — no pane, no
  `created_at`, no generation check. The `tmux_pane` column exists and is labelled "envelope
  corroboration" (`0002_sessions.sql:24`) but is compared nowhere. An orphaned pane keeps posting
  `MUSTER_SESSION=1`; once a new session takes id 1, `sess.ClaudeSessionID == ""` so the old
  conversation binds to and drives the new session — state, permission latch, context gauge,
  compactions, transcript, plan, title, model.
- **`tmux new-session` can succeed and still return an error.** Both the field-count branch
  (`tmux.go:132-135`) and the `applyServerOptions` branch (`:139-143`) return after the session
  exists, killing nothing. Every caller treats the error as "nothing happened" and rolls the row
  back — manufacturing exactly the orphan that wedges launch.
- **End 500s on the ordinary race.** The pane dies, the user clicks End inside the ~5 s poll
  window, `tmux kill-session` exits non-zero, End returns 500 `end_failed` — and the terminal
  socket was already closed before validation, so the user sees a dead surface over an error the
  dashboard never renders (`web/src/features/actions.ts:107-140` only `console.error`s).
- **Sessions are deleted while still running.** An `alive=0` row whose pane is live is swept
  without a pane check, and a SIGKILL between a resume's spawn (`sessions.go:274`) and its persist
  (`:279`) gets the row deleted on the very next start while the resumed `claude` runs on.
- **A tmux server blip reads as mass extinction.** `list-panes` exiting non-zero is classified
  "not there" (`tmux.go:231-235`), so one bad tick can flip every session dead at once
  (`manager.go:1043`), with `endedAt` stamped and broadcast.

### Scope boundary

Nothing here adopts or kills an unknown `muster-N`: `kb:adr/lifecycle-reconcile-before-first-snapshot`
stands, and the two tests pinning it (`internal/session/manager_test.go:895`,
`web/e2e/reconcile.spec.ts:150`) must stay green. An orphan is made **harmless**, not killed.

Phase 1 (REQ-1 … REQ-10) closes #26 and the state-divergence class. Phase 2 (REQ-11 … REQ-17)
makes the actions atomic, idempotent and honest. One branch: the changes concentrate in the same
five files, so splitting would conflict rather than isolate.

## Requirements

### Must Have — Phase 1: identity, spawning, convergence

- [ ] **REQ-1**: `InsertSessionParams` gains `MinID int64` (0 = no floor). `InsertSession` runs in
      one `sql.Tx`: `id = max(COALESCE(MAX(id),0), watermark, MinID) + 1`, inserted with an
      **explicit** `id` column, then the watermark persisted. The watermark is the existing `kv`
      table under key `session.id_watermark` (`internal/store/store.go:71-91` shows the shape) —
      **no migration**, hand-written SQL per `kb:adr/stack-db-database-sql-hand-sql`.
- [ ] **REQ-2**: A session id is never reissued within a data dir, including after the highest row
      is deleted by launch rollback, `Remove` or reconcile's sweep.
- [ ] **REQ-3**: `internal/tmux` gains `ParseSessionName(name) (id int64, ok bool)` — the bare
      `muster-<N>` mirror of the existing `IsShellSessionName` (`tmux.go:158-176`) — and
      `MaxSessionID(ctx) (int64, error)`, the max over one `ListSessions` of both name shapes.
      `MaxSessionID` returns `(0, nil)` when no tmux server is running, matching `ListSessions`.
- [ ] **REQ-4**: `internal/tmux` gains `ErrSessionExists`. `NewNamedSession` wraps a tmux stderr
      carrying `duplicate session:` as `%w` of it. The stderr match lives here, beside
      `shellSessionSuffix`, which the file already calls the one place the convention is spelled
      out — it must not leak into `internal/server` or `internal/session`.
- [ ] **REQ-5**: `NewNamedSession` never leaks a session it created. Both post-`new-session`
      failure branches (`tmux.go:132-135` unexpected output, `:139-143` `applyServerOptions`) kill
      the session by name before returning. A kill failure there is logged and the original error
      still returned.
- [ ] **REQ-6**: `Client.KillSession` treats a session that is **already gone** as success. Any
      other failure (tmux missing, socket unreadable, context deadline) still returns an error.

      **Corrected 2026-09-14** (found by `e2e-specs` while tracing E6): this REQ first said "an
      `*exec.ExitError`, the same shape `PaneExists` and `ListSessions` already special-case", and
      that was implemented literally. It is too loose — `kill-session` also exits non-zero for
      reasons unrelated to the session existing (a socket tmux cannot reach), so treating every
      `ExitError` as success would let `Remove` delete a row whose pane is still running, which is
      the exact orphan this plan exists to prevent. The `ExitError` must be **verified** against
      `PaneExists`: gone is success; still-there returns the original error; a check that itself
      fails returns it too.

      **Corrected again 2026-09-14** (review cycle 1, Critical 1 — measured repro in `review.md`):
      that was still wrong, because `PaneExists` itself collapsed **every** `*exec.ExitError` to
      `(false, nil)`, so "not there" and "I could not ask" were the same value and the verification
      verified nothing. The fix belongs in `PaneExists`, not `KillSession` — this is the same bug
      class the plan exists to remove (`tmux_target`'s empty string meaning four different things).
      `PaneExists` now returns an **error** when tmux reports `error connecting to <socket>` with
      either `(Permission denied)` (EACCES) or `(Operation not permitted)` (EPERM): the socket
      exists, a server may be live behind it, and we cannot ask. Both errnos are required —
      review cycle 2 measured EPERM under `sandbox-exec` with the server alive throughout, and a
      macOS-only tool running under Claude Code meets it through sandbox profiles and MDM.
      `ListSessions` makes the same distinction, and it matters more there than anywhere else:
      it feeds `Reconcile`, the only path that deletes rows, so an empty snapshot from an
      unreachable socket would mark every alive row ended and sweep every dead one while their
      panes ran. When `Reconcile` cannot enumerate the socket it now acts on **nothing** — it
      must not fall through to `classifySessions`, whose unconditional `!alive` sweep performs no
      pane check and is the original bug reached from a new direction.
      Every other non-zero exit stays `(false, nil)`, which is correct and load-bearing — `No such
      file or directory` means no socket, therefore no server, therefore the session genuinely is
      gone, and a broad `error connecting to` match breaks six previously-green tests for exactly
      that reason.

      The earlier "no stderr matching" absolute was mine and was wrong: `internal/tmux` already
      matches `duplicate session:` for `ErrSessionExists`. The defensible rule is narrower — never
      match on *absence* wording, because a wording change would then break ordinary End; match
      connection-failure wording only, and only ever to **escalate** to an error, so a wording
      change degrades to the old behaviour rather than breaking anything.
- [ ] **REQ-7**: `sessionLauncher.Launch` probes `MaxSessionID` before `CreateSession` and passes
      it as `MinID`. A probe error is warn-logged and degrades to floor 0 — it never fails a
      launch. Create→spawn is then wrapped in a bounded **3-attempt** loop: on
      `errors.Is(err, tmux.ErrSessionExists)` it rolls back as today, raises the floor above the
      colliding id and retries. Exhausting the attempts returns `500 launch_failed` naming the
      tmux session and the manual escape.
- [ ] **REQ-8**: `sessionLauncher.Resume` cannot renumber (the id is the row's). On
      `ErrSessionExists` it runs REQ-9's single-row repair for that id and returns the repaired
      session with `200`, because a live `muster-<id>` under a not-alive row **is** that row's
      pane. If the repair finds no live pane, it returns `500 launch_failed` with a message naming
      the tmux session — never raw tmux stderr.
- [ ] **REQ-9**: `Manager.Reconcile` classifies from **one** `ListSessions` snapshot by name
      ownership, not by the stored target:
      - `muster-<id>` present on the socket → the row owns it: re-derive `tmux_target` and
        `tmux_pane` from tmux, persist if changed, `alive := true`, broadcast on change.
      - `muster-<id>` absent → `alive=1` → mark ended and keep (unchanged); `alive=0` → sweep
        (unchanged).
      - `muster-<N>` with no row → reported in `UnknownSessions` and warn-logged **exactly as
        today; never adopted, never killed** — plus the id watermark raised above `N`.
      - `muster-<N>-shell` → killed unconditionally (unchanged), and its `N` also raises the
        watermark.
- [ ] **REQ-10**: Reconcile no longer aborts on the first `markEnded`/`DeleteSession` error
      (`manager.go:291`, `:298`): each failure is logged and the run continues, so the shell sweep
      always happens.

### Must Have — Phase 2: atomicity, idempotency, honesty

- [ ] **REQ-11**: `Manager` gains a per-session-id keyed lock held across Launch, Resume, End and
      Remove for that id, so the check-then-act in each is serialised. Different ids never block
      each other.
- [ ] **REQ-12**: `shellRegistry`'s single global mutex (`shells.go:31-33`) becomes per-id, and
      `Ensure` tolerates `ErrSessionExists` by re-checking and returning `created:false` rather
      than `500 shell_spawn_failed`. Every tmux invocation the shell and terminal paths make is
      bounded by a timeout so a wedged tmux cannot hang End/Remove.
- [ ] **REQ-13**: No destructive side effect runs before the action is known to proceed.
      `handleEndSession` closes the terminal socket only after `End` has passed its
      unknown/not-alive gates; `handleRemoveSession` kills the shell only after `manager.Remove`
      has **succeeded**. A failed End or Remove leaves terminal sockets and the shell as they were.
- [ ] **REQ-14**: `RecordLaunch`, `RecordResume` and `markEnded` roll their in-memory mutation back
      when `UpdateSession` fails, so memory and the DB never disagree. `Remove` deletes the row
      before dropping the in-memory entry, and broadcasts `sessionRemoved` only on success.
- [ ] **REQ-15**: `Remove` on a not-alive row still issues an idempotent `KillSession` for
      `muster-<id>` before deleting, so Remove can never leave an orphan behind.
- [ ] **REQ-16**: Before believing a pane is gone, `checkOneLiveness` confirms the tmux server is
      reachable (`ListSessions` succeeding). A server-level failure is a transient error that
      leaves sessions as-is, never N simultaneous deaths.
- [ ] **REQ-17**: The dashboard renders End / Resume / Remove failures instead of only
      `console.error` (`web/src/features/actions.ts:107-140`); `not_resumable`'s conflated message
      (`sessions.go:255`) splits into its two causes; a disabled Resume control **says why**; and
      `muster.reader.<id>` localStorage is cleared on `sessionRemoved`.

      **Correction, 2026-09-14** (found by `web-tests` while authoring W3): an earlier draft of
      this REQ said Resume is still offered on a session with no `claudeSessionId`. It is not —
      `resumeBtn.disabled = … || session.claudeSessionId === null` already exists in both
      `web/src/render/mainhead.ts:103` and `web/src/render/dead.ts:116`, and pre-dates this plan.
      What is genuinely missing is the *reason*: the user sees a greyed button and is told nothing.
      REQ-17 covers only the reason.

      **Placement, settled 2026-09-14.** The action-error region is static markup in
      `web/index.html` immediately after `#banner` (line 50) — `<p id="action-error" role="alert"
      hidden>` — because actions dispatch from the mainhead, rail cards *and* tile footers, so a
      region scoped to any one surface would silently swallow failures from the others. A pure
      `renderActionError(el: HTMLElement, message: string | null)` in
      `web/src/render/actionerror.ts` toggles it, mirroring `renderBanner(el, visible)`
      (`web/src/render/banner.ts`) — the codebase's existing single-element `role="alert"` pattern,
      and the one shape Vitest can cover, since `vitest.config.ts` restricts the suite to logic and
      no jsdom is installed. No new colour tokens: reuse the banner/danger token family.

### Out of scope (deliberate — `TODO.md` entries, not this plan)

- **Ingest pane corroboration** (`event.tmux_pane` vs `session.tmux_pane`). REQ-2 closes the severe
  case; the residual window is a pre-resume straggler on the same row, which is benign. The e2e
  fixtures hardcode `musterSession: 1` (`web/e2e/helpers/payloads.ts:84-108`), so the blast radius
  is large enough to deserve its own plan.
- **Adopting or killing an unknown `muster-N`** — policy stands.
- **Deleting orphaned `event` rows** — the audit trail is deliberate (`kb:anchor/sessions.remove`);
  REQ-2 stops re-attachment.
- **`-on-exit=kill` leaving shells running**, and raw tmux stderr echoed into HTTP error bodies.

## Protocol Contract

The wire **shapes** are unchanged; three error clauses and the reconcile rules change meaning.

### `kb:anchor/sessions.end` — `POST /api/sessions/{id}/end`

- **Was**: errors `404 unknown_session`; `409 not_alive`. A kill that tmux refused surfaced as an
  undocumented `500 end_failed`.
- **Now**: a tmux session that is **already gone** is success — `200` + the Session object with
  `alive:false`, `endedAt` set, exactly as a normal End. `500 end_failed` is reserved for a
  genuine kill failure (tmux unreachable, socket unreadable, deadline). `404`/`409` unchanged.

### `kb:anchor/sessions.remove` — `DELETE /api/sessions/{id}`

- **Was**: `500 end_failed` (alive and the kill failed — the row is not deleted). The shell and
  both terminal sockets were already destroyed by then.
- **Now**: unchanged status codes, with the added guarantee that a `500` leaves the shell running
  and the sockets open — Remove is retryable without collateral loss.

### `kb:anchor/sessions.resume` — `POST /api/sessions/{id}/resume`

- **Was**: `500 launch_failed` carrying raw tmux stderr when `muster-<id>` already existed, forever.
- **Now**: a live `muster-<id>` under a not-alive row is repaired and returned `200` (REQ-8).
  `500 launch_failed` never carries raw tmux stderr for this case. `409 not_resumable` splits its
  message into the alive case and the no-`claudeSessionId` case (the code stays `not_resumable`;
  only the human message differs, so the UI can say which).

### `kb:anchor/state.liveness` — reconcile rules

- **Was**: `alive=0` → the row is deleted. `alive=1`, pane exists → unchanged. `alive=1`, pane gone
  → marked ended and kept.
- **Now**: ownership is decided by `muster-<id>` on the socket. A row whose `muster-<id>` is
  **live** is kept alive and has its `tmux_target`/`tmux_pane` repaired from tmux, whatever the
  stored `alive` said — so a row is never deleted while its pane is running. A row whose
  `muster-<id>` is absent follows the old rules exactly. Unknown `muster-<n>` are still logged and
  never adopted; `muster-<n>-shell` are still killed unconditionally.

## Schema Changes

**None.** REQ-1's watermark uses the existing `kv` table (`0001_init.sql`) via a new key,
`session.id_watermark`, holding the highest id ever allocated as a decimal string. No migration is
added; `internal/store/migrations/` is untouched.

The watermark is seeded lazily: absent key → treated as 0, and `MAX(id)` in the same transaction
covers every pre-existing row, so an existing database upgrades without a backfill step.

## UI Specifications

Only REQ-17 touches the dashboard.

- **Action error surface.** End / Resume / Remove failures render a visible message rather than a
  console line, through `renderActionError(el, message)` over `#action-error` — see REQ-17's
  Placement note for why it is global markup after `#banner` and not scoped to one surface.
  `null` clears it; the next successful action clears it. No new colour tokens; use the existing
  danger token family (`kb:adr/theme-danger-tokens-not-rose`).
- **Resume affordance.** The control is already disabled when `claudeSessionId` is null
  (`web/src/render/mainhead.ts:103`, `web/src/render/dead.ts:116`). What this plan adds is the
  reason, as `title`/`aria-description`, on both surfaces — a greyed control that explains nothing
  is why the state reads as a bug.
- **Reader memory.** `handleRemoved` (`web/src/features/actions.ts:139`) clears
  `muster.reader.<id>` through a new exported helper in `web/src/reader/memory.ts`; the removal
  must survive a `localStorage` accessor that throws (private window, blocked site data).

## Affected Files

| File | Change |
|---|---|
| `internal/tmux/tmux.go` | REQ-3 `ParseSessionName`/`MaxSessionID`; REQ-4 `ErrSessionExists`; REQ-5 no-leak on post-create failure; REQ-6 idempotent `KillSession` |
| `internal/store/session.go` | REQ-1 `MinID` + transactional, explicit-id `InsertSession` + watermark write-back |
| `internal/store/store.go` | REQ-1 tx-scoped kv read/write helper if `KVGet`/`KVSet` cannot be reused inside a `sql.Tx` |
| `internal/session/manager.go` | REQ-9/REQ-10 reconcile rewrite; REQ-11 keyed lock; REQ-14 rollback on persist failure + `Remove` ordering; REQ-15 idempotent kill on a dead row; REQ-16 server-reachability guard; `CreateParams.MinID` passthrough |
| `internal/server/sessions.go` | REQ-7 probe + retry loop; REQ-8 resume repair; REQ-13 handler ordering; `paneSpawner` gains `MaxSessionID`; atomic `writeSettings` (temp + `os.Rename`) |
| `internal/server/shells.go` | REQ-12 per-id lock, `ErrSessionExists` tolerance, bounded contexts |
| `web/src/features/actions.ts` | REQ-17 error surface + reader-memory clear |
| `web/src/features/focus.ts`, `web/src/render/dead*.ts` | REQ-17 Resume affordance |
| `web/src/reader/memory.ts` | REQ-17 `forget(id)` helper |
| `docs/protocol.md` | the four anchor deltas above |
| `docs/adr/*.md` | four new `proposed` ADRs (Implementation Notes) |
| `TODO.md` → `docs/history/todo-done.md` | tick #26; add the out-of-scope items |

`internal/server/fakes_test.go`'s `fakeTmux` needs `MaxSessionID` to keep satisfying `paneSpawner`
— a test-agent change, not an impl-agent one.

## Edge Cases

1. **Orphan `muster-1` on the socket, empty database** (the #26 report) — floor probe returns 1,
   the row gets id 2, launch succeeds, the orphan is untouched. → **D3**, **E1**
2. **Orphan appears between the probe and the spawn** (concurrent launch, second daemon on the
   socket) — `ErrSessionExists` → floor raised → retry succeeds. → **D4**
3. **Three collisions in a row** — attempts exhausted, `500 launch_failed` naming the session and
   the manual escape. Not a silent hang. → **D5**
4. **`tmux new-session` succeeds then `applyServerOptions` fails** — the session is killed before
   the error returns; no orphan, row rolled back. → **D6**
5. **SIGKILL between `NewSession` and `RecordLaunch`** — row keeps the `''` placeholder while
   `muster-<id>` runs. Next start: REQ-9 sees the name live, repairs the target, keeps it alive.
   The card comes back attachable instead of becoming an unadoptable orphan. → **D8**, **E3**
6. **SIGKILL between a resume's spawn and its persist** — row is `alive=0` with the *old* target
   while a new pane runs. REQ-9 repairs and revives rather than deleting the row on the next start.
   → **D9**
7. **`alive=0` row whose pane is live because an earlier `KillSession` silently failed** — revived
   by REQ-9, not swept. → **D9**
8. **Row alive, `muster-<id>` live under a different window id** — target repaired; Resume no
   longer 500s with `duplicate session`. → **D10**
9. **Pane dies 1 s before the user clicks End** — `KillSession` finds nothing, REQ-6 calls that
   success, End returns `200` with `alive:false`. → **D12**, **E5**
10. **A genuine kill failure** (tmux unreachable) — still `500 end_failed`, and Remove still leaves
    the row. `TestRemove_EndsAnAliveSessionFirstAndLeavesTheRowOnAFailingKill` must stay green.
    → **D13**
11. **Remove fails after the shell was killed** — cannot happen post-REQ-13: the shell kill moves
    after success. A failed Remove leaves the shell running. → **D15**, **E6**
12. **Two concurrent Ends on one session** — REQ-11 serialises; the loser gets `409 not_alive`,
    never `500`. → **D14**
13. **Two concurrent Resumes** — serialised; the loser observes the now-alive row and gets
    `409 not_resumable`. → **D14**
14. **`UpdateSession` fails inside `markEnded`** — memory rolls back, so the poll re-checks the
    session next tick instead of silently forking from the DB. → **D16**
15. **tmux server dies under a running daemon** — `ListSessions` fails, REQ-16 treats it as
    transient; sessions stay alive and are re-checked, rather than all flipping dead in one tick.
    → **D17**
16. **No tmux server at all at launch** — `MaxSessionID` returns `(0, nil)`; floor 0; normal
    allocation. → **D2**
17. **`MaxSessionID` errors** (tmux unreadable) — warn-logged, floor 0, launch proceeds; the
    watermark alone still prevents reuse. → **D2**
18. **Pre-existing database with rows 1..7** — first `InsertSession` reads `MAX(id)=7`, allocates
    8, seeds the watermark. No backfill. → **D1**
19. **Session removed, then its id would have been next** — watermark already past it; the new
    session gets a fresh id, so no `event`-row re-attachment through `EventSummary` and no stale
    `muster-<id>-shell` adoption. → **D7**
20. **Resume on a session that never bound a `claudeSessionId`** — still `409 not_resumable`, but
    with a message naming that cause, and the UI no longer offers the button. → **W3**, **E7**
21. **`localStorage` throws on the reader-memory clear** — swallowed; removal still completes.
    → **W4**
22. **Unknown `muster-99999-foreign` on the socket across a restart** — still present afterwards,
    still no row, still warn-logged. `web/e2e/reconcile.spec.ts:150` unchanged. → **E2**

## Acceptance Criteria

IDs unique across the section — `D*` daemon, `W*` web, `E*` e2e. **Every `D*` below is written and
proven RED before any implementation exists** (see Implementation Notes § Red-first).

### Daemon

- **D1**: `InsertSession` on a store seeded with ids 1..7 allocates 8 and writes
  `kv['session.id_watermark'] = 8`.
- **D2**: `MaxSessionID` returns `(0, nil)` with no tmux server; a `ListSessions` error is
  warn-logged by the launcher and the launch still succeeds with floor 0.
- **D3**: `TestLauncher_OrphanedTmuxSessionDoesNotBlockLaunch` — real tmux on a private socket,
  `muster-1` pre-created, fresh store: `POST /api/sessions` returns `201` with id >= 2, and
  `muster-1` is still listed on the socket afterwards. **This is the #26 reproducer.**
- **D4**: a `fakeTmux` returning `ErrSessionExists` once causes exactly one retry and a successful
  launch; the retry's id is strictly greater than the first attempt's.
- **D5**: a `fakeTmux` returning `ErrSessionExists` always returns `500 launch_failed` after 3
  attempts, with a message naming the tmux session.
- **D6**: `NewNamedSession` whose `applyServerOptions` fails leaves **no** session of that name on
  a real socket, and returns the original error. Oracle: `internal/tmux/tmux_test.go` is in-package,
  and `serverOptions` (`tmux.go:89`) is a package-level `var` — swap it for a bogus option under a
  `t.Cleanup`, then call `NewNamedSession` on a **fresh** socket (the branch only runs when
  `freshServer` is true). The test mutates package state, so it must not be parallel with the
  fresh-server option tests at `tmux_test.go:321`/`:356`.
- **D7**: after `Remove` of the highest-id session, the next `InsertSession` id is strictly greater
  than the removed one.
- **D8**: `Reconcile` over a row with `tmux_target = ''` whose `muster-<id>` is live on the socket
  leaves it `alive=1` and rewrites `tmux_target` to a target whose pane exists.
- **D9**: `Reconcile` over an `alive=0` row whose `muster-<id>` is live leaves the row present and
  `alive=1` — it is **not** deleted.
- **D10**: `Reconcile` over an `alive=1` row whose stored target names a stale window, while
  `muster-<id>` is live, repairs the target rather than marking it ended.
- **D11**: `Reconcile` still reports an unknown `muster-<n>` in `UnknownSessions`, still warn-logs
  it, and still does not kill it — `manager_test.go:895` passes unamended. Shell sessions are still
  killed unconditionally.
- **D12**: `End` on a session whose tmux session is already gone returns the Session with
  `alive:false` and **no error**.
- **D13**: `End` whose `KillSession` fails for a non-"already gone" reason still returns an error,
  and `Remove` still leaves the row — `manager_test.go:1422` passes unamended.
- **D14**: two concurrent `End` calls on one session produce exactly one `markEnded` persist, one
  broadcast, and at most one `ErrSessionNotAlive`; neither returns a kill error.
- **D15**: a `Remove` whose `End` fails leaves the shell tmux session running and the row present.
- **D16**: an `UpdateSession` error inside `markEnded` leaves the in-memory session `Alive == true`
  (matching the DB), and the next poll re-checks it.
- **D17**: with `ListSessions` failing, a `PaneExists`-false tick does **not** mark sessions ended.
- **D18**: `make check` passes (lint + unit + `refs` + `check-kb`).
- **D19**: two concurrent `Resume` calls on one session attempt exactly **one** spawn. This is
  REQ-11's driver: D14 turned out to hold without the lock (idempotent kill alone makes concurrent
  Ends converge), so without D19 the per-session lock would ship unverified. Resume is the case
  that genuinely needs it — both callers pass the `Alive == false` gate, which `RecordResume` only
  flips much later, and post-REQ-8 the loser's `ErrSessionExists` is repaired into a `200`, so the
  doubled spawn is invisible in the status codes. Assert the spawn count, not the status.

### Web

- **W1**: `make web-test` passes.
- **W2**: a failed End / Resume / Remove writes the envelope's `message` into a `role="alert"`
  element; a subsequent successful action clears it.
- **W3**: a session with `claudeSessionId: null` renders its Resume control disabled **with a
  stated reason** (`title` or `aria-description`); one with a bound id renders it enabled and
  carries no reason. The `disabled` half already passes — it pre-dates this plan (see REQ-17's
  correction); only the reason is red.
- **W4**: `forget(id)` removes `muster.reader.<id>` and is a no-op (not a throw) when the
  `localStorage` accessor throws.

### E2E

- **E1**: with `createForeignTmuxSession("muster-1")` on a fresh per-test daemon, launching from
  the dashboard produces a session card, never shows `#launch-error`, and `daemon.tmuxSessions()`
  still contains `muster-1`.
- **E2**: `web/e2e/reconcile.spec.ts:150` passes unamended (foreign session still present after a
  restart, no row created).
- **E3**: a session whose daemon is restarted while its pane stays alive comes back **alive** and
  attachable, with a repaired target.
- **E4**: a session whose pane is killed while the daemon is down comes back **dead** with its
  snapshot, and is swept on the following restart — `reconcile.spec.ts:22` unchanged in intent.
- **E5**: killing a pane via `daemon.killTmuxWindow()` and clicking End before the poll notices
  shows no error and the card goes dead.
- **E6**: a failed Remove leaves the shell pip present.
- **E7**: a session with no bound Claude id shows a disabled Resume control.
- **E8**: `make e2e` passes.

## Automated Checks

Review cycle 1 Minor 4: this block was missing. Every `D*`/`W*`/`E*` that is mechanically
checkable, in one runnable list.

```checks
D18 make check
D1 go test ./internal/store -run 'TestInsertSession' -count=1
D2 go test ./internal/tmux -run 'TestMaxSessionID' -count=1
D3 go test ./internal/server -run 'TestHandleCreateSession_OrphanedTmuxSessionDoesNotBlockLaunch' -count=1
D6 go test ./internal/tmux -run 'TestNewNamedSession_ApplyServerOptionsFailureLeavesNoSession' -count=1
D7 go test ./internal/session -run 'TestCreateSession_AfterRemovingTheHighestID' -count=1
D8 go test ./internal/session -run 'TestReconcile_' -count=1
D12 go test ./internal/session -run 'TestEnd_AlreadyGoneTmuxSessionIsSuccessNotError' -count=1
D19 go test ./internal/server -run 'TestLauncher_ConcurrentResumesSpawnExactlyOnce' -count=20 -race
D20 go test ./internal/tmux -run 'TestKillSession_UnreachableSocket' -count=1
D24 go test ./internal/tmux -run 'TestIsConnectionFailure' -count=1
D25 go test ./internal/tmux -run 'TestListSessions_UnreachableSocket' -count=1
D26 go test ./internal/session -run 'TestReconcile_ListSessionsFailureActsOnNothing' -count=1
D-boundary ! git diff 33d482a..b4f2255 --name-only | rg '_test\.go$'
D-tmuxleak ! rg -n '"muster-" ?\+' internal/server internal/session --glob '!**/*_test.go'
W1 make web-test
W-build make web-build
W-lint make web-lint
E8 make e2e
E-lint bash web/scripts/e2e-lint.sh
```

`D-boundary` is the red-first guarantee itself: the Phase 1 implementation commit must touch no
test file. `D-tmuxleak` guards the naming convention staying inside `internal/tmux` — review cycle
1 Minor 2 found two literals that had escaped into `internal/server`.

## Implementation Notes

### Red-first (explicit instruction from Damian, 2026-09-14)

This run inverts `/orchestrate`'s default impl-then-tests order. `daemon-tests` authors **every
`D*` above first**, runs them against the unmodified tree, and pastes the failing output into
`plans/session-lifecycle/daemon-tests.md` before `daemon-impl` writes a line. The pipeline
boundary still holds: impl agents never edit tests, test agents never edit implementation.

Existing fixtures to reuse rather than rebuild: `internal/tmux/tmuxtest.Socket(t)` (per-test
socket under `os.MkdirTemp`, kill-server on cleanup), `internal/tmux/tmux_test.go`'s `nextID(t)`
(random ids so concurrent tests never collide), `internal/session/manager_test.go`'s
`openTestStore` / `fakePaneChecker` / `fakeKiller` / `newTestManager`,
`internal/server/sessions_test.go`'s `newTestTmuxClient` + `sharedStubClaude`, and
`internal/server/fakes_test.go`'s `fakeTmux` (which already carries `newSessionErr` /
`newNamedSessionErr` injection and call counters). E2E reuses `daemon.createForeignTmuxSession`,
`daemon.tmuxSessions`, `daemon.killTmuxWindow` and `daemon.restart` from
`web/e2e/helpers/daemon.ts`.

**No test may launch a real `claude`** — the suites use the stub script and `sharedStubClaude`.

### Decisions this plan makes (ADRs, `status: proposed`, `refs: [plan:session-lifecycle]`)

1. **`kb:adr/lifecycle-session-ids-monotonic-never-reused`** — session ids are allocated
   monotonically from a `kv` watermark and floored above every `muster-<N>` on the socket; they are
   never reissued. States why: the id is simultaneously the tmux session name and the ingest bearer
   credential `MUSTER_SESSION`, so reuse is a correctness bug, not just a collision. Records the
   rejected alternatives — `AUTOINCREMENT` alone (a fresh or moved data dir still starts at 1
   against a live socket) and a `tmux_name` column (needless plumbing through End/EndAll/reconcile
   and the shell naming). Tags: `store`, `lifecycle`.
2. **`kb:adr/lifecycle-reconcile-converges-with-the-socket`** —
   `supersedes: kb:adr/lifecycle-ended-rows-swept-next-start`. Restates the sweep rule with a
   pane-confirmation clause: reconcile decides ownership from `tmux list-sessions`, repairs
   `tmux_target` from tmux, and never deletes a row whose pane is live. Explicitly keeps
   `kb:adr/lifecycle-reconcile-before-first-snapshot`'s never-adopt policy intact. Justified by
   `kb:adr/lifecycle-liveness-from-pane-existence` — "alive is decided by pane existence alone" —
   which today's sweep contradicts by never asking. Tags: `lifecycle`, `tmux`.
3. **`kb:adr/actions-kill-is-idempotent`** — a tmux session that is already gone is a successful
   kill; only a genuine tmux failure blocks End/Remove. Notes the asymmetry it removes:
   `PaneExists` and `ListSessions` already treat `*exec.ExitError` as "not there". Tags: `tmux`,
   `ux`.
4. **`kb:adr/actions-serialized-per-session`** — Launch/Resume/End/Remove hold a per-session-id
   lock; the shell registry's global mutex becomes per-id. Records that today only tmux's
   duplicate-name refusal prevents a double spawn, and nothing prevents a double kill or a
   concurrent `writeSettings`. Tags: `concurrency`.

### Facts

No new fact records: nothing here is a measured Claude Code behaviour. The relevant existing ones
are `kb:fact/hook-delivery-best-effort` (hooks carry no timestamps, which is why a late event
cannot be age-checked and why REQ-2 is the only real defence), `kb:fact/clear-mints-new-session-id`
and `kb:fact/resume-keeps-session-identity`.

### Daemon shape

- The stderr string-match for `duplicate session:` lives **only** in `internal/tmux`. Callers use
  `errors.Is`. This is the same boundary discipline CLAUDE.md applies to `internal/claudecode`.
- `paneSpawner` (`internal/server/sessions.go:26-33`) gains `MaxSessionID`; `*tmux.Client` satisfies
  it without knowing.
- The keyed lock is a plain `map[int64]*sync.Mutex` guarded by `Manager.mu`, with entries reclaimed
  on `Remove`. It must never be held across the tmux I/O that `m.mu` already forbids — take the
  per-id lock around the action and keep releasing `m.mu` before tmux calls, exactly as today.
- `shellRegistry.Ensure`'s check-then-spawn already exists precisely because a second concurrent
  POST "would fail with a tmux duplicate session error" (`shells.go:29-33`). REQ-12 keeps that
  intent and narrows the lock; the Claude-pane spawn gets the equivalent guarantee from REQ-7/11.

### Doc upkeep at Completion

`docs/protocol.md`'s four anchor deltas, then `make gen-kb && make check-kb` — generated files ride
the same commit as the records.

**The supersede flip is a single atomic Completion step.** `kb check` will not accept a
`proposed` decision declaring `supersedes`, nor a `superseded` record with no `accepted` decision
naming it — so the pair cannot be represented mid-plan. The four ADRs therefore land as `proposed`
with `supersedes: []`, and Completion flips, in one commit: the four to `accepted`, plus
`kb:adr/lifecycle-reconcile-converges-with-the-socket`'s `supersedes:
[lifecycle-ended-rows-swept-next-start]` and that record's `status:` to `superseded` (its body is
never edited). Do not skip the second half. Tick #26 and move its `TODO.md`
block to `docs/history/todo-done.md` under the same heading, adding the four out-of-scope items as
new backlog entries.
