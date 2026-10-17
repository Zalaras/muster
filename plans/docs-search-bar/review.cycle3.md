# Review: docs-search-bar

**Plan**: docs-search-bar
**Verdict**: needs-changes
**Cycle**: 3
**Gates**: 0 failed
**Parts**: code, browser, maintainability
**Part verdicts**: code needs-changes, browser needs-changes, maintainability approved

_Merged by orch-state.py merge-review; the verdict is computed from the parts and the gate run, never edited by hand._

## Correctness review

# Correctness review: Docs Search Bar

**Plan**: docs-search-bar
**Part verdict**: needs-changes
**Cycle**: 3
**Pack**: kb: pack 16530 words (budget 30000)

This is a delta cycle: cycle 2's only open agent-tagged issues were Minors. I read `git diff d723bb70..HEAD` (commits `57c9d4fd`, `0fd42e23`, `8a0275aa`) and checked each cycle 2 Minor against it. The diff touches non-test files only inside those Minors' stated scope:
- `render/readerfind.ts` and the one-argument change in `render/reader.ts` are browser Minor 1.
- `features/readerfind.ts` is maintainability Minor 1.
- `features/reader.ts` is maintainability Minor 2.

So I did not re-read §3–§6 in full. Requirement rows the diff does not touch carry over from cycle 2.

## Requirements

| Req | Implemented | Tested | Status |
|-----|-------------|--------|--------|
| REQ-1 – REQ-6 | Unchanged since cycle 2. The diff does not touch the icon, placement, matcher, highlight or count paths | as cycle 2 | pass |
| REQ-7 | Yes. While the bar is open it still reserves the top: the `:has()` padding rule is unchanged (`style.css:1578-1584`). The new scroll compensation (`render/readerfind.ts:58-66`) runs only when `bar.hidden` flips and `scrollTop > 0`, so at scrollTop 0 the first line is still pushed clear (E10 still green). The fix is partial; see Minor 1 | E10, plus 4 new "scrolled text stays put" tests | pass (requirement); browser Minor 1 fix partial |
| REQ-8 – REQ-10 | Unchanged since cycle 2 | as cycle 2 | pass |
| REQ-11 / REQ-12 | Yes. `fileOpened(opts.showLoading)` now runs after `renderDiagrams(...)` is started (`features/reader.ts:334-340`). The order does not change behaviour: `renderDiagrams` (`render/diagrams.ts:66-90`) touches `body` only after its first `await`, so `fileOpened`'s synchronous refresh still reads the pre-diagram body, as before. The late-diagram E2E is still green | E11, E12, late-diagram test | pass |
| REQ-13 | Unchanged | token test, `make contrast` | pass |
| DIAG | `kb:diagram/web-components`. The diff adds no module, import or edge. `renderFindBar` gains a `body` parameter, which is below the diagram's level | — | pass |

## Build & Tests

All read from `$GATES_LOG_DIR` (`gates-c3`, 0 failed lines):
- E2E tests: pass. 948 passed (`17-e2e.log`), which is cycle 2's 944 plus the 4 new tests.
- Daemon tests (race): pass. Every package `ok`, 0 FAIL (`02-test.log`).
- Web tests: pass. 96 files, 2761 tests (`05-web-test.log`).
- Daemon build: pass (`01-build.log`, empty).
- Web build: pass (`04-web-build.log`). The chunk-size warning was already there before this plan.
- Lint: pass. golangci-lint 0 issues (`03-lint.log`), biome clean (`06-web-lint.log`).

The other gate lines are green too: contrast `07` (54 pairs, 0 failures ×3), features-inventory `08` (silent), versions `09`, e2e-honest `10` (silent), kb check `11` (607 records, 0 problems), e2e-lint `12`, features-scope `13`, comments `14` and comment-ledger `15`. The `16-size.log` WARN lines (features/reader.ts 698, render/reader.ts 559, unchanged) are review-maintainability's.

## Acceptance Checks

| ID | Command | Result |
|----|---------|--------|
| W1 | `make web-test` | pass (deduped to `05-web-test.log`: 96 files, 2761 tests) |
| W4 | `make web-build` | pass (deduped to `04-web-build.log`) |
| W5 | `make web-lint` | pass (deduped to `06-web-lint.log`) |
| E1 | `make e2e` | pass (deduped to `17-e2e.log`: 948 passed, the 948 the spec agent's `--list` reports) |
| C1 | `make check` | pass (`18-C1.log`: lint 0 issues, `go test` all ok, biome, vitest, contrast, e2e-lint, versions, kb check) |
| DOC | doc upkeep + Doc Delta vs what shipped | pass. Cycle 2 correctness Major 1 is answered: `plans/docs-search-bar/doc-delta.md` (`4e84e739`) carries the Fix Attempt 2 `doc-delta:` line's three claims and records the debounce and clearance values as below spec level. This fix wave adds no `doc-delta:` or `deviation:` line ("user-visible: none new"). The delta sentence "while the bar is open it reserves the top of the reading area, so no match ever sits under it" is still true: the padding rule is unchanged, and compensation only shifts `scrollTop` |

## Reviewer-Verified Criteria

| ID | Criterion | Result | Evidence |
|----|-----------|--------|----------|
| W6 | no `any` types in new web code | pass | Grepped the added lines of `git diff main...HEAD -- web/src` for `\bany\b`: no hits |
| W7 | body never mutated by search | pass | The same added lines have no `innerHTML`, `splitText`, `<mark`, `outerHTML` or `insertAdjacentHTML`. The new code writes only `body.scrollTop` and reads computed `padding-top` |
| W8 | highlight/bar colours in all three themes | pass (tokens + gate) | No token or CSS change this cycle. `make contrast` 54 pairs, 0 failures ×3. The on-screen read is review-browser's |
| W9 | Cmd+F is a binding-table row | pass | `shortcuts.ts` is untouched this cycle |

## Hard-Rule Checklist

| # | Rule | Result |
|---|------|--------|
| 1 | Adapter boundary | pass (web-only diff. The added lines contain no `hook_event_name`, `rate_limits`, `permission_mode` or `session_id`) |
| 2 | Terminal-output state parsing | pass |
| 3 | Blocking hook handler | pass (no daemon change) |
| 4 | Bare tmux | pass (no tmux in the diff) |
| 5 | Payload logging | pass (no logging added) |
| 6 | Empty-gauge dishonesty | pass (no gauge path touched) |
| 7 | Session identity on `session_id` | pass |
| 8 | Settings trespass | pass |
| 9 | Real `claude` outside canary/probes | pass (the new specs use the shared stub fixtures) |

## Delta

| Prior Minor | Fix commit | Verified how |
|-------------|------------|--------------|
| cycle 2 browser Minor 1 `[web-impl]` "A fix must keep the body's content at the same viewport position across open and close at any scrollTop, while still keeping the first line clear of the bar at scrollTop 0" | `57c9d4fd` (+ tests `0fd42e23`) | Diff read. Partly fixed. Mid-document open and close now hold still: 4 new E2E tests, red-proven by the spec agent at +22/+28 px. scrollTop 0 is still cleared (E10). **It does not hold at the bottom of a document on close.** Re-listed as Minor 1 |
| cycle 2 maintainability Minor 1 `[web-impl]` "`ReaderFindHandle.refresh` … and the exported `RefreshMode` type … have no caller outside the module" | `57c9d4fd` | Diff read. `refresh` is gone from the interface and from the returned object. `RefreshMode` is no longer exported and stays an inner type for the closure. Nothing else in the file changed |
| cycle 2 maintainability Minor 2 `[web-impl]` "`this.find.fileOpened(...)` … sits between the four-line comment … and the `renderDiagrams` call it describes" | `57c9d4fd` | Diff read. The call moved below `void this.diagramPass.then(...)`, so the comment sits directly above `renderDiagrams(...)` again. The order does not change behaviour (REQ-11/12 row). It is a one-line move |

## Issues

### Critical

None.

### Major

None.

### Minor

1. **[web-impl]** Browser Minor 1 is only partly fixed. Closing the bar when the body is scrolled to the bottom still moves the text down by the padding change: 22 px by default, 28 px compact.
   - **Where:** `web/src/render/readerfind.ts:62-65`.
   - **Why:** `body.scrollTop += topPadding(body) - before` reads `scrollTop` *after* `refs.bar.hidden` has flipped. On close, the padding shrinks, so the scroll range shrinks by the same amount. When the body was at (or within 22/28 px of) its maximum scroll, layout has already clamped `scrollTop` down by up to that amount. The `+=` then subtracts the padding change a second time.
   - **Measured:** headless Chromium, a model of the same mechanism. The scroll container has `padding-top` 22 → 44 px via `:has(.bar:not([hidden]))`, and an absolutely positioned bar sits in the same parent. Script: `/private/tmp/claude-501/-Users-damian-Documents-code-Projects-muster/f5180b9a-3489-46d8-9a57-15ded1465f83/scratchpad/clampprobe/probe.mjs`, with the same lines as `renderFindBar`'s compensation.
     ```
     mid    rest 130 open 130 scroll/max [ 822, 1744 ] closed 130
     bottom rest 108 open 108 scroll/max [ 1744, 1744 ] closed 130
     ```
     Opening at the bottom is fine, because the range grows. Closing moves the paragraph 108 → 130.
   - **Fix:** capture `scrollTop` before the flip and assign it absolutely: `const top = body.scrollTop; … refs.bar.hidden = barHidden; if (top > 0) body.scrollTop = top + topPadding(body) - before;`. The same probe with that change (`probe-fixed.mjs`, next to the first script) prints `bottom rest 108 open 108 … closed 108`.
   - **How a user hits it:** step to the last match of a long document, then press Escape.
   - **What is unavoidable:** with 0 < scrollTop < the padding change, closing must still move the text by up to the change, since `scrollTop` cannot go negative.

2. **[e2e-specs]** `expectScrolledTextStillAcrossBar` (`web/e2e/reader-search.spec.ts:1640`) only covers a body scrolled mid-document: paragraph 15 is centred. It cannot see Minor 1.
   - **Add:** one case with the body scrolled to its maximum (`scrollTop = scrollHeight`), asserting a visible paragraph's viewport y across open and then Escape.
   - **Proof it works:** it must be red against HEAD, where Minor 1 predicts a +22 px move in Focus on close, and green after Minor 1's fix.

### Notes

1. **[note]** For review-maintainability: `renderFindBar` now takes the body and writes its `scrollTop` from the render layer. The impl log cites `scrollHeadingIntoView` as precedent. Whether that shape fits is yours.
2. **[note]** Still present and out of my scope (a code comment the branch did not add): `web/src/features/shortcuts.ts:3-4` says "the one `window` keydown listener for every bound chord". ⌘F is a bound chord, but each reader root dispatches it. `doc-delta.md` § "Not a doc edit" routes it to the comment pass.
3. **[note]** Test honesty: `test-specs.md` "Repairs (fix attempt 2)" says None, and `git diff d723bb70..HEAD -- web/e2e` is additions only (118 lines, the helper and 4 tests). Fixture shape is `daemon`, as in the plan header. No flake was repaired, so no soak was due from me. The spec agent soaked 400/400.

## Browser review

# Browser review: Docs Search Bar

**Plan**: docs-search-bar
**Part verdict**: needs-changes
**Cycle**: 3
**Pack**: kb: pack 6758 words (budget 30000)
**Rig**: `bin/musterd` built at 8a0275aa (`make web-build build`, dashboard embedded). Each test got its own scratch daemon from `helpers/fixtures.ts`: data dir `$TMPDIR/muster e2e-XXXX` (the path has a space), a private `-tmux-socket` inside it, and the shared E2E stub `claude`. I drove it with a throwaway Playwright spec in headless Chromium at 1440×900 (pop-out 1280×720), in the foreground: 8 tests, all ran to completion. Afterwards I deleted the spec and `test-results/`. Teardown removed the sockets and data dirs, no `musterd` of mine is left running, and `git status` shows nothing of mine.

Gates log (cycle 3): all 18 lines are green, including `e2e` (948 passed) and `web-build`. The app I drove is the one that ships.

## Matrix

Coordinates are viewport px as `l,t,r,b`. "body" is `article.md`. "placement ok" is the committed `readHighlights` oracle, run on the current match after every step. It checks the match is inside the body's client box and every sideways-scrolling ancestor, clear of the open bar, and that `elementFromPoint` at its centre is not covered. "gap" is the target edge (the nav's left border, or the reader's right edge) minus the element's right edge. Δ is the padding the open bar adds to the body: 22 px (Focus, pop-out), 28 px (tiles). For the cycle-3 fix, "moved" is the change in content position (`padding-top − scrollTop`) across a flip, read after a ≥ 1.1 s render tick.

| Req | Host | State | Claim | Result | Evidence |
|-----|------|-------|-------|--------|----------|
| REQ-1 | focus | no data | no icon; ⌘F not intercepted | pass | placeholder `nothing open — pick a file`; icon `hidden`, `display:none`; ⌘F in the body `defaultPrevented:false`, no bar |
| REQ-1 | tile 2×2 | no data | no icon | pass | icon `hidden`, `display:none`, same placeholder |
| REQ-1 | tile 3×2 | no data | no icon | N/A: the same template and render path as 2×2; cycle 2 measured it and nothing on that path changed | |
| REQ-1 | pop-out | no data | no icon | N/A: a pop-out opens on a file. Cycle 1 measured the missing-file notice (icon `display:none`), and nothing on that path changed | |
| REQ-1 | focus | data | icon visible | pass | `flex/visible/1`, box 1155,133,1184,158 |
| REQ-1 | pop-out | data | icon visible | pass | `flex/visible/1`, box 995,35,1024,60 |
| REQ-1 | tile 2×2 / 3×2 / 3×2 nav open | data | icon visible | pass | `flex/visible/1`, boxes 482,153,511,178 / 432,153,461,178 / 242,153,271,178 |
| REQ-1/2 | focus | data, nav open | icon and bar in corner | pass | body 300,127,1204,900; docbar bottom 127; bar 917,133,1184,163, gap 20 to the nav at 1204; sw 265 = cw 265 |
| REQ-1/2 | pop-out | data, nav open | bar in corner | pass | 757,35,1024,65, gap 20 to 1044 |
| REQ-1/2 | tile 2×2 | data, nav open | bar in corner, no overflow | pass | 331,153,511,179 inside body 2,149,529,463 (gap 18); sw 178 = cw 178 |
| REQ-1/2 | tile 3×2 | data, nav collapsed / open | bar in corner, no overflow | pass | 281,153,461,179 (gap 18 to 479) / 91,153,271,179 (gap 18 to the nav at 289); sw 178 = cw 178 |
| REQ-2 | all hosts | data | nav toggle moves the bar, query kept | N/A: no code on that path changed since cycle 2, which measured all five hosts (pass) | |
| REQ-3 | all five hosts | data | click opens the bar, focuses the box, hides the icon | pass | `activeElement` is the query box; icon `hidden`, `display:none`; the same tagged node is still focused after 1.2 s |
| REQ-4 | all five hosts | data | `quokka` counts body only | pass | `1 of 3`, 3 ranges in all-matches, 1 current, placement ok |
| REQ-5 / INV-1 | all five hosts | data | body DOM unchanged | pass | `innerHTML` identical before opening and after typing, stepping and Escape |
| REQ-8 | all five hosts | data | Enter / Shift+Enter, Next / Previous (pointer) wrap | pass | E,E,E,S-E,next,prev,prev gives `2,3,1,3,1,3,2 of 3` in every host |
| REQ-8 | all five hosts | data | each `needle` step on tall.md is readable | pass | 4 steps (full wrap) from mid-document, placement `ok` every time |
| REQ-3 (cycle 2 Minor 1) | all five hosts | data, scrolled mid | opening and closing keep the text still | pass | Focus st 1916 → 1938 → 1916; pop-out 1957 → 1979 → 1957; tiles 2247 → 2275 → 2247 (3×2 nav open 3674 → 3702 → 3674). Moved 0 on open and on close, by click and by ⌘F |
| REQ-3 (cycle 2 Minor 1) | all five hosts | data, scrollTop 5 | open/close keep the text still | pass | st 5 → 27 (tiles 33) → 5; moved 0 |
| REQ-3 (cycle 2 Minor 1) | all five hosts | data, at the end of the body | open/close keep the text still | **FAIL** | Focus: st 3832 (max 3832) → open 3854 (max 3854) → close **3810** (max 3832). Moved 0 on open, **22 px down on close**, and the body is left 22 px short of its end. Pop-out 3914 → 3936 → 3892 (22). Tiles 4494 → 4522 → 4466 (28; 3×2 nav open 7347 → 7375 → 7319). The same by Escape, the close button and after ⌘F opening (Minor 1) |
| REQ-3 (cycle 2 Minor 1) | all five hosts | data, 10 px from the end | open/close keep the text still | **FAIL** | Focus st 3822 → 3844 → 3810: moved 12 px on close; tiles 4484 → 4512 → 4466: 18 px (Minor 1) |
| REQ-3 | all five hosts | data, at the end | repeated open/close drift | pass (bounded) | 5 open/close cycles at the end leave st at max − Δ (3810 Focus, 4466 tiles). The error is one Δ and does not accumulate |
| REQ-1 | all five hosts | data, scrollTop 0 | first line clear of the open bar | pass | Focus first element top 171 > bar bottom 163; pop-out 73 > 65; tiles 187 > 179 |
| REQ-7 | focus / tile 3×2 | data, scrollTop 5 | first-line match revealed past the bar | pass | opening at st 5 leaves the h1 at 144–179 under the bar (133–163) (Note 2); typing `tall doc` scrolls to st 0, placement ok |
| REQ-9 | all five hosts | data | Escape closes, clears highlights, shows the icon, focus on body | pass | bar `display:none`; icon `flex`; `activeElement` `ARTICLE.md`; 0/0 ranges |
| REQ-9 | all five hosts | data | Close search (pointer) | pass | bar hidden, icon back |
| REQ-10 | all five hosts | data | ⌘F in the body opens the bar; again selects the query | pass | both keydowns `defaultPrevented:true`; box focused, selection 0–6 of `quokka` |
| REQ-10 | focus | data | ⌘F on a rail card not intercepted | pass | activeElement `ARTICLE.card`, `defaultPrevented:false`, no bar |
| REQ-10 | all | data | a real Chrome lets the page prevent ⌘F | not measured | Note 1 |
| INV-5, REQ-11, REQ-12, REQ-13, Edge-10, Edge-17 | all | data | bystanders, re-render, file switch, tokens, theme, long docs | N/A: cycle 3 changed only `renderFindBar`'s flip branch, the `fileOpened` call order and the handle type. Cycle 2 measured these cells (pass); the gates log's `e2e` (948 passed) and `contrast` (0 failures) lines still cover them | |
| §6 daemon-down | focus | daemon-down | shown prominently | pass | `#banner` `musterd unreachable — hook output…` at 0,46,1440,78, `block/visible`; `.reader-notice` `musterd unreachable — showing last render`; bar moves down to 917,187 inside the body (top 181) |
| §6 daemon-down | tile 2×2 / 3×2 / 3×2 nav open | daemon-down | shown prominently | pass | same banner; bars 331,207 / 281,207 / 91,207 inside body top 203; sw 178 = cw 178 |
| §6 daemon-down | pop-out | daemon-down | shown | pass | `.reader-notice` `musterd unreachable — showing last render` at 0,29,1280,51; bar 757,57 inside body top 51 |
| States | all five hosts | daemon-down | search keeps working; mid-scroll stillness | pass | after SIGTERM, Enter stepped to `3 of 3`; open/close at mid-scroll moved 0 in every host |
| §6 other | all | all | unknown / percentage / permission / Done / cost | N/A: the find bar shows none of these | |
| §7 terminal | all | all | one client, geometry, scrollback, pane styling | N/A: only the docs surface is touched | |

## Issues

### Critical

(none)

### Major

(none)

### Minor

1. **[web-impl]** Closing the bar at the end of a scrolled body still makes the text jump, and leaves the body short of its end. Cycle 2 Minor 1 is fixed mid-document: 0 px of movement in every host, both ways. The problem is in `renderFindBar` (`web/src/render/readerfind.ts`). It flips `bar.hidden` and then runs `body.scrollTop += topPadding(body) - before`. On close, the padding shrinks, and so does the scroll range. Reading `scrollTop` for the `+=` forces layout, so Chrome has already clamped it to the new maximum. The code then subtracts Δ on top of that clamp. Measured with the body at its end: Focus st 3832 → open 3854 → close 3810 against a max of 3832, so the text moves 22 px down and the last 22 px of the document leave the view. The pop-out is the same (22 px). Every tile density moves 28 px (4494 → 4466). Within Δ of the end the move is partial: 12 px (Focus) and 18 px (tiles) from 10 px short of the end. The error does not build up over repeated open/close. A fix must keep the content still across close at every scrollTop, including the last Δ px. One way is to read `scrollTop` before the flip and assign `before + (after − beforePadding)` afterwards, rather than `+=` after layout. **[e2e-specs]** The committed cycle-2 tests (`expectScrolledTextStillAcrossBar`, `reader-search.spec.ts`) scroll paragraph 15 to the centre only. They pass on this build and could not fail for this defect. A test that also scrolls the body to its end and closes the bar would fail here.

### Notes

1. **[note]** Still not measurable here: REQ-10's claim that the browser's own find does not open. Headless Chromium has no find UI, and CDP key events bypass Chrome's browser-level accelerators, so `defaultPrevented:true` (measured in every host) is the strongest evidence available. The developer can confirm it on a real keyboard: press ⌘F in a reader body in Chrome and check that Chrome's find bar stays closed.
2. **[note]** The fix makes a trade at small offsets. Opening the bar with the body scrolled a few px keeps the text still, so the first line stays under the bar. Measured at st 5 in Focus: the h1 is at 144–179 and the bar at 133–163. At st 0 the padding still clears it. A match in that line is never left hidden: typing scrolled to st 0 and the placement was ok. This follows from keeping the text still, so no change is requested.
3. **[note]** Cycle-2 Notes 3 and 4 (step repaint cost at very high match counts, the debounce scaling on multi-MB documents) are unchanged by this cycle's diff and were not re-measured.

## Maintainability review

# Maintainability review: Docs Search Bar

**Plan**: docs-search-bar
**Part verdict**: approved
**Cycle**: 3
**Pack**: kb: pack 10755 words (budget 30000)
**Scope**: delta: `git diff d723bb70..HEAD -- cmd internal web/src ':!*_test.go' ':!*.test.ts'`, 4 files (`web/src/features/reader.ts`, `web/src/features/readerfind.ts`, `web/src/render/reader.ts`, `web/src/render/readerfind.ts`), fix commit 57c9d4fd. No Go files touched.

## Delta

| Prior Minor | Fix commit | Verified how |
|-------------|-----------|--------------|
| 1: `ReaderFindHandle.refresh` and exported `RefreshMode` had no caller outside the module | 57c9d4fd | `refresh` is gone from the `ReaderFindHandle` interface (`features/readerfind.ts:29-39`) and from the returned object (`:169-178`). `RefreshMode` is now a module-local `type` (`:15`). `rg -n "RefreshMode\|\.refresh\(" web/src web/e2e --glob '!*.test.ts'` finds only the type declaration and the inner function's signature, both inside `features/readerfind.ts`. The handle now exposes only what `features/reader.ts` calls. **Closed.** |
| 2: `this.find.fileOpened(...)` split the diagram-pass comment from `renderDiagrams` | 57c9d4fd | `features/reader.ts:330-339`: the four-line comment sits directly above `this.diagramPass = renderDiagrams(...)` again, which matches its position on `main`. `fileOpened` now follows the `diagramPass.then(...)` line. The Decisions log says the reorder does not change behaviour, and the code supports that: `renderDiagrams` (`render/diagrams.ts:66-90`) only runs the synchronous `findFences` read before its first `await`, and `pre.replaceWith` comes after that `await`, so `fileOpened` still reads the same body. **Closed.** |

## Files

| File | Siblings opened | design: line | Size warnings | Result |
|------|-----------------|--------------|---------------|--------|
| web/src/render/readerfind.ts | reader.ts (`scrollHeadingIntoView`), mainhead.ts, diagrams.ts, render/CLAUDE.md | yes (fix attempt 3: compensation in `renderFindBar`, precedent `scrollHeadingIntoView`, padding read from computed style) | none | pass (Note 1) |
| web/src/render/reader.ts | readerfind.ts | covered by the same line (passes `refs.body`) | filelen 559, unchanged from cycle 2; reason holds | pass |
| web/src/features/readerfind.ts | reader.ts (its only caller) | n/a (removal only) | none | pass (Delta 1) |
| web/src/features/reader.ts | diagrams.ts (`renderDiagrams`) | n/a (reorder only) | filelen 698, unchanged from cycle 2; reason holds | pass (Delta 2) |

Duplicate search for the new helper `topPadding` and its scroll write, run from `web/src`:

```
$ rg -n "paddingTop|getComputedStyle|parseFloat" --glob '!*.test.ts' .
./terminal/pane.ts:30:  const value = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
./render/mainhead.ts:97:  const room = Number.parseFloat(getComputedStyle(repo).marginRight) || 0;
./render/readerfind.ts:55:  return Number.parseFloat(getComputedStyle(body).paddingTop) || 0;
./render/readerfind.ts:127:  const { overflowX } = getComputedStyle(element);
./render/diagramdialog.ts:22-23  (parse SVG width/height attributes)
./render/mermaid.ts:32           (read a CSS custom property)
$ rg -n "scrollTop" --glob '!*.test.ts' .
./render/readerfind.ts:62,65   (new: keep scrolled content still across the bar flip)
./render/readerfind.ts:149     (reveal the current match)
./render/reader.ts:558         scrollHeadingIntoView: container.scrollTop += delta;
```

The tree has no shared "computed length of a side" helper. `mainhead.ts:97` writes the same one-line idiom inline for a different property, so `topPadding` is not a second copy of an existing helper. All three `scrollTop` writes apply different rules: hold content still, reveal a range, align a heading.

## Issues

### Critical

None.

### Major

None.

### Minor

None.

### Notes

1. **[note]** `renderFindBar` (`web/src/render/readerfind.ts:58-68`) now does a layout read, a write, and another read (`getComputedStyle` twice around the `hidden` flip) and then writes `scrollTop`. This runs only when `bar.hidden` actually changes, and only when the body is scrolled, so the render tick stays a no-op otherwise. The function decides whether to act by comparing against `refs.bar.hidden` rather than state kept between calls, so the render-state rule in `render/CLAUDE.md` still holds. Because the CSS rule `.reader:has(.find-bar:not([hidden])) .md` owns the clearance values and the TS reads them back, the cycle 2 Note 2 two-owner split did not get a third owner. No change requested.
2. **[note]** Size warnings unchanged: `features/reader.ts` 698 lines, `render/reader.ts` 559 lines (`16-size.log`: 2 hits). This delta added no lines to either file, and the cycle 2 reason still holds.
3. **[note]** Cycle 2 Notes 1, 3 and 4 still apply unchanged. Note 1 is the `CSS.highlights` declaration comment the comment pass dropped. Note 3 is the root keydown listener in `buildReader`. Note 4 is the `features/shortcuts.ts` header, which belongs to review-work's doc-truth check.
