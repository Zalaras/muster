# Web Implementation: order-sidebar

**Plan**: order-sidebar
**Mode**: initial

## Changes

| File | Action | What and Why |
|------|--------|--------------|
| `web/src/protocol.ts` | edited | `Session.pinned`/`railPos` (required, never null); `RailSort` type; `Prefs.railSort` (defaults `"manual"` when the wire key is absent, same pattern as `usageModel`); `parseSession`/`parsePrefs` validate/default accordingly. |
| `web/src/api.ts` | edited | `pinSession(id, pinned)` → `PUT /api/sessions/{id}/pin`; `putSessionOrder(ids, pinnedCount)` → `PUT /api/sessions/order`; `PrefsRequest.railSort`. Both new calls follow `putPrefs`'s no-optimistic, 204-or-error shape. |
| `web/src/sessions/sort.ts` | edited | `orderRail(sessions, mode)`: pinned block first (by `railPos`/`id`) in both modes; `manual` orders the rest the same way, `attention` orders the rest via the existing `sortSessions`. Never mutates input. |
| `web/src/sessions/railorder.ts` | created | Pure `moveCard(ordered, draggedId, targetId)` — insert-and-shift at the target's original index (mirrors `sessions/live.ts`'s `moveTile`, including its "index from the original array" requirement), dragged entry inherits the target's `pinned` value, returns `{ids, pinnedCount}` or `null` for a self-drop/absent id. |
| `web/src/sessions/card.ts` | edited | `CardViewModel.pinned` (from `session.pinned`), consumed by `render/sessions.ts`. |
| `web/src/render/sessions.ts` | edited | `SessionAction` gains `"pin"`; pin button wiring (click → `stopPropagation` + `onAction("pin", id)`, wired once at build time); pin button `aria-label`/`aria-pressed`/`title`/`data-action`/`data-id` refreshed every pass; card `className` gains `pinned`/`pinned-last`; card `draggable` attribute set explicitly `"true"`/`"false"`; `reconcileCards`/`renderSessions`/`buildSessionCardElement`/`updateSessionCardElement` gain trailing `draggable`/`pinnedLast`(/`pendingFocus`) parameters, all defaulted so existing callers/tests compile unchanged. |
| `web/src/render/tiles.ts` | edited | `renderStrip` passes `draggable=false` explicitly into `reconcileCards` (REQ-13: a strip card is never draggable regardless of rail sort mode). |
| `web/src/render/dragreorder.ts` | created | Generalised delegated drag-to-reorder module (`installDragReorder(container, {itemSelector, handleSelector?, onMove})`), factored out of `tiledrag.ts`'s original logic verbatim (pre-blur focus capture, foreign-drag tolerance, drop-target tracking). No `Session`/store import (W11). |
| `web/src/render/tiledrag.ts` | rewritten | Now a thin wrapper: `installTileDrag(gridEl, onMove)` calls `installDragReorder(gridEl, {itemSelector: "article.tile", handleSelector: ".thead", onMove})`. Exported signature unchanged — `tiledrag.test.ts` passes unchanged (W12, verified). |
| `web/src/main.ts` | edited | `railSort` state (from `prefs.railSort`); `#rail-sort` element + change handler → `putPrefs({railSort})`; `orderRail` used at the rail render, strip render, and default-focus-fallback call sites (REQ-6's three named consumers); `dispatchAction` gains a `"pin"` branch → `doPin` (no confirm dialog, matches Resume's directness); `installDragReorder` installed once on `#sessions` (whole card is the handle, no `handleSelector`) → `moveCard` → `putSessionOrder`, with `pendingRailFocus` threaded to the next `renderSessions` call exactly as `pendingTileFocus` is for tiles. |
| `web/index.html` | edited | `#rail-sort` select (`Manual`/`Attention` options) added to `.railhead` after `#rail-count`; `<button class="pin">` appended to `session-card-template`'s `.r1`. |
| `web/src/style.css` | edited | `.railhead .sel` (bordered select, distinct from the masthead's chrome-stripped `.usage-model-select` — see Decisions); `.card .pin` (opacity hover/focus-within/`.pinned` reveal, same scoping precedent as `.card .acts-row`); `.card.pinned-last` (1px `--line2` rule, `.strip .card.pinned-last` uses `border-right` instead since the strip lays cards side by side); `.card[draggable="true"]`/`.card.dragging`/`.card.drop-target` (neutral `--line2` only, mirrors `.tile.dragging`/`.tile.drop-target`). |

## Decisions

- **Token substitution for the pin glyph.** The plan's DOM section says "`--fg-muted` idle / `--fg` when pinned or hovered", but no such tokens exist in `style.css`'s `:root` block (`rg` confirmed only `--paper`/`--muted`/`--dim` for text hierarchy). Mapped to `--dim` (idle) / `--paper` (pinned or hovered) — the same tier of tokens `.usage-model-select` already uses for its own idle/active states.
- **`#rail-sort` styling: not the masthead's `.usage-model-select` class.** That class deliberately strips all chrome so the control blends into a plain-text readout label (its own doc comment: "never as a distinct form control"). `#rail-sort` sits beside a real `.btn` ("New session") in `.railhead` and is meant to read as an explicit toggle, so it gets its own minimal bordered `.railhead .sel` rule instead (the plan's own fallback option).
- **`moveCard`'s target-index math copies `moveTile`'s exact convention, not a filtered-array index.** First attempt indexed the already-filtered array and gave the wrong worked-example result. Verified by hand against `live.test.ts`'s pinned worked examples (`moveTile([1,2,3,4],1,3) → [2,3,1,4]`) — the target's index must be read from the array with the dragged entry still present, then spliced into the post-removal array at that raw index (see `live.ts`'s own comment on why the reverse is wrong). Re-derived and hand-traced `moveCard` against six boundary cases (dragging across the pinned/unpinned seam in both directions, dragging into a single-member block) to confirm the pinned/unpinned blocks stay contiguous in the result; documented the proof sketch in the function's doc comment.
- **`pendingRailFocus` reuses the tiles' pre-blur-snapshot mechanism, consumed by the *next* render regardless of source.** Unlike `pendingTileFocus` (consumed synchronously on the same tick, since tile order is optimistic/local), the rail has no optimistic reorder — `onMove` never calls `render()` itself, so the stashed snapshot sits until whichever render happens to run next (normally the incoming `sessionUpsert`, occasionally the 1s tick if the request is slow/fails). This matches the plan's explicit instruction ("threaded to the next render's restore exactly as the tiles path does") and the "no optimistic reorder" constraint; a failed request or a slow round-trip leaves a small window where a stale snapshot could be consumed by an unrelated tick, but `restoreFocusedControl`'s existing no-op guard (`activeElement === captured.element`) makes this an at-worst rare, low-severity edge case, not something the plan asked me to fix further.
- **`pinned-last` computed as a `className`-string flag (`pinnedLast`), not `classList.toggle`.** First implementation used a second `classList.toggle` pass over already-built cards; running the full Vitest suite (`npx vitest run`) surfaced 4 real failures in `render/sessions.test.ts` — `TypeError: Cannot read properties of undefined (reading 'toggle')` — because that file's hand-rolled `FakeDomNode` test double (used across `reconcileCards`'s existing focus-capture tests, which I may not edit) has no `classList`, only a settable `className` string (the same primitive `updateSessionCardContent` already writes everything else through). Refactored to precompute the last-pinned id before the main loop and fold `pinned-last` into the existing single-pass `className` string, matching the codebase's existing convention (`grep -n classList web/src/render/sessions.ts web/src/render/tiles.ts web/src/main.ts` returned no other consumer before this change) — this is a same-behavior implementation swap, not a shipped-markup deviation, so no test-double sanctioned-breakage was needed here. Re-ran `npx vitest run` after the fix: the 4 failures are gone (see Handoff for the remaining, unrelated, sanctioned ones).
- **`focusNth` (⌘1–9) left on `sortSessions`, not switched to `orderRail`.** REQ-6 names exactly three consumers ("The rail, the Tiles strip and the default-focus pick") — `focusNth` isn't one of them. Implemented literally as specified rather than guessing the plan meant to include it; flagging here per the "say so, don't silently substitute" rule in case this was an oversight the orchestrator wants corrected.
- **Testable UI Elements table: no unimplementable rows.** Every row (`#rail-sort` combobox, pin button role/name/aria-pressed, rail/strip card `data-testid`/`draggable`/`pinned`/`pinned-last`, drop-target class) is honoured exactly as specified with native/attribute-based semantics — no substitutions needed.

## Handoff

**Build status**: `npx tsc --noEmit` and `npm run build` do **NOT** exit 0 — both fail at the `tsc` step, exclusively on pre-existing test files whose Session/Prefs fixtures now lack the plan's newly-*required* wire fields (`Session.pinned`/`railPos`, `Prefs.railSort`). Verified: `npx tsc --noEmit 2>&1 | grep "error TS" | grep -v '\.test\.ts'` → **0 lines** (no non-test source errors); `npx vite build` (bundler alone, bypassing tsc) → succeeds (`✓ built in 186ms`, `dist/` produced), confirming the implementation code itself is sound and the only blocker is these test fixtures. This is the sanctioned-breakage case the agent brief calls out (m3-gauges precedent: a plan's approved protocol delta adding required fields collides with existing fixtures) — I did not touch these files beyond what's listed above, per the "impl agents never edit tests" rule.

Files `web-tests` needs to update (add `pinned: boolean`/`railPos: number` to every `Session` fixture builder; add `railSort` to every `Prefs`/raw-JSON `prefs` fixture where present):
- `web/src/api.test.ts` (compile + runtime — `launchSession`/`endSession`/`resumeSession` decode a mocked JSON response missing the new keys)
- `web/src/protocol.test.ts` (runtime only — raw JSON `session`/`prefs`/`snapshot` fixtures now rejected by `parseSession`/`parsePrefs`'s required-field checks; 24 assertions currently fail)
- `web/src/render/dead.test.ts` (compile-time)
- `web/src/render/sessions.test.ts` (compile-time)
- `web/src/render/tiles.test.ts` (compile-time)
- `web/src/sessions/card.test.ts` (compile-time)
- `web/src/sessions/live.test.ts` (compile-time)
- `web/src/sessions/sort.test.ts` (compile-time)
- `web/src/sessions/store.test.ts` (compile-time)
- `web/src/ws.test.ts` (compile + runtime — 2 assertions currently fail on the extra `railSort`/wire-field keys)

New pure logic (`orderRail`, `moveCard`) and the pin/draggable/pinned-last DOM wiring have no unit coverage yet — that's `web-tests`'s job per the pipeline (W3–W18 in the plan's Acceptance Criteria).

**Say plainly**: the build currently fails (`npx tsc --noEmit` exits 1), solely because of the 10 test files listed above needing their Session/Prefs fixtures extended for the plan's new required wire fields — not because of any defect in the implementation files I changed.

## Fix Attempt 2 (review cycle 2)

**Issue addressed**: Review issue 1 (Major, `[orchestrator:decision]`) — "⌘1–9 no longer selects the card the user sees." `focusNth` (`web/src/main.ts:290`) still ranked by `sortSessions`, while the rail, strip and default-focus pick all went through `orderRail`. Decision `plans/order-sidebar/decisions/cmd-n-ordering/decision.md` settled on **Option A**: ⌘N follows the rail — `focusNth` uses `orderRail(store.values(), railSort)`.

**Changes made**:
- `web/src/main.ts`: `focusNth` (~line 290) now builds its candidate list with `orderRail(store.values(), railSort)` instead of `sortSessions(store.values())`. `railSort` is the same module-level state (`"manual"` | `"attention"`) the rail/strip/default-focus already read, so ⌘1–9 now indexes into whichever order the rail is currently displaying.
- Doc comment above `focusNth` rewritten to explain the rail-following behaviour and cite the decision (Option A).
- Doc comment above the `keydown` listener (~line 748, the ⌘\ / ⌘1–9 block) extended to note that ⌘1–9 selects the nth card in the rail's *current* order via `orderRail`, not a fixed priority sort.
- Removed the now-unused `sortSessions` import from `web/src/main.ts` (it was imported only for `focusNth`; `sort.ts` still exports it for `orderRail`'s own attention-mode branch and for `sort.test.ts`).

**Every code path that reaches ⌘1–9, enumerated**:
1. **Keydown handler** (`window.addEventListener("keydown", ...)`, ~line 749): captures `⌘` + digit 1–9, calls `focusNth(n)`. Unchanged in this fix — it only ever calls `focusNth`, so fixing `focusNth` itself covers this entry point.
2. **Focus branch inside `focusNth`** (`view === "focus"`): sets `focusedId = session.id` where `session` now comes from `orderRail(store.values(), railSort)[n - 1]`. Now uses `orderRail`.
3. **Tiles/promote branch inside `focusNth`** (`else` branch, `view === "tiles"`): calls `promoteSession(session.id)` with the same `session` drawn from the same `orderRail`-ordered array — so the Tiles promote-via-shortcut path goes through the identical fix, not a separate implementation. `promoteSession` itself (line ~280) was already correct/unchanged; only the id it receives needed to change.

All three paths funnel through the single `sorted` array built once at the top of `focusNth`, so there was exactly one call site to change, not three parallel ones.

**Verification**:
- `make web-build` → `tsc --noEmit && vite build` → exit 0 (`✓ built in 171ms`, `dist/` produced).
- `make web-test` → `vitest run` → `Test Files 19 passed (19)`, `Tests 549 passed (549)`.

**Sanctioned breakage for e2e-specs**: `web/e2e/views.spec.ts:69`, test "Cmd+\\ toggles the view and Cmd+1 focuses the top-priority session regardless of launch order (E7)" — its Cmd+1 assertion encodes the old "focus the attention-priority session regardless of rail order" behaviour, which Option A deliberately replaces. This is the exact test the decision doc names as "advocate-b's only evidence" and the repair class already applied to `actions.spec.ts` #3–#5 (select Attention mode before the priority assertion, assertion preserved verbatim) is the prescribed fix, per the decision's "Decisive argument". `tsc --noEmit` covers `web/e2e/**` and passed cleanly (this is a runtime/behavioural break, not a compile break), so the `make web-build`/`make web-test` gate stays green even with E7 unrepaired — e2e-specs still needs to apply the repair before `make e2e` will pass.
