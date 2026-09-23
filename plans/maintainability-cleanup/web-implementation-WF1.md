# Web Implementation: Maintainability Cleanup (WF1)

**Plan**: maintainability-cleanup
**Mode**: initial (unit WF1 only)
**Pack**: not fetched — unit prompt named the two findings directly (`review.maintainability.e-webui.md` Minor 8, Note 4); no `kb pack` run for this narrow fix

## Changes

| File | Action | What and Why |
|------|--------|--------------|
| `web/src/features/surfaces.ts` | edited | `select`'s shell-spawn round trip now carries a per-session stale-response guard (`selectRequestId: Map<number, number>`), matching the shape of `launch.ts`'s `browseRequestId` / `issue.ts`'s `captureRequestId`. A newer `select(id, …)` for the same id bumps the counter; the `createShell(id).then(...)` callback drops if a newer selection landed first. The failure-notice branch was extracted into `reportShellSpawnFailure` to keep `select`'s cognitive complexity under Biome's ceiling once the guard was added. The counter entry is deleted in the existing `sessionRemoved` handler alongside the other per-session state it already tears down. |
| `web/src/features/update.ts` | edited | `check()` now calls `app.render()` both when it flips `checkState.inFlight = true` (so the button greys out / shows busy immediately) and when the `checkForUpdate()` promise settles (so a failed check's reason and the re-enabled button appear immediately instead of waiting for the next 1 s tick). |

## Decisions

- design: `reportShellSpawnFailure(id, error, findDeadRefs)` in `features/surfaces.ts` — pulled the shell-spawn failure branch (console.error + live-surface-notice-or-dead-refs) out of `select`'s `.then` callback purely to bring cognitive complexity back under 15 after adding the stale-response check; it does one thing (report a failed spawn) and is called from the one call site. Grepped for an existing "report API failure to a surface or dead-notice" helper first — `rg -n "showDeadSurfaceNotice|showNotice\(" web/src` — only the two call sites in this same function already did this inline; nothing else to reuse.
- design: `selectRequestId` is a `Map<number, number>` keyed by session id, not a single counter like `browseRequestId`/`captureRequestId`. Those two guard one in-flight dialog/navigation at a time; `select()` is called across independent sessions concurrently (Focus and Tiles can each have a session mid shell-spawn), so a single shared counter would wrongly invalidate session B's pending spawn when the user merely switches session A's surface. Owner: `initSurfaces`'s closure, same lifetime as `surfaces`/`surfaceSwitchState`; cleared per-id in the existing `sessionRemoved` handler (`features/surfaces.ts:206-220`) so it doesn't grow unboundedly across a session's lifetime.
- The `update.ts` fix renders on both sides of the async gap (set `inFlight = true` then render; settle then render), matching `features/issue.ts`'s `takeCapture`, which calls `renderPreview()`/`updateSubmitEnabled()` immediately before the await and again after it resolves. The cited note only named the settle side (`:89-92`), but the set side has the identical missing-render defect (the button wouldn't grey out until the next tick either) and is one line — fixed as part of the same category, not a separate behaviour.
- No `docs/` changes proposed; both fixes are internal to the two functions and change no wire shape, no user-visible string, and no protocol field. No `doc-delta`.

## Handoff

**Build status**: `npx tsc --noEmit` and `npm run build` (via `make web-build`) exit 0.

**Gate output tails**:
- `make web-lint`: `Checked 185 files in 179ms.` — 0 errors (the initial run flagged `noExcessiveCognitiveComplexity` at 16/15 on the un-refactored `select`; resolved by the `reportShellSpawnFailure` extraction above).
- `make web-test`: `Test Files 45 passed (45)` / `Tests 1841 passed (1841)` — no existing test needed changes, none broken.
- `make web-build`: built in 1.65s, exit 0 (only the pre-existing mermaid chunk-size warning, unrelated to this change).

**Tests web-tests should add** (no test-specs.md exists for this plan; these are new-behaviour unit tests, not fixes to existing ones):

1. `features/surfaces.ts` `select` stale-response guard — drive it the same way `launch.ts`'s `navigate` guard is tested (grep that spec file for the pattern). Sequence:
   - Session 1 is attachable and not currently on `shell`. Call `select(1, "shell", …)` — this issues `createShell(1)` but do not resolve it yet (hold the promise).
   - Call `select(1, "docs", …)` — this is a pure/sync selection, no round trip; `getSurfaceState(state, 1).selected` is now `"docs"`.
   - Resolve the held `createShell(1)` promise with `{ ok: true, value: { … } }`.
   - Assert `getSurfaceState(state, 1).selected` is **still** `"docs"`, not `"shell"` — this is the exact defect Minor 8 describes; on the pre-fix code this assertion fails (selection flips back to `shell`).
   - A second case: two different session ids' shell-spawns in flight concurrently, one resolves — assert the *other* session's pending spawn is unaffected (guards against a global-counter regression, since the fix is per-id).

2. `features/update.ts` `check()` render-on-settle — construct with a fake/spy `App` (however the existing update.ts spec already fakes `app.render`/`app.onRender`; grep for it) and:
   - Call `check()`. Assert `app.render` was called once synchronously (the `inFlight = true` path) *before* the `checkForUpdate` promise resolves.
   - Resolve `checkForUpdate()` with a failure result.
   - Assert `app.render` was called again after the microtask settles — on the pre-fix code, `render` is called zero or one times total (never after settling), so this second assertion is the one that catches the regression.

Both fixtures already exist in shape in the current specs for `launch.ts`/`issue.ts` (guard) and `update.ts` (render call) — no new fixture machinery, no `?` fields added to production types.
