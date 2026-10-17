# Correctness review: Docs Search Bar

**Plan**: docs-search-bar
**Verdict**: needs-changes
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
