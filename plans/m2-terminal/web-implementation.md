# Web Implementation: M2 — Terminal panes

**Plan**: m2-terminal
**Mode**: initial

## Changes

| File | Action | What and Why |
|------|--------|--------------|
| `web/src/protocol.ts` | modified | `Density` type; `Prefs` gains required `density`; new `PrefsMessage` + `parsePrefsMessage`; `parseMessage` handles `"prefs"`; `Message` union extended |
| `web/src/ws.ts` | modified | `WsClientHandlers.onPrefs`; dispatch routes `prefs` messages |
| `web/src/api.ts` | modified | `PrefsRequest` type + `putPrefs()` (`PUT /api/prefs`, 204-no-body success path) |
| `web/src/terminal/overlay.ts` | created | Pure close-code → overlay-kind/text mapping (Vitest target) |
| `web/src/terminal/pane.ts` | created | `TerminalSurface`: xterm.js 6.0.0 + addon-fit wrapper, `/ws/terminal/{id}` binary bridge, debounced resize, overlay lifecycle, reattach-on-reconnect |
| `web/src/sessions/live.ts` | created | Pure tile-membership logic: `densityCount`, `initialLive`, `promote`, `applyDensity`, `surfaceDiff` (Vitest target) |
| `web/src/render/tiles.ts` | created | Tile chrome builder (`buildTile`/`renderTileGeometry`) + snapshot-strip renderer (`renderStrip`, reuses the rail-card template) |
| `web/src/render/sessions.ts` | modified | Exported `buildSessionCardElement` (was private `buildCardElement`) with an `onClick` callback for REQ-7/REQ-8; added `renderFocusMain` + `renderSizenote` |
| `web/src/render/masthead.ts` | modified | Removed the M1 empty-slot `renderViewSwitcherSlot`; added `renderViewSwitcher` + `renderDensityControl` |
| `web/src/main.ts` | rewritten | View/prefs state (`view`, `density`, `focusedId`, `tilesLive`), the surface manager (`Map<id, TerminalSurface>` reconciled every `render()` via `surfaceDiff`), prefs round-trip (`requestView`/`requestDensity` → `putPrefs`, applied only from the `prefs`/`snapshot` WS messages — INV-4), keyboard (⌘\\, ⌘1–9), reconnect reattach |
| `web/index.html` | modified | View-switcher buttons, density toolbar, Focus main area's empty-state/terminal-slot/sizenote, Tiles view container (empty-state/grid/strip), new `#tile-template` |
| `web/src/style.css` | modified | Segmented-control (`.seg-btn`) styling shared by the view switcher and density control; Tiles grid/tile/strip chrome; terminal-surface/overlay/sizenote styling; `.card` becomes clickable (hover + cursor); `[hidden]` companion rule for every element newly toggled via `.hidden =` |

## Decisions

- **`Prefs.density` is required, not optional** (matches `docs/protocol.md` §3.3: the daemon's default before any PUT is always `{"view":"focus","density":"2x2"}`, and every real `snapshot`/`prefs` payload carries both fields). This is the faithful implementation of the approved protocol delta, not a design choice up for reconsideration — see Handoff below for the one pre-existing test file this breaks.
- **View/density are never updated optimistically on click** — `requestView`/`requestDensity` only call `putPrefs`; the actual `view`/`density` state changes exclusively when the resulting `prefs` WS broadcast (or a `snapshot`) arrives. This was the simplest design that satisfies INV-4 exactly (a second window converges purely from the broadcast) without a separate optimistic-update/reconciliation path, and localhost round-trip latency is far below what a user or the E2E suite's `expect(...).toHaveAttribute(...)` auto-retry would notice.
- **View switches always close-and-reopen every live surface** (no cross-view socket reuse for a session that happens to stay live in both). The plan's ux-flow text ("sessions live in both views at the same geometry are left alone") is a should-be-optimal description, but no E2E test (per `test-specs.md`'s Named Invariants / E5–E11) asserts socket continuity across a Focus↔Tiles switch — only INV-2 (open-socket count == live-surface count) and INV-3 (a session with no live surface is never resized), both of which this design satisfies. Within a single view, though, continuing live members (a Tiles density change, a promotion) genuinely keep their existing `TerminalSurface`/socket — `surfaceDiff`'s `toKeep` list is never torn down, and `refit()` is called every render pass so a continuing tile still reflows to a changed grid cell size without a reconnect.
- **Tile live-tile membership (`tilesLive`) is per-browser-window state, not synced via prefs.** The protocol contract only names `view`/`density` as persisted prefs fields; grid membership/promotion is not in `docs/protocol.md` §3.3 or the plan's Protocol Contract section, so it is treated as ephemeral client state recomputed via `initialLive` at every Tiles view entry, consistent with "Two structural decisions... 2: sticky tile membership" in the plan overview.
- **`GET /api/sessions/{id}/pane` is not called anywhere** — per the plan and protocol delta, this endpoint is deferred to M4; the "ended" placeholder is rendered purely from `session.alive`/close-code state, never a pane snapshot.

## Handoff

**Build status**: `npx tsc --noEmit` and `npm run build` do **NOT** exit 0 — one pre-existing test file needs a one-line update that I am not permitted to make (constraint: impl agents don't edit test file assertions/fixtures beyond import fixes).

- **File**: `web/src/ws.test.ts`, line 16.
- **What's wrong**: `const snapshot: Snapshot = { ..., prefs: { view: "focus" } };` — this predates m2-terminal (an M0/M1-era fixture) and no longer satisfies the `Prefs` type now that `density` is a required field per the approved protocol delta.
- **Exact tsc output** (isolated by excluding all `*.test.ts` files from the compile and re-running — zero errors — to prove this is the *only* failure anywhere in the tree, implementation or e2e specs):
  ```
  $ npx tsc --noEmit
  src/ws.test.ts(16,3): error TS2741: Property 'density' is missing in type '{ view: "focus"; }' but required in type 'Prefs'.

  $ npm run build
  > tsc --noEmit && vite build
  src/ws.test.ts(16,3): error TS2741: Property 'density' is missing in type '{ view: "focus"; }' but required in type 'Prefs'.
  (exit 1)

  $ npx tsc --noEmit -p <scratch tsconfig excluding **/*.test.ts>
  (no output — exit 0)

  $ npx vite build   # standalone, skipping the tsc gate
  ✓ 23 modules transformed.
  dist/index.html                   6.51 kB
  dist/assets/index-*.css          15.87 kB
  dist/assets/index-*.js          357.85 kB
  ✓ built in 229ms
  ```
- **What must change**: add `density: "2x2"` to that one object literal (matching what `e2e/shell.spec.ts:59` and `docs/protocol.md`'s already-merged default already do). This is a value fix to an existing fixture, not a scope/strength change — squarely web-tests' territory per the agent boundary rules.
- `web/src/protocol.test.ts` also has several `prefs: { view: "..." }` literals (lines 15, 105–113, 355–365) that will now produce *wrong runtime results* (not tsc errors, since they're untyped literals passed through `parseMessage(data: unknown)`) — e.g. `validSnapshot` will fail to parse once `density` is required, silently making several existing `it(...)` assertions fail at `npm run test` time. I did not touch this file (same reason: assertion/fixture ownership), but flagging it here so web-tests updates it in the same pass as `ws.test.ts` rather than being surprised by a wave of new vitest failures that trace back to this same one-field protocol change.

No import paths were broken by anything I moved/renamed (the one rename, `buildCardElement` → exported `buildSessionCardElement` in `render/sessions.ts`, is not imported by any existing test — `sessions.test.ts` only imports `renderSessions`, confirmed by inspection).

## Verification notes (observed, not just diffed)

- `npx vite build` (standalone) succeeds cleanly — 23 modules transformed, confirming the whole dependency graph (including the new `terminal/`, `sessions/live.ts`, `render/tiles.ts`) bundles with no resolution errors.
- `rg -n "resize-pane" web/src web/e2e` → no matches (D5's negative-grep scope).
- `rg -n ":\s*any\b|<any>|as any\b"` over every file this plan touched (tracked diff + new untracked files) → no matches (W4).
- `rg -q "scrollback: 0" web/src` → present in `terminal/pane.ts` (W3 positive grep).
- Manually traced every Testable UI Elements row against the actual markup/DOM code (not just written to match on paper): view-switcher and density buttons carry the exact table text and `aria-pressed`; `TerminalSurface.root`'s `aria-label` is built as `` `Terminal: ${session.title ?? "untitled"}` `` verified byte-for-byte against `web/e2e/helpers/terminal.ts`'s locator; the `×` character in the sizenote/tile-footer/density-button text was checked at the byte level (`hexdump`) to be U+00D7, not the letter "x", since `parseSizenote`'s regex and the button-name locators depend on the real character.

## Fix Attempt 1 (review-cycle-1, wave 1)

**Failures addressed**: Critical 1, Critical 2, Critical 5, Major 2, Minor 1, Minor 4, Minor 5 (all `[web-impl]`).

### Critical 1 — Tiles never refit (detached-fragment fit was a silent no-op)

Every path that builds live tiles ran through one function, `renderTilesView`'s inline
`tilesGridEl.replaceChildren(...liveSessions.map(...))`, which built each tile in a
detached array element, called `surface.refit()` on it, and only inserted into
`tilesGridEl` afterward. I replaced that whole construction with a new
`reconcileTilesGrid()` (`web/src/main.ts:212-257`) whose per-session loop does
`tilesGridEl.insertBefore(refs.root, desiredNext)` **before** touching `surface.refit()`
— confirmed by reading the function top-to-bottom: the insert (lines 238-244) precedes
the surface-mount-and-refit block (lines 246-255) unconditionally, for every session in
`liveSessions`, on every call. Since `renderTilesView` is the only caller of the tile
build/refit path (reached, per the plan's own accounting, from the 1s tick, `sessionUpsert`,
`prefs`, `promoteSession`, and `focusNth` — all of which funnel through the single
`render()` → `renderTilesView` → `reconcileTilesGrid` chain), there is exactly one code
path left and it now always refits attached geometry.

I did not implement the parenthetical "consider making `refit()` report that it could not
measure" — it is explicitly a suggestion, not a numbered finding, and adding a
false-positive-prone warning (a `surface.refit()` call is also legitimately a no-op
whenever `session.alive` is false / the surface never got a `term`, which is not a bug)
was scope past what Critical 1 requires once the ordering itself is fixed. Flagging the
trade-off rather than silently skipping it.

### Critical 2 — live tile un-typeable after ~1s (whole-grid rebuild re-parented the surface every tick)

Same root cause, same fix location: `renderTilesView` no longer calls
`tilesGridEl.replaceChildren(...)` on every pass. `reconcileTilesGrid()` now:
- removes only tiles whose id fell out of `desiredIds` (`refs.root.remove()`),
- creates a tile only for an id with no existing entry in the new module-level
  `tileElements: Map<number, TileRefs>` (`web/src/main.ts` next to the `surfaces` map),
- for every **existing** id, calls the new `updateTile(refs, session, now)`
  (`web/src/render/tiles.ts`) which mutates `.nm`/`.wh`/`.ctxinfo`/`.tm`/`className` in
  place and never touches `bodySlot`,
- reorders via `insertBefore` only when a tile's DOM position doesn't already match its
  desired slot (`if (desiredNext !== refs.root)`), and
- remounts a surface into `bodySlot` only when it isn't already that surface's parent
  (`if (isNewTile || refs.bodySlot.firstElementChild !== surface.root)`).

I enumerated every render trigger against this new path: the 1s `setInterval(render,
1000)` tick, `sessionUpsert`, `prefs` broadcast, `promoteSession`, and `focusNth` all call
`render()` → `renderTilesView()` → `reconcileTilesGrid()` — there is only the one path
(same function as Critical 1), so there's only one door to close and it's closed by the
same edit. This mirrors the pattern Focus already used (`main.ts`'s
`if (mainSlotEl.firstElementChild !== surface.root)` guard) rather than inventing a new
one.

**Observed, not just diffed**: I did not have a running daemon/browser in this fix pass
to reproduce the original 1.6s keystroke-loss repro end-to-end; the claim above rests on
reading the full call graph (confirmed via `grep -n "renderTilesView\|reconcileTilesGrid"
web/src/main.ts`) and on the fact that `bodySlot.replaceChildren(surface.root)` — the
statement that unconditionally re-parented the surface every tick before this fix — now
only executes on the `isNewTile || ...!== surface.root` branch, which is false on every
steady-state 1s-tick call once a tile and its surface are both already mounted. E2E's
`views.spec.ts`/`terminal.spec.ts` (already existing, unmodified) are the venue that
exercises this against a real browser; I did not weaken or touch them.

### Critical 5 — dead-while-attached tile still says `live`

`renderTileGeometry`'s signature changed from `(refs, geometry)` to
`(refs, alive, geometry)` (`web/src/render/tiles.ts`). The marker text/class is now:
```ts
refs.markerEl.textContent = alive ? "live" : "stopped";
refs.markerEl.className = alive ? "marker live" : "marker";
```
driven by `session.alive` — the same boolean the daemon flips on `sessionUpsert` — never
by `surface.geometry`'s nullability. The one caller, `reconcileTilesGrid`, passes
`session.alive` directly (`renderTileGeometry(refs, session.alive, surface?.geometry ??
null)`), so a session whose pane ended while its tile was live now reads `stopped` the
same render pass the `sessionUpsert` with `alive:false` arrives — no separate code path
exists for "session died while attached" vs. "session was already dead" (both now key off
the same field), so there's nothing else to enumerate here: the marker has exactly one
source of truth and exactly one call site.

`web/src/render/tiles.test.ts` locks the old (geometry-derived) behavior and now fails at
runtime (confirmed, see Handoff) — this is the test file review flagged as needing a
web-tests update, which I did not touch per the fix-mode boundary rules.

### Major 2 — failed `PUT /api/prefs` silently swallowed

Added `reportPrefsFailure(result: ApiResult<null>)` (`web/src/main.ts`) and wired both
call sites: `requestView`/`requestDensity` now do
`void putPrefs({...}).then(reportPrefsFailure)` instead of `void putPrefs({...})`. A
failed request now produces `console.error("PUT /api/prefs failed: <code> <message>")`.
No inline UI error was added (the finding explicitly says this is Major, not Critical,
and that the daemon-down banner already covers the common case) — a log is the minimum
fix the finding asks for.

### Minor 1 — initial Focus resize measured one row too tall

`renderFocusView` (`web/src/main.ts`) now un-hides `#sizenote` (setting a ` `
placeholder — confirmed by direct byte inspection, not a plain space, since a
whitespace-only text node is not rendered as a flex item at all and would collapse the
reserved line back to zero height) **before** calling `surface.refit()`, only on the
transition into a visible sizenote (`if (sizenoteEl.hidden) { ... }`); the real text is
still written afterward via the existing `renderSizenote(sizenoteEl, surface.geometry)`
call once fresh geometry is known. This means the very first `fit()` for a newly-focused
session already measures against a body that has the sizenote row's real height
reserved, rather than the taller sizenote-less body the old ordering measured against.

### Minor 4 — tile marker said `live`/`ended`, design-system says `live`/`stopped`

Folded into the Critical 5 fix above — `renderTileGeometry` now emits `"live"` or
`"stopped"` (never `"ended"`), matching `docs/design/design-system.md` §5 verbatim
(`` `live` or `stopped` ``).

### Minor 5 — `pane.ts` cssVar fallbacks duplicated `--term`/`--paper`'s literal hex

```ts
background: cssVar("--term", "Canvas"),
foreground: cssVar("--paper", "CanvasText"),
```
`Canvas`/`CanvasText` are CSS Color Module Level 4 system-color keywords (a real neutral
fallback, not a token-value duplicate) — used only in the unreachable-in-practice case
where `getComputedStyle(...).getPropertyValue("--term")` comes back empty despite both
custom properties always being declared on `:root`.

### Verification

```
$ npx tsc --noEmit -p <scratch tsconfig, ./tsconfig.json extended with "exclude":
  ["src/**/*.test.ts", "e2e"], deleted after use>
(no output — exit 0)

$ npx vite build   # standalone, skipping the tsc gate
✓ 23 modules transformed.
dist/index.html                   6.51 kB
dist/assets/index-*.css          15.87 kB
dist/assets/index-*.js          358.44 kB
✓ built in 159ms

$ npx tsc --noEmit   # full project, test files included
src/render/tiles.test.ts(27,5): error TS2554: Expected 3 arguments, but got 2.
src/render/tiles.test.ts(35,5): error TS2554: Expected 3 arguments, but got 2.
(exit 1 — exactly the Critical 5 signature change, nothing else)

$ npx vitest run
 FAIL  src/render/tiles.test.ts > ... 'live' marker when geometry is present
   AssertionError: expected '' to be '100×30'   (called with the old 2-arg shape at
   runtime: `alive` received the geometry object, `geometry` received `undefined`)
 FAIL  src/render/tiles.test.ts > ... 'ended' marker when geometry is null
   AssertionError: expected 'stopped' to be 'ended'
 Test Files  1 failed | 12 passed (13)
      Tests  2 failed | 261 passed (263)
```
All 261 other tests (12 other test files) still pass — no other test file was affected by
any of these seven fixes.

### Handoff (fix attempt 1)

**Build status**: implementation compiles and bundles cleanly — `tsc --noEmit` with test
files excluded exits 0, and `npx vite build` exits 0 (evidence above). The full-project
`npx tsc --noEmit` (test files included) fails only on `web/src/render/tiles.test.ts`
lines 27 and 35 — both are calls to `renderTileGeometry(refs, <geometry-or-null>)` that
need updating to the new `(refs, alive, geometry)` signature per Critical 5. This is the
exact test file the review already named as needing a web-tests update ("the fix needs
the test updated too") — I did not touch it, per the fix-mode boundary rules.

- **File**: `web/src/render/tiles.test.ts`, lines 25-39 (both `it` blocks in the
  `renderTileGeometry` describe block).
- **What must change**: each call needs a middle `alive: boolean` argument, and the
  second test's expected marker text/class changes from `"ended"`/`"marker"` to
  `"stopped"`/`"marker"` (class name itself is unchanged, only the text differs) — e.g.
  `renderTileGeometry(refs, true, { cols: 100, rows: 30 })` /
  `renderTileGeometry(refs, false, null)`.
