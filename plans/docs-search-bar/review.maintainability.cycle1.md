# Maintainability review: Docs Search Bar

**Plan**: docs-search-bar
**Verdict**: needs-changes
**Cycle**: 1
**Pack**: kb: pack 10753 words (budget 30000)
**Scope**: 9 files from `git diff main...HEAD -- cmd internal web/src ':!*_test.go' ':!*.test.ts'` (web only; no Go touched)

## Files

| File | Siblings opened | design: line | Size warnings | Result |
|------|-----------------|--------------|---------------|--------|
| web/src/reader/find.ts | slug.ts, zoom.ts, tree.ts, mermaid.ts, reader/CLAUDE.md | yes | none | pass |
| web/src/render/readerfind.ts | reader.ts, diagramdialog.ts, diagrams.ts, frontmatter.ts, render/CLAUDE.md | yes | none | Minor 3 |
| web/src/render/reader.ts | diagramdialog.ts, diagrams.ts, frontmatter.ts | yes (wiring only) | filelen 566 (was 544), reason holds | Minor 2, Minor 4 |
| web/src/features/readerfind.ts | launchgroup.ts, launchresume.ts, groupsselect.ts, groupsdialogs.ts, connection.ts, features/CLAUDE.md | yes | none | Minor 1 |
| web/src/features/reader.ts | launch.ts, groups.ts (owners of sub-controllers) | yes (wiring only) | filelen 694 (was 674), reason holds | pass |
| web/src/shortcuts.ts | features/shortcuts.ts (its only dispatcher) | yes (dispatch from reader, stated) | none | pass |
| web/src/style.css | `.rnav .filter`, `.arr`, `.seg-btn`, `.btn` rules in the same file | yes (`fbtn`) | n/a (contrast-gate file) | Minor 5 |
| web/src/features/CLAUDE.md | render/CLAUDE.md, reader/CLAUDE.md | n/a | none | pass |
| web/src/render/CLAUDE.md | features/CLAUDE.md | n/a (trailer recount only) | none | pass |

Duplicate searches run (all from `web/src`, `--glob '!*.test.ts'`):

```
$ rg -n "\+ (count|n|len|length)\) %|% (count|length|n)\b|\.length\) %" .
./reader/find.ts:57:  return (index + direction + count) % count;
./render/menu.ts:113:  else if (event.key === "ArrowUp") next = (at - 1 + items.length) % items.length;
./features/launch.ts:666:        entries[(activeIndex + 1 + entries.length) % entries.length]?.focus();
./features/launch.ts:669:        entries[(activeIndex - 1 + entries.length) % entries.length]?.focus();
$ rg -n "Math\.max\(0, Math\.min|function clamp" .
./reader/zoom.ts:28:export function clampZoom(zoom: number): number {
./reader/find.ts:60:export function clampIndex(index: number, count: number): number {
$ rg -n "CSS\.highlights|new Highlight" .          -> only render/readerfind.ts
$ rg -n "createTreeWalker|SHOW_TEXT" .              -> only render/readerfind.ts
$ rg -n '"noscript"|"desc"|localName' .             -> only render/readerfind.ts
$ rg -n "scrollTop|getBoundingClientRect|scrollIntoView" reader render features
render/reader.ts:564-565  (heading-to-top scroll for the outline; different rule from centring a range)
render/readerfind.ts:100-106
```

No existing helper does what `stepIndex`, `clampIndex`, `findInTexts`, `findRanges`, `paintFind` or `scrollRangeIntoView` do: the wrap idiom in `menu.ts`/`launch.ts` is inline, not a helper, and `clampZoom` clamps a zoom range rather than an index. No duplicate helper found.

## Issues

### Critical

None.

### Major

None.

### Minor

1. **[web-impl]** `createReaderFind` is shaped unlike the four sub-controllers it names as precedent. See `web/src/features/readerfind.ts:14-30`. Its design line says "a reader sub-controller named `<owner><concern>.ts` (precedent `launchgroup.ts`, `launchresume.ts`); closure-over-state `create…` function". But every sibling sub-controller is `init<Owner><Concern>(elements: <Name>Elements, …): <Name>Handle`:
   - `features/launchgroup.ts:45`: `export function initLaunchGroup(elements: LaunchGroupElements): LaunchGroupHandle`
   - `features/groupsselect.ts:50`: `initGroupsSelect(` taking `GroupsSelectElements`, returning `GroupsSelectHandle`
   - `features/groupsdialogs.ts:48`: the same shape
   - `features/launchresume.ts:88`: the same shape

   The new module diverges in three ways. It is `createReaderFind`, not `initReaderFind`. It returns `ReaderFind`, not `ReaderFindHandle`. And it takes the owner's whole `ReaderRefs` (a type from `render/reader.ts`) where its siblings take a `<Name>Elements` interface listing only the elements they use. Through that whole-refs parameter it reads `refs.diagramDialog.open` (line 88), an element that belongs to `render/diagramdialog.ts`'s concern. `kb:diagram/web-components` describes the five sub-controllers as "handed their elements by their owner", and `features/CLAUDE.md` says "`deps` is typed structurally with the exact methods it calls". A fix must make one of two things true. Either the module matches its siblings' `init…`/`…Elements`/`…Handle` shape, with the dialog check reaching it as an element or a structural dep it names. Or the design line states why it diverges, and stops citing as precedent the modules it differs from.

2. **[web-impl]** The find bar's listener wiring sits in `render/reader.ts:197-202` (`wireFind`). The same concern's sibling keeps its wiring in its own module: `render/diagramdialog.ts:9` imports `type { ReaderRefs } from "./reader"` and exports `wireDiagramDialog(refs)`, which `buildReader` calls in one line. `render/readerfind.ts` already holds the find bar's refs, builder and painter, so a reader looking for the find bar's listeners would look there first. No design line gives a reason for the split. The extra lines also land in a file already over 500 lines (566). A fix must make one of two things true: the find wiring lives with the rest of the find DOM half, as `wireDiagramDialog` does, or the design line states why it stays in `render/reader.ts`.

3. **[web-impl]** The `CSS.highlights` entries `find-match` and `find-current` are shared, document-wide state, but the code does not say so where they are declared (`web/src/render/readerfind.ts:4-5`, and `registered()` at line 78). Every `ReaderInstance` on the page writes to these two entries: the focus reader and every tile reader. Each one adds and deletes only its own `Range`s, and the first caller fixes the priority. This breaks conventions § Design: "Shared state names its writers and its guard … says so where it is declared." The only place the rule appears today is the Decisions log ("each reader adds and removes only its own `Range` objects", INV-5). It is not a race: I found no interleaving that breaks it, because each instance passes its own previous paint to `paintFind`, so one reader's repaint never deletes another's ranges. A fix must make the declaration say that the registry is shared across reader instances, and state the rule that keeps them apart.

4. **[web-impl]** `renderFindBar(refs.find, vm.find);` was inserted at `web/src/render/reader.ts:497`, between the `aria-busy` comment (lines 492-495) and the three lines it explains (498-500). A reader now takes that comment, about removing `aria-busy` rather than setting it to `"false"`, as describing the find bar. A fix must put the call where it no longer separates that comment from the code it explains.

5. **[web-impl]** `.find-query` (`web/src/style.css:1533-1544`) repeats the reader's other text box, `.rnav .filter` (`style.css:1670-1680`), declaration for declaration: `border: 1px solid var(--edge)`, `border-radius: 3px`, `padding: 3px 7px`, `background: var(--well)`, `color: var(--fg)`, `font-family: var(--mono)`. Only `font-size` and the flex sizing differ. The same branch's `fbtn` fix shares `.arr`'s base rules through a selector list (`.arr, .fbtn`) so the two do not drift. The query box is a second copy of the filter's look instead (conventions § Design "Reuse before add"). A fix must give the reader's two text boxes one shared source for their common declarations, so changing the filter's look changes the find box too. Alternatively, the design line states why they should be free to drift.

### Notes

1. **[note]** Size warnings: `web/src/features/reader.ts` is 694 lines (was 674) and `web/src/render/reader.ts` is 566 (was 544). Both were over 500 before this branch, and the stated reason holds: the matcher, the DOM half and the controller went into three new modules, and the additions to the two big files are callbacks, the VM field, refresh calls and the `refindAfterDiagrams` guard. The one exception is `wireFind`, raised as Minor 2.
2. **[note]** ⌘F is in `shortcuts.ts`'s binding table but is dispatched from the reader's root keydown, not `features/shortcuts.ts`'s window listener, which drops it in `default: break`. The design line gives the reason, and it holds: the pop-out never runs `features/shortcuts.ts`. That module's header still says it is "the one `window` keydown listener for every bound chord". That is doc truth and belongs to review-work; the impl log already raises it as a doc-delta.
3. **[note]** For review-work (doc truth): `web/src/reader/CLAUDE.md`'s **Owns** list does not name `find.ts`, and `web/src/render/CLAUDE.md`'s **Owns** list does not name `readerfind.ts`. Only `features/CLAUDE.md` was updated, because only it has an inventory gate.
4. **[note]** For review-work (DIAG): `kb:diagram/web-components` labels the `render → reader` edge "tree types". `render/readerfind.ts` now value-imports `findInTexts` over that edge. The label was already narrower than the code before this branch: `render/diagrams.ts` imports `reader/mermaid` and `render/diagramdialog.ts` imports `reader/zoom`.
5. **[note]** `ReaderCallbacks.onKeydown` (`web/src/render/reader.ts:106`) is a generic name on an interface whose other members say what they do (`onToggleFiles`, `onFindStep`). Today only find handles root keydowns. No change requested.
6. **[note]** The new modules carry no header or doc comments, unlike most of their neighbours (`render/diagramdialog.ts`, `reader/zoom.ts`). Comments are owned by the comment pass (kb:adr/process-comment-pass-owns-code-comments), so this is not filed.
