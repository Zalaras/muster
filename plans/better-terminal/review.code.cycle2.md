# Correctness review: better-terminal

**Plan**: better-terminal
**Verdict**: approved
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
