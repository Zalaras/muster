# Web Tests: Maintainability Cleanup — Unit W8 (fixture repair)

**Plan**: maintainability-cleanup
**Unit**: W8 web-tests half — repair the 7 test files web-implementation-W8.md's Handoff
table named as broken by the type-hardening in `web-implementation-W8.md` (review
maintainability Major 6: production types that were optional only for test fixtures are
now required).
**Verdict**: pass
**Pack**: not run via `go run ./tools/kb pack` this unit (same offline note as the impl
half) — read directly: `web-implementation-W8.md` in full (Changes/Decisions/Handoff), each
of the 7 named test files, and `web/vitest.config.ts` (unchanged, no new setup needed).

## Summary

Tests created: 1 new file (`render/dragreorder.test.ts`, 4 cases moved verbatim from the
deleted `render/tiledrag.test.ts`) | Tests deleted: `render/tiledrag.test.ts` (4 cases,
moved, not lost) + 2 individual cases (dead.test.ts, tiles.test.ts) whose scenario the
type change made unreachable + 119 cases (updateview.test.ts: a dropped grid dimension plus
7 prefs/toggleChecked-specific cases) whose behaviour moved out of this module entirely.

Passing: 275 (the 8 touched files) | Failing: 0 | Full suite: 1741/1741 passing, 71/71
files, `tsc --noEmit` 0 errors (down from the 33 in web-implementation-W8.md's Handoff),
`make web-lint`/`web-build`/`check-kb` all clean.

## Case counts, before -> after (measured by running each file's pre-W8 fixture content
against the current, esbuild-transpiled — not type-checked — production code, via
`git show HEAD:<path>`; HEAD is this branch's tip before W8's uncommitted changes)

| File | Before | After | Delta | What moved/was cut |
|------|-------:|------:|------:|---------------------|
| `web/src/features/updateview.test.ts` | 297 | 178 | -119 | See "Deletions" below — the `updateCheck` grid dimension (-112) and 7 prefs/`toggleChecked` cases (-7), because `buildUpdateViewModel` no longer takes `prefs` and `UpdateViewModel.toggleChecked` no longer exists (the toggle's checked state is now driven directly by the `prefs` broadcast in `features/update.ts`, per `update.ts`/`render/update.test.ts`'s own "never touches toggle.checked" invariant). |
| `web/src/render/dead.test.ts` | 16 | 15 | -1 | Deleted: "is a safe no-op when refs.noticeEl is undefined" — `DeadSurfaceRefs.noticeEl` is required now, so the scenario is unreachable. |
| `web/src/render/tiles.test.ts` | 19 | 18 | -1 | Deleted: "writes the title normally when refs.rename is absent (the pre-plan fixture shape...)" — `TileRefs.rename` is required now, so the scenario is unreachable; its assertions were already subsumed by "re-derives the view-model fresh on every call" (2 sequential writes, same file). |
| `web/src/render/tiledrag.test.ts` | 4 | 0 (deleted) | -4 (moved) | File deleted — it only pinned the deleted `installTileDrag` wrapper (its own header comment said so). All 4 cases moved verbatim (same assertions, same fake DOM harness) to `render/dragreorder.test.ts`, retargeted at `installDragReorder(grid, { itemSelector: "article.tile", handleSelector: ".thead", onMove })` — the exact call `features/tiles.ts` now makes directly. |
| `web/src/render/dragreorder.test.ts` | 0 (new) | 4 | +4 (moved in) | See above — the pre-blur focus-snapshot sequencing behaviour (capture on `mousedown`, thread to `onMove` once, clear on `dragend`/consume-once) lives in `installDragReorder` itself now (confirmed by reading `dragreorder.ts`'s `mousedown`/`drop`/`dragend` listeners), not something the deleted wrapper added — a real `installDragReorder` behaviour, not wrapper-only glue, so it was moved rather than dropped. |
| `web/src/render/mainhead.test.ts` | 5 | 5 | 0 | Fixture-only fix (see Tests table). |
| `web/src/render/sessions.test.ts` | 29 | 29 | 0 | Fixture-only fix (see Tests table). |
| `web/src/render/update.test.ts` | 21 | 21 | 0 | Fixture-only fix (see Tests table). |
| `web/src/render/dropguard.test.ts` | 5 | 5 | 0 | Comment-only fix (dangling reference to the deleted `tiledrag.test.ts`, repointed at `dragreorder.test.ts`). |

## Deletions/moves, itemised

- `updateview.test.ts` full grid (`describe("... full grid ...")`): dropped the
  `updateCheck: [true, false]` loop dimension (4 installs × 2 available × 2 installed × 7
  phases × 2 updateCheck = 224 → 112 rows, -112) and its `toggleChecked` assertion — the
  production function no longer takes a `prefs` argument at all, so there is nothing left
  to vary along that axis.
- `updateview.test.ts` individual cases deleted (7): "still reflects prefs.updateCheck for
  the toggle's checked state even with update === null", "defaults toggleChecked to true
  when prefs is also null", "renders the same age suffix with the daily-check toggle off",
  "is unaffected by a missing prefs (null)", "toggleChecked mirrors prefs.updateCheck=%s
  exactly" (`it.each([true, false])`, 2 cases), "checkEnabled is true with the daily-check
  toggle off". Each asserted either `vm.toggleChecked` (field deleted) or a `prefs`-varying
  outcome from a function that no longer accepts `prefs` — not test bugs to patch, dead
  scenarios to remove, matching `update.ts`'s own doc comment that this behaviour was never
  this module's to own.
- `dead.test.ts`: deleted the one case exercising `showDeadSurfaceNotice` with a
  `DeadSurfaceRefs` missing `noticeEl` — `collectDeadSurfaceRefs` already throws if the real
  DOM is missing that element, and the field is required in the type now, so "absent" is no
  longer a fixture any caller can even construct.
- `tiles.test.ts`: deleted the one case building a `TileRefs` without `rename` — same
  reasoning, and its two assertions (title written on first render, written again on
  second) were already covered verbatim by the file's own "re-derives the view-model fresh
  on every call" case a few lines up.
- `tiledrag.test.ts` → `dragreorder.test.ts`: all 4 cases moved with their assertions,
  fakes (`FakeElement`/`FakeClassList`/`FakeGrid`/`fakeDataTransfer`/`makeTile`) and mock of
  `./focuskeep` unchanged — only the call under test changed, from
  `installTileDrag(grid, onMove)` to `installDragReorder(grid, { itemSelector:
  "article.tile", handleSelector: ".thead", onMove })` (a new `install()` helper in the new
  file wraps that one call so the 4 test bodies stay identical to the original).

## Shared fixture helpers added (grep'd for existing ones first, per instructions)

- `render/dead.test.ts`: `fakeDeadSurfaceRefs(overrides?)` — the three describe blocks
  each hand-built an identical `DeadSurfaceRefs` object (only `resumeBtn`/`noticeEl` ever
  varied); consolidated into one helper with an `overrides` param, each block's local
  `fakeRefs` either aliases it directly or calls it with the one field it needs.
- `render/tiles.test.ts`: `fakeTileRefs(root?, rename?)` — 7 call sites built an identical
  `TileRefs` literal (`root, bodySlot, geoEl, markerEl`, sometimes `rename`); consolidated
  into one helper that also fills the two new required fields (`actsEl`, `surfaceSegment`)
  every one of those 7 sites now needs, via a new `fakeSurfaceSegmentRefs()` inert fake
  (neither `updateTile` nor `renderTileGeometry` reads `surfaceSegment`/`actsEl`, confirmed
  by reading both functions' bodies).
- `render/mainhead.test.ts`: `fakeSurfaceSegmentRefs()` — one call site (`MainheadElements`
  now requires `surfaceSegment`), same inert-fake shape as tiles.test.ts's (not shared
  across files — each is a small, self-contained fake local to its own test file, matching
  this codebase's existing per-file fake convention, e.g. `render/surfaceseg.test.ts`'s own
  `fakeSurfaceSegmentRefs` is a third, richer variant purpose-built to assert on
  `updateSurfaceSegment`'s own contract, which neither of the other two need to).

## Tests

| File | Test Name | What It Tests | Status |
|------|-----------|---------------|--------|
| `features/updateview.test.ts` | "renders the honesty-shaped 'unknown' state..." | `update === null` → no `toggleChecked` field, everything else unchanged | pass |
| `features/updateview.test.ts` | full grid (112 cases) | install × available × installed × phase stay internally consistent, no throw | pass |
| `render/dead.test.ts` | "shows the given text and un-hides the notice" | `showDeadSurfaceNotice` with the now-required `noticeEl` | pass |
| `render/mainhead.test.ts` | "leaves button.rename attached..." | `renderMainhead` called with the two new required args (`surfaceState`, `activity`) | pass |
| `render/sessions.test.ts` | `baseOptions()`-driven cases (29) | `CardListOptions.onClick` now required, defaulted to a no-op in the one shared builder | pass |
| `render/tiles.test.ts` | `updateTile`/`renderTileGeometry` cases (18) | `TileRefs.actsEl`/`rename`/`surfaceSegment` now required, via `fakeTileRefs` | pass |
| `render/dragreorder.test.ts` | 4 pre-blur focus snapshot cases | `installDragReorder`'s own sequencing (moved from `tiledrag.test.ts`) | pass |
| `render/update.test.ts` | `renderUpdateSection`/etc. cases (21) | `buildUpdateViewModel`'s 3-arg signature (dropped `prefs`) | pass |
| `render/dropguard.test.ts` | 5 cases | unaffected by W8 — comment-only fix | pass |

## Doc/registry fix (outside the impl agent's permitted scope, in mine)

`make check-kb` reported `web/src/render/dragreorder.test.ts: owned by no feature` — the
new file's exact-path glob entry (`web/src/render/dragreorder.ts`, no `*`) in
`docs/features/rail/spec.md`'s `web:` list didn't match a `.test.ts` sibling, unlike every
neighbouring entry in that same list (`sessions*.ts`, `actionbutton*.ts`,
`keyedreorder*.ts`). Widened it to `web/src/render/dragreorder*.ts` and ran `make gen-kb`
(regenerated `.claude/rules/rail.md`, `docs/features/rail/INDEX.md`,
`web/src/render/CLAUDE.md`). The two ADR `files:` entries still naming the deleted
`tiledrag.ts` that web-implementation-W8.md flagged as "not mine to edit" were already
fixed by the time I started (`git show HEAD` for both ADRs has no `tiledrag.ts` reference) —
`make check-kb` confirms 0 problems now.

Also fixed one dangling comment reference while in a test file I'm allowed to edit:
`render/dropguard.test.ts`'s header cited "the same minimal-fake-listener technique
render/tiledrag.test.ts already established" — repointed at `render/dragreorder.test.ts`
(web-implementation-W8.md flagged this one for me explicitly, since it's a test file).

## Comment sweep

Re-read every comment added in this unit before writing this log: none cite a path that
doesn't exist (verified all five citations — `web/e2e/actions.spec.ts`,
`render/focuskeep.test.ts`, `features/tiles.ts`, `features/rail.ts`,
`render/surfaceseg.test.ts` — with `ls`), none narrate the diff, and
`.claude/skills/orchestrate/scripts/dead-refs.py` reports nothing in any of the 8 touched
files.

## Test Run Output

`npx tsc --noEmit` (0 errors, down from 33):
```
$ npx tsc --noEmit; echo "exit=$?"
exit=0
```

`npm test`:
```
 Test Files  71 passed (71)
      Tests  1741 passed (1741)
   Start at  10:26:55
   Duration  3.21s
```

`make web-lint`:
```
cd web && npm run -s lint
Checked 245 files in 186ms. No fixes applied.
```

`make web-build` (tail):
```
✓ built in 1.62s
[plugin builtin:vite-reporter]
(!) Some chunks are larger than 500 kB after minification. [...]
```
(pre-existing chunk-size warning, unrelated to this unit — same warning W8's own
`web-implementation-W8.md` did not need to touch)

`make check-kb`:
```
go run ./tools/kb check
kb: 425 records, 23 features, 0 problem(s)
kb: all checks pass
```

## Notes for the orchestrator

- `web/src/render/tiledrag.ts` (production) is still shown deleted-but-uncommitted in `git
  status` — `size-warn.sh` errors on it (`git ls-files` still lists it since the deletion
  isn't staged/committed), a pre-existing side effect of this unit's git-hygiene rule ("do
  NOT git add/commit"), not something introduced or fixable from the test side.
- Per instructions, no `git add`/`git commit` was run — the files below are left staged for
  the orchestrator/committer.
