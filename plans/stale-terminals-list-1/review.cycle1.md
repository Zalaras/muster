# Review: stale-terminals-list-1

**Plan**: stale-terminals-list-1
**Verdict**: needs-changes
**Cycle**: 1
**Gates**: 0 failed
**Parts**: code, browser, maintainability
**Part verdicts**: code needs-changes, browser approved, maintainability approved

_Merged by orch-state.py merge-review; the verdict is computed from the parts and the gate run, never edited by hand._

## Correctness review

# Correctness review: stale-terminals-list-1

**Plan**: stale-terminals-list-1
**Part verdict**: needs-changes
**Cycle**: 1
**Pack**: kb: pack 27311 words (budget 30000)

## Requirements

| Req | Implemented | Tested | Status |
|-----|-------------|--------|--------|
| REQ-1 | Yes. `reconcile` assigns `p.rev++` to each pending broadcast under `mu`, inside `tickMu`, then broadcasts in that order. The hub closure stamps `revFor(id)` (`shellactivity.go:41,177-207`) | Yes. `TestTerminalsRev_RisesByOnePerBroadcastAcrossSessions` (wire), `TestPollerRev_OneReconcileOverSeveralSessionsNumbersEachBroadcastInOrder` | pass |
| REQ-2 | Yes. `snapshot()` returns the lists and `rev` in one `RLock` hold. `Snapshot.TerminalsRev` has no `omitempty`, so it is always present (`state.go:20`) | Yes. `TestTerminalsRev_SnapshotCarriesTerminalsRev` (0 when fresh, then the broadcast rev, with that broadcast's lists); `TestBuildSnapshot_M0Shape`; e2e `shell.spec.ts:12` | pass |
| REQ-3 | Yes. All four routes read `revFor(id)` after `f.changed(ctx)` (`shells.go:155,169,210,240`). The per-session map survives an emptied list | Yes. `TestTerminalsRev_EachRouteReplyCarriesTheSessionsLatestBroadcastRev` covers no-change replies, another session's broadcast and the empty list; `TestPollerRev_SessionKeepsItsRevAfterItsListGoesEmpty` | pass |
| REQ-4 | Yes. `writeJSON(200, terminalClosedResponse{Rev})`; the 404s are unchanged | Yes. `TestTerminalsRev_DeleteAnswers200WithRev`; the body is exactly `{"rev":N}` (`terminals_test.go:328`); e2e `terminals.spec.ts:725,1234` | pass |
| REQ-5 | Yes. `isStaleList` returns before `applyTerminalList`, so the list, count, name, surface and activity are all untouched. Replies raise the seen rev before the newer-selection guard. `resetSeenRev(snapshot.terminalsRev ?? 0)` (`surfaces.ts:179-191,334-343`) | Yes. `surfacesrev.test.ts`: equal applies and below does not, a dropped reply still raises, snapshot reset (edge 6) | pass |
| REQ-6 | Yes | Yes. The `newTerminal` and `select('shell')` stale-list tests in `surfacesrev.test.ts` | pass |
| REQ-7 | Yes. `observeReply` on rename and close | Yes. The close and rename tests in `surfacesrev.test.ts` | pass |
| REQ-8 | Yes. `observeSpawnReply` checks `rev <= seen` and that the list lacks `n`. `select` uses `shell ?? (ended ? null : n)`, and `terminalsChanged` keeps `shell` non-null whenever the list is non-empty | Yes. The three "spawn reply at or below the seen rev" tests | pass |
| REQ-9 | Partly. A `terminals` message with `rev: 0` is accepted, but the contract says ≥ 1 (Major 1) | Partly. A test pins `rev: 0` as valid (Major 2) | fail |
| DIAG | `kb:diagram/web-components` (terminal/ is now 10 modules: verified, 10 non-test files), `kb:diagram/daemon-components` (no package or import change), `kb:diagram/containers` (no change) | — | pass |

## Build & Tests

E2E tests: pass (255, scoped to 20 files) · Daemon tests: pass (every package `ok`, `go test -count=1 ./...`, no `-race` in this line) · Web tests: pass (3404, proven at 10:05:50 and reused) · Daemon build: pass · Web build: pass · Lint: pass (0 issues). All read from $GATES_LOG_DIR (`gates-stale-terminals-list-1-c1c`: 31 lines, 0 failed, 2 warn-only). The c1b reds (`embedded.spec.ts:75` daemon never healthy, `render/reader-find.spec.ts:309`, `TestOnExit_Leave_LiveSessionSurvivesShutdown`) are in files this plan does not touch, and all three passed on the c1c re-run.

## Acceptance Checks

| ID | Command | Result |
|----|---------|--------|
| D1 | `go test -count=1 -run 'TestTerminalsRev' ./internal/server/` | pass (proven at 10:05:50) |
| D2 | `make test` | pass (run in c1c, 05-D2.log) |
| D3 | `make lint` | pass (deduped to the gates' lint line) |
| D4 | `make check-render-fixtures` | pass (deduped to the render-fixtures line) |
| W1 | `cd web && npx vitest run src/features/surfacesrev.test.ts` | pass (proven at 10:05:50) |
| W2 | `make web-test` | pass (deduped to the web-test line) |
| W3 | `make web-lint` | pass (deduped to the web-lint line) |
| R1 | `make render-test` | pass (deduped to the render-test line, 509 passed) |
| E1 | `make e2e SPECS='e2e/terminals.spec.ts'` | pass (proven at 10:05:50, 28 passed) |
| DOC | doc upkeep + Doc Delta vs what shipped | pass. This is a sweep batch, so the `TODO.md:163` tick is left to the loop. There are no `deviation:` or `doc-delta:` lines. The one Doc Delta line (surfaces) holds for the code |

## Reviewer-Verified Criteria

| ID | Criterion | Result | Evidence |
|----|-----------|--------|----------|
| V1 | The snapshot's lists and rev are read under one lock hold; revisions are assigned under `tickMu` | pass | `snapshot()` holds one `RLock` for `terms` and `rev` (`shellactivity.go:110-118`). `reconcile` is reached only from `tick`, which holds `tickMu` (`:128-151`). The swap of `terms` and the assignment of the revs happen in one `mu.Lock` hold, and the broadcasts follow in assignment order (`:177-200`). `rg` finds no other writer of `terms`/`rev`/`revs` |
| V2 | `docs/protocol.md` and the ADR unchanged after `bca51d54` | pass | `bca51d54` is an ancestor of HEAD, and `git diff main...HEAD -- docs/protocol.md docs/adr` is empty |

## Hard-Rule Checklist

| # | Rule | Result |
|---|------|--------|
| 1 | Adapter boundary | pass |
| 2 | Terminal-output state parsing | pass |
| 3 | Blocking hook handler | pass (no ingest change) |
| 4 | Bare tmux / resize-pane | pass (no new tmux call) |
| 5 | Payload logging | pass |
| 6 | Empty-gauge dishonesty | pass (n/a) |
| 7 | Identity on `session_id` | pass |
| 8 | Settings trespass | pass |
| 9 | Real `claude` outside canary | pass |

## Issues

### Critical

None.

### Major

1. **[web-impl]** A `terminals` message carrying `rev: 0` parses as valid. `docs/protocol.md` (`kb:anchor/ws.shell-activity`) says a message's `rev` is "an integer ≥ 1", and REQ-9 says a message "without a valid `rev` is malformed". `parseTerminalsMessage` (`web/src/protocol/terminals.ts:36-41`) uses the shared `parseRev`, which accepts anything ≥ 0. That floor is right for replies and `snapshot.terminalsRev` but not for messages. After the fix, a `terminals` message with `rev` < 1 is rejected like any other malformed message, while the replies and the snapshot keep accepting 0.
   id: web/src/protocol/terminals.ts:parseTerminalsMessage:accepts rev zero | confidence: 90
2. **[web-tests]** The web tests pin the out-of-contract value as valid and never test its rejection. `terminals.test.ts:26-34` ("decodes the empty list sent once the last terminal ends") expects `rev: 0` to decode, though the daemon's empty-list message always carries rev ≥ 1. `surfacesrev.test.ts` ("a snapshot without terminalsRev … resets every session's seen rev to 0") sends a message at `rev: 0` through the parser. After the fix, the decode row uses rev ≥ 1, a `rev 0` row joins the rejection table, and the snapshot-without-terminalsRev test shows the reset with a message at rev 1 (below the earlier 20, so the reset is still the only reason it applies).
   id: web/src/protocol/terminals.test.ts:parseTerminalsMessage:rev zero pinned valid | confidence: 90

### Minor

None.

### Notes

1. **[note]** Edge case 8 (untested by plan) goes further than the plan says. A rename or close reply that reaches the window before an earlier, still-pending spawn reply raises the seen rev past that spawn's rev. The spawn reply is then read as "ended" and not shown, even though the terminal runs. This follows the contract's wording in `sessions.shell` § Revisions, so it is not a defect of this branch. It does mean the "ended" inference holds only when the window has no other terminal call to the same session in flight.
2. **[note]** `shellActivityPoller.revs` never drops a removed session's id. Each entry is one int64 per session id for the daemon's lifetime, which is negligible. This is shape, not a defect: review-maintainability's to weigh.
3. **[note]** The D2 gate line runs `go test -count=1 ./...` without `-race`. The rev bookkeeping is guarded by the existing `mu`/`tickMu`, and I found no unguarded access by reading the code.
4. **[note]** The Repairs table is honest. Each repaired reply equality splits `rev` off and keeps the exact `toEqual` on the rest. The no-change `POST /shell` asserts `>=`, which is correct because a poll broadcast may run between the calls. Every change asserts strictly greater. `shell.spec.ts:12` gains `terminalsRev: 0` exactly. Nothing was deleted or loosened.

## Browser review

# Browser review: stale-terminals-list-1

**Plan**: stale-terminals-list-1
**Part verdict**: approved
**Cycle**: 1
**Pack**: kb: pack 8534 words (budget 30000)
**Rig**: `make web-build build` at 36f51774 → `bin/musterd`, driven via the committed `web/e2e/helpers/fixtures` scratch daemon (fresh space-bearing temp data dir, private per-test `tmux -S` socket killed on teardown, `-claude-bin` E2E stub). Headless Chromium through a throwaway spec (since deleted). Gates log `gates-stale-terminals-list-1-c1c` had no red lines (render 509 passed, e2e 255 passed, D2 ok).

**Method for the race.** The plan says the natural race cannot be reproduced end to end (Findings, "What did not hold"). I produced it in the real app instead: `page.routeWebSocket` proxied the dashboard's `/ws` to the real daemon, recorded every `terminals`/`snapshot` frame, and injected a stale `terminals` frame (`rev` = reply `rev` − 1, holding the pre-call list) straight after each real HTTP reply. I then let at least one render pass go by (≥ 1.2 s) and read what had settled. For REQ-8 I used `page.route` to rewrite a real spawn reply's `n`/`rev`.

## Matrix

| Req | Host | State | Claim | Result | Evidence |
|-----|------|-------|-------|--------|----------|
| REQ-1 | wire (/ws) | data | `rev` on every `terminals`, +1 per broadcast across sessions, in order | pass | two sessions: frames `[sid,rev]` = `[1,1] [2,2] [2,3] [1,4]`; one session: revs `[1,2,3,4]` |
| REQ-2 | wire | no data | snapshot / `GET /api/state` carry `terminalsRev` 0 on a fresh daemon | pass | /ws snapshot `terminalsRev: 0`; authenticated `/api/state` 200 `terminalsRev: 0`, `terminals: {}` |
| REQ-2 | wire | data | `/api/state.terminalsRev` = latest broadcast, lists match | pass | after close: `terminalsRev 4`, `{"1":[shell 1]}` = frame rev 4 |
| REQ-3 | wire | data | each route's reply `rev` = the session's latest broadcast `rev` | pass | POST shell rev 1 = frame 1; POST shells 2 = frame 2; PUT name 3 = frame 3; DELETE 4 = frame 4 |
| REQ-3 | wire | data | per-session, not global; no-change answers unchanged rev; last close answers the empty list's rev | pass | after B reached rev 3, A's no-change `POST …/shell` answered `created:false, rev:1`; A's last-terminal DELETE answered `{rev:4}` = frame `[1,4,0 terminals]` |
| REQ-4 | focus | data | DELETE from the panel × answers `200 {rev}` | pass | `DELETE 200 {"rev":4}`; row gone; missing terminal still `404 no_shell` |
| REQ-4 | tiles | data | same from a tile's panel | pass | `tile DELETE 200 {"rev":4}`, row `shell 2` count 0 |
| REQ-5 | focus | data | a list at the seen rev applies | pass | injected at rev = seen with shell 2 named `eqprobe` → the switch title read `eqprobe` |
| REQ-5 | focus | data | a stale list changes nothing (list, count, name, shown, selected, busy) | pass | injected stale list with `busy:true` for shell 2 / the old name → title, count and rows unchanged (rows below) |
| REQ-5 | focus | data → daemon restart | snapshot resets the seen rev; later low revs apply (edge case 6) | pass | seen 2 before restart; new daemon's snapshot `terminalsRev 0`; New terminal → reply rev 1, frame rev 1 applied: `shell` pressed, title `shell 1`, region visible |
| REQ-6 | focus | no data | stale `[]` after `select('shell')`'s reply keeps shell selected | pass | `shellPressed true, title "shell 1", claudePressed false`, region display flex/visible/opacity 1, box 300,95 980×599 |
| REQ-6 | tiles | no data | same in a tile | pass | `shellPressed true, title "shell 1"`; region box 2,117 637×256 inside tile 1,85 638×317 |
| REQ-6 | focus | data | stale `[1]` after `newTerminal`'s reply keeps shell 2 shown | pass | title `shell 2`, count `2`, region visible; panel rows `shell 1, shell 2` |
| REQ-6 | tiles | data | same in a tile | pass | title `shell 2`, count `2`, region visible inside tile box |
| REQ-7 | focus | data | stale list after rename is ignored | pass | PUT 200 rev 3; stale rev 2 list with `shell 2` → title `renamed`, row `renamed` 1, row `shell 2` 0 |
| REQ-7 | focus | data | stale list after closing the shown terminal is ignored | pass | stale rev 3 `[1, renamed]` → title `shell 1`, count hidden, row `renamed` 0 |
| REQ-7 | tiles | data | stale list after close is ignored | pass | stale rev 3 `[1,2,3]` after DELETE rev 4 → title `shell 1`, count `2`, row `shell 2` 0; `/api/state` = `[1,3]` |
| REQ-7 | tiles | data | rename ignored stale list | not measured — Note 1 | |
| REQ-8 | tiles | data | `newTerminal` reply at/below seen whose n is missing → not shown, no notice | pass | real reply n 3 rev 3 rewritten to n 99 rev 1 → title still `shell 2`, count `3` (real list), no notice visible |
| REQ-8 | focus | no data | `select('shell')` ended reply → the list's terminal, else stay | pass | real reply n 1 rev 1 rewritten to n 99 rev 0; the real list `[1]` at rev 1 arrived first, so the list holds one → `shell 1` shown (REQ-8's "the terminal its list gives") |
| REQ-8 | focus | no data | `select('shell')` ended reply with an empty list stays on claude | not measured — Note 2 | |
| REQ-9 | focus | data | a `terminals` frame without `rev` is ignored as malformed | pass | injected `{terminals: []}` with no rev → title `shell 2`, count `2` unchanged; console errors/warnings: none |
| REQ-9 | focus/tiles | data | DELETE 200 body read as success | pass | no failure notice; row removed in both hosts |
| Keeps focus | focus | data | a stale frame doesn't move focus | pass | Terminals opener focused, stale frame injected, 1.2 s later `document.activeElement` was the same node (Note 3) |
| §6 daemon-down | focus | daemon-down | daemon-down shown prominently | pass | `#banner` display block, visible, box 0,46 1280×32: "musterd unreachable — hook output in open panes is Muster's absence, not session failure."; Terminals opener disabled |
| all | pop-out (`/doc.html`) | any | — | N/A — the pop-out is the reader, which has no surface switch or Terminals panel | |
| Edge 7, 8 | any | any | — | N/A — plan marks them untested (fault injection between tmux calls; sub-ms double click) | |

## Issues

### Critical
None.

### Major
None.

### Minor
None.

### Notes
1. **[note]** Rename followed by a stale list was measured in focus only, not in tiles. The tile and focus hosts share the same panel and the same `surfaces.ts` handler, and close was measured in both.
2. **[note]** The REQ-8 `select('shell')` branch where the list is empty when an ended reply arrives was not reached in the browser. The daemon's real `[1]` frame always got there before the routed (rewritten) reply, so the "list holds one" branch ran instead. `surfacesrev.test.ts` covers the empty-list branch at unit level.
3. **[note]** Focus for the keeps-focus cell was set with `locator.focus()`, not with Tab. The defect class (an element rebuilt each render) does not depend on how focus arrived.
4. **[note]** Outside this plan: while the daemon is down the surface switch still shows the last-known `shell 2` and count `2` with no age. The banner covering daemon-down is prominent, as §6 requires, and the opener is disabled. This is unchanged behaviour, recorded only for the matrix.
5. **[note]** The only visible element matching `.notice` in every run was the issue-capture dialog's static help text ("Files a public issue…"), not a failure notice.

## Maintainability review

# Maintainability review: stale-terminals-list-1

**Plan**: stale-terminals-list-1
**Part verdict**: approved
**Cycle**: 1
**Pack**: kb: pack 15998 words (budget 30000)
**Scope**: 13 files from `git diff main...HEAD -- cmd internal web/src ':!*_test.go' ':!*.test.ts'`

## Files

| File | Siblings opened | design: line | Size warnings | Result |
|------|-----------------|--------------|---------------|--------|
| internal/server/server.go | shells.go, shellactivity.go (the two features whose wiring line changed) | n/a (one registration line) | funlen ×1 (`New`, 56 > 40), pre-existing; no reason in Decisions, and the Decisions size line misplaces it | Minor 1 |
| internal/server/shellactivity.go | themepoll.go (`Current`), usagepoll.go, shells.go | yes (rev beside `terms`, `snapshot()`, pending-broadcast order) | none | pass |
| internal/server/shells.go | rename.go, note.go, actions.go (reply shapes), shellactivity.go | yes (`revFor` as a function field beside `changed`) | none | pass |
| internal/server/state.go | shellactivity.go (`contribute`) | covered by the snapshot() line | none | pass |
| internal/server/terminalswire.go | usagewire.go | wire field only | none | pass |
| web/src/api/sessions.ts | api/http.ts, api/groups.ts, api/update.ts, protocol/decode.ts | covered by the four-replies line | none | pass |
| web/src/app.ts | wsapp.ts, ws.ts | event signature only | none | pass |
| web/src/features/surfaces.ts | terminal/terminals.ts, terminal/shellactivity.ts, terminal/surfaceswitch.ts | yes (owner of `revState`, its four writers; reply raised before the newer-selection guard) | none (436 lines) | pass |
| web/src/protocol/messages.ts | protocol/terminals.ts, protocol/decode.ts | yes (`terminalsRev` optional like `terminals`) | none | pass |
| web/src/protocol/terminals.ts | protocol/decode.ts, protocol/session.ts | covered | none | pass |
| web/src/terminal/terminalsrev.ts | terminal/terminals.ts, terminal/shellactivity.ts | yes (pure immutable module, Map-in-state like its neighbours; rg for an existing rev found none) | none | pass |
| web/src/ws.ts | wsapp.ts | handler signature only | none | pass |
| web/src/wsapp.ts | ws.ts, app.ts | handler signature only | none | pass |

Duplicate searches (question 1):

```
$ rg -n "revFor|Rev\b|rev\+\+|epoch|Seq\s+int64" internal/server --glob '!*_test.go'
  -> only this diff's own lines (shells.go, shellactivity.go, state.go, terminalswire.go, server.go);
     the "epoch" hits are renderfix fixture prose. No existing revision counter in internal/server.
$ rg -n ">= 0|< 0" web/src/protocol web/src/api
web/src/protocol/terminals.ts:20:  return rev !== null && rev >= 0 ? rev : null;
web/src/protocol/session.ts:427:    backgroundTasks < 0
  -> no existing non-negative-integer helper in protocol/decode.ts; parseRev is the first.
$ rg -n "func \(p \*\w+Poller\) Current|func.*\bsnapshot\(\)" internal/server --glob '!*_test.go'
internal/server/themepoll.go:138:func (p *themePoller) Current() claudecode.ThemeFamily {
internal/server/shellactivity.go:105:func (p *shellActivityPoller) Current() map[string][]terminalWire {
internal/server/shellactivity.go:110:func (p *shellActivityPoller) snapshot() (map[string][]terminalWire, int64) {
```

Shared state (question 3): `shellActivityPoller.rev`/`revs` are written only in `reconcile`, under
`mu` (write lock) and inside `tickMu` (held by `tick`, which `sync` also takes); readers
(`snapshot`, `revFor`) take `mu.RLock`. The guard is named at the declaration
(shellactivity.go:66-69). The hub closure's `revFor` read (shellactivity.go:41) runs after `mu` is
released but still inside `tickMu`, so no other writer can move `revs[id]` between assignment and
broadcast. I found no interleaving that reaches unguarded state. Web side: `revState` is closure
state in `initSurfaces`, single-threaded, its writers named in the web `design:` line.

## Issues

### Critical

### Major

### Minor
1. **[daemon-impl]** `plans/stale-terminals-list-1/daemon-implementation.md` § Decisions gives no reason for the `funlen` warning on a touched file, and its size line is wrong about where the warning is. The gates' size log (`02-size.log`) says `WARN  internal/server/server.go:137:6: Function 'New' has too many statements (56 > 40) (funlen)`. That is the production composition root this branch touches at server.go:225. The Decisions line says "no new size warnings on touched production files (the one warning is in an existing test file)". Rule: conventions § Design "Size is read, not obeyed": going over a limit is fine "with a reason in Decisions". The fix: the size line names `server.go:New` and gives a reason that holds. For example, this diff changes one argument on an existing registration line and adds no statements to `New`, which on main is already a list of one-line registrations. Do not split `New` to silence the warning (kb:adr/process-size-linters-warn-never-fail).
   id: plans/stale-terminals-list-1/daemon-implementation.md:Decisions:funlen New unexplained | confidence: 90

### Notes
1. **[note]** shellactivity.go:41 — the hub closure passed into `newShellActivityPoller` calls `f.poller.revFor(sessionID)`, so the poller drops the rev it just assigned in `reconcile` (line 194) and fetches it again through its own callback. This is correct only because every `p.broadcast` call sits inside `reconcile` under `tickMu`. The "Seam kept" Decision gives the reason: impl agents may not edit the test helpers that construct the poller with the two-argument `broadcast`. That reason holds within the pipeline's boundaries. A later cleanup that passes the rev as a `broadcast` argument would remove the coupling.
2. **[note]** shellactivity.go:105 — `Current()` now has no production caller, only `shellactivity_test.go` and `terminalsrevpoller_test.go`; `contribute` uses `snapshot()`. Decisions gives the reason (tests call it). Compare `themePoller.Current` (themepoll.go:138), which production uses.
3. **[note]** web/src/protocol/terminals.ts:18 `parseRev` checks for a non-negative integer, and protocol/session.ts:423-427 already does the same check inline for `backgroundTasks`. protocol/decode.ts says it "owns how a JSON primitive … [is] recognised", so a shared `asNonNegativeInteger` there would serve both. There was no existing helper to reuse, so this is not a duplicate. Because of where `parseRev` lives, api/sessions.ts:11 imports from `protocol/terminals`. Importing a concept parser is already done in api/groups.ts and api/sessions.ts (`parseGroup`, `parseSession`).
4. **[note]** web/src/api/sessions.ts:207-210 — `restartSessions` was reformatted (its `{ ids }` argument expanded onto three lines) with no change in behaviour, outside this plan's concern. Biome keeps the expanded form once it exists, so `make web-lint` will not undo it.
5. **[note]** For review-work: shells.go:240 changes `DELETE /api/sessions/{id}/shells/{n}` from 204 with no body to 200 with a JSON body. Its sibling deletes and puts still answer 204 (rename.go:89, note.go:68, actions.go:109, groups.go:141). That is a protocol-contract question for review-work, not a shape question.
6. **[note]** Component diagram: the web diagram already counts `terminal/` as 10 modules and describes "the terminals-list revision a window has seen" (commit eefb0dcc). The diff adds no new daemon package or import edge.
