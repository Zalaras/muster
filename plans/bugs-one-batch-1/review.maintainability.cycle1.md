# Maintainability review: bugs-one-batch-1

**Plan**: bugs-one-batch-1
**Verdict**: needs-changes
**Cycle**: 1
**Pack**: kb: pack 30429 words (budget 30000)
**Scope**: 18 files from `git diff main...HEAD -- cmd internal web/src ':!*_test.go' ':!*.test.ts'` (313+, 71-)

## Files

| File | Siblings opened | design: line | Size warnings | Result |
|------|-----------------|--------------|---------------|--------|
| internal/server/renderfix_scenarios_reader.go | its own `driveReaderDiagramsPair` / `driveReaderSession` (same file), `withPrefs` scenarios | yes ("mirrors driveReaderDiagramsPair") | funlen ×2 (`readerDocs`, `readerMermaidDocs`): functions this branch did not touch | Major 1 |
| internal/session/apply.go | liveness.go, manager.go, machine.go (`KindDeathHint` case) | yes | none | Minor 2 (the `go` statement it adds) |
| internal/session/liveness.go | manager.go (`stopped`, `wg`, `cancel`), apply.go; server/terminal.go (PTY-EOF `Nudge` spawn), server/bgloop.go (`runTicked`) | yes ×4 | none | Minor 2; note 1 |
| internal/session/manager.go | liveness.go | yes (constants kept beside `defaultPollInterval`) | filelen 627 (was already over before this; +5 lines); reason holds | pass |
| web/src/api/http.ts | features/actions.ts, terminal/drop.ts (code-based branching) | REQ-9 Decisions line | none | pass |
| web/src/doc.ts | main.ts, wsapp.ts, features/updaterestart.ts | REQ-10 Decisions line | none | pass |
| web/src/features/CLAUDE.md | (doc, prose half only; trailer generated) | — | — | pass |
| web/src/features/actions.ts | api/http.ts, features/updaterestart.ts (only other `helloArrived` listener) | REQ-9 Decisions line | none | pass; note 3 |
| web/src/features/groups.ts | groupsselect.ts, railmenu.ts | yes (handle widened, not duplicated) | filelen 507→508; reason holds | pass |
| web/src/features/notes.ts | rail.ts:37, launch.ts:774, surfaces.ts:60 (`focusSelected`) | yes (precedent grep) | none | pass |
| web/src/features/railmenu.ts | railmenuitems.ts, groupsselect.ts, render/selectbar.ts, sessions/sections.ts | yes | none | pass; note 4 |
| web/src/features/railmenuitems.ts | railmenu.ts, sessions/card.ts, sessions/sections.ts | no line for `SelectionMenuItems` / `selectionMenuItems` | none | Minor 1 |
| web/src/features/reader.ts | readerfind.ts, readerscroll.ts, reader/memory.ts | yes | filelen 688→707; reason holds (logic is in readerscroll.ts) | pass |
| web/src/features/readerscroll.ts | readerfind.ts (shape it copies) | yes | none | pass |
| web/src/main.ts | doc.ts | — (one-line registration change) | none | pass |
| web/src/reader/memory.ts | protocol/decode.ts | yes (pure half beside the other `with*` transitions) | none | pass |
| web/src/terminal/shellkeys.ts | terminal/pane.ts:188 (sole caller) | — (body change to an existing pure function) | none | pass |
| web/src/wsapp.ts | doc.ts, main.ts, ws.ts | REQ-10 Decisions line | none | pass; note 5 |

## Issues

### Critical

None.

### Major

1. **[daemon-impl]** `driveReaderDocsLargePair` is a copy of `driveReaderDiagramsPair`. The two bodies are the same seven lines and differ only in the two session names and the docs function — `internal/server/renderfix_scenarios_reader.go:109-116` against `:125-132`:
   ```
   func driveReaderDocsLargePair(ctx context.Context, r *renderRig) error {
   	for _, name := range []string{"reader-large-a", "reader-large-b"} {
   		if _, err := driveReaderSession(ctx, r, name, name, readerLargeDocs()); err != nil {
   ...
   func driveReaderDiagramsPair(ctx context.Context, r *renderRig) error {
   	for _, name := range []string{"reader-a", "reader-b"} {
   		if _, err := driveReaderSession(ctx, r, name, name, readerMermaidDocs()); err != nil {
   ```
   The `design:` line says it "mirrors" the sibling. Conventions § Design, "Reuse before add", says a found helper "is reused or generalised, never copied, whatever Decisions says". A fix must leave one two-session driver, parameterised by the session names and the docs, that both scenario rows use. The fixture names and the recorded fixtures must not change.

### Minor

1. **[web-impl]** `selectionMenuItems` rebuilds `cardMenuItems`'s entry closure. Both map a `CardAction` to `{label: MENU_TEXT[label], action: ACTION_BY_LABEL[label], danger: label === "Remove", …}`: `web/src/features/railmenuitems.ts:53-58` and `:81-86`. The only difference is the `disabled` rule. So "which action is dangerous, and what text and action a label maps to" now has two owners in one file (conventions § Design, "One owner per concept"). The next field or label change has to be made twice. A fix must give the label → `{label, action, danger}` mapping one home, which both builders use and each adds its own `disabled` to. Separately, the new exported type and function have no `design:` line in `web-implementation.md` (the railmenu line covers only `openCard`/`openSelection`/`actionEntries`). Add a line that says where the selection rule lives and why.

2. **[daemon-impl]** `watchPaneAfterSessionEnd` (`internal/session/liveness.go:163-188`, started at `internal/session/apply.go:122-124`) is the first goroutine `Manager` starts that is neither on `m.wg` nor ended by `m.cancel`. Its sibling `Start`/`pollLoop` (`liveness.go:13-21`, `:103-110`) is on both. The loop takes a `ctx` that can never be done (`context.WithoutCancel`), and its `select` has no `ctx.Done()` case. Conventions § Go: "The daemon must shut down gracefully — nothing ignores ctx."

   The Decisions reason, "Stop must not block on a 3 s loop", does not hold as written. A loop that selected on a context `Stop` cancels would return at its next `select`, and its tmux call would fail at once on the cancelled `checkCtx`. Either way `Stop` would never wait out the 3 s cap.

   Here is what `stopped` alone leaves open. The watch passes `stopped.Load()` at `liveness.go:174`. Then `Stop` runs and shutdown proceeds. The watch then reaches `checkOneLiveness` with a live pane, and `captureAndStoreSnapshot` → `storeSnapshot` writes to the store after `Stop`. The `stopped` check at `:209` guards only the `markEnded` branch.

   A fix must make one of these true:
   - the watch ends when `Stop` runs, on a context `Stop` cancels, and `Stop` accounts for it the way it does for the poll loop; or
   - `## Decisions` states a reason that holds for keeping it detached. A real reason exists: `wg.Add` racing `Stop`'s `Wait` for an `Apply` that arrives during shutdown.

### Notes

1. **[note]** The watch bounds each check with `endRemoveTmuxTimeout` (`liveness.go:181`). That constant is named, and declared (`manager.go:74`), for End/Remove/Repair's tmux calls under the per-session lock. It is 5 s, longer than the watch's own 3 s cap (`sessionEndRecheckFor`), so one wedged check can outlive the cap. The sibling callers, `Nudge` and `pollLoop`, pass their ctx through unbounded. No change requested. Whoever next tunes End/Remove's timeout should know it also moves this loop.
2. **[note]** Size: every `funlen` hit in `internal/session/manager_test.go` names a test that already exists on `main` (checked with `git grep` on `main` for each of the six names), so none is this branch's. Both `funlen` hits in `renderfix_scenarios_reader.go` are on the untouched data tables `readerDocs` and `readerMermaidDocs`. The three file-length hits on touched files (`manager.go`, `groups.ts`, `reader.ts`) were all over 500 lines before this branch, and the Decisions reasons hold.
3. **[note]** `actions.ts:105-107` clears the action line on `helloArrived` by comparing the shown text with `networkError.message`, not the wire `code` the error carries (`terminal/drop.ts:99` branches on `code`). The REQ-9 Decisions line gives the reason: no `showError` signature changes. One constant has one owner (`api/http.ts:43`), so this is not a duplicate.
4. **[note]** For **review-work**: the selection menu offers Remove only when some selected session is dead (`railmenuitems.ts`, `sessions.some((s) => !s.alive)`). The selection bar enables Remove for any selection (`render/selectbar.ts:37`, `els.remove.disabled = !acts`). The "Stop has something to do iff any selected is alive" rule now has two homes: `sessions/sections.ts:353`'s `anyAlive` and the menu's `some`. Whether the two surfaces should agree is a requirement question, not a shape one. Also, `railmenu.ts:85-88`'s `many` callback silently drops any action other than `end`/`remove` because `CardMenuAction.action` is typed wider than what `selectionMenuItems` produces. It is harmless today.
5. **[note]** `wsapp.ts`: `updateWsHandlers` now also carries `onHelloArrived`, which `actions.ts` consumes as well as `updaterestart.ts`, so the name is narrower than its use. `dashboardWsHandlers` spreads `coreWsHandlers` and `updateWsHandlers` itself (`:82-83`) rather than spreading `popoutWsHandlers`. No change requested.
6. **[note]** Component diagram: the only new module is `web/src/features/readerscroll.ts`, and commit `2223999c` already counts it in `kb:diagram/web-components`. No new Go package or dependency edge.
7. **[note]** Shared state: the watch, the poll loop and `Nudge` can call `checkOneLiveness` for the same id at once. `markEnded` is idempotent under `m.mu` (`liveness.go:228-239`), and `storeSnapshot` takes `m.mu` plus the write ticket. The gates' `test` line is `go test -race -count=1 ./...` and it is green. I found no interleaving on unguarded memory. On the web side, `readerscroll.ts`'s `restoring`/`latest`/`timer` and `actions.ts`'s `shownMessage` each have a single writer.
