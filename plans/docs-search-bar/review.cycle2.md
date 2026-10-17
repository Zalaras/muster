# Review: docs-search-bar

**Plan**: docs-search-bar
**Verdict**: needs-changes
**Cycle**: 2
**Gates**: 0 failed
**Parts**: code, browser, maintainability
**Part verdicts**: code approved, browser needs-changes, maintainability needs-changes

_Merged by orch-state.py merge-review; the verdict is computed from the parts and the gate run, never edited by hand._

## Correctness review

# Correctness review: Docs Search Bar

**Plan**: docs-search-bar
**Part verdict**: approved
**Cycle**: 2
**Pack**: kb: pack 16530 words (budget 30000)

This was a full cycle, not a delta: cycle 1 had open Majors. I re-read every changed source file at HEAD, read the fix wave's diff against `review_commits[1]` (`de29db88..HEAD`), and checked each cycle 1 correctness issue (see Notes 1).

## Requirements

| Req | Implemented | Tested | Status |
|-----|-------------|--------|--------|
| REQ-1 | Yes. Unchanged since cycle 1: the icon is in both `#reader-template` copies and its `hidden` follows `available` (`render/readerfind.ts:55`) | E2, no-document, E14, E15, 2×2 tile | pass |
| REQ-2 | Yes. `.find` still sits in `.md`'s grid cell (`style.css:1482-1493`), so it follows the nav | E2, E3, pop-out corner, E15 | pass |
| REQ-3 | Yes. `open()` focuses and selects the box (`features/readerfind.ts:91-99`). The native clear glyph is now suppressed (`style.css:1540`) | E1, focus-identity, E14, new clear-button pixel test | pass |
| REQ-4 | Yes. Unchanged: a TreeWalker over `body` text nodes, literal case-insensitive per-node matching | W1, E4, E5, E6, literal test (now also asserts the highlighted text) | pass |
| REQ-5 | Yes. Unchanged: `paintFind` swaps only this instance's ranges in `find-match`/`find-current`. The new `.md` padding is CSS-only (`:has`), so the body's DOM is still untouched | E5, E6, E9, E17 | pass |
| REQ-6 | Yes. The count is now `countText(ordinal, ranges.length, searched)` (`features/readerfind.ts:169`), so it describes the query the ranges were built from and never shows a pending key as `no matches` | W3, live/no-matches test | pass |
| REQ-7 | Yes. Typing now re-runs after a trailing pause of 120 ms, rising to 2× the last run's cost with an 800 ms cap (`:111-117`). Each run is `refresh("first")` plus a reveal against the bar's bottom edge (`render/readerfind.ts:130-140`). See Note 3 on "live" | typing test (stale-count oracle added), the crowd/frontline tests in Focus, 3×2 and 2×2 | pass |
| REQ-8 | Yes. `step()` flushes any pending re-run first (`:130-138`), so Enter straight after typing still lands on match 2, as it did before the debounce. `scrollRangeIntoView` now scrolls every horizontally scrolling ancestor up to the body, then the body vertically (`render/readerfind.ts:142-150`) | W3, E10, step/wrap, the new sideways tests (Focus, 3×2) in both directions | pass |
| REQ-9 | Yes. `close()` also cancels a pending re-run and disarms the post-diagram reveal (`:101-109`) | E13, close button, E17 | pass |
| REQ-10 | Yes. Unchanged dispatch. The dialog check is now the structural dep `diagramOpen()` (`features/reader.ts:190`) | W2, E7, E8, E14, E16 | pass |
| REQ-11 | Yes. A silent re-fetch calls `fileOpened(false)`, which runs `refresh("keep")` and neither arms nor disarms. A theme pass ends in `diagramsSettled()`, which runs `keep` unless a user-initiated open armed it | E11 (theme path untested, as the plan decided in edge case 10) | pass |
| REQ-12 | Yes. Cycle 1 Minor 1 is fixed. `fileOpened(true)` arms `revealAfterDiagrams`. The settled diagram pass then re-runs `first` and reveals the match. Typing, stepping or closing disarms it | E12, plus the new late-diagram test (`inSvg: true`, placement `ok`, scrollTop > 0) | pass |
| REQ-13 | Yes. The query box now takes its border, radius, padding, ground, colour and font from the same rule as `.rnav .filter` (`style.css:1677-1685`). Its own rules set only size and flex. `--find-*` tokens unchanged; contrast 54 pairs, 0 failures ×3 | token test, `make contrast` | pass |
| DIAG | `kb:diagram/web-components`, the only diagram `kb for` names for the changed files. Recounted at HEAD: features/ 38, render/ 40, reader/ 11 non-test modules, all matching the fence. `features/readerfind.ts` is still a sub-controller handed its elements (now `{ body, find }`). The `render → reader` label "tree types, find matcher" still holds (`render/readerfind.ts` imports `findInTexts` and `StepDirection`) | — | pass |

## Build & Tests

E2E tests: pass (944 passed, `17-e2e.log`) · Daemon tests (race): pass (25 packages `ok`, 0 FAIL, `02-test.log`) · Web tests: pass (96 files, 2761 tests, `05-web-test.log`) · Daemon build: pass (`01-build.log`, empty) · Web build: pass (`04-web-build.log`; the chunk-size warning was already there) · Lint: pass (golangci 0 issues `03-lint.log`, biome clean `06-web-lint.log`). All read from $GATES_LOG_DIR (`gates-c2`, 0 failed lines). Every other gate line also passed: contrast (`07`), features-inventory (`08`, silent), versions (`09`), e2e-honest (`10`, silent), kb check (`11`, 607 records, 0 problems), e2e-lint (`12`), features-scope (`13`), comments (`14`) and comment-ledger (`15`). The `16-size.log` WARN lines (features/reader.ts 698, render/reader.ts 559) are review-maintainability's.

## Acceptance Checks

| ID | Command | Result |
|----|---------|--------|
| W1 | `make web-test` | pass (deduped to `05-web-test.log`: 96 files, 2761 tests) |
| W4 | `make web-build` | pass (deduped to `04-web-build.log`) |
| W5 | `make web-lint` | pass (deduped to `06-web-lint.log`) |
| E1 | `make e2e` | pass (deduped to `17-e2e.log`: 944 passed, which matches the 944 the spec agent collected) |
| C1 | `make check` | pass (`18-C1.log`: lint 0 issues, `go test` all ok, contrast, e2e-lint, versions, kb check green) |
| DOC | doc upkeep + Doc Delta vs what shipped | FAIL. The cycle 1 items are closed: `design-system.md` § 1 has the `--find-match`/`--find-current` row, and its claims are true (background only, ≥ 4.5:1 on `--fg`). The three proposed ADRs now name `render/readerfind.ts`/`features/readerfind.ts` and `reader-search.spec.ts`. The logs have no `deviation:` line. Both plan Doc Delta sentences hold against the code. What fails: the fix wave added a `doc-delta:` line (`web-implementation.md:112`) that the plan's `## Doc Delta` does not reflect (Major 1) |

## Reviewer-Verified Criteria

| ID | Criterion | Result | Evidence |
|----|-----------|--------|----------|
| W6 | no `any` types in new web code | pass | `git diff main...HEAD -- web/src`, added lines, `grep -E '\bany\b'`: no hits |
| W7 | body never mutated by search | pass | Same diff, `grep -E 'innerHTML\|splitText\|<mark\|outerHTML\|insertAdjacentHTML'`: no hits. The fix wave's body changes write only `scrollLeft`/`scrollTop` (`render/readerfind.ts:127,139`) and CSS padding through `:has()`. Neither is a DOM write. E9 still passes |
| W8 | highlight/bar colours in all three themes | pass (tokens + gate) | Token values are unchanged since cycle 1. Their only literals are in the three theme blocks (`style.css:78-79,128-129,178-179`). `make contrast` 54 pairs, 0 failures ×3. The on-screen read is review-browser's |
| W9 | Cmd+F is a binding-table row | pass | `shortcuts.ts` `KeyF`/meta-only row is unchanged. `features/readerfind.ts:158` dispatches only on `matchShortcut(event)?.type === "find"` |

## Hard-Rule Checklist

| # | Rule | Result |
|---|------|--------|
| 1 | Adapter boundary | pass (web-only diff. Added lines contain no `hook_event_name`, `rate_limits`, `permission_mode` or `session_id`) |
| 2 | Terminal-output state parsing | pass (no `capture-pane`, no pane text) |
| 3 | Blocking hook handler | pass (no daemon change) |
| 4 | Bare tmux | pass (no tmux invocation. The one added-line hit is a spec comment) |
| 5 | Payload logging | pass (no logging added) |
| 6 | Empty-gauge dishonesty | pass (no gauge. With no document the icon is `hidden`, and the count is empty only for an empty searched query) |
| 7 | Session identity on `session_id` | pass (find state is per `ReaderInstance`) |
| 8 | Settings trespass | pass |
| 9 | Real `claude` outside canary/probes | pass (specs still use synthesized hooks, with the shapes unchanged) |

## Issues

### Critical

None.

### Major

1. **[orchestrator]** An unreflected `doc-delta:` line from the fix wave. `web-implementation.md:112` says `docs/features/reader/spec.md` should say three things:
   - while open, the find bar reserves the top of the reading area, and matches are revealed against its bottom edge;
   - stepping scrolls every horizontal scroll container (code block, table, diagram) as well as the body;
   - after a diagram pass, a user-initiated open reveals the first match again.

   The same log's "user-visible additions" also names the typing pause: 120 ms, up to 800 ms in very large documents. The plan's `## Doc Delta` still carries only the cycle 1 reader and shortcuts sentences, and doc-reconcile promotes the delta verbatim. Amend the reader delta to carry what the spec should say. Or record that these are below the spec's level of detail, so the line is answered rather than silently dropped. All three claims are true of the code: `style.css:1578-1584`, `render/readerfind.ts:142-150`, `features/readerfind.ts:111-128`.

### Minor

None.

### Notes

1. **[note]** Cycle 1 correctness issues re-checked against `de29db88..HEAD`:
   - Major 1 (design tokens): fixed. `388806c8` added the design-system row.
   - Minor 1 (REQ-12 diagram reveal): fixed in `194a303e` by `fileOpened`/`diagramsSettled`. The new late-diagram E2E test guards it.
   - Minor 2 (Owns lists): fixed in `194a303e`. `reader/CLAUDE.md` and `render/CLAUDE.md` now name `find.ts` and `readerfind.ts`.
   - Minor 3 (ADR `files`/`tests`): fixed in `388806c8`. `kb for web/src/features/readerfind.ts` now surfaces all three ADRs.

   Each fix changes nothing beyond what its issue asked.
2. **[note]** Stale comment, still present: `web/src/features/shortcuts.ts:3-4` says "This is the one `window` keydown listener for every bound chord". ⌘F is a bound chord, but each reader root dispatches it and this listener ignores it. The branch did not add the comment, so neither comment pass touched it.
3. **[note]** REQ-7 says typing updates matches, highlights and count "live". The fix wave, answering browser Minor 1, which offered "debounce the re-run" as a fix, makes that a trailing pause: 120 ms normally, up to 800 ms only when a single run costs over 400 ms. The impl log names it as user-visible, and I read it as still meeting "live". It is listed so doc-reconcile and the developer see it (Major 1).
4. **[note]** A narrow ordering case in `features/readerfind.ts:119-128`, recorded only.
   - A user-initiated open arms `revealAfterDiagrams`. If a silent re-fetch of the same file lands before that open's diagram pass settles (a `docChanged` at `features/reader.ts:404`), the re-fetch neither arms nor disarms. Its own settled pass is the first to pass the `seq` guard, so it runs `first` and scrolls.
   - That fulfils the open's still-owed reveal rather than breaking REQ-11. The user has not typed or stepped, so nothing they chose is lost. No change requested.
5. **[note]** For review-browser: while the bar is open, `.reader:has(.find-bar:not([hidden])) .md` raises the body's top padding from 22 px to 44 px (10 px to 38 px compact) (`style.css:1578-1584`). Opening or closing the bar with the body scrolled mid-document therefore shifts the visible text by 22 px (28 px compact), with `scrollTop` unchanged. That is what browser Major 1's suggested fix asked for. Whether the jump reads acceptably is an observed question.
6. **[note]** Test honesty: the Repairs (fix attempt 1) rows hold.
   - `expectCurrentMatchInView` was strengthened, not weakened. It still checks top and bottom, now against the body's client box, and adds the x axis per scroll container, bar overlap and `elementFromPoint`. The spec log reports both new oracles red-proven against the defects.
   - The three stale-count spots each gained a query-specific `expectHighlightedText` poll, and no assertion was removed (`git diff de29db88..HEAD -- web/e2e` is additions only, apart from the old helper body it replaces).
   - Fixture shape is `daemon` per the plan header. No flake was repaired, so no soak was due from me. The spec agent soaked 360/360 anyway.

## Browser review

# Browser review: Docs Search Bar

**Plan**: docs-search-bar
**Part verdict**: needs-changes
**Cycle**: 2
**Pack**: kb: pack 6758 words (budget 30000)
**Rig**: `bin/musterd` built at e852f381 (`make web-build build`, dashboard embedded). Each test got its own scratch daemon from `helpers/fixtures.ts`: data dir `$TMPDIR/muster e2e-XXXX` (the path has a space), a private `-tmux-socket` inside it, and the shared E2E stub `claude`. I drove it with a throwaway Playwright spec in headless Chromium at 1440×900 (pop-out 1280×720), in the foreground: 10 tests, all ran to completion. Afterwards I deleted the spec and `test-results/`. Teardown removed the sockets and data dirs, no `musterd` of mine is left running, and `git status` shows nothing of mine.

Gates log (cycle 2): all 18 lines are green, including `e2e` (944 passed) and `web-build`. The app I drove is the one that ships.

## Matrix

Coordinates are viewport px as `l,t,r,b`. "body" is `article.md`. "placement ok" is my own oracle, run on the current match after every step. The match's rect must sit inside the body's client box. It must sit inside the visible x range of every horizontally scrolling ancestor. It must not overlap the open bar's box. And `elementFromPoint` at its centre must land inside the body, not on `.find`. "gap" is the target edge (the nav's left border, or the reader's right edge) minus the element's right edge.

| Req | Host | State | Claim | Result | Evidence |
|-----|------|-------|-------|--------|----------|
| REQ-1 | focus | no data | no icon; ⌘F not intercepted | pass | placeholder `nothing open — pick a file`; icon `hidden` + `display:none`; ⌘F in the body `defaultPrevented:false`, no bar |
| REQ-1 | tile 2×2 / 3×2 | no data | no icon | pass | icon `hidden`, `display:none`, same placeholder |
| REQ-1 | pop-out | no data | no icon | N/A: a pop-out opens on a file; cycle 1 measured the missing-file notice (icon `display:none`), and nothing on that path changed | |
| REQ-1 | focus | data | icon visible | pass | `flex/visible/1`, box 1155,133,1184,158 |
| REQ-1 | pop-out | data | icon visible | pass | `flex/visible/1`, box 995,35,1024,60 |
| REQ-1 | tile 2×2 / 3×2 / 3×2 nav open | data | icon visible | pass | `flex/visible/1`, boxes 482,153,511,178 / 432,153,461,178 / 242,153,271,178 |
| REQ-1/2 | focus | data, nav open | icon and bar in corner | pass | body 300,127,1204,900; docbar bottom 127; icon gap 20; bar 917,133,1184,163, gap 20 |
| REQ-1/2 | focus | data, nav collapsed | bar moves to the reader edge, query kept | pass | bar 1153,133,1420,163, gap 20 to 1440; `2 of 3` and value `quokka` kept |
| REQ-1/2 | pop-out | data, nav open / collapsed | bar in corner | pass | 757,35,1024,65 (gap 20 to 1044) / 993,35,1260,65 (gap 20 to 1280); `2 of 3` kept |
| REQ-1/2 | tile 2×2 | data, nav open / collapsed | bar in corner, no overflow | pass | 331,153,511,179 (gap 18 to 529) / 521,153,701,179 (gap 18 to 719); scrollWidth 178 = clientWidth 178 |
| REQ-1/2 | tile 3×2 | data, nav collapsed / open | bar in corner, no overflow | pass | 281,153,461,179 (gap 18 to 479) / 91,153,271,179 inside body 2,149,289,463 (gap 18 to the nav at 289); sw 178 = cw 178 |
| REQ-1 | focus / pop-out / tiles | data | bar stays put while the body scrolls | pass | midway.md (sh 4097 > ch 773 Focus; 4097 > 691 pop-out; 5076 > 314 tiles), scrollTop 1500 to the end: bar box identical (Focus 897,133; pop-out 737,35; tiles 306,153 / 256,153) |
| REQ-3 | all five hosts | data | click opens the bar, focuses the box, hides the icon | pass | `activeElement === .find-query`; icon `display:none`; the same tagged node is still focused after 1.2 s, and again after typing plus 1.2 s |
| REQ-4 | all hosts | data | `quokka` counts body only | pass | `1 of 3`, 3 ranges; an independent text-node oracle counts 3 (frontmatter cell, paragraph, code) |
| REQ-4 / Edge-7 | focus | data | diagram label match is in the SVG | pass (settled) | late-diagram.md opened with the bar open: `1 of 3`, current `inSvg:true`, placement ok at 725,733 |
| REQ-5 / INV-1 | all hosts | data | body DOM unchanged | pass | innerHTML identical (416 chars) before opening and after typing, stepping and Escape |
| REQ-5 | focus / tile | data | current match drawn more strongly | pass | screenshots in Light (Focus) and Instrument (tile): current has a stronger fill and an underline; SVG label highlighted |
| REQ-6 | all hosts | data | empty query gives an empty count; a miss gives `no matches` | pass | `""` with 0/0 ranges; `no matches` with 0/0 |
| REQ-7 | all hosts | data | typing then an immediate Enter lands on ordinal 2 | pass | `2 of 3` (the debounce flushes on a step) |
| REQ-8 | all hosts | data | Enter/Shift+Enter, Next/Previous (pointer) wrap | pass | E,E,E,S-E,next,prev,prev gives `2,3,1,3,1,3,2 of 3` in all five hosts |
| REQ-8 (cycle 1 Major 1) | focus / pop-out / tile 2×2 / 3×2 / 3×2 nav open | data | each of 40 `heron` heading matches readable | pass | crowd.md, 41 steps (full wrap), 0 bad placements in every host |
| REQ-8 (cycle 1 Major 1) | all hosts | data | frontmatter-cell match at the top readable | pass | frontline.md, 3 steps, 0 bad |
| REQ-8 (cycle 1 Major 2) | all hosts | data | code-line and wide-table match revealed sideways | pass | wide.md `far`, 4 steps (`codefar`, `tablefar`, wrap), 0 bad |
| REQ-8 | all hosts but 3×2 nav open | data | match at the far right of a wide mermaid LR diagram revealed | pass | widediag.md `Farlabel`: figure sw 3240 > cw 838/978/497/447, scrollLeft 2402/2262/2743/2793, placement ok |
| REQ-8 | all hosts but 3×2 nav open | data | 17 mid-document matches revealed below the bar | pass | midway.md `pelican`, 18 steps, 0 bad |
| REQ-3 | focus / pop-out / tiles | data, scrolled | opening the bar keeps the reading position | **FAIL** | midway.md at scrollTop 1500: the paragraph under the eye moves y 220 → 242 (Focus), 121 → 143 (pop-out), 230 → 258 (both tile densities) with scrollTop unchanged. Closing moves it back (Minor 1) |
| REQ-9 | all hosts | data | Escape closes, clears highlights, shows the icon, focus on body | pass | bar `display:none`; icon `flex`; `activeElement === body`; 0/0 ranges; padding back to 22px (10px compact) |
| REQ-9 | all hosts | data | Close search (pointer) | pass | focus on body, icon back, 0/0 ranges |
| REQ-10 | all hosts | data | ⌘F in the body opens the bar; again selects the query | pass | both keydowns `defaultPrevented:true`; box focused, selection 0–6 of `quokka` |
| REQ-10 | pop-out | data | dashboard page not affected | pass | the dashboard's key log is `[]` |
| REQ-10 | focus | data | ⌘F on a rail card not intercepted | pass | activeElement `ARTICLE.card`, `defaultPrevented:false`, no bar |
| REQ-10 | all | data | a real Chrome lets the page prevent ⌘F | not measured | Note 1 |
| INV-5 | tile 2×2 / 3×2 | data | tile B's search leaves tile A alone | pass | A `2 of 3`, 3/1 ranges, padding 38px before, during and after B's ⌘F, `alpha`, Enter×2 (`3 of 3`) and Escape; B's padding back to 10px; one ⌘F logged, prevented |
| REQ-11 | focus | data | docChanged keeps the ordinal, no scroll; clamps | pass | `2 of 3` at scrollTop 1913 → `2 of 3` at 1913, box still focused; a rewrite to one match gives `1 of 1` at 1913 |
| REQ-11 / Edge-10 | focus | data | theme change re-applies over the new SVG | pass | Light: `1 of 3`, 3 ranges, current `inSvg:true`, placement ok |
| REQ-12 | focus | data | file switch keeps the query, `1 of n`, scrolled | pass | `needle` into deep.md: `1 of 2`, scrollTop 2489, placement ok |
| REQ-12 | pop-out / tiles | data | file switch | pass | every fixture after the first was opened with the bar open in each host (frontline → `1 of 2` at once); placement ok |
| REQ-13 | focus / tile | data | tokens and highlight legible | pass | screenshots in Light and Instrument; no native clear glyph inside the box; `contrast` gate 54 pairs × 3, 0 failures |
| Edge-16 | focus | data | match inside `<details>` | N/A: cycle 1 found the sanitized body renders `<details>` content as a plain paragraph; nothing collapsed to test | |
| Edge-17 | focus | data | typing stays responsive | pass | 34 KB/600 matches: keys 3–8 ms, count 85 ms after the last key, 0 long tasks. 459 KB/10 000: keys 9–20 ms, 0 long tasks. 2.1 MB/10: keys 29–38 ms, one 56 ms task. 2.2 MB/80 000: keys 24–37 ms, then four tasks of ~575 ms after the pause (stepping cost: Note 3) |
| §6 daemon-down | focus | daemon-down | shown prominently | pass | banner `musterd unreachable — hook output…` at 0,46,1440,78, `block/visible/1`; the bar moves down with the layout (917,187) and stays inside the body (top 181) |
| §6 daemon-down | tile 2×2 / 3×2 | daemon-down | shown prominently | pass | same banner; bar 331,207 / 281,207 inside body top 203; sw 178 = cw 178 |
| §6 daemon-down | pop-out | daemon-down | shown | pass | `.reader-notice` `musterd unreachable — showing last render` at 0,29,1280,51 |
| States | all hosts | daemon-down | search keeps working | pass | after SIGTERM: Enter stepped (`2 of 3` Focus, `3 of 3` tiles); ⌘F reopened the bar in Focus and the pop-out and typed a new query to `1 of 1` / `1 of 3`; placement ok |
| §6 other | all | all | unknown / percentage / permission / Done / cost | N/A: the find bar shows none of these | |
| §7 terminal | all | all | one client, geometry, scrollback, pane styling | N/A: only the docs surface is touched | |

## Issues

### Critical

(none)

### Major

(none)

Cycle 1's Major 1 (the bar covered first-line matches in tiles) and Major 2 (no horizontal reveal) are fixed. My oracle found 0 bad placements in 41 crowd, 3 frontline, 4 wide, 1 wide-diagram and 18 mid-document steps, in every host. Cycle 1's Minor 1 (typing) and Minor 3 (the native clear button) are fixed too.

### Minor

1. **[web-impl]** Opening or closing the bar while the body is scrolled makes the text jump. The cycle 1 fix adds `padding-top` to `.md` while the bar is open (`web/src/style.css`, the `.reader:has(.find-bar:not([hidden])) .md` rules), and it leaves `scrollTop` alone. Measured on midway.md at scrollTop 1500: the paragraph under the eye moves down 22 px in Focus (y 220 → 242) and in the pop-out (121 → 143), and 28 px in both tile densities (230 → 258). Closing moves it back up by the same amount. The bar only needs the space at the top of the document, but the whole page of text shifts wherever the reader is. A fix must keep the body's content at the same viewport position across open and close at any scrollTop, while still keeping the first line clear of the bar at scrollTop 0. One way is to adjust `scrollTop` by the padding change in the same frame.

### Notes

1. **[note]** I could not measure REQ-10's claim that the browser's own find does not open. Headless Chromium has no find UI, and CDP key events bypass Chrome's browser-level accelerators, so `defaultPrevented:true` (measured in every host) is the strongest evidence available here. The developer can confirm it on a real keyboard: press ⌘F in a reader body in Chrome and check that Chrome's find bar stays closed.
2. **[note]** With the body scrolled, the bar overlays whatever line runs under the top-right corner (screenshot: `…adipiscing elit s[bar]` on paragraph 21). That follows from the plan's overlay design. A current match is never left under it: every reveal measured ok.
3. **[note]** Stepping cost grows with the number of matches, because every step re-paints every match range (`paintFind` deletes and re-adds the whole match set, `web/src/render/readerfind.ts`). Measured: 18 ms per step at 600 matches, 103 ms at 10 000, 1763 ms at 80 000 (2.2 MB, three ~570 ms long tasks). Escape at 80 000 takes 2009 ms. The plan sets no performance budget, and 80 000 hits is a pathological query, so this is not a defect. If it ever matters, the fix is to swap only the current highlight on a step.
4. **[note]** In a 2.1 MB document with 10 matches, the count settles 1.7 s after the last key. The main thread is not blocked during that time (one 56 ms task); this is the debounce scaling with the last run's cost. The count never showed a stale value.
5. **[note]** One cell is new this cycle: 3×2 with the nav open, a host INV-3 does not list. Icon, bar, quokka steps, 41 crowd steps and the wide steps all pass there.

## Maintainability review

# Maintainability review: Docs Search Bar

**Plan**: docs-search-bar
**Part verdict**: needs-changes
**Cycle**: 2
**Pack**: kb: pack 10755 words (budget 30000)
**Scope**: 10 files from `git diff main...HEAD -- cmd internal web/src ':!*_test.go' ':!*.test.ts'` (web only; no Go touched). Full review: the spawn prompt did not name a delta cycle. Cycle 1's five Minors were re-checked as part of it (see `## Cycle 1 Minors`).

## Files

| File | Siblings opened | design: line | Size warnings | Result |
|------|-----------------|--------------|---------------|--------|
| web/src/reader/find.ts | slug.ts, zoom.ts, tree.ts, reader/CLAUDE.md | yes | none | pass |
| web/src/render/readerfind.ts | reader.ts, diagramdialog.ts, diagrams.ts, frontmatter.ts, render/CLAUDE.md | yes (+ fix-attempt-2 clearance line) | none | pass (Note 1) |
| web/src/render/reader.ts | diagramdialog.ts, frontmatter.ts, readerfind.ts | yes (wiring only) | filelen 559 (main 544), reason holds | pass (Note 3) |
| web/src/features/readerfind.ts | launchgroup.ts, launchresume.ts, groupsselect.ts, groupsdialogs.ts, usage.ts (timer), features/CLAUDE.md | yes (fix-attempt-2 shape + debounce lines) | none | Minor 1 |
| web/src/features/reader.ts | launch.ts, groups.ts (owners of sub-controllers) | yes (wiring only) | filelen 698 (main 674), reason holds | Minor 2 |
| web/src/shortcuts.ts | features/shortcuts.ts (its dispatcher) | yes (dispatch from reader) | none | pass (Note 4) |
| web/src/style.css | `.arr`, `.rnav .filter`, `.md`, `:has(...)` rules in the same file | yes (`fbtn`, clearance) | n/a (contrast-gate file) | pass (Note 2) |
| web/src/features/CLAUDE.md | render/CLAUDE.md, reader/CLAUDE.md | n/a | none | pass |
| web/src/reader/CLAUDE.md | features/CLAUDE.md, render/CLAUDE.md | n/a | none | pass |
| web/src/render/CLAUDE.md | features/CLAUDE.md, reader/CLAUDE.md | n/a | none | pass |

Duplicate searches run from `web/src`, all with `--glob '!*.test.ts'`. Cycle 1's searches were re-run, and new ones were added for the helpers this cycle introduced (`scrollsHorizontally`, `revealHorizontally`, `revealVertically`, the typing debounce):

```
$ rg -n "scrollLeft|overflowX|overflow-x|getComputedStyle|scrollWidth" .
./render/readerfind.ts:116-127        (new: per-ancestor horizontal reveal)
./render/crumbs.ts:55                 nav.scrollLeft = nav.scrollWidth;   (pin to end, not reveal a rect)
./render/mainhead.ts:97,110           (measures rename overflow, no scrolling)
./terminal/pane.ts:30, render/mermaid.ts:32   (read a CSS custom property)
$ rg -n "scrollTop|scrollIntoView" render features reader
render/readerfind.ts:139              (reveal a range below the bar, centred)
render/reader.ts:558                  scrollHeadingIntoView: container.scrollTop += delta;  (align heading top; different rule)
$ rg -n "setTimeout|clearTimeout|debounce" .
features/usage.ts:49-75, terminal/pane.ts:75-367, render/grouppopover.ts:78-102, features/readerfind.ts:52-116
  -> every timer in the tree is a bare `ReturnType<typeof setTimeout> | null` + clearTimeout; no shared debounce helper exists
$ rg -n "performance\.now" .           -> only features/readerfind.ts:81,86
$ rg -n "\+ (count|n|len|length)\) %|function clamp|Math\.max\(0, Math\.min" .
./reader/find.ts:57,60-61   ./reader/zoom.ts:28 clampZoom   (unchanged from cycle 1: the menu.ts/launch.ts wraps are inline)
$ rg -n "createTreeWalker|CSS\.highlights|new Highlight" .   -> only render/readerfind.ts
```

None of the new helpers duplicates an existing one. `scrollHeadingIntoView` aligns a heading's top with the container and handles no horizontal scrolling. The range reveal centres a range below the bar on both axes. These are two different rules, not two copies of one. The debounce follows the bare-timer shape that `usage.ts` and `pane.ts` already use.

## Cycle 1 Minors

| Cycle 1 Minor | Fix commit | Verified how |
|---------------|-----------|--------------|
| 1: `createReaderFind` shaped unlike its siblings | 194a303e | `features/readerfind.ts:17-44` is now `initReaderFind(elements: ReaderFindElements, deps: ReaderFindDeps): ReaderFindHandle`. That matches `initGroupsSelect`/`initGroupsDialogs`, which take Elements + Deps and return a Handle. `rg ReaderRefs web/src/features/readerfind.ts` finds nothing. The dialog check is the structural dep `diagramOpen()`. **Closed**, except that the handle grew a method nobody calls (Minor 1 below). |
| 2: find wiring in `render/reader.ts` | 194a303e | `wireFind(find, callbacks)` now sits in `render/readerfind.ts:46-52`, and `buildReader` calls it in one line (`render/reader.ts:192`), the same way it calls `wireDiagramDialog`. **Closed.** The root keydown listener stayed behind (Note 3). |
| 3: shared `CSS.highlights` registry not named where declared | 194a303e added the comment; e852f381 (comment pass cycle 2) dropped it | `render/readerfind.ts:4-5` has no comment again. `comment-pass.json` cycle 2 shows a single candidate, this one, with verdict drop. The comment pass owns comments, so this is not re-filed (Note 1). |
| 4: `renderFindBar` split the `aria-busy` comment from its code | 194a303e | `render/reader.ts:494` is now the last line of `renderReader`, after the `aria-busy` lines. **Closed.** The same split exists in `features/reader.ts` (Minor 2 below). I missed it in cycle 1. |
| 5: `.find-query` copied `.rnav .filter`'s look | 194a303e | `style.css:1677-1685` is one `.rnav .filter, .find-query` rule holding border, radius, padding, background, colour and font family. Each selector keeps only its own size and margins. **Closed.** |

## Issues

### Critical

None.

### Major

None.

### Minor

1. **[web-impl]** `ReaderFindHandle.refresh` (`web/src/features/readerfind.ts:34`, returned at `:175`) and the exported `RefreshMode` type (`:15`) have no caller outside the module. Cycle 1's fix moved both open-time callers to `fileOpened` and `diagramsSettled` but left `refresh` on the handle:
   ```
   $ rg -n "RefreshMode|\.refresh\(" web/src web/e2e --glob '!*.test.ts'
   src/features/readerfind.ts:15:export type RefreshMode = "first" | "keep";
   src/features/readerfind.ts:34:  refresh(mode: RefreshMode): void;
   src/features/readerfind.ts:79:  function refresh(mode: RefreshMode): void {
   ```
   `features/reader.ts` calls only `open`, `close`, `setQuery`, `step`, `handleKeydown`, `fileOpened`, `diagramsSettled`, `view` and `dispose` (lines 180-184, 222, 334, 447, 551). The sibling handles expose only what their owner calls. For example, all four `LaunchGroupHandle` methods (`reset`, `sync`, `place`, `request`) are called from `launch.ts:385,519,593,739`. `features/CLAUDE.md` § Gotchas also says "`init` returns a handle only when a caller uses it". A newcomer who sees `refresh` on the public handle would assume a caller exists and pick a mode for it, which bypasses the reveal-after-diagrams rule that `fileOpened`/`diagramsSettled` now own. A fix must leave the handle with only the methods `features/reader.ts` calls. `refresh` stays an inner function, and `RefreshMode` stays unexported unless something outside the module needs it.

2. **[web-impl]** `this.find.fileOpened(opts.showLoading);` at `web/src/features/reader.ts:334` sits between the four-line comment at `:330-333` and the `renderDiagrams` call it describes (`:335`). This is the same split cycle 1 Minor 4 fixed in `render/reader.ts`. The comment was on `main` before this branch (`git show main:web/src/features/reader.ts`, lines 314-318, directly above `this.diagramPass = renderDiagrams(...)`). It now reads as if it describes the find call: "Runs after the fragment is in the DOM … a no-op for a document with no mermaid fence. Never awaited here". But `fileOpened` is not a no-op without a fence. A fix must place the find call so the comment once again sits directly above the diagram pass it explains.

### Notes

1. **[note]** The `CSS.highlights` entries `find-match`/`find-current` (`web/src/render/readerfind.ts:4-5`) are document-wide state. The focus reader and every tile reader write them. Conventions § Design says "Shared state names its writers and its guard … says so where it is declared." Cycle 1's fix added a two-line comment saying exactly that. The comment pass (e852f381, `comment-pass.json` cycle 2: 1 candidate, 0 kept) dropped it. The code is still race-free: each `ReaderInstance` hands `paintFind` only the paint it made last, so one reader's repaint never deletes another reader's ranges. I found no breaking interleaving. Per kb:adr/process-comment-pass-owns-code-comments, review files no finding on a comment. The orchestrator may want to know that the comment judge and § Design's "says so where it is declared" disagreed on this line. The only remaining statement of the rule is the Decisions log (INV-5).
2. **[note]** The bar clearance has two owners that must agree. `style.css:1578-1584` reserves `padding-top: 44px` (38px compact) while the bar is open. Those numbers stand for the bar's measured height (36/30) plus a margin. That height comes from `.find`'s margin, `.find-bar`'s padding and border, the font sizes and `.fbtn`'s padding, so restyling the bar silently brings back the cover bug. The JS side (`revealVertically`) measures the bar live, so only the CSS side is hard-coded. The design line names the split, and the placement oracle added in b0189d7d guards it. No change requested.
3. **[note]** `render/reader.ts:193` (`root.addEventListener("keydown", callbacks.onKeydown)`) is the one piece of find wiring still in `buildReader`, under the generic name `ReaderCallbacks.onKeydown` (`:108`). Its only consumer is `find.handleKeydown`. It needs the reader root, which `wireFind` is not handed. This repeats cycle 1 Note 5. No change requested.
4. **[note]** For review-work (doc truth): the header comment of `web/src/features/shortcuts.ts:3-4` still says it is "the one `window` keydown listener for every bound chord". ⌘F is now bound in `shortcuts.ts` but dispatched from the reader root, and line 67's `default:` drops it. The impl log carries this as a `doc-delta:` line.
5. **[note]** The component diagram already shows this branch: `kb:diagram/web-components` lists `readerfind` among the five sub-controllers and labels the `render → reader` edge "tree types, find matcher". No DIAG row is needed from this side.
6. **[note]** Size warnings: `features/reader.ts` is 698 lines (674 on main) and `render/reader.ts` is 559 (544 on main). Both were over 500 before the branch. Decisions gives a reason in both log sections: the find logic went into three new modules, and the two big files gained only wiring. The diffs bear that out. `features/reader.ts` gained 24 lines of callbacks, the handle field, `dispose`, the two `diagramsSettled` hooks and `refindAfterDiagrams`. `render/reader.ts` gained imports, a VM field, the refs field and three one-line calls. The reason holds.
