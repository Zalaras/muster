# Maintainability review: better-terminal

**Plan**: better-terminal
**Verdict**: needs-changes
**Cycle**: 1
**Pack**: kb: pack 18432 words (budget 30000)
**Scope**: 43 files from the branch diff against main over cmd, internal, web/src (test files excluded)

## Files

| File | Siblings opened | design: line | Size warnings | Result |
|------|-----------------|--------------|---------------|--------|
| internal/server/CLAUDE.md | — (generated trailer) | n/a | — | pass |
| internal/server/launcher.go | shellregistry.go (consumer of `paneSpawner`) | n/a (one interface method) | funlen `ResumeLocked` ×1, filelen 629 — both pre-existing, untouched code | pass (note 1) |
| internal/server/renderfix.go | renderfix_scenarios*.go | yes (Fix Attempt 1) | filelen 600 (564 on main), no reason | Minor 4 |
| internal/server/renderfix_scenarios.go | renderfix_scenarios_focus.go, _misc.go | yes | — | pass |
| internal/server/renderfix_scenarios_focus.go | renderfix_scenarios.go | yes | — | pass |
| internal/server/renderfix_scenarios_misc.go | renderfix_scenarios.go | n/a (scenarios) | — | pass |
| internal/server/server.go | usage.go wiring (`usageFeat.aggregator` precedent) | n/a | funlen `New` 56>40, pre-existing (+2 statements) | pass (note 1) |
| internal/server/shellactivity.go | usagepoll.go, themepoll.go | yes | — | Minor 2 |
| internal/server/shellregistry.go | shells.go (main), keyedlock use in session.Manager | yes | — | pass |
| internal/server/shells.go | rename.go, respond.go, actions.go | yes | — | Minor 3 |
| internal/server/state.go | — | n/a | — | pass |
| internal/server/terminal.go | shells.go | yes | filelen 534, reason given, holds | pass |
| internal/server/terminalnames.go | terminal.go (`terminalKey`) | yes | — | pass (note 3) |
| internal/session/reconcile.go | — | n/a (rename of a field) | — | pass |
| internal/tmux/CLAUDE.md | — (generated trailer) | n/a | — | pass |
| internal/tmux/tmux.go | its own `SessionName`/`ParseSessionName` | yes | filelen 788, reason given, holds | pass |
| web/src/api/sessions.ts | its own `parseCreateShellResult`, `putNote` | n/a | — | pass |
| web/src/app.ts | — | n/a | — | pass |
| web/src/doc.ts | — | n/a | — | pass |
| web/src/features/CLAUDE.md | — | n/a | — | pass |
| web/src/features/focus.ts | tiles.ts | n/a | — | pass |
| web/src/features/surfaces.ts | reader.ts, restart.ts | yes | — | pass (note 5) |
| web/src/features/terminalspanel.ts | restart.ts, menu users | yes | — | pass |
| web/src/features/tiles.ts | focus.ts | n/a | — | pass |
| web/src/main.ts | — | n/a | — | pass (one-line registration) |
| web/src/protocol/messages.ts | protocol/theme.ts, update.ts, usage.ts, decode.ts | n/a | — | pass |
| web/src/protocol/terminals.ts | protocol/theme.ts, groups.ts, decode.ts | n/a (matches siblings) | — | pass |
| web/src/render/CLAUDE.md | — | n/a | — | pass |
| web/src/render/confirm.ts | — | yes | — | pass |
| web/src/render/mainhead.ts | surfaceseg.ts | n/a | — | pass |
| web/src/render/menu.ts | popover.ts, grouppopover.ts, restart.ts | yes | — | pass (note 2) |
| web/src/render/popover.ts | menu.ts (main), anchored.ts | yes | — | pass |
| web/src/render/surfaceseg.ts | mainhead.ts, tiles.ts | n/a | — | pass |
| web/src/render/terminalspanel.ts | keyedreorder.ts, focuskeep.ts, reader.ts, rename.ts, railsections.ts | yes | — | Major 1, Minor 1 |
| web/src/render/tiles.ts | — | n/a | — | pass |
| web/src/style.css | — | n/a | — | pass |
| web/src/terminal/CLAUDE.md | — | n/a | — | pass |
| web/src/terminal/pane.ts | — | n/a | — | pass |
| web/src/terminal/shellactivity.ts | terminals.ts | n/a | — | pass |
| web/src/terminal/surfaceswitch.ts | terminals.ts | yes | — | pass |
| web/src/terminal/terminals.ts | shellactivity.ts, surfaceswitch.ts | yes | — | pass |
| web/src/ws.ts | wsapp.ts | n/a | — | pass |
| web/src/wsapp.ts | ws.ts | n/a | — | pass |

## Issues

### Critical

### Major
1. **[web-impl]** `web/src/render/terminalspanel.ts:162` `position()` is a second implementation of `render/keyedreorder.ts:27` `reconcileKeyedOrder`: the same "walk the ordered roots, `insertBefore` only a root not already in its slot" loop (`desired = previous ? previous.nextElementSibling : list.firstElementChild; if (desired !== row.root) list.insertBefore(...)` against keyedreorder.ts:33-37, line for line). Breaks conventions § Design "Reuse before add" ("What it finds is reused or generalised, never copied, whatever Decisions says"). The `design:` line's reason ("that helper is keyed by session id, so not reusable") is contradicted by the helper itself: `export interface KeyedReorderEntry { id: number | string; root: HTMLElement; }`, and it is already reused for non-session keys with no focus capture: `render/reader.ts:407` `reconcileKeyedOrder(container, entries, null);` (keyed by file path) and `render/railsections.ts:477` (section keys). An rg for insertBefore across web/src non-test files shows the only hand-rolled reorder loops are keyedreorder.ts:37 and terminalspanel.ts:169. A fix must make true: the panel's row positioning goes through `reconcileKeyedOrder` (its own focus restore may stay local, as reader.ts:406-408 keeps `captureFocusedKey`/`restoreFocusedKey` beside the call), and the `design:` line says so.
   id: web/src/render/terminalspanel.ts:position:duplicates reconcileKeyedOrder | confidence: 88

### Minor
1. **[web-impl]** `web/src/render/terminalspanel.ts:123` `startRename`/`endRename` is the dashboard's third button-to-input inline rename field (Enter commits, Escape cancels, blur closes) beside `render/rename.ts:45` `attachRenameEditor` (session titles; "swaps that exact button node out for an `input.name-edit` and back") and `render/railsections.ts:241` `openNameField` (group names, `input.maxLength = 40`). The `design:` line for `render/terminalspanel.ts` greps the reorder helper but not these (§ Design "Reuse before add": "rg for one that already does it and paste the grep in Decisions"). A fix must make true: either one of the existing editors is generalised and used, or the Decisions `design:` line pastes the grep and states why neither fits (rename.ts is bound to `Session`/`titleCommand`, for instance).
   id: web/src/render/terminalspanel.ts:startRename:third inline rename field | confidence: 65
2. **[daemon-impl]** `internal/server/shellactivity.go:45,68`: `shellActivityFeature`/`shellActivityPoller` (and `s.shellActivity` in server.go) now own the whole terminal list. `terminalWire`, `terminalsMessage`, the snapshot's `terminals` key and the name lookup all live in a file and type still named for the busy flag alone. The exemplar shape (`internal/server/CLAUDE.md` Exemplar: `usage.go` + `usagewire.go` + `usagepoll.go`) names a feature for what it owns; a newcomer looking for the `terminals` wire finds it in `shellactivity.go`. The web side did make the split (`terminal/terminals.ts` for the list, `terminal/shellactivity.ts` kept for the activity reducer). Cites § Design "Match the siblings" (naming) and "One owner per concept". The `design:` line explains reusing the poller, not keeping its name. A fix must make true: the type and file names say they own the terminal list, or the `design:` line states why the old name stays.
   id: internal/server/shellactivity.go:shellActivityFeature:name no longer matches role | confidence: 70
3. **[daemon-impl]** `internal/server/shells.go:109` `spawnInSession` writes its own error responses but returns nothing, so both callers infer success from a side effect: `if resp.Target != "" { writeJSON(...) }` (shells.go:142, :154). Every sibling guard in this package that may write the response returns the outcome, and callers branch on it: `respond.go:94` `func parseSessionID(w http.ResponseWriter, r *http.Request) (int64, bool)`, `respond.go:112` `func sessionOr404(w http.ResponseWriter, manager sessionGetter, id int64) (*session.Session, bool)`. Cites § Design "Match the siblings" (seam, error path). A fix must make true: `spawnInSession` reports whether it succeeded, and callers branch on that, not on a field of the response body.
   id: internal/server/shells.go:spawnInSession:success inferred from resp field | confidence: 75
4. **[daemon-impl]** `internal/server/renderfix.go` is 600 lines (size gate: `file is 600 lines (threshold 500) (filelen)`; 564 on main) and this branch added 36 (the `ListSessions` fake and the rewritten `repoTick`) with no reason in either Decisions section; Fix Attempt 1's `design:` line explains where the retry loop lives, not the file length. Rule: kb:adr/process-size-linters-warn-never-fail, § Design "Size is read, not obeyed". A fix must make true: Decisions carries a reason that holds, or the rig is restructured along a real seam (the scenario files are already split as `renderfix_scenarios*.go`), not a split that only silences the warning.
   id: internal/server/renderfix.go:file:over 500 no reason | confidence: 75

### Notes
1. **[note]** Pre-existing size hits on touched files, not grown by a concern of this plan: `launcher.go` `ResumeLocked` funlen 62>60 and filelen 629 (the diff adds one interface method), `server.go` `New` 56>40 statements (+2: `terminalNames`, the hoisted `shellActivity`). `terminal.go` (534) and `tmux.go` (788) carry a reason in Decisions that holds for the few functions added.
2. **[note]** With `render/popover.ts` now the shared anchor/outside-click/Escape/focus-return part, `render/restart.ts` and `render/grouppopover.ts` remain hand-rolled copies of the same shape (pre-existing; the `design:` line names them as left alone). A follow-up to fold them in is worth proposing.
3. **[note]** `internal/server/terminalnames.go:10` `terminalID{session, n}` and `internal/server/terminal.go:73` `terminalKey{sessionID, surface, n}` are two key types for the same (session, terminal) pair in one package, with different field names. Not asked to change; a reader will wonder which to use.
4. **[note]** A session's terminal list is derived in two places: `shellRegistry.running` (`ListSessions` under the per-id lock, for lowest-free `n`) and `shellActivityPoller.tick` (`ListPaneActivity`, cached for the wire). The daemon `design:` line gives the reason (fresh truth under the lock); it holds. Daemon shared state is guarded and named (`terms` by `mu`, tick/sync by `tickMu`, `terminalNames.names` by its `mu`); no lock-order cycle found (sync takes `tickMu` then the names and registry mutexes; nothing holding those takes `tickMu`).
5. **[note]** For `review-work`: `features/surfaces.ts` `renameTerminal`/`closeTerminal` discard the `ApiResult` (`void renameTerminal(...)`), so a refused rename (`name_too_long`) or a failed close shows nothing; and the popover extraction changes `menu.ts` behaviour (a scroll inside the panel and a pointerdown inside an open `dialog` no longer close a menu). Behaviour, not shape.
6. **[note]** For `review-work` (DIAG): `kb:diagram/web-components` counts "main.ts inits 22 controllers" and "features/ 52 modules, 21 stateful controllers"; `features/terminalspanel.ts` adds one controller and `render/popover.ts` one render module.
