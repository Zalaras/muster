# Maintainability review: better-terminal

**Plan**: better-terminal
**Verdict**: needs-changes
**Cycle**: 2
**Pack**: kb: pack 20762 words (budget 30000)
**Scope**: delta re-review. 12 non-test files in `git diff c832c044..HEAD` over cmd, internal and web/src

## Delta

| Prior issue | Fix commit | Verified how |
|-------------|------------|--------------|
| Major 1: `render/terminalspanel.ts` `position()` duplicated `reconcileKeyedOrder` (id `web/src/render/terminalspanel.ts:position:duplicates reconcileKeyedOrder`) | bdcf47e1 | Fixed. `position(entries: readonly KeyedReorderEntry[])` now calls `reconcileKeyedOrder(list, entries, null)` (terminalspanel.ts:165). `update()` builds `{ id: terminal.n, root: row.root }` entries. The local `document.activeElement` capture/refocus stays beside the call, which the issue allowed. The hand-rolled `insertBefore` loop is gone, and the Decisions `design:` line was corrected (web-implementation.md:74). |

## Files

| File | Siblings opened | design: line | Size warnings | Result |
|------|-----------------|--------------|---------------|--------|
| internal/server/renderfix.go | renderfix_tmux.go, renderfix_scenarios*.go | yes (daemon Decisions, cycle 1 fix) | filelen 540 (564 on main), reason given and holds | pass (note 2) |
| internal/server/renderfix_scenarios_misc.go | renderfix_scenarios.go | n/a (one scenario's prefs) | — | pass |
| internal/server/renderfix_tmux.go | all 16 other `renderfix_*.go` files | yes ("real seam: the fake tmux vs the rig") | — | Major 1 |
| internal/server/shellactivity.go | terminalswire.go, usagepoll.go | yes (names kept, reason given) | — | pass |
| internal/server/shellregistry.go | shells.go | n/a (comments only) | — | pass |
| internal/server/shells.go | respond.go (`parseSessionID`, `sessionOr404`), terminal.go | yes | — | pass (note 1) |
| internal/server/terminal.go | shells.go | n/a (comments only) | filelen 534, reason holds (cycle 1) | pass (note 1) |
| internal/server/terminalswire.go | usagewire.go, sessionwire.go, updatewire.go, readerwire.go | yes (the usage.go/usagewire.go split) | — | pass |
| web/src/features/surfaces.ts | — | n/a (comment only) | — | pass |
| web/src/features/terminalspanel.ts | features/restart.ts | yes | — | pass |
| web/src/render/popover.ts | menu.ts (its other consumer) | yes (web Decisions, cycle 1 fix) | — | pass |
| web/src/render/terminalspanel.ts | keyedreorder.ts, reader.ts, railsections.ts | yes (corrected) | — | pass |

## Issues

### Critical

### Major
1. **[daemon-impl]** `internal/server/renderfix_tmux.go:1` has no `//go:build renderfix` line. Every other `renderfix_*.go` file in the package starts with one: renderfix.go, renderfix_normalise.go, renderfix_test.go and all thirteen `renderfix_scenarios*.go`. So the render rig's fake tmux (`renderTmux`, `newRenderTmux`) now compiles into the production `internal/server` package, and the only file that references it (`renderfix.go:139`, `TmuxClient: newRenderTmux()`) is tagged. Measured with a default-tag build:
   ```
   $ go list -f '{{join .GoFiles " "}}' ./internal/server | tr ' ' '\n' | grep renderfix
   renderfix_tmux.go
   ```
   Lint cannot catch this. `.golangci.yml` runs with `build-tags: [canary, renderfix]`, so `unused` never sees the untagged build in which `renderTmux` is dead (gate 03: `0 issues`). The file moved out of renderfix.go in b437aef2 without the tag. Cites the sibling divergence (renderfix_scenarios_misc.go:1 `//go:build renderfix`) and § Design "Match the siblings" (file layout). A fix must make true: renderfix_tmux.go is built only under the `renderfix` tag like its siblings, and `go list ./internal/server` without the tag lists no `renderfix_*` file.
   id: internal/server/renderfix_tmux.go:renderTmux:missing renderfix build tag | confidence: 95

### Minor

### Notes
1. **[note]** Since shells.go:265 now gives the shell pump a non-nil `nudge` (`func(ctx context.Context, _ int64) { f.changed(ctx) }`), both production `terminalPump`s carry a nudge. `pumpPTYToSocket`'s `nudgeOnEOF bool` parameter (terminal.go:432, passed as `p.nudge != nil` at :407, its only caller) and the `nudgeOnEOF && nudge != nil` guard at :454 can no longer be false in production. A later cleanup could drop the flag. The shape is otherwise sound: the shell surface now nudges the terminal-list sync, never the session's liveness.
2. **[note]** `renderfix.go` is down to 540 lines (564 on main). The Decisions reason ("the remainder is the rig's launch/hook/ingest/capture helpers that share `renderRig` state") holds for what is left, and the `renderTmux` split is a real seam. That closes cycle 1's Minor 4 except for the build tag in Major 1.
3. **[note]** Prior Minors 1–3 (`startRename` grep, `shellActivity*` naming, `spawnInSession` bool) are the orchestrator's to verify. For the record: `spawnInSession` now returns `bool` and both callers branch on it, matching `respond.go:94`/`:112`. The naming Minor was answered with a `design:` reason plus the `terminalswire.go` split, and the rename Minor with the pasted grep and a stated difference (cancel on blur).
4. **[note]** `render/popover.ts` gained two opt-in booleans (`ignoreOpenDialogs`, `keepOnInnerScroll`), off by default. `rg createPopover` shows `menu.ts` and `features/terminalspanel.ts` as the only consumers, and only the panel sets them. This matches the existing `closeOnTab` option style. Whether `menu.ts` behaviour is back to what main had is `review-work`'s to confirm.
