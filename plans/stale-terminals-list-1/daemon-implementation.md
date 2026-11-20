# Daemon Implementation: stale-terminals-list-1

**Plan**: stale-terminals-list-1
**Mode**: initial
**Pack**: kb: pack 20975 words (budget 30000)

## Changes

| File | Action | What and Why |
|------|--------|--------------|
| `internal/server/shellactivity.go` | modified | Poller counter `rev` and per-session `revs`, assigned in `reconcile` under `mu` (inside `tickMu`); `snapshot()` returns lists and rev in one lock hold; `revFor`; `Current()` kept as a wrapper (REQ-1,2,3) |
| `internal/server/terminalswire.go` | modified | `terminalsMessage.Rev` |
| `internal/server/shells.go` | modified | Four routes answer `rev` read after `changed`; DELETE answers `200 {rev}`; `spawnInSession` also returns the id (REQ-3,4) |
| `internal/server/state.go` | modified | `Snapshot.TerminalsRev`, always present (REQ-2) |
| `internal/server/server.go` | modified | `newShellFeature` gets `poller.revFor` |
| `web/render/fixtures/*.json` | regenerated | 119 files gain `terminalsRev`; second generation byte-identical, so no normaliser change |

## Decisions

- Seam kept: `poller.broadcast` stays `func(int64, []terminalWire)`; the hub closure reads `poller.revFor(id)`, which `reconcile` set before calling it (tickMu serialises, so it is that broadcast's rev). Existing test helpers compile unchanged and the red tests ran green here.
- design: rev bookkeeping lives in the existing poller beside `terms`, guarded by the existing `mu` (writers: `reconcile` only, under `tickMu`). rg for an existing counter/revision type in internal/server found none; matched the poller's own `terms` map.
- design: `snapshot()` is new; `Current()` kept as its wrapper because shellactivity_test.go calls it. `shellFeature` takes `revFor` as a second function param next to `changed`, matching that existing function-field style.
- design: `reconcile` collects pending broadcasts and assigns revs in one `mu` hold, then broadcasts in that order, so revs leave in order and a snapshot's lists are never older than its rev (V1). A snapshot taken between assignment and broadcast carries a rev ahead of messages still queued; those arrive at or below it and the window drops them, which the contract wants.
- size: one warning on a touched production file, `internal/server/server.go` `New` (funlen, 56 statements > 40), unchanged from `main`: this diff changes one argument on an existing registration line and adds no statement to `New`, which is the composition root's list of one-line registrations. Not split (kb:adr/process-size-linters-warn-never-fail). (Corrected by the orchestrator, review cycle 1 maintainability Minor 1: the line first placed the warning in a test file.)

## Handoff

**Build status**: `go build ./...` exits 0; `make lint` 0 issues; gofmt/vet clean; `go test -run TestTerminalsRev ./internal/server/` ok. No test file is sanctioned-broken (all compile).

Tests red by behaviour, to repair: `TestBuildSnapshot_M0Shape` (state_test.go), and in terminals_test.go `TestHandleCloseTerminal_SocketsAndBroadcastAcrossSessions1And12`, `TestHandleNewTerminal_SpawnsLowestFreeAndReportsDefaultName` (reply struct equality), `TestHandleCreateShell_ReturnsLowestRunningTerminalWithN` (reply struct equality), `TestHandleCloseTerminal_EndsOnlyThatTerminalOfOnlyThatSession` (204). Confirms the plan's list (lines 194/197/237/324). `TestHandleIngest_BodyAtLimitPersists` failed once under full-package -race load (28 s) and passes alone; unrelated.
