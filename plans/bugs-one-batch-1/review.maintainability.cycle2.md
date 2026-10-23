# Maintainability review: bugs-one-batch-1

**Plan**: bugs-one-batch-1
**Verdict**: approved
**Cycle**: 2
**Pack**: kb: pack 30429 words (budget 30000)
**Scope**: 19 files from `git diff main...HEAD -- cmd internal web/src ':!*_test.go' ':!*.test.ts'` (347+, 92-). This is a full review because cycle 1 had a Major. Only six of the 19 changed in `9718930d..HEAD`: `renderfix_scenarios_reader.go`, `apply.go`, `liveness.go`, `manager.go`, `railmenuitems.ts` and `pane.ts`, which is new to the scope. I re-read those six against their siblings. The other 13 are byte-identical to what cycle 1 reviewed, and their cycle-1 rows stand.

## Prior findings (cycle 1)

| Prior finding | Fix commit | Verified how |
|---|---|---|
| Major 1: `driveReaderDocsLargePair` copied `driveReaderDiagramsPair` | 1b21a0ac | Closed. One `driveReaderPair(names [2]string, docs func() []findDoc)` at `renderfix_scenarios_reader.go:114`, and both scenario rows (`:36`, `:40`) call it. `rg -n 'driveReader.*Pair' internal` finds only that function and those two rows. It returns the `func(context.Context, *renderRig) error` shape that `withPrefs` (`renderfix_scenarios.go:51`) takes and returns, so it composes the way the sibling combinator does. Gates `06-render-fixtures` is green, so the fixture names and the fixtures did not change. |
| Minor 1: two owners of the label → `{label, action, danger}` mapping, and no `design:` line | 82afb208 | Closed. `menuEntry(label)` (`railmenuitems.ts:49-51`) is the only home: `rg -n 'ACTION_BY_LABEL\[\|MENU_TEXT\[' web/src` gives `railmenuitems.ts:50` and the pre-existing `render/actionbutton.ts:19`, the select-bar button and not a menu entry. Both builders spread it and add their own `disabled`. The web Fix Attempt 1 has a `design:` line for `menuEntry` and `selectionMenuItems`. The label now uses the existing `sessionsPhrase` (`sessions/sections.ts:275`) instead of a third count phrase. |
| Minor 2: SessionEnd watch neither on `m.wg` nor ended by `m.cancel` | 1b21a0ac | Closed. `spawn` (`liveness.go:17-28`) runs `run(m.runCtx)` on `m.wg`, under `spawnMu`, and starts nothing once `stopped` is set. `Start` (`:13-15`) and the watch (`apply.go:123`) both go through it. `Stop` (`:30-38`) flips `stopped` under `spawnMu`, then cancels `runCtx`, then waits. The watch's `select` gained `case <-ctx.Done()` (`:175`), and each pass's `checkCtx` derives from `runCtx`. The write after `Stop` that cycle 1 described (watch passes the `stopped` check, `Stop` runs, `storeSnapshot` writes) is now closed: `Stop` cancels the pass's ctx and waits for it on `wg`. The `wg.Add`-racing-`Wait` reason cycle 1 named is handled by `spawnMu` rather than avoided. The `design:` line names every writer and guard (`stopped`, `spawnMu`, `runCtx`/`cancel`). |

## Files

| File | Siblings opened | design: line | Size warnings | Result |
|------|-----------------|--------------|---------------|--------|
| internal/server/renderfix_scenarios_reader.go | renderfix_scenarios.go (`withPrefs`, `renderScenario`), same file's `driveReaderSession` / `driveReaderDiagrams` | yes (Fix Attempt 1: `driveReaderPair`) | funlen ×2 on the untouched `readerDocs`, `readerMermaidDocs` | pass (Major 1 closed) |
| internal/session/apply.go | liveness.go, manager.go | yes | none | pass |
| internal/session/liveness.go | manager.go (`stopped`, `wg`, `cancel`, `runCtx`, `spawnMu`), apply.go; server/bgloop.go (`bgLoop.start`/`stop`), server/ingest.go (`Start`/`Stop`) | yes (Fix Attempt 1: `spawn`, shared state named) | none | pass (Minor 2 closed); notes 1, 2 |
| internal/session/manager.go | liveness.go | yes | filelen 632 (622 on `main`, +10: two constants, three fields, two `NewManager` lines); reason holds | pass |
| web/src/api/http.ts | unchanged since cycle 1 | REQ-9 Decisions line | none | pass (cycle 1) |
| web/src/doc.ts | unchanged since cycle 1 | REQ-10 Decisions line | none | pass (cycle 1) |
| web/src/features/CLAUDE.md | unchanged since cycle 1 | — | — | pass (cycle 1) |
| web/src/features/actions.ts | unchanged since cycle 1 | REQ-9 Decisions line | none | pass (cycle 1) |
| web/src/features/groups.ts | unchanged since cycle 1 | yes | filelen 507 (507 on `main`, no net growth) | pass (cycle 1) |
| web/src/features/notes.ts | unchanged since cycle 1 | yes | none | pass (cycle 1) |
| web/src/features/railmenu.ts | unchanged since cycle 1; re-read `:30-40` as `menuEntry`'s consumer | yes | none | pass |
| web/src/features/railmenuitems.ts | railmenu.ts, sessions/card.ts (`ACTION_BY_LABEL`, `actionEnabled`), sessions/sections.ts (`sessionsPhrase`, its imports: no `features/` import, so no cycle), render/actionbutton.ts | yes (Fix Attempt 1) | none | pass (Minor 1 closed) |
| web/src/features/reader.ts | unchanged since cycle 1 | yes | filelen 707 (688 on `main`); reason holds | pass (cycle 1) |
| web/src/features/readerscroll.ts | unchanged since cycle 1 | yes | none | pass (cycle 1) |
| web/src/main.ts | unchanged since cycle 1 | — (one-line registration) | none | pass (cycle 1) |
| web/src/reader/memory.ts | unchanged since cycle 1 | yes | none | pass (cycle 1) |
| web/src/terminal/pane.ts | terminal/shellkeys.ts, terminal/drop.ts; `rg -n 'new Terminal\(' web/src` → `pane.ts:125` only | yes (Fix Attempt 1: "the xterm fix is an option, not a handler", alternatives named) | none | pass |
| web/src/terminal/shellkeys.ts | unchanged since cycle 1 | — | none | pass (cycle 1) |
| web/src/wsapp.ts | unchanged since cycle 1 | REQ-10 Decisions line | none | pass (cycle 1) |

## Issues

### Critical

None.

### Major

None.

### Minor

None.

### Notes

1. **[note]** `Manager.spawn` (`internal/session/liveness.go:17-28`) and `bgLoop.start`/`stop` (`internal/server/bgloop.go:22-38`) are both start-on-a-cancellable-ctx-and-track-on-a-WaitGroup helpers. They are not a copy. `session` cannot import `server`. `spawn` runs many goroutines on one ctx and adds the `stopped`-under-`spawnMu` gate that `bgLoop` (one loop, "Call once") does not need. Its `design:` line says it generalises the session package's own former `Start`, the only `go func` there (`rg 'go func|m\.wg' internal/session` in the log). No change requested. If a third such helper appears, hoisting one into a leaf package like `internal/boundedwait` is the move.
2. **[note]** Shared state, re-checked for the new guard. `spawn` holds `spawnMu` across the `stopped` check and `wg.Add`. `Stop` holds it across `stopped.Store(true)` and releases it before `cancel` and `Wait`, so no `Add` can follow `Wait`'s start. `spawnMu` is a leaf lock: nothing else is taken while it is held, and `Apply` calls `spawn` at its end, outside `m.mu`. `runCtx` and `cancel` are written once, in `NewManager`. I found no interleaving. The gates' `test` line (`go test -race -count=1 ./...`, `02-test.log`) is green for `internal/session` (398 s) and `internal/server`. Cycle 1's Note 1 (each pass bounded by `endRemoveTmuxTimeout`, 5 s) stands as it was, by the implementer's choice. Cancelling `runCtx` now ends any pass at once, so `Stop` no longer depends on that bound.
3. **[note]** Size: every `funlen` hit in `01-size.log` names either a test already on `main` (`manager_test.go`, checked in cycle 1) or the untouched `readerDocs` / `readerMermaidDocs` data tables. All three file-length hits are on files that were over 500 lines on `main`.
4. **[note]** Component diagram: this cycle adds no new module or dependency edge. `features/railmenuitems.ts → sessions/sections.ts` is a call from `features/` into `sessions/`, the same direction as its existing `sessions/card.ts` import.
