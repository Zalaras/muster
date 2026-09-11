# Web Implementation: Code Breakup

**Plan**: code-breakup
**Mode**: initial

## Changes

| File | Action | What and Why |
|------|--------|--------------|
| `web/src/app.ts` | created | REQ-3: `createApp()` — `SessionStore`, shared `AppState` (view/density/railSort/focusedId/connection), a typed `on`/`emit` event bus, ordered `onRender` phases, `render()`, `focus()`. |
| `web/src/dom.ts` | created | REQ-2/W13: `requireElement`/`requireElements`, moved out of `main.ts`. |
| `web/src/features/connection.ts` | created | Connection status, banner, protocol mismatch, Claude version readout; owns `everConnected`. |
| `web/src/features/actions.ts` | created | End/Resume/Remove/Pin dispatcher, confirm dialogs, dead-pane cache, `handleRemoved` (store.remove + `sessionRemoved` fan-out + render). |
| `web/src/features/focus.ts` | created | Focus view: mainhead, main slot, dead surface, sizenote, default focus, `nth`/`neediest`. |
| `web/src/features/surfaces.ts` | created | `TerminalSurface` manager: open/close diff (render phase 7), surface-switch state, `select`/`get`/`applyTheme`/`focusSelected`. |
| `web/src/features/tiles.ts` | created | Grid reconcile, strip, tile drag, density application, promote; owns `tilesLive`. |
| `web/src/features/rename.ts` | created | Mainhead rename editor + shared `tileRenameHandlers`. |
| `web/src/features/views.ts` | created | Focus/Tiles switcher, density buttons, view containers' `hidden`; owns `app.state.view`/`density`. |
| `web/src/features/rail.ts` | created | Rail cards, count, sort select, drag reorder. |
| `web/src/features/usage.ts` | created | Usage gauges, model-week select, refresh button. |
| `web/src/features/update.ts` | created | Updates section, restart confirm, Settings badge, apply handlers. |
| `web/src/features/theme.ts` | created | `themeChoice`/`claudeFamily`, `<html>` attributes, first-paint hint. |
| `web/src/features/shortcuts.ts` | created | Window keydown → toggle-view/focus-nth/focus-neediest dispatch. |
| `web/src/features/launch.ts` | moved (`git mv` from `render/`) | Gained `initLaunch(app, deps)`; fixed a stale same-directory `./crumbs` import (now `../render/crumbs`, correct after the move). |
| `web/src/features/settings.ts` | moved (`git mv` from `render/`) | Gained `initSettings(app, deps)`. |
| `web/src/features/issue.ts` | moved (`git mv` from `render/`) | Gained `initIssue(app)`. |
| `web/src/main.ts` | rewritten | Composition root only (127 lines): `createApp()`, 15 `init*` calls in dependency order, the render-phase-order block (numbered comment, W10), `WsClient` wiring per the plan's table, `installDropGuard`, the 1s tick. |
| `web/src/render/issue.test.ts` | edited (sanctioned) | Import path fix only: `./issue` → `../features/issue`. |
| `web/src/api.ts`, `web/src/shortcuts.ts`, `web/src/render/crumbs.ts`, `web/src/render/confirm.ts`, `web/src/render/rename.ts` | edited | Edge Case 17: comment citations of the three moved paths (`render/launch.ts`/`settings.ts`/`issue.ts`) updated to `features/...`. |

## Decisions

- **Construction-cycle resolution (Edge Case 13's web-side analogue).** `actions`/`focus`/`tiles`/`surfaces` have mutual runtime needs but no controller may import a sibling (W6/INV-4). Resolved two ways: (1) most cross-controller calls happen only later (a click, a render pass), never synchronously during the referencing controller's own `init` call, so a plain closure thunk (`() => laterConst.method(...)`) referencing a `const` declared further down the file is safe — JS/TS closures capture bindings, not values, and nothing dereferences the thunk before the referenced `const` exists. `main.ts` uses this for `actions`'s two deps and `tiles`'s two deps only; everyone else takes a real already-constructed value. (2) `actions.findDeadSurfaceRefs`'s original shape (checking Focus-vs-Tiles membership internally) is preserved verbatim via the same thunk mechanism rather than restructured into a parameter-passing API — kept the function's public shape identical to `main.ts`'s original `findDeadSurfaceRefs(id)`.
- **W6 also fires on `import type` from a sibling — not just value imports.** The literal automated check (`rg 'from "\./[a-z]+"'`) doesn't distinguish `import type` from a regular import. Every cross-controller `XDeps` interface is therefore typed **structurally** (the exact method/field shapes a module calls) rather than by importing the owning sibling's exported `XHandle` interface — e.g. `focus.ts`'s `FocusDeps.actions` is `{ dispatch(...): void; findDeadSurfaceRefs(...): ...; ... }`, not `ActionsHandle` imported from `./actions`. A real handle object satisfies the inline shape structurally with no cast needed. Verified: `rg -n 'from "\./[a-z]+"' web/src/features --glob '!*.test.ts'` → no output.
- **`prefs` subscriber order (views vs. tiles) resolved by reading the message, not `app.state`.** The plan's Implementation Notes says `initViews` must run before `initTiles` so tiles recomputes `tilesLive` against the *new* view/density (Edge Case 2/7). But the required render-phase order (tiles=phase 5, views=phase 9) forces `initTiles` to run before `initViews` for phase registration to land in the right array position (registration order = execution order in `app.ts`). Fix: `tiles.ts`'s own `prefs` handler reads `prefs.view`/`prefs.density` directly off the incoming message (always fresh) and compares against its own closure-held `lastView`/`lastDensity` — never against `app.state`, which may or may not have been overwritten yet depending on subscriber order. This makes the two handlers' relative order irrelevant to correctness; verified by running the moved `tiles.spec.ts`/`views.spec.ts` E2E specs live (see Handoff) including the density-promotion and reconnect-echo tests Edge Case 2/7 name.
- **Render phase 10 is registered by `main.ts`, not self-registered by `focus`/`tiles`.** REQ-2 says each controller "registers its render phase... on the app," which works cleanly for phases 1–9 (one controller, one `app.onRender` call, in construction order = phase order). Phase 10 ("focus (view) in Focus, else tiles (view) in Tiles") is inherently a dispatch between two controllers keyed on shared state; registering it inside either controller's own `init` would put it at that controller's construction position (5 or 6), not after phase 9. `main.ts` registers it explicitly, right after `initViews`, calling `focus.renderView(frame)`/`tiles.renderView(frame)`. This is the one construction-order-driven render-phase registration `main.ts` does, versus the other nine happening inside each controller's own `init`.
- **`connection.ts`'s handle API is `connected(claudeCode)`/`disconnected()`/`showProtocolMismatch()`, not literally `set(status)`+`setClaudeCode(...)`.** The plan's WsClient wiring table shows `main.ts`'s WS callback *behavior* (e.g. "`connection.set("connected")`; `connection.setClaudeCode(hello.claudeCode)`" for `onHello`) with the note "connection owns `everConnected`". Since `everConnected` must be internal to `connection.ts` (nothing else may branch on it) the ternary `everConnected ? "reconnecting" : "connecting"` can't live in `main.ts` as literally shown; `connection.ts` instead exposes one method per WS callback that already resolves the ternary internally, matching the table's stated behavior with `main.ts`'s call sites reduced to one line each (`connection.connected(hello.claudeCode)`, `connection.disconnected()`).
- **REQ-13's Go-side sub-struct grouping and REQ-11's Start/Stop-order comment are daemon-impl's concerns**, not touched here (out of scope for this agent — internal/ and cmd/ are daemon-impl's, per the orchestrator's task boundary).
- Every REQ under this plan's web Affected Files (REQ-1 through REQ-4, REQ-8's web half, REQ-9's E2E-split half already done by e2e-specs, REQ-12 is web-tests', REQ-14) is addressed above; REQ-12 (Vitest coverage for extracted pure logic, e.g. `app.test.ts`) is explicitly web-tests' job per the plan's Affected Files table, not implemented here.

## Handoff

**Build status**: `npx tsc --noEmit` and `npm run build` exit 0.

**E2E smoke check** (plan's own specs, run after `make web-build build` from the project root, which also picked up daemon-impl's already-committed Go changes):
```
npx playwright test e2e/actions.spec.ts e2e/views.spec.ts e2e/rail-cards.spec.ts e2e/tiles.spec.ts
40 passed (15.3s)
```
This is a smoke check, not the E2E gate — full-suite E1 is validate-mode's job.

**Test files needing changes I was not allowed to make:**
- `web/src/api.test.ts` — two comment lines still cite `render/launch.ts` (now `features/launch.ts`); dead-refs.py doesn't flag them (bare-word citations without a `render/launch.ts`-shaped path match its `PATH_RE`... actually they do match `render/launch.ts` textually, but `dead-refs.py`'s default scope is the diff against `main`, and `api.test.ts` is untouched by my diff, so it's not in scope for `dead-refs.py`'s current run — flagging here so web-tests can fix in wave 2 as part of its own touch to this file, or so review-work can decide it's stale-but-harmless.) I did not edit it — it's a test file and this is not an import-path breakage, so it's outside my one sanctioned edit.
- No other test file needed edits. `web/src/render/issue.test.ts`'s one-line import fix (sanctioned) is already applied.

**Sanctioned breakage**: none. `npx vitest run` (30 files, 1424 tests) passes unmodified against the refactored implementation — no test doubles needed upgrading, no expected-value tests contradicted the new module shape.

**Automated checks run** (from project root unless noted):
- `D1 go build ./...` — daemon-impl already committed; `make web-build build` succeeded.
- `W1 make web-build` — pass.
- `W2 make web-test` (`npx vitest run` from `web/`) — 30 files / 1424 tests pass.
- `W3` — `wc -l web/src/main.ts` = 127 (≤ 250).
- `W4`/`W5`/`W7`/`W13` — greps pass (no `addEventListener`/DOM-lookup/`let`|`var`/`from "./dom"` in `main.ts`).
- `W6` — `rg -n 'from "\./[a-z]+"' web/src/features --glob '!*.test.ts'` → no output.
- `W12` — `git diff --stat -- web/index.html web/src/style.css` → empty (untouched).
- `python3 .claude/skills/orchestrate/scripts/dead-refs.py` → `84 references checked, 0 missing`.

## Fix Attempt 1 (review cycle 1)

**Failures addressed**: review.md Major 1 (51 code comments still name `main.ts` as owner
of logic this plan moved into `features/`, several citing functions that no longer exist
anywhere) and Major 2 (`features/issue.ts:93`/`:146` cite the deleted `render/launch.ts`).

**Changes made**: For every surviving `main.ts` comment citation, read the module that
actually owns the behaviour today (traced call sites with `rg`/`grep`, not guessed) and
rewrote the comment to name it. Sweep basis: `rg -n 'main\.ts' web/src --glob '!*.test.ts'`
minus `main.ts` itself, `app.ts`, `dom.ts`, and the init-order comments in
`features/theme.ts`/`surfaces.ts`/`rail.ts`/`actions.ts`/`tiles.ts`/`focus.ts` (per the
review's exclusion list) — every remaining hit was fixed, by file:

| File | Sites fixed | New owner cited |
|------|-------------|------------------|
| `render/sessions.ts` | 9 (dispatcher x2, rail callback x2, `reconcileTilesGrid`, pre-blur snapshot, `focusedId`, surface-slot job x2) | `features/actions.ts` (dispatcher), `features/rail.ts` (rail callback/pre-blur snapshot/focusedId), `features/tiles.ts` (`reconcileTilesGrid`), `features/surfaces.ts` (surface-slot job) |
| `render/mainhead.ts` | 7 (button wiring, rename-editor attach x2, surfaceSwitchState, requireElement capture, disconnect-cancel) | `features/focus.ts` (button wiring/requireElement), `features/rename.ts` (editor attach/disconnect-cancel), `features/surfaces.ts` (surfaceSwitchState) |
| `terminal/surfaceswitch.ts` | 5 (built-once-at-startup, Map ownership x2, composite-key owner, same-surface short-circuit) | `features/surfaces.ts` throughout; the short-circuit is `select`, not a `handleSurfaceSelect` that no longer exists |
| `terminal/pane.ts` | 5 (surface-manager owner, shell-mount gate, shellEnded hook, applyTheme caller, focus() caller) | `features/surfaces.ts` throughout; `applyTheme()` traced to `features/theme.ts` → `features/surfaces.ts`; `focus()` traced to `features/rail.ts`'s pointer click → `features/surfaces.ts`'s `focusSelected` |
| `render/tiles.ts` | 5 (bodySlot mover, rename cancel/dispose, updateSurfaceSegment caller, rename-handlers supplier, reconciler caller) | `features/tiles.ts` (verified `cancel()`/`dispose()`/`updateSurfaceSegment` calls at tiles.ts:111-112,138-139,195), `features/rename.ts` (`tileRenameHandlers`) |
| `features/settings.ts` | 3 (renderUpdateSection caller, PUT /api/prefs owner, restart-impact owner) | `features/update.ts` (verified `renderUpdateSection`/`fetchRestartImpact` calls); the PUT is actually issued by `features/settings.ts` itself — corrected "main.ts turns this into a PUT" to "this module turns this into a PUT" |
| `render/update.ts` | 2 (applyPrefsFromSnapshot citation — dead function name, dialog-not-open-yet parenthetical) | `features/settings.ts`'s `prefs` subscription (no `applyPrefsFromSnapshot` exists anywhere post-refactor — confirmed via `rg applyPrefsFromSnapshot web/src`, zero hits before my edit too) |
| `render/tiledrag.ts` | 2 (onMove caller, `renderTilesView` citation — dead function name) | `features/tiles.ts`'s `renderView`/`reconcileTilesGrid` (confirmed via `rg renderTilesView web/src`, zero hits anywhere — the cited name never existed post-refactor) |
| one each: `theme.ts`, `api.ts`, `protocol.ts`, `sessions/store.ts`, `sessions/sort.ts`, `sessions/railorder.ts`, `sessions/live.ts`, `render/rename.ts`, `render/masthead.ts`, `render/dragreorder.ts`, `render/dead.ts`, `render/confirm.ts`, `features/launch.ts`, `features/issue.ts` | 14 | traced individually per file (see diff); e.g. `sessions/live.ts`'s "main.ts's surface manager" corrected to `features/tiles.ts` after confirming via `rg 'sessions/live'` that only `features/tiles.ts` imports it, not `features/surfaces.ts` |

`features/issue.ts:93`/`:146` (Major 2): both `render/launch.ts` citations changed to
`features/launch.ts`.

**Verification**:
- `rg -n 'main\.ts' web/src --glob '!*.test.ts'` after the fix, with justification per surviving hit:
  ```
  app.ts:4                    — still true (app.ts predates and is imported by main.ts; comment is about app.ts's own relationship to main.ts, not an ownership claim about main.ts)
  dom.ts:2                    — still true (main.ts genuinely never looks up an element — verified against main.ts's current 128 lines, no requireElement/getElementById call)
  features/focus.ts:3,39      — init-order comment, review's exclusion list
  features/focus.ts:52        — render-phase-10 dispatch; verified true against main.ts:70-73 (app.onRender registers exactly this dispatch)
  features/tiles.ts:6         — init-order comment, review's exclusion list
  features/rail.ts:3          — init-order comment, review's exclusion list
  features/theme.ts:3         — init-order comment, review's exclusion list
  features/actions.ts:6,7     — init-order comment, review's exclusion list (line 7 also describes main.ts's real closure-thunk-passing behaviour, verified against main.ts:37-40)
  features/surfaces.ts:8      — init-order comment, review's exclusion list
  ```
- `rg -n 'render/(launch|settings|issue)\.ts' web/src` → no output (zero bare-relative dead-path citations anywhere, test files included).
- `rg -n 'applyPrefsFromSnapshot|handleSurfaceSelect|renderTilesView' web/src` → no output (the three dead function names Major 1 called out are gone tree-wide, not just at the cited line).
- `cd web && npx tsc --noEmit` → exit 0.
- `make web-build` → exit 0 (58 modules transformed, build succeeds).
- `make web-test` (`npx vitest run`) → 31 files / 1446 tests pass, unmodified.
- `python3 .claude/skills/orchestrate/scripts/dead-refs.py` → `346 references checked, 0 missing`.

**Scope discipline**: only comment text changed in every edit — no runtime code, no test
file, no file outside `web/src/` touched. `git diff --stat -- web/src` shows 22 files
changed, all comment-only edits (88 insertions / 78 deletions, the delta from re-wrapping
lines after the longer feature-module names). `internal/server/issue.go` (review Major 3,
tagged `[daemon-impl]`) was not touched.
