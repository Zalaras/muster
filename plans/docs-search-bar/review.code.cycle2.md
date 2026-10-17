# Correctness review: Docs Search Bar

**Plan**: docs-search-bar
**Verdict**: approved
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
