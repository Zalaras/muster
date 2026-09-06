# Web Implementation: Plain terminal session

**Plan**: plain-terminal-session
**Mode**: initial

## Changes

| File | Action | What and Why |
|------|--------|--------------|
| `web/src/terminal/surfaceswitch.ts` | created | Pure per-session surface-switch state (`selected`, `shellRunning`) plus the segmented `claude \| shell` control's DOM builder/updater (`buildSurfaceSegment`/`updateSurfaceSegment`) and the composite `surfaceKey(id, kind)` helpers main.ts's surface manager keys on. |
| `web/src/terminal/pane.ts` | edited | `TerminalSurface` takes a `SurfaceKind` (`"claude" \| "shell"`, default `"claude"`) that picks the WS path (`/ws/terminal/` vs `/ws/shell/`) and the `aria-label` prefix (`Terminal:`/`Shell:`); the dead-session-never-opens-a-socket guard now only applies to `"claude"` (REQ-7); a new `onShellEnded` callback fires only for a `"shell"` surface's `4001` close (REQ-8), never for `4000` (E12) or a `"claude"` surface. |
| `web/src/api.ts` | edited | `createShell(id)` — `POST /api/sessions/{id}/shell` (protocol §3.16), returns `{target, created}`. |
| `web/src/render/mainhead.ts` | edited | `MainheadElements.surfaceSegment` (optional, see Decisions) and `renderMainhead`'s new `surfaceState` parameter (defaulted) call `updateSurfaceSegment` every pass. |
| `web/src/render/tiles.ts` | edited | `buildTile` takes an `onSurfaceSelect` callback, builds the segment once and prepends it into `.tfoot .acts`; `TileRefs.surfaceSegment` (optional, see Decisions); `renderTileFooterActions` now treats the segment as a permanent first child — every shape check/rebuild operates only on the children after it. |
| `web/src/main.ts` | edited | `surfaceSwitchState` (the pure Map); `surfaces` re-keyed from `Map<number, TerminalSurface>` to `Map<string, TerminalSurface>` via `surfaceKey(id, kind)`; `handleSurfaceSelect`/`handleShellEnded` dispatchers; the mainhead segment built once at startup and inserted between `.meta` and `.acts`; `renderFocusView`/`reconcileTilesGrid`'s dead-surface branch now gates on `!alive && selected === "claude"` (edge case 5); the render-pass surface diff is now kind-aware (`isSurfaceAttachable`) instead of `aliveOnly`/`surfaceDiff`; `handleRemoved`/`reattachDisconnectedSurfaces` updated for composite keys. |
| `web/src/style.css` | edited | `.surfseg` (mainhead size) and `.tfoot .surfseg` (shrunk tile-footer size) — ported from the plan's `mockups/mockup.css` "DECIDED (2026-09-05)" section onto this stylesheet's own tokens, `margin-right` dropped (redundant with `.tfoot .acts`'s existing `gap`). |

## Decisions

- **REQ-13/W6 CSS — shipped as-is, no extra shrink rule.** Measured the plan's own
  `mockup.html` (real markup/widths, "mockups use the shipped names" per its header) with
  chrome-devtools at 1152px, 3×2, dead tile: the plan's own decided `.surfseg`/`.tfoot
  .surfseg` rules (mockup.css lines 467-474) already give `.tfoot` `scrollWidth ===
  clientWidth` (381 === 381, overflow 0) on **every** tile including both dead ones — no
  additional shrink trick needed to satisfy W6. Re-verified with my exact shipped CSS
  (margin-right dropped) pasted in as an override: identical result, 0 overflow on all
  six tiles, and no button/segment label clips (`scrollWidth <= clientWidth+1` on every
  `.tfoot button`). At 1024px the same dead tile overflows by 6px (344 vs 338),
  reproducing the plan's own documented number exactly — this is the plan's accepted
  1024px floor, not a regression, and W6's criterion is pinned to 1152px only.
  I additionally tried the principled fix for the 1024px floor the plan's Implementation
  Notes hands to web-impl (`.tfoot .acts{min-width:0}` + `.tage{flex:1 1
  auto;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}`): it does
  fix 1024px (0 overflow), but it also ellipsizes `.tage`'s text at 1152px where nothing
  needed clipping (`ageClipped:true` even with 0 footer overflow) — an unexplained,
  undesirable side effect I could not resolve confidently in the time available, so I did
  not ship it. 1024px remains a documented known floor per the plan's own text.
- **`MainheadElements.surfaceSegment` and `TileRefs.surfaceSegment` are optional, not
  required.** The plan's own affected-files note for `render/tiles.ts` already documents
  this exact precedent (`actsEl`/`rename` optional "so `tiles.test.ts`'s existing
  hand-built `TileRefs` fixtures ... keep typechecking unchanged"). `mainhead.test.ts`'s
  three pre-existing hand-built `MainheadElements` fixtures call `renderMainhead(elements,
  session, now, connected)` with 4 args and no `surfaceSegment` field; making the new
  field optional and the new `surfaceState` parameter default to
  `DEFAULT_SURFACE_STATE` kept that file compiling and passing completely unchanged
  (verified: `npx vitest run` — 27 files, 996 tests, all green) rather than filing it as
  sanctioned breakage for web-tests to repair. Every real caller (main.ts) always
  supplies both.
- **`surfaces` keyed by `` `${id}:${kind}` `` (string), not a tuple or nested map** — per
  the plan's own Affected Files instruction ("keys `surfaces` by (session id, kind)
  rather than id"). This replaces `sessions/live.ts`'s `aliveOnly`/`surfaceDiff` at the
  one call site in `main.ts`'s `render()` — those two functions are typed
  `readonly number[]` and remain correct, tested, and unmodified for their existing
  purpose; a composite string key needing kind-awareness isn't a shape they were built
  for, so the diff there is now inlined (an `isSurfaceAttachable` check per visible id,
  then a plain Set-based open/close diff over composite keys) rather than stretching
  their type. Precedent check: `sessions/live.ts`'s `surfaceDiff`/`aliveOnly` are the only
  existing "which surfaces need opening/closing" logic in the repo; I extend the concept
  (still a pure filter-then-diff shape) rather than inventing an unrelated pattern.
- **`renderTileFooterActions`'s rebuild paths now operate only on `.acts`'s children after
  the surfseg.** No existing test exercises this function directly (checked: no
  `*.test.ts` references it), so this was a free change, not sanctioned breakage.
- **Precedent for "focusable control built once, updated in place": render/tiles.ts's
  rename button** (`buildTile` builds it once; `updateTileChrome` only ever writes its
  text) is the pattern `buildSurfaceSegment`/`updateSurfaceSegment` follows — cited in
  `surfaceswitch.ts`'s header comment. The reuse-cache key covers every input that shapes
  the built node's attributes: `aria-pressed` (both buttons), `disabled` (both buttons,
  gated only on `connected` — never on `alive`, since `shell` must stay clickable on a
  dead session per REQ-7), and the pip's DOM presence (`state.shellRunning`) — there is no
  per-option label/placeholder variance here (unlike the usage-model-bar `<select>`
  lesson) since both buttons' text is static.
- **No Testable UI Elements row was left unimplemented.** Every row in the plan's table
  (Focus/Tile surface groups, the two segment buttons, the shell terminal container's
  `aria-label`, the shell surface notice) maps directly onto shipped markup with the
  exact roles/names specified.

## Handoff

**Build status**: `npx tsc --noEmit` and `npm run build` exit 0 (verified from `web/`);
`make web-build build` from the project root also exits 0.

**E2E smoke check** (`npx playwright test plain-shell.spec.ts` from `web/`, after
`make web-build build`): **15/16 pass.** The one failure —
"running claude inside a shell leaves the parent session's state, stateSince,
claudeSessionId and context untouched... (E7, E15, INV-6, edge case 1)" — is not a web
defect: the test drives the UI only to spawn the shell (`mainheadSurfaceButton(page,
"shell").click()`), then POSTs raw hook payloads directly to the ingest endpoint with no
UI involvement at all, and asserts the *daemon's* parent-session state is unchanged
afterward. It fails with `parentAfter.state` `"working"` vs `parentBefore.state`
`"started"` — the daemon's ingest/state-machine mutated the parent session from an
un-enveloped, unbound event, which is exactly what INV-6/REQ-2's structural isolation
claims should not happen. This is a daemon-side (`internal/server/ingest.go` /
`internal/session`) defect in the already-committed daemon-impl change
(`5583a39`), not something in `web/src`. I'm flagging it prominently since it's a real
INV-6 violation the review step should catch; I made no code change to chase it, per my
constraints (no Go files, no test files).

No test files needed changes (no import breakage from any rename/move — nothing here
moved or renamed an existing exported symbol).

## Fix Attempt 1 (review cycle 1)

**Failures addressed**: review.md Major 1 + Minor 1/2/3 (all tagged `[web-impl]`).

**Changes made**:

- **Major 1 (REQ-12 unmet on a dead session)** — `web/index.html` adds a
  `<div class="terminal-notice" role="status" hidden></div>` inside `.termwrap`, in both
  the static `#dead-surface` markup and `#dead-surface-template` (so every dead surface,
  Focus's and every tile's clone, carries one). `web/src/render/dead.ts`: `DeadSurfaceRefs`
  gains an optional `noticeEl`; `refsFromRoot` queries and requires it for any real,
  DOM-built instance (throws otherwise, same as its other four refs); a new
  `showDeadSurfaceNotice(refs, text)` mirrors `TerminalSurface.showNotice`
  (`terminal/pane.ts`) exactly — same 5s auto-hide, same "a new outcome replaces whatever
  was there" behaviour — using a module-level `WeakMap<HTMLElement, timer>` keyed on the
  notice element itself, since `dead.ts` holds no other cross-call state and
  `collectDeadSurfaceRefs` requeries fresh refs from the DOM on every call. `web/src/main.ts`:
  added `findDeadSurfaceRefs(id)`, which returns Focus's `deadSurfaceRefs` when `id` is the
  focused session and `#dead-surface` is visible, else requeries `.dead-surface` out of the
  matching tile's `bodySlot` (`tileElements.get(id)`) and wraps it with
  `collectDeadSurfaceRefs`. `handleSurfaceSelect`'s failure branch now tries the live
  `TerminalSurface`'s `showNotice` first (unchanged path, still covers E9's live-session
  case) and falls back to `showDeadSurfaceNotice(findDeadSurfaceRefs(id), message)` when no
  live surface is mounted — closing both doors the finding named: Focus's dead surface and
  every tile's dead surface, since both route through the same `findDeadSurfaceRefs`/
  `showDeadSurfaceNotice` pair rather than two separate fixes.
  **Measured** (see Handoff): a real 409 on a dead session with its directory removed now
  renders `#dead-surface .terminal-notice` visibly, containing the daemon's own message
  text (the removed directory's path), verified via a throwaway Playwright spec run against
  the built dashboard and deleted before commit (not part of the shipped test suite).
- **Minor 1 (dead `aliveOnly`/`surfaceDiff`)** — deleted both functions and the
  `SurfaceDiff` interface from `web/src/sessions/live.ts` (their only remaining callers were
  `live.test.ts`'s own two `describe` blocks and one comment). Updated the stale comment in
  `main.ts` at the `isSurfaceAttachable` call site that referenced them as still being "the
  right tool everywhere else" — that was no longer true once this was their only call site.
  Per the orchestrator's disposition, `web/src/sessions/live.test.ts` is untouched here —
  wave 2 (web-tests) drops its `aliveOnly`/`surfaceDiff` `describe` blocks.
- **Minor 2 (misleading comment)** — reworded `handleSurfaceSelect`'s doc comment: it no
  longer claims "even a re-click of an already-running shell POSTs" (impossible — the
  function's first line returns early on `current.selected === kind`), and instead
  describes the real re-click path — switching to `shell` *from* `claude` when the shell is
  already running still POSTs, because `current.selected` is `"claude"`, not `"shell"`, at
  that point.
- **Minor 3 (no-op CSS)** — removed `.tfoot .surfseg { border: 1px solid
  var(--line-control); }` from `web/src/style.css`; `.surfseg`'s own border rule already
  applies inside `.tfoot`, so this restated it with no effect. Left `.tfoot .surfseg
  button`/`.tfoot .surfseg .pip` (the real shrink rules) untouched.
- **Major 3 / decision `shell-pip-hue` (Option B, settled after the freeze on this item was
  lifted mid-wave)** — added a `--shell-pip` token to all three `[data-theme]` blocks in
  `web/src/style.css` (instrument `#6c9ee5`, dark `#87b0e8`, light `#134b9a`), all hue 215°
  (blue) — chosen because it sits in the untouched 195°-234° gap between `--teal`'s band
  (165-195) and `--violet`'s (235-270), so it can never be mistaken for either, and because
  it doesn't reuse `--idle`'s near-neutral saturation or squat on `--green`'s reserved
  "health dot" meaning (`docs/design/design-system.md` §1: declared in the mockups, no
  consumer yet). `.surfseg .pip` now reads `var(--shell-pip)` instead of `var(--teal)`;
  updated the rule's comment accordingly. `web/scripts/contrast-pairs.json` gets a matching
  `hueBands["--shell-pip"]: { min: 196, max: 234 }` entry (machine-enforced going forward,
  not just documented) plus an `exempt` entry explaining why no contrast *pair* is needed —
  the pip is a 4-5px decorative dot with no text of its own, same category as the existing
  "gauge tracks" exemption.
  **`make contrast` output** (full, all three themes, this plan's addition included):
  ```
  instrument: 43 pairs, 0 failures
  dark: 43 pairs, 0 failures
  light: 43 pairs, 0 failures
  ```
  **Measured**: a throwaway Playwright spec (written, run, deleted — not committed) loaded
  a real session, started its shell, and read the live pip's computed
  `background-color` plus both CSS custom properties off `:root`. Actual output:
  `PIP background-color: rgb(108, 158, 229)` / `--teal token: #56c5d0` / `--shell-pip
  token: #6c9ee5` — `rgb(108,158,229)` is `#6c9ee5`, confirming the shipped pip renders
  the new token, not `--teal`.

**Sanctioned breakage carried forward (Minor 1's paired change)**: `npx tsc --noEmit`
fails only in `web/src/sessions/live.test.ts` (`TS2305: Module "./live" has no exported
member 'aliveOnly'`/`'surfaceDiff'`) — confirmed by grepping the full `tsc` output for any
other file: none. Evidence:
- `npx tsc --noEmit -p tsconfig.json` with `src/sessions/live.test.ts` excluded (temp config,
  deleted after the run): exit 0.
- Standalone `npx vite build` (no `tsc` gate): exit 0, produced
  `internal/webui/assets/index.html` containing both new `.terminal-notice` divs (grepped).
- `make build` (Go): exit 0, `bin/musterd` built with the updated embedded assets.
- `npx vitest run`: 27/28 files pass, 1035/1046 tests pass; the 11 failures are exactly
  `live.test.ts`'s `aliveOnly`/`surfaceDiff` `describe` blocks (`TypeError: ... is not a
  function`), nothing else regressed.
- `npx playwright test plain-shell.spec.ts` (this plan's own spec, run against
  `make build`'s binary): 16/16 pass, including E9 (the live-session REQ-12 case, which
  this fix leaves untouched).
- A throwaway spec (`web/e2e/_verify-major1.spec.ts`, written, run, then deleted —
  never committed, not part of the shipped suite) drove: launch a session, `POST .../end`,
  remove its directory, click the mainhead `shell` button. Result, pasted from the actual
  run: `DEAD-SURFACE NOTICE TEXT: /var/folders/.../muster-e2e-repo-fNQHHF no longer
  exists`, and the test's own `expect(deadNotice).toBeVisible()` / `toContain(dir)`
  assertions passed. This is the exact repro the review's Major 1 measured failing before
  this fix.

**Handoff**: `web/src/sessions/live.test.ts` needed its `aliveOnly`/`surfaceDiff`
`describe` blocks (and the now-dead import of those two names) removed — web-tests' wave-2
change per the orchestrator's disposition, not mine to make. As of my last `tsc` run it was
already edited in the shared working tree (uncommitted, not by me) with those blocks gone.
`web/src/render/dead.test.ts` was also mid-edit in the shared tree at that point (unused
`beforeEach`/`showDeadSurfaceNotice` imports, `TS6133`) — presumably web-tests adding
coverage for this fix's `showDeadSurfaceNotice`; not mine to touch or assess, just noting
the tree was not fully settled when I finished. `vite build` and `make build` both succeed
regardless, since neither depends on test files; `make web-build`'s `tsc` step depends on
whatever state the test files are in when it's next run and is web-tests' to leave green.

## Fix Attempt 2 (review cycle 1)

**Failures addressed**: e2e-specs' wave-3 measured implementation bug (folded back onto
this cycle's fix, `test-specs.md`'s `## Fix Attempt (review cycle 1)` → `### E2E
Implementation Bugs`): `findDeadSurfaceRefs` (`web/src/main.ts`) returned the wrong
dead-surface instance once the user had left Focus for Tiles, so
`"switching to shell on a DEAD tile with its directory removed shows the daemon's error in
that tile's own dead-surface notice, and a neighbouring tile is unaffected"` failed —
the notice landed in Focus's invisible `#dead-surface` instead of the clicked tile's own.

**Root cause**: `findDeadSurfaceRefs` checked `focusedId === id && !deadSurfaceEl.hidden`.
`deadSurfaceEl.hidden` is written only inside `renderFocusView`, which `render()` calls
only `if (view === "focus")` (`web/src/main.ts:1059`). Once a session died while Focus was
showing it, `renderFocusView` had last set `deadSurfaceEl.hidden = false`; switching to
Tiles never ran `renderFocusView` again, so the flag stayed stuck at `false` even though
the element was now behind `viewFocusEl.hidden = true`. A click on that same session's own
tile then matched `focusedId === id && !deadSurfaceEl.hidden` and wrote the notice into
the invisible Focus surface instead of the tile's.

**Fix**: `web/src/main.ts:514-540` (updated `findDeadSurfaceRefs`) — replaced
`!deadSurfaceEl.hidden` with the real `view === "focus"` check. `view` is main.ts's own
top-level state variable (`web/src/main.ts:202`), assigned only from the daemon's `prefs`
echo inside `applyPrefsFromSnapshot`, and every path that reaches that assignment is
followed, in the same synchronous turn, by the `render()` call that both flips
`viewFocusEl.hidden` and (since `view` is by then `"focus"`) re-runs `renderFocusView` —
so it can never be stale the way a flag owned by a conditionally-invoked render branch
can. Every code path the fix-mode prompt asked me to enumerate:

- **(a) Tiles view, the focused session's own tile.** `view === "focus"` is false, so
  the branch is never reached — falls straight to the tile lookup below. This is the
  bug's exact repro; closed because the check no longer depends on `deadSurfaceEl.hidden`
  at all.
- **(b) Tiles view, a non-focused session's tile.** `focusedId === id` was already false
  here in both the old and new code — unaffected, verified by the new test's own
  "a neighbouring tile is unaffected" assertion passing.
- **(c) Focus view, the focused session.** `view === "focus" && focusedId === id` is
  true, same outcome as the old check — and here `deadSurfaceEl.hidden` was already
  correct too, since `render()` calls `renderFocusView` on every pass while
  `view === "focus"`. Covered by the existing E9/Major-1-Focus test, still passing.
- **(d) Focus view reached by switching from Tiles after the session died there (the
  mirror-image staleness).** Traced `view`'s only assignment site
  (`applyPrefsFromSnapshot`, `web/src/main.ts:729`) and both its call sites
  (`onmessage`'s `prefs` handler and the initial `snapshot` handler) — both call `render()`
  immediately afterward, in the same synchronous handler, before control returns to the
  event loop. Since `render()` un-hides `viewFocusEl` and calls `renderFocusView` in that
  same pass, `deadSurfaceEl.hidden` is already correct by the time the mainhead is even
  paintable, let alone clickable — no click can land between the stale value and the
  repair. Checking `view` directly removes the dependency on this ordering entirely
  rather than leaving it as an implicit invariant; if the render pass is ever split
  across turns in future work, this check still can't go stale, whereas the old one was
  one refactor away from doing so.

**Verification**:
```
$ make web-build build
tsc --noEmit && vite build   -> exit 0
go build ... -> bin/musterd built

$ npx playwright test e2e/plain-shell.spec.ts   (from web/)
Running 19 tests using 6 workers
  19 passed (9.2s)
```
including test #11, `"switching to shell on a DEAD tile with its directory removed shows
the daemon's error in that tile's own dead-surface notice, and a neighbouring tile is
unaffected"` — previously failing, now green — and #10, the Focus-view sibling, unaffected.

```
$ make web-test
Test Files  28 passed (28)
     Tests  1041 passed (1041)
```

No test files were edited. Only `web/src/main.ts` changed.
