# Review: effort

**Plan**: effort
**Verdict**: needs-changes
**Cycle**: 1
**Gates**: 1 failed
**Parts**: code, browser, maintainability
**Part verdicts**: code needs-changes, browser needs-changes, maintainability needs-changes

_Merged by orch-state.py merge-review; the verdict is computed from the parts and the gate run, never edited by hand._

## Correctness review

# Correctness review: Effort

**Plan**: effort
**Part verdict**: needs-changes
**Cycle**: 1
**Pack**: kb: pack 70584 words (budget 30000)

## Requirements

| Req | Implemented | Tested | Status |
|-----|-------------|--------|--------|
| REQ-1 | Yes — `web/index.html` Effort `fieldset.seg`, six radios named `effort` after the custom-model input, before Start in | Yes — effort-launch E2 form/order, arrow-key, pointer, Resume-tab hide | pass |
| REQ-2 | Yes — `claudecode.BuildArgv` appends `--effort` after `--permission-mode`; `launch.ts` sends `effort` only for a level | Yes — `TestBuildArgv_Effort`, `TestLauncher_LaunchEffort`, E3 argv oracles | pass |
| REQ-3 | Yes — `validateLaunchRequest` checks effort after permissionMode, before the model pre-check; exact contract message | Yes — `TestHandleCreateSession_InvalidEffortIs400AndWritesNothing`, check-order tests, D3 E2E (auto/ultracode/HIGH) | pass |
| REQ-4 | Yes — `UpsertRepo` writes `last_effort` (nil clears), `TouchRepo` leaves it; `repoRestore`/`initialRestore` with `touched.effort` | Yes — `TestRepo_LastEffort`, launchrestore 8-combination table, E4 + touched-race E2E | pass |
| REQ-5 | Yes — `InterpretStatus` returns a non-nil `Effort` reading on every post; `adoptEffort` adopts on change; `ApplyStatus` broadcast gains both pointer terms | Yes — `TestApplyStatus_EffortAdoption`, upsert-count E2E, verbatim `ultra` | pass |
| REQ-6 | Yes — `effortBrackets` (`(…)` alive+null, none dead+null or null level); `.eff` child span | Yes — `sessions/effort.test.ts`, mainhead tests, E5/E6/E7 | pass |
| REQ-7 | Yes — `checkLaunchedEffort` on the first reading while `effortRequested` is set; model is the display name after the post | Yes — D6/D7 tables (144 + 60 cells), E8–E10, bystander | pass |
| REQ-8 | Yes — `#effort-strip role="status"`, `.eff.warn` | Yes — E8/E9 sentences, theme tests | pass (gate run: one theme case red, see Critical 1) |
| REQ-9 | Yes — `internal/server/effort.go` DELETE route, `Manager.ClearEffortWarning` persist+broadcast only when set | Yes — `TestHandleDismissEffortWarning_*` (204/204-no-broadcast/404/401), E12 two pages | pass |
| REQ-10 | Yes — `Resume` passes `sess.EffortLevel()`; `RecordResume`/`RepairOwnedSession` clear only the pending check | Yes — `TestLauncher_Resume_*`, E15/E17, D7 Resume-button cells | pass |
| REQ-11 | Yes — transcript scan keeps the last `assistant` line's `effort` (a later key-less line resets it); `EffortSeed` with no check | Yes — `TestPastSessions_Effort`, `TestLauncher_LaunchResume_Effort`, E16 + last-line E2E | pass |
| REQ-12 | Yes — four `--warn*` tokens in all three theme blocks; contrast pairs + `--warn` hue band 46–65° | Yes — `make contrast` 50 pairs ×3, 0 failures; theme E2E | pass |
| REQ-13 | Yes — no own code: `renderMainhead` toggles the strip, then `mountTerminalSurface` refits in the same pass | Yes — E14 size-note vs `#{window_height}` | pass |
| REQ-14 | Yes — `needles["--effort flag"] = "--effort"` in `test/canary/static_test.go` | Ran green offline on 2.1.300 (red direction not run; existing `assert.Empty(misses)` path) | pass |
| DIAG | `store-schema` (columns present, but summary and body still say "0001-0015"/"0003-0015"); `one-launch-end-to-end` (validate and BuildArgv steps omit effort); `web-components` (updated, true); `daemon-components` (no import change) | — | fail (Major 1) |

## Build & Tests

E2E tests: fail (903 passed, 1 failed of 904 — `effort-header.spec.ts:893` Dark theme) · Daemon tests (race): pass (every package `ok`) · Web tests: pass (95 files, 2702 tests) · Daemon build: pass · Web build: pass · Lint: pass (`0 issues.`; web lint clean; e2e-lint clean) — all read from $GATES_LOG_DIR

Other gate lines: contrast pass · features-inventory pass · versions pass (`all fragments fresh`) · e2e-honest pass · kb check pass (597 records, 0 problems) · features-scope pass · comment-checks clean · comment ledger pass (6 blocks kept) · size WARN (4 file-length hits — review-maintainability's).

## Acceptance Checks

| ID | Command | Result |
|----|---------|--------|
| D1 | `make test` | pass (deduped to the gate's `go test -race -count=1 ./...`) |
| D2 | `make lint` | pass (`0 issues.`) |
| D15 | `go build ./...` | pass (gate build line) |
| W1 | `make web-test` | pass (2702/2702) |
| W2 | `make web-build` | pass |
| W3 | `make web-lint` | pass |
| W4 | `make contrast` | pass (instrument/dark/light: 50 pairs, 0 failures) |
| E1 | `make e2e` | **FAIL** — `effort-header.spec.ts:893:3` "in the Dark theme …": `expect(await computed(headerEff(page), "color")).toBe(warn)` received `""` (Critical 1) |
| K1 | `make check-kb` | pass (deduped to the gate's kb check: 0 problems) |
| DOC | doc upkeep + Doc Delta vs what shipped | **FAIL** — `docs/design/design-system.md` §1/§3 not given the `--warn` row and rule (plan § Doc upkeep, § Doc Delta "Outside the feature specs"); `docs/facts/effort-flag-values.md` still `guard: none` (plan: gains the canary static test); `store-schema` prose still says 0001-0015. Doc Delta assertions themselves all hold against the code (see Major 2 for log `doc-delta:` lines it does not carry). ADRs: five `proposed`, each `refs: plan:effort`, no `deviation:` line needs one. |

## Reviewer-Verified Criteria

| ID | Criterion | Result | Evidence |
|----|-----------|--------|----------|
| R1 | status-line `effort` read only in `internal/claudecode/` | pass | `statusEffort` in `internal/claudecode/status.go:27`; transcript `effort` in `launchtranscripts.go:177`. `rg '"effort\|effort\.level\|perTurnEffort'` outside claudecode finds only Muster's own request/wire structs (`launcher.go:82`, `sessionwire.go:54-55`) |
| R2 | no E2E launches a real `claude` | pass | effort specs read argv through `paneStartCommand` on the stub; no `claude` binary reference in `effort-*.spec.ts` / `helpers/effort.ts` |
| R3 | strip and tint match `opt-a-segmented.html`, three themes, reworded sentence | pass at token level | Instrument values equal `mockup.css:93` byte for byte; strip rules (bg, bottom line, inset bar, fg, ghost Dismiss) match `mockup.css:94-100`; sentence is the plan's reworded one. Dark/Light values are new (mockup gave Instrument only). Pixels are review-browser's |
| R4 | `.model` with `.eff` never truncates; Dismiss in view 316px → full | pass, with a plan-wording note | width E2E at windows 1280/800/700/616/600 green; card-location fit sweeps green. The spec reads "316px" as the header width (616px window) — see Note 3 |
| R5 | no `any` in new web code | pass | `rg ': any\|as any\|<any>'` over the new/changed web files: none |

## Hard-Rule Checklist

| # | Rule | Result |
|---|------|--------|
| 1 | Adapter boundary | pass |
| 2 | Terminal-output state parsing | pass — effort comes from the status line only |
| 3 | Blocking hook handler | pass — no hook path changed |
| 4 | Bare tmux / resize-pane | pass — no tmux call added |
| 5 | Payload logging | pass — the one new log line (`internal/server/effort.go:45`) logs the error and session id only |
| 6 | Empty-gauge dishonesty | pass — null effort renders `(…)` (alive) or nothing (dead), never `0`/blank-as-value; null model still reads `unknown` |
| 7 | Session identity on `session_id` | pass — dismiss and all effort state key on the Muster id |
| 8 | Settings trespass | pass |
| 9 | Real `claude` outside canary/probes | pass — the canary change is a static bundle-string needle, no launch |

## Merge resolution (3e5da467)

Read `git show 3e5da467 --cc` for `internal/session/row.go`, `internal/store/session.go`,
`internal/store/migrate_test.go`, `internal/store/store_test.go`: both sides' columns are kept in
`UpdateSession`'s SET list, its argument list, `sessionColumns` and `scanSession` in the same order
(`cache_requests, cache_reported_expires_at` then the six effort columns); `sessionToRow` carries
both `cacheHeldToRow` and the two effort helpers; migration counts are 16 with `0015_cache_keepalive`
then `0016_effort` in the lineage comments. `TestUpdateSession_RoundTripsEveryField` asserts the six
effort columns and the cache-held tests assert `cache_requests`/`cache_reported_expires_at`; the gate's
store and session packages are green. Resolution correct.

## Issues

### Critical

1. **[e2e-specs]** Gate E1 `make e2e` failed: `web/e2e/effort-header.spec.ts:924` (Dark theme case of the `:893` loop) read `computed(headerEff(page), "color")` as `""`. `renderModel` (`web/src/render/mainhead.ts:564-574`) replaces the `.eff` span on every render pass (each tick and WS message), and `computed()` (`web/e2e/helpers/effort.ts:329-334`) is a one-shot `locator.evaluate` — Playwright resolves the handle and then evaluates in a second round trip, so a node the renderer replaces in between is detached and Chrome's `getComputedStyle` returns `""` for it. The markup is what the plan asks for (`.eff` child of `.model`, class `warn`); the read cannot reliably sample a node that is rebuilt every frame. The same unpolled read is at `:282` (E8) and `:440`, and `:440` is worse than flaky: `expect(…).not.toBe(warnColour)` **passes vacuously** on `""` from a detached node, so the "tint gone after Dismiss" check can pass without measuring anything. Fix: put the three computed-colour reads in `expect.poll(…)` (as the spec's other DOM reads already are), and make `:440` assert a positive value — the resolved colour `.model` itself has — rather than `not warn`. The E2E Validate step ran this spec live and soaked it ×10 (`400 passed`), so it neither skipped the live run nor misclassified a failure; the race is rare enough to survive a 10-run soak. Repair it and soak it again.

### Major

1. **[orchestrator]** DIAG — two diagrams are stale against what shipped. `docs/diagrams/store-schema.md:7` (summary) and `:14` still say "after migrations 0001-0015" / "ALTER TABLEs of 0003-0015", while its body already lists the `0016` columns. `docs/diagrams/one-launch-end-to-end.md` still shows `validateLaunchRequest — directory, model, permissionMode` and `BuildArgv — model, --name, permission mode`; the code checks `effort` after permissionMode (`internal/server/launcher.go:198`) and passes `--effort` (`internal/claudecode/launch.go:85`). Also `plans/effort/plan.md:406` still says "gains the 0015 columns".
2. **[orchestrator]** `doc-delta:` lines in the logs that the plan's `## Doc Delta` does not carry (it is promoted verbatim): (a) `daemon-implementation.md`: a Resume-button resume also cancels a still-pending first-report check (edge case 11; `internal/session/actions.go:301`, `reconcile.go:240`) — nothing under **actions** says so; (b) `web-implementation.md`: a dead, never-reported session keeps the width of ` (…)` reserved invisibly (`.model.holds-eff::after`, `web/src/style.css` — the INV-6 fix), where **focus**'s Doc Delta says only "no brackets"; (c) `web-implementation.md`: design-system §3/§5 — the strip's Dismiss is a ghost `.btn.sm` in `--warn-fg` on `--warn-line`, never disabled — absent from the "Outside the feature specs" design-system line.

### Minor

1. **[orchestrator]** `ingest` is under **Touches**, but this plan adds a status-line signal to its territory: `docs/features/ingest/spec.md:26`'s Signals table ("Context, model, title, account usage | the status-line payload") no longer lists everything the status line feeds, and effort is read from the status line on every routed post. Promote `ingest` to **Features** with a Doc Delta line, or add the row to the existing card-location delta's scope.

### Notes

1. **[note]** For review-maintainability: `.eff` is a fresh `<span>` on every render pass (`web/src/render/mainhead.ts:570-573`), while its sibling `render/effortstrip.ts` memoises on a signature. That churn is what Critical 1's spec races against. The fix there is the spec's; whether the renderer should also stop churning the node is your call.
2. **[note]** The dismiss route's 404 serves `no session with that id` (`internal/server/effort.go:14`), as the Protocol Contract pins, while every other route serves the shared `unknown session id`. It is contract-correct; doc-reconcile may want to note the divergence in `docs/protocol.md`.
3. **[note]** R4 / the Warning-strip row say "316px" without saying whose width. With the rail fixed at 300px, a 316px *window* leaves a 16px header where the existing model already overflows, so the spec reads it as the header's 316px container width (a 616px window), per Repair 5. That reading is honest, and I verified the repair's assertions are unchanged in strength. The plan wording should name the header width next time.
4. **[note]** Repairs 1–4 (`test-specs.md`) are honest. A bind or `/clear` `SessionStart` without `model` is the measured shape (kb:fact/sessionstart-model-optional-string). The restart moved before Stop because ended rows are swept at the next start (kb:adr/lifecycle-ended-rows-swept-next-start). Every value assertion is kept.
5. **[note]** At failure time the gate's page snapshot showed the dashboard's connection-gated controls disabled (rename, Stop, Usage model, Select). It also showed the strip and `.model` "Opus 4.5 (high)" still present. I could not re-read the artifact afterwards (`web/test-results` was cleared by a later run), so I make no claim about why the socket was down. It would explain an extra render pass during the read.

## Browser review

# Browser review: Effort

**Plan**: effort
**Part verdict**: needs-changes
**Cycle**: 1
**Pack**: kb: pack 14240 words (budget 30000)
**Rig**: `make web-build build` at d81f25cb (tree dirty only in `plans/effort/orchestration-state.json`); scratch daemons from `helpers/fixtures.ts` (`$TMPDIR/muster e2e-*`, a data dir with a space, `tmux.sock` inside it, torn down per test), stub `claude` from `helpers/daemon.ts`, headless Chromium through a throwaway spec (deleted afterwards); `git status --porcelain` shows nothing of mine.

Gate log: `17-e2e.log` is red on one line, `effort-header.spec.ts:893` (Dark theme, `.eff` colour `""`). I re-ran that test's three theme variants with `--repeat-each=10`: **3 of 30 failed**, all with `Received: ""`. The cause is measured below (browser Major 1). The app I drove is the build that ships.

## Matrix

Hosts: **focus** (Focus view), **tiles** (Tiles view), **dialog** (the launch dialog opened from the masthead in each view), **pop-out** (`/doc.html`). The plan puts the effort readout and the strip in the Focus mainhead only ("Effort on rail cards, tiles or Resume-tab rows" is out of scope), so the tiles and pop-out cells for header rows are N/A. Viewport is 1280×900 unless a cell says otherwise.

| Req | Host | State | Claim | Result | Evidence |
|-----|------|-------|-------|--------|----------|
| REQ-1 | dialog (focus) | no data | Effort row placed between Model and Start in | pass | radiogroup boxes in y order: Model 591–616, Effort 627–652, Start in 663–688; all inside dialog 280,148–1000,753 |
| REQ-1 | dialog (focus/tiles) | no data | six segments visible | pass | 6 labels `default low medium high xhigh max`, x 382–697 y 628–651, computed `display:block; visibility:visible; opacity:1`; legend `Effort` |
| REQ-1 | dialog (focus/tiles) | no data, 620px tall | Launch reachable | pass | `#launch-dialog` `overflow-y:auto`, scrollHeight 603 > clientHeight 582; after scrollIntoView Launch is at 918,576–983,601, inside the 620px viewport |
| REQ-1 | dialog (tiles) | data | operable by keyboard, keeps focus | pass | clicked `low`, pressed ArrowRight: active radio `medium` checked; the same tagged node is still active and checked after 1.3 s |
| REQ-2 | dialog (tiles) | data | keyboard-chosen level is spawned | pass | tmux `#{pane_start_command}` carries `--effort medium` |
| REQ-4 | dialog (focus) | data | reopen on the directory and a Recent click restore the level | pass | after an `xhigh` launch: on open the checked value is `xhigh`; after a Recent click it is `xhigh` |
| REQ-4 | dialog (tiles) | data | same | pass | open `xhigh`, Recent click `xhigh` |
| REQ-6 | focus | no data (alive, no post) | `<model> (…)` | pass | `.model` text `claude-haiku-4-5-20251001 (…)` (the bind's model id), `.eff` ` (…)` |
| REQ-6 | focus | no data (dead, never reported) | model with no brackets; header does not move | pass | text `claude-haiku-4-5-20251001`, no `.eff`; `.model.holds-eff::after` holds ` (…)` invisibly, so the box is 680–877 both alive and dead |
| REQ-6 | focus | data | `<model> (<level>)` | pass | `Opus 4.5 (high)`; `.eff` ` (high)`; wire `effort:{level:"high"}` |
| REQ-6 | focus | data (no-effort model) | bare model | pass | `Haiku 4.5`, no `.eff` node, no `::after` |
| REQ-6 | focus | data (Resume tab, null model) | `unknown` then brackets | pass | `unknown (max)`; argv `--effort max` |
| REQ-6 | tiles / pop-out | any | — | N/A — plan § Out of scope: no effort on tiles; the pop-out shows the reader only | |
| REQ-6/R4 | focus | data, windows 1440/1280/1000/900/800/760/700/640/616 | model never truncates | pass | `.model` scrollWidth = clientWidth (102/102) at every width; `.eff` right edge = `.model` right edge; model right 602 ≤ 616 at the narrowest; no horizontal page scroll |
| REQ-7/8 | focus | data (clamped) | strip sentence | pass | `Asked for max — Opus 4.5 started at high.` |
| REQ-7/8 | focus | data (no effort) | strip sentence | pass | `Asked for high — Haiku 4.5 has no effort setting, so it started without one.` |
| REQ-8 | focus | data | strip placed under mainhead, above slot, full width | pass | mainhead 300,46–1280,95; strip 300,95–1280,129; slot 300,129–1280,874 |
| REQ-8 | focus | data | strip and tint visible in `--warn` | pass | strip `display:flex; visibility:visible; opacity:1`; `.eff.warn` colour = `--warn` (rgb 232,207,90 Instrument) |
| REQ-8/R3 | focus | data, Instrument / Dark / Light | strip and tint use the warn tokens | pass | `.eff` = `--warn`, strip bg = `--warn-bg`, fg = `--warn-fg` in all three (Dark 227,205,87 / 64,58,26 / 246,236,192; Light 97,83,0 / 251,241,194 / 90,74,0); `--warn` ≠ `--amber` (242,163,60) |
| REQ-8 | focus | data | the `.eff` node is stable across render passes | FAIL | the tagged `.eff` node is gone after 1.3 s; a MutationObserver counts 6 child removals on `.model` in 3 s; the gate's computed-style read gets `""` in 3 of 30 runs (Major 1) |
| R4 | focus | data, windows 1440 → 616 | Dismiss stays in view | pass | Dismiss inside the strip and the window at every width, e.g. 541–602 at 616; strip wraps from 34px to 43px tall at ≤700 |
| REQ-8 | tiles | data (warned) | strip not shown outside Focus | pass | `#effort-strip` box 0×0 (its Focus container is hidden); `Asked for` absent from `innerText` |
| REQ-8 | pop-out | — | — | N/A — plan § Views: Focus only | |
| REQ-9 | focus | data | Dismiss with keyboard clears strip and tint | pass | focused Dismiss, pressed Enter: strip `display:none`, `.eff` class `eff` (colour back to 166,171,188), wire `effortWarning:null` |
| REQ-9 | focus | data | Dismiss keeps focus across a tick before it is pressed | pass | the tagged Dismiss node is still `document.activeElement` after 1.3 s |
| REQ-9 | focus, second window | data | the strip goes in every window | pass | page 2 strip present (`Asked for xhigh …`) before; `null` after page 1's Dismiss; header `Opus 4.5 (high)` stays |
| REQ-9 | focus | data, two warned sessions | the bystander keeps its warning | pass | after dismissing B, A still reads `Asked for max — Opus 4.5 started at high.` with `.eff warn` |
| REQ-10 | focus | data (Stop → Resume) | level kept; spawn carries it | pass | dead `Opus 5.5 (low)`, Resume → `Opus 5.5 (low)`, argv `--effort low`, wire effort `low` and the warning unchanged |
| REQ-11 | dialog → focus | data | Resume-tab spawn and seed | pass | argv `--effort max`, header `unknown (max)` before any post, no strip |
| REQ-13 | focus | data | the pane refits when the strip appears and goes | pass | size note vs tmux `#{window_width}x#{window_height}`: 130x32 → 130x31 when the strip shows → 130x32 after Dismiss; they agree in every read |
| REQ-13 | focus | data, windows 1440 → 616 | the refit holds at width, strip wrapped | pass | note = tmux at every width (151x26, 130x25, 79x25, 66x25, 61x25, 53x25, 45x24, 41x24) |
| REQ-12 | all | — | token family present | pass | four tokens resolve in all three themes (row above); `make contrast` is gate line `07` (green) |
| Edge 16 / E11 | focus | data, reload and daemon restart | warning survives | pass | after `page.reload()`: `Asked for xhigh — Opus 4.5 started at high.`; after `daemon.restart()`: the same, `.eff warn` ` (high)` |
| Edge 4 / E13 | focus | daemon-down (SIGTERM) | header and strip keep their state; banner shows | pass | banner `musterd unreachable — hook output in open panes is Muster's absence, not session failure.`; `Opus 4.5 (high)`, `.eff warn`, strip `display:flex` |
| States § daemon down | focus | daemon-down | a failed Dismiss leaves the strip and reports in the action-error line | pass | after a click: strip still `flex`; `#action-error` `display:block` reads `Could not reach musterd.` (still shown 1.5 s later) |
| REQ-1 | dialog | daemon-down | — | N/A — the dialog's daemon-down behaviour is unchanged by this plan; the Effort row is static markup | |
| §6 honesty | focus | all | no `0%`-style fake for unknown effort; no Done; no cost | pass | unknown reads `(…)`, which is a word-like placeholder, not a fake value; a no-effort model shows no brackets rather than a guessed level |
| §7 terminal | focus | data | one live client; geometry moved on refit | pass | size note reads `one live client · geometry owned by this pane`; tmux agrees after every strip show/hide |

## Issues

### Critical

(none)

### Major

1. **[web-impl]** The Focus header's `.eff` span is thrown away and rebuilt on every render pass. In a warned session, a node I tagged was gone 1.3 s later, and a MutationObserver on `.model` counted 6 child removals in 3 s with nothing on the page changing. A locator that resolves `.eff` can therefore point at a node that is detached by the time it is read. That is what turned gate line `17-e2e` red: `effort-header.spec.ts:893` read `getComputedStyle(.eff).color` as `""`. Re-run with `--repeat-each=10`, it fails 3 of 30 times across all three themes, so the red line is not specific to Dark. The cause is `renderModel` in `web/src/render/mainhead.ts:57-67`, which calls `createElement("span")` and `replaceChildren` on every pass. A fix must keep the same `.model` text node and `.eff` element across passes, and touch the DOM only when the brackets text or the `warn` flag changes. The strip in `render/effortstrip.ts` already works this way with a signature memo. To prove it: `make e2e-soak SPEC=effort-header.spec.ts N=10` green, plus a node-identity check across a render tick.

### Minor

(none)

### Notes

1. **[note]** If a keyboard user presses Dismiss, the strip hides and focus drops to `<body>` (measured: `document.activeElement` is `BODY` afterwards). The plan names no place for focus to go, and `web-implementation.md` already records this. No change requested; it is a candidate for a follow-up.
2. **[note]** Not measured: the strip's refit while the **shell** or **docs** surface is selected. All REQ-13 cells used the claude surface, because the shell pane's tmux target is not exposed to the oracle without more harness work. The strip sits above the shared `#main-terminal-slot`, so the same refit path should apply.
3. **[note]** Not measured: whether `#action-error`'s `Could not reach musterd.` from a failed daemon-down Dismiss clears once the daemon comes back. The plan sets no rule for this.
4. **[note]** On a dead session the effort shows its last-known value (`Opus 5.5 (low)`) with no age. §6.8 is about state that may be stale. Effort is display-only and the plan defines it as last-known, so I raise no defect. Any wording change would be the orchestrator's decision, not an impl fix.
5. **[note]** At window widths 400 and 316 the existing header already overflows the window, because the 300px rail leaves `.main` 100px and 16px wide (web-impl handoff item 5). I measured R4 down to a 616px window, where the header's content is about 316px wide, and it passed. The plan's "316px" wording is `review-work`'s to rule on.

## Maintainability review

# Maintainability review: Effort

**Plan**: effort
**Part verdict**: needs-changes
**Cycle**: 1
**Pack**: kb: pack 21691 words (budget 30000)
**Scope**: 42 files from `git diff main...HEAD -- cmd internal web/src ':!*_test.go' ':!*.test.ts'`

## Files

| File | Siblings opened | design: line | Size warnings | Result |
|------|-----------------|--------------|---------------|--------|
| internal/claudecode/claudecodetest/claudecodetest.go | transcripts.go | n/a (test helper) | filelen 651 (main 641), no reason given | Minor 3 |
| internal/claudecode/claudecodetest/transcripts.go | claudecodetest.go | n/a | none | pass |
| internal/claudecode/launch.go | (own `PermissionModes`/`ValidPermissionMode`) | n/a (constants mirror `PermissionModes`) | none | pass |
| internal/claudecode/launchtranscripts.go | (own `model` scan) | no | none | pass (Note 6) |
| internal/claudecode/status.go | (own `interpretPromptCache`) | no | none | pass (Note 4) |
| internal/server/CLAUDE.md | — | n/a (generated trailer) | none | pass (Note 9) |
| internal/server/effort.go | rename.go, respond.go, launcherrors.go | yes (rename.go matched; Fix Attempt 1's one-off 404) | none | Major 1 |
| internal/server/launcher.go | launcherpast.go | yes (`createSessionRequest.Effort *string`) | funlen `Resume` 42 stmts, filelen 624: already over, reason holds | pass |
| internal/server/launcherpast.go | launcher.go | yes | funlen `launchResume` 69: already over, reason holds | pass |
| internal/server/repos.go | — | n/a (one field) | none | pass |
| internal/server/server.go | — | n/a (one `register` line) | funlen `New` 49 stmts: already over, no reason given | Minor 3 |
| internal/server/sessionwire.go | (own `sessionWireCache`) | n/a | none | pass |
| internal/session/CLAUDE.md | — | n/a (generated trailer) | none | pass |
| internal/session/actions.go | reconcile.go | n/a (one line) | none | pass |
| internal/session/apply.go | status.go | n/a | none | pass |
| internal/session/effort.go | manager_rail.go (`MarkSeen`), status.go (`adoptCache`), row.go | yes | none | pass (Notes 3, 8) |
| internal/session/manager.go | — | yes (`CreateParams` two strings) | filelen 628 (main 623), reason holds | pass |
| internal/session/reconcile.go | actions.go | n/a (one line) | none | pass |
| internal/session/row.go | (own cache/model row mappers) | n/a | none | pass |
| internal/session/session.go | (neighbouring field declarations) | yes | none | pass (Note 3) |
| internal/session/status.go | apply.go | n/a | none | pass (Note 4) |
| internal/session/writeorder.go | — | yes (`restoreChangedFields`) | none | pass |
| internal/store/CLAUDE.md | — | n/a (generated trailer) | none | pass |
| internal/store/migrations/0016_effort.sql | — | n/a | none | pass |
| internal/store/repo.go | session.go (`sessionColumns`) | yes (`repoColumns`) | none | pass |
| internal/store/session.go | repo.go | yes | **new** filelen 514 (main 491), **new** funlen `UpdateSession` 64 (main 60), `scanSession` 66 (main 62, already over); the Decisions reason is stale | Minor 3 |
| web/src/api/launch.ts | protocol/decode.ts, protocol/session.ts | no | none | Minor 1 |
| web/src/api/sessions.ts | (own `putSessionsGroup`) | n/a | none | pass |
| web/src/features/CLAUDE.md | — | n/a | none | pass (Note 9) |
| web/src/features/effort.ts | focus.ts, rename.ts, usage.ts, groups.ts | yes (claims the usage.ts/rename.ts shape) | none | Minor 2 |
| web/src/features/focus.ts | effort.ts | n/a (one element ref) | none | pass |
| web/src/features/launch.ts | launchrestore.ts | yes | filelen 824 (main 796), reason holds | pass (Note 1) |
| web/src/features/launchrestore.ts | launch.ts, sessions/permission.ts | yes | none | pass |
| web/src/main.ts | — | n/a (one `init` line) | none | pass |
| web/src/protocol/session.ts | protocol/decode.ts | yes (beside `PERMISSION_MODES`) | none | pass |
| web/src/render/effortstrip.ts | render/railsections.ts (signature memo), render/mainhead.ts | yes | none | pass |
| web/src/render/mainhead.ts | effortstrip.ts | n/a | none | pass |
| web/src/sessions/CLAUDE.md | — | n/a (generated trailer) | none | pass |
| web/src/sessions/card.ts | sessions/effort.ts | yes (`EffortReadout`) | none | pass |
| web/src/sessions/effort.ts | sessions/permission.ts | yes | none | pass |
| web/src/sessions/testfixtures.ts | — | n/a | none | pass |
| web/src/style.css | `.banner` (style.css:488) | n/a | none | pass (Note 7) |

## Issues

### Critical

None.

### Major

1. **[orchestrator:decision]** `DELETE /api/sessions/{id}/effort-warning` serves its own 404 message, which puts back a divergence an earlier cleanup removed. `internal/server/effort.go:14-17` adds `msgEffortUnknownSession = "no session with that id"` and `writeEffortUnknownSession` beside the shared `respond.go:84` `msgUnknownSession = "unknown session id"` / `respond.go:87` `writeUnknownSession`. At `effort.go:34-37` the handler also parses `{id}` by hand with `strconv.ParseInt`, where its sibling `rename.go:49` calls `parseSessionID(w, r)`. `respond_unknown_session_test.go:40-55` records that six call sites were collapsed into "one spelling instead of six" and that the test guards "against a *future* divergence"; this route is that divergence, with the same `unknown_session` code and a different message. The cause is the contract: `plans/effort/plan.md:127` / `docs/protocol.md:1034` give the message as `no session with that id`, which is the prose description that `docs/protocol.md:794,837,871` use, and those same lines give the body as `"message": "unknown session id"`. That makes it a contract choice and not an impl defect (cites conventions § Design "One owner per concept"):
   - **Option A — keep the contract as written:** this route keeps its own message, its one-off writer and its hand-rolled id parse. It costs a second `unknown_session` spelling that `TestUnknownSessionEnvelope_ByteIdenticalAcrossMigratedCallSites` does not cover, and a reader has to learn that one route differs.
   - **Option B — amend the contract to the shared body:** `docs/protocol.md:1034` and the plan's contract give `"message": "unknown session id"`, and the handler uses `parseSessionID` and `writeUnknownSession` like `rename.go`. `effort.go` loses its constant, its helper and its `strconv` parse. The dismiss 404 tests change their expected message, and the route can join the byte-identical table.

### Minor

1. **[web-impl]** `web/src/api/launch.ts:89` adds a module-local `isNullableString`. Two problems follow. First, the module that owns decode primitives says so: `protocol/decode.ts:1-5` reads "This module owns how a JSON primitive … and 'null or one of these' are recognised … Every module under `web/src/protocol/` and `web/src/api/` imports from here". Second, the same file now spells the same check two ways: `parseRepo` (lines 110-116) uses the helper, while lines 156, 157, 159 and 179 keep the inline `x !== null && typeof x !== "string"`. `rg -n 'function (is\w*Nullable\w*|isStringOrNull|nullableString|asNullableString)' web/src` finds only this one definition, and no `design:` line covers it. A fix must make two things true: the nullable-string check has one home (exported from `protocol/decode.ts` beside `isString`, if it is kept at all), and `api/launch.ts` spells the check one way throughout. `parseRepo` must stay under the Biome cognitive-complexity ceiling.
2. **[web-impl]** The strip's Dismiss is the only Focus-pane control wired outside `features/focus.ts`, and the strip now has two owners. `features/focus.ts:118` looks up `#effort-strip` for rendering. `features/effort.ts:10` separately looks up `#effort-strip .dismiss` and attaches its listener. Every other mainhead control gets its listener in `focus.ts`: Stop/Resume at `:147`, Remove at `:151`, and the group button at `:154`, which goes through `deps.groups.openMoveMenu`. Rename hands `mainheadRenameHandlers` to focus, and focus attaches them (`rename.ts:15-17`, `focus.ts` `attachRenameEditor`). The `design:` line says `features/effort.ts` "takes `usage.ts`/`rename.ts`'s shape", but `rename.ts` attaches nothing to the mainhead, so the line cites a precedent that does the opposite (conventions § Design "Match the siblings", "One owner per concept"). A fix must make one of these true: (a) the Dismiss listener is attached where the other Focus-pane controls are, and reaches the dismiss call through a structural dep or handler as rename and groups do; or (b) a `design:` line names the actual reason the strip is the exception, and cites no sibling that contradicts it.
3. **[daemon-impl]** The Decisions size line is stale and incomplete. It reads "no new warning. `internal/store/session.go` went 476 → 499 lines (under the 500 threshold)". The gates' size log measures `internal/store/session.go` at 514 lines; main has 491, so this is a new filelen hit. It also reports `UpdateSession` at 64 lines; that is a new funlen hit, since it is 60 on main and the threshold is >60. Both came after the `3e5da467` merge of main. Two other hits on touched files have no reason at all: `claudecodetest.go` filelen 651 (main 641) and `server.go` `New` funlen 49 statements. Each warning is fine with a reason that holds (conventions § Design "Size is read, not obeyed"; kb:adr/process-size-linters-warn-never-fail). A fix must make the Decisions line account for every size hit on a touched file, each with a reason the code bears out, for example that `UpdateSession` is one UPDATE listing every column. A split made only to clear a warning does not count.

### Notes

1. **[note]** The size reason for `web/src/features/launch.ts` (796 → 824) holds. The added lines are one more form row's select, restore and touched wiring, alongside Model and Permission mode in the same controller. The reasons for `launcher.go` `Resume`, `launcherpast.go` `launchResume`, `manager.go` and the pre-existing `scanSession` hit also hold: each was over on main and gained only the new field.
2. **[note]** `repoColumns` (`internal/store/repo.go:25`) is a good reuse. It matches `sessionColumns` and removes four copies of the same column list.
3. **[note]** The three new `Session` fields at `internal/session/session.go:206-208` have no declaration comment. Every neighbour names its writers and `Manager.mu` (for example `:197`, `:200-203`). The daemon `design:` line says "Writers named at the declaration", which is not true in the tree. The guard itself is sound: every writer (`adoptEffort` via `ApplyStatus`, `CreateSession`, `RecordResume`, `RepairOwnedSession`, `ClearEffortWarning`) runs under `Manager.mu`, the pointer fields are replaced rather than mutated, and `make test-race` passed. Comment upkeep belongs to the comment pass.
4. **[note]** `claudecode.interpretEffort` (`status.go:198-204`) never returns nil, so the `reading == nil` branch in `session.adoptEffort` (`effort.go:28`) is reachable only from a hand-built `StatusUpdate`. The `StatusUpdate` doc comment ("Every field is nil when the payload didn't carry it") is now false for `Effort`. Two other comments now leave out `Effort`/`EffortWarning`: the immutable-snapshot list in `applyStatusUpdate`'s comment (`session/status.go:20-22`) and the one in `Session.Clone`'s comment (`session.go:228-229`). These are comment-pass items.
5. **[note]** `internal/server/effort.go` otherwise matches `rename.go`: a feature type with `mount`, one-line `register`, `context.WithoutCancel`, and an error switch on `session.ErrUnknownSession`. `session.ClearEffortWarning` mirrors `MarkSeen` (`manager_rail.go:169-187`) line for line.
6. **[note]** `launchtranscripts.go:212` assigns `s.effort = line.Effort` on every assistant line. The `model` assignment just above it is guarded by `!= ""`. If "the last assistant line had no effort, so resume without `--effort`" is intended, the asymmetry is correct; whether it is intended is review-work's call.
7. **[note]** `.effort-strip` (`style.css:910-927`) repeats `.banner`'s shape (`style.css:488-500`: full width, token background, bottom border, mono font, `flex: none`, a `[hidden]` rule) with a new `--warn-*` family. `.banner.neutral` is a precedent for variants. The strip adds a flex row, a glyph and a button, so sharing the rule is not clearly better. No change requested.
8. **[note]** `copyString` (`session/effort.go:57`) is a package-wide pointer helper, but it lives in a feature file while `derefOrZero`/`ptrOrNil` live in `row.go`. The implementer's `rg` shows nothing existing for it. Taste only.
9. **[note]** The hand-written parts of two CLAUDE.md files leave out `effort`: the route list in `internal/server/CLAUDE.md`'s **Owns** line ("`rail.go` (pin, order), `rename.go` (title)") and the **Features** list in `web/src/features/CLAUDE.md`. Doc truth belongs to review-work. The `web-components` diagram's module counts were updated on the branch (37 `features/` modules, measured).
10. **[note]** The one red gate line (`e2e/effort-header.spec.ts:893`, the Dark-theme `--warn` hue check) belongs to review-work and review-browser.
