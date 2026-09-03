# Web Implementation: ui-text-and-focus

**Plan**: ui-text-and-focus
**Mode**: initial

## Changes

| File | Action | What and Why |
|------|--------|--------------|
| `web/src/style.css` | modified | REQ-2: `.card.current` (`--bg-hover` ground, 1px inset `--edge` outline, `.acts-row` reveal). REQ-5: the three theme blocks' `--fg-muted`/`--fg-dim`/`--idle`/state-hue/note-token values replaced verbatim from the re-cut mockups. REQ-6: `--fs-*` seven-step ramp on the bare `:root`; `html`/`body` sizes now `var(--fs-root)`/`var(--fs-base)`. REQ-7: all 61 `font-size` literals mechanically mapped to `--fs-*` tokens per the plan's table (verified 1:1 against the plan's mapping). `.rename`/`.name-edit` styling (inherits heading font, `--well`/`--edge` field). |
| `web/scripts/contrast-pairs.json` | modified | REQ-4: `--fg-muted` ≥ 8, `--fg-dim` ≥ 7 on `--bg`/`--bg-raised`/`--bg-hover`/`--well`; `--idle`/`--amber`/`--rose`/`--violet`/`--teal` ≥ 6 and `--amber-note`/`--rose-note` ≥ 7 on `--bg-raised`/`--bg-hover`. `_comment` cites this plan. |
| `web/index.html` | modified | REQ-13(a): mainhead heading wraps `<button type="button" class="rename" title="Rename · clear to use Claude Code's name">`. |
| `web/src/protocol.ts` | modified | REQ-11: `titleOverride: string \| null` on `Session` (required, no pre-plan-daemon default, matching the `pinned`/`railPos` precedent); `parseSession` rejects a session whose `titleOverride` key is missing or non-string/non-null. |
| `web/src/api.ts` | modified | REQ-10: `putTitle(id, title)` — `PUT /api/sessions/{id}/title`, same `ApiResult<null>`/204 shape as `pinSession`. |
| `web/src/sessions/rename.ts` | created | REQ-14: pure `titleCommand(input, session)` — noop/set/clear per the plan's exact branch order. |
| `web/src/render/rename.ts` | created | REQ-13–16: `attachRenameEditor(container, handlers)` — button↔input swap, Enter/blur commit, Escape cancel, the Enter-then-blur double-commit guard (edge case 11, via a `settled` flag + listener removal before the swap), the `data-editing` marker, and the `.thead` `draggable` flip when the container sits inside one. |
| `web/src/render/sessions.ts` | modified | REQ-1/REQ-3: `currentId` threaded through `renderSessions` → `reconcileCards` → `updateSessionCardElement`/`buildSessionCardElement` → `updateSessionCardContent`; sets `class="current"` + `aria-current="true"` on match, **removes** the attribute otherwise (never `"false"`). |
| `web/src/render/tiles.ts` | modified | REQ-1: `renderStrip` passes `currentId: null` explicitly (a strip card is never current). REQ-13(b)/REQ-15: `buildTile` builds the `.nm` rename button once and attaches its editor via a new `TileRenameHandlers` param; `TileRefs` gains optional `rename`; `updateTileChrome` skips the button's text write while `nm.dataset.editing === "true"`. |
| `web/src/render/mainhead.ts` | modified | `MainheadElements` gains `renameBtn`; `renderMainhead` skips the title write while `nameEl.dataset.editing === "true"` and always sets `renameBtn.disabled = !connected` (same pattern as End/Resume/Remove). |
| `web/src/main.ts` | modified | `handleRenameCommit` (the one `putTitle` dispatcher both surfaces share); the mainhead's editor attached once at startup; `tileRenameHandlers` shared by every tile; new `setFocusedId` helper that cancels the mainhead edit before every `focusedId` change (rail click, ⌘1–9, removal fallthrough, default-focus fallthrough) — all four call sites now route through it; `setStatus` cancels the mainhead edit and every tile's open edit on disconnect; `reconcileTilesGrid` cancels+disposes a tile's edit before it leaves the grid (both the demotion path and `handleRemoved`) and calls `setEnabled(connected)` per tile every pass; the rail's `renderSessions` call now passes `focusedId` as `currentId`. |
| `docs/design/design-system.md` | modified | REQ-17: §1's contrast paragraph states the tiered floors; §2's type-roles table names the `--fs-*` token (and resulting px at the 15px root) per role; §5's rail-card entry documents `current`, and the Tile paragraph notes its own rename trigger. |

## Decisions

- Kept `titleOverride` **required** (no `?`) on `Session`, matching the plan's explicit
  reasoning for `pinned`/`railPos` ("no pre-plan daemon to tolerate here ... ship
  together"). This is the direct cause of every test-fixture failure listed in Handoff —
  sanctioned breakage per the plan's own field-required contract, not a design choice I
  could avoid without contradicting REQ-11.
- `.card.current` uses `outline: 1px solid var(--edge); outline-offset: -1px` — REQ-2's
  literal first option, not the box-shadow equivalent.
- Implemented REQ-19 (Nice to Have) on both surfaces — `title="Rename · clear to use
  Claude Code's name"` verbatim — since the Testable UI Elements table itself says this
  never changes the button's accessible name (still its text content), so it carries no
  locator risk.
- `render/rename.ts`'s `button` local is re-declared with an explicit
  `HTMLButtonElement` type after the null guard, rather than relying on the guard's
  narrowing. Evidence: `npx tsc --noEmit` failed with `error TS2345: Argument of type
  'HTMLButtonElement | null' is not assignable...` at the `container.replaceChildren(button)`
  call inside the nested `closeEditor` closure before this fix (TS does not carry
  `if`-narrowing of an outer `const` into a nested function); clean after re-declaring.
- `.rename` is `display: inline` so a tile's pre-existing `.thead .nm` truncation
  (`overflow: hidden; text-overflow: ellipsis; white-space: nowrap`, unchanged by this
  plan) keeps clipping a long title the same way it did as a bare text node. Reasoned
  from `.thead` being `display: flex` (which blockifies `.nm` into a flex item
  regardless of its own `display`) — not verified in a live browser; flagging for
  Reviewer-Verified alongside W9.
- The mainhead's rename button is disabled directly by `renderMainhead`
  (`renameBtn.disabled = !connected`), the same one-line-per-render pattern as its three
  siblings, rather than through the editor controller's `setEnabled`. A tile's rename
  button uses `setEnabled` instead, called from `main.ts`'s `reconcileTilesGrid` (the
  only place with both the controller reference and `connected` in scope at once).
  `attachRenameEditor`'s `setEnabled` is still exercised (by every tile); it's simply
  unused for the mainhead's own instance.
- Did not attempt W9 (1280px masthead, one row, no wrap) in a live browser — no
  browser/Playwright tool was available in this pass. Flagging as Reviewer-Verified per
  the plan's own acceptance-criteria table, not silently marking it done.

## Handoff

**Build status**: NOT BUILDING. `npx tsc --noEmit` fails with 9 errors, all in
pre-existing test files, all the identical shape — a hand-built `Session` object literal
is missing the new required `titleOverride: string | null` field (REQ-11). Zero errors
in any non-test file (`npx tsc --noEmit 2>&1 | grep -v '\.test\.ts'` is empty). `npx vite
build` on its own exits 0 — the compound `build`/`web-build` script fails only at its
`tsc --noEmit` half, for the reason above.

Files needing a fixture update (add `titleOverride: null` — or a per-test value — to
each file's hand-built `Session`/wire-JSON literal), none of which I'm permitted to
touch beyond an import-path fix (not applicable here, no import moved):

- `src/api.test.ts` (line 22 fixture)
- `src/render/dead.test.ts` (line 85 fixture)
- `src/render/sessions.test.ts` (line 344 fixture)
- `src/render/tiles.test.ts` (line 30 fixture)
- `src/sessions/card.test.ts` (line 8 fixture)
- `src/sessions/live.test.ts` (line 10 fixture)
- `src/sessions/sort.test.ts` (line 7 fixture)
- `src/sessions/store.test.ts` (line 6 fixture)
- `src/ws.test.ts` (line 37 fixture)

Three further breakages surface only at `npx vitest run` (runtime, not `tsc` — these
files pass plain JSON through `parseSession` rather than a typed `Session` literal, or
use hand-built DOM fakes rather than jsdom elements), also not mine to fix:

- `src/protocol.test.ts` — 21 tests fail: fixtures are raw JSON objects with no
  `titleOverride` key at all, so `parseSession` now rejects them (the key is required,
  not defaulted). Needs `titleOverride: null` (or a string) added to each fixture.
- `src/render/tiles.test.ts` — `updateTile`/state-dot tests fail with `Cannot read
  properties of undefined (reading 'editing')`: `fakeElement()`/`fakeTileRoot()` return
  plain object literals with no `dataset` and no nested `querySelector`, but
  `updateTileChrome` now reads `nameEl.dataset["editing"]` and calls
  `nameEl.querySelector("button.rename")` (REQ-13's `.nm` now wraps a button, not bare
  text) — a test-double limitation, not a reason to change the shipped markup. The
  fake's `.nm` needs a `dataset: {}` and a `querySelector` resolving `"button.rename"`
  to a fake button.
- `src/render/sessions.test.ts` — the plan's own Affected Files entry already flags
  this: the existing `FakeDomNode` shim has `setAttribute` but no
  `removeAttribute`/`hasAttribute`, needed for the new `aria-current` toggle in
  `updateSessionCardContent` (REQ-1 removes the attribute rather than setting
  `"false"`).

No import path was moved or renamed by this pass, so no test file needed the one
import-fix I'm permitted to make.

## Fix Attempt 1 (e2e-validate, pre-review fix)

**Failure addressed**: implementation-bug routed from Validate Attempt 1 — `renderMainhead`'s
no-session branch ran `elements.nameEl.textContent = ""`, permanently detaching the
`<button class="rename">` child. `main.ts` captures that button once via
`requireElement` and `attachRenameEditor` finds it once at startup with no later
rebuild path, and the dashboard always runs one zero-session `render()` pass before the
first `sessionUpsert`, so this fired on every page load — `#mainhead h2.name` was
permanently empty from the start on every session. Failing: `rename.spec.ts` E4, E5,
E6, E7, E8/E9, E11/E12, the mid-edit status-line test (REQ-15/INV-4), and the
dead-session rename test (REQ-16) — 8 of 10 tests in the file.

**Category sweep** — enumerated every writer of `nameEl`'s content across
`mainhead.ts`, `render/rename.ts`, and `main.ts` (`grep -rn "nameEl\." web/src`,
excluding `*.test.ts`), confirming the button node survives every render branch:

- `render/mainhead.ts:47` (the bug) — `elements.nameEl.textContent = ""` in the
  no-session branch. **Fixed**: removed; only `elements.metaEl.textContent = ""` is
  cleared there now. `elements.root.hidden = true` already hides the whole subtree in
  this state, so the button's stale text (if any) is never visible.
- `render/mainhead.ts:56` (has-session branch) — guarded by
  `elements.nameEl.dataset["editing"] !== "true"` before writing
  `elements.renameBtn.textContent`; only ever sets `.textContent` on the button itself,
  never touches `nameEl`. Unchanged, already correct.
- `render/rename.ts:61`/`:109` (`open()`/`closeEditor()`) — the editor's own controlled
  button↔input swap, always via `container.replaceChildren(button)` with the exact
  `button` node captured at `attachRenameEditor` call time (never a freshly created
  node), so a commit/cancel/blur cycle always restores the same button. Verified by
  reading the closure: `button` is a single `const` set once from the initial
  `querySelector`, referenced in both `open()`'s implicit close-then-reopen path (n/a,
  `open()` guards `if (input) return`) and `closeEditor()`. No detach.
- `main.ts` — no direct writer of `nameEl`/`renameBtn` content outside the render call
  and the one-time `attachRenameEditor` wiring; confirmed via the same grep (no other
  match in a non-test file).

**tiles.ts analogue confirmed non-buggy** (validator's belief, checked directly):
`updateTileChrome` (render/tiles.ts:54-76) does
`nameEl.querySelector<HTMLButtonElement>("button.rename")` then
`renameBtn.textContent = vm.title` — writes only the button's own text, gated by the
same `dataset["editing"] !== "true"` check, and never calls `textContent`/
`innerHTML`/`replaceChildren` on `.nm` itself on a re-render pass. `.nm`'s only
`replaceChildren` call (`tiles.ts:121`) is inside `buildTile`, which runs once per tile
construction (appending the freshly created button), not on every render tick — no
repeated-wipe path.

**Gate**: `make web-build` → `tsc --noEmit && vite build` exits 0. `make web-test` →
`vitest run`, 25 files / 743 tests, all passed — no unit-test fixture changes were
needed for this fix (the earlier `titleOverride` fixture breakage from the initial pass
is unrelated and still open per Handoff above).

## Fix Attempt 1 (review cycle 1)

**Issues addressed**: Critical 1 (view-switch commits an open tile/mainhead rename
instead of cancelling it), Major 1 (`design-system.md` still says `10.5px` in three
places).

**Critical 1 — fix**: `web/src/main.ts:562`, inside `applyPrefsFromSnapshot`'s
`if (prefs.view !== view)` block, added `mainheadRename.cancel();` and
`for (const refs of tileElements.values()) refs.rename?.cancel();` immediately before
the `view = prefs.view` assignment — the identical pair `setStatus` already runs on
disconnect (`web/src/main.ts:290-293`).

Every path that changes `view` funnels through this one block:

- `requestView()` (`main.ts:324-326`) only sends `putPrefs({ view: newView })` — no
  optimistic local assignment. It is the sole caller reached by both the masthead's
  Focus/Tiles buttons (`viewFocusBtn`/`viewTilesBtn` click listeners, `main.ts:864-865`)
  and the ⌘\\ shortcut (`main.ts:938`). Confirmed by `grep -n "view\s*=" web/src/main.ts`
  — the only two assignments to the bare `view` variable in the whole file are
  `view = prefs.view` inside `applyPrefsFromSnapshot` and its own declaration; there is
  no second, bypassing write.
  - `applyPrefsFromSnapshot` is called from exactly two places:
    `onHello`'s `snapshot.prefs` (`main.ts:1002`, a fresh load, reload, or another tab's
    snapshot) and `onPrefs` (`main.ts:1017`, the broadcast echo of any client's
    `putPrefs`, including this one's own ⌘\\/button click once the daemon answers). Both
    call `render()` immediately afterward, and `render()` is where
    `viewFocusEl.hidden`/`viewTilesEl.hidden` actually flip (`main.ts:850-851`) — so the
    cancel above always runs before the hiding that would otherwise blur a live editor
    into `onBlur`'s commit path. Read, not just asserted: `applyPrefsFromSnapshot` returns
    synchronously before either caller's `render()` line executes.
- A same-value prefs echo (the daemon re-broadcasting the view a client already has, or a
  duplicate `hello`) does not enter the `if (prefs.view !== view)` block at all, so the
  two `cancel()` calls do not run and nothing is touched — verified by reading the guard,
  which is unchanged in shape from before this fix.
- `attachRenameEditor`'s `cancel()` (`render/rename.ts`) is `finish("cancel")`, gated by
  the `settled` flag — calling it when nothing is open (the common case, most sessions
  have no open editor) is a no-op with no DOM write and no `handlers.onCommit` call, so
  looping it unconditionally over every tile on every real view change is safe and cheap.

**Verification**: confirmed by reading, not by a live-browser repro in this pass (see
below for the browser check that was done). The code-path enumeration above traces every
route to `view` changing and shows the cancel calls sit before the `hidden` toggle in
both call chains. The plan review's own repro steps ("open a tile rename, type, press
⌘\\, expect no PUT") are exactly the scenario e2e-specs Major 2 was told to pin as a new
`rename.spec.ts` test — that spec will exercise the real DOM behaviour end to end.

**Major 1 — fix**: replaced all three remaining `10.5px` literals in
`docs/design/design-system.md` with `--fs-xs` (11.25px) — §4.1's view-switcher bullet,
§5's **Buttons** paragraph, §5's **Segmented control** paragraph — matching §2's table
style. Also split §2's `Body / buttons` row (which said buttons were `--sans`
`--fs-base`, contradicting §5's "mono") into a `Body` row (`--sans`, `--fs-base`) and a
new `Buttons, segmented controls` row (`--mono`, `--fs-xs`). Verified
`grep -n "10.5px" docs/design/design-system.md` now returns nothing (exit 1).

**Gate**: `make web-build` exits 0 (`tsc --noEmit && vite build`, 40 modules). `make
web-test` exits 0 (26 files / 746 tests passed).

**Live-browser verification found a second, un-reviewed gap in the same Critical** — a
scratch daemon (`bin/musterd -addr 127.0.0.1:18765 -data-dir <scratchpad>/muster-scratch-
data -web-dist internal/webui/assets`, kept off the real data dir per the dev-loop
skill) with one `haiku` session launched via Muster's own dialog (trivial trust-prompt
accept, no prompt sent, ended and confirmed as no tmux orphan afterward — hard rules)
was driven with the Playwright MCP tools, since they were available in this fix wave
where they weren't in the initial pass.

- Reproduced the reviewer's exact repro (tile edit open, type, ⌘\\ to Focus) — **passed**:
  no `PUT …/title` in the network log, both surfaces still read the pre-edit title.
- Then tried the *mouse* path the review explicitly named as needing a check ("the
  masthead Focus/Tiles buttons") — **failed**: with the tile's edit open and
  `CLICK PATH SHOULD NOT COMMIT` typed, clicking the **Focus** button (not ⌘\\) sent
  `PUT /api/sessions/1/title` and the tile's title changed. Same failure in the mirror
  direction (mainhead edit open, click **Tiles**).

**Root cause**: a mouse click on a different focusable element blurs the
currently-focused element as part of the browser's own `mousedown` default action —
*before* the `click` listener (`requestView()` → `putPrefs`) ever runs, and long before
that PUT's response reaches `applyPrefsFromSnapshot`. The rename input's `onBlur` was
still attached at that point, so it fired and committed. My first fix (cancelling inside
`applyPrefsFromSnapshot`) only intercepts the round-trip-driven path — correct for ⌘\\ (a
keydown that never moves DOM focus) and for a `view` arriving from another tab/reload,
but too late for a direct click on the switcher buttons themselves.

**Fix**: added a `mousedown` listener (`web/src/main.ts`, just above the existing
`click` listeners on `viewFocusBtn`/`viewTilesBtn`) that calls a new shared
`cancelOpenRenames()` helper — `mousedown` fires and is handled *before* the browser's
focus-shift/blur default action, so `closeEditor()` has already detached the input (and
its `blur` listener) by the time the native blur would otherwise fire. Extracted
`cancelOpenRenames()` (mainhead + every tile, `cancel()` is a no-op when nothing is open)
so `setStatus`'s disconnect branch and `applyPrefsFromSnapshot`'s view-change branch
call the same function instead of duplicating the two-line loop.

**Re-verified in the same browser session** after rebuilding (`make web-build`, daemon
already serving `internal/webui/assets` from disk, page reload picks up the new bundle):
both directions of the masthead-button click now show no title `PUT` and unchanged
titles on both surfaces; ⌘\\ re-tested and still correct; and, to confirm the fix didn't
overreach, opened the mainhead editor, typed, and clicked the *unrelated* "New session"
button — that still sent `PUT …/title` and committed, i.e. ordinary REQ-14 blur-to-commit
semantics are untouched outside the two view-switch buttons.

**Category sweep**: the only two elements whose blur must not commit are the view
switcher's `viewFocusBtn`/`viewTilesBtn` — both now carry the `mousedown` guard. No other
control changes `view` (confirmed earlier: `requestView` is the only writer, called from
exactly these two buttons plus the ⌘\\ handler, which needs no `mousedown` guard since it
never moves focus).

**Gate (re-run after this fix)**: `make web-build` exits 0. `make web-test` exits 0 (26
files / 746 tests passed).
