# Review: better-terminal

**Plan**: better-terminal
**Verdict**: needs-changes
**Cycle**: 2
**Gates**: 0 failed
**Parts**: code, maintainability | skipped: browser
**Part verdicts**: code approved, maintainability needs-changes

_Merged by orch-state.py merge-review; the verdict is computed from the parts and the gate run, never edited by hand._

## Correctness review

# Correctness review: better-terminal

**Plan**: better-terminal
**Part verdict**: approved
**Cycle**: 2
**Pack**: kb: pack 77708 words (budget 30000)

Delta scope: the diff c832c044..HEAD (14 commits, `d80cb0d6`..`f623c0ba`). §1 and §2 run in full; §3–§6 cover the files that diff touches.

## Requirements

| Req | Implemented | Tested | Status |
|-----|-------------|--------|--------|
| REQ-1..REQ-4, REQ-6..REQ-10, REQ-12..REQ-19 | unchanged since cycle 1 (pass) | unchanged | pass |
| REQ-5 Close | Yes | E8 now waits for terminal 2 to be shown, attached and at its prompt (`typeInTerminal`); green in 21-e2e.log | pass |
| REQ-11 Panel rows | Yes — `.tpanel .trow.on` → `--bg-hover` | R5 now shows `shell 1` through a stubbed `POST …/shell`, asserts `aria-current` on that row only, and asserts its background equals `--bg-hover` with the pointer away (the `build` row background does not) | pass |
| REQ-16 Tile footer fit 3×2 | Yes | R2 on `terminals-two-tiles`, now recorded at `"density": "3x2"`; spliced frame removed | pass |
| INV-1 bystanders | Yes | D3 now fully covered: `terminals_sockets_test.go` (sockets, broadcast, sessions 1 and 12) | pass |
| INV-2..INV-5 | unchanged | unchanged | pass |
| Protocol contract (both sides) | `terminalWire`/`terminalsMessage` moved to `terminalswire.go` with the same tags and field order (`n,name,busy`; `type,sessionId,terminals`). A terminal PTY ending now broadcasts the list (`shells.go:265` → `f.changed`, under `context.WithoutCancel`), which makes `docs/protocol.md` § `terminals` "or by its attach PTY ending" true. It still never nudges session liveness (§ shell close codes stays true). `spawnInSession` returning a bool leaves the response bodies unchanged | `TestHandleShellTerminal_PTYEndBroadcastsTheRemainingList`. The test server never runs the poll loop, so only the nudge can satisfy the `Eventually` | pass |
| DIAG | kb:diagram/web-components: counts re-measured on the tree (render 49, terminal 9, features 53 with 22 controllers, protocol 11 excluding the two fixture files as on `main`, main.ts 23 `init*` calls), all true. kb:diagram/daemon-components is package-level, so the two new server files leave it true | — | pass |

## Build & Tests

E2E tests: pass (468 passed, scoped to 39 files) · Daemon tests (race): pass (scoped 5 packages, 02-test.log; all packages via D1, 22-D1.log) · Web tests: pass (3369 in 114 files) · Daemon build: pass · Web build: pass · Lint: pass (golangci-lint 0 issues; biome clean) · Render tests: pass (509) · Render fixtures: up to date (119) · render-lint, e2e-lint, contrast, versions, features-scope, comment checks and ledger: clean · kb-check: pass (709 records, 0 problems). All read from the GATES_LOG_DIR of this cycle (0 failed lines). The size WARN lines belong to review-maintainability.

## Acceptance Checks

| ID | Command | Result |
|----|---------|--------|
| D1 | `make test` | pass (22-D1.log, every package ok) |
| D2 | `go build ./...` | pass (deduped to 01-build) |
| D3 | `make lint` | pass (deduped to 03-lint, 0 issues) |
| D4 | `make check-render-fixtures` | pass (deduped to 06, 119 scenarios up to date) |
| W1 | `make web-build` | pass (deduped to 04) |
| W2 | `make web-test` | pass (deduped to 05, 3369) |
| R1 | `make render-test` | pass (deduped to 08, 509) |
| E1 | `make e2e` | pass (scoped gate line 21, 468 passed; the full sweep runs at Completion) |
| DOC | doc upkeep + Doc Delta vs what shipped | pass. design-system.md now carries the `claude \| shell \| ▾ \| docs` sentence and a **Terminals panel** entry. I checked each clause against `style.css` and `render/terminalspanel.ts`: `.menu .hdr` is mono `--fs-2xs` uppercase, `.trow.on` is on `--bg-hover`, ✎ reveals on `:hover`/`:focus-within`, `.tfield` sits on `--well`, the list is capped at nine rows by `max-height: calc(9 * var(--trow-h))`, and `.shellcount` is mono `--fs-2xs` on `--bg-hover` and `aria-hidden`. `focus` is promoted to Features. The daemon fix log says `doc-delta: none`, which is correct. The `ws.shell-activity` slug is kept, and code and docs both cite it |

## Reviewer-Verified Criteria

| ID | Criterion | Result | Evidence |
|----|-----------|--------|----------|
| V1 | no `any` in new web code | pass | none in the added web lines of the delta |
| V2 | switch and panel match the reference renders | not mine | belongs to review-browser, which was skipped this cycle (no Critical or Major in its cycle-1 part) |
| V3 | Menu tokens, shell spinner | pass (greppable half) | no new colour literal; panel CSS unchanged by the delta |
| V4 | no terminal content read for state | pass | the new `capture-pane` use is in `web/e2e/helpers/terminals.ts` `awaitTerminalReady`, a test-only readiness oracle |
| V5 | retired message/field neither sent nor parsed | pass | delta adds none |
| V6 | panel through the shared popover part | pass | still `createPopover()`. The two panel-only behaviours are now opt-in `PopoverOptions`, set only by `features/terminalspanel.ts` |

## Hard-Rule Checklist

| # | Rule | Result |
|---|------|--------|
| 1 | Adapter boundary | pass |
| 2 | Terminal-output state parsing | pass (`capture-pane` only as an E2E readiness oracle) |
| 3 | Blocking hook handler | pass (not touched) |
| 4 | Bare tmux / resize-pane | pass (`tmuxDisplay`, `tmuxCapturePane` use `-S daemon.tmuxSocket`) |
| 5 | Payload logging | pass |
| 6 | Empty-gauge dishonesty | pass (not touched) |
| 7 | Identity on `session_id` | pass |
| 8 | Settings trespass | pass |
| 9 | Real `claude` | pass (stub only) |

## Delta

| Prior issue (id) | Status | Fix commit | Verified how |
|---|---|---|---|
| Critical 1 `[e2e-specs]` `web/e2e/terminals.spec.ts:E8:types-before-terminal-2-attached` | resolved | `89721d37` | Diff read. `awaitTerminalReady` waits for three things before typing: `expectShown`, tmux `#{session_attached}` ≥ 1 on the session of that terminal, and the first token of the prompt reaching the region. `surfaces.ts` disposes the previous terminal surface on switch (`closeSurfacesNotIn`), so that token can only come from the new xterm. E8 and the `:1088` `build` site now go through it, along with every other type-after-spawn or type-after-switch. The same category was found and fixed in `shell-activity.spec.ts`. Soaks: 280/280 and 70/70. Scoped gate green. Every Repairs row replaces a wait with a stronger one; no assertion was dropped |
| Critical 2 `[orchestrator]` `docs/features/surfaces/spec.md:web-glob:render-terminals-unowned` | resolved | `93325462` | 14-kb-check.log: 0 problems |
| Major 1 `[render-tests]` `web/render/terminals.spec.ts:R5:highlight-branch-never-runs` | resolved | `cd2c1ddc` | Conditional gone. The test shows `shell 1` via a `page.route` stub whose body matches the contract, then asserts `aria-current` on one row and its `--bg-hover` background after `mouse.move(0,0)`. `.trow:focus-within` sets no background, so focus cannot satisfy that assertion. The ✎ hover-reveal half moved to `build`, which still checks 0 → 1 on hover |
| Major 2 `[daemon-impl]` `internal/server/renderfix_scenarios_misc.go:terminals-two-tiles:density-2x2` | resolved | `b437aef2`, `cd2c1ddc` | Scenario now passes `{"view":"tiles","density":"3x2"}`. The fixture regenerated with only the density changed (check-render-fixtures green). The spliced `find-docs-tiles-3x2` frame and `loadFixture` import are gone from R2 |
| Major 3 `[daemon-tests]` `internal/server/terminals_test.go:D3:socket-broadcast-prefix-untested` | resolved | `f7a1d681` | `TestHandleCloseTerminal_SocketsAndBroadcastAcrossSessions1And12` holds 6 sockets (two terminals plus Claude, in sessions 1 and 12). After the `DELETE` it asserts exactly one 4001, the other five still open, one whole-list broadcast for session 1 only, and the tmux list. `TestHandleRemoveSession_KillOfSession1LeavesSession12Untouched` covers the prefix on Kill. `fakeTmux.panesSurviveBridgeClose` is a test-only switch that defaults to the old behaviour |
| Major 4 `[web-impl]` `docs/diagrams/web-components.md:module-counts:stale` | resolved | `03d76423` | Counts re-measured on the tree (see DIAG row) |
| Major 5 `[orchestrator]` `docs/design/design-system.md:280:switch-and-panel-entry-missing` | resolved | `03d76423` | Sentence and entry added, each clause verified against the CSS (DOC row). The anchor-slug half is settled by keeping `ws.shell-activity`, which `docs/protocol.md:1715` and the code both cite. No further change |

## Issues

### Critical

None.

### Major

None.

### Minor

1. **[render-tests]** The two new tests in `web/render/popover.spec.ts` cite IDs the plan does not define for what they test: "(R7, REQ-2)" and "(R3, REQ-2)". The plan has R1–R6 only (`plan.md:344-349`), and REQ-2 is **Switch** ("Choosing a terminal row shows that terminal…"), not popover closing. The tests themselves are sound. They cover the plan saying every existing menu behaves as it does today (Affected Files `menu.ts`, kb:adr/web-menu-popover-shared-by-terminals-panel), and the panel half belongs to R3/REQ-15. A fix must make each title cite the criterion it falsifies (for example "(menus unchanged)" and "(R3, REQ-15)") or none.
   id: web/render/popover.spec.ts:test-titles:criterion-ids-wrong | confidence: 85

### Notes

1. **[note]** Prior Minors are for the orchestrator to check. For reference, I saw fixes for Minor 1 (`bdcfa48e`, popover options default off), Minor 2 (`b437aef2`, PTY-end nudge), Minor 4 (`210ee74f`, controller-level `no_shell` rows) and Minor 5 (`03d76423`). Minor 3 is in `proposed-backlog.md`.
2. **[note]** `render/terminalspanel.ts` `position()` now delegates to `reconcileKeyedOrder(list, entries, null)`, which runs the same insert-only loop the old code did. The panel keeps its own focus restore beside the call, so behaviour is unchanged.
3. **[note]** The new popover render spec injects a probe `<dialog>` and, for the plain menu, forces overflow with inline styles. That is test scaffolding over a page loaded from a fixture, not a hand-edited fixture.

## Maintainability review

# Maintainability review: better-terminal

**Plan**: better-terminal
**Part verdict**: needs-changes
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
