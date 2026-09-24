# Web Tests: Maintainability Cleanup — FW-W

**Plan**: maintainability-cleanup
**Mode**: fix (pre-review fix — no review has run on the web-tests wave itself; this repairs
web-impl's FW-W fixture breakage plus review.maintainability's cycle-2 web-tests findings)
**Verdict**: pass
**Pack**: not fetched via `kb pack` for this wave (same scope note as web-implementation-FW-W.md
— the team lead's brief named the exact files/findings to fix); read
`plans/maintainability-cleanup/web-implementation-FW-W.md`'s Handoff,
`review.maintainability.d-webcore.cycle2.md` (Minor 13, comment-sweep findings 11/12), and
`review.work.md` Minor 3 in full instead.

## Scope of this log

1. Repair the four test files web-impl's FW-W wave left red (`onAction`/`isEditingName`
   required, `tilesLive` rename).
2. d-webcore cycle2 Minor 13: strip this run's review-history citations from
   `dom.test.ts`/`permission.test.ts`, and drop `memory.test.ts`'s now-redundant
   `StorageLikeWithRemove`.
3. Add unit tests for the five pure text derivations `sessions/card.ts` gained this wave
   (`mainheadMeta`, `tileHeaderTimerText`, `tileFooterAgeText`, `deadEndbarText`,
   `deadCapPrefix`), moving/de-duplicating existing render-level assertions of that text
   where any existed.
4. Add unit coverage for `features/theme.ts`'s new "emit `themeChanged` only on an actual
   change" behaviour (review.work.md Minor 3), proven red against the pre-fix code.

No implementation file was touched. `docs/features/theme/spec.md`'s `web:` glob was widened
from an exact filename to a wildcard (`theme.ts` → `theme*.ts`) so the new
`features/theme.test.ts` is claimed by the `theme` feature — required for `make check-kb`
to pass, matching `surfaces/spec.md`'s existing `features/surfaces*.ts` pattern.
`make gen-kb` regenerated `docs/features/theme/INDEX.md` and `.claude/rules/theme.md` off
that edit.

## Fixture repairs (web-impl's Handoff items 1–4)

| File | Change |
|------|--------|
| `render/sessions.test.ts:372-377` (`baseOptions`) | Added `onAction: () => {}` to the returned `CardListOptions`. |
| `render/tiles.test.ts:321-325` (`renderStrip` call) | Added `onAction: () => {}` to the options object. |
| `render/mainhead.test.ts` (8 call sites: 156,166,167,168,177,178,194,204) | Added the missing 7th `isEditingName` argument. All eight are `false` — none of this file's tests are about the editing state (that's the file's own `nameEl`-detachment/Resume-reason coverage, not a rename-in-progress scenario). |
| `features/surfaces.test.ts:51,74` | Renamed the fixture key `getTilesLive` → `tilesLive` (no value-shape change — `SurfacesDeps.tilesLive` is still a zero-arg function, just no longer a `get`-prefixed thunk). |

Verified: `npx tsc --noEmit` exits 0 (was red on exactly these 4 files/12 call sites);
`npx vitest run` — 1739/1741 → all passing before any new tests were added.

## Review-citation cleanup (d-webcore cycle2 Minor 13)

| File | Before | After |
|------|--------|-------|
| `dom.test.ts:1-5` | Header cited "review Minor 6" | Rewritten to state the real reason (shared idiom, what each caller already covers indirectly) with no review citation. |
| `sessions/permission.test.ts:16-25` | Cited "review cycle 1, Major 2", "review.md Major 1's extraction", "review-maintainability cycle 1 moved the module and split out repoRestore", "the bug the reviewer measured on main" | Rewritten to state the plan requirement and the fallback rule directly; all review-history clauses dropped. |
| `sessions/permission.test.ts:35-39` | Cited "review cycle 1, correctness Minor 3" | Same comment, review-cycle prefix dropped — the kb:adr citation and the actual reasoning are unchanged. |
| `reader/memory.test.ts:9-15` | Declared `StorageLikeWithRemove extends StorageLike` with a comment claiming `StorageLike` "has no `removeItem` yet" | Interface removed; `fakeStorage`/`throwingStorage` now return `StorageLike` directly (`storage.ts:9` already declares `removeItem`, confirmed by reading the current file before editing). |

`rg -n "review (cycle|Minor|Major)" web/src/dom.test.ts web/src/sessions/permission.test.ts web/src/reader/memory.test.ts` → no hits after the edit.

## New tests for card.ts's moved text derivations

Checked first (`rg -rn "mainheadMeta|tileHeaderTimerText|tileFooterAgeText|deadEndbarText|deadCapPrefix" --include="*.test.ts" web/src`) — zero existing test-file references to any of the five functions by name. Render-level string assertions existed for exactly one of them:

- `render/dead.test.ts`'s `renderDeadSurface — REQ-19's '· captured <age>' clause` describe
  block hardcoded `deadEndbarText`'s full output (e.g. `"ended 5m ago · last state idle ·
  last captured screen, not a live client"`) inside six `toBe`/`toContain` assertions, as
  part of testing the base-text-plus-"· captured X" concatenation `renderDeadSurface` itself
  does. That base-text formula now has its own direct coverage in `card.test.ts` (bucket
  boundaries, badge word, the `endedAt: null` defensive branch), so re-typing it verbatim a
  second time in `dead.test.ts` would be exactly the kind of duplicated test body
  `docs/conventions.md` and this agent's brief ask to collapse. Replaced each hardcoded
  string with `` `${deadEndbarText(session, NOW)} · captured <age>` `` (or bare
  `deadEndbarText(session, NOW)` for the two branches with no captured clause) — `dead.test.ts`
  now asserts only the render-level concern (the concatenation/pane-status branching), not
  a second copy of `deadEndbarText`'s own formula. The captured-age bucket-boundary tests
  (60s crossing, hour bucket) stayed as-is: they exercise `ageAgo` on `capturedAt`, a value
  `deadEndbarText` never sees, so they aren't duplicated by the new card.test.ts coverage.
- `mainheadMeta`, `tileHeaderTimerText`, `tileFooterAgeText`, `deadCapPrefix` had zero prior
  coverage anywhere (their render-level callers — `mainhead.test.ts`'s `metaEl`,
  `tiles.test.ts`'s `.tm`/`renderTileFooterActions`, `dead.test.ts`'s `capBodyEl`'s "ok"
  branch — never asserted the composed string; only structural/DOM-survival properties
  were tested there). New, direct tests added to `sessions/card.test.ts`.

New `card.test.ts` describe blocks (`sessions/card.test.ts:463-591`), reusing the file's
existing `makeSession`/`NOW` fixtures:

| Describe block | Cases |
|---|---|
| `mainheadMeta` | repo-only; repo + model; repo + model + ended age; dead with no endedAt (defensive, no ended clause); basename fallback when repo is null |
| `tileHeaderTimerText` | alive ticks `formatTimer`; dead shows bare age (no "ended"); dead with no endedAt is empty (defensive) |
| `tileFooterAgeText` | "✕ ended \<age\> ago"; "✕ ended now" (sub-minute, never "now ago"); bare "✕ ended" with no endedAt (defensive) |
| `deadEndbarText` | full composition with an age; every state's lowercase badge word (`it.each`); no-endedAt defensive branch (no leading age clause) |
| `deadCapPrefix` | with an age; no-endedAt defensive branch |

## New test for features/theme.ts (review.work.md Minor 3)

No test file existed for `features/theme.ts` (`initTheme`) before this wave — created
`web/src/features/theme.test.ts`.

`initTheme`'s `applyAttributes` touches `document.documentElement.dataset` and calls
`theme.ts`'s `writeThemeHint`, whose default storage parameter is the real `localStorage`
global. Neither is available in this project's plain-Node Vitest environment (confirmed:
`node -e "console.log(localStorage)"` throws `ReferenceError: localStorage is not defined`
under the pinned Node 24.21.0). Stubbed both as plain objects on `globalThis` in
`beforeEach`/restored in `afterEach`, matching `render/focuskeep.test.ts`'s existing
minimal-stand-in convention for exactly this situation (a function whose only DOM/browser
dependency is a couple of property reads/writes, no real jsdom needed).

Four cases in one describe block, driving `initTheme` through `app.emit` on a real
`createApp()` (no DOM involved in `app.ts` itself, confirmed by reading it):

1. First `prefs` broadcast always emits (moves off the un-applied `null` startup state).
2. A later broadcast that resolves to the identical theme and family (simulating
   wsapp.ts's `onSnapshot` firing `prefs` and `snapshot` in the same task on a reconnect,
   modelled here via a same-value `claudeTheme` event, since `applyAttributes` runs the
   identical code path from either listener) does **not** emit again — this is the
   defect review.work.md Minor 3 named.
3. A real resolved-theme change (`claudeFamily` moving while `themeChoice` is `"follow"`)
   emits again; repeating that same family a second time does not.
4. A family-only change under a *fixed* theme choice still emits (since
   `data-claude-family` moves even though `data-theme` doesn't) — pins the specific
   `changed = theme !== appliedTheme || claudeFamily !== appliedFamily` OR-condition in the
   implementation, not just the headline "dedupe reconnect" case.

**Red/green proof** (evidence the tests actually exercise the fix, not just pass
vacuously): copied the current (fixed) `web/src/features/theme.ts` aside to
`/private/tmp/claude-501/-Users-damian-Documents-code-Projects-muster/19425776-7e9e-4c9a-ba2a-caac13ee2f5e/scratchpad/theme.ts.fixed.bak`,
overwrote the working file with `git show HEAD:web/src/features/theme.ts` (HEAD is this
plan branch's tip — the fix itself is still an uncommitted working-tree diff, confirmed via
`git diff HEAD -- web/src/features/theme.ts` before touching anything), ran
`npx vitest run src/features/theme.test.ts`, then restored from the scratchpad copy and
confirmed byte-identity with `cmp`:

```
$ npx vitest run src/features/theme.test.ts   # against pre-fix HEAD:features/theme.ts
 ❯ src/features/theme.test.ts (4 tests | 2 failed)
   × does not emit again when a later broadcast resolves to the identical theme and family …
     AssertionError: expected 2 to be 1
   × emits again when the Claude family changes while the theme choice is 'follow' …
     AssertionError: expected 3 to be 2
 Test Files  1 failed (1)
      Tests  2 failed | 2 passed (4)

$ cp scratchpad/theme.ts.fixed.bak web/src/features/theme.ts
$ cmp web/src/features/theme.ts scratchpad/theme.ts.fixed.bak && echo "BYTE-IDENTICAL: restore confirmed"
BYTE-IDENTICAL: restore confirmed
$ git diff --stat -- web/src/features/theme.ts
 web/src/features/theme.ts | 24 ++++++++++++++++--------
 1 file changed, 16 insertions(+), 8 deletions(-)
```

The two failures are exactly the "no duplicate emit" assertions (cases 2 and the repeat
half of case 3); the two "does emit on a real change" assertions (cases 1 and the first
half of case 3/4) passed against both versions, as expected — they test something the old
code also did correctly.

## Decisions

- **Did not** attempt to finish d-webcore Minor 7 (making `format.ts`'s `agoSuffix`
  module-private) even though web-implementation-FW-W.md's Handoff item 5 flagged it as a
  web-tests-scoped follow-up. Un-exporting `agoSuffix` is an edit to `format.ts`, which is
  implementation code I may not touch — only the test-file half of that finding (moving
  `format.test.ts`'s direct `agoSuffix` coverage onto `ageAgo`) is mine to do, and doing
  only that half while `agoSuffix` stays exported would leave the test suite covering less
  (no direct coverage of `agoSuffix`'s own "now" special-case) for no compiler-enforced
  gain, since the export would still be there. Left `format.test.ts` untouched.
- **Did not** touch `format.test.ts`'s own `agoSuffix` describe-block citation ("review
  markdown-viewing cycle-1 Major 2") — that names a different, older plan
  (`markdown-viewing`), not this run's review, so it's outside Minor 13's "this run's
  review" scope (which named exactly `dom.test.ts`, `permission.test.ts`,
  `memory.test.ts`).
- Widened `docs/features/theme/spec.md`'s `web:` glob (`theme.ts` → `theme*.ts`) rather than
  hand-listing `web/src/features/theme.test.ts` alongside it, matching the existing
  `web/src/features/surfaces*.ts` pattern in `surfaces/spec.md` for the same
  implementation-plus-its-own-test-file shape.

## Verification tails

```
$ npx tsc --noEmit
(no output — 0 errors)

$ make web-lint
Checked 247 files in 187ms. No fixes applied.

$ make web-test
 Test Files  72 passed (72)
      Tests  1765 passed (1765)

$ make web-build
✓ built in 1.67s
(only the pre-existing "chunks larger than 500kB" advisory, unrelated to this wave)

$ make check-kb
kb: 426 records, 23 features, 0 problem(s)
kb: all checks pass

$ make refs
dead-refs: 3126 references checked, 0 missing

$ make gen-kb
kb: regenerated 2 file(s): .claude/rules/theme.md, docs/features/theme/INDEX.md
```

Test count: 1741 (start of this wave, all passing) → 1765 (end of this wave, all passing):
+24 new (5 card.test.ts describe blocks totalling 20 cases, 4 theme.test.ts cases), 0
removed (the dead.test.ts de-duplication rewrote assertions in place rather than deleting
cases).

## Git

Per the team lead's run-mode override, no `git add`/commit was done in this run — the main
session commits after gating the whole tree.
