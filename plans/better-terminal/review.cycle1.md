# Review: better-terminal

**Plan**: better-terminal
**Verdict**: needs-changes
**Cycle**: 1
**Gates**: 2 failed
**Parts**: code, browser, maintainability
**Part verdicts**: code needs-changes, browser approved, maintainability needs-changes

_Merged by orch-state.py merge-review; the verdict is computed from the parts and the gate run, never edited by hand._

## Correctness review

# Correctness review: better-terminal

**Plan**: better-terminal
**Part verdict**: needs-changes
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

## Browser review

# Browser review: better-terminal

**Plan**: better-terminal
**Part verdict**: approved
**Cycle**: 1
**Pack**: kb: pack 14710 words (budget 30000)
**Rig**: `make web-build build` at 93325462 (tree clean but for orchestration-state.json); `bin/musterd` via the committed `startScratchDaemon` helper per test: space-bearing data dir `$TMPDIR/muster e2e-20ec4dd4-*`, private `-tmux-socket` inside it (killed and deleted on teardown), the shared E2E stub `claude` (`$TMPDIR/muster e2e-stub-*`); headless Chromium through a throwaway `web/e2e/zz-rb-better-terminal.spec.ts`, run in the foreground and deleted; `git status --porcelain` shows nothing of mine.

Gates log read (not re-run): two red lines. `14-kb-check` (two render files owned by no feature) is fixed by 93325462. `21-e2e` failed one test, `terminals.spec.ts:434` (REQ-5/E8): the `shell 2` row read `idle` for 15 s after `sleep 600` was typed. See Note 1. I measured the shipped app at 93325462, which is the app the gate ran plus the docs-only commit.

## Matrix

Hosts: **focus** (1440x900), **tiles** at 3x2 (1280x720 and 1920x1080, bottom-right tile as the host under test, every tile carrying two terminals). **Pop-out** (`/doc.html`): N/A for every row. The pop-out hosts only the reader. It has no surface switch, and `doc.ts` deliberately does not subscribe to `onTerminals`.

| Req | Host | State | Claim | Result | Evidence |
|-----|------|-------|-------|--------|----------|
| REQ-8 | focus | no terminals | order claude, shell, ▾, docs | pass | button x = 1205, 1266, 1321, 1340; group 1204,59-1388,81 |
| REQ-8 | tiles 1280 / 1920 | no terminals | same order in the tile footer | pass | x strictly increasing in the bottom-right tile at both sizes |
| REQ-8 | focus | no terminals | ▾ glyph shown, enabled | pass | opener text "▾", box 1321,60-1340,80, not disabled |
| REQ-9 | focus | none / 1 | no count with fewer than two | pass | `span.shellcount` elements = 0 (absent, not hidden); shell text "shell" |
| REQ-9 | focus | data(2) | count `2`, aria-hidden, inside the shell button | pass | count 1292,63-1309,78 inside shell 1229,59-1321,82; computed display block, opacity 1, mono 10.2px, bg rgb(28,32,41) (= --bg-hover) |
| REQ-9 | tiles 1280 / 1920 | data(2) | count in every footer | pass | all six tiles read `2`; after one closed, that tile's count element count = 0 and the other five still read 2 |
| REQ-10 | focus | no terminals | no `title` while shell not selected | pass | title=null |
| REQ-10 | focus | data | `title` names the terminal on screen | pass | `shell 1`, then `build` after the rename |
| REQ-10 | tiles 1280 / 1920 | data(2) | tile `title` names the shown terminal | pass | title=`shell 1` after the row switch |
| States: no terminals | focus | no terminals | panel shows header and only New terminal | pass | rows=0, header "TERMINALS", panel 1172,84-1432,150 |
| States: no terminals | tiles 1280 / 1920 | no terminals | same | pass | rows=0 |
| REQ-1 | focus | no terminals | New terminal via keyboard (Enter) spawns and shows shell 1 | pass | api `[{n:1,"shell 1",busy:false}]`, tmux `muster-1-shell`, shell pressed |
| REQ-1 | focus | data(1, busy) | New terminal shows shell 2 in the session dir; t1 keeps running | pass | tmux capture of t2 holds `pwd` output = session dir; view shows it; t1 `pane_current_command`=sleep; t1 output absent from view |
| REQ-1 | tiles 1280 / 1920 | data(1) | real keys typed in the tile shell reach tmux; New terminal from the tile | pass | t1 fg=sleep; title then `shell 2`, count 2 |
| REQ-2 | focus | data(2) | row shows that terminal with its own output intact | pass | after choosing `shell 1`: view has RB-ONE-MARK, lacks RB-TWO-MARK |
| REQ-2 | focus | data(2) | operable + keeps focus | pass | keys landed in tmux t1 (capture has RB-KEYS-1); `xterm-helper-textarea` still active after 1.2 s |
| REQ-2 | tiles 1280 / 1920 | data(2) | row switch in tile; surface contained; focus kept | pass | 1280: region 855,435-1278,690 inside tile 854,403-1279,719; textarea still active after 1.2 s |
| REQ-3 | focus | data(2) | claude then shell shows the last shown | pass | title `build` (last shown) after claude then shell |
| REQ-3 | focus | no terminals | shell with none running starts one | pass | tmux `muster-1-shell` created |
| REQ-3 | tiles | data | claude then shell in a tile | N/A | the same reducer as focus, so not re-driven; tile fallback measured under REQ-6 |
| REQ-4 | focus | data(2) | ✎ turns the name into a field, prefilled and selected | pass | selection 0-7 of "shell 2", maxlength 40, bg rgb(13,15,22) (--well) |
| REQ-4 | focus | data(2) | field keeps focus across a tick and a live flip of another row | pass | `INPUT.tfield` still active 1.2 s after shell 1 flipped busy to idle |
| REQ-4 | focus | data(2) | Esc cancels, panel stays open | pass | panel=1, api names unchanged, focus back on ✎ |
| REQ-4 | focus | data(2) | Enter saves; api agrees; whitespace restores `shell 2` | pass | api `["shell 1","build"]`, then `["shell 1","shell 2"]` |
| REQ-4 | focus | second window / reload | name shows in another window and survives reload | pass | page 2 rows `shell 1 idle / build idle`; after reload rows still list build |
| REQ-4 | tiles 1280 / 1920 | data(2) | tile rename field keeps focus across tick; save | pass | `INPUT.tfield` active after 1.2 s; row `srv` shown |
| REQ-19 | focus | data(2) | field stops at 40 | pass | 45 keys typed, value length 40 |
| REQ-5 | focus | data(2) | × on an idle terminal ends it at once | pass | open dialogs 0; tmux left only `muster-1-shell` |
| REQ-5 | focus | data(1 busy) | × on a busy terminal asks first, naming it | pass | dialog "Close shell 1? shell 1 is running a command. Closing it ends the command. Cancel / Close terminal", box 500,372-940,528, danger bg rgb(194,70,70) |
| REQ-5 | focus | data(1 busy) | Cancel keeps it; Close terminal ends it | pass | after Cancel fg=sleep; after Close terminal tmux list empty |
| REQ-5 | tiles 1280 / 1920 | data(2, busy) | confirm inside the viewport; confirm ends it | pass | 1280: dialog 420,282-860,438; tmux left only shell-2 |
| REQ-6 | focus | data | the shown terminal closed falls back to the lowest; the last falls back to claude | pass | title `shell 1` after closing `build`; claude pressed with the Claude region visible after the last closed |
| REQ-6 / Edge 5, 6 | focus | docs selected, 2 windows | `exit` drops the row from the open panel and the count in both windows in about 2 s; docs stays | pass | both counts 3 to 2 in 1809 ms; open panel rows 2; docs still pressed |
| REQ-6 / INV-1 | tiles 1280 / 1920 | data(2) | closing the shown busy terminal falls back to n=2; the other tiles are untouched | pass | title `srv`; other five counts 2,2,2,2,2 |
| REQ-6 | tiles 1280 / 1920 | data(1) | external kill of the last terminal returns to claude | pass | 814 ms / 797 ms; Claude region 855,435-1278,690 |
| REQ-7 | focus / tiles | data | Remove / reconcile / kill shutdown end every terminal | N/A here | daemon journey with no new visible surface beyond the existing prompt; reconcile observed under Edge 13; Remove and kill-shutdown count are E7/E11 (green in the gate) |
| REQ-11 | focus | data(2) | state words agree with the api | pass | `shell 1` running / `shell 2` idle; api busy true/false |
| REQ-11 / V3 | focus | data(2) | running row has a visible spinner; idle row has none | pass | spinner display block, opacity 1, `animation-name: shellact-spin`, 10x10, data-act busy; idle row spinner absent |
| REQ-11 | focus | data(2) | row on screen highlighted | pass | on bg rgb(28,32,41), off bg transparent, aria-current=true |
| REQ-11 | focus | data(2) | ✎ hidden until hover or keyboard focus-within; × visible | pass | ✎ opacity 0, hover 1, Tab-focus 1; × opacity 1 |
| REQ-11 | focus | data(2) | rows contained in the panel | pass | panel 1172,86-1432,216; rows 1173-1431 |
| REQ-11 | tiles 1280 / 1920 | data(2) | rows and states agree with the api | pass | `shell 1 running / shell 2 idle`, api agrees |
| REQ-12 / Edge 3 | focus | data(10) | close 3, then New gives `shell 3`; rows reorder live in n order | pass | data-n order 1..10, api `3:shell 3` |
| REQ-13 / INV-4 | focus | data(1) | shell segment indicator busy while a terminal is busy | pass | busy 878 ms after `sleep`; `span.shellact` display block, opacity 1, box 1262,65-1271,75 |
| REQ-13 | tiles 1280 / 1920 | data(2, 1 busy) | tile indicator busy | pass | data-act busy |
| REQ-14 / Edge 17 | focus | daemon-down (SIGTERM) | open panel closes; claude, shell, ▾ and docs disabled; ▾ click opens nothing | pass | panel 0; disabled true x4; second window ▾ disabled; banner "musterd unreachable — ..." at 0,46-1440,78 |
| REQ-14 | tiles 1280 / 1920 | daemon-down | open panel closes; all six ▾ disabled | pass | panel 0; disabled true x6 |
| States: daemon down | focus / tiles | daemon-down | count frozen at its last value | pass | focus count "2"; tile counts 2,2,2,2,2 |
| Edge 13 | focus | reconnect after restart | snapshot `terminals` is `{}`; count gone; terminals reaped | pass | tmux list empty for the session; claude pressed |
| REQ-15 | focus | no terminals | panel anchored below ▾, inside the viewport | pass | panel 1172,84-1432,150 under opener 1321,60-1340,80 |
| REQ-15 | tiles 1280 / 1920 | data(2) | panel from the bottom-right tile stays in the viewport | pass | 1280: panel 1012,562-1272,692, flipped above opener 1169,696; 1920: 1652,922-1912,1052 |
| REQ-15 | focus | no terminals | Esc closes and returns focus to ▾; outside click closes | pass | active `BUTTON.termsopen[Terminals]`; panel 0 after a click at 700,500 |
| REQ-15 | focus / tiles | data | ▾ keyboard-focused keeps focus across a 1.2 s tick; Enter opens with focus inside; the item keeps focus | pass | same element identity; focus lands on `+ New terminal` |
| REQ-16 / R2 | tiles 1280x720 3x2 | data(2 each, 1 busy) | footer shows no overflow with ▾ and count | pass | every footer scrollWidth = clientWidth 423/423, no descendant overflowing, 0 buttons outside, switch 212,377-366,397 inside tile 1,85-426,402 |
| REQ-16 / R2 | tiles 1920x1080 3x2 | same | same | pass | 637/637 on all six, 0 outside |
| REQ-17 | focus | data(2) | open panel flips running to idle to running live | pass | idle after 873 ms (C-c via tmux), running after 875 ms; panel stayed open |
| REQ-18 / Edge 19 | focus | data(10) | nine rows visible; the list scrolls; New terminal visible outside the scroll | pass | list 849,110-1431,398, scrollHeight/clientHeight 320/288, overflow-y auto, 9 fully visible rows; New 849,407-1431,439 inside the 900 px viewport |
| REQ-18 | focus | data(10) | wheel reaches row 10; panel stays open | pass | scrollTop 32; row 10 at 366-398 inside the list |
| REQ-18 | tiles | data(10) | ten terminals in a tile | N/A | the render test R3 covers the list; the tile panel geometry (flip, containment) is measured above with two rows |
| REQ-11 / REQ-19 | focus | data(10) | 40-character name ellipsized; × stays inside the panel | pass | text-overflow ellipsis; × 1401-1423 inside panel 848-1432 (the panel widens to 584 px for a 40-char name, see Note 2) |
| V3 | focus | data | panel tokens are the Menu tokens | pass | panel bg rgb(23,26,36) = --bg-raised; border rgb(52,58,74) = --line-control, 1px; header uppercase mono 10.2px |
| V2 | focus / tiles | data | matches the prototype renders | pass (by eye against the measurements) | the count pill, ▾ and the panel layout (name, state word, ×, + New terminal) agree with `switch-with-count.png` and `terminals-menu-close-up.png`; no pixel diff taken |
| §7 one live client per attach target | focus | data | switching terminals in one window holds a single socket per terminal | not measured | Note 3 |
| §6 honesty | all | all | unknown shown as a word, no Done state, no cost, daemon down prominent | pass | no new gauge or state; the daemon-down banner is the existing full-width alert; panels and switches disable |

## Issues

### Critical

### Major

### Minor

### Notes
1. **[note]** For `review-work`, who owns the gate: the red `21-e2e` line (`terminals.spec.ts:434`, E8, `shell 2` read `idle` for 15 s after `sleep 600`) did not reproduce as a product defect in any host. Every busy flip I drove was seen in 873-878 ms, in focus and in tiles, with tmux and `/api/state` agreeing. My own probe hit a setup race. Keys typed into a terminal created a moment earlier sat as an echoed line (`capture-pane` showed only `pwd; echo RB-TWO-MARK`, with no output and no prompt) until the shell finished starting. The spec types `sleep 600` through `typeInShell` right after `startWithTerminals` has created terminal 2, and it never waits for the shell to be ready. This looks like the flake. The fix is to wait for the new terminal's prompt, or for `tmuxForegroundCommand` to report sleep, before asserting `running`.
2. **[note]** With a 40-character terminal name the panel grows to 584 px wide (848-1432 at 1440). Rows, × and New terminal stay inside it and inside the viewport, and the name is still `text-overflow: ellipsis`, so the ellipsis only engages once the panel reaches its maximum width. No change requested.
3. **[note]** §7 one-live-client-per-terminal (E10) and the Remove / kill-shutdown count (E7, E11) were not measured in my rig. They are daemon journeys that the gate's E2E run passed. Socket-level counting was outside what my matrix drove.
4. **[note]** My tiles runs hit the 300 s test timeout after their last cell was recorded, in fixture teardown, after `daemon.kill()` had already stopped the daemon. All cells were written first. No scratch daemon, tmux socket or data dir was left behind (`pgrep` empty, zero `muster e2e-20ec4dd4-*` dirs).

## Maintainability review

# Maintainability review: better-terminal

**Plan**: better-terminal
**Part verdict**: needs-changes
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

## Below threshold

_Confidence under review-scale.md's bar; not routed. The orchestrator carries each to proposed-backlog.md._

- code Minor: 3. **[web-impl]** `applyTerminalList` → `terminalsChanged` treats any list without the shown `n` as "that terminal ended". After `newTerminal`'s 201 sets `shell = n`, a `terminals` message the daemon sent before the spawn can still arrive on the WS after that HTTP response (two connections). The just-created terminal is then replaced by the lowest-numbered one, and the `[…, n]` list that follows does not restore it. This is a narrow window and I have no reproduction. A fix should let a client-initiated show survive a list older than its own spawn: for example, hold the requested `n` as pending until a list containing it arrives.
