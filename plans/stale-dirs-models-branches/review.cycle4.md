# Review: stale-dirs-models-branches

**Plan**: stale-dirs-models-branches
**Verdict**: needs-changes
**Cycle**: 4
**Gates**: 0 failed
**Parts**: code, browser, maintainability
**Part verdicts**: code needs-changes, browser needs-changes, maintainability approved

_Merged by orch-state.py merge-review; the verdict is computed from the parts and the gate run, never edited by hand._

## Correctness review

# Correctness review: Stale Dirs, Models and Branches

**Plan**: stale-dirs-models-branches
**Part verdict**: needs-changes
**Cycle**: 4
**Pack**: kb: pack 57929 words (budget 20000)

This is a full cycle, not a delta. Cycle 3 left agent-tagged Majors open: correctness Major 2 `[web-tests]`, plus the browser and maintainability Minors. This cycle's commits are `a3e1839` (decision record), `061f424` (web, `style.css` only), `03e77bd` (web tests), `da49b6b` (orchestrator docs), `0b95fc0` (e2e) and `fbf94a1` (state). No daemon file changed. Browser Minor 2 was settled by the developer as option B (`decisions/focus-header-wraps-before-repo-drops`), and I review against that outcome without reopening it. I read every change in full. Files this cycle did not touch keep their cycle 1–3 results.

## Requirements

| Req | Implemented | Tested | Status |
|-----|-------------|--------|--------|
| REQ-1 – REQ-9 | Yes (no daemon change this cycle) | Yes (unchanged; race suite green) | pass |
| REQ-10 – REQ-12 | Yes. The shared `↳` rule now owns `--lead-gap: 5px`, and `.lead`'s `padding-right` and the header's `↳` floor read it. The computed value is unchanged (web-impl measured 5 px on both hosts) | Yes: the density line-height tests and E10/E2 are green in the gate run | pass |
| REQ-13 | Yes, per decisions A and B. `.meta`'s first track is `minmax(calc(var(--floor) + var(--sep-gap)), max-content)`. That makes `.meta`'s `min-content` (its flex basis) one repo block at its floor, plus the model and `.ended-at`, so the header wraps before the repo block can drop below its floor. The model still never truncates. The free-space priority is inverted: `.name` has `flex: 1000 1 6rem` and `.meta` has `flex: 1 1 min-content` | Yes: `repoProblems` and `blankProblems` are new in `mainheadFitProblems`. There are 18 new short-name width tests and 4 sweep tests (1440→700→1440 in 16 px steps). `mainheadTitleEllipsized` proves the blank check was live. e2e-specs records three red proofs, one per reverted rule | pass (but see Major 2 on the comment) |
| REQ-14 – REQ-17 | Yes (unchanged) | Yes | pass |
| DIAG | `kb:diagram/web-components` (from `kb for web/src/style.css` and the two test files). This cycle adds no module or import, so the diagram's claims are unaffected. The `features/` and `api/` counts are still off, as on `main` (cycle 3 Note 3) | — | pass |

## Build & Tests

E2E tests: pass (583 passed, 4.6m) · Daemon tests (race): pass (all packages `ok`, 0 FAIL) · Web tests: pass (77 files, 1993) · Daemon build: pass · Web build: pass · Lint: pass (`0 issues.`; web lint 266 files). All of this is read from `$GATES_LOG_DIR` (`…/gates-stale-dirs-models-branches-c4`), which has 0 failed lines.

Baseline lines: contrast pass (43 pairs × 3 themes, 0 failures) · versions pass · e2e-honest pass (empty log) · kb-check pass (492 records, 0 problems) · dead-refs pass (0 missing) · e2e-lint clean · features pass · comments `comment-checks: clean` · size WARN (16 hits; review-maintainability's, and none is in a file this cycle touched).

No soak from me. This cycle repairs no flaky spec (the only Repairs row strengthens an assertion that never failed), and e2e-specs already ran `make e2e-soak SPEC=card-location.spec.ts N=10` → 680/680.

## Acceptance Checks

| ID | Command | Result |
|----|---------|--------|
| D11 | `make test` | pass (deduped to test-race; 0 FAIL) |
| D12 | `make lint` | pass (`0 issues.`) |
| W6 | `make web-build` | pass |
| W7 | `make web-test` | pass (77 files, 1993 tests) |
| W8 | `make web-lint` | pass (266 files) |
| E14 | `make e2e` | pass (583 passed) |
| DOC | doc upkeep + Doc Delta vs what shipped | **FAIL**. The TODO tick and the `proposed` ADRs with `refs: plan:` are in place, and cycle 3 Major 1's order error ("repo hides first") is corrected. But the new text says the reverse of what shipped about the title and the `↳` block, and the cycle 2 ADR still claims the repo readout may vanish. Both are in Major 1 `[orchestrator]` |

## Reviewer-Verified Criteria

| ID | Criterion | Result | Evidence |
|----|-----------|--------|----------|
| W9 | No `any` types in new web code | pass | This cycle's TypeScript is test code only. The new `FitBlock`/`FitSnapshot` fields are typed, and `locSeps` is `FakeNode[]` |
| W10 | `↳` blocks and glyph use only neutral tokens | pass | No colour declaration changed. Contrast reports 0 failures |
| W11 | Card, Focus header and tile header match `c-long-names.html` | pass on CSS read; the rendered comparison is review-browser's | Below the mockup's width, the header follows the two decided ADRs |
| D15 | No git subprocess under the manager lock | pass | No Go change this cycle |
| D16 | Working-directory keys only under `internal/claudecode/` | pass | No Go change this cycle |

## Hard-Rule Checklist

| # | Rule | Result |
|---|------|--------|
| 1 | Adapter boundary | pass: CSS and tests only, no Claude-Code key names |
| 2 | No terminal-output state parsing | pass |
| 3 | Non-blocking hook handler | pass: not touched |
| 4 | tmux via `-L muster` / sizing | pass: no tmux added |
| 5 | No payload logging | pass |
| 6 | Empty-gauge honesty | pass: `.model` still renders `unknown` for a null model (unchanged) |
| 7 | Identity on tmux target | pass: not touched |
| 8 | No settings trespass | pass |
| 9 | No real `claude` | pass: the e2e fixtures post synthesized hooks only |

## Cycle 3 findings re-checked

| Prior issue | Fix commit | Verified how |
|-------------|------------|--------------|
| correctness Major 1 `[orchestrator]`: give-way order backwards, and the Doc Delta missing the wrap | `a3e1839`, `da49b6b` | The repo-vs-`↳` order is now right (the repo block never hides), and `doc-delta.md`'s focus amendment carries the wrap and the third row. The same edit introduced a new false clause about the title: see Major 1 |
| correctness Major 2 `[web-tests]`: `fakeMeta` describes the wrong markup | `03e77bd` | Diff read against `web/index.html:80-89`. The fake now has two `.sep`s inside `.loc` and one in `.ended-at`, and the doc comment matches the real tree. The three tests assert `locSeps` hidden as `[true, false]` unmoved and `[false, false]` moved, so a renderer that toggled the last `.sep` would fail |
| browser Minor 1 `[web-impl]`: blank `.loc` beside an ellipsized title | `061f424` | CSS read: the title now takes free space first, so it is ellipsized only while `.meta` sits at its basis. Red proof 2 in test-specs turns `blankProblems` red on the old priority. One residual case remains, for folder lines under 8 characters: see Major 2. The live measurement is review-browser's |
| browser Minor 2 `[orchestrator:decision]` → B | `061f424` | Implemented as decided: `.meta`'s track minimum is the repo block's floor, so the wrap happens first. `repoProblems` asserts the repo block on `.loc`'s first line at every sweep width |
| browser Minor 3 `[e2e-specs]`: helper blind to blank `.loc` | `0b95fc0` | `blankProblems` reports `.loc` wider than its last first-line block plus its margin (1 px tolerance) while `.rename` is ellipsized, and the tests prove the title was ellipsized. The Repairs row is a strengthening: the title got longer and no assertion was removed |
| maintainability Minor 1 `[web-impl]`: three hand-copied length pairs | `061f424` | Diff read. `--loc-lh` and `--loc-h` feed `.loc`'s `line-height`, its height and `::before`'s height. `--lead-gap` feeds `.lead` and the `↳` floor. `--sep-gap` feeds the margins, the track minimum and `.sep { left }`. `--floor` feeds both block floors and the track minimum. No old literal (`2.7em`, `1.875ch`, `calc(1ch + 5px + 8ch)`) remains |

## Issues

### Critical
None.

### Major
1. **[orchestrator]** The give-way order is now documented backwards for the title, and the cycle 2 ADR still contradicts decision B.
   - **The title clause.** Three places say "as the row narrows the title gives up width first, then the `↳` block hides whole": `docs/adr/focus-mainhead-wraps-to-second-row-when-narrow.md` (Decision), `docs/design/design-system.md:234-235` (§5 Focus mainhead) and `plans/stale-dirs-models-branches/doc-delta.md` (focus amendment). What shipped is the reverse. `061f424` gives `.name` `flex-grow` 1000 against `.meta`'s 1. As the row narrows, `.meta` absorbs the whole shortfall down to its basis first, and that basis has no `↳` block. Only then does the title shrink. web-impl's own log says so: Fix Attempt 4, item 4, "The title now outranks the `↳` block … gone from 1248 down". So does its `doc-delta:` line ("the title takes free space ahead of the meta"), and so do the `style.css` comments on `.mainhead .name` and `.mainhead .meta`. The Doc Delta did not carry that `doc-delta:` line as written. doc-reconcile would promote the false order verbatim into `docs/features/focus/spec.md`.
   - **The cycle 2 ADR.** `docs/adr/focus-model-never-truncates-name-blocks-give-way.md` still says, in its summary, "the repo and ↳ name blocks give way first". Its Decision says "those blocks hide or collapse". Its Consequences say "the Focus header may show no repo readout". Under decision B the repo block never hides. Both ADRs are `proposed` on this plan.
   - **Fix:** in all three places, say that the `↳` block gives way first (whole, never half-drawn), then the title ellipsizes, and that the repo block never hides. Then amend the cycle 2 ADR's summary and Consequences so that only the `↳` block gives way, and point it to the wrap ADR for the repo block. Run `make gen-kb`.
2. **[web-impl]** The new comment on `.mainhead .name` (`web/src/style.css`, the `flex: 1000 1 6rem` rule) is false for a folder line shorter than 8 characters.
   - **What it says:** "a title is only ever ellipsized while `.meta` sits at its floor, so `.loc` never holds room the title could have used".
   - **Why it is false:** `.loc`'s grid track has a fixed minimum, `var(--floor) + var(--sep-gap)` (8ch + 2.75ch). The repo block, though, is clamped to its text by `max-width: max-content`. So a folder line like `api /` or `web /` (5 ch) leaves about 3ch of blank space inside `.loc`, right beside the ellipsized title. That is exactly the cycle 3 browser Minor 1 condition. web-impl names this limit in its log (up to about 47 px). e2e-specs names it as uncovered, in the helper's doc comment and in the spec. Only the code comment states the opposite, as an absolute.
   - **Fix:** make the comment true, either by stating the short-folder exception, or by closing the gap so the track minimum follows the repo block's own width when that is under the floor. Whether the residual blank still counts as browser Minor 1 is review-browser's measurement.

### Minor
None.

### Notes
1. **[note]** The priority inversion in `061f424` has a product side. With a long title, the `↳` block now gives way to the title well above the wrap: web-impl measured it gone from 1248 px down with long names moved, and from 1312 px down with the bypass chip. Before this cycle, the `↳` block outranked the title. No requirement orders the two, and cycle 3 Minor 1 asked only that no blank `.loc` sit beside an ellipsized title. So I file only the doc statement (Major 1), not a decision. If the developer would rather keep the `↳` readout ahead of the title, that is a fresh `[orchestrator:decision]`.
2. **[note]** The "short names" fixture's folder is `muster-app`, whose folder line (`muster-app /`, 12 ch) is above the floor. So the suite deliberately never exercises Major 2's case, and both test files say so. If web-impl closes the gap instead of rewording the comment, a folder of under 6 characters would need its own row.
3. **[note]** `plans/stale-dirs-models-branches/review.maintainability.md` is untracked in the tree (review-maintainability's in-flight part). I wrote no scratch spec, and the only file I wrote is this one.

## Browser review

# Browser review: Stale Dirs, Models and Branches

**Plan**: stale-dirs-models-branches
**Part verdict**: needs-changes
**Cycle**: 4
**Pack**: kb: pack 37403 words (budget 20000)
**Rig**: built fresh with `make web-build build` at fbf94a1, giving `bin/musterd` (`v0.19.1-65-gfbf94a1`). Each probe test got its own scratch `-data-dir` (`$TMPDIR/muster e2e-…`, a path with a space) with its own `-tmux-socket` inside it, which the harness teardown kills. Each also got the E2E stub `claude` and `-repo-poll 200ms`. Driven in headless Chromium through one throwaway spec (`web/e2e/zz-rb-probe.spec.ts`) built on the committed helpers. The spec and its `test-results/` are deleted, no `musterd` or private tmux server is left running, and `git status --porcelain` shows nothing of mine (Note 6).

I read the gates log in `gates-stale-dirs-models-branches-c4` and did not re-run it. It shows 0 failed lines: `web-build` is green and `e2e` passed 583.

The only shipped change since cycle 3's rig (02f7861) is `web/src/style.css` (061f424). `git diff --stat 02f7861..HEAD` lists no Go or `web/src/*.ts` source, so the daemon-side cells carry over from cycle 3 and say so.

Fixtures, all with the title `rework shift-swap approval` (206 px wide) unless named otherwise:
- **long**: a 60-character folder on an 80-character branch.
- **short**: `muster` on `main`.
- **moved**: a `.claude/worktrees/` worktree (60 characters with long names, `probewt` with short).
- **ended**: long and short names.
- **bypass**: long names, moved, with the chip kept by a bypass hook.
- **status line**: short names, model `Haiku 4.5`, then the daemon is SIGTERMed.
- **no data**: a plain non-git directory with no hooks.
- **tiny**: `api` on `main`, `ab` on `x`, and `api` moved into `wt`. These folder and branch lines are under the 8-character floor, the limit web-impl logged as inferred.
- **long title**: 66 characters, short names.
- **short title**: `ok`, long names, moved.

Sweep: every 4 px from 1440 down to 700, then every 16 px back up to 1440. That is 233 cells per fixture and 3,262 Focus-header cells in all, with a header screenshot at 10 widths.

## Matrix

Hosts:
- **rail**: Focus view, `#sessions`.
- **strip**: Tiles view, `#tiles-strip`.
- **focus**: `#mainhead`.
- **tile**: `article.tile .thead`.

The pop-out (`/doc.html`) is the docs reader and has no repo readout, so it is N/A in every row.

| Req | Host | State | Claim | Result | Evidence |
|-----|------|-------|-------|--------|----------|
| REQ-13 | focus | data, all 14 fixtures, 1440–700 and back | the repo block is on `.loc`'s first line at every width (cycle 3 Minor 2, decision B) | pass | 3,262 of 3,262 cells have `.repo` laid out and y-overlapping `.loc`'s box. The hit-test 4 px inside `.repo .rf` finds `.rf` in every cell |
| REQ-13 | focus | data, sweep down then up | narrowing never brings the repo back, and there is no hysteresis | pass | the repo block is never absent, so it cannot return. Every up-sweep cell matches the down-sweep cell at the same width (header height, `↳` shown, `.loc` blank and title width all agree) |
| REQ-13 | focus | data, all fixtures | the model is never truncated | pass | `.model` sw = cw in all 3,262 cells (169/169 for the id, 61/61 for `Haiku 4.5`, 34/34 for `haiku`). The hit-test inside `.model` finds `.model` in every cell |
| REQ-13 | focus | data, folder lines of 8 or more characters | no blank `.loc` beside an ellipsized title (cycle 3 Minor 1) | pass | 1,407 cells have an ellipsized title. Outside the tiny fixtures, blank is 0 to 0.1 px in every one. Examples: short moved at 1100 has the title 141/206 and `.loc` 467.4–540.2 ending at the repo block plus its margin; long title has 481/504 at 1440 and 289/504 at 1048, blank 0 |
| REQ-13 | focus | data, tiny (lines under 8 characters) | no blank `.loc` beside an ellipsized title | FAIL | `api / main`: `.repo` 532.4–566.3, but `.loc` runs to 605.2, a 20.3 px blank at every width. At 1100, 900 and 700 the blank sits beside an ellipsized title (141/206, 141/206, 118/206). `ab / x` gives 27.1 px. The text-to-model gap is 38.9 or 45.7 px, against 18.6 px for every other fixture (Minor 1) |
| REQ-13 | focus | data, moved, title whole | the model follows the visible location text | FAIL | short moved, with the `↳` block wrapped away: `.loc` ends 83 px past the repo block at 1248, 58.6 px at 1024, 34.6 px at 1000 and 11.5 px at 800, so the gap from the `·` to the model is up to 101.6 px. The 1024 screenshot shows `muster / ·`, a hole, then the model. tiny moved reaches 83.3 px at 1228. Unmoved fixtures read 18.6 px at every width (Minor 1) |
| REQ-13 | focus | data, moved | the `↳` block hides whole and does not come back as the window narrows | FAIL, decision | short title `ok`, long moved: the block shows at 1440–1136, is gone at 1132–1052, back at 1048–936 (header wraps to 80.4 px), gone at 932–852, back at 848–760 and gone at 756–700. Screenshots: one row at 1100 with no `↳`, two rows at 1024 with it. tiny moved: back at 1048–1032. bypass: back at 736–700 in the three-row header (Minor 3) |
| REQ-13 | focus | data, narrow | header wraps, controls on screen (kb:adr/focus-mainhead-wraps-to-second-row-when-narrow) | pass | 49.4 px header, then 80.4 px from 1048 down (long and short, unmoved and moved), 1128 down (ended) and 940 down (status line). 105.4 px from 748 down (ended) and 736 down (bypass). End, Resume and Remove are inside the viewport and `scrollWidth` = viewport width in all 3,262 cells |
| REQ-13 | focus | data, wrap | the terminal refits when the header grows, settled | pass | after a 2.5 s settle: 1052 gives head bottom 95.4, tmux `99x28`, 28 xterm rows; 1048 gives 126.4, `99x26`, 26 rows, with `.xterm-screen` 126.4–750.4 inside the slot 126.4–774. Three-row bypass at 736 gives 151.4, `58x25`, 25 rows, screen 151.4–751.4. Returning to 760 and 1440 gives 26 and 28 rows again. A read about 150 ms after a resize was still stale (Note 3) |
| REQ-13 | focus | ended | ended age after the model | pass | `.ended-at` is shown and the model is whole at every width. The three-row header is reached at 748 px, as web-impl logged |
| REQ-13 | focus | bypass chip | chip, then meta, nothing overlapping | pass | chip visible at every width. No overlap between name, chip, meta, switch and actions; buttons on screen |
| REQ-13 | focus | no data | basename alone, model `haiku` | pass | `.rf` `muster-e2e-plain-…`, no `.rb`, blank 0 at every width. It wraps at 912 |
| REQ-13 | focus | daemon-down, 900 and 740 | last snapshot stays, banner shows | pass | `#banner` `display: block`, 0,46–900,78 (two lines at 740: 46–93). The header moves down to 78 (93), the repo block is on its first line, `Haiku 4.5` is 61/61, blank 0, and the buttons are on screen |
| REQ-17 | focus | data, wrapped (1000, 80.4 px) | keyboard focus survives a re-render | pass | `Tab` from `.rename` goes `claude`, `shell`, `docs`, `End`. After a real `git checkout -b kbd-new` re-rendered the branch and 1.5 s passed, the tagged `End` node was still `activeElement` |
| REQ-17 | focus | data, wrapped | operable by keys | pass | `Enter` on End opens `End session? … muster / kbd-new` with focus on Cancel. `Enter` on its End session button gives `/api/state` `alive: false`, `endedAt` set |
| REQ-14 | focus | moved / unmoved / ended / no data | hover lines | pass (cycle 3) | markup and TS are unchanged since 02f7861 (style-only change) |
| REQ-10 | rail | data, comfortable and expanded | two lines, each truncating on its own | pass | `.rf` 14–288 at 138.8 (sw/cw 420/274), `.rb` 14–288 at 151.8 (542/274), inside card 0–299 |
| REQ-11 | rail | data, compact | one line | pass | `.rf` 14–130.7 and `.rb` 137.4–288 share top 129.7, both clipped (420/117, 542/151) |
| REQ-12 | rail, strip | data, three densities | `↳` lines as tall as the repo lines | pass | comfortable: `.r2` 26 = `.r2c` 26. Compact 13 = 13. Expanded 26 = 26. Strip 26 = 26 (`.r2` 794.3, `.r2c` 822.3–848.3) |
| REQ-12 | rail, strip | data | glyph gap unchanged after `--lead-gap` | pass | `.lead` 14–25.8 with computed `padding-right: 5px` in all three densities and on the strip, and `.rf` from 25.8, the same as cycle 3 |
| REQ-12 | rail | unmoved | `.r2c` hidden | pass | computed `display: none` in all three densities |
| REQ-16 | rail | data, Instrument | glyph `--fg-muted`, text `--fg-dim` | pass | `.lead` `rgb(178,182,195)` and `.rf` `rgb(166,171,188)`, the same as cycle 3 |
| REQ-16 | rail, focus | data, Light | same | pass (cycle 2) | not re-measured: no colour declaration changed (Note 4) |
| REQ-15 | tile | data, moved, 1280 / 900 / 700 | `.wh` one line, `↳` glyph inside `.thead` | pass | `.wh-claude` 1130.7–1137.5 in `.thead` 641.5–1278; 750.7–757.5 in 451.5–898; 550.7–557.5 in 351.5–698. `.nm` holds its 75 px. `.wh` is 13 px, one line |
| REQ-15 | tile | data, unmoved | glyph hidden | pass | `.wh-claude` computed `display: none` |
| REQ-12, REQ-15 | tiles | daemon-down | last snapshot stays | pass | after SIGTERM `#banner` `display: block` `musterd unreachable — …`, and the tile `.wh` still reads the long folder / branch |
| REQ-1 | rail | dead, racing checkout | keeps the last-known branch | pass (cycle 3) | daemon unchanged since 02f7861 |
| REQ-9 | focus | data | a bind with a different id shows the id | pass (cycle 3) | daemon and `render/*.ts` unchanged; every fixture here shows the SessionStart id `claude-haiku-4-5-20251001` until the status line's `Haiku 4.5` |
| §7.1 | tiles | data | one live client per session | pass | `tmux list-clients` returns `muster-2`, `muster-3`, `muster-4`, `muster-1` for 4 tiles, no duplicates |
| §6.7 | focus, tiles | daemon-down | daemon-down surfaced prominently | pass | `#banner` `display: block` in both views |
| Hidden | focus, rail, tile | toggled elements | `[hidden]` computes `display: none` | pass | `.claude-at` (unmoved, ended, no data), `.ended-at` (live), `.r2c` (unmoved) and `.wh-claude` (unmoved) are all `display: none` |

## Issues

### Critical

(none)

### Major

(none)

### Minor

1. **[web-impl]** In the Focus header, `.loc` keeps room for content it does not show, so the model sits apart from the location text, sometimes beside an ellipsized title.
   - Short lines: when the folder and branch lines are both under the 8-character floor (`api /` over `main`), `.loc` holds the floor. That leaves 20.3 px of blank at every width (27.1 px for `ab /` over `x`). At 1100, 900 and 700 the blank sits beside an ellipsized title (141/206, 141/206, 118/206), which is cycle 3 Minor 1's failure on a common repo name.
   - Moved, title whole: when the `↳` block has wrapped away, `.loc` still takes width up to its max-content. The blank is 83 px at 1248, 58.6 px at 1024, 34.6 px at 1000 and 11.5 px at 800 (short names), so the model jumps right by up to 101.6 px and back as the window narrows.
   - Every other fixture keeps the text-to-model gap at 18.6 px.
   - Both cases are what web-impl's Fix Attempt 4 logged as inferred limits. This is the measurement.
   - Where: `web/src/style.css`, `.mainhead .meta` grid track and `.mainhead .meta .loc`.
   - A fix must make this true: at every width, with the title whole or ellipsized and the session moved or not, `.loc`'s right edge is within 1 px of its last first-line block's right edge plus that block's `margin-right`, so the model starts one `--sep-gap` after the visible location text.
2. **[e2e-specs]** `blankProblems` in `web/e2e/helpers/card-location.ts` returns nothing unless the title is ellipsized. The spec also keeps every folder at 8 or more characters on purpose (its comment says so), so `card-location.spec.ts` could not have failed for either case of Minor 1.
   - A fix must make this true: the helper reports blank `.loc` width at every width, not only while the title is ellipsized. The width tests include a folder and branch both under 8 characters (for example `api` on `main`), unmoved and moved.
3. **[orchestrator:decision]** The `↳` block comes and goes as the window narrows. The repo block no longer does (decision B), but the `↳` block reappears whenever the header gains a row, because the meta then has more room.
   - Measured, title `ok`, long names, moved: shown at 1440–1136, gone at 1132–1052, back at 1048–936, gone at 932–852, back at 848–760, gone at 756–700.
   - Measured, `api` moved: back at 1048–1032.
   - Measured, bypass, long moved: back at 736–700, the three-row header.
   - With the 26-character title it hides once at 1248 and stays hidden.
   - **Option A**: accept it. The `↳` block shows wherever it fits, which costs this flicker in the Focus header. The rail card and the tile `↳` glyph always show the move.
   - **Option B**: once the `↳` block hides at a width, it stays hidden at every narrower width, so the Focus header's location readout never grows as the window narrows. The cost is that the `↳` block is hidden in the wrapped header even where it would fit (for the `ok` title, 1048–936 and 848–760).

### Notes

1. **[note]** Cycle 3's issues are fixed as measured. Minor 2 (decision B): the repo block is on the first line in all 3,262 cells and never returns. Minor 1: 0 blank cells beside an ellipsized title for folder lines of 8 or more characters. Minor 3: the helper now checks the blank, within the limits in Minor 2 above.
2. **[note]** Across the wrap, a wider window can show less of the title. Short or long names, unmoved: 1100 is one row with the title at 141/206, and 1024 is two rows with it whole. This follows from decision B and needs no change.
3. **[note]** The terminal refit trails a resize. In the 4 px sweep, a read about 150 ms after resizing to 1048–1032 found tmux and xterm both still at 28 rows under a header that had already grown. After 2.5 s every width was settled and correct (Matrix, wrap row). No change requested.
4. **[note]** Not re-measured, because the cycle changed no colour, xterm or pane-content code: REQ-16 in Light, §7.4 (`scrollback: 0`) and §7.5 (pane styling).
5. **[note]** A `↳` block that gives way is clipped, not removed (`.claude-at` keeps a laid-out box below `.loc`'s first line), so a screen reader still reads it. This carries over from cycle 3 Note 2. A fix for Minor 1 or decision Minor 3 that uses `display: none` would remove it.
6. **[note]** The working tree holds uncommitted edits that are not mine, from the concurrent reviewers or the orchestrator: `docs/adr/focus-mainhead-wraps-to-second-row-when-narrow.md`, `docs/adr/focus-model-never-truncates-name-blocks-give-way.md`, `docs/design/design-system.md`, `plans/stale-dirs-models-branches/doc-delta.md`, and the untracked `review.code.md` and `review.maintainability.md`. The `$TMPDIR/muster-e2e-loc-*` dirs timed 14:52–15:47 pre-date this review; I left them alone.

## Maintainability review

# Maintainability review: Stale dirs, models and branches

**Plan**: stale-dirs-models-branches
**Part verdict**: approved
**Cycle**: 4
**Pack**: kb: pack 42147 words (budget 20000)
**Scope**: 32 files from `git diff main...HEAD -- cmd internal web/src ':!*_test.go' ':!*.test.ts'`. This is a full cycle, because the spawn prompt did not ask for a delta. Since the cycle 3 review commit (`9ebea56`), `git diff 9ebea56..HEAD` over the same paths touches one file, `web/src/style.css` (+58 −39, from fix commit `061f424`). I re-read that diff in full, along with the rules it shares lengths with: the shared `↳` rule (`:2239-2266`), `.mainhead .name` (`:651-669`) and the picker's unrelated `line-height: 1.35` (`:2865`). Every other file has not changed since cycle 3, so it keeps its cycle 3 result.

## Files

| File | Siblings opened | design: line | Size warnings | Result |
|------|-----------------|--------------|---------------|--------|
| cmd/musterd/main.go | in-file flag siblings | n/a (one flag) | filelen 525, funlen `parseFlags` 48: reasons hold; funlen `run` 44: function untouched | pass (unchanged since cycle 3) |
| internal/claudecode/CLAUDE.md | (generated trailer) | n/a | — | pass (unchanged) |
| internal/claudecode/claudecodetest/claudecodetest.go | in-file builders | n/a | filelen 630, reason holds | pass (unchanged) |
| internal/claudecode/interpret.go | doc.go, in-file arms | yes | — | pass (unchanged) |
| internal/claudecode/status.go | interpret.go | covered | — | pass (unchanged) |
| internal/gitutil/gitutil.go | in-file | yes | — | pass (unchanged) |
| internal/server/bgloop.go | usagepoll.go, themepoll.go | yes | — | pass (unchanged) |
| internal/server/launcher.go | reporefresh.go | yes | filelen 559, reason holds | pass (unchanged) |
| internal/server/reporefresh.go | launcher.go, usagepoll.go | yes | — | pass (unchanged) |
| internal/server/server.go | registration lines | yes | funlen `New` 44, reason holds | pass (unchanged) |
| internal/server/sessionwire.go | in-file | n/a | — | pass (unchanged) |
| internal/session/CLAUDE.md | — | n/a | — | pass (unchanged) |
| internal/session/actions.go | liveness.go | covered | — | pass (unchanged) |
| internal/session/apply.go | status.go | covered | — | pass (unchanged) |
| internal/session/liveness.go | actions.go, repo.go | covered | — | pass (unchanged) |
| internal/session/location.go | session.go | yes | — | pass (unchanged) |
| internal/session/machine.go | status.go | n/a | funlen `applyInput` 51, function untouched | pass (unchanged) |
| internal/session/manager.go | liveness.go | yes | filelen 580, reason holds | pass (unchanged) |
| internal/session/repo.go | reader.go, liveness.go | yes | — | pass (unchanged) |
| internal/session/row.go | — | n/a | — | pass (unchanged) |
| internal/session/session.go | sibling field declarations | yes | — | pass (unchanged) |
| internal/session/status.go | apply.go | covered | — | pass (unchanged) |
| internal/session/writeorder.go | `CheckSessionFieldCoverage` | covered | — | pass (unchanged) |
| internal/store/migrations/0012_claude_dir.sql | 0011_turn_state.sql | n/a | — | pass (unchanged) |
| internal/store/session.go | — | n/a | — | pass (unchanged) |
| web/src/protocol/session.ts | in-file parsers | n/a | — | pass (unchanged) |
| web/src/render/mainhead.ts | render/tiles.ts, index.html `.meta` | covered | — | pass (unchanged) |
| web/src/render/repolines.ts | render/context.ts | yes | — | pass (unchanged) |
| web/src/render/sessions.ts | render/context.ts | covered | — | pass (unchanged) |
| web/src/render/tiles.ts | render/sessions.ts | covered | — | pass (unchanged) |
| web/src/sessions/card.ts | sessions/paths.ts | yes | — | pass (unchanged) |
| web/src/style.css | shared `↳` rule (`:2248-2266`), `.mainhead .name` (`:651`), `--block-floor` precedent | yes (web-implementation.md:134-135, the custom-property owners and the title-first priority) | — | pass. Cycle 3 Minor 1 is fixed (see Delta) |

## Delta

| Prior item | Fix commit | Verified how |
|------------|-----------|--------------|
| Cycle 3 Minor 1: three pairs of hand-copied lengths in the Focus header's give-way layout | `061f424` | `rg -n "2\.75ch\|1\.35\b\|2\.7em\|1\.875ch\|8ch\|--floor\|--sep-gap\|--loc-lh\|--loc-h\|--lead-gap\|--block-floor" web/src/style.css` shows each length declared once: `--floor: 8ch`, `--sep-gap: 2.75ch`, `--loc-lh: 1.35` and `--loc-h: calc(2em * var(--loc-lh))` on `.mainhead .meta` (`:732-735`), and `--lead-gap: 5px` in the shared `↳` rule (`:2250`). Each use reads the variable: `.loc` `height`/`line-height` (`:764`, `:767`), `.loc::before` `height` (`:774`), the blocks' `margin-right` (`:787`), `--block-floor` (`:791`, `:797`), `.sep` `left: calc((var(--sep-gap) + 1ch) / -2)` (`:822`) and `.lead` `padding-right` (`:2264`). No literal `2.75ch`, `2.7em`, `1.875ch` or `8ch` is left, and the header's `5px` gap is gone. The one remaining `line-height: 1.35` (`:2865`) belongs to the picker's recent-row button, an unrelated rule. The derived values match the old literals: `2em × 1.35 = 2.7em`, and `-(2.75ch + 1ch)/2 = -1.875ch`. |

## Issues

### Critical

None.

### Major

None.

### Minor

None.

### Notes

1. **[note]** `--loc-h` is declared on `.meta` but uses `em`. The variable is substituted at its use sites, so the `em` resolves against `.loc`'s font size, as the old `2.7em` literal did. If someone later sets a different font size on `.meta` and `.loc`, the clip height will follow `.loc`, which is the right behaviour.
2. **[note]** The grid track `minmax(calc(var(--floor) + var(--sep-gap)), max-content)` (`style.css:737`) is a new consumer of the shared lengths. It derives from the same owners, so it adds no new pair that must be kept equal by hand.
3. **[note]** Cycle 3 Note 2 is resolved: the shared `↳` rule's comment (`:2242-2247`) now lists what the header adds, including floor, margin and line height. Cycle 2 Notes 1 to 4, carried in cycle 3 Note 3, still apply as written: `resolvePath` and `resolveTranscriptDir` are two copies (an orchestrator follow-up), `checkoutState` lives in `launcher.go`, `isDir` is checked twice, and each host has its own ellipsis rule. None of the files they cite changed in this cycle.
4. **[note]** Swapping which item gets free space first (`.name` now grows at 1000 and `.meta` at 1, `:667`, `:739`) is a change of behaviour, not of shape. Whether it matches the wrap ADR is for `review-work` and `review-browser` to judge.
