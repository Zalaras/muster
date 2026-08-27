# Web Implementation: M4 — Reconcile, shutdown policy, end / remove / resume

**Plan**: m4-reconcile
**Mode**: initial

## Changes

| File | Action | What and Why |
|------|--------|--------------|
| `web/src/protocol.ts` | modified | `SessionRemoved` message type + parser, added to the `Message` union (REQ-15, §5.5) |
| `web/src/api.ts` | modified | `endSession`, `resumeSession`, `removeSession`, `fetchPane` + `PaneSnapshot` (§3.4/§3.5/§3.7/§3.8) |
| `web/src/ws.ts` | modified | dispatches `sessionRemoved` to a new `onSessionRemoved` handler |
| `web/src/sessions/store.ts` | modified | `remove(id)` — applies a `sessionRemoved` (no-op on an unknown id) |
| `web/src/sessions/sort.ts` | modified | `sortSessions` now sorts every `alive:false` session after every live one, most-recently-ended first (REQ-9) — the live-branch logic is untouched |
| `web/src/sessions/card.ts` | modified | `CardViewModel.actions` (`["End"]` / `["Resume","Remove"]`), ended timer reads `ended <age>` from `endedAt`; exports `stateBadgeText` for reuse by mainhead/dead-surface |
| `web/src/sessions/format.ts` | modified | `formatEndedAge(endedAt, now)` |
| `web/src/sessions/live.ts` | modified | `aliveOnly(ids, sessions)` — filters a desired-live id list to actually-alive sessions (REQ-13/INV-5/W8), applied as the last step before `surfaceDiff` |
| `web/src/render/sessions.ts` | modified | `buildActionButton` (shared End/Resume/Remove button builder, `stopPropagation` + `data-action`/`data-id`); `buildSessionCardElement`/`renderSessions` gained `onAction`/`connected` params and populate `.acts-row` |
| `web/src/render/tiles.ts` | modified | `renderTileFooterActions` (`.acts` span: End live / age+Resume+Remove dead), `mountTileDeadSurface` (clones `#dead-surface-template` into `.tbody-slot`, wires its Resume button once); `TileRefs.actsEl` (optional); dead-tile header timer no longer reuses the card's "ended …" text (collision fix, see Decisions) |
| `web/src/render/mainhead.ts` | created | REQ-10: name/meta/End-Resume-Remove above the focused terminal slot |
| `web/src/render/dead.ts` | created | REQ-13: the dead-session surface — `.endbar`/`pre.snapshot`/`.endcap` builder + `renderDeadSurface` + `loadPane` fetch trigger, shared by Focus and Tiles |
| `web/src/render/confirm.ts` | created | REQ-14: End/Remove `<dialog>` wiring, modelled on `render/launch.ts`'s `#launch-dialog` pattern |
| `web/src/main.ts` | modified | dispatcher (`dispatchAction`/`doEnd`/`doResume`/`doRemove`/`handleRemoved`), mainhead + dead-surface wiring, dead-pane cache (`deadPaneCache`/`previousAlive`/`ensurePaneFetch`/`updateDeadPaneTracking`), `aliveOnly`-filtered surface diffing, `connected` threaded into every render call |
| `web/src/style.css` | modified | `.mainhead`, `.acts-row`, `.acts`/`.tage` (tile footer), `.dead-surface`/`.endbar`/`.termwrap`/`.snapshot.ended`/`.endcap`, `dialog.confirm`/`.btn.key-danger`/`.btn.danger`/`.btn.sm`, `.card.ended .name` strikethrough; generalized `dialog#launch-dialog` → `dialog.modal` so the two new dialogs share its chrome; `[hidden]` companion rules for every newly-hidden-toggled element (`.mainhead`, `.acts-row`, `.dead-surface`) |
| `web/index.html` | modified | `#mainhead`, `#dead-surface` (+ `#dead-surface-template` for tiles), `#end-dialog`/`#remove-dialog`; `session-card-template` gained `.acts-row`; `tile-template`'s `.tfoot` gained `.acts` |

## Decisions

- **Per-button `stopPropagation` listeners instead of "one delegated listener per
  container"** (Implementation Notes' suggested pattern): a delegated bubble-phase
  listener on a container would fire *after* the card/strip element's own click-to-focus
  listener (also bubble-phase, attached directly on `.card`) since `.card` sits between
  the button and the container — clicking End on a live card would still focus it before
  the delegated handler could `stopPropagation()`. `buildActionButton` attaches its
  listener on the button itself instead, satisfying REQ-11's literal requirement ("Clicks
  on the buttons do not change focus") regardless of DOM nesting. Implementation Notes are
  guidance, not the contract; the Testable UI Elements table and REQ-11 are unaffected.
- **`ended <age>` phrasing differs by element, not by a single shared string**: the rail
  card's `.timer` reads `ended <age>` (no "ago" — mockups/opt-c-both.html's
  `db-migration-audit` card literally shows `<span class="timer">ended 6m</span>`), while
  the mainhead meta, `.endbar`, `.endcap` body and the tile footer's age readout all use
  `<age> ago` (mockups/opt-c-both.html's mainhead meta: `...·ended 6m ago`; `.endbar`:
  `6m ago · last state failed · …`; mockups/tiles-dead.html's `.tfoot .snap`:
  `✕ ended 6m ago`). Each element's copy is transcribed from the specific mockup line it
  corresponds to per the plan's "do not compose new strings" instruction — the two
  mockups themselves aren't internally consistent on this, so per-element transcription
  was the only way to honor that instruction everywhere.
- **A dead tile's header timer (`.thead .tm`) does NOT reuse `card.ts`'s shared
  `ended <age>` view-model text** — it shows the bare age only (no "ended" word), and the
  tile footer's age readout leads with "✕" rather than "ended". Reasoning: unlike a rail
  card, a dead *tile* also mounts the dead-surface's `.endbar` (which must start with
  "ended " per the Testable UI Elements' `/^ended /` contract) in the same subtree. E11
  (`web/e2e/actions.spec.ts` line 465) asserts
  `await expect(tileA.getByText(/^ended /)).toBeVisible();` scoped to the whole tile —
  if both `.thead .tm` and `.endbar` started with "ended ", Playwright's `getByText`
  locator would resolve to two elements and the `.toBeVisible()` call would throw a
  strict-mode violation. Only `.endbar` now starts with "ended " inside a tile.
- **`.geo` (tile footer geometry span) is left untouched for dead tiles** — still empty
  string, per `renderTileGeometry(refs, false, null)`'s pre-existing, frozen contract.
  `web/src/render/tiles.test.ts` line 76's existing test asserts
  `renderTileGeometry(refs, false, null)` → `refs.geoEl.textContent === ""`, and that file
  is a test I cannot edit — so REQ-12's "footer shows `ended <age>` … instead of the
  geometry readout" is satisfied by a new `.tage` span inside the (plan-sanctioned)
  `.acts` span instead of repurposing `.geo`.
- **`TileRefs.actsEl` is optional (`actsEl?: HTMLElement`)**, not required, so
  `web/src/render/tiles.test.ts`'s existing hand-built `TileRefs` object literals (lines
  18–25 and 104/117/131 — four fields: `root`/`bodySlot`/`geoEl`/`markerEl`) keep
  typechecking without edits (`npx tsc --noEmit` confirmed 0 errors). Every tile built via
  the real `buildTile()` always populates it (throws if the template is missing `.acts`).
- **Mainhead End is disabled by two independent rules, not one**: the Testable UI Elements
  table says "disabled iff `alive:false`"; the plan's States section separately says every
  action button is disabled while the WS is down. Both apply — `disabled = !connected ||
  !session.alive` — the table's rule is exactly what's left once `connected` is true; E14
  (`action buttons are disabled while the daemon connection is down`) requires the
  connection-gated half.
- **Every Remove button gets the mockup's `.danger` (hover-rose) treatment**
  (`buildActionButton`), matching `opt-c-both.html`/`tiles-dead.html`'s consistent
  `btn sm danger` class on every Remove instance; End/Resume stay plain `.btn`.

## Handoff

**Build status**: `npx tsc --noEmit` and `npm run build` exit 0 (verified above; `npx
vitest run` also passes — 15 files, 322 tests, all pre-existing, none broken).

No test files were edited or needed editing — every change here is additive (new optional
parameters, new exported functions/types, new files) and the full existing Vitest suite
passed unmodified. Nothing to hand off as sanctioned breakage.

For web-tests: the plan's W4–W8 unit-test targets are all now backed by real
implementation —
- W4: `sortSessions` (`web/src/sessions/sort.ts`) — the alive-tier + `endedOrderKey`.
- W5: `buildCardViewModel` (`web/src/sessions/card.ts`) — `.actions` and the ended `.timer`.
- W6: `parseMessage`/`parseSessionRemoved` (`web/src/protocol.ts`).
- W7: `SessionStore.remove` (`web/src/sessions/store.ts`).
- W8: `aliveOnly` (`web/src/sessions/live.ts`) is the pure surface of this claim — a
  network-level Playwright assertion is E2E's (`actions.spec.ts`'s INV-5 test already
  covers it); `aliveOnly` itself is directly unit-testable without a DOM or socket.

## Fix Attempt 1

**Failures addressed**: review.md Majors 3, 5, 6, 7, 8; Minors 7, 9, 10, 11 (web-impl-owned).

### Major 3 — action buttons stay enabled after disconnect; a dialog can still open

`web/src/main.ts`: `setStatus()` now ends with an unconditional `render()` call (right
after the existing `confirmDialogs.closeAll()` line). `setStatus` is the single choke
point for every connection-status transition in the file — `onConnecting`,
`onHello`→`"connected"`, and `onDisconnected` all funnel through it (there is no other
place that mutates `connectionStatus`), so this one call closes every path:

- `onDisconnected` (main.ts `client` config): now re-renders, so a focused **dead**
  session's mainhead + `.endcap` Resume immediately pick up `connected:false` even though
  they have no terminal socket to incidentally trigger a redraw.
- `onConnecting` (initial load and every reconnect attempt): same call, so a flapping
  connection never leaves stale enabled buttons mid-reconnect either.
- Initial module-load `setStatus("connecting")` call: also now re-renders once more, a
  no-op re-render since `render()` was already called immediately before it — confirmed
  by `npx tsc --noEmit` / `npm run build` passing and no behavior difference observed.

`render()` is documented as "idempotent and safe to call after every store mutation,
prefs change, keyboard action or the 1s tick" — a connection-status change is just another
trigger in that same category, so no new re-entrancy or ordering risk.

Verified via the full E2E run (not just the unit suite): `actions.spec.ts` E14 ("action
buttons are disabled while the daemon connection is down") passes — mainhead End/Resume/
Remove and the rail card End button are all `toBeDisabled()` after `isolated.kill()`, and
the banner clears after `isolated.restart()`. E14 as currently written only puts a
**live**-focused session on screen (review Major 4 asks e2e-specs to add a dead-focused
case) — that's out of my scope to add, but the fix in `setStatus` is not conditioned on
which kind of session is focused; it re-renders the mainhead and dead-surface refs
unconditionally via the same `render()` pass that E14 already exercises for the live case.

### Major 5 — card/strip action buttons are keyboard-dead

`web/src/render/sessions.ts`: `buildSessionCardElement`'s `card.addEventListener("keydown", ...)`
now starts with `if (event.target !== card) return;` before its `Enter`/`Space` handling.
This is the only `keydown` listener in the new code that could shadow a nested control
(confirmed via `grep -rn 'addEventListener("keydown"' web/src/render/ web/src/main.ts`:
only three hits — `launch.ts`'s window-level Escape listener, `main.ts`'s ⌘1–9 listener
guarded by `event.metaKey`, and this one). Both call sites that render a card with nested
action buttons go through this single function:

- Rail cards (Focus view, `renderSessions` → `buildSessionCardElement`).
- Strip cards (Tiles view, `renderStrip` in `render/tiles.ts` → same
  `buildSessionCardElement`, confirmed via `grep -n "buildSessionCardElement" web/src/render/tiles.ts`).

So both surfaces named in the finding are closed by the one guard. Tile-footer action
buttons (`renderTileFooterActions`) are a separate code path — they live directly in
`.tfoot .acts`, not nested inside a `.card`, so they were never affected by this listener
in the first place; not part of the fix, just confirmed out of scope by reading
`render/tiles.ts`.

Full E2E suite re-run after the fix: 87/87 pass, including the existing mouse-click
End/Remove tests, confirming the guard didn't regress click-to-open behavior (click events
never reach the card's keydown listener at all, so this was never in the click path).

### Major 6 — "ended now ago"

Added `formatEndedAgo(endedAtIso, now)` to `web/src/sessions/format.ts` — wraps
`formatEndedAge` (left untouched, so `format.test.ts:104`'s `"now"` assertion still
passes) and returns bare `"now"` instead of `"now ago"` for the sub-minute bucket, `"<age>
ago"` otherwise. Switched every "<age> ago"-composing call site to it:

- `web/src/render/mainhead.ts:27` — mainhead meta line.
- `web/src/render/dead.ts` (`renderDeadSurface`) — both `.endbar` and `.endcap-text`.
- `web/src/render/tiles.ts:151` — tile footer `.tage` span.

`card.ts:130`'s own `ended <age>` (no "ago") was already correct per the review and is
untouched. Verified no test asserts the old "X ago" composition directly:
`grep -n "ago\|ended " web/src/render/tiles.test.ts web/src/render/dead.test.ts` returns
no hits on the exact copy (there is no `mainhead.test.ts`), and `npm test` still passes
387/387 after the change.

### Major 7 — hard-coded colour literals

Added two tokens to the `:root` block in `web/src/style.css` (same precedent as the
existing `--scrim` hoist, cited in a comment at each new token): `--panel-95: rgba(23,
26, 36, 0.95)` and `--rose-fg: #fff`. Replaced both literal call sites
(`.endcap .pill { background: ... }` and `.btn.key-danger { color: ... }`) with
`var(--panel-95)` / `var(--rose-fg)`. Swept the whole file for any other literal I might
have missed: `grep -n "#[0-9a-fA-F]\{3,6\}\|rgba\?(" web/src/style.css` now only matches
lines inside the `:root` token block itself and my new explanatory comments — zero hits
in component rules.

### Major 8 — `.endcap .pill` missing tabular-nums

Added `font-variant-numeric: tabular-nums;` directly to the `.endcap .pill` rule in
`web/src/style.css` (rather than relying on inheritance from an ancestor, since none of
this component's ancestors declare it — confirmed by reading the cascade up from
`.dead-surface`/`.termwrap`/`.endcap`, none of which set `font-variant-numeric`).

### Minor 7 — "ended just now ago" defensive branch

`web/src/render/dead.ts`: when `session.endedAt` is null (defensive branch only — paired
with `alive:false` per the protocol invariant, so not a real path), `renderDeadSurface`
now omits the age clause entirely from both `.endbar` and `.endcap-text` instead of
claiming "just now" — mirrors how `card.ts`/`tiles.ts` already treat this same branch.
`.endbar`'s text still starts with `"ended "` (`ended · last state ...`), so the E2E
`/^ended /` assertions (`terminal.spec.ts:319`, `actions.spec.ts:217`) are unaffected —
confirmed by the full E2E re-run passing.

### Minor 9 — dead-surface loading state indistinguishable from "no snapshot"

`web/src/render/dead.ts`: the `pane.status === "loading"` branch of `renderDeadSurface`
now sets `.endcap-text` to `"loading last screen…"` instead of an empty string, so it no
longer reads identically to the confirmed-negative `"no snapshot captured"` case.
`pre.snapshot` stays empty in this branch (no terminal content exists yet either way);
only the cap's own status text changed. Checked `web/src/render/dead.test.ts` and
`web/e2e/*.spec.ts` for any assertion on the loading-state text — none found.

### Minor 10 — sizenote NBSP regression

`web/src/main.ts`: the placeholder `sizenoteEl.textContent` value had regressed to a
literal ASCII space — confirmed with `hexdump -C` before the fix (bytes `20 22 3b`, i.e.
a plain 0x20 space then `";`, no multi-byte sequence). Replaced with the explicit escape
sequence for U+00A0 in source (rather than a literal character, to make it
grep/diff-unambiguous going forward) and re-verified with `hexdump -C` that the emitted
bytes are now `c2 a0` (UTF-8 for U+00A0) inside the quotes.

### Minor 11 — a11y polish

- `web/index.html`: `#end-dialog` and `#remove-dialog` both gained
  `aria-describedby="<id>-dialog-body"` pointing at their existing `<p>` consequence copy.
- `web/index.html`: both `<b>session ended</b>` instances (the static `#dead-surface` and
  `#dead-surface-template`) gained `role="status"` so the cap's content is announced as a
  live region.
- `web/index.html` + `web/src/style.css`: `#mainhead .name` promoted from a bare `<span>`
  to an `<h2>` (not `<h1>` — the page already has one `<h1>Muster</h1>` in the masthead
  brand, confirmed via `grep -n "<h1\|<h2\|<h3" web/index.html`), giving Focus a heading
  to navigate to above the terminal. Added `margin: 0` to `.mainhead .name` in
  `style.css` to cancel the UA heading margin the tag swap would otherwise introduce into
  the flex row — visually unaffected (font-size/weight/letter-spacing rules were already
  class-scoped, not tag-scoped). No test locates `.mainhead .name` by role or tag, and no
  Testable UI Elements table row specifies one for it (`plan.md`'s "Mainhead" row is `—`
  role, `.name` = session title only) — confirmed by reading the table.

### Not touched (per explicit scope)

- Major 1, 2 ([daemon-impl]/[daemon-tests]), Major 9/10 ([orchestrator]) — out of scope.
- Minor 12 (acts-row hover-only) — flagged by the reviewer as "worth a conscious
  decision," not a defect; left as-is per the instruction to fix Minors "where sound" —
  changing it would contradict the Testable UI Elements table's requirement that the row
  be present for E2E, so no code change made.
- `--rose` usage (Major 10) — explicitly out of scope per instructions; untouched.

### Verification

- `npx tsc --noEmit` — 0 errors.
- `npm run build` (web/) — succeeds, `tsc --noEmit && vite build`.
- `npm test` (web/, Vitest) — 387/387 passing, 16 files, unchanged from before the fix
  (no test file edited).
- `npm run e2e` (via `make e2e` from repo root, full suite) — 87/87 passing, including
  E14 (action buttons disabled while disconnected) and every End/Resume/Remove
  click/keyboard interaction test.

## Fix Attempt 2

**Failures addressed**: cycle-2 review.md Major 1 (blocking) plus web-impl Minors 1, 3,
4, 5.

### Major 1 — card/strip/tile-footer action buttons keyboard-dead after the 1s render tick

Root cause confirmed exactly as the reviewer traced it: `renderSessions` (rail),
`renderStrip` (tiles.ts), and `renderTileFooterActions` all called `replaceChildren(...)`
**unconditionally** on every 1s render tick, so every card/strip-card/tile-footer node —
including whichever `<button>` a keyboard user had just focused — was destroyed and
rebuilt every second with no re-focus. Fixed all three named sites, plus the fourth
`replaceChildren` the review's "every other per-tick replaceChildren" language covers
(the button rows *inside* each card, previously rebuilt by `buildSessionCardElement`
every call regardless of caller):

1. **`web/src/render/sessions.ts`** — split the old single `buildSessionCardElement`
   (build-and-populate in one shot, called fresh every tick) into:
   - `updateSessionCardContent` (private): mutates an *existing* card's fields
     (name/badge/timer/repoLine/context/activity/note) in place, and reconciles
     `.acts-row` via the new `reconcileActsRow` helper — which only touches each
     existing button's `disabled` state when the label sequence is unchanged (the
     common case: a live card stays End-only, an ended card stays Resume+Remove, every
     tick), and only calls `replaceChildren` on a genuine live/ended transition.
   - `buildSessionCardElement` (exported, unchanged signature): clones the template,
     calls `updateSessionCardContent` once, wires the click/keydown listeners once.
   - `updateSessionCardElement` (exported, new): the update half of the pair, called on
     an already-built card.
   - `reconcileCards` (exported, new): reconciles a container's children against
     `sessions` by matching existing DOM nodes via `card.dataset.sessionId` — the same
     pattern `main.ts`'s existing `reconcileTilesGrid` already uses for tiles (review
     m2-terminal Critical 2). An existing card is updated in place and moved via
     `insertBefore` only if its position actually changed (skipped entirely when
     already correctly positioned, so the button/card node is never touched at all on a
     steady tick); only a session with no existing card builds a new one; only a
     departed id removes one.
   - `renderSessions` now calls `reconcileCards` instead of `el.replaceChildren(...)`.

2. **`web/src/render/tiles.ts`** — `renderStrip` now calls the same shared
   `reconcileCards` (imported from `sessions.ts`) instead of rebuilding every strip card
   every tick — same fix, same reason, since a strip card is the identical markup.

3. **`web/src/render/tiles.ts`** — `renderTileFooterActions` now diffs the footer's
   existing children against the desired shape (live: one `button[data-action="end"]`;
   dead: `.tage` + `button[data-action="resume"]` + `button[data-action="remove"]`) and,
   when the shape already matches, only updates text/`disabled` in place. `replaceChildren`
   only runs on a genuine live/dead shape change.

**Every code path enumerated in the finding is closed**: `renderSessions` (rail),
`renderStrip` (strip cards), and `renderTileFooterActions` (tile footer) all no longer
unconditionally rebuild; the acts-row button rebuild inside the shared card builder
(reachable from both the rail and the strip, since they share `buildSessionCardElement`)
is also fixed via `reconcileActsRow`. I swept `web/src` for every remaining
`replaceChildren` call to confirm no other per-tick site was missed:

```
$ rg -n "replaceChildren" web/src --glob '!*.test.ts'
web/src/main.ts:373,383,394,400   mainSlotEl — Focus's terminal-slot mount/unmount, not action buttons (pre-existing, already review-clean)
web/src/main.ts:473               refs.bodySlot.replaceChildren(surface.root) — a tile's live-surface mount, not action buttons
web/src/main.ts:504               tilesGridEl.replaceChildren() — only the empty-grid clear path (renderTilesView's no-sessions branch)
web/src/render/sessions.ts:87     actsRow.replaceChildren(...) — inside reconcileActsRow, now only fires on a live/ended shape change, not every tick
web/src/render/tiles.ts:124       el.replaceChildren() — renderStrip's empty-strip clear path only
web/src/render/tiles.ts:159,188   actsEl.replaceChildren(...) — inside renderTileFooterActions, now only fires on a live/dead shape change, not every tick
web/src/render/tiles.ts:215       bodySlot.replaceChildren(refs.root) — a tile's live-surface mount, not action buttons
web/src/render/masthead.ts:36     renderBucket's lbl/num spans — no focusable descendant, ever
web/src/render/launch.ts:113,141  mruList/browseDirs — the launch modal, rebuilt only on open/change, not the 1s render tick
web/src/render/context.ts:48      the context gauge's track/percent/token spans — no focusable descendant, ever
```

No remaining per-tick `replaceChildren` touches a focusable action button.

**Proof, measured in a real browser** (via a throwaway Playwright spec run against a
real scratch daemon, then deleted — not part of the shipped suite): focused each of the
three named surfaces' action button, waited 1.4s (longer than the 1s render tick), and
asserted `document.activeElement` was still that same button node, then pressed Enter
and asserted the confirm dialog opened:

```
rail card End:    focusedInitially=true  sameNodeAfter1.4s=true  activeTag=BUTTON
                  Enter after 1.4s opened the dialog
tile footer End:  focusedInitially=true  sameNodeAfter1.4s=true  activeTag=BUTTON
                  Enter after 1.4s opened the dialog
strip card End:   focusedInitially=true  sameNodeAfter1.4s=true  activeTag=BUTTON
                  Enter after 1.4s opened the dialog
```

(Strip case used a 5th live session over the default 2x2 density so a strip actually
renders, per `views.spec.ts`'s existing density convention.) All three surfaces now
match the mainhead's already-correct behaviour the reviewer measured as the baseline.

Full suites re-run clean after the fix: `npx tsc --noEmit` (0 errors), `npm run build`
(clean), `npm test` (387/387, 16 files, unchanged pass count), `npx playwright test`
(92/92, unchanged pass count) — including the existing
`actions.spec.ts` keyboard test (REQ-11/Major 5) and every other action/dialog test, all
still green with no test file edited.

### Minor 3 — `renderSessions` (and `renderStrip`) rebuilding the whole rail every tick

Fixed as the natural companion to Major 1, per instruction: `reconcileCards` (above)
means a steady rail/strip with no session added/removed/reordered now touches no DOM
nodes beyond the per-field text/attribute writes `updateSessionCardElement` already does
— no wholesale remove-and-reinsert, so no forced layout and no discarded in-card text
selection. (The card's per-second-updating `.timer` text still changes every tick, as it
must — that's real changing data, not the defect Minor 3 named.)

### Minor 1 — REQ-19: end bar doesn't show the snapshot's `capturedAt` age

`web/src/render/dead.ts`'s `renderDeadSurface`: when `pane.status === "ok"`, the endbar
text now gets ` · captured <age>` appended, using the same `formatEndedAgo` helper the
existing age clause uses (so it can't reintroduce Major 6's "now ago" bug). Only rendered
when `capturedAt` is actually known (the `"ok"` pane state); `"loading"`/`"missing"`
render unchanged. Verified this doesn't collide with existing e2e assertions: `.endbar`
still starts with `"ended "` (`toHaveText(/^ended /)`) and still contains `"ended now ·"`
without containing `"now ago"` (`actions.spec.ts`'s Major 6 test) — confirmed by re-running
the full suite (92/92 green, unchanged).

### Minor 4 — `.acts-row` unconditionally visible on every live rail card

Made the decision the reviewer asked for, rather than carrying the non-decision forward
a third time: implemented the mockup's documented "shown on hover / on the focused card"
behaviour (`opt-c-both.html:277`) via CSS, not a DOM/markup change — `.acts-row` now
starts at `opacity: 0` and only `.card:hover .acts-row` / `.card:focus-within .acts-row`
raise it to `1`, with a 120ms transition. Deliberately opacity, not `display`/`hidden`/
`visibility`, for two reasons: (1) the row must stay genuinely present for the Testable
UI Elements contract — an element hidden via `display`/`visibility` is not locatable or
actionable to Playwright, but `opacity: 0` is (Playwright's actionability model does not
treat `opacity: 0` as hidden); (2) `:focus-within` on `.card` covers both "the card
itself has focus" (REQ-7/REQ-8's card `tabIndex=0`) and "a button inside it has focus"
in one rule, matching the mockup's "or on the focused card" clause exactly.

Verified both halves by measurement (throwaway Playwright spec, deleted after):
`getComputedStyle(actsRow).opacity` reads `"0"` at rest, `"1"` after `card.hover()`, and
`"1"` after `card.focus()` with the mouse moved away first (so it's genuinely
focus-driven, not a stale hover state) — and, separately, a fresh page load's `End`
button (never hovered) still opens the dialog on a plain `.click()`, proving the
contract-required locatability survives the opacity change. Then re-ran the full 92-test
suite unchanged (92/92 green) to confirm no existing test — none of which simulate hover
before clicking/pressing an action button — regressed.

Scope: only `.acts-row` (rail/strip cards), per the finding's own line reference
(`sessions.ts:117`) — `.tfoot .acts` (tile footer buttons) is a different element the
finding didn't name and the mockup doesn't annotate the same way, so it stays
always-visible, unchanged.

### Minor 5 — dialog `aria-live` announcement

No action: the reviewer's own text says "Nothing further needed" and confirms the
existing `aria-describedby`/`role="status"`/`<h2>` a11y work from the prior cycle is all
verifiably in place. Left untouched.

### Not touched (per explicit scope, unchanged from Fix Attempt 1)

- Major 2 ([e2e-specs]) — not web-impl's; the keyboard-after-render-tick E2E case
  (`>1.1s` wait then press) is now safe to add since Major 1 is fixed, but authoring it
  is e2e-specs' job, not this cycle's.
- Major 3/4 ([orchestrator]) — doc upkeep and the `--rose` design-system contradiction,
  both explicitly out of scope for web-impl; untouched.
- Minor 2 ([daemon-impl]), Minor 6/8 ([daemon-tests]/[e2e-specs]) — not web-impl's.

### Verification (Fix Attempt 2)

- `npx tsc --noEmit` — 0 errors.
- `npm run build` (web/) — succeeds, `tsc --noEmit && vite build`.
- `npm test` (web/, Vitest) — 387/387 passing, 16 files, unchanged from before the fix
  (no test file edited).
- `npx playwright test` (full suite, repo built via `make build` first) — 92/92 passing,
  unchanged pass count, including the REQ-11/Major-5 keyboard test and every
  End/Resume/Remove interaction test.
- Two throwaway measurement spec files were used to gather the live-browser evidence
  above (focus-persistence-across-tick, and acts-row opacity/hover behaviour) and then
  deleted — `git status --short web/e2e/` shows no leftover file from either.

## Handoff

**Build status**: `npx tsc --noEmit` and `npm run build` exit 0.

No test files were edited. New user-facing behaviour for e2e-specs to consider covering:

- **Major 2's own ask, now unblocked**: a card's (and a tile footer's, and a strip
  card's) End/Resume/Remove button now genuinely survives the 1s render tick — a test
  that focuses the button, waits >1.1s, then presses Enter (not `locator.press()`, which
  bundles focus+key into one atomic action and can't observe this) should now pass and
  would have failed before this fix.
- **New**: `.acts-row` is now `opacity: 0` until the card is hovered or has focus
  (`:focus-within`). This does not require any spec changes — every existing locator
  (`card.getByRole("button", {name: "End"})...click()`/`.press()`) still works
  unhovered, since Playwright's actionability model doesn't treat `opacity: 0` as
  hidden — but if e2e-specs ever wants to assert the row is visually hidden at rest
  (e.g. a screenshot test), the row's `opacity` computed style is now the signal, not
  `hidden`/`display`.
- **New**: the dead surface's `.endbar` text now ends with `· captured <age>` when a
  snapshot has been fetched (REQ-19). No existing assertion breaks (`/^ended /` and the
  Major-6 "now ago" checks both still hold), but a test explicitly asserting the
  captured-age clause would newly be possible to add.

## Fix Attempt 3

**Cycle**: 3 (`plans/m4-reconcile/review.md`, verdict `needs-changes`).
**Failures addressed**: Critical 1 (web-impl — dead-surface cap Resume invisible),
Major 2 (orchestrator → decided: add `--danger` tokens, repoint destructive actions),
Minor 1 (web-impl — focus lost on rail re-sort), Minor 3 (web-impl — hover-only
`.acts-row` sign-off), Minor 7 (web-impl — duplicate of Minor 3, closed with it).

### Critical 1 — dead-surface cap Resume invisible on every dead surface

Root cause: the cycle-2 Minor-4 fix wrote the hover-reveal opacity rule on the bare
`.acts-row` class, but `.acts-row` is shared by three surfaces, not one:

1. `.card .acts-row` — rail card / strip card action row (inside `.card`, reveal was
   intended to apply here).
2. `.tfoot .acts` — tile footer action row (a *different* class, never affected).
3. `.endcap .pill .acts-row` — the dead-surface cap's Resume button, reached from
   **two** markup sites, per the review's "two surfaces" framing:
   - Focus's static `#dead-surface` (`web/index.html:52-60`).
   - The per-tile `#dead-surface-template` clone mounted into a dead tile's
     `.tbody-slot` (`web/index.html:193-208`, cloned by `web/src/render/dead.ts`).

Neither dead-surface site is ever inside a `.card`, so the unscoped rule's `opacity: 0`
applied to both and nothing in either markup tree ever matched `.card:hover` /
`.card:focus-within` to bring it back to 1. Both are the same defect (the class is
reused, not duplicated code), so one CSS fix closes both doors.

Fix — `web/src/style.css`'s `.acts-row` block: moved the `opacity: 0` declaration off
the bare `.acts-row` selector onto `.card .acts-row`, leaving the base `.acts-row` rule
with only layout properties (`display`, `gap`, `margin-top`) and the `transition`. The
existing `.card:hover .acts-row` / `.card:focus-within .acts-row { opacity: 1; }` rules
are unchanged — they already were, and remain, `.card`-scoped. Every other `.acts-row`
consumer (`.endcap .pill .acts-row`, which only adds `justify-content`/`margin-top`) now
falls through to the implicit default `opacity: 1` and is unconditionally visible, which
is correct: the cap's Resume is not a hover affordance, it's the dead surface's one
recovery action (design-system §6).

Re-measured live (real scratch daemon + Playwright, throwaway spec, deleted after):

```
FOCUS dead-surface: button opacity=1 row opacity=1
TILE dead-surface: button opacity=1 row opacity=1
```

Both surfaces named in the Critical — Focus's `#dead-surface` and a dead tile's cloned
`.dead-surface` — now report `opacity: 1` on both the cap's Resume button and its
containing `.acts-row`. Also re-measured that the fix didn't regress the live-card hover
behaviour it depends on:

```
RAIL acts-row: atRest=0 hover=1 focusWithin=1
```

(measurement needed a 200ms wait past the rule's own 120ms opacity transition before
reading `getComputedStyle` — the first pass without it caught the transition mid-flight
and read `hover=0`/`focusWithin=0.347`, a measurement artifact, not a defect; re-run with
the wait gives stable 0/1 endpoints).

No other `.acts-row` consumer exists — swept `rg -n 'acts-row' web/src/style.css
web/index.html` before and after; the only three usage sites are the ones enumerated
above.

### Major 2 — `--danger` tokens (Damian: option A)

`docs/design/design-system.md` §1 already carries the three new tokens (added by the
orchestrator's decision step) — `--danger:#C94F4F`, `--danger-line:#7A3535`,
`--danger-fg:#FFFFFF`, for "Remove hover, the filled Remove/End confirm buttons". Added
the identical values to `web/src/style.css`'s `:root` block (replacing the old
`--rose-fg` declaration's slot, same file location) and repointed every destructive-
action rule:

- `.btn.key-danger` (`web/index.html:144` End-confirm, `:153` Remove-confirm — both
  dialog buttons share this class) — `color`/`background` now `--danger-fg`/`--danger`;
  `border-color` uses `--danger-line` (a deeper shade, consistent with the existing
  `--border-*` family paired with each state fill) rather than `--danger` itself, for a
  visibly-bordered filled button rather than a border that disappears into the fill.
- `.btn.danger:hover` (`web/index.html:45` mainhead Remove, plus the dynamically built
  Remove buttons in card/strip/tile action rows — `web/src/render/sessions.ts`'s
  `buildActionButton`, `label === "Remove"` branch) — `color`/`border-color` now
  `--danger`.

`--rose-fg` had exactly one consumer (`.btn.key-danger`'s `color`), now repointed to
`--danger-fg`, so the token declaration itself was deleted rather than left orphaned.

Proof `--rose` now means only Failed, per the task's required command:

```
$ rg -n 'rose' web/src/style.css web/index.html
```

Every hit left in the output is either the token declaration/comment block or one of:
`.tile.s-failed .sdot` (684), `.strip .card.s-failed` border (807), `.note.fail` (983-4),
`.s-failed .stripe`/`.s-failed .badge` (1001, 1004) — all Failed-state uses, none
destructive-action. `index.html` has zero hits (`class="btn danger"` / `class="btn
key-danger"` carry no colour literal — colour comes entirely from the CSS classes now
pointing at `--danger`). No `#hex`/`rgba()` literals were introduced — both new colour
usages resolve through `--danger`/`--danger-line`/`--danger-fg`.

Updated the one stale in-code comment describing this (`web/src/render/sessions.ts`'s
`buildActionButton`, "same `.danger` (hover-rose) treatment" -> "hover-danger").

### Minor 1 — focus lost when the rail's sort order changes

`web/src/render/sessions.ts`'s `reconcileCards`: `container.insertBefore(card, ...)`
detaches an already-mounted node before reinserting it (per the DOM spec), and Chrome
blurs a focused descendant on that detach even though the reattach is synchronous — this
is a different failure window than cycle-2 Major 1 (which was the per-tick rebuild
destroying the button node entirely); here the same node survives, but focus still
drops, only when a session's sort position actually changes (a real priority change, not
every tick).

Fix: before the reorder loop, capture `document.activeElement`'s identity in terms
`reconcileCards` already understands — either the focused element is the card itself
(`data-session-id`) or one of its action buttons (`data-action` + the button's own
`data-id`, which carries the session id). After the reorder loop (and the
seen/departed-id cleanup) runs, if `document.activeElement` no longer matches the
captured reference (meaning focus was actually lost, not deliberately moved by the
caller), re-look-up the same logical target by session id (+ action, if it was a button)
and call `.focus()` on it. Only one code path reaches `insertBefore` for cards
(`reconcileCards`'s single reorder loop) — there's no second call site to sweep.

Re-measured live (same throwaway-spec pattern): focused session B's End button, then
posted a `Notification` (`idle_prompt`) that promoted B to `needs_input`, above session A:

```
ORDER before=["1","2"] after=["2","1"]
SORT-CHANGE focus: activeTag=BUTTON action=end id=2
```

`endBtnB.toBeFocused()` (Playwright's own focus assertion, not just the dataset probe)
passed — focus survived the reorder rather than falling to `<body>` (the pre-fix
behaviour the review measured: `SORT-CHANGE focus: before=true after=false
active=BODY`).

**Known related, explicitly not fixed this cycle**: `web/src/main.ts`'s
`reconcileTilesGrid` has the identical `insertBefore`-on-reorder pattern (and an
identical, now similarly optimistic, comment claiming it "keeps focus") for the Tiles
grid. The review's Minor 1 named only the rail (`web/src/render/sessions.ts:276`) with a
rail-specific repro; I did not extend the fix to the tiles grid because it wasn't in the
list of issues handed to this fix cycle and I did not want to touch unreviewed code
under a fix-mode change. Flagging it here so it isn't silently absorbed as "already
covered" — the tiles grid likely has the same latent defect and would need the same
treatment if/when re-sort-while-focused becomes reachable there (currently REQ-12's
tile-footer buttons don't drive priority sort the way the Notification-triggered
`needs_input` promotion does for the rail, so the live-tile grid's sort order is less
volatile in practice, but the code path exists).

### Minor 3 / Minor 7 — hover-only `.acts-row`, sign-off record

Damian has confirmed hover-only action rows (revealed on `:hover` / `:focus-within`) as
the intended behaviour — no behaviour change beyond the Critical-1 scoping fix above
(which only *scopes* the hover-only rule to `.card`, it does not change hover-only to
always-on or vice versa for cards). Recorded here per this cycle's instruction.

Minor 7 ("`.acts-row` is unconditionally visible on every live rail card") is the same
point the review itself already marked "resolved this cycle by Minor 3 above... closed
here for the record" — it's cycle-1/2's original always-on state, closed by cycle 2's
hover-only fix and reconfirmed, not reopened, by this cycle's Critical-1 fix (which
scopes the *reveal* rule but keeps the same hover-only behaviour for cards). No separate
action taken; closing it here alongside Minor 3 as the review itself directed.

### Verification (Fix Attempt 3)

- `npx tsc --noEmit` — 0 errors.
- `npm run build` (web/) — succeeds, `tsc --noEmit && vite build`.
- `npm test` (web/, Vitest) — 387/387 passing, 16 files, unchanged (no test file
  edited this cycle either).
- `npx playwright test` (full suite) — 94/94 passing.
- Two throwaway measurement spec files (`e2e/zz-fixcycle3-measure.spec.ts`,
  `e2e/zz-fixcycle3-hover.spec.ts`) were used to gather every live-browser number quoted
  above, then deleted — `git status --short web/e2e/` shows neither file remains (only
  the plan's own pre-existing untracked spec files, `actions.spec.ts` and
  `reconcile.spec.ts`, are listed).
- `rg -n 'rose' web/src/style.css web/index.html` output pasted above in full, in the
  Major-2 section.

## Handoff (Fix Attempt 3)

**Build status**: `npx tsc --noEmit` and `npm run build` exit 0.

No test files were edited this cycle. New user-facing behaviour for e2e-specs to
consider covering:

- **The `--danger` colour** now renders on Remove-hover and the filled End/Remove
  confirm buttons (`#C94F4F` fill / `#7A3535` border / white text) instead of the old
  rose shade (`#E36A6A`). No existing assertion depends on the exact colour value (none
  of the plan's specs assert computed `background-color`), so nothing breaks, but a
  colour-scoped visual-regression style test would need updating if one existed.
- **The cap's Resume button is now visible at full opacity** (`opacity: 1`) on both
  dead-surface sites at all times, not just on hover/focus — it was never actually
  hidden from Playwright's `toBeVisible()` (that's why the suite stayed green through
  the defect), but a computed-style guard (the review's own Minor-2 suggestion —
  `expect(capRow).toHaveCSS("opacity", "1")`) is now meaningful to add and would catch a
  future regression of this exact class.
- **Focus now survives a rail re-sort**, not just a render tick. A test that focuses a
  card's action button, triggers a genuine priority change (e.g. a `Notification`
  promoting a different session to `needs_input`, reordering the rail), and asserts the
  originally-focused button is still focused afterward would now pass and would have
  failed before this fix.
