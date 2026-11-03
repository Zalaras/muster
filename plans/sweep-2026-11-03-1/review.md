# Review: sweep-2026-11-03-1

**Plan**: sweep-2026-11-03-1
**Verdict**: approved
**Cycle**: 1
**Gates**: 0 failed
**Parts**: code | skipped: browser, maintainability
**Part verdicts**: code approved

_Merged by orch-state.py merge-review; the verdict is computed from the parts and the gate run, never edited by hand._

## Correctness review

# Correctness review: sweep-2026-11-03-1

**Plan**: sweep-2026-11-03-1
**Part verdict**: approved
**Cycle**: 1
**Pack**: kb: pack 47245 words (budget 30000)

## Requirements

| Req | Implemented | Tested | Status |
|-----|-------------|--------|--------|
| REQ-1 | Yes. `reconcile.go` `classifySessionsByOwnership` appends only `r.alive` absent rows to `toEnd`; an absent `alive=false` row falls through untouched. `actOnReconcile` has no delete loop | D1 `TestReconcile_ARowWhosePaneDiedWhileDownSurvivesEverySubsequentStartAsEnded` (marked ended at start 2, `ReconcileReport{}` and unchanged `endedAt` in memory and store at starts 3-5, plus an already-ended bystander). `TestReconcile_KeepsEndedRowsMarksDeadPanesEndedLeavesLivePanesByteIdentical` (store row byte-identical). E2E E2 | pass |
| REQ-2 | Yes, through REQ-1. `cmd/musterd/onexit.go` is unchanged and still writes `alive=0` through `EndAll` | D1 `TestReconcile_ARowEndedBeforeShutdownComesBackEndedAtTheNextStart` (two rows ended by `EndAll`, kept at starts 2 and 3, `endedAt` equal to the value `EndAll` wrote). E2E E4 (`-on-exit=kill` restart: tmux gone, `/api/state` shows `alive:false` with `endedAt` set, card `.ended`, Resume enabled in the card menu) | pass |
| REQ-3 | Yes. `ReconcileReport.Swept` is removed; the log line has `kept_alive`, `marked_ended` and `shells_killed`. The `Reconcile`/`classifySessionsByOwnership`/`removeSessionRecord` docs no longer name a sweep, and `actOnReconcile`'s doc is gone. `rg '\.Swept\|"swept"' --glob '*.go'` has no hits. Repair, unknown-name reporting and the shell kill are unchanged (`reportAndSweepUnknown` is still called) | D2 (whole package: `TestReconcile_AliveFalseRowWithALiveMusterSessionIsRevivedNotSwept`, the unknown/shell tests and `TestDeleteSession_StoreFailureStillDropsMemory` for the remaining `announced=false` path) | pass |
| Edge 1 | `endedAt` is never re-stamped | D1 (exact store equality at every start) | pass |
| Edge 2 | A live `muster-<id>` with stored `alive=false` is revived | D2 `TestReconcile_AliveFalseRowWithALiveMusterSessionIsRevivedNotSwept` | pass |
| Edge 3 | A kept ended row keeps its note | D2 `TestNote_INV1_EveryInputFromEveryState/dead/reconcile_with_the_socket_empty`, `TestNote_INV1_ASessionWithNoNoteGainsNoneFromAnyInput/...` | pass |
| DIAG | `kb for internal/session/reconcile.go` and `kb for internal/session/manager.go` name only `kb:diagram/daemon-components` (package imports, unchanged). The lifecycle spec's inline state diagram has no reconcile edges. The plan has no `## Diagrams` delta | — | pass |

## Build & Tests

E2E tests: pass (140, scoped to 13 files) · Daemon tests (race): pass (`go test -race -count=1 ./...`, every package ok, `internal/session` 387.6 s) · Web tests: pass (3046 in 106 files) · Render tests: pass (425) · Daemon build: pass · Web build: pass · Lint: pass (golangci-lint 0 issues, web lint clean, e2e-lint clean, render-lint clean, contrast 0 failures, kb check 0 problems, render fixtures up to date) — all read from $GATES_LOG_DIR. `WARN size` (17 hits) is review-maintainability's.

## Acceptance Checks

| ID | Command | Result |
|----|---------|--------|
| D1 | `go test -count=1 -run 'TestReconcile_ARowWhosePaneDiedWhileDownSurvivesEverySubsequentStartAsEnded\|TestReconcile_ARowEndedBeforeShutdownComesBackEndedAtTheNextStart' ./internal/session/` | pass (21-D1.log, `ok … 0.804s`) |
| D2 | `go test -count=1 ./internal/session/` | pass (22-D2.log, `ok … 33.645s`) |
| D3 | `make lint` | pass (deduped to 02-lint.log, `golangci-lint run`, 0 issues) |
| E1 | `make e2e SPECS=web/e2e/reconcile.spec.ts` | pass (23-E1.log, 5 passed, E4 included) |
| DOC | doc upkeep + Doc Delta vs what shipped | FAIL. The Doc Delta has no line for the actions or notes spec sentences this plan made false (Major 1). Accepted `kb:adr/notes-ended-row-sweep-takes-its-note` is still unsuperseded (Major 2). daemon-impl's `internal/store/CLAUDE.md` doc-delta line is unamended (Major 3). The TODO tick is the sweep loop's, so the open e1/e2 entries in `TODO.md` are no failure. The new ADR is present: `proposed`, `refs: plan:sweep-2026-11-03-1`, and it describes what shipped. The logs have no `deviation:` lines. |

## Reviewer-Verified Criteria

| ID | Criterion | Result | Evidence |
|----|-----------|--------|----------|
| RV1 | `cmd/musterd/onexit.go` and the web dashboard are unchanged; no protocol message, field or anchor changes | pass | `git diff --stat main..HEAD -- cmd/ web/src` is empty, and `docs/protocol.md` is not in the diff. `ReconcileReport` is an internal Go type, and the `swept` key was only in a log line |
| RV2 | The `removeSessionRecord` comment names only the callers that remain | pass | It now names "DeleteSession's launch rollback and Remove". `rg 'removeSessionRecord\('` finds only `actions.go:276` (Remove, `announced=true`) and `manager.go:426` (DeleteSession, `announced=false`) |

## Hard-Rule Checklist

| # | Rule | Result |
|---|------|--------|
| 1 | Adapter boundary | pass (the diff adds no Claude Code format knowledge) |
| 2 | No terminal-output state parsing | pass |
| 3 | Non-blocking hook handler | pass (no hook path touched) |
| 4 | tmux via `-L muster` / no `resize-pane` sizing | pass (no tmux invocation added) |
| 5 | No payload logging | pass (the log line now has fewer keys) |
| 6 | Empty-gauge honesty | pass (n/a, no display path) |
| 7 | Identity on tmux target | pass (classification still keys on `muster-<id>`) |
| 8 | No settings trespass / `CLAUDE_CONFIG_DIR` | pass |
| 9 | No real `claude` in tests | pass (fake `TmuxSessions`, e2e stub) |

## Issues

### Critical

None.

### Major

1. **[orchestrator]** The plan's `## Doc Delta` has lines for lifecycle and protocol only. Two Touches-feature specs now state the swept behaviour this plan removed. `docs/features/actions/spec.md:55-57` says "Dead sessions ended in an earlier daemon lifetime are swept at the next start (kb:adr/lifecycle-ended-rows-swept-next-start), so a Resume chance is one daemon lifetime long". `docs/features/notes/spec.md:28` says the note lasts "until Remove or the next daemon start … the start-up sweep of an already-ended row deletes its note with the row". doc-reconcile promotes the delta verbatim, so both sentences stay false after reconcile. A fix must add one Doc Delta line each for **actions** (an ended row stays resumable until Remove, at every later start; cite kb:adr/lifecycle-ended-rows-kept-until-remove) and **notes** (an ended row's note lasts until Remove; no start-up sweep). The code backs both: `reconcile.go` `classifySessionsByOwnership`, and the note subtests in D2.
2. **[orchestrator]** Accepted `docs/adr/notes-ended-row-sweep-takes-its-note.md` still says in its summary, Decision and Consequences that "the start-up sweep of an already-ended row deletes its note" and that a note lasts "until Remove or the next daemon start". That is false once this branch lands. The new ADR only `refs` it, and its `supersedes` names only `lifecycle-reconcile-converges-with-the-socket`. A fix must make the record set true. One way is to add `notes-ended-row-sweep-takes-its-note` to the new ADR's `supersedes`, since the new ADR already restates "a note follows its row … now lasts until Remove". The other is a separate proposed notes ADR. Either way, `make gen-kb && make check-kb` must run afterwards.
3. **[orchestrator]** `daemon-implementation.md` has a `doc-delta:` line that the plan's Doc Delta does not reflect. The line is about `internal/store/CLAUDE.md:17`, a hand-written Gotchas line in a package this plan touched (`internal/store/session.go`). It still reads "Ended rows are swept on the next start; live rows whose pane is gone are kept as ended (kb:adr/lifecycle-ended-rows-swept-next-start)". A fix must make that line say that a start keeps every ended row until Remove (kb:adr/lifecycle-ended-rows-kept-until-remove), or drop it.

### Minor

1. **[orchestrator]** "Promote to Features": `**Touches**: actions, notes` lists two features whose spec-described behaviour this plan changed (Major 1). The new ADR itself declares `features: [lifecycle, actions, notes]`. Both should move to `**Features**`.

### Notes

1. **[note]** The E2 title now says the row "stays kept until removed", but its body (unchanged, as the plan says) does one restart, an explicit Remove and a second restart. The E2E level does not show the row surviving a second start without a Remove. D1's start-3..5 loop covers that property at the unit level, so no coverage gap results.
2. **[note]** `docs/adr/lifecycle-ended-rows-swept-next-start.md` (superseded) had its `tests:` entry repointed at the renamed `TestReconcile_KeepsEndedRows…`, which now asserts the opposite of that record's decision. This is harmless for a history record, and `kb check` presumably needs the name to resolve.
3. **[note]** The new ADR supersedes all of `lifecycle-reconcile-converges-with-the-socket`, not only its sweep clause. Its Decision restates the parts it keeps (revive on socket presence, repair, mark-ended), so nothing is lost when the old record flips to `superseded` at Completion.
4. **[note]** Test honesty: the only test repair after the implementation was the two `.Truncate(time.Second)` seeds (commit 9b5be697). It matches `store.encodeTime`'s RFC3339 whole-second encoding and keeps exact-equality assertions, so a re-stamp to start time would still fail them. Nothing was weakened. `test-specs.md` has no Repairs table, because no E2E Validate repair was needed. Deleting `TestReconcile_SweptRowStoreFailureStillDropsMemory` loses no coverage: `TestDeleteSession_StoreFailureStillDropsMemory` covers the one remaining `announced=false` store-failure path.
