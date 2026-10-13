# Browser review: Title crop and Stop/Resume button

**Plan**: title-crop-stop-resume-button
**Verdict**: needs-changes
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
