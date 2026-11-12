# Review: claude-tmp-files

**Plan**: claude-tmp-files
**Verdict**: approved
**Cycle**: 3
**Gates**: 0 failed
**Parts**: code, browser | skipped: maintainability
**Part verdicts**: code approved, browser approved

_Merged by orch-state.py merge-review; the verdict is computed from the parts and the gate run, never edited by hand._

## Correctness review

# Correctness review: claude-tmp-files

**Plan**: claude-tmp-files
**Part verdict**: approved
**Cycle**: 3
**Pack**: kb: pack 67244 words (budget 30000)

This is a delta re-review over the cycle-2 review commit ef28dc19 to HEAD 8988afec (four commits: 0d94e5b9 docs, 2b3ee0ff fix, 6f35cdd9 test, 8988afec chore). The only shipped source file the diff touches is `web/src/style.css`; the rest are render specs and helpers, ADRs, generated indexes, `TODO.md` and plan files. §1–§2 were run in full. §3–§6 cover the files the diff touches.

## Requirements

| Req | Implemented | Tested | Status |
|-----|-------------|--------|--------|
| REQ-1–REQ-8, REQ-10–REQ-13 | Yes, unchanged since cycle 2: the delta touches no daemon, protocol, `render/` or `features/` code | Yes, as in cycle 2 | pass |
| REQ-9 (nav section, per the Views *Amended* note now citing kb:adr/reader-nav-scrolls-as-one-column) | Yes. `.rnav .tree, .outline, .plan-slot, .scratch-rows { flex: none }` (`web/src/style.css:2057-2062`) with no per-section `overflow`, `min-height` or 40% cap. `.rnav` keeps `overflow: hidden auto` (`style.css:1773`), which makes it the only scroller. An empty `.scratch-rows` therefore takes its natural 0 px. | Yes. `web/render/reader-scratch.spec.ts` covers Focus 900/600/360 and the compact 3×2 tile at 600/450, folded and unfolded, on the large fixture. It checks that every section has clientHeight == scrollHeight and no `overflow-y` auto/scroll, that `.rnav` scrolls, that at the nav's end the last tree row and last outline row are inside the nav, that at the top the summary row is inside it, and that a folded section is a 0 px strip. An unfolded session with nothing to list is also a 0 px strip. `web/render/reader.spec.ts` checks that the #67 large-tree case reaches each last row by scrolling the nav. | pass |
| REQ-9 bare row age | Unchanged | Unchanged | pass |
| #67 folder path wraps (prior Minor 1) | Yes. The clamp is gone and `.rnav .hd .dir` is `min-width: 0; overflow-wrap: anywhere` (`style.css:1811-1814`). | Yes. "the Files header's folder path wraps rather than clamping" runs in Focus and in a tile: no line-clamp 1, no ellipsis, not clipped, height over 1.5 lines. | pass |
| DIAG | `go tool kb for web/src/style.css` names only `kb:diagram/web-components`, a module diagram. CSS section heights are not depicted, so it is unaffected. | — | pass |

## Build & Tests

All results below were read from `$GATES_LOG_DIR` (…/gates-claude-tmp-files-c3, 0 failed lines). That run started at 16:40. HEAD 8988afec was committed at 16:40:50 and is plan files only, so the tree the gates ran is the shipped one.

- **E2E**: pass, 272 tests scoped to 27 files (`21-e2e.log`, includes `reader-scratch.spec.ts`). The full sweep runs at Completion.
- **Daemon tests (race)**: pass. `02-test.log`, and `22-D1.log` every package `ok`, no `FAIL`.
- **Web tests**: pass, 112 files and 3267 tests (`05-web-test.log`).
- **Render**: pass, 499 tests (`08-render-test.log`).
- **Daemon build**: pass (`01-build.log` empty).
- **Web build**: pass (`04-web-build.log`).
- **Lint**: pass. `03-lint.log` reads "0 issues."; `09-web-lint.log` reads "No fixes applied.".
- **Size**: the WARN lines (`19-size.log`, 11 hits) are review-maintainability's.

## Acceptance Checks

| ID | Command | Result |
|----|---------|--------|
| D1 | `make test` | pass (`22-D1.log`) |
| D2 | `go build ./...` | pass (deduped to the gates' build line, `01-build.log`) |
| D3 | `make lint` | pass ("0 issues.", `03-lint.log`) |
| D5 | `make check-render-fixtures` | pass ("render fixtures up to date (116 scenarios)", `06-render-fixtures.log`) |
| W1 | `make web-build` | pass (`04-web-build.log`) |
| W2 | `make web-test` | pass (3267/3267) |
| R1 | `make render-test` | pass (499 passed) |
| E1 | `make e2e` | pass, scoped (272 passed); the full sweep runs at Completion |
| gate | web-lint / contrast (54 pairs ×3, 0 failures) / e2e-lint / render-lint / kb check (698 records, 0 problems) / versions / comments / comment-ledger / features / e2e-honest / features-inventory | pass |
| DOC | doc upkeep + Doc Delta vs what shipped | pass |

DOC detail:
- The new `docs/adr/reader-nav-scrolls-as-one-column.md` is `proposed`, `refs: plan:claude-tmp-files` and `supersedes: [reader-nav-sections-shrink-without-floor]`. Its Decision matches the CSS: natural height, `.rnav` the one scroller.
- The withdrawn `reader-nav-too-short-for-fixed-rows-out-of-scope` record and its `proposed-backlog.md` entry are gone. Nothing outside the `review*` archives still names it (`rg`).
- `doc-delta.md`'s new reader line ("scrolls as one column … every row is reachable by scrolling the nav in every host") matches the CSS and the render measurements. The pop-out shares the non-compact rules and is not measured separately.
- `docs/features/reader/spec.md` carries no sentence about per-section shrink or scroll, so nothing needs a stops-being-true line.
- No `docs/`, `README.md` or `web/**/CLAUDE.md` sentence claims per-section scrolling (`rg`).
- Fix Attempt 4 records no `deviation:` line. That is correct: the change is the developer's decision, carried by its own ADR, and the #67 wrap is restored, not changed.
- The `TODO.md` Tweak was filed at the developer's request, symptom plus expected behaviour.

## Reviewer-Verified Criteria

| ID | Criterion | Result | Evidence |
|----|-----------|--------|----------|
| V1 | no `any` in new web code | pass | the delta's TS is render-test helpers and specs only, with no `any` |
| V2 | summary row, chips, `tmp` badge and row ages match the mockup | pass (unchanged) | The delta changes only section heights and the `.dir` clamp. Measuring the look on screen is review-browser's job. |
| V3 | `scratchpad_dir` read only in `internal/claudecode` | pass | no Go file in the delta |
| V4 | no new watcher or poll | pass | no `.ts` source file in the delta |

## Hard-Rule Checklist

| # | Rule | Result |
|---|------|--------|
| 1 | Adapter boundary | pass: no Go in the delta |
| 2 | No terminal-output state parsing | pass |
| 3 | Non-blocking hook handler | pass: untouched |
| 4 | tmux via `-L muster` / sizing | pass: untouched |
| 5 | No payload logging | pass |
| 6 | Empty-gauge honesty | pass: chip logic untouched; an empty scratch area is now 0 px, not a blank strip |
| 7 | Identity on tmux target | pass |
| 8 | No settings trespass | pass |
| 9 | No real `claude` outside canary | pass |

Design tokens: the CSS hunk removes rules and adds `flex: none` only. It adds no literal and no font. `.plan-slot` and `.scratch-rows` are never toggled through `hidden` (`rg` over `web/src`), so they need no `[hidden]` companion.

## Delta

My cycle-2 part had no Critical and no Major of its own. The critic struck the one Major, and the orchestrator says it applied that fix before the merge. The Minor below is listed for the orchestrator's check, not re-ruled.

| Prior issue (id) | Status | Fix commit | Verified how |
|---|---|---|---|
| Minor 1 `web/src/style.css:.rnav .hd .dir:unlogged-clamp-all-hosts` `[web-impl]` | resolved (orchestrator's to confirm) | `2b3ee0ff` | Diff read: the clamp, `overflow: hidden` and `-webkit-box` are removed, leaving `min-width: 0; overflow-wrap: anywhere`. Two render tests (Focus and tile) assert the path wraps and is not clipped. |

The prompt carries no `counter:` or `refute:`.

Test honesty: the render repairs replace assertions that pinned the superseded per-section model (`overflow-y: auto` on tree, outline and scratch, the 22 px floor, the 40% cap, the one-line clamp). Each is replaced by its opposite under the new ADR, not deleted. Every replacement guards against passing vacuously:
- `expectSectionsNaturalHeight` requires `.tree` and `.outline` to be present.
- `reader.spec.ts` asserts the nav really overflows before it checks reach.
- The unfolded cases assert three scratch rows and a non-zero `.scratch-rows`.

## Issues

### Critical
None.

### Major
None.

### Minor
None.

### Notes
1. **[note]** `docs/adr/reader-nav-scrolls-as-one-column.md` has `tests: []`, but the render cases in `web/render/reader-scratch.spec.ts` ("every section takes natural height and the nav scrolls …") now guard the decision. The orchestrator may want to name the spec there when it flips the ADR at Completion. Nothing is requested here.
2. **[note]** For review-browser: the render harness measured the new layout in Focus and in the 3×2 tile. The pop-out was not measured separately (Fix Attempt 4 says it shares the non-compact rules). Tab order and keyboard focus on a row lower in the now-scrolling nav are observed properties outside my scope.
3. **[note]** For doc-reconcile: the reader spec's "the plan slot pinned on top" stops-being-true line is still the right edit. The new natural-height sentence is the only nav-layout claim it needs to add.

## Browser review

# Browser review: claude-tmp-files

**Plan**: claude-tmp-files
**Part verdict**: approved
**Cycle**: 3
**Pack**: kb: pack 12898 words (budget 30000)
**Rig**: `make web-build build` at 8988afec; scratch daemon from `web/e2e/helpers/fixtures.ts` (data dir `TMPDIR/muster e2e-849ef7dd-Yknzbm`, space-bearing, private `tmux.sock` inside it, killed and removed at teardown, socket confirmed gone); stub `claude` (`helpers/daemon.ts`); headless Chromium 1280 px wide via one throwaway spec (foreground, 3.1 min, deleted; `git status --porcelain` shows nothing of this reviewer).

Gates log read, not re-run: 0 failed lines; `04-web-build` green, `08-render-test` 499 passed, `21-e2e` 272 passed. The app driven is the one that ships.

Scenario: session `rb-full` in a deep directory with two long segments (to force the Files header path to wrap), the 20-file large tree plus `0-outline.md` (30 headings, open, so the Outline is full), a transcript-located plan, and 30 scratch `.md` files aged now / 2 min / 1 h / 2 d / older. Session `rb-empty` has an empty scratchpad and no plan. "Reach" = a real mouse wheel over `.rnav` from scroll top until the last row of the section sits wholly inside the nav box, then `elementFromPoint` at the row's centre hits it. Box figures are clientHeight/scrollHeight in px.

## Delta

| Prior issue | Fix commit | Verified how |
|---|---|---|
| browser Major 1 (empty `.scratch-rows` keeps a 22 px strip, folded or with nothing to list) | 2b3ee0ff | `.scratch-rows` is 0/0 with 0 children folded in every host (Focus 900/600/360, pop-out 900/600/360, 2x2 and 3x2 at 900/600/450) and unfolded on `rb-empty` (Focus 600; tiles 2x2/3x2 at 900/600/450): the Files header follows the plan row directly. |
| browser Major 2 `[orchestrator:decision]` (tree 8 px, Outline 17 px in a 600 px tile) | 0d94e5b9 (decision C, kb:adr/reader-nav-scrolls-as-one-column), 2b3ee0ff | Settled as "nav scrolls as one column". Every section measures at natural height with computed `overflow-y: visible` (tree 441/441 Focus, 315/315 compact; Outline 651/651; scratch 690/690 Focus, 630/630 compact; plan 23 / 21); `.rnav` is the only scroller (`overflow-y: auto`). The last scratch, tree and Outline row is reached by wheel and hit-tested in every host and height in the matrix, down to a 51 px nav. |
| browser Minor 1 (22 px floor clips a 23 px row) | 2b3ee0ff | Moot: no floor remains; a Focus/pop-out scratch row is 23 px inside a 690/690 box, compact 21 px inside 630/630; last row 23/23 and 21/21 px visible. |

## Matrix

Surfaces touched since ef28dc19: `web/src/style.css` only — `.rnav .tree/.outline/.plan-slot/.scratch-rows` to `flex: none` with no own overflow, `.scratch-rows` floor/cap removed, `.rnav .hd .dir` clamp removed.

| Req | Host | State | Claim | Result | Evidence |
|-----|------|-------|-------|--------|----------|
| one column | focus 900 | data, folded | sections natural, nav the one scroller, every row reachable | pass | nav 773/1314 auto; plan 0, scratch 0/0; tree 441/441, Outline 651/651 visible; last tree row 21/21 visible hit, last Outline row 21/21 at scrollTop 541 = max, hit |
| one column | focus 900 | data, unfolded | same | pass | nav 773/2027; plan 23, scratch 690/690; last scratch 23/23, tree 21/21 (scrollTop 600), Outline 21/21 (1254 = max); all hit |
| one column | focus 600 | data, folded / unfolded | same | pass | nav 473/1314 and 473/2027; all three last rows wholly inside and hit; max scrollTop 841 / 1554 |
| one column | focus 360 | data, folded / unfolded | same | pass | nav 233/1314 and 233/2027; all last rows wholly inside and hit; max 1081 / 1794 |
| one column | pop-out 900 / 600 / 360 | data, folded | same | pass | nav 871 / 571 / 331 of 1314; tree and Outline last rows inside and hit |
| one column | pop-out 900 / 600 / 360 | data, unfolded | same | pass | nav 871 / 571 / 331 of 2027; scratch 690/690; scratch, tree, Outline last rows inside and hit |
| one column | tiles 2x2 and 3x2, 900 | data, folded / unfolded | same | pass | tile 346 tall; nav 314/1149 and 314/1800; tree 315/315 (15 px rows), Outline 651/651, scratch 630/630; all last rows inside and hit |
| one column | tiles 2x2 and 3x2, 600 | data, folded / unfolded | same (cycle 2 Major 2 host) | pass | tile 196; nav 164/1149 and 164/1800; last tree row 15/15 at scrollTop 320 / 1000, Outline 21/21 at max 985 / 1636, scratch 21/21; all hit |
| one column | tiles 2x2 and 3x2, 450 | data, folded / unfolded | same (back in scope) | pass | tile 121; nav 89/1149 and 89/1800; tree, Outline, scratch last rows wholly inside and hit at scrollTop 400 / 1060 (folded), 600 / 1040 / 1711 (unfolded) |
| one column | tiles 3x2, 600 and 450 | daemon-down | same, rows kept | pass | banner shortens the nav to 126 and 51 px; 30 scratch rows kept; last scratch, tree, Outline rows inside and hit at both heights |
| empty scratch is 0 px | focus 600 | empty, folded / unfolded | no strip | pass | `.scratch-rows` 0/0, 0 children; unfolded plan slot 19 px (`no plan yet`), scratch top 172 = plan bottom |
| empty scratch is 0 px | tiles 2x2 and 3x2, 900 / 600 / 450 | empty, folded / unfolded | no strip | pass | `.scratch-rows` 0/0, 0 children in all 12 cells; unfolded plan 15 px |
| empty scratch is 0 px | every data host above | data, folded | no strip | pass | `.scratch-rows` 0/0, 0 children, plan 0 |
| keyboard focus into view | focus 900 / 600 / 360, pop-out 900 / 600 / 360, tiles 2x2 and 3x2 900 / 600 | data, unfolded | each Tab-focused nav row wholly inside the nav box | pass | 86 Tab stops from the summary row to `Section 30`, 0 out of view in each of 10 cells |
| keyboard focus into view | tiles 2x2 and 3x2, 450 | data, unfolded | same | pass (rows); header see Note 1 | 86 stops, 85 inside; the one not wholly inside is the Files header control (107 px) in an 89 px nav |
| keeps focus | focus 600, tiles 3x2 600 | data, unfolded | Tab-focused last tree row stays the active node over a render tick | pass | `file-20.md` active before and after 1.2 s, connected, inside the nav |
| scroll-spy | every host, unfolded | data | current Outline entry brought into view | not brought into view — Note 2 | after wheeling the body to its end, current entry `Section 20`–`29` sits 1674–1964 px below the nav top with `.rnav` scrollTop 0 |
| Files header wraps (#67) | focus, pop-out, tiles 2x2 / 3x2 | data | long folder path wraps, not clamped | pass | `.rnav .hd .dir` 99/99 px (clientHeight = scrollHeight), `-webkit-line-clamp: none`, `overflow: visible`; header 113 px (Focus), 107 px (compact) |
| daemon down | tiles 3x2 600 | daemon-down | surfaced loudly | pass | `#banner` display block, opacity 1, `musterd unreachable — hook output in open panes is Muster's absence…` |
| design-system 6 | all | all | no 0% track, cost, Done or unaged stale state | pass | nothing added by the delta; rows keep their ages |
| design-system 7 | all | all | | N/A — no terminal surface touched | |
| scratch loading row | all | listing in flight | | N/A — untouched by the delta (CSS sizing only); not re-driven | |

## Issues

### Critical

### Major

### Minor

### Notes
1. **[note]** In a 450 px window's 2x2 or 3x2 tile (nav 89 px) the Files header control is 107 px tall with a deliberately long two-segment folder path wrapped to 99 px, so it can never sit wholly inside the nav: its top is visible at scroll top, and keyboard focus on it scrolls it partly into view. Every file, Outline and scratch row is still reachable. This follows from the developer's #67 wrap and decision C together; no change requested.
2. **[note]** Scroll-spy moves `aria-current` in the Outline but never scrolls the nav to the current entry; with one column the current entry sits below the whole tree (up to ~1960 px down in a 164 px tile nav). Nothing in the delta or before it scrolled the Outline to its current entry (no `scrollIntoView` in `web/src`), so this is not a regression; it belongs with the filed TODO "Revisit the reader nav's scrolling" if the developer wants the current heading kept in view.
3. **[note]** 2x2 and 3x2 with these two sessions give the same tile height (346 / 196 / 121 px at 900 / 600 / 450), so the two densities share every height figure; only the width differs (636 vs 423 px).
