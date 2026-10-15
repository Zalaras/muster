# Web Implementation: focus-lands

**Plan**: focus-lands
**Mode**: initial
**Pack**: not recorded (small track; brief taken from plan.md and test-specs.md)

## Changes

| File | Action | What and Why |
|------|--------|--------------|
| `web/src/render/context.ts` | modified | REQ-1: known branch builds track/percent/tokens once, then updates those nodes in place (class `hot`, fill width, texts, compaction counter added/removed); rebuilt only when absent or after an unknown render |
| `web/src/render/update.ts` | modified | REQ-3: in-flight check sets `aria-disabled="true"` (plus existing `aria-busy`) instead of `disabled`; `disabled` only when `!checkEnabled && !checkBusy` (canCheck false) |
| `web/src/style.css` | modified | `.btn[aria-disabled="true"]` shares the `.btn:disabled` look; both `.btn` hover rules gain `:not([aria-disabled="true"])` |
| `web/src/app.ts` | modified | new event `surfaceSwitched(id, kind)` |
| `web/src/features/surfaces.ts` | modified | emits `surfaceSwitched` after a claude/docs switch renders and after a shell spawn resolves and renders; its own listener focuses the claude/shell terminal |
| `web/src/features/reader.ts` | modified | `ReaderInstance.focusBody()`; listener focuses `article.md` for `docs` |
| `web/src/render/surfaceseg.ts` | modified | `focusIsOnSwitchOrPage(active)` guard |

## Decisions

- REQ-1 / REQ-2 / REQ-3 all done; the tile header `.ctxinfo` shares `renderContextRow`, so it is in place too (no E2E covers it; left to review).
- design: focus after a switch travels as an app-bus event, not a `SurfacesDeps` callback into reader. Precedent: `themeChanged` (surfaces and reader both react without a deps edge; `rg "themeChanged" web/src/app.ts` shows the comment naming exactly that). A deps thunk would have changed `initSurfaces`'s signature and broken `surfaces.test.ts`.
- design: the focus guard (R1) lives in each listener, after the target lookup, not in `surfaces.select`: `surfaces.test.ts` runs without a DOM, and `select` there reaches the emit with no surface mounted, so no `document` read happens. Guard = `focusIsOnSwitchOrPage`: a `.surfseg` descendant, `<body>` or null; anything else is left alone. Applies to the sync claude/docs switches too (always true there).
- design: `focusSelected` (rail click, launch) is unchanged, so a rail click on a docs-selected session still focuses nothing (kb:adr/focus-rail-click-focuses-terminal unchanged).
- design: `renderContextRow` keeps its signature; `knownRowOf` recognises a prior known render structurally (first child `.ctx`, then percent and tok spans, optional `.compact`), so callers (`render/sessions.ts`, `render/tiles.ts`) are untouched and no ref cache is needed. Text is written only when it differs.
- design: `update.ts` view model unchanged; `disabled`/`aria-disabled` split derived from `checkEnabled` and `checkBusy`. `check()`'s in-flight guard is what ignores a press.
- R1 (spawn resolving after the developer moved focus to a field) is implemented but not measured by any test; edge case 5 is untested per the plan.
- Size warnings: `features/reader.ts` was already over 500 (now 672, +10 lines); not split.

- doc-delta: none beyond the plan's Doc Delta; add that `surfaceSwitched` is the in-app event carrying the focus move, if the surfaces spec lists app events.

## Handoff

**Build status**: `npx tsc --noEmit`, `npm run build`, `npm run -s lint` exit 0; `npx vitest run`: 93 files, 2622 tests passed.
**E2E smoke**: `npx playwright test rail-cards.spec.ts plain-shell.spec.ts update.spec.ts -g 'in place|moves keyboard focus into|keeps focus on it'` -> 4 passed. Wider run (rail-cards, plain-shell, update, gauges, terminal, reader, tiles) -> 171 passed; earlier run adding views.spec.ts -> 176 passed.
No test files needed changes. web-tests may add a `context.test.ts` case for the compaction counter appearing on a later render (edge case 2); that needs a DOM the Vitest config lacks.
