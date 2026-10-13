# Review: title-crop-stop-resume-button

**Plan**: title-crop-stop-resume-button
**Verdict**: needs-changes
**Cycle**: 1
**Gates**: 0 failed
**Parts**: code, browser, maintainability
**Part verdicts**: code approved, browser needs-changes, maintainability needs-changes

_Merged by orch-state.py merge-review; the verdict is computed from the parts and the gate run, never edited by hand._

## Correctness review

# Correctness review: Title crop and Stop/Resume button

**Plan**: title-crop-stop-resume-button
**Part verdict**: approved
**Cycle**: 1
**Pack**: kb: pack 28265 words (budget 30000)

## Requirements

| Req | Implemented | Tested | Status |
|-----|-------------|--------|--------|
| REQ-1 (readout lines as wide as their text, no `ch` cap) | Yes: `.rf`/`.rb` 30ch/44ch rules deleted (`web/src/style.css`), `.loc` no longer wraps and clips | Yes: focus-header "35-character folder at a 1700px header" (pre-fix red: 203 of 251 px), card-location E11 rewrite, INV-3 in the 12 E3 sweeps | pass |
| REQ-2 (give-way order a→b→c→d, reversible) | Yes: `.idrow` with `flex: 1 1 max-content` drops `.acts` whole before anything inside is squeezed; `fitMainheadMeta`/`onOneRow` remove the `↳` block (`.repo-only`) unless the whole row fits; title grow 1000 against meta 1 with the readout at its floor first; `stackMeta` keeps INV-4 in the narrow band | Yes: E3 sweeps (INV-3, INV-4, cluster-after-`↳`, title-after-cluster, widening signature equals narrowing), stacked-band test at 640 px, E7 | pass |
| REQ-3 (no overlap, inside viewport, model never truncates) | Yes: `.meta.stacked` and the 460 px / 316 px container compactions keep every item in the viewport at 600 px | Yes: INV-1/INV-2 at every 16 px step in 12 sweeps, plus `mainheadFitProblems`; stacked-band test | pass |
| REQ-4 (switch in the right cluster, placed by width only) | Yes: `focus.ts` `prepend`s the switch into `.acts`; `.acts { margin-left: auto }` | Yes: cluster tests at 2000/1200/800, two E4 tests (switch box, Stop left, Remove right, gap unchanged after rename + longer branch + move), switch focus pin | pass |
| REQ-5 (one Stop/Resume button, enablement, hover reason, click dispatch) | Yes: `stopResumeButton` in `sessions/card.ts`, `renderStopResume` in `render/mainhead.ts`, one click listener dispatching `end`/`resume` | Yes: card.test.ts 8-cell table; mainhead.test.ts single-button block; E1, E2, keyboard Resume, E5, E6, actions E14 x2 and E7, theme E13, card-location fit loop, rename 300-char | pass |
| REQ-6 (no layout shift on swap) | Yes: `.mainhead .acts .stop-resume { min-width: calc(6ch + 24px) }` (mono face, border-box), node rewritten in place | Yes: E1/E2 box equality for the button and Remove (polled), node identity by tag | pass |
| REQ-7 (drop to two rows takes nothing from row one) | Yes: `.idrow`'s basis is its natural width | Yes: `expectDropTookNothing` at each sweep's drop step | pass |
| DIAG | `kb:diagram/web-components` (named by `kb for` for all five changed source files): directory granularity, no new module or edge (`render/`→`sessions/` and `features/`→`sessions/` already drawn) | — | pass |

## Build & Tests

E2E tests: pass (789 passed, `17-e2e.log`) · Daemon tests (race): pass (24 packages ok, `02-test.log`) · Web tests: pass (2503 in 91 files, `05-web-test.log`) · Daemon build: pass (`01-build.log`) · Web build: pass (`04-web-build.log`) · Lint: pass (golangci-lint 0 issues, `03-lint.log`; biome clean, `06-web-lint.log`). Everything read from $GATES_LOG_DIR; nothing re-run.

Other baseline lines, all pass: contrast (46 pairs x 3 themes, 0 failures), features-inventory, versions (all fragments fresh), e2e-honest, kb check (562 records, 0 problems), e2e-lint clean, features-scope, comment-checks clean, comment ledger (2 added blocks, all kept), size (0 hits).

## Acceptance Checks

| ID | Command | Result |
|----|---------|--------|
| W1 | `make web-build` | pass (`04-web-build.log`) |
| W2 | `make web-test` | pass (`05-web-test.log`, 2503 passed) |
| W4 | `make web-lint` | pass (`06-web-lint.log`) |
| W7 | `! rg -lU "\.mainhead \.meta \.r[fb]\s*\{[^}]*max-width:\s*[0-9]+ch" web/src/style.css` | pass (`18-W7.log`, no match; 0 failed lines) |
| E8 | `make e2e` | pass (`17-e2e.log`, 789 passed, 0 failed) |
| DOC | doc upkeep + Doc Delta vs what shipped | FAIL — the three `doc-delta:` lines in `web-implementation.md` are not in the plan's `## Doc Delta` (Major 1); the four plan ADRs are present as `proposed` with `refs: plan:title-crop-stop-resume-button`; no `deviation:` line, so no ADR owed; no fact record owed; the `TODO.md` tick of #73/#83, the ADR flips and the `docs/design/design-system.md` § Focus mainhead edit are planned for Completion, so not missing yet. Each Doc Delta line that is in the plan is true of what shipped. |

## Reviewer-Verified Criteria

| ID | Criterion | Result | Evidence |
|----|-----------|--------|----------|
| W3 | Table-driven derivation over all eight `{alive, claudeSessionId, connected}` cells | pass | `web/src/sessions/card.test.ts` `stopResumeButton` `it.each` over 8 rows, each asserting label, action, disabled and reason with `toEqual`. The no-session clause is Note 2. |
| W5 | No-session pins still run against the single button | pass | `web/src/render/mainhead.test.ts` "no-session branch" block unchanged and green with the `stopResumeBtn` fake (`05-web-test.log`) |
| W6 | No `any` in new web code | pass | No `: any`, `as any`, `<any>` or `any[]` in any added line under `web/src` or `web/e2e` |
| E1 | Stop → same element reads enabled Resume, same box, Remove unmoved | pass | focus-header.spec.ts E1: node tag, `toHaveCount(1)`, polled `sameBox` for button and Remove, `alive:false` |
| E2 | Resume → same element reads Stop, boxes unchanged | pass | focus-header.spec.ts E2, same shape, no dialog, `alive:true` |
| E3 | 2000→600→2000 sweep in 16 px steps asserting INV-1..4, INV-8; pre-fix failure shown | pass | 12 sweeps through `sweepHeader`; pre-fix output in test-specs.md: `INV-3: repo .rf 203.2 of 250.6px ellipsized while the header is on one row` and `"wholeLine": false` |
| E4 | Longer title and longer readout leave the switch and Remove in place | pass | focus-header.spec.ts E4 at 2000 and 1000 px |
| E5 | Unbound dead session: one disabled Resume with the reason | pass | focus-header.spec.ts E5 (`title` equals the reason, no Stop, `claudeSessionId` null) |
| E6 | WS closed: disabled under either label, re-enables per its rule | pass | actions.spec.ts E14 (live: Stop disabled; dead and bound: Resume disabled, then enabled after reconnect); focus-header E6 (unbound Resume stays disabled after reconnect). See Note 3. |
| E7 | Tiles and back at 1000 px leaves INV-1..4 | pass | focus-header.spec.ts E7, polled `headerInvariantProblems` equal to `[]` |
| review-browser | INV-1..8 at the eight widths, and the pre-fix 1000 px row | review-browser's | not mine to measure |

## Hard-Rule Checklist

| # | Rule | Result |
|---|------|--------|
| 1 | Adapter boundary | pass: web-only diff; no Claude Code field names in changed source |
| 2 | Terminal-output state parsing | pass: none |
| 3 | Blocking hook handler | pass: no daemon change |
| 4 | Bare tmux / resize-pane | pass: no tmux invocation added |
| 5 | Payload logging | pass: none |
| 6 | Empty-gauge dishonesty | pass: the model slot still reads `mainheadMeta`'s `unknown` for a null model; no new gauge branch |
| 7 | Session identity on `session_id` | pass: the click looks up by `app.state.focusedId` (Muster id) |
| 8 | Settings trespass | pass: none |
| 9 | Real `claude` outside canary | pass: specs use `helpers/payloads.ts` builders only |

## Issues

### Critical

None.

### Major

1. **[orchestrator]** The plan's `## Doc Delta` does not reflect the three `doc-delta:` lines in `web-implementation.md`, and `doc-reconcile` promotes the delta verbatim, so `docs/features/focus/spec.md` would leave out behaviour that shipped:
   (a) the `↳` block is drawn only when the whole header, cluster included, fits on one row, and is otherwise removed rather than wrapped. Because of this it hides at ordinary window widths: at 1280 px with a 21-character repo it was drawn on `main` and is hidden now. That is why card-location `:226`/`:271` moved to 1400 px.
   (b) the narrow band where the model, then the ended clause, stack under the readout inside `.meta` (`.mainhead .meta.stacked`, `stackMeta` in `render/mainhead.ts`). The readout stays beside the title, held at its floor whenever the title is cut.
   (c) below 460 px of header content the ended clause takes its own row; below 316 px the cluster tightens its padding.
   Line (b) was rewritten in Fix Attempt 1, so take the wording from there. Each line also names `docs/design/design-system.md`, which is already the orchestrator's edit at Completion.
2. **[orchestrator]** The proposed ADRs describe something other than what shipped in the narrow band. `kb:adr/focus-surface-switch-pinned-with-actions` says "The model stays in the readout line after its `·` and moves with the readout". In the stacked band the model is under the readout, and its `·` is hidden (`web/src/style.css` `.mainhead .meta.stacked .loc > .sep:last-child { display: none }`). `kb:adr/focus-header-give-way-order-title-last` lists only steps (a)–(d) and does not mention the stacked step, which web-impl added so that INV-4 and REQ-3 hold together below about 344 px of header content. Both records are `proposed` and can be amended before the Completion flip.

### Minor

1. **[orchestrator]** The accepted `kb:adr/focus-mainhead-title-keeps-a-floor` has the summary "The mainhead title shrinks first and ellipsises but never below 6rem", and its Context says the title "gives up width before the meta line does". The developer's title-last order (`kb:adr/focus-header-give-way-order-title-last`) contradicts the "shrinks first" half. The new record cites the old one in `refs` but does not supersede it, so once both are accepted, kb will present two contradictory current records. The 6rem floor half survives. Either add it to the new record's `supersedes` and restate the floor, or say in the new record that only the floor half stands. This is record bookkeeping for a decision the developer already made, not a new decision.

### Notes

1. **[note]** Run fact (2) checks out: REQ-1 removes the cap, and REQ-2 (a) has to come before (b). So the `↳` block now hides at a default 1280 px window for a typical repo name, where `main` drew it (measured by web-impl and validate: the row needs about 990 px against a 980 px header). This is what the plan says, but it is a visible change to when the header shows where Claude is. It is worth including in the developer's Waterfox check before `/land`. The plan's "Existing tests this breaks" list missed `card-location.spec.ts:226`/`:271` and wrongly expected `rename.spec.ts:766` to hold. Both were repaired honestly: Repairs rows 1–2 only widen the window, and every assertion is unchanged.
2. **[note]** W3's clause "including the no-session pass leaving the button attached" has no assertion on the Stop/Resume button itself. The no-session branch (`web/src/render/mainhead.ts:136-145`) returns before touching it, the button is static markup in `web/index.html`, and the W5 pins pass with the single-button fake. There is nothing that could detach it.
3. **[note]** E6: `Stop`'s re-enable after a reconnect is not driven end to end. The live-session test kills the daemon, which does not reconnect. `Resume`'s re-enable is driven (`web/e2e/actions.spec.ts:777`), the derivation's eight cells are unit-pinned, and both labels go through the same `renderStopResume` call on `status`.
4. **[note]** Run fact (1): the stacked band is consistent with the orchestrator's ruling. Flex line breaking uses the items' floors (`.name` basis 6rem, `.meta` basis min-content). So `.meta` wraps under the title, and therefore `.stacked` is set, only once the title floor, the readout floor and the model no longer fit side by side. The band is never entered while (c) or (d) still has room. Validate attempt 2 proved Repairs row 3 (`lineProblems` made two-dimensional) red by deliberately breaking the build. Only the records lag (Majors 1 and 2).
5. **[note]** Stale code comment, `web/src/style.css:736-737`: "`.idrow` wraps the row below the title before it gives up a pixel of it". Since Fix Attempt 1, `stackMeta` stacks the model under the readout instead, so the row does not stay under the title.
6. **[note]** Stale test comment, `web/e2e/helpers/focus-header.ts:168-169`: "a `↳` block that gave way wraps to a clipped second line of `.loc`". It is now removed with `display: none` (`.repo-only`). The filter still works because a removed block has no client rects.
7. **[note]** Citations of records this plan supersedes, to repoint when the ADRs flip or at doc-reconcile: `docs/features/rail/spec.md:24` and the `refs` of `docs/features/card-location/spec.md` cite `kb:adr/rail-repo-line-wraps-at-slash`, whose rail half is restated in `kb:adr/focus-header-readout-sized-by-text`. `docs/design/design-system.md:201,258` cite it too. The e2e comments at `web/e2e/helpers/card-location.ts:428,498,503`, `web/e2e/card-location.spec.ts:1059` and `web/e2e/groups-focus.spec.ts:240` cite `kb:adr/focus-mainhead-wraps-to-second-row-when-narrow` / `kb:adr/focus-repo-block-keeps-floor-beside-group-control`.
8. **[note]** For review-maintainability: `web/src/render/mainhead.ts` lost its file-header comment in this branch (the comment pass's ledger covers added blocks only).

## Browser review

# Browser review: Title crop and Stop/Resume button

**Plan**: title-crop-stop-resume-button
**Part verdict**: needs-changes
**Cycle**: 1
**Pack**: kb: pack 9617 words (budget 30000)
**Rig**: `make web-build build` at `578150b6` (`v0.20.2-53-g578150b6-dirty`, dirty = orchestration-state.json only); per-test scratch daemons from `helpers/fixtures.ts` (data dir `$TMPDIR/muster e2e-XXXX`, space-bearing; tmux socket `<data dir>/tmux.sock`, killed by teardown); run-shared stub `claude` (`$TMPDIR/muster e2e-stub-cd75a542396fd84f`); headless Chromium via a throwaway `web/e2e/zz-review-browser-tmp.spec.ts` (deleted; `git status` shows nothing of mine). Gates log c1: 18 lines, 0 failed, `17-e2e` 789 passed.

Rows driven (folder 35 = `economic-game-theory-simulation-lab`, rail 300 px):
**short** title 9 / folder 35 / `main` / grouped / alive / unmoved; **short-moved** the same, moved to a worktree;
**long** title 300 / folder 35 / branch 80 / moved / alive; **dead** title 52 / folder 60 / branch 80 / dead;
**no-data** title 52 / folder 35 / never bound (no SessionStart, no status line).
Each row: snapshot at the 8 named widths (2000, 1400, 1100, 1000, 900, 800, 700, 600), then a
**4 px** sweep 2000 → 600 → 2000 (702 steps) running the committed `headerProblems` (INV-1..4, INV-8,
the REQ-2 order) plus my own checks: Remove's right edge at the header's content edge (INV-5),
free room on row one ≥ the cluster's width while it sits on row two (premature drop, REQ-2 b),
every `[hidden]` in `#mainhead` computing `display: none`, and the opacity product up the ancestor
chain of every `.acts` button.

## Matrix

Hosts: the Focus mainhead is the only host. Tiles has no mainhead (measured: `#mainhead` has no
client rects in Tiles; tile footer keeps its own separate `Stop`, out of scope); there is no pop-out
of the header.

| Req | Host | State | Claim | Result | Evidence |
|-----|------|-------|-------|--------|----------|
| REQ-1 / INV-3 | focus | data | lines as wide as their text; ellipsized only on two rows with `↳` hidden | pass | 4 px sweep, 5 rows × 702 steps, 0 INV-3 hits; short @2000 `.rf` 250.6/250.6 one row; dead @2000 `.rb` 541.9/541.9 one row |
| REQ-1 | focus | data | pre-fix row "1000 px, 2 rows, folder 147 of 251" now whole | pass | short @1000: two rows, `.rf` 250.6 of 250.6 natural |
| REQ-1 | focus | data | 35-char folder at 1700 px header shows whole line | pass | short @2000: `.rf` 250.6/250.6, one row (old cap 203) |
| REQ-2 a | focus | data | `↳` hides whole first | pass | short-moved: drawn 2000→1436, hidden at 1432 while still one row; cluster drops at 1244; no half-drawn block (no `claude-at` line ellipsized in any step) |
| REQ-2 b | focus | data | cluster drops as one, before the readout ellipsizes | pass | `clusterProblems` 0 hits; my premature-drop check 0 hits (row-one free room never ≥ cluster width while on row two) |
| REQ-2 c/d | focus | data | readout to its floor before the title shortens | pass | dead: 2 rows @1928, readout shrinks 541.9→54.5 before title ellipsizes @1120; long @600–2000 readout 54.2–55.4 (floor 54.2) whenever title cut; INV-4 0 hits |
| REQ-2 | focus | data | widening reverses the order | pass | every transition re-crossed at the same 4 px step on the way up (e.g. short 2r@1244 / 1r@1248 both directions; no hysteresis) |
| REQ-2 | focus | no data | give-way order with an unbound session | pass | no-data: drop @1424, title cut only from 848 with readout 54.5 |
| REQ-3 / INV-1 | focus | data | no overlap, inside viewport | pass | 0 INV-1 hits over 3510 sweep steps; e.g. @600 Remove right 586 ≤ content edge 586 |
| REQ-3 / INV-2 | focus | data | model never truncates | pass | model 169/169 at every named width, every row; stacked under readout below ~680 px (`@416,85`) |
| REQ-3 / INV-2 | focus | no data | model whole | pass | model reads `haiku` (launch alias, not null), 34/34 |
| REQ-4 / INV-5 | focus | data | switch first in `.acts`, Remove at content edge, constant gap | pass | `.acts` children = `surfseg, stop-resume, danger`; Remove right = content right at every step; switch→button gap 7 px (5 px below 316 px container) in every row at a given width |
| REQ-4 / E4 | focus | data | rename to longer/shorter title doesn't move cluster | pass | real rename via keyboard @1600 (one row) and @900 (two rows): switch, Stop, Remove boxes identical before/after |
| REQ-5 | focus | data | one button, label follows `alive`, cross-checked | pass | pointer click Stop → confirm dialog → `Resume`, `/api/state` `alive:false`; pointer click Resume → `Stop`, `alive:true`; `data-action` end/resume follows |
| REQ-5 / INV-7 | focus | data | exactly one of Stop/Resume | pass | `stopResumeLabels` length 1 at every snapshot |
| REQ-5 | focus | data | keeps focus / operable by keys | pass | Tab from `docs` segment lands on the button; same node (`data-rb-node`) after 1.2 s; Enter resumes, label → `Stop`, same node still focused after another 1.2 s |
| REQ-5 / E5 | focus | data | unbound dead → disabled Resume with reason | pass | `Resume` disabled, `title` "Can't resume — this session never started a Claude conversation."; Remove enabled |
| REQ-5 | focus | daemon-down | button, Remove, rename, group control disabled; label kept | pass | SIGTERM: alive row `Stop` disabled, dead row `Resume` disabled, Remove disabled, rename disabled, `.ingroup` disabled; banner role=alert opacity 1 at 0,46 1100×32 "musterd unreachable — hook output in open panes is Muster's absence…" |
| REQ-6 / INV-6 | focus | data | button same box under both labels | pass | @1600 64.625 vs 64.64 wide, 25 tall; @600 58.625 vs 58.64 |
| REQ-6 / INV-6 | focus | data | Remove's box identical before/after Stop, ≥ 792 px | pass | @1600 Remove 1521.36,57.69 before and after; @900 821.36,91.38 before and after |
| REQ-6 / INV-6 | focus | data | Remove's box identical before/after Stop, 600–784 px | **FAIL** | Remove and Stop/Resume move down 13 px on Stop (e.g. @784 Remove y 91.4 → 104.4, header height 80.4 → 93.4; @600 104.4 → 117.4): browser Major 1 |
| REQ-7 | focus | data | the drop squeezes nothing | pass | short @1400 → @1100: readout 250.6 → 250.6, title 80 → 80; dead at the 1928 drop: readout 541.9 → 541.9 |
| INV-8 | focus | all | repo block on `.loc`'s first line at ≥ floor | pass | 0 INV-8 hits; minimum repo width 54.2 vs floor 54.2 |
| Hidden | focus | all | `[hidden]` computes `display:none` | pass | 0 leaks in 3510 steps (incl. `.claude-at[hidden]`) |
| Visible | focus | all | buttons visible by computed style | pass | Stop/Resume and Remove: ancestor opacity product 1, `visibility: visible` at every named width, every row |
| E7 | focus → tiles → focus | data | no stale measurement after Tiles | pass | @1000 after Tiles round trip: 0 problems, `.rf` 250.6/250.6 |
| REQ-1..7 | tiles | any | — | N/A — the mainhead is not in Tiles (plan § Views: tile footer untouched) | `#mainhead` has no client rects in Tiles |
| REQ-1..7 | pop-out | any | — | N/A — the header has no pop-out host | |
| §7.1 one live client | focus / tiles | data | one xterm | pass | `.xterm` count 1 in Focus, 1 in Tiles, 1 back in Focus |
| §6 honesty | focus | all | no Done, cost, bare %; daemon-down loud | pass | none of those strings in the header; banner visible as above |

## Issues

### Critical
(none)

### Major
1. **[web-impl]** Stop shifts the header's action cluster down 13 px for every viewport from 600 to 784 px (header content under ~460 px), and Resume shifts it back. REQ-6 and INV-6 require Remove's box to be the same before and after. Measured on one session, Stop through `/end` and the pointer: @784, Remove `705.4,91.4` alive and `705.4,104.4` dead; @600, `527.4,104.4` alive and `527.4,117.4` dead. `#mainhead` grows from 80.4 to 93.4 px tall. The cause is the ended clause (`· ended …`): it appears on Stop, and under `@container (width < 460px)` it takes its own grid row in `.meta` (`web/src/style.css:4377`), which makes the identity row taller and pushes the cluster on row two down. Widths of 792 px and up do not shift. A fix must keep Remove's box and the Stop/Resume box identical before and after a Stop and a Resume at every width from 600 to 2000 px. If the developer would rather keep the ended clause on its own row, that is a REQ-6 amendment and goes to the developer as a decision.

### Minor
1. **[e2e-specs]** E1, E2 and the keyboard Resume test (`web/e2e/focus-header.spec.ts`) check INV-6 at one viewport only (1600 px, which keeps one row). They could not have failed for Major 1. INV-6 needs at least one assertion at a width under 784 px, or a sweep of the swap.

### Notes
1. **[note]** The "No data yet → `unknown` model" state could not be reached through this plan's surface. A launched session that is never bound shows its launch alias (`haiku`), not null. The null-model `unknown` path is the resume-list path (kb:adr/launch-resume-null-model-reads-unknown), which this plan does not touch. Every other no-data cell was measured on the never-bound row.
2. **[note]** At the default 1280 px viewport, a session in another checkout draws no `↳` block in the header. In short-moved it hides at 1432 px and below while the header is still one row. This is REQ-2 (a) as written (the block hides first), and web-implementation.md records it as a doc-delta. I am noting it only because many users' windows will never show the block.
3. **[note]** Not measured: Waterfox (plan Out of scope: the developer checks before `/land`), and xterm `scrollback` (no terminal code changed; §7 ordering facts belong to `review-work`).

## Maintainability review

# Maintainability review: Title crop, stop/resume button

**Plan**: title-crop-stop-resume-button
**Part verdict**: needs-changes
**Cycle**: 1
**Pack**: kb: pack 13628 words (budget 30000)
**Scope**: 6 files from `git diff main...HEAD -- cmd internal web/src ':!*_test.go' ':!*.test.ts'` (2 of them generated kb trailers); `web/index.html` read alongside because `.idrow` and `.stop-resume` are declared there

## Files

| File | Siblings opened | design: line | Size warnings | Result |
|------|-----------------|--------------|---------------|--------|
| web/src/sessions/card.ts | sessions/context.ts; consumers render/actionbutton.ts, render/dead.ts, render/tiles.ts, render/sessions.ts | yes (`stopResumeButton` in `sessions/card.ts`) | none (size-warn: 0 hits) | Major 1 |
| web/src/render/mainhead.ts | render/dead.ts, render/tiles.ts, render/sessions.ts, render/actionbutton.ts, render/reader.ts | yes (`fitMainheadMeta` extended; `stackMeta`) | none | Minor 1, Minor 2 |
| web/src/features/focus.ts | features/launch.ts, features/rename.ts, features/actions.ts | yes (click listener mirrors group control) | none | pass (Note 2) |
| web/src/style.css | itself: `.btn` (:2693), `.mainhead .meta` (:747), `.ended-at` rules (:844-856), group-control section (:4326-4374) | yes (`.idrow`, `.stacked`, `.repo-only`, the two container queries) | none | Minor 2, Minor 3, Minor 4 |
| web/src/features/CLAUDE.md | — (generated kb trailer) | n/a | none | pass |
| web/src/render/CLAUDE.md | — (generated kb trailer) | n/a | none | pass |
| web/index.html (outside Scope, read) | render/tiles.ts's `.tfoot .acts` markup | yes (`.idrow` wrapper) | none | pass |

## Issues

### Critical

None.

### Major

1. **[web-impl]** `StopResumeButton` restates the label-to-action map that `render/actionbutton.ts` already owns. See `web/src/sessions/card.ts:130-147`. This breaks conventions § Design "Reuse before add" ("A second implementation of an existing idea is a defect even when both work") and "One owner per concept". The new view-model hard-codes `label: "Stop"` with `action: "end"` and `label: "Resume"` with `action: "resume"` (`card.ts:141`, `:143-144`). It also types `label` as a fresh `"Stop" | "Resume"` literal (`card.ts:131`) beside the existing vocabulary. The existing owners, quoted:
   ```
   web/src/sessions/card.ts:16:   export type CardAction = "Stop" | "Resume" | "Remove";
   web/src/render/actionbutton.ts:7: const ACTION_BY_LABEL: Record<CardAction, SessionAction> = {
   web/src/render/actionbutton.ts:8:   Stop: "end",
   web/src/render/actionbutton.ts:9:   Resume: "resume",
   ```
   `rg -n "CardAction|ACTION_BY_LABEL" web/src --glob '!*.test.ts'` shows the map has exactly one other home, `render/actionbutton.ts`. `sessions/` cannot import `render/`, which is why the map was written a second time. A fix must make two things true:
   - The label-to-`SessionAction` pairing is written once, in `sessions/` beside `CardAction`, and both `buildActionButton` and `stopResumeButton` read it.
   - `StopResumeButton["label"]` is typed from `CardAction`.

### Minor

1. **[web-impl]** One row test is written two ways in one file. See `web/src/render/mainhead.ts:77` and `:84-88`. This breaks § Design "Reuse before add". `onOneRow(root)` is a named helper for "element A starts above element B's bottom, with a 1 px tolerance", applied to `.acts` and `.idrow`. Six lines above it, `stackMeta` re-inlines the same comparison with the same unexplained `- 1` for `.meta` and `.name`: `metaEl.getBoundingClientRect().top < title.getBoundingClientRect().bottom - 1`. `fitMainheadMeta` now makes three layout decisions, and only one of them goes through a named predicate. A fix must make the "same row" test one named predicate over two elements, used at both sites, so the tolerance has one home.

2. **[web-impl]** The readout-floor length is now spelled out three times, once of them as a CSS string in TypeScript. This contradicts the stylesheet's own rule at `web/src/style.css:739` ("The lengths the give-way layout shares are declared once, here, and derived everywhere else") and § Design "One owner per concept".
   - `min(calc(var(--floor) + var(--sep-gap)), var(--loc-cap, 100vw))` appears at `style.css:753` (the grid track) and again, verbatim, at `style.css:837` (`.meta.stacked .loc`).
   - `web/src/render/mainhead.ts:81` writes `calc(var(--floor) + var(--sep-gap))` into `--loc-cap` from TypeScript. That composes the stylesheet's private variables in a second language, and gives `--loc-cap` a second meaning: "hold at floor", next to "the repo block's measured width", which is the only meaning its declaration comment names (`style.css:744-746`).

   A fix must make three things true:
   - The floor-plus-gap length is one named custom property declared on `.mainhead .meta`.
   - The grid track and the stacked `.loc` both derive from it.
   - The TypeScript write names that property (or toggles a state the CSS maps to it) instead of re-composing the calc.

3. **[web-impl]** `.stop-resume`'s fixed width bakes in `.btn`'s padding and border as literals. See `web/src/style.css:877` (`min-width: calc(6ch + 24px)`) and `:892` (`calc(6ch + 18px)`). This breaks § Design "One owner per concept". `box-sizing: border-box` is global (`style.css:177`), so the `24px` is `.btn`'s `padding: 5px 11px` (`style.css:2696`) plus its 1 px border, both sides. The `18px` is the compact `padding-inline: 8px` (`style.css:888`) plus the border. If either padding changes, the box stops matching "Resume" and nothing notices, and the label swap starts moving the cluster again (the property kb:adr/actions-mainhead-one-stop-resume-button pins). A fix must make the button's minimum width follow the padding it sits in, so changing `.btn`'s or the compact padding cannot desynchronise it. For example, size the label's content box, or derive both from one padding custom property.

4. **[web-impl]** The `< 460px` container query is filed away from the rules it overrides. See `web/src/style.css:4375-4386`. This breaks § Design "Match the siblings". The new `< 316px` query sits directly after the `.mainhead .acts` rules it tightens (`style.css:882`). The `< 460px` query re-places `.mainhead .meta .ended-at` and hides its `.sep`, but it is appended after the group control's `< 640px` query at the end of the file, about 3,500 lines below the `.ended-at` rules (`style.css:844-856`). Source order gives no reason for this: no later non-query rule sets `.ended-at`'s grid placement, and container queries do not depend on where `container-type` is declared. Someone reading the `.ended-at` layout will not find its narrow-width override. A fix must put the query beside the `.ended-at` rules, or say in Decisions why it cannot go there.

### Notes

1. **[note]** `web/src/render/dead.ts:74-76` still derives the dead surface's Resume inline (`!connected || !canResume(...)`, `resumeDisabledReason(session)`). That is exactly the rule `stopResumeButton`'s Resume branch now owns (`card.ts:142-147`). In Focus on a dead session, both Resume buttons are on screen together. The duplication predates this branch: the old mainhead had its own inline copy, and the branch moved it rather than adding one. `tiles.ts:291` and `render/sessions.ts:108,115` are the same rule again. A later tidy could route all of them through the view-model.
2. **[note]** `web/src/features/focus.ts:148` builds a whole render view-model with a positional `true` just to read `.action`. The `design:` line explains this, and it is correct, because `app.render()` is synchronous on every WS message (`web/src/app.ts:92`), so the store and the label never disagree at click time. Once Major 1 gives the map one owner, a direct `alive`-to-action lookup would read better. The `app.store.values().find((s) => s.id === app.state.focusedId)` lookup now appears at `focus.ts:147`, `:154`, `launch.ts:776` and `rename.ts:36`. A `focusedSession()` accessor on `App` would collapse all four, but that predates this branch.
3. **[note]** `fitMainheadMeta` (`web/src/render/mainhead.ts:56-73`) now alternates layout reads and class/property writes four times per call: clear, measure, add `.repo-only`, measure, set the cap, measure, add `.stacked`, measure `scrollWidth`. It runs on every render pass (the 1 s tick and every WS message) and every pane resize. Every write happens before the next measure in the same task, so nothing paints in between and no decision feeds on its own result, as the `design:` line says. The cost is up to four forced layouts per pass. No measurement shows it matters, so nothing is requested.
4. **[note]** Stale comment: `web/src/style.css:744-746` describes `--loc-cap` as set "only while the `↳` block is not drawn: the repo block's width plus its `·` room". `stackMeta` (`mainhead.ts:80-81`) now also writes a floor value. The comment pass owns this.
5. **[note]** Stale comment: `web/src/sessions/card.ts:121-123`, the `resumeDisabledReason` doc, still says it returns `null` when "session is alive". This branch narrowed the parameter to `Pick<Session, "claudeSessionId">`, so the function cannot see `alive`. The comment pass owns this.
6. **[note]** The comment pass dropped the doc comments on `fitMainheadMeta` and the `mainhead.ts` module header. `fitMainheadMeta` is now the most layout-dense exported function in `render/` and has no comment. If the next cycle's comment pass sees a candidate there, it should weigh it.
7. **[note]** For review-work: `web/src/style.css` no longer cites kb:adr/focus-mainhead-wraps-to-second-row-when-narrow, kb:adr/focus-group-control-stays-while-title-shortens or kb:adr/focus-repo-block-keeps-floor-beside-group-control, and all three are still `accepted`. Whether the new proposed ADRs supersede them is review-work's ADR/doc row.
8. **[note]** The `@container` breakpoints `316px` and `460px` (`style.css:882`, `:4377`) are measured constants of today's content: the cluster's natural width, and the width at which the ended clause fits. Container queries cannot take `var()`, so nothing re-derives them when labels or padding change. Decisions records the measurements, and the focus-header width sweeps are what guard them (kb:lesson/layout-invariant-needs-its-width-range).
9. **[note]** The component diagram is unchanged. `features/focus.ts` now has a value import from `sessions/card` where it had a type-only import, an edge `features` → `sessions` the diagram already draws. No new module.
