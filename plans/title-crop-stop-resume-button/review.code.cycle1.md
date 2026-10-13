# Correctness review: Title crop and Stop/Resume button

**Plan**: title-crop-stop-resume-button
**Verdict**: approved
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
