# Review: title-crop-stop-resume-button

**Plan**: title-crop-stop-resume-button
**Verdict**: approved
**Cycle**: 2
**Gates**: 0 failed
**Parts**: code, browser, maintainability
**Part verdicts**: code approved, browser approved, maintainability approved

_Merged by orch-state.py merge-review; the verdict is computed from the parts and the gate run, never edited by hand._

## Correctness review

# Correctness review: Title crop and Stop/Resume button

**Plan**: title-crop-stop-resume-button
**Part verdict**: approved
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

## Browser review

# Browser review: Title crop and Stop/Resume button

**Plan**: title-crop-stop-resume-button
**Part verdict**: approved
**Cycle**: 2
**Pack**: kb: pack 9617 words (budget 30000)
**Rig**: `make web-build build` at `664e5ca4` (`musterd v0.20.2-62-g664e5ca4`, clean tree). Per-test scratch daemons come from `helpers/fixtures.ts`: data dir `$TMPDIR/muster e2e-XXXX` (space-bearing), tmux socket `<data dir>/tmux.sock` killed at teardown, and the run-shared stub `claude`. Driven in headless Chromium through throwaway `web/e2e/zz-rb-c2.spec.ts` and `zz-rb-c2b.spec.ts`, both deleted; `git status` shows nothing of mine. Gates log c2b: `01-size` 0 hits, `02-e2e` 798 passed, 0 failed.

Rows driven: folder 35 = `economic-game-theory-simulation-lab` unless noted, rail 300 px. Twelve swap variants:

- titles 9, 18, 29, 40 and 52 (grouped);
- 75 (ungrouped);
- 300 with the full model id;
- 52 moved, with bypass chip, 80-character branch and full model id;
- 9 with a 6-character folder;
- 29 with a 60-character folder and 80-character branch;
- 9 moved with `shell` selected;
- 29 never bound (no data).

For each variant I swept **4 px** steps from 2000 to 600 (351 widths) three times, comparing at every width:

1. alive;
2. after a real pointer Stop and the confirm dialog (dead);
3. after a real pointer Resume (alive again; not run for the unbound row, whose Resume is disabled).

That is 11,934 settled snapshots in all. Each snapshot ran the committed `headerProblems` (INV-1..4, INV-8, the REQ-2 order) and `clusterShiftProblems` (INV-6) against the alive reading at the same width. It also ran `endedAgeProblems`/`endedAgeAbsentProblems` and my own checks:

- every `[hidden]` in `#mainhead` computes `display: none`, except `.ended-at[hidden]`, which must compute `visibility: hidden` with no visible child;
- the ancestor opacity product and computed visibility of every `.acts` button;
- free room left on row one beyond the cluster while the cluster sits on row two (a premature drop).

## Matrix

Hosts: the Focus mainhead is the only host. Tiles has no mainhead (`#mainhead` has 0 client rects in Tiles; the tile footer is out of scope). The header has no pop-out.

| Req | Host | State | Claim | Result | Evidence |
|-----|------|-------|-------|--------|----------|
| REQ-6 / INV-6 | focus | data | Stop leaves Remove, the button, the switch and the header unmoved, 600–2000 | pass | 11 bound variants × 351 widths (4 px): 0 `clusterShiftProblems`. This includes the cycle 1 band 600–784 and the bands web-impl named (1112–1184, 1248–1320, 1416–1488) for titles 9, 29 and 52. Row drop points (alive): t9 1244, t18 1300, t29 1380, t40 1468, t52 1556, t75 1764, t52-moved 1848, t29-f60 1672, f6 1072. Dead drops at the same step every time |
| REQ-6 / INV-6 | focus | data | Resume leaves them unmoved, 600–2000 | pass | 10 variants × 351 widths after a pointer Resume (`/api/state` `alive:true`): 0 shifts against the original alive reading |
| REQ-6 / INV-6 | focus | no data | the swap on a never-bound session | pass | t29-unbound: alive vs dead, 351 widths, 0 shifts; after Stop, `Resume` disabled |
| REQ-6 (cycle 1 Major 1 repro) | focus | data | @784 and @600 Remove fixed | pass | daemon-down row: before-Stop Remove @784 `705.4,91.4`, @600 `527.4,117.4`. Sweep: dead equals alive at both widths (cycle 1 was 91.4 → 104.4) |
| REQ-6 | focus | data | button same box under both labels | pass | `stopResume` box included in INV-6 at every width: 0 diffs |
| REQ-5 / INV-7 | focus | data | exactly one button; label follows `alive`, cross-checked | pass | labels `["Stop"]` alive and `["Resume"]` dead at all 11,934 snapshots; `/api/state` `alive` polled after each click |
| REQ-5 | focus | data | operable and keeps focus by keyboard | pass | @700: Tab from `docs` lands on `Stop`, Enter opens the dialog (focus on `Cancel`), keyboard confirm. After 1.2 s, `activeElement` is the same tagged node reading `Resume`; INV-6 0 shifts |
| REQ-5 / E5 | focus | no data | unbound dead → disabled Resume with reason | pass | `disabled`, `title` = "Can't resume — this session never started a Claude conversation." |
| REQ-5 | focus | daemon-down | all header controls disabled; label kept | pass | after SIGTERM: alive row `Stop` disabled, dead row `Resume` disabled; Remove, rename, `.ingroup` and the switch segments disabled. Banner role=alert at 0,46 1000×32, opacity 1: "musterd unreachable — hook output in open panes is Muster's absence…" |
| REQ-5 / ended age | focus | data | ended age under the model, inside header/viewport | pass | `endedAgeProblems` 0 over 3,861 dead snapshots. @1000: model `817,56–986,69`, age `817,71–878,84` "ended now". @600 (stacked): model `417,85–586,98`, age `417,98–478,111` |
| REQ-5 / ended age | focus | data | alive shows no age | pass | `endedAgeAbsentProblems` 0 over 8,073 alive snapshots |
| REQ-1 / INV-3 | focus | data | lines as wide as text; ellipsized only on two rows | pass | 0 INV-3 hits. t52 dead: `.rf` 251/251 @1400 and @2000; ellipsized only from @1100 (two rows) |
| REQ-2 | focus | data | give-way order (↳, cluster, readout, title) | pass | 0 order hits (`clusterProblems`, `titleProblems`) in any phase |
| REQ-2 b / REQ-7 | focus | data | no premature drop | pass | my row-one free-room check: 0 hits while the cluster is on row two |
| REQ-3 / INV-1 / INV-2 | focus | data, no data | no overlap, in viewport, model whole | pass | 0 hits in all phases. Model stays whole when stacked under the readout @600 |
| REQ-4 / INV-5 | focus | data | Remove at the content edge | pass | `clusterProblems` 0 hits |
| INV-8 | focus | all | repo block on `.loc`'s first line, at or above its floor | pass | 0 hits |
| Hidden | focus | all | `[hidden]` hides | pass | 0 leaks. `.ended-at[hidden]` is `display: block` by design (the reserved slot). It computes `visibility: hidden` with no visible child, and has 0 height while alive (`85.4–85.4`) |
| Visible | focus | all | buttons visible by computed style | pass | the opacity product of every enabled `.acts` button is 1 and its `visibility` is `visible` at every snapshot |
| E7 | focus → tiles → focus | data | no stale measurement | pass | dead t52 @1000 after a Tiles round trip: 0 problems, Remove `921.4,91.4` |
| §7 one live client | focus / tiles | data | one xterm | pass | `.xterm` count 1 in Focus, 1 in Tiles, 1 back in Focus (alive session) |
| §6 honesty | focus | all | no Done, no cost, no bare %; daemon-down loud | pass | none of those strings appear in the header; the banner is visible as above |
| REQ-1..7 | tiles | any | — | N/A — the mainhead is not in Tiles (plan § Views: tile footer untouched) | `#mainhead` has 0 client rects in Tiles |
| REQ-1..7 | pop-out | any | — | N/A — the header has no pop-out host | |

## Issues

### Critical
(none)

### Major
(none)

### Minor
(none)

### Notes
1. **[note]** Cycle 1's browser Major 1 is fixed, and so are the three wider bands web-impl reported. Cycle 1's browser Minor 1 (`[e2e-specs]`, INV-6 checked at 1600 px only) is resolved too. The committed swap sweep (`focus-header.spec.ts:618`, 5 rows, 16 px) and the narrow click tests at 784 and 600 compare alive against dead at every width, so they would have failed for cycle 1's shift.
2. **[note]** The reserved ended-age slot is 14ch wide whether or not it shows. With a short model name it leaves blank room after the model, inside `.meta`. I measured "haiku" (unbound session): text 34 px in a 95 px column, so 61 px blank at 1600, 1000 and 600. Nothing shows in that room, but it counts toward the header's width: the cluster drops, and the readout ellipsizes, up to that many pixels earlier than the visible text needs. A display name like `Haiku 4.5` would leave about 5ch (estimated from ch width, not measured). Every invariant holds, because the blank is part of `.meta`'s box. This is the trade the fix chose for REQ-6, so I am not asking for a change.
3. **[note]** On Stop the model moves up 7.6 px to the first line (alive `63.7–76.7`, dead `56.1–69.1`) to make room for the age under it. REQ-6 covers only the button and Remove, and both stay fixed.
4. **[note]** Not measured: Waterfox, where `:has()` moves the model up (plan Out of scope: the developer checks before `/land`). xterm `scrollback` and resize ordering were not checked either: no terminal code changed, and those code facts belong to `review-work`.

## Maintainability review

# Maintainability review: Title crop, stop/resume button

**Plan**: title-crop-stop-resume-button
**Part verdict**: approved
**Cycle**: 2
**Pack**: kb: pack 13628 words (budget 30000)
**Scope**: 7 files from `git diff main...HEAD -- cmd internal web/src ':!*_test.go' ':!*.test.ts'` (2 of them generated kb trailers). This is a full review, not a delta: cycle 1 carried a Major. `web/index.html` was read alongside, because `.idrow`, `.stop-resume` and the `.ended-at` markup are declared there.

## Cycle 1 issues, re-checked

| Cycle 1 issue | Fix commit | Verified how |
|---|---|---|
| Major 1: label-to-action map written twice | 65467313 | `rg -n "ACTION_BY_LABEL\|CardAction\b" web/src --glob '!*.test.ts'` returns one definition (`sessions/card.ts:25-29`, `as const satisfies Record<CardAction, SessionAction>`). Its readers are `render/actionbutton.ts:5,19` and `card.ts:148,151`. `StopResumeButton["label"]` is `Extract<CardAction, "Stop" \| "Resume">` (`card.ts:137`). |
| Minor 1: "same row" test written two ways | 65467313 | `render/mainhead.ts:90-92` `sharesRow(el, other)` is the one place the 1 px tolerance lives. `onOneRow` (`:84`) and `stackMeta` (`:77`) both call it. |
| Minor 2: readout floor spelled out three times | 65467313 | `--loc-floor` and `--loc-min` are declared once (`style.css:754-755`). The grid track (`:760`) and `.meta.stacked .loc` (`:839`) read `--loc-min`, and `stackMeta` writes `var(--loc-floor)` (`mainhead.ts:81`). `rg "calc\(var\(--floor\) \+ var\(--sep-gap\)\)"` has one hit, the declaration. |
| Minor 3: padding literals in `.stop-resume` width | 65467313 | `style.css:901-904` sets `box-sizing: content-box; min-width: 6ch`. `rg "6ch \+"` has no hits. |
| Minor 4: `< 460px` query filed far from its rules | 65467313 | Fixed by removing the query: `rg "460px" web/src/style.css` has no hits. The only container query left in the section, `< 316px`, sits right after the `.mainhead .acts` rules it tightens (`style.css:908`). |

## Files

| File | Siblings opened | design: line | Size warnings | Result |
|------|-----------------|--------------|---------------|--------|
| web/src/sessions/card.ts | consumers render/actionbutton.ts, render/dead.ts, render/tiles.ts, render/sessions.ts, render/mainhead.ts, features/focus.ts | yes (`stopResumeButton` in `sessions/card.ts`; `ACTION_BY_LABEL` move in Fix Attempt 2) | none (`size-warn: 0 hits`) | pass (Note 1) |
| web/src/render/actionbutton.ts | render/sessions.ts, render/tiles.ts | yes (Fix Attempt 2, Major 1) | none | pass |
| web/src/render/mainhead.ts | render/dead.ts, render/tiles.ts, render/sessions.ts, render/actionbutton.ts, render/masthead.ts, the module-header line of every `render/*.ts` | yes (`fitMainheadMeta` extended; `stackMeta`; `sharesRow`) | none | pass (Notes 2, 6) |
| web/src/features/focus.ts | features/launch.ts:776, features/rename.ts:36, its own group-control listener at `:153-156` | yes (click listener mirrors the group control) | none | pass (Note 3) |
| web/src/style.css | itself: `.mainhead` (:641), the `[hidden]` companion rules (:207-1774), the `.acts-row` opacity rationale (:1637-1646), `.surfseg` (:925) | yes (`.idrow`, `.stacked`, `.repo-only`, the ended-clause slot, `:has()`, `--ended-w`, the `< 316px` query) | none | pass (Notes 4, 5, 7, 8) |
| web/src/features/CLAUDE.md | (generated kb trailer) | n/a | none | pass |
| web/src/render/CLAUDE.md | (generated kb trailer) | n/a | none | pass |
| web/index.html (outside Scope, read) | render/tiles.ts's `.tfoot .acts` markup | yes (`.idrow` wrapper) | none | pass |

Shared state: nothing new is written from more than one place except `.meta`'s `stacked` class, `.loc`'s `repo-only` class and `--loc-cap`. These have two callers, the render pass (`mainhead.ts:170`) and the pane `ResizeObserver` (`focus.ts:137-139`), and both reach them only through `fitMainheadMeta`. Every call clears all three first and recomputes them synchronously on the main thread, so no interleaving can leave a half-written state. The `design:` line names `fitMainheadMeta` as the sole owner. Layering: no new `protocol/` import in `render/` (`mainhead.ts:1`'s `Session` type import predates the branch), and `main.ts` is untouched.

## Issues

### Critical

None.

### Major

None.

### Minor

None.

### Notes

1. **[note]** The Resume enablement rule is still written in four places besides `stopResumeButton` (`sessions/card.ts:143-155`): `render/dead.ts:74-76`, `render/tiles.ts:291` and `render/sessions.ts:108,115`. On a dead session in Focus, the header button and the dead surface's cap button both show Resume. This predates the branch (cycle 1 Note 1), so nothing is requested. A later tidy could route the dead surface's cap through the view-model.
2. **[note]** `stackMeta` (`render/mainhead.ts:76,79`) looks up `.name` and `.rename` by selector from `root`. `MainheadElements` already holds both as `nameEl` and `renameBtn`, resolved once in `features/focus.ts:110,114`. The cause is the `(metaEl, root)` signature: the only two callers (`mainhead.ts:170`, `focus.ts:138`) both have the full `MainheadElements` in hand. This is safe today, since both are stable classes the stylesheet also keys on. The `design:` line's reason for keeping `metaEl` first is the unit-test double, and that would still hold if the function took `elements`.
3. **[note]** `features/focus.ts:148` builds the whole render view-model with a positional `true` just to read `.action`. The `design:` line explains why, and it is correct. The focused-session lookup `app.store.values().find((s) => s.id === app.state.focusedId)` now appears at `focus.ts:147`, `:154`, `launch.ts:776` and `rename.ts:36`. That predates the branch (cycle 1 Note 2).
4. **[note]** `.mainhead .meta .ended-at[hidden] { display: block; visibility: hidden; }` (`style.css:872-875`) is the only `[hidden]` rule in the stylesheet that keeps the element's layout. Every other one (`:207` through `:1774`) is the `display: none` companion that kb:lesson/display-rule-overrides-hidden-attribute prescribes. The rule is deliberate, the CSS comment at `:863-866` says why, and the reason holds: the slot must exist in both states. However, the Fix Attempt 2 `design:` line's precedent claim is false. It says "`rg -n "visibility: hidden" web/src/style.css` shows the slot-keeping idiom is already used elsewhere", but that grep has no hits on `main`. The only match in the file today is this rule and its comment. `style.css:1641`, the one nearby mention, chose `opacity` over `visibility` for a different reason. Someone running the lesson's `.hidden =` sweep will find `renderMeta`'s `endedAt.hidden = …` (`mainhead.ts:51`) mapped to a rule that does not remove the box. The CSS comment is all that explains it.
5. **[note]** The model's grid placement is set by three rules, and the base rule comes last in source. `.meta.stacked .model` (`style.css:847`, `2 / 1`) and `.meta:not(.stacked):has(.ended-at:not([hidden])) .model` (`:877`, `grid-row: 1`) both come before `.mainhead .meta .model` (`:881-886`, `1 / 2 / span 2`), and both win only by specificity. The other `.stacked` overrides in the section follow their base rule (`.meta .loc` `:779` before `.meta.stacked .loc` `:837`). It works; a reader editing `:883` has to scroll up to find what overrides it.
6. **[note]** Stale comments (the comment pass owns these, kb:adr/process-comment-pass-owns-code-comments):
   - `sessions/card.ts:124-128`: `resumeDisabledReason`'s doc says it is "shared with render/mainhead.ts and render/dead.ts" and returns `null` when "session is alive". The mainhead now reaches it only through `stopResumeButton`, and its parameter, `Pick<Session, "claudeSessionId">`, cannot see `alive`.
   - `style.css:733-735`: "the row's `min-content` is that, the model and `.ended-at`" was written for a three-column row. `.ended-at` now shares the model's column, under it.
   - `style.css:832-835`: the stacked comment says the one column is "as wide as the model (or the readout's floor, if that is wider)". The `.ended-at` slot's `min-width: var(--ended-w)` (`:869`) also applies in the stacked band, so the column is at least 14ch.
   - `fitMainheadMeta` is the most layout-dense exported function in `render/`, and the judge dropped its doc comment in both cycles.
7. **[note]** `.mainhead .idrow` (`style.css:652-660`) repeats `.mainhead`'s `display: flex; flex-wrap: wrap; align-items: center; gap: 6px 12px` (`:641-646`). The two gaps are now separate choices that happen to match. If one is retuned, the spacing between the title and the meta stops matching the spacing between the identity row and the cluster.
8. **[note]** The component diagram needs no change. `features/focus.ts` now takes a value import (`stopResumeButton`) from `sessions/card`, an edge `features` → `sessions` that kb:diagram/web-components already draws. No new module.
