# Web Implementation: Maintainability Cleanup

**Plan**: maintainability-cleanup
**Mode**: initial (Unit W5 only — one owner per helper)
**Pack**: `kb: pack 69039 words (budget 8000)` — sections rules 1053 · features 26183 · diagrams 0 · decisions 27308 · proposed 0 · facts 9486 · lessons 4359 · runbooks 644 (`--plan maintainability-cleanup --role web-impl`; over budget, WARN only)

## Changes

| File | Action | What and Why |
|------|--------|--------------|
| `web/src/storage.ts` | created | One `StorageLike` seam + `readJson`/`writeJson` (Minor 5) — theme.ts's hint and reader/memory.ts's per-session memory both used to hand-write the same try/catch-parse-validate sequence under two different `Pick<Storage,...>`/`StorageLike` shapes. |
| `web/src/dragmime.ts` | created | `DRAG_MIME` (Seed B5), moved out of `render/dragreorder.ts` — it was the only reason `terminal/pane.ts` imported from `render/`, one half of the render↔terminal cycle e-webui's Note 2 flags. |
| `web/src/sessions/reorder.ts` | created | `insertAtDragTarget<T>` (Major 2) — the insert-and-shift reorder `railorder.ts`'s `moveCard` and `live.ts`'s `moveTile` each hand-wrote (`splice(targetIndex, 0, …)` after removing the dragged entry, with the "read the target index from the ORIGINAL array" requirement documented twice). |
| `web/src/dom.ts` | modified | `requireElement`/`requireElements` take an optional `root: ParentNode = document` (Seed B4: absorbs `render/reader.ts`'s root-scoped `requireEl`); `requireElements` now throws on an empty match instead of silently returning `[]` (Note 6); added `requireTemplate` (Seed B4: absorbs `render/sessions.ts`/`render/tiles.ts`'s identical private copies). |
| `web/src/render/reader.ts` | modified | Dropped its private `requireEl`; all 20 call sites use `dom.ts`'s `requireElement(selector, root)` (argument order swapped to match). |
| `web/src/render/sessions.ts`, `web/src/render/tiles.ts` | modified | Dropped each's private `requireTemplate`, import `dom.ts`'s. `render/sessions.ts` also: `SessionAction` moved out (now imported from `sessions/card`); dead pass-through `updateSessionCardElement` removed, `reconcileCards` calls `updateSessionCardContent` directly (Minor 2). |
| `web/src/render/dead.ts` | modified | `collectDeadSurfaceRefs` and the private `refsFromRoot` merged into one exported function (Minor 2 pass-through); `resumeBtn.disabled` now reads `canResume` (Major 1); age readouts use `ageAgo` (Major 4). |
| `web/src/sessions/card.ts` | modified | New `SessionAction` type (Seed B5) and `canResume(claudeSessionId)` (Major 1, the one resumable predicate — `resumeDisabledReason` now composes it); `basename` exported (Seed B4, canonical trailing-slash-stripping implementation); `formatEndedAge` call → `formatAge`. |
| `web/src/reader/paths.ts` | modified | Local `basename` dropped; re-exports `sessions/card.ts`'s (Seed B4 — the two implementations differed on trailing-slash paths; kept the stripping behaviour since `sessions/card.ts`'s caller relies on it and `reader/paths.ts`'s callers are always file paths). |
| `web/src/sessions/format.ts` | modified | `formatEndedAge` (a no-op alias of `formatAge`) deleted, every caller now calls `formatAge` directly; `formatEndedAgo` renamed `ageAgo` (Major 4 — one age fn, one age-ago fn, named for what they do, not their first caller); `pad2` exported (Seed B4); header comment now describes `GAUGE_WARN_THRESHOLD`/`formatTokens` too (Note 7). |
| `web/src/sessions/sort.ts` | modified | `byRailPos` comparator extracted, used by both `orderRail` branches instead of the same `a.railPos - b.railPos \|\| a.id - b.id` spelled out twice (Note 8). |
| `web/src/sessions/railorder.ts` | modified | `moveCard` calls `insertAtDragTarget`, keeping only its own `pinnedCount` derivation (Major 2). |
| `web/src/sessions/live.ts` | modified | `moveTile` calls `insertAtDragTarget` (Major 2); new `visibleIds(view, focusedId, tilesLive)` (Minor 9 — the "ids visible in the current view" rule `features/surfaces.ts` and `features/reader.ts` each re-derived). |
| `web/src/app.ts` | modified | `ConnectionStatus` type moved in from `render/masthead.ts` (Seed B5 — a domain-vocabulary type that a pure module (`reader/notice.ts`) and the seam itself depended on a render module for). |
| `web/src/render/masthead.ts`, `web/src/reader/notice.ts`, `web/src/features/connection.ts`, `web/src/features/reader.ts` | modified | Re-pointed `ConnectionStatus` import to `../app`. |
| `web/src/render/dragreorder.ts`, `web/src/terminal/pane.ts` | modified | Re-pointed `DRAG_MIME` import to `../dragmime`. |
| `web/src/render/mainhead.ts` | modified | `resumeBtn.disabled` reads `canResume` (Major 1); `ended <age>` uses `ageAgo`. |
| `web/src/render/update.ts` | modified | `availableText`'s "checked \<age\> ago" uses `ageAgo` instead of hand-composing `agoSuffix(formatAge(...))` (Major 4). |
| `web/src/reader/freshness.ts` | modified | `changedText` uses `ageAgo` (Major 4). |
| `web/src/features/actions.ts`, `features/focus.ts`, `features/rail.ts`, `features/tiles.ts` | modified | `SessionAction` import re-pointed to `../sessions/card`. |
| `web/src/features/issue.ts` | modified | Local `pad` arrow function dropped, uses `sessions/format.ts`'s `pad2` (Seed B4). |
| `web/src/features/surfaces.ts` | modified | `visibleSessionIds` calls `sessions/live.ts`'s `visibleIds` (Minor 9). |
| `web/src/features/reader.ts` | modified | `visibleDocsIds` calls `visibleIds` then filters by `selected === "docs"` (Minor 9). |
| `web/src/theme.ts` | modified | Dead `readThemeHint` deleted; dead `export type { ClaudeFamily }` re-export deleted (Minor 3 — nothing imported `ClaudeFamily` from `theme.ts`; `features/theme.ts` already imports it from `protocol/theme`); `writeThemeHint` calls `storage.ts`'s `writeJson`. |
| `web/src/reader/memory.ts` | modified | `StorageLike` now imported (and re-exported) from `storage.ts`; `loadMemory`/`saveMemory` call `readJson`/`writeJson` (Minor 5). |
| `web/index.html` | modified | Comment naming the now-deleted `readThemeHint` corrected to name `ThemeHint`/`writeThemeHint` instead. |
| `web/src/ws.ts` | modified | Dead `onConnected` handler and dead `stop()`/`stopped` reconnect-guard deleted (Minor 3 — no production caller for either; `scheduleReconnect` simplified to match). |
| `web/src/shortcuts.ts` | modified | Dead `SHORTCUT_HELP` export deleted (Minor 3 — no production caller; it also hand-duplicated `BINDINGS`). |
| `web/src/features/settings.ts` | modified | `initSettings` returns `void` instead of a `SettingsDialogController` `main.ts` discarded (Minor 2). |
| `web/src/features/settings.ts`, `web/src/features/issue.ts`, `web/src/features/launch.ts` | modified | `initSettingsDialog`/`initIssueDialog`/`initLaunchModal` un-exported (module-private — each has exactly one, in-file caller; Minor 2). |
| `web/src/render/confirm.ts` | modified | `renderEndDialogBody`/`renderRemoveDialogBody` un-exported (Minor 2 — no external/test caller). |
| `docs/features/{rail,theme,reader,surfaces}/spec.md` | modified | `web:` globs extended to cover the three new files (`sessions/reorder*.ts` → rail; `dragmime*.ts` → rail + surfaces; `storage*.ts` → theme + reader) — `make check-kb` flagged all three as unowned before this. |
| `.claude/rules/{rail,reader,surfaces,theme}.md`, `docs/features/{rail,reader,surfaces,theme}/INDEX.md` | regenerated | `make gen-kb` output from the spec.md glob edits above. |

## Decisions

- design: `sessions/reorder.ts`'s `insertAtDragTarget<T>` — `rg -n "splice\(targetIndex" web/src/sessions` before this change showed exactly the two hand-written copies the finding named (`railorder.ts:53`, `live.ts:145`), nothing generic already did this. It lives in `sessions/` (not a new top-level module) because both callers are already `sessions/` modules and neither imports the other today — putting it there needed no new cross-directory edge.
- design: `web/src/storage.ts` and `web/src/dragmime.ts` are new top-level "leaf" modules (matching `dom.ts`/`theme.ts`/`shortcuts.ts`'s existing shape in `kb:diagram/web-components`), not homed inside either consumer's directory, because neither consumer may own the other: `storage.ts` serves `theme.ts` (top-level) and `reader/memory.ts` (a different directory); `dragmime.ts` serves `render/dragreorder.ts` and `terminal/pane.ts`, and putting it in either would recreate exactly the cross-directory edge being removed. `rg -n "DRAG_MIME|StorageLike"` before this change showed no existing shared home for either.
- deviation: `basename`'s canonical implementation is the trailing-slash-stripping one (`sessions/card.ts`'s, now also `reader/paths.ts`'s) rather than `reader/paths.ts`'s original non-stripping one. The layering in `kb:diagram/web-components` is one-directional — `reader/` → `sessions/` (already true via `reader/freshness.ts` → `sessions/format.ts`) — so the canonical function had to live in `sessions/`, the lower layer, not the reverse; `sessions/card.ts`'s version already had real behaviour (`repoLine`'s directory-basename fallback) that the finding's own wording ("keep the trailing-slash-stripping behaviour wherever callers rely on it") says to keep. This changes `reader/paths.ts`'s `basename("/Users/bob/plans/")` from `"/Users/bob/plans/"` (unchanged) to `"plans"` (stripped) — sanctioned breakage, `reader/paths.test.ts` pins the old value (see Handoff). No real caller passes a directory path with a trailing slash to `reader/paths.ts`'s `basename` (both its callers pass markdown file paths), so this is not an observed behaviour change in the shipped app. → ADR: pending.
- deviation: `ws.ts`'s `stop()` (and the `stopped` reconnect-guard it set) is deleted, not just `onConnected`. `rg -n "\.stop\(\)" web/src --glob '!*.test.ts'` found zero production callers; the only caller was `ws.test.ts`'s own dedicated `"stop() prevents any further reconnect attempt"` test. The finding named this method explicitly as dead (b-webcore Minor 3, `ws.ts:86`), so it is removed with its guard rather than left half-dead (a `stopped` flag that can now only ever be `false`) — sanctioned breakage, listed in Handoff. → ADR: pending.
- `render/tiles.ts`'s `updateTile` is **not** removed despite Minor 2 naming it alongside the dead-export list: `rg -n "\bupdateTile\(" web/src --glob '!*.test.ts'` shows a real external caller (`features/tiles.ts:236`), and unlike the truly-dead `updateSessionCardElement` (an identical-signature pass-through), `updateTile(refs, session, now)` narrows `TileRefs` to the bare `root: HTMLElement` `updateTileChrome` needs — `buildTile` calls `updateTileChrome` directly with a local `root` before `TileRefs` exists, so the two callers genuinely need different parameter shapes. Kept as-is.
- `features/settings.ts`'s exported `SettingsDialogController` interface is left exported even though nothing outside the file imports it now that `initSettings` returns `void` — not named in any finding, and every other controller module in `features/` exports its own `*Controller`/`*Handle` interface the same way regardless of external use, so removing just this one export would diverge from the sibling shape rather than match it (`docs/conventions.md` § Design "Match the siblings").
- doc-delta: `kb:diagram/web-components`'s `Rel(reader, ...)` and `Rel(terminal, render, ...)` edges are now stale. Concretely: (1) `reader/notice.ts` no longer imports from `render/masthead.ts` (it imports `ConnectionStatus` from `app.ts` instead) — this was one of the two edges e-webui's Note 2 named as forming the `render/`↔`reader/` cycle (the other, `render/reader.ts`/`diagrams.ts`/`diagramdialog.ts` importing from `reader/`, is untouched and still a real edge, so the cycle isn't fully closed, only this contributor is removed). (2) `terminal/pane.ts` no longer imports from `render/dragreorder.ts` (now imports `DRAG_MIME` from the new top-level `dragmime.ts`) — this removes the `Rel(terminal, render, "drag MIME")` edge entirely, one half of the `render/`↔`terminal/` cycle e-webui's Note 2 also named (the other half, `render/tiles.ts`/`render/mainhead.ts` importing `terminal/surfaceswitch.ts`'s `buildSurfaceSegment`, is W6's to move per the plan's Minor 17). (3) `app.ts` no longer imports from `render/masthead.ts` at all (the `Rel(app, render, "status type")` edge is gone — `ConnectionStatus` now lives on `app.ts` itself, and `render/masthead.ts` imports it back).
- Every REQ this unit's findings named (Seed B4/B5, Major 2, Major 4, Minor 3, Minor 5, Notes 6/7/8 in d-webcore; Seed B4/B5, Major 1, Minor 2, Minor 9 in e-webui) is addressed above; nothing was left deliberately undone.

## Handoff

**Build status**: `npx tsc --noEmit` does **NOT** exit 0 — 7 errors, all in test files, all sanctioned dead-export/rename breakage from this unit (none in `web/src` implementation code — verified: `npx tsc --noEmit 2>&1 | grep 'error TS' | grep -v '\.test\.ts'` → 0 lines). `npx vite build` (the actual bundle) succeeds standalone; `make web-build`'s combined `tsc && vite build` fails only because of the same 7 test-file errors.

Test files needing changes (not made here — "impl agents never edit tests"):

1. **`web/src/sessions/format.test.ts`** — imports `formatEndedAge`, `formatEndedAgo` from `"./format"` (both deleted/renamed). Update to `formatAge` (10 call sites across the `formatEndedAge` describe block) and `ageAgo` (2 call sites in the `formatEndedAgo` describe block); the two describe block titles/comments also name the old function names.
2. **`web/src/theme.test.ts`** — imports `readThemeHint`, `type ClaudeFamily` from `"./theme"` (both deleted). The entire `readThemeHint (REQ-11, W10)` describe block (7 tests) and the `writeThemeHint` describe's `"round-trips through readThemeHint"` test (1 test) need deleting — they pinned only the now-removed export. `ClaudeFamily` needs importing from `./protocol/theme` instead (used at line 17 for a type annotation).
3. **`web/src/ws.test.ts`** — `makeHandlers()`'s return type (`WsClientHandlers & Record<string, ReturnType<typeof vi.fn>>`) absorbs the now-unknown `onConnected: vi.fn()` field through its index signature, so that line alone doesn't error; the actual `tsc` failure is `ws.test.ts(447,12): error TS2339: Property 'stop' does not exist on type 'WsClient'`. The `"calls onConnected when the socket opens..."` test and the `"stop() prevents any further reconnect attempt"` test both need deleting — they pinned only the now-removed handler/method.
4. **`web/src/shortcuts.test.ts`** — the `"SHORTCUT_HELP (REQ-12)"` describe block (imports `SHORTCUT_HELP` via a dynamic `await import("./shortcuts")`) needs deleting — pinned only the now-removed export.
5. **`web/src/reader/notice.test.ts`** — `import type { ConnectionStatus } from "../render/masthead"` needs repointing to `../app`. Type-only import; passes at runtime today (vitest doesn't typecheck), fails only under `tsc`.
6. **`web/src/reader/paths.test.ts`** — `"returns the path itself for a trailing-slash path with nothing after it"` now fails at runtime (not a compile error): `basename("/Users/bob/plans/")` now returns `"plans"` instead of the path unchanged, per the `basename` deviation above. Update the expected value (or remove the case if the reader is judged never to see a directory path).

### Gate tails

```
$ npx tsc --noEmit
(7 errors, all in the 6 test files listed above — 0 in web/src implementation code)

$ npx vite build   (the actual embedded bundle, standalone)
✓ built in 1.59s
(pre-existing >500kB chunk warnings — mermaid/katex/cytoscape/elk vendor chunks — unrelated to this unit)

$ make web-lint
cd web && npm run -s lint
Checked 220 files in 185ms. No fixes applied.

$ make web-test
 Test Files  5 failed | 55 passed (60)
      Tests  24 failed | 1819 passed (1843)
(all 24 failures are the sanctioned breakage above — sessions/format.test.ts x10, theme.test.ts x10, ws.test.ts x2, shortcuts.test.ts x1, reader/paths.test.ts x1)

$ make web-build
(fails: tsc && vite build — the same 7 sanctioned test-file tsc errors block the combined script; vite build alone succeeds, see above)

$ make check-kb
kb: 425 records, 23 features, 2 problem(s)
internal/server/respond.go: owned by no feature   <- daemon file from another unit (D4), not touched here, acceptable per this unit's brief
internal/store/migratetest/migratetest.go: owned by no feature   <- pre-existing daemon file, unrelated to this unit
(0 problems from web/src — the 3 new files (storage.ts, dragmime.ts, sessions/reorder.ts) are now covered by the spec.md glob edits above)

$ python3 .claude/skills/orchestrate/scripts/dead-refs.py
dead-refs: 371 references checked, 0 missing

$ make size-warn (informational, never a gate)
web/src/render/sessions.ts: 524 lines (was 564 before this unit — shrank via the updateSessionCardElement removal, still over the 500-line filelen threshold; the plan's own e-webui Note 6 already assigns the rest of the shrink to Major 5/B9/B10/B11, which are W6's)
web/src/features/reader.ts, web/src/render/reader.ts: unchanged size class (both already over threshold before this unit; this unit added a handful of lines to each, not the cause)
```
