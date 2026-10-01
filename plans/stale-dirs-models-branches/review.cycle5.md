# Review: stale-dirs-models-branches

**Plan**: stale-dirs-models-branches
**Verdict**: needs-changes
**Cycle**: 5
**Gates**: 0 failed
**Parts**: code, browser, maintainability
**Part verdicts**: code approved, browser approved, maintainability needs-changes

_Merged by orch-state.py merge-review; the verdict is computed from the parts and the gate run, never edited by hand._

## Correctness review

# Correctness review: Stale Dirs, Models and Branches

**Plan**: stale-dirs-models-branches
**Part verdict**: approved
**Cycle**: 5
**Pack**: kb: pack 57973 words (budget 20000)

This is a verification cycle the developer asked for. It is a full review of what changed, not a §0 delta cycle, because cycle 4 left agent-tagged Majors open. At the developer's instruction, the orchestrator made the cycle 4 fixes itself. The commits since `review_commits[4]` (`3a4a3a6`) are:

- `65b108b`: docs, the give-way order
- `7f47a09`: state
- `dfb8100`: web, `fitMainheadMeta`, the pane `ResizeObserver` and `--loc-cap`
- `2b69b3c`: tests, the unit fake, the e2e helper and the tiny-name fixtures
- `2ad0ac2`: the decision record and the ADR's Consequences
- `dcd5b17`: archive
- `949f640`: the web log's Fix Attempt 5. This landed after the gate run, but it changes only a plan log.

No daemon file changed. Browser Minor 3 is settled as option A (`decisions/claude-at-may-reappear-on-wrap`), and I did not reopen it. I read every changed source and test file in full. Files this cycle did not touch keep their cycle 1–4 results.

## Requirements

| Req | Implemented | Tested | Status |
|-----|-------------|--------|--------|
| REQ-1 – REQ-9 | Yes (no daemon change this cycle) | Yes (unchanged; race suite green) | pass |
| REQ-10 – REQ-12 | Yes (unchanged) | Yes | pass |
| REQ-13 | Yes, per decisions A and B, and now per decision A of cycle 4. `fitMainheadMeta` (`web/src/render/mainhead.ts`) first clears `--loc-cap`. It returns early if the meta is not laid out, or if the `↳` block is shown and on `.loc`'s first line. Otherwise it sets `--loc-cap` to the repo block's right edge plus its `margin-right`, minus `.loc`'s left edge. `style.css` uses the cap twice: as `.loc`'s `max-width`, and inside the track minimum `min(var(--floor) + var(--sep-gap), var(--loc-cap, 100vw))`. The fit always measures with the cap cleared, so it cannot feed on its own result. It runs last in `renderMainhead` and from a `ResizeObserver` on `section.main`. That pane is `flex: 1; min-height: 0` (`style.css:606`), so its size does not depend on the header and the observer cannot loop. Hiding the header (`offsetParent === null`) clears the cap. The model still never truncates, and the repo block still never hides. | Yes. `blankProblems` now runs at every width, not only while the title is ellipsized. The `tiny` name set (`api` / `main`, moved `wt`) is added to the 6 widths × 3 states and to both sweeps, which makes 18 + 2 new tests. A viewport resize with no render pass is exactly the `ResizeObserver` path, and the sweep (1440→700→1440) exercises it. Red proof per the web log: 20 of 66 fail on the pre-fix product code, and 66/66 pass with the fix. | pass |
| REQ-14 – REQ-17 | Yes (unchanged) | Yes | pass |
| DIAG | `kb:diagram/web-components` (named by `kb for` on `render/mainhead.ts` and `features/focus.ts`). This cycle adds no module or import edge: `features/focus.ts` already imported `render/mainhead`, and now imports one more symbol from it. The diagram's claims are unaffected. | — | pass |

## Build & Tests

All of this is read from `$GATES_LOG_DIR` (`…/gates-stale-dirs-models-branches-c5`), which has 0 failed lines:

- E2E tests: pass (603 passed, 4.8m)
- Daemon tests (race): pass (all packages `ok`, 0 FAIL)
- Web tests: pass (77 files, 1993 tests)
- Daemon build: pass
- Web build: pass
- Lint: pass (`0 issues.`; web lint 266 files)

Baseline lines:

- contrast: pass (43 pairs × 3 themes, 0 failures)
- versions: pass
- e2e-honest: pass (empty log)
- kb-check: pass (492 records, 0 problems)
- dead-refs: pass (0 missing)
- e2e-lint: clean
- features: pass
- comments: `comment-checks: clean`
- size: WARN (16 hits). This belongs to review-maintainability, and none of the hits is in a file this cycle touched.

I ran no soak. This cycle repairs no flaky spec.

## Acceptance Checks

| ID | Command | Result |
|----|---------|--------|
| D11 | `make test` | pass (deduped to test-race; 0 FAIL) |
| D12 | `make lint` | pass (`0 issues.`) |
| W6 | `make web-build` | pass |
| W7 | `make web-test` | pass (77 files, 1993 tests) |
| W8 | `make web-lint` | pass (266 files) |
| E14 | `make e2e` | pass (603 passed) |
| DOC | doc upkeep + Doc Delta vs what shipped | pass. The TODO tick is in `docs/history/todo-done.md:2127-2137`. Both focus ADRs are `proposed` with `refs: plan:stale-dirs-models-branches`. Cycle 4 Major 1's false order is corrected in the wrap ADR, the cycle 2 ADR (summary and Consequences), `design-system.md` §5 and `doc-delta.md`. The new `doc-delta.md` sentences are supported by the code: "The location readout never holds room it does not show … the model follows the location text at every width" holds by `--loc-cap`, and "The `↳` block may show again at a narrower width once the header has gained a row" holds by decision A. One `[orchestrator]` Minor: the ADRs' `files:` lists (Minor 1) |

## Reviewer-Verified Criteria

| ID | Criterion | Result | Evidence |
|----|-----------|--------|----------|
| W9 | No `any` types in new web code | pass | `fitMainheadMeta` is typed with `HTMLElement` throughout. The fake's new `style`/`props`/`offsetParent` members are typed. |
| W10 | `↳` blocks and glyph use only neutral tokens | pass | No colour declaration changed. Contrast reports 0 failures. |
| W11 | Card, Focus header and tile header match `c-long-names.html` | pass on the CSS read. The rendered comparison is review-browser's. | The fit only removes width that `.loc` held but did not draw. |
| D15 | No git subprocess under the manager lock | pass | No Go change this cycle |
| D16 | Working-directory keys only under `internal/claudecode/` | pass | No Go change this cycle |

## Hard-Rule Checklist

| # | Rule | Result |
|---|------|--------|
| 1 | Adapter boundary | pass: TS, CSS and tests only, with no Claude-Code key names |
| 2 | No terminal-output state parsing | pass: the fit measures the header's own DOM boxes and never touches pane text |
| 3 | Non-blocking hook handler | pass: not touched |
| 4 | tmux via `-L muster` / sizing | pass: no tmux added |
| 5 | No payload logging | pass |
| 6 | Empty-gauge honesty | pass: `.model` still renders `unknown` for a null model (unchanged) |
| 7 | Identity on tmux target | pass: not touched |
| 8 | No settings trespass | pass |
| 9 | No real `claude` | pass: the e2e fixtures post synthesized hooks only |

## Cycle 4 findings re-checked

| Prior issue | Fix commit | Verified how |
|-------------|------------|--------------|
| correctness Major 1 `[orchestrator]`: the title clause reversed, and the cycle 2 ADR contradicting decision B | `65b108b`, `2ad0ac2` | Diff read. All three places now say "the `↳` block hides whole first … then the title shortens; the repo block never hides". The cycle 2 ADR's summary now reads "the ↳ block gives way first and the header wraps before the repo block would". Its Consequences point to the wrap ADR. Its Decision paragraph keeps the original wording, which is a record of what A decided, and the fix asked only for the summary and Consequences. `make gen-kb` output (`docs/INDEX.md`, `features/focus/INDEX.md`, `.claude/rules/focus.md`) rides the same commit, and kb-check is green. |
| correctness Major 2 `[web-impl]`: the `.mainhead .name` comment was false for folder lines under 8 ch | `dfb8100` | The comment now says the title is ellipsized only while `.meta` sits at its floor, and that room `.loc` would not show (a `↳` block that gave way, a folder line under the floor) is trimmed by `--loc-cap`. Both are true of the shipped code. The gap is closed, not reworded. |
| browser Minor 1 `[web-impl]`: blank `.loc` for short lines and for a `↳` block that gave way | `dfb8100` | Code read (see REQ-13). Both cases cap `.loc` at the repo block plus its `·` room. Grid track sizing clamps `.loc`'s max-content contribution by its `max-width`, so the track and `.meta` shrink with it, and the model follows. When the `↳` block is shown, its own `margin-right` already makes the content at least the track minimum for any realistic name. The tiny moved sweep agrees: green at every 16 px step. The live measurement is review-browser's. |
| browser Minor 2 `[e2e-specs]`: the helper was blind except while the title was ellipsized, and had no sub-floor fixture | `2b69b3c` | `blankProblems` no longer returns early on a whole title: the ellipsis now only annotates the message. `NAME_SETS.tiny` (`api`, no branch, worktree `wt`) runs at the 6 widths × unmoved/moved/ended and in both sweep directions × unmoved/moved. The comments that called the sub-floor case "deliberately not covered" are gone, in both the spec and the helper. |
| browser Minor 3 `[orchestrator:decision]` → A | `2ad0ac2` | `decisions/claude-at-may-reappear-on-wrap/decision.md` records outcome A. It landed in the wrap ADR's Consequences and in `doc-delta.md`. The code does not suppress the reappearance, and the fit measures with the cap cleared each time, so the `↳` block shows wherever it fits. |

## Issues

### Critical
None.

### Major
None.

### Minor
1. **[orchestrator]** Both focus ADRs list `files: [web/src/style.css]` only. The behaviour they decide now also lives in `web/src/render/mainhead.ts` (`fitMainheadMeta`) and in `web/src/features/focus.ts` (the `ResizeObserver`). Because of that, `kb for web/src/render/mainhead.ts` does not surface `kb:adr/focus-mainhead-wraps-to-second-row-when-narrow` or `kb:adr/focus-model-never-truncates-name-blocks-give-way`. Someone editing the fit would not be pointed to the decisions it serves.
   - Fix: add `web/src/render/mainhead.ts` to the wrap ADR's `files:`, and to the cycle 2 ADR's if wanted. Then run `make gen-kb`.

### Notes
1. **[note]** `repoProblems` changed in `2b69b3c` in two ways. Its floor is now `min(--floor, repoNatural)`, where `repoNatural` is the widest `.rf`/`.rb` `scrollWidth`. Its tolerance is now 1 px, where it was `EPS` (0.5 px).
   - The `min` is required by design: a folder line under the floor is drawn at its own width, and the ADR's "never below its floor" means "never squeezed".
   - The extra 0.5 px allows for `scrollWidth` being an integer. For the long and short sets, `repoNatural` is at least the floor, so there the only change is the 0.5 px.
   - I do not count this as a weakening. No Repairs row records it, because the orchestrator made the change, not e2e-specs: `test-specs.md` has no cycle 4 section. The red proof and the change are logged in `web-implementation.md` Fix Attempt 5 instead.
2. **[note]** Every `renderMainhead` pass now forces one synchronous layout: `removeProperty` followed by `getBoundingClientRect`. It is a single read on one header per pass. Whether this costs anything at the render rate is outside a statement review. This is the first `ResizeObserver` in `web/src`, and the web log's precedent check says so. The shape belongs to review-maintainability.
3. **[note]** The `100vw` in `var(--loc-cap, 100vw)` is a no-cap sentinel inside `min()`, which cannot take `none`. It is not a spacing value, so the design-token rule does not apply to it.
4. **[note]** I wrote no scratch spec, and the only file I wrote is this one. `plans/stale-dirs-models-branches/review.maintainability.md` is untracked in the tree: it is review-maintainability's in-flight part.

## Browser review

# Browser review: Stale Dirs, Models and Branches

**Plan**: stale-dirs-models-branches
**Part verdict**: approved
**Cycle**: 5
**Pack**: kb: pack 37403 words (budget 20000)
**Rig**: built fresh with `make web-build build` at dcd5b17, giving `bin/musterd` (`v0.19.1-72-gdcd5b17`). Each probe test got its own scratch `-data-dir` (`$TMPDIR/muster e2e-…`, a path with a space) with its own `-tmux-socket` inside it, which the harness teardown kills. Each also got the E2E stub `claude` and `-repo-poll 200ms`. Driven in headless Chromium through one throwaway spec (`web/e2e/zz-rb-probe.spec.ts`) built on the committed helpers. The spec is deleted, no `musterd` or private tmux server is left running, and `git status --porcelain` shows nothing of mine (Note 5).

I read the gates log in `gates-stale-dirs-models-branches-c5` and did not re-run it. It shows 0 failed lines: `web-build` is green and `e2e` passed 603.

The only shipped change since cycle 4's rig (fbf94a1) is fix dfb8100: `fitMainheadMeta` in `web/src/render/mainhead.ts`, a ResizeObserver on the Focus pane in `web/src/features/focus.ts`, and `--loc-cap` in `web/src/style.css`. All three touch only the Focus header (`.mainhead`). No Go source changed, so the daemon-side cells carry over from cycle 3. No rail or tile CSS changed, so those cells were spot-checked rather than swept.

Fixtures are the same 14 as cycle 4. All use the title `rework shift-swap approval` unless named otherwise:
- **long**: a 60-character folder on an 80-character branch.
- **short**: `muster` on `main`.
- **long moved**, **short moved**: a `.claude/worktrees/` worktree, with a 60-character name and with `probewt`.
- **ended**: long names and short names.
- **bypass**: long names, moved, launched in `bypassPermissions`, with the move hook carrying that mode.
- **status line**: short names, then a status-line post with model `Haiku 4.5`. Afterwards the daemon is SIGTERMed.
- **no data**: a plain non-git directory with no hooks.
- **tiny**: `api` on `main`, `ab` on `x`, and `api` moved into `wt`.
- **long title**: 66 characters, short names.
- **short title**: `ok`, long names, moved.

Sweep: every 4 px from 1440 down to 700, then every 16 px from 716 back up to 1440, giving 232 cells per fixture and 3,248 Focus-header cells in all. In each cell I took two reads:
- read A after two animation frames;
- read B 250 ms later, plus the committed `mainheadFitProblems` helper.

Both reads record:
- **blank**: `.loc`'s right edge minus the furthest first-line block's right edge plus its `margin-right`. This is cycle 4 Minor 1's criterion.
- **gap**: from the last visible block's text to the model.
- whether `↳` is shown, the `--loc-cap` value, the header height, the title's and the model's `scrollWidth`/`clientWidth`, and the document's `scrollWidth`.
- **errors**: an init script adds a `window` `error` listener, so a ResizeObserver loop error would be counted.

I took header screenshots at 8 widths per fixture.

## Matrix

Hosts:
- **rail**: Focus view, `#sessions`.
- **focus**: `#mainhead`.
- **tile**: `article.tile .thead`.
- **strip**: Tiles view, `#tiles-strip`.

The pop-out (`/doc.html`) is the docs reader and has no repo readout, so it is N/A in every row.

| Req | Host | State | Claim | Result | Evidence |
|-----|------|-------|-------|--------|----------|
| REQ-13 | focus | data, all 14 fixtures, 1440–700 and back | `.loc` ends within 1 px of its last visible block plus that block's margin (cycle 4 Minor 1) | pass | 0 of 3,248 cells have blank > 1 px in read A or read B. The largest blank is 0. The `--loc-cap` is set in 2,830 cells (every cell where `↳` is not on the first line) |
| REQ-13 | focus | data, tiny (`api`/`main`, `ab`/`x`) | no floor room beside an ellipsized title | pass | blank 0 at all 232 widths each, with the title ellipsized in 92 and 91 cells. The text-to-model gap is 18.6 px everywhere, down from 38.9 and 45.7 px in cycle 4. The `api / main` screenshot at 900 shows `rework shift-swap …` then `api / main · claude-haiku-4-5-20251001` with no hole. The cap is 52.5 px |
| REQ-13 | focus | data, moved, title whole (short moved, tiny moved, long moved, short title) | the model follows the visible text once `↳` has wrapped away | pass | gap 18.6 px in every cell of all four fixtures (cycle 4: up to 101.6 px). The short moved screenshot at 1024 shows `muster / main · claude-haiku-…` with no hole |
| REQ-13 | focus | data, all fixtures | the text-to-model gap is one `--sep-gap` | pass | the distinct gap values across all 3,248 cells are exactly {18.6} |
| REQ-13 | focus | data, sweep down then up | no hysteresis | pass | every up-sweep cell matches the down-sweep cell at the same width (header height, `↳` shown, `.loc` box and cap) in 12 fixtures. The two ended fixtures differ only as their ended age ticks over (Note 2), and their blank is still 0 |
| REQ-13 | focus | data, every cell | settled: no change between 2 frames and 250 ms after a resize | pass | read A equals read B in `.loc` box, header height, cap, `↳` and model in 3,246 cells. The 2 that differ are the ended fixtures at 1084 and 1004, where the ended-age text changed between the reads. Both reads have blank 0 |
| REQ-13 | focus | data, idle at 15 widths (1300–740) × 3 sessions | no flicker, no cap oscillation | pass | sampled every animation frame for 3 s: 181–182 frames per sample, and exactly 1 distinct (`.loc` right, model left, header height, cap) tuple in all 45 samples. Render passes rewrite the `style` attribute up to 6 times in 3 s with the same value (Note 3) |
| REQ-13 | focus | data, every cell and idle sample | no ResizeObserver loop error | pass | the `window` `error` count is 0 in all 3,248 sweep cells, all 45 idle samples and all 64 content-change reads |
| REQ-13 | focus | data, 1440/1100/1000/900 | no stale cap after switching sessions | pass | the switches go tiny `api` → long moved → short moved → tiny → short moved. At each step the cap matches the session: 52.5 px for `api`, none or 72.8 / 119.3 px for the moved sessions as `↳` fits or not. Blank 0 and gap 18.6 in read A (2 frames) and in read B (1.3 s later) |
| REQ-13 | focus | data, 1440/1100/1000/900 | no stale cap after a rename | pass | renaming to `c`, then the 66-character title, then back: at 1440 and 1100, `↳` comes back for `c` and the cap clears, the long title sets the cap at 72.8 px, and the original title clears it again. Blank 0 in every read |
| REQ-13 | focus | data, 1440/1100/1000/900 | no stale cap after a status-line model change | pass | after `Opus 5.5 (1M context) extended`, the model is 203/203, and at 1100 `↳` gives way with the cap set. After `H` (7/7), `↳` returns and the cap clears. Blank 0 throughout |
| REQ-13 | focus | data, 1440/1100/1000/900 | no stale cap after an unmove, a move or a branch change | pass | an unmove sets the cap and a move again clears it where `↳` fits. A real `git checkout -b` to a 36-character branch at 1000 moves the cap 72.8 → 78.4 px, and a short branch moves it back. Blank 0 |
| REQ-13 | focus | data, Tiles round trip | no stale cap after resizing while the Focus pane is hidden | pass | resizing in Tiles and returning to Focus at a different width gives the cap for the new width (for example, at 1100 `↳` is shown and there is no cap, and at 900 the cap is 72.8 px). The values match the plain-resize cells |
| REQ-13 | focus | data, moved | `↳` block reappears on wrap | pass, decided | short title: shown at 1440–1136 and 1048–936 and 848–760, gone elsewhere. Tiny moved: back at 1048–1032. Bypass: back at 736–700. This is the same pattern as cycle 4. The developer decided option A (`decisions/claude-at-may-reappear-on-wrap`) |
| REQ-13 | focus | data, all fixtures | the repo block is on the first line and the model is never truncated | pass | `mainheadFitProblems` returns `[]` in all 3,248 cells. The model `scrollWidth` equals `clientWidth` in every cell: 169/169 for the id and 61/61 for `Haiku 4.5` |
| REQ-13 | focus | data, narrow | the header wraps, controls stay on screen, no horizontal scroll | pass | 49.4 → 80.4 px at 1048 (long, short, long title, tiny moved), 1028 (`api`), 1020 (`ab`), 1112 (bypass), 1128 (ended), 940 (status line) and 912 (no data). It reaches 105.4 px at 748 (ended) and 736 (bypass). Document `scrollWidth` equals the viewport width in every cell. End, Resume and Remove are on screen (helper) |
| REQ-13 | focus | data, header height changed by content | the terminal refits | pass | at 1000, the bound id header is 126.4 px at the bottom, tmux is `93x26`, xterm has 26 rows and the screen is 126.4–750.4 in the slot 126.4–774. After a status line `H` unwraps the header: bottom 95.4, `93x28`, 28 rows, screen 95.4–767.4. Read after 2.5 s |
| REQ-13 | focus | ended | ended age after the model | pass | the long and short ended fixtures have blank 0, gap 18.6 and the model whole at every width |
| REQ-13 | focus | bypass chip | chip, then meta, nothing overlapping | pass | the helper's overlap check is `[]` in 232/232 cells. Gap 18.6 |
| REQ-13 | focus | no data | basename alone | pass | blank 0 at every width, with the cap set (no `↳`). It wraps at 912 |
| REQ-13 | focus | daemon-down, 900 and 740 | last snapshot stays, banner shows | pass | `#banner` is `display: block` at 46–78 (900) and 46–93 (740), text `musterd unreachable — …`. The header is pushed down (`.loc` top 87 / 102), `Haiku 4.5` is 61/61, blank 0, helper `[]`, and read A equals read B |
| REQ-17 | focus | data, wrapped (1000) | keyboard focus survives a re-render | pass | `Tab` from `.rename` lands on `claude`, which I tagged. After a real `git checkout -b kbd-new` re-rendered the branch and 1.5 s passed, the tagged node was still `activeElement` |
| REQ-17 | focus | data | operable by keys | pass (cycle 4) | no button or dialog code changed |
| REQ-14 | focus, rail, tile | moved / unmoved | hover lines | pass (cycle 3) | markup and the hover code are unchanged since 02f7861. The tile `title` read here carries all 4 lines |
| REQ-10 | rail | data, comfortable | two lines, each truncating on its own | pass | `.rf` 14–288 at 138.75 (420/274), `.rb` 14–288 at 151.75 (542/274), inside card 0–299 |
| REQ-11 | rail | data, compact | one line | pass (cycle 4) | no rail CSS changed |
| REQ-12 | rail | data, comfortable | `↳` lines as tall as the repo lines | pass | `.r2` 26 = `.r2c` 26. `.lead` 14–25.8, `.r2c .rf` from 25.8 |
| REQ-12 | strip, rail compact/expanded | data | same | pass (cycle 4) | no rail or strip CSS changed. My strip read did not run because one session leaves no strip (Note 4) |
| REQ-16 | rail | data, Instrument | glyph `--fg-muted`, text `--fg-dim` | pass | `.lead` is `rgb(178,182,195)` and `.rf` is `rgb(166,171,188)` |
| REQ-15 | tile | data, moved, 1000 | `.wh` one line, `↳` glyph inside `.thead` | pass | `.wh-claude` 351.2–358.0 is computed `display: block`, inside `.thead` 2–498.5. `.wh` is 13 px tall (one line) and reads `<long folder> / kbd-new` |
| REQ-1, REQ-9 | rail, focus | daemon facts | branch kept, id shown | pass (cycle 3) | daemon unchanged. Every bound fixture showed `claude-haiku-4-5-20251001` until the status line's `Haiku 4.5` |
| §7.1 | tiles | data | one live client per session | pass | `totalAttachedClients()` is 1 for 1 session after the Focus → Tiles switch |
| §6.7 | focus | daemon-down | daemon-down surfaced prominently | pass | `#banner` `display: block`, full width, above the header |
| Hidden | focus | unmoved | `.claude-at[hidden]` has no box | pass | in every unmoved cell `.claude-at` has `hidden` and no client rects. Its computed `display` was measured as `none` in cycle 4, and no display rule has changed since |

## Issues

### Critical

(none)

### Major

(none)

### Minor

(none)

### Notes

1. **[note]** Cycle 4's issues, as measured:
   - **Minor 1 is fixed.** Blank is 0 in all 3,248 cells, including the tiny fixtures and the moved fixtures with the title whole, and the text-to-model gap is 18.6 px everywhere.
   - **Minor 2 is closed.** The committed sweep now covers `api` on `main`, unmoved and moved, and `blankProblems` reports blank at every width. That is `review-work`'s to confirm.
   - **Minor 3 is settled as option A** and behaves as decided.
2. **[note]** The ended fixtures' up-sweep differs from their down-sweep at 13 and 23 widths, and two cells differ between read A and read B. The ended-age text changes over the run, which changes how much room the meta gets. The cap followed it every time, with blank 0 in every read, so this is the age ticking, not instability.
3. **[note]** Each render pass clears and re-sets `--loc-cap`, up to 6 `style` writes in 3 s at a fixed width, with the same value each time. That costs a forced layout per pass. In 45 three-second per-frame samples no painted frame differed, so there is no visible effect. This is observation only. Whether the extra layout is worth avoiding is `review-maintainability`'s call.
4. **[note]** Not re-measured, because the cycle changed no code they depend on:
   - the strip's `↳` line height and the rail in compact and expanded density;
   - REQ-16 in Light, and §7.4 (`scrollback: 0`) and §7.5 (pane styling);
   - keyboard operation of End.
   Cycle 4 measured all of these as passing.
5. **[note]** Not mine, left alone:
   - the untracked `review.code.md` and `review.maintainability.md` in the working tree, which are the concurrent reviewers' files;
   - the `$TMPDIR/muster-e2e-loc-*` directories timed 14:52–15:47 and `muster e2e-stub-…` at 13:22. These pre-date this run, which started at 19:13.

## Maintainability review

# Maintainability review: Stale dirs, models and branches

**Plan**: stale-dirs-models-branches
**Part verdict**: needs-changes
**Cycle**: 5
**Pack**: kb: pack 42147 words (budget 20000)
**Scope**: 33 files from `git diff main...HEAD -- cmd internal web/src ':!*_test.go' ':!*.test.ts'`. This is a full cycle, because the spawn prompt did not ask for a delta. Since the cycle 4 review commit (`3a4a3a6`), `git diff 3a4a3a6..HEAD` over the same paths touches three files, all from fix commit `dfb8100`: `web/src/features/focus.ts` (+8 −1, new to the branch diff), `web/src/render/mainhead.ts` (+22) and `web/src/style.css` (+8 −4). I re-read those three diffs in full, with their siblings open. The other 30 files have not changed since cycle 4, so they keep their cycle 4 result.

## Files

| File | Siblings opened | design: line | Size warnings | Result |
|------|-----------------|--------------|---------------|--------|
| cmd/musterd/main.go | in-file flag siblings | n/a (one flag) | filelen 525, funlen `parseFlags` 48: reasons hold; funlen `run` 44: function untouched | pass (unchanged since cycle 4) |
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
| web/src/features/focus.ts | features/CLAUDE.md `init<Name>` shape, terminal/pane.ts (the other resize-driven refit), index.html `.main` | **no** (the new ResizeObserver seam) | — | Minor 1 |
| web/src/protocol/session.ts | in-file parsers | n/a | — | pass (unchanged) |
| web/src/render/mainhead.ts | render/reader.ts (the other layout-measuring builder, `:515-542`), render/CLAUDE.md render-state rule, render/tiles.ts | **no** (`fitMainheadMeta`); web-implementation.md:85 and :135 still say "CSS only, instead of a `ResizeObserver`" and "rather than a JS fit" | — | Minor 1 |
| web/src/render/repolines.ts | render/context.ts | yes | — | pass (unchanged) |
| web/src/render/sessions.ts | render/context.ts | covered | — | pass (unchanged) |
| web/src/render/tiles.ts | render/sessions.ts | covered | — | pass (unchanged) |
| web/src/sessions/card.ts | sessions/paths.ts | yes | — | pass (unchanged) |
| web/src/style.css | `.mainhead .meta` owner comment (`:727-733`), `.mainhead .name` (`:660-668`), the `--block-floor` precedent | covered for the custom-property owners; `--loc-cap` is documented in the owner comment (`:731-733`) | — | pass. The new variable is declared beside its siblings' owner comment, and that comment names its one writer |

## Issues

### Critical

None.

### Major

None.

### Minor

1. **[web-impl]** The cycle 4 fix adds a JS layout fit with no `design:` line, and two standing `design:` lines now describe the opposite choice. The fit is `fitMainheadMeta` (`web/src/render/mainhead.ts:62-80`), called last in `renderMainhead` (`:147-148`) and from a new `ResizeObserver` on the pane (`web/src/features/focus.ts:116-121`). It is the only `ResizeObserver` in `web/src`: `rg -n "ResizeObserver|getBoundingClientRect|offsetParent|getComputedStyle|style.setProperty|removeProperty" web/src --glob '!*.test.ts'` shows `features/focus.ts:120` as the only `ResizeObserver`, and `render/mainhead.ts:70-79` as the only render-pass writer of a custom property. The other layout measurers are `render/reader.ts:520-542` (scroll position) and `render/diagramdialog.ts:141`. Meanwhile `plans/stale-dirs-models-branches/web-implementation.md:85` says "the give-way is CSS only … instead of a `ResizeObserver`", and `:135` says "rather than a JS fit or a container query". Its known-limits bullet (`:137`) says "CSS has no `min(8ch, max-content)`" for the short-folder case, which `--loc-cap` now handles. This breaks question 7: the review asks that every new seam carry a `design:` line (conventions § Design). A newcomer reading Decisions would expect no JS fit, then find one. **A fix must make true**: Decisions carries one `design:` line for the fit. It names the problem CSS could not solve (a `↳` block that gives way whole leaves `.loc` holding unshown room, and the floor cannot follow a short folder line). It says why the observer watches the pane and not the header, and it cites the precedent check, for example `rg -n 'ResizeObserver' web/src` finding none. Lines `:85` and `:135` are marked superseded by it, and the `:137` limit is updated, so Decisions no longer contradicts the code. No code change is asked for.

### Notes

1. **[note]** The no-loop claim at `features/focus.ts:116-117` ("the pane's own size never depends on the header") holds. The observed node is `#mainhead`'s parent, `section.main` (`web/index.html:75`). `.main` is `flex: 1` in its row with `min-width: 0; min-height: 0` (`style.css:606-612`), so the header gaining a row does not resize it. The observer is never disconnected, which matches the controller's lifetime (it is created once in `initFocus`, like the `app.on` subscriptions beside it).
2. **[note]** The render-state rule holds (`web/src/render/CLAUDE.md`): `fitMainheadMeta` keeps no state across calls. It clears `--loc-cap` before every measurement (`mainhead.ts:70`), so the inline style is the element's own state, recomputed every time. One cost of shape: every `renderMainhead` pass now forces a synchronous layout (`removeProperty` followed by `getBoundingClientRect`). If the render pass ever measures in a second place, that cost is worth collapsing into one read phase.
3. **[note]** The `- 1` tolerance at `mainhead.ts:76` is an unnamed literal. Its sibling `render/reader.ts:515` names its own (`const TOP_TOLERANCE_PX = 24`). Naming it would be a small readability gain. This is not filed.
4. **[note]** `var(--loc-cap, 100vw)` inside the grid track's `min()` (`style.css:740`) uses `100vw` as a "no cap" sentinel. `max-width: var(--loc-cap, none)` (`:763`) uses `none`, because `min()` cannot take `none`. The two fallbacks differ for a stated reason, and the comment at `:731-733` covers both uses.
5. **[note]** For `review-work`: the doc-delta and the design-system §5 / focus spec wording on how the header gives way may need a sentence for the JS trim, now that the give-way is no longer CSS only. The doc-delta is out of scope here.
6. **[note]** Cycle 2 Notes 1 to 4 still apply as written (carried in cycle 4 Note 3): `resolvePath` and `resolveTranscriptDir` are two copies (an orchestrator follow-up), `checkoutState` lives in `launcher.go`, `isDir` is checked twice, and each host has its own ellipsis rule. None of the files they cite changed in this cycle.
