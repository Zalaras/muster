# Maintainability review: Docs Search Bar

**Plan**: docs-search-bar
**Verdict**: needs-changes
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
