# Maintainability review: Docs Search Bar

**Plan**: docs-search-bar
**Verdict**: approved
**Cycle**: 4
**Pack**: kb: pack 10755 words (budget 30000)
**Scope**: delta: `git diff 66d3baf2..HEAD -- cmd internal web/src ':!*_test.go' ':!*.test.ts'`, 1 file (`web/src/render/readerfind.ts`, 3 lines changed), fix commit b4dbef2f. No Go files touched.

## Delta

| Prior Minor | Fix commit | Verified how |
|-------------|-----------|--------------|
| none: cycle 3's maintainability part (`review.maintainability.cycle3.md`) was `approved` with no Minors | n/a | The Minors still open after cycle 3 were Correctness Minor 1 and Browser Minor 1. Both describe the same end-of-body defect, which fix b4dbef2f addresses. Whether the fix behaves correctly is for review-work and review-browser to verify. This part only reviews the shape of the change. |

## Files

| File | Siblings opened | design: line | Size warnings | Result |
|------|-----------------|--------------|---------------|--------|
| web/src/render/readerfind.ts | reader.ts (`scrollHeadingIntoView`, `:555-559`), render/CLAUDE.md | yes (fix attempt 4: "no new module or helper; the fix keeps the cycle 2 shape ... read-before-flip, assign-absolute") | none | pass (Note 1) |

The delta adds no helper, type or module. It changes the order of two statements and swaps one compound assignment for a plain one inside `renderFindBar` (`readerfind.ts:62-65`). The fix needs no duplicate search. Here is every `scrollTop` write in the tree, which shows the new write is the only absolute assignment:

```
$ rg -n "scrollTop" web/src/render web/src/features --glob '!*.test.ts'
web/src/render/reader.ts:558:  container.scrollTop += delta;
web/src/render/readerfind.ts:62:    const top = body.scrollTop;
web/src/render/readerfind.ts:65:    if (top > 0) body.scrollTop = top + topPadding(body) - before;
web/src/render/readerfind.ts:149:  body.scrollTop += rect.top - box.top - wanted;
```

## Issues

### Critical

None.

### Major

None.

### Minor

None.

### Notes

1. **[note]** `readerfind.ts:65` is now the one `scrollTop` write in the tree that assigns an absolute value. Its siblings `reader.ts:558` and `readerfind.ts:149` add a delta. The fix attempt 4 Decisions entry gives the reason: after the `hidden` flip, Chrome has already clamped `scrollTop` to the smaller range, so `+=` would subtract the padding change twice. The code bears that out, because `top` is captured before `refs.bar.hidden` is written. The divergence has a stated reason, so it passes question 2. The code has no comment giving that reason, so a later reader could turn it back into a `+=`. Commit f02d6b1e added an end-of-body e2e regression spec, which would catch that. Comments belong to the comment pass (`docs/conventions.md` § Comments; kb:adr/process-comment-pass-owns-code-comments), and `14-comments.log` reports `comment-checks: clean`. No change requested.
2. **[note]** The size warnings have not changed since cycle 3: `features/reader.ts` is 698 lines and `render/reader.ts` is 559 (`16-size.log`: 2 hits). The delta changed neither file, and the cycle 2 reason still holds.
3. **[note]** Cycle 3 Notes 1 and 3 still apply unchanged. That includes the cycle 2 Notes they carry forward: the dropped `CSS.highlights` declaration comment, the root keydown listener in `buildReader`, and the `features/shortcuts.ts` header, which is for review-work's doc-truth check.
