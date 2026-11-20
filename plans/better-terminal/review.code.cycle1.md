# Correctness review: better-terminal

**Plan**: better-terminal
**Verdict**: needs-changes
**Cycle**: 1
**Pack**: kb: pack 77708 words (budget 30000)

## Requirements

| Req | Implemented | Tested | Status |
|-----|-------------|--------|--------|
| REQ-1 Add | Yes — `POST …/shells` → `showAndSelect(id, n)` (`features/surfaces.ts`) | E1, keyboard test | pass |
| REQ-2 Switch | Yes — row → `showTerminal` | E2 | pass |
| REQ-3 Back in one click | Yes — `select('shell')` → `POST …/shell`, last shown kept by `terminalsChanged` | E3 ×2, W1 | pass |
| REQ-4 Rename | Yes — field Enter/Esc/blur; daemon trims, empty → `shell N` | E4 ×3, D4 | pass |
| REQ-5 Close | Yes — idle × at once, busy × via confirm | E8 (red in this gate run, Critical 1) | fail (test race) |
| REQ-6 Fallback | Yes — `terminalsChanged` lowest-numbered / `claude`; poll ≤ ~1 s | E5 ×2, E6 ×2, W1 | pass |
| REQ-7 Session-wide ends | Yes — `shellRegistry.Kill` lists by name; reconcile and `ShellNames` widened via `IsShellSessionName` | E7, restart test, E11 twin, D5 | pass |
| REQ-8 Switch order | Yes | R1, E1 | pass |
| REQ-9 `shell` text + count | Yes — `span.shellcount` attached only at ≥ 2 | R1, R6, E1 | pass |
| REQ-10 `title` | Yes — only while `shell` selected | E4, surfaceseg unit | pass |
| REQ-11 Panel rows | Yes | R5 (highlight half vacuous, Major 1), E1 `aria-current` | partial |
| REQ-12 `shell N`, lowest free | Yes — `lowestFree` over `ListSessions` | D2, E edges 3/4, endpoints | pass |
| REQ-13 Indicator any-busy | Yes — `applyTerminalList` | W3, E any-busy test | pass |
| REQ-14 Disabled while down | Yes — opener `disabled`, panel closes on `status`/render | R4, restart E2E | pass |
| REQ-15 Open/close/focus | Yes — `popover.ts` | keyboard E2E | pass |
| REQ-16 Tile footer fit 3×2 | Yes | R2 (on a spliced 3×2 prefs frame, Major 2) | pass (fixture defect) |
| REQ-17 Live running/idle | Yes — `app.onRender` repaint | E9, INV-2 test | pass |
| REQ-18 Nine rows, scroll | Yes — `max-height: calc(9 * var(--trow-h))` | R3 | pass |
| REQ-19 40 characters | Yes — `maxLength`, daemon `name_too_long` on code points | E4, D4 | pass |
| INV-1 bystanders | Yes — `terminalKey.n`, `closeSurface` per `(id, n)` | E INV-1 ×2; D3 partly (Major 3) | partial |
| INV-2 list is truth | Yes | W2, INV-2 E2E | pass |
| INV-3 none survives | Yes | D5, E7, restart, kill shutdown | pass |
| INV-4 indicator | Yes | W3 | pass |
| INV-5 shown is running | Yes | W1, E5 | pass |
| Protocol contract (both sides) | Field names, order, status codes and error bodies match the plan byte for byte; `shellActivity`/`shellsBusy` gone from both sides | daemon + web unit, E2E endpoints test | pass (one clause, Minor 2) |
| DIAG | kb:diagram/web-components (stale module counts, Major 4); kb:diagram/daemon-components (true); kb:diagram/domain-model (updated, true) | — | fail |

## Build & Tests

E2E tests: fail (467 passed, 1 failed; scoped to 39 files) · Daemon tests: pass (`make test`, all packages, 22-D1.log; scoped gate run 5 packages, 02-test.log) · Web tests: pass (3367 in 114 files) · Daemon build: pass · Web build: pass · Lint: pass (golangci-lint 0 issues; biome clean) · Render tests: pass (507) · kb-check: FAIL (2 unowned files, fixed at `93325462`, Critical 2) — all read from $GATES_LOG_DIR

## Acceptance Checks

| ID | Command | Result |
|----|---------|--------|
| D1 | `make test` | pass (22-D1.log, every package ok) |
| D2 | `go build ./...` | pass (deduped to 01-build) |
| D3 | `make lint` | pass (deduped to 03-lint, 0 issues) |
| D4 | `make check-render-fixtures` | pass (deduped to 06, 119 scenarios up to date) |
| W1 | `make web-build` | pass (deduped to 04) |
| W2 | `make web-test` | pass (deduped to 05, 3367) |
| R1 | `make render-test` | pass (deduped to 08, 507) |
| E1 | `make e2e` | FAIL (21-e2e.log: `terminals.spec.ts:434` E8 timed out at :446) — Critical 1 |
| DOC | doc upkeep + Doc Delta vs what shipped | FAIL — TODO.md edited as the plan says, four ADRs `proposed` with `refs: plan:better-terminal`, no real `deviation:` line, every Doc Delta assertion true of the code; but web-impl's `doc-delta:` line for `docs/design/design-system.md` is not reflected (Major 5) |

## Reviewer-Verified Criteria

| ID | Criterion | Result | Evidence |
|----|-----------|--------|----------|
| V1 | no `any` in new web code | pass | no `any` type in any added line under `web/src` on the branch |
| V2 | switch and panel match the reference renders | not mine | review-browser measures it |
| V3 | Menu tokens, shell spinner | pass (greppable half) | panel root is `.menu.tpanel`; state word uses `span.shellact[data-act=busy]`; every colour in the new CSS is a token; rendered result is review-browser's |
| V4 | no terminal content read for state | pass | busy from `ListPaneActivity` (process state) + `tty.IsCanonical`; no `capture-pane` in added lines |
| V5 | retired message/field neither sent nor parsed | pass | `"shellActivity"`/`shellsBusy` appear only in web tests asserting they are now unknown; Go hits are type/variable names (`shellActivityFeature`), no wire literal |
| V6 | panel through the shared popover part | pass | `features/terminalspanel.ts` and `render/menu.ts` both call `createPopover()` (`render/popover.ts`); no copy of the anchor/close logic |

## Hard-Rule Checklist

| # | Rule | Result |
|---|------|--------|
| 1 | Adapter boundary | pass |
| 2 | Terminal-output state parsing | pass |
| 3 | Blocking hook handler | pass (not touched) |
| 4 | Bare tmux / resize-pane | pass (daemon through the tmux client; e2e helpers use `-S daemon.tmuxSocket`) |
| 5 | Payload logging | pass |
| 6 | Empty-gauge dishonesty | pass (count absent below two; no rows with no data) |
| 7 | Identity on `session_id` | pass (terminals key on `(session id, n)`) |
| 8 | Settings trespass | pass |
| 9 | Real `claude` | pass (stub binary only) |

## Issues

### Critical

1. **[e2e-specs]** The gate's e2e line is red: `web/e2e/terminals.spec.ts:434` (E8) types `sleep 600` straight after `startWithTerminals(…, 2)` without waiting for terminal 2 to be on screen and attached, so the keystrokes miss terminal 2 and :446 waits 15 s for a `running` that never comes (received `shell 2idle✎×` on `li.trow.on`). This is a test race, not a product defect. `startWithTerminals` returns once the count reads `2`, which comes from the `terminals` broadcast and can land before the client has handled the `POST …/shells` 201 and switched surfaces. The keys then go either into terminal 1's still-mounted xterm, or into terminal 2's new surface while its socket is still `CONNECTING`; `pane.ts`'s `onData` drops input unless the socket is `OPEN`, which is the same on `main`. The row marked `on` is shell 2, so the switch itself completed. A fix must make the test wait for terminal 2 to be shown (`expectShown(host, "shell 2", region)`) **and** attached, for example by polling an attached-client oracle on `muster-<id>-shell-2`, before typing. Alternatively it can start the busy command with `tmuxSendKeys` as E9 does, since E8 is about closing, not typing. Fix the category, not only this line: `:1088` (`chooseRow(host, "build")` then `typeInShell(… "exit")`) has the same unguarded type-after-switch shape. The E2E Validate step should have caught this. It did run the spec live and soaked it 280/280, so it did not misclassify anything, but one red in ~470 runs slips past ten passes. Reading the spec would have found it: E1 and E2 guard the same step with `expectShown`, and E8 does not.
   id: web/e2e/terminals.spec.ts:E8:types-before-terminal-2-attached | confidence: 85

2. **[orchestrator]** The gate's `kb-check` line failed: `web/render/terminals.spec.ts` and `web/render/helpers/terminals.ts` belonged to no feature. Already fixed: `93325462` adds both to the `web:` glob of the surfaces feature spec and regenerates its INDEX.md and rules file (I read the diff). The next gate run must show this line green. This does not block approval.
   id: docs/features/surfaces/spec.md:web-glob:render-terminals-unowned | confidence: 95

### Major

1. **[render-tests]** The plan's R5 says the shown row is highlighted, and nothing asserts it. `web/render/terminals.spec.ts` R5 test guards that half with `if (shown === 1)`, but `terminals-two` is recorded with `claude` selected, so no row ever has `aria-current` and the branch never runs. The test name still claims "the shown row highlighted", so a run where the highlight is broken still passes. E1 checks `aria-current="true"` (the marker) but never the `--bg-hover` ground. A fix must put a terminal on screen before asserting and drop the conditional. One way is to stub the harness's `POST /api/sessions/{id}/shell` with `page.route` (a 200 `{target, n:1, created:false}`; that changes no fixture) and click `shell`. Then assert `aria-current` on that row's button and the row's computed background equal to `--bg-hover`.
   id: web/render/terminals.spec.ts:R5:highlight-branch-never-runs | confidence: 90

2. **[daemon-impl]** The plan's **Render fixtures** header asks for `terminals-two-tiles` "in Tiles at 3×2", but the scenario was recorded at 2×2. `internal/server/renderfix_scenarios_misc.go:54` registers `withPrefs(driveTerminalsTiles, tilesView)`, and the fixture has `"density": "2x2"`. To work around it, R2 sends the `prefs` frame of `find-docs-tiles-3x2`, a scenario the header does not name, so R2 measures a state no single daemon run produced. The fix is `withPrefs(driveTerminalsTiles, map[string]any{"view": "tiles", "density": "3x2"})`, as the reader scenarios do, then `make gen-render-fixtures`. After that, **[render-tests]** drops the spliced frame and its comment (render-tests.md already flagged this as `needs-scenario`).
   id: internal/server/renderfix_scenarios_misc.go:terminals-two-tiles:density-2x2 | confidence: 95

3. **[daemon-tests]** D3 is only partly covered. `TestHandleCloseTerminal_EndsOnlyThatTerminalOfOnlyThatSession` checks the tmux list and the names after `DELETE`. It never asserts the sockets: that terminal `n`'s socket closes with `4001` while a sibling terminal's socket and the Claude socket stay open. It also never checks the `terminals` broadcast of the remaining list. No daemon test pairs session 1 with session 12 (plan edge 16 → D3; test-specs.md hands it to "D3 unit test"). The registry tests use ids 41/42, and the handler tests use whatever ids two launches get. A fix must add a daemon test that:
   - holds sockets on two terminals of one session plus its Claude socket, deletes one terminal, and asserts exactly one `4001`;
   - records the hub (or the poller's `broadcast`) across the handler and asserts the whole remaining list;
   - runs the same `DELETE`/`Kill` with sessions 1 and 12 coexisting.

   D3's "pane gone at poll" half is covered on the list side (`TestReconcile_Transitions`) and, for the socket, by the PTY ending. That is a decision recorded in daemon-implementation.md.
   id: internal/server/terminals_test.go:D3:socket-broadcast-prefix-untested | confidence: 80

4. **[web-impl]** DIAG: `kb:diagram/web-components` (`docs/diagrams/web-components.md`, named by `kb for` for the changed web files) is now false. `render/` "47 modules" is 49 (`popover.ts`, `terminalspanel.ts`); `terminal/` "8 modules" is 9 (`terminals.ts`); `features/` "52 modules … 21 stateful per-feature controllers" is 53 and 22 (`terminalspanel.ts`); `protocol/` "10 modules" is 11 (`terminals.ts`). Each count was correct on `main`. A fix must update the four counts and the controller count in the same change.
   id: docs/diagrams/web-components.md:module-counts:stale | confidence: 90

5. **[orchestrator]** web-impl's log carries `doc-delta: docs/design/design-system.md …` (the `claude | shell | ▾ | docs` switch with the count pill, and a Terminals panel component entry), and the plan's `## Doc Delta` does not reflect it. The plan's Affected Files assigns `design-system.md` to web-impl, but no agent edited it. So `docs/design/design-system.md:280` still reads "holds the `claude | shell | docs` surface switch", and §5 has no Terminals panel entry or count. Meanwhile `kb:adr/web-menu-popover-shared-by-terminals-panel`'s Consequences say "The design system's Menu entry gains the Terminals panel as a second content kind". A fix must either edit design-system.md (§5 Focus mainhead sentence, a Terminals panel entry beside **Menu**, the count) or add those lines to the Doc Delta for reconcile. The second `doc-delta:` line, the anchor `ws.shell-activity` now naming the `terminals` message, also needs a decision (keep the anchor slug, or rename it).
   id: docs/design/design-system.md:280:switch-and-panel-entry-missing | confidence: 95

### Minor

1. **[web-impl]** The plan says every existing menu behaves as it does today (Affected Files `menu.ts`; the ADR says "The existing menus use it unchanged"). Two behaviours changed for every `createMenu()` user when the popover part was extracted:
   - an outside pointerdown that lands inside any open `<dialog>` no longer closes a menu (`render/popover.ts`, `target.closest("dialog[open]")`);
   - a scroll inside the panel no longer closes it (`onScroll` ignores targets inside the panel).

   Both are needed only by the Terminals panel. Gate them behind `PopoverOptions` set only by `features/terminalspanel.ts`, or record the change in the ADR.
   id: web/src/render/popover.ts:onPointerDown/onScroll:menu-behaviour-changed | confidence: 75

2. **[daemon-impl]** The contract says a terminal observed gone is "detected by the ~1 s poll or by its attach PTY ending". The plan and `docs/protocol.md` § `terminals` both say this. In the code only the poller broadcasts: nothing calls `poller.sync` when a shell pump's PTY ends (`shells.go` `handleShellTerminal`, `nudge: nil`). REQ-6's ~2 s holds through the poll, so nothing user-visible is wrong. Either call `f.changed` when a terminal's pump ends, or have reconcile drop the PTY clause.
   id: internal/server/shells.go:handleShellTerminal:pty-end-no-broadcast | confidence: 80

3. **[web-impl]** `applyTerminalList` → `terminalsChanged` treats any list without the shown `n` as "that terminal ended". After `newTerminal`'s 201 sets `shell = n`, a `terminals` message the daemon sent before the spawn can still arrive on the WS after that HTTP response (two connections). The just-created terminal is then replaced by the lowest-numbered one, and the `[…, n]` list that follows does not restore it. This is a narrow window and I have no reproduction. A fix should let a client-initiated show survive a list older than its own spawn: for example, hold the requested `n` as pending until a list containing it arrives.
   id: web/src/features/surfaces.ts:applyTerminalList:stale-list-reverts-new-terminal | confidence: 40

4. **[web-tests]** W4 ("a 404 `no_shell` from close or rename is swallowed without an error notice") is tested only at the decode level (`api/sessions.test.ts:864`). The `features/surfaces.test.ts` case resolves both calls `ok: true`, so no test drives the controller with an error result and asserts that no notice appears and nothing is thrown. Add one row per action with a `no_shell` result.
   id: web/src/features/surfaces.test.ts:W4:controller-error-path-untested | confidence: 70

5. **[orchestrator]** `focus` is listed under `**Touches**`, but the plan's Doc Delta changes its spec ("focus — becomes true: … `claude | shell | ▾ | docs` …"). Promote it to Features.
   id: plans/better-terminal/plan.md:Touches:focus-changed | confidence: 95

### Notes

1. **[note]** D6: `TestShellCount_CountsOnlyShellNames` still lists only `muster-<n>-shell` names. The count's predicate (`ShellNames`) is exercised with `-shell-2`/`-shell-3` by `TestKillAllShells_KillsEveryTerminalNumber` (3 killed), so the count path is covered through the shared function. No change requested.
2. **[note]** `shellRegistry.Kill` falls back to killing terminal 1 only when `ListSessions` fails, so under a tmux list failure, terminals ≥ 2 of a removed session live until the next reconcile. This is deliberate and tested (`TestShellRegistry_KillWithAFailingListStillKillsTerminalOne`). No change requested.
3. **[note]** E11's literal prompt count is not E2E (non-TTY harness). Its observable twin (`restart-impact` lists one entry per terminal, plus a `-on-exit=kill` restart leaves none) plus `ShellCount` sharing `ShellNames` cover it.
4. **[note]** The `## Repairs` row (INV-1 setup reorder) is honest: I read the `ca36b59f` diff. Window A was already on `claude` at the `DELETE` in the original, and every assertion is kept.
5. **[note]** `protocolVersion` stays 2 although `shellActivity`/`shellsBusy`/`/ws/shell/{id}` were removed. The only skewed client is a tab left open across an upgrade (`kb:anchor/ws.hello`), which then loses its shell surface until reload. The plan asks for no bump. No change requested.
6. **[note]** For review-browser: V2 and V3's rendered half are yours. R5's highlight is otherwise unmeasured (Major 1).
