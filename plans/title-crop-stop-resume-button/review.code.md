# Correctness review: Title crop and Stop/Resume button

**Plan**: title-crop-stop-resume-button
**Verdict**: approved
**Cycle**: 2
**Pack**: kb: pack 28323 words (budget 30000)

Full review, not a delta cycle: cycle 1 left a browser Major and a maintainability Major open.
The cycle's gate is the re-run in `gates-title-crop-stop-resume-button-c2b`. Its ledger reused
every PASS from the first cycle-2 run (`…-c2`, same tree at `664e5ca4`) and re-ran only
`size` and `make e2e`. Nothing was re-run by me.

## Requirements

| Req | Implemented | Tested | Status |
|-----|-------------|--------|--------|
| REQ-1 (readout lines as wide as their text, no `ch` cap) | Yes. The `.rf`/`.rb` 30ch/44ch rules are deleted (`web/src/style.css`). `.loc` is one row and no longer wraps and clips. | Yes. The focus-header "35-character folder at a 1700px header" test (pre-fix red: 203 of 251 px), card-location E11 rewrite, INV-3 in the 12 E3 sweeps. | pass |
| REQ-2 (give-way order a→b→c→d, reversible) | Yes. `.idrow` is `flex: 1 1 max-content`, so `.acts` drops whole before anything in the row is squeezed. `fitMainheadMeta`/`onOneRow` set `.repo-only` unless the whole row fits, so the `↳` block goes first. Title grow is 1000 against the meta's 1. `stackMeta` stacks the model and caps the readout at `--loc-floor` while the title is cut. | Yes. E3 sweeps (INV-3, INV-4, order, widening equals narrowing, REQ-7 drop step), the 640 px stacked-band test, E7. | pass |
| REQ-3 (no overlap, inside viewport, model never truncates) | Yes. `.meta.stacked` and the `< 316px` cluster compaction. The ended clause now sits in a reserved slot under the model (`style.css:864-880`) and no longer takes its own row. | Yes. INV-1/INV-2 at every 16 px step in 12 sweeps plus `mainheadFitProblems`. `endedAgeProblems` checks the clause is inside the header and the viewport at every swap-sweep width. | pass |
| REQ-4 (switch in the right cluster, placed by width only) | Yes. `features/focus.ts` `prepend`s the switch into `.acts`, and `.mainhead .acts` has `margin-left: auto`. | Yes. Cluster tests at 2000/1200/800, two E4 tests, switch focus pin. | pass |
| REQ-5 (one Stop/Resume button, enablement, hover reason, click dispatch) | Yes. `stopResumeButton` (`sessions/card.ts:143`) reads `ACTION_BY_LABEL`, which now has one home in `sessions/card.ts:25`. `renderStopResume` writes the one node in place. One click listener dispatches `end`/`resume` by the store's `alive`, keyed on the focused Muster id. | Yes. `card.test.ts` 8-cell table, the `mainhead.test.ts` single-button block, E1, E2, keyboard Resume, E5, E6, actions E14 ×2 and E7, theme E13. | pass |
| REQ-6 (no layout shift on swap) | Yes. The Stop/Resume content box is `6ch` with `box-sizing: content-box`. The ended clause's slot (`--ended-w`, `visibility: hidden` while `[hidden]`) is reserved in both states, under the model inside `.loc`'s two-line height, and as a `min-height: 1lh` third row in the stacked band. | Yes, and now at every width. 5 swap sweeps (2000→600 in 16 px steps: Remove, Stop/Resume, switch and header boxes alive vs dead), 3 Stop-then-Resume clicks at 784/600/600, the keyboard Resume at 600. These are red on the pre-fix tree (test-specs.md "Red against the pre-fix layout": the 13 px narrow shift and the wide-band row drop). | pass |
| REQ-7 (drop to two rows takes nothing from row one) | Yes. `.idrow`'s basis is its natural width. | Yes. `expectDropTookNothing` at each sweep's drop step. | pass |
| DIAG | `kb:diagram/web-components` (the only diagram `kb for` names for all six changed source files). It is drawn at directory granularity. There is no new module. `render/actionbutton.ts`'s import of `sessions/card` became a value import, and the `render` → `sessions` edge is already drawn. | — | pass |

## Build & Tests

E2E tests: pass (798 passed, `c2b/02-e2e.log`) · Daemon tests (race): pass (24 packages ok, `c2/02-test.log`, reused) · Web tests: pass (2503 in 91 files, `c2/05-web-test.log`, reused) · Daemon build: pass (`c2/01-build.log`, reused) · Web build: pass (`c2/04-web-build.log`, reused) · Lint: pass (golangci-lint 0 issues `c2/03-lint.log`; biome clean `c2/06-web-lint.log`; both reused). Everything was read from the two gate directories.

The other baseline lines all pass, reused from `c2`:
- contrast: 46 pairs × 3 themes, 0 failures
- features-inventory: empty log
- versions: all fragments fresh
- e2e-honest: empty log
- kb check: 562 records, 0 problems
- e2e-lint: clean
- features-scope: in Features/Touches
- comment-checks: clean
- comment ledger: 2 added blocks, all kept

`size` re-ran in `c2b`: 0 hits.

The first cycle-2 run (`c2/17-e2e.log`) failed one test outside this plan: `launch.spec.ts:43` (`dialog 'New session'` `button 'Up'` count 1, expected 0). It passed in the `c2b` sweep (798/798), and the orchestrator reports 5/5 alone. The launch dialog is not in this branch's diff, so I classify it as a flake, not a regression this plan caused (Note 5).

## Acceptance Checks

| ID | Command | Result |
|----|---------|--------|
| W1 | `make web-build` | pass (`c2/04-web-build.log`; reused in `c2b`) |
| W2 | `make web-test` | pass (`c2/05-web-test.log`, 2503 passed; reused) |
| W4 | `make web-lint` | pass (`c2/06-web-lint.log`; reused) |
| W7 | `! rg -lU "\.mainhead \.meta \.r[fb]\s*\{[^}]*max-width:\s*[0-9]+ch" web/src/style.css` | pass (`c2/18-W7.log` empty; reused) |
| E8 | `make e2e` | pass (`c2b/02-e2e.log`, 798 passed, 0 failed; also the baseline e2e line, deduped) |
| DOC | doc upkeep + Doc Delta vs what shipped | FAIL. See correctness Majors 1 and 2, both `[orchestrator]`. Cycle 1's three `[orchestrator]` items are verified done. (a) `plans/…/doc-delta.md` is seeded from the plan plus every `doc-delta:` line, and the later fix wording replaces the earlier (`216f0264`). (b) The give-way and switch ADRs name the stacked band, and the Stop/Resume and give-way ADRs record the ended age's reserved slot under the model (`352069ff`, `9bb0aea7`). (c) `focus-header-give-way-order-title-last` now supersedes `focus-mainhead-title-keeps-a-floor` and restates the 6rem floor (`352069ff`). All four plan ADRs are `proposed` with `refs: plan:title-crop-stop-resume-button`. No `deviation:` line exists, so no ADR is owed for one. No fact record is owed. The `TODO.md` "Tiles per group" amendment is in, as Out of scope directs. The #73/#83 tick and the ADR flips are Completion steps, not missing yet. |

## Reviewer-Verified Criteria

| ID | Criterion | Result | Evidence |
|----|-----------|--------|----------|
| W3 | Table-driven derivation over all eight `{alive, claudeSessionId, connected}` cells | pass | `web/src/sessions/card.test.ts` `stopResumeButton — … all eight cells`: 8 `it.each` rows, each asserting `{label, action, disabled, reason}` by `toEqual`. The "no-session pass leaves the button attached" clause has no own assertion. Nothing can detach the static node: the no-session branch returns before touching it (cycle 1 Note 2 stands). |
| W5 | No-session pins still run against the single button | pass | `web/src/render/mainhead.test.ts` "no-session branch must not detach the rename button" (3 tests) is unchanged and runs on `fakeMainheadElements` with one `stopResumeBtn`. |
| W6 | No `any` in new web code | pass | `rg ': any\b\|as any\|<any>'` over the changed source and test files: no hit. `ACTION_BY_LABEL` is `as const satisfies Record<CardAction, SessionAction>`. |
| E1 | Stop → same element, enabled Resume, same box, Remove unchanged | pass | `focus-header.spec.ts:422` at 1600 px, plus the cycle-2 swap sweeps (`:617`, all widths 2000→600) and narrow clicks (`:674`). |
| E2 | Resume → same element reads Stop, boxes unchanged | pass | `:468`, and the narrow clicks `:674` (Stop then Resume at 784/600/600). |
| E3 | 2000→600→2000 sweep in 16 px steps, INV-1..4 and INV-8, pre-fix failure shown | pass | 12 sweeps `:332`, whole-line test `:351`. The pre-fix reds are pasted in test-specs.md (`INV-3: repo .rf 203.2 of 250.6px`, `"wholeLine": false`). |
| E4 | Rename + move leaves switch and Remove in place | pass | `:922` at 2000 and 1000. |
| E5 | Dead, unbound → one disabled Resume with the reason | pass | `:784`. |
| E6 | WS closed → disabled under either label, re-enables per rule | pass | `:812` and the rewritten `actions.spec.ts` E14 ×2. `Stop`'s re-enable after a reconnect is still not driven end to end (Note 4). |
| E7 | Tiles round trip at 1000 px | pass | `:1024`. |
| review-browser | INV-1..INV-8 at the named widths | — | review-browser's part. |

## Hard-Rule Checklist

| # | Rule | Result |
|---|------|--------|
| 1 | Adapter boundary | pass. No Go file changed. No Claude-Code field name in the changed web files. |
| 2 | Terminal-output state parsing | pass. The label follows the daemon's `alive`. |
| 3 | Blocking hook handler | pass (N/A, no daemon change) |
| 4 | Bare tmux | pass. Only `daemon.killTmuxWindow` (fixture, private socket) in the spec. |
| 5 | Payload logging | pass (N/A) |
| 6 | Empty-gauge dishonesty | pass. The model's null path (`unknown`) is untouched. The button needs no absent data. |
| 7 | Session identity on `session_id` | pass. The click resolves `app.state.focusedId` (the Muster id). `claudeSessionId` only gates Resume's enablement. |
| 8 | Settings trespass | pass |
| 9 | Real `claude` outside canary/probes | pass. Stub claude via fixtures. `claude-haiku-4-5-20251001` appears only as a synthesized model display name. |

## Issues

### Critical
(none)

### Major

1. **[orchestrator]** `doc-delta.md`'s third focus line states more than shipped, and it carries run history that `doc-reconcile` would promote. The line reads: "a session in another checkout shows no `↳` block in the header at the default 1280 px window (Fix Attempt 0; review cycle 1 browser Note 2)". That was measured only for 21- and 35-character repo names: card-location's repair needed 990 px against the 980 px header, and browser's short-moved row hid at 1432 px. The rule in code is "drawn iff the whole header fits on one row" (`render/mainhead.ts` `fitMainheadMeta`/`onOneRow`). A 6-character folder line is about 15ch (~100 px) narrower, so the block can be drawn at 1280 px. This is computed, not measured. The web-impl log's own line was hedged: "so it can hide at ordinary window widths". The delta should keep that wording, or give the measured example with its repo-name length. Separately, the parentheticals "(Fix Attempt 0; …)", "(Fix Attempt 1; …)" and "(Fix Attempt 2; …)" in three lines are run provenance. A feature spec must not carry them ("never append history"). Keep the `kb:` cite only.

2. **[orchestrator]** The `docs/design/design-system.md` § Focus mainhead edit planned for Completion is scoped too narrowly to cover what shipped. The `doc-delta:` lines in `web-implementation.md` name design-system alongside the focus spec:
   - the `↳` block is removed unless the whole row fits;
   - the stacked narrow band;
   - the ended age under the model, without its `·`, in a reserved slot;
   - the cluster tightening below 316 px.

   `doc-delta.md` § "Not doc-reconcile's" defers design-system to the plan's Implementation Notes. Those Notes list only the give-way sentence, the 30ch/44ch clause and the switch placement, so none of the four reaches design-system. The same section also still says "the title gives way first, the control is the first item removed whole" (`design-system.md:265`), which contradicts kb:adr/focus-header-give-way-order-title-last. A fix must make the Completion design-system edit cover lines 252-266 against the four shipped behaviours above, and not only the sentence the plan named.

### Minor
(none)

### Notes

1. **[note]** For the developer's pre-`/land` look: browser Major 1 was fixed by moving a dead session's ended age from after the model (`· ended 3m ago`) to under it, without the `·`. Its slot is reserved in both states. In the stacked band that means an empty third row while alive. Where the model is narrower than 14ch, the model column is 14ch wide while alive. The proposed ADRs record this (`9bb0aea7`), and REQ-6 now holds at every width. The plan never pinned the clause's placement beyond "in the meta row" (edge case 12), where it still is. So I am not raising this as a decision. It is a visible change nobody asked for, though, and web-impl's "deviation-free" reading should not hide it from the developer.
2. **[note]** For review-browser: `.mainhead .meta .ended-at[hidden] { display: block; visibility: hidden; }` (`web/src/style.css:872`) deliberately overrides the `[hidden]` companion rule (kb:lesson/display-rule-overrides-hidden-attribute) to keep the slot. A cycle-1 style "every `[hidden]` in `#mainhead` computes `display: none`" check will flag it by design. It is out of the accessibility tree via `visibility: hidden`, and its text is emptied while alive (`renderMeta`).
3. **[note]** Stale or false comments:
   - `web/src/style.css:735-737`: "the row's `min-content` is that, the model and `.ended-at`" and "`.idrow` wraps the row below the title before it gives up a pixel of it". The clause now shares the model's column, and since `stackMeta` the model stacks under the readout instead.
   - `web/e2e/helpers/focus-header.ts:169`: "a `↳` block that gave way wraps to a clipped second line of `.loc`". It is now removed by `.repo-only`.
   - `web/src/sessions/card.ts:128`: "`null` when … (session is alive, …)". The parameter is now `Pick<Session, "claudeSessionId">`, so the function cannot see `alive`.

   Cycle 1 carried the last two, and the cycle-2 comment pass did not touch them.
4. **[note]** E6: `Stop` re-enabling after a reconnect is still not driven end to end. The live test kills the daemon. `Resume`'s re-enable is driven, both labels go through the same `renderStopResume(…, connected)` call, and the 8-cell table pins the derivation (cycle 1 Note 3).
5. **[note]** `launch.spec.ts:43` failed once in the first cycle-2 full sweep (`getByRole('button', { name: 'Up' })` inside the New session dialog resolved to 1 element). It passed in the gate's re-run and 5/5 alone, and nothing in this branch touches the launch dialog. It is outside this plan's spec files and not caused by its diff. It is a candidate for `proposed-backlog.md` if it recurs.
6. **[note]** Code comments still cite records this plan supersedes. They need repointing when the ADRs flip:
   - kb:adr/rail-repo-line-wraps-at-slash: `web/src/style.css:2302,2575`, `web/src/sessions/card.ts:164`, `web/src/render/mainhead.ts:36`, `web/src/render/repolines.ts:3`. Their rail/tile/hover halves are restated in kb:adr/focus-header-readout-sized-by-text.
   - kb:adr/focus-mainhead-wraps-to-second-row-when-narrow and kb:adr/focus-repo-block-keeps-floor-beside-group-control: `web/e2e/helpers/card-location.ts:428,498,503`, `web/e2e/card-location.spec.ts:1059`, `web/e2e/groups-focus.spec.ts:240`.
7. **[note]** On cycle 1's maintainability Note 7: kb:adr/focus-group-control-stays-while-title-shortens (accepted) is not contradicted. Its "the title gives way first" is relative to the group control, which still hides only at the 640 px breakpoint, and a title can still shorten beside it once the readout is at its floor. No supersede is owed.
8. **[note]** The cycle-2 test additions are honest. No existing assertion was edited (test-specs.md cycle-1 fix: "Repairs: None"). Each new INV-6 test was shown red on a throwaway pre-fix tree, both on the narrow 13 px shift and on the wide-band row drop. The status line without `session_name` (`fullModel` rows) matches kb:fact/status-session-name-source ("absent until one exists"). The `mainhead.test.ts` fake now matches the shipped `.ended-at > .ended` markup.
