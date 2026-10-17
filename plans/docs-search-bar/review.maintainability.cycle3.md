# Maintainability review: Docs Search Bar

**Plan**: docs-search-bar
**Verdict**: approved
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
