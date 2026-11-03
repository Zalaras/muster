# Plan: sweep-2026-11-03-1

**Status**: completed
**Shape**: fix
**Work Type**: daemon
**E2E Scope**: new-specs
**Fixture plan**: reconcile.spec.ts daemon|startDaemon (every test restarts its own daemon; the kill-on-exit test alone needs `startDaemon({ onExit: "kill" })`)
**Render fixtures**: none
**Features**: lifecycle, actions, notes
**Touches**: focus, connection
**Description**: A daemon start never deletes a session row: a session whose pane died while musterd was down, or that was ended before shutdown (End, `-on-exit kill`), comes back ended and resumable at every later start until it is removed.

## Symptom

### e1 — Sessions survive only one daemon start after their tmux server is gone

> - [ ] **Sessions survive only one daemon start after their tmux server is gone** — filed by the
>   developer 2026-09-22 during `rail-card-improvements` planning. After a computer restart, or a
>   crash that also took the tmux server, sessions come back once as ended, resumable cards, and
>   the next restart of musterd clears the whole rail. A crash must not clear sessions. #47 below
>   is the same defect; #39 in Post v1 is the same seam.

No GitHub issue.

### e2 — I lost my session from yesterday (I think)

> - [ ] **I lost my session from yesterday (I think)** ([#47](https://github.com/Zalaras/muster/issues/47)) — three sessions left open were
>   gone after stopping musterd and killing tmux. They should come back on restart as resumable
>   rows, even though Claude itself has quit.

## Findings

Full research: `plans/sweep-2026-11-03/research/e1.md` and `e2.md`, `## Answers` included.

**Reproduced** on a scratch daemon built from `main` @ 1a18a071 (own data dir, own tmux socket,
stub `-claude-bin`, no real `claude`):

- `-on-exit leave`, then kill the tmux server: start 2 logs `marked_ended=2 swept=0` and the rail
  shows both cards ended; start 3, with nothing changed, logs `swept=2` and the rail is empty.
- `-on-exit kill` (#47's path 2, a `y` at the ask prompt): the rows are `alive=0` at exit; the very
  first start logs `swept=3` and `sessions: 0`. The sessions never come back at all.

**Cause.** `internal/session/reconcile.go` `classifySessionsByOwnership` (:123-127) puts every row
whose `muster-<id>` is absent and whose `alive=false` into `toSweep`; `actOnReconcile` (:87-96)
deletes each one through `removeSessionRecord(ctx, id, false)`. Documented at `reconcile.go:31-34`.
This is the designed rule of the accepted kb:adr/lifecycle-reconcile-converges-with-the-socket,
carried from kb:adr/lifecycle-ended-rows-swept-next-start. Every start deletes every row already
ended when it began, however it ended; an Update & restart re-exec counts as a start.

**Developer's answers.** e1: "1. A" — keep every ended row until Remove; the startup sweep is
removed; a new ADR supersedes the sweep clause (written on this branch as
`docs/adr/lifecycle-ended-rows-kept-until-remove.md`, `status: proposed`). e2: "2. Yes lets try it
for now" — a row ended by `-on-exit kill` / EndAll at shutdown is kept as ended and resumable at
the next start like every other ended row; one batch, one ADR, both unit tests.

`cmd/musterd/onexit.go` needs no change: the kill path keeps writing `alive=0`, and the row is now
kept. No web change: the dashboard already renders ended rows (sorted last, Resume and Remove).

## Requirements

### Must Have

- **REQ-1**: At a daemon start, a row whose `muster-<id>` is absent from the socket and which is
  already ended (`alive=false`) is kept exactly as stored — still present in `List()`, the store
  and the first `snapshot`, `alive=false`, `endedAt` unchanged — at that start and at every later
  start, until the developer removes it. A row that died while musterd was down is marked ended at
  the first start (unchanged) and kept at every later one. (e1)
- **REQ-2**: A session ended before shutdown — by `-on-exit kill` / `EndAll`, or by End — comes
  back at the next start as an ended card with Resume enabled, its `endedAt` the value written at
  shutdown. (e2)
- **REQ-3**: Reconcile deletes no row. `ReconcileReport` loses its `Swept` field and the
  `reconciled sessions` log line loses its `swept` key; the doc comments on `Reconcile`,
  `actOnReconcile`, `classifySessionsByOwnership` and `removeSessionRecord` stop naming a startup
  sweep (the only `announced=false` removal left is DeleteSession's launch rollback). Ownership
  classification, repair, unknown-name reporting and the shell kill are unchanged. (e1, e2)

## Affected Files

### Daemon (daemon-impl)

- `internal/session/reconcile.go` — REQ-1/REQ-3: `classifySessionsByOwnership` returns only
  `toEnd` (an absent `alive=false` row is skipped); `actOnReconcile` loses the sweep loop;
  `ReconcileReport.Swept` and the `swept` log key go; the doc comment at :22-50 describes the new
  rule and cites kb:adr/lifecycle-ended-rows-kept-until-remove.
- `internal/session/manager.go` — REQ-3: the `removeSessionRecord` comment (≈:459-485) drops
  "Reconcile's startup sweep" from the callers and from the `OnRemoved` paragraph.

### Existing tests this breaks

- `internal/session/manager_test.go`: `TestReconcile_DeletesEndedRowsMarksDeadPanesEndedLeavesLivePanesByteIdentical`
  (:1253) asserts `Swept: 1` and the deletion — flips to "kept, unchanged" (rename it);
  `TestApply_SessionEndAfterStopKeepsResumeChance` (:937) references `report.Swept` and its
  comment says "before it is finally swept".
- `internal/session/manager_writeturnstile_interleave_test.go:336`
  `TestReconcile_SweptRowStoreFailureStillDropsMemory`: the path it tests is gone. Repurpose it to
  the remaining `announced=false` caller (DeleteSession's launch rollback) if nothing else covers
  that store-failure path, otherwise delete it.
- `internal/session/note_test.go:424` ("an already-dead row is swept, its note with it"): flips —
  the dead row is kept and so is its note.
- `internal/session/manager_rail_test.go:220`: comment names the sweep row class; fix the comment.
- `web/e2e/reconcile.spec.ts`: E4 (:115) asserts the row is gone after a `-on-exit=kill` restart;
  E2's title (:23) says "a later restart sweeps it for good".
- Comments only: `web/e2e/actions.spec.ts:703-705`, `web/e2e/effort-header.spec.ts:190`.

All `Swept` references in tests are removed by the test agent in its red-first commit, so the
tests compile both before and after the field is deleted.

## Proof

- **e1** — `internal/session/manager_test.go`
  `TestReconcile_ARowWhosePaneDiedWhileDownSurvivesEverySubsequentStartAsEnded` (daemon-tests). A
  seed manager creates a session and `RecordLaunch`es it. Lifetime 2: a fresh manager with an empty
  fake socket, `LoadAll`, `Reconcile` → `ReconcileReport{MarkedEnded: 1}`. Lifetime 3: another
  fresh manager on the same store, empty socket, `LoadAll`, `Reconcile`. Red today:
  `require.True(t, mgr3.Exists(id))` and `assert.Equal(t, ReconcileReport{}, report3)` (today
  `{Swept: 1}`, row deleted). Companions: the row is `alive=false` and its `EndedAt` equals
  lifetime 2's, in memory and in the store.
- **e2** — `internal/session/manager_test.go`
  `TestReconcile_ARowEndedBeforeShutdownComesBackEndedAtTheNextStart` (daemon-tests). A seed
  manager creates and launches a session, then `EndAll(ctx)` with a fake `TmuxSessions` that lists
  it (the `-on-exit kill` write). A fresh manager with an empty socket, `LoadAll`, `Reconcile`. Red
  today: `require.True(t, mgr.Exists(id))` and `assert.Equal(t, ReconcileReport{}, report)`.
  Companions: `Alive == false`; `EndedAt` equals what `EndAll` wrote; a third manager's `Reconcile`
  still keeps it.
- **e2 journey** — `web/e2e/reconcile.spec.ts` E4 rewritten (e2e-specs): start with
  `-on-exit=kill`, launch, restart → the tmux session is gone, `GET /api/state` still has the
  session with `alive:false` and `endedAt` set, and after reload its card is present, ended, with
  Resume enabled. Red today (the row is swept). E2's title loses "a later restart sweeps it for
  good"; its body is unchanged.

## Edge Cases

1. A row ended before the first start and still ended after it is never re-stamped: `endedAt`
   stays the stored value, not the start time → D1
2. A row whose `muster-<id>` is live but stored `alive=false` is still revived, not just kept →
   D2
3. The note of a kept ended row is kept with it → D2 (shared with edge case 2)

## Acceptance Criteria

### Automated Checks

```checks
D1 go test -count=1 -run 'TestReconcile_ARowWhosePaneDiedWhileDownSurvivesEverySubsequentStartAsEnded|TestReconcile_ARowEndedBeforeShutdownComesBackEndedAtTheNextStart' ./internal/session/
D2 go test -count=1 ./internal/session/
D3 make lint
E1 make e2e SPECS=web/e2e/reconcile.spec.ts
```

### Reviewer-Verified

- `cmd/musterd/onexit.go` and the web dashboard are unchanged; no protocol message, field or
  anchor changes.
- The `removeSessionRecord` comment names only the callers that remain.

## Doc Delta

**lifecycle** — becomes true: a daemon start deletes no row; an ended row, however it ended
(a pane that died while musterd was down, End, `-on-exit kill`), stays a resumable card until
Remove (kb:adr/lifecycle-ended-rows-kept-until-remove). Stops being true: "ended rows are deleted"
and "kept for one resume" in `docs/features/lifecycle/spec.md` § Liveness, reconcile, shutdown.

**protocol** (`docs/protocol.md`) — stops being true: `:1267` "or by the start-up sweep of an
already-ended row" (the note is deleted with its row by Remove only); `:1512-1514` "Startup sweeps
… send nothing — swept rows are simply absent from the first snapshot" and "until removed or
swept" (now "until removed"); `:1893-1898` "swept on the *following* startup" and the whole
absent/`alive=0` → deleted bullet (now: kept as it is, `endedAt` unchanged); `:1916` "so the next
startup sweeps it" (now: so the next startup shows it ended and resumable). The cited ADR becomes
kb:adr/lifecycle-ended-rows-kept-until-remove.

**actions** (`docs/features/actions/spec.md:55-57`) — stops being true: "Dead sessions ended in an
earlier daemon lifetime are swept at the next start … so a Resume chance is one daemon lifetime
long". Becomes true: a dead session stays resumable until it is removed
(kb:adr/lifecycle-ended-rows-kept-until-remove).

**notes** (`docs/features/notes/spec.md:28-29`) — stops being true: "until Remove or the next daemon
start" and "the start-up sweep of an already-ended row deletes its note with the row". Becomes
true: an ended session keeps its note until Remove; a restart keeps every row and its note.

**Code comment** (`cmd/musterd/onexit.go:29-31`) — stops being true: a racing tick would "race a
restart's Reconcile into sweeping a row it should have kept". Now the row is kept either way; the
race only changes its `endedAt`.

**Package guide** (`internal/store/CLAUDE.md` Gotchas) — stops being true: "Ended rows are swept on
the next start". Fixed by the orchestrator in a docs commit.

## Out of scope

- An automatic clean-up of old ended rows — the Archive backlog item (#39).
