# Daemon Implementation: sweep-2026-11-03-1

**Plan**: sweep-2026-11-03-1
**Mode**: initial
**Pack**: kb: pack 33388 words (budget 30000)

## Changes

| File | Action | What and Why |
|------|--------|--------------|
| `internal/session/reconcile.go` | modified | REQ-1/REQ-3: `classifySessionsByOwnership` returns only `toEnd` (an absent `alive=false` row is skipped); `actOnReconcile` loses the sweep loop; `ReconcileReport.Swept` and the `swept` log key removed; `Reconcile` doc comment states the keep rule and cites kb:adr/lifecycle-ended-rows-kept-until-remove |
| `internal/session/manager.go` | modified | REQ-3: `removeSessionRecord` comment names only DeleteSession's rollback and Remove; `OnRemoved` paragraph drops the startup sweep |
| `internal/session/apply.go` | modified | comment only: `removeFromMemory` callers no longer list Reconcile's sweep |
| `internal/store/session.go` | modified | comment only (two spots): id-watermark comments no longer list reconcile's sweep as a delete path |
| `internal/server/server.go` | modified | comment only: the poll-stop comment no longer says Reconcile would sweep the row |

REQ-2 needs no code beyond REQ-1: `cmd/musterd/onexit.go` keeps writing `alive=0` and the row is now kept (unchanged, per the plan's Reviewer-Verified list).

## Decisions

- design: no new type, helper or package. `rg -n "Swept|swept" --glob '*.go' internal cmd` after the change hits only test comments/names ("NotSwept"); the existing `classifySessionsByOwnership`/`actOnReconcile` pair keeps its shape and just loses the second return value.
- design: `toEnd` is returned bare rather than as a one-field struct; the act phase has one worklist now.
- design: I rewrote only the comments the plan names plus three more that stated the removed behaviour as fact (`apply.go`, `store/session.go`, `server.go`); each was a doc comment made false by this change.
- Size warnings: none introduced; `internal/store/session.go` (549 lines) was already over the 500 threshold, I changed two comment lines only.
- No deviation from the plan. No wire shape touched.
- doc-delta: `cmd/musterd/onexit.go:30-33` comment still says a racing liveness tick would make a restart's Reconcile "sweep a row it should have kept"; the plan lists onexit.go as unchanged so I left it. It is now inaccurate (the row is kept either way, only its `endedAt` differs) and the orchestrator/doc-reconcile should decide whether to reword it.
- doc-delta: `internal/store/CLAUDE.md` Gotchas line "Ended rows are swept on the next start; live rows whose pane is gone are kept as ended (kb:adr/lifecycle-ended-rows-swept-next-start)" becomes false; it is outside the plan's Doc Delta list.
- doc-delta: `docs/protocol.md` `kb:anchor/ws.session-removed` text "Startup sweeps send nothing" cited by the old `removeSessionRecord` comment is covered by the plan's protocol delta.

## Handoff

**Build status**: `go build ./...` exits 0; `make lint` 0 issues; `golangci-lint run --tests=false ./...` 0 issues; `gofmt -l .` empty; `go vet ./...` clean.

Results: `make e2e SPECS=web/e2e/reconcile.spec.ts` 5 passed (E4 green). `go test ./internal/store ./internal/server ./cmd/...` ok. `go test -count=1 ./internal/session/` (also under -race for the Reconcile/Note/Apply/DeleteSession/Remove selection): the two proof tests that were red for the *sweep* now pass their sweep assertions (`TestReconcile_ARowEndedBeforeShutdownComesBackEndedAtTheNextStart`, both `TestNote_INV1_*/dead/reconcile_with_the_socket_empty`, `TestApply_SessionEndAfterStopKeepsResumeChance` green). The full-package `-race` run did not finish in 10+ minutes (a test binary at ~100% CPU, killed); the package without `-race` takes 35 s. I did not investigate whether that is pre-existing.

**Two tests remain red, and the defect is in the test files, not the implementation** (test-agent repair needed):

- `internal/session/manager_test.go` `TestReconcile_KeepsEndedRowsMarksDeadPanesEndedLeavesLivePanesByteIdentical` (line ~1308: `endedAt.Equal(*keptEnded.EndedAt)`, message "endedAt is the stored value, not the start time"), and
- `internal/session/manager_test.go` `TestReconcile_ARowWhosePaneDiedWhileDownSurvivesEverySubsequentStartAsEnded` (`requireKeptEnded` line ~1360, `wantEndedAt.Equal(*row.EndedAt)`, message "endedAt in the store is the stored value", fired for the bystander at 1397 and 1403).

Cause: both seed `time.Now().UTC().Add(-time.Hour)` (nanosecond precision) and compare it with a value read back from the store, but `internal/store/store.go:86` is `encodeTime(t) = t.UTC().Format(time.RFC3339)`, whole seconds. The row is kept and its stored `endedAt` is unchanged (the `ReconcileReport`, `Exists`, `List()` and `Alive` assertions pass); only the sub-second tail of the test's own input differs. Fix: truncate `endedAt` (first test) and `bystanderEnded` (second) to `time.Second` when seeding. Not a sanctioned break from the Protocol Contract; there is none.

## Fix Attempt

n/a
