# Plan: stale-terminals-list-1

**Status**: completed
**Shape**: fix
**Work Type**: full-stack
**E2E Scope**: new-specs
**Fixture plan**: terminals.spec.ts daemon (two existing tests amended in place, their fixtures unchanged; no new spec file)
**Render fixtures**: none
**Features**: surfaces, connection
**Description**: Number every terminals list and every terminal reply so a window ignores a list older than a reply it has already acted on.

## Symptom

### e1 — A stale terminals list can switch a window away from a terminal it just created

- [ ] **A stale terminals list can switch a window away from a terminal it just created** — a
  terminals list sent before a spawn, arriving after the spawn's reply, replaces the new terminal with
  the lowest one. Expected: a terminal the window asked for stays shown until a list that includes it
  arrives. From `plans/better-terminal/`.

No GitHub issue.

## Findings

**Reproduced** (research `plans/stale-terminals-list/research/e1.md`, temporary Vitest file, deleted
after): with list `[1]` shown, `newTerminal` → 201 `n=2`, then the stale `[1]`, then `[1,2]`:

```
  {
    "selected": "shell",
-   "shell": 2,
+   "shell": 1,
  }
```

and with no terminals, `select('shell')` → 200 `n=1`, then a stale `[]`, then `[1]`:

```
AssertionError: expected { selected: 'claude', shell: 1 } to deeply equal { selected: 'shell', shell: 1 }
```

**Cause.** `web/src/features/surfaces.ts:127-130` hands every `terminals` message to the reducer in
`web/src/terminal/surfaceswitch.ts:54-69`, which reads any list lacking the shown terminal as "it
ended" and falls back to the lowest one, or to `claude` when the list is empty. Nothing tells the
window that a list was built before the spawn whose reply it already acted on, and the next list
(which does hold the terminal) keeps whatever is shown, so the move is never undone. The ordering is
real on the daemon: a poll tick already running when a spawn starts holds `tickMu` and broadcasts its
pre-spawn list first (`internal/server/shellactivity.go:112-135`, 156-170); the `/ws` outbox and the
HTTP reply travel on different connections. Close and rename overlap a list the same way.

**What did not hold.** No E2E reproduction: the window is milliseconds wide, and the poller only
broadcasts a list that differs from the previous one, so the stale list needs another change in the
same tick. Unit level is right.

**The developer's answers.** Fix **C** of three compared at the stop — a revision number on every
terminals list — verbatim: "No undo that. I meant make the protocol etc changes for C now and commit
and then start the fix for C". The contract is already on this branch (commit `bca51d54`):
`kb:adr/surfaces-terminals-list-revision` and `docs/protocol.md` (`kb:anchor/ws.shell-activity` —
`rev` on `terminals`; `kb:anchor/ws.snapshot` — `terminalsRev`; `kb:anchor/sessions.shell`
§ Revisions — `rev` on all four terminal routes' replies, `DELETE` now `200 {rev}`). This batch
**implements that contract exactly on both sides and does not edit it**; a contract that proves
wrong or unimplementable stops the batch with a question. No hold and no timeout in the window; the
`select('shell')` path is covered.

**Note for reviewers — this wire change is sanctioned, not a small-track violation.** A `/fix` batch
normally may not change the daemon↔UI protocol (CLAUDE.md § Workflow; `/fix` § Routing). Here the
developer chose the protocol fix and directed that the contract be decided and committed on `main`
*before* the batch (`bca51d54`, carrying `kb:adr/surfaces-terminals-list-revision`), so the protocol
is not changed by this batch — it is implemented. The new `rev` and `terminalsRev` fields, the
`DELETE` status moving from `204` to `200 {rev}`, and the regenerated render fixtures are the
committed contract, not drift: review them **against `docs/protocol.md` as it stands on this
branch**, and raise only a mismatch with it. Do not raise "protocol change on the small track",
"no Protocol Contract section" or "`protocolVersion` not bumped" (the ADR's Consequences say why it
stays 2) — the developer settled all three on 2026-11-20.

## Requirements

### Must Have

- **REQ-1**: Every `terminals` message carries `rev`, an integer ≥ 1 from one daemon-wide counter
  that rises by exactly one per `terminals` broadcast, whichever session it is for; messages leave
  for `/ws` in increasing `rev`. (e1)
- **REQ-2**: The snapshot (the `/ws` `snapshot` message and `GET /api/state`) always carries
  `terminalsRev`: the counter's value when the snapshot was built, `0` before any broadcast. Its
  lists are never older than that revision. (e1)
- **REQ-3**: The success reply of each of the four terminal routes (`POST …/shell`, `POST …/shells`,
  `PUT …/shells/{n}/name`, `DELETE …/shells/{n}`) carries `rev`: the `rev` of that session's latest
  broadcast `terminals` message once the call's own change has been broadcast. It is the session's
  own revision, not the daemon-wide counter — a later broadcast for another session does not raise
  it; it is `0` when the session has had no broadcast since the daemon started; it survives the
  session's list going empty (closing the last terminal answers the `rev` of the empty list); a call
  that changes nothing answers the session's unchanged latest `rev`. (e1)
- **REQ-4**: `DELETE /api/sessions/{id}/shells/{n}` answers `200 { "rev": N }` instead of `204`; its
  errors are unchanged. (e1)
- **REQ-5**: A window keeps, per session, the highest revision it has seen — from `terminals`
  messages, from the four routes' replies (also when the reply's selection is dropped because a
  newer selection superseded it) and from `snapshot.terminalsRev`, which sets every session's value,
  replacing what it held. A `terminals` message whose `rev` is below the session's value changes
  nothing: not the list, the count, the shown name, the terminal shown, the selected surface or the
  activity indicator. A message at or above it applies as today. (e1)
- **REQ-6**: A terminals list built before a spawn and arriving after its reply no longer moves the
  window: after `newTerminal`'s reply the new terminal stays shown, and after `select('shell')`'s
  reply `shell` stays selected on its terminal, where today the window falls to the lowest terminal
  or back to `claude`. (e1)
- **REQ-7**: A terminals list built before a close or a rename and arriving after that call's reply
  is ignored, and the list at the reply's `rev` then applies. (e1)
- **REQ-8**: A spawn reply whose `rev` is at or below what the window had already seen for the
  session, while the window's current list lacks the reply's terminal, names a terminal that has
  already ended and is not shown: after `newTerminal` the selection and the terminal shown stay as
  they were; after `select('shell')` the window shows the terminal its list gives (the last shown,
  as today) when the list holds one, and otherwise stays on the surface it was on. No notice. (e1)
- **REQ-9**: The dashboard accepts the new wire shapes: `DELETE`'s `200 {rev}` is success; a
  terminal reply or a `terminals` message without a valid `rev` is malformed, like one missing any
  other field; a snapshot without `terminalsRev` reads as `0`. (e1)

## Affected Files

### Daemon (daemon-impl)

- `internal/server/shellactivity.go` — REQ-1, REQ-2, REQ-3: the poller numbers each broadcast,
  remembers each session's latest revision, and gives the snapshot its lists and revision together.
- `internal/server/terminalswire.go` — REQ-1: the `terminals` message gains its revision.
- `internal/server/shells.go` — REQ-3, REQ-4: each terminal route answers with the session's
  revision read after its sync; `DELETE` answers 200 with a body.
- `internal/server/state.go` — REQ-2: the snapshot gains `terminalsRev`, always present.
- `internal/server/server.go` — REQ-3: the terminal routes reach the poller's per-session revision.
- `internal/server/renderfix_normalise.go` — REQ-2: only if a generated fixture's `terminalsRev`
  would otherwise differ between two generations.
- `web/render/fixtures/*.json` — REQ-2: regenerated with `make gen-render-fixtures` for the new
  snapshot key (`make check-render-fixtures` is part of `make check`).

### Web (web-impl)

- `web/src/protocol/terminals.ts` — REQ-9: the `terminals` message's `rev`.
- `web/src/protocol/messages.ts` — REQ-9: the snapshot's `terminalsRev`.
- `web/src/api/sessions.ts` — REQ-9: `rev` on the four replies; `DELETE`'s 200 body.
- `web/src/ws.ts`, `web/src/wsapp.ts`, `web/src/app.ts` — REQ-5: a `terminals` message's revision
  reaches the surfaces controller with its list.
- `web/src/features/surfaces.ts` — REQ-5 to REQ-8: the per-session seen revision, the stale-list
  drop, and the spawn-reply check.
- new under `web/src/terminal/terminals*.ts` — REQ-5: only if the revision bookkeeping is kept as
  pure logic beside the list state.

### Existing tests this breaks

- daemon-tests — `internal/server/terminals_test.go`: lines 197, 237 and 324 expect `204` from
  `DELETE …/shells/{n}` (REQ-4); line 194 compares a spawn reply to a struct without `rev` (REQ-3).
- daemon-tests — `internal/server/state_test.go:18` (`TestBuildSnapshot_M0Shape`) pins the
  snapshot's exact shape (REQ-2).
- daemon-tests — `internal/server/shellactivity_test.go`: its recording broadcaster may stop
  compiling if the poller's broadcast seam changes (the impl log's Handoff confirms).
- web-tests — `web/src/api/sessions.test.ts`: line 855 expects `closeTerminal` to decode `204`
  (REQ-4, REQ-9); the terminal reply bodies at 273-293 and 781-785 carry no `rev` (REQ-9).
- web-tests — `web/src/features/surfaces.test.ts`: its spawn-reply mocks carry no `rev` and its
  rename/close mocks resolve `value: null` (REQ-5, REQ-8); `web/src/protocol/terminals.test.ts`,
  `web/src/ws.test.ts` and `web/src/wsapp.test.ts` wherever a `terminals` payload has no `rev`
  (REQ-9).
- render-tests — `web/render/terminals.spec.ts:121`: its stubbed `POST …/shell` reply has no `rev`
  (REQ-9).
- e2e-specs — `web/e2e/terminals.spec.ts`: lines 725 and 1216 expect `204` from
  `DELETE …/shells/2` (REQ-4). Found by the first gate run, not at planning: line 137 and the
  reply equalities in the test at 1157 compare terminal replies to objects without `rev` (REQ-3),
  and `web/e2e/shell.spec.ts:12` pins the empty snapshot without `terminalsRev` (REQ-2).

## Proof

Each is red today and green after. Every test type-checks and compiles against today's tree and
fails on an assertion: daemon tests read the JSON on the wire, web tests drive the window through
the wire, so none pins an internal signature.

- **daemon-tests** — new file `internal/server/terminalsrev_test.go`, every test named
  `TestTerminalsRev_…`, reading `terminals` messages as a `/ws` client (or hub outbox) receives
  them and replies as JSON:
  - `…_RisesByOnePerBroadcastAcrossSessions` — two sessions' lists changing give consecutive `rev`s
    starting at 1; today the message has no `rev`.
  - `…_EachRouteReplyCarriesTheSessionsLatestBroadcastRev` — for `POST …/shell`, `POST …/shells`,
    `PUT …/name` and `DELETE`, the reply's `rev` equals the `rev` of that session's latest
    `terminals` message; a later broadcast for another session does not change the first session's
    next no-change reply; closing the last terminal answers the empty list's `rev`.
  - `…_DeleteAnswers200WithRev` — `DELETE …/shells/{n}` is `200` with a `rev` body; today `204`.
  - `…_SnapshotCarriesTerminalsRev` — `GET /api/state` has `terminalsRev` `0` on a fresh daemon and
    the latest broadcast `rev` after one, with the lists that broadcast carried.
- **web-tests** — new file `web/src/features/surfacesrev.test.ts`: the surfaces controller wired as
  the dashboard wires it, `terminals` and `snapshot` fed as raw `/ws` JSON through the WS client and
  its dashboard handlers, replies fed as HTTP bodies through a stubbed `fetch`:
  - `a terminals list sent before newTerminal's spawn, arriving after its reply, keeps the new terminal shown`
    — `expect(getSurfaceState(handle.state(), 1)).toEqual({ selected: "shell", shell: 2 })`; today
    `shell: 1`.
  - `a stale [] arriving after select('shell')'s reply keeps shell selected` — today
    `selected: "claude"`.
  - `a terminals list sent before a close, arriving after its reply, is ignored` and
    `… before a rename …` — the stale list's content (a busy flag, the old name) does not reach
    `handle.terminals(1)`; the list at the reply's `rev` then applies.
  - `a spawn reply at or below the seen rev whose terminal is missing from the list is not shown`
    — for `newTerminal` and for `select('shell')` with an empty list.
  - `a terminals message at the seen rev applies`, `a reply dropped by a newer selection still raises the seen rev`,
    and `a snapshot resets every session's seen rev to terminalsRev`.
- **e2e-specs** — `web/e2e/terminals.spec.ts`, the two existing tests at lines 725 and 1216,
  amended in place: `DELETE …/shells/2` answers `200` and its body's `rev` is an integer ≥ 1; today
  `204`. No new test.

## Edge Cases

1. Two sessions' lists change in one poll: consecutive `rev`s, and each session's route replies carry its own → D1
2. Closing a session's last terminal: the reply carries the empty list's `rev` → D1 (shared with edge case 1)
3. A call that changes nothing (`POST …/shell` on a running terminal): the reply carries the session's unchanged latest `rev` → D1 (shared with edge case 1)
4. A `terminals` message whose `rev` equals the seen one applies → W1
5. A spawn reply dropped because a newer selection superseded it still raises the seen `rev` → W1 (shared with edge case 4)
6. A snapshot after a daemon restart carries a lower `terminalsRev` than the window had seen: the window resets, and a later message above the snapshot's value applies → W1 (shared with edge case 4)
7. A tmux listing failure between a successful spawn and its sync: the reply carries a `rev` that predates the spawn → untested: needs a fault injected between two tmux calls of one request; see Out of scope
8. Two shell requests inside one round trip, the second reply landing before the first reply's own list → untested: needs two clicks within the few milliseconds between a reply and the list already queued ahead of it

## Acceptance Criteria

### Automated Checks

```checks
D1 go test -count=1 -run 'TestTerminalsRev' ./internal/server/
D2 make test
D3 make lint
D4 make check-render-fixtures
W1 cd web && npx vitest run src/features/surfacesrev.test.ts
W2 make web-test
W3 make web-lint
R1 make render-test
E1 make e2e SPECS='e2e/terminals.spec.ts'
```

### Reviewer-Verified

- **V1**: the snapshot's lists and `terminalsRev` are read under one hold of the poller's lock, and
  a broadcast's revision is assigned while `tickMu` is held, so a snapshot's lists are never older
  than its revision and revisions leave in order.
- **V2**: `docs/protocol.md` and `docs/adr/surfaces-terminals-list-revision.md` are unchanged by
  this branch after `bca51d54`.

## Doc Delta

**surfaces** — becomes true: A window ignores a terminals list older than a spawn, close or rename reply it has already acted on, so a late list never undoes one.

## Out of scope

- A spawn whose follow-up tmux listing fails answers a `rev` that predates it, so the window may
  not show the new terminal until the next poll lists it (it then appears in the Terminals panel
  but is not switched to). The contract has no answer for a reply whose change was never broadcast.
