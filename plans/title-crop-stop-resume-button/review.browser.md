# Browser review: Title crop and Stop/Resume button

**Plan**: title-crop-stop-resume-button
**Verdict**: approved
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
