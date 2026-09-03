# E2E Test Specs: ui-text-and-focus

**Plan**: ui-text-and-focus
**Mode**: fix (review cycle 1)
**Verdict**: pass
**Tests created**: 21 (17 + 4 in this fix wave)
**Live run**: 13/13 passing (rename.spec.ts); 242/242 passing (full suite, `make e2e`)

## Tests

| File | Test Name | Requirement | What It Verifies | Run status |
|------|-----------|-------------|-------------------|------------|
| web/e2e/focus-marker.spec.ts | the top rail card is current by default, and clicking another card moves the marker (E1) | REQ-1, REQ-3, INV-3 | Default focus is current; a rail-card click moves `aria-current`/`.current` | collection-only |
| web/e2e/focus-marker.spec.ts | clicking into the live terminal leaves the marker on the clicked-into session (E2) | REQ-1, REQ-3 | Keyboard focus entering the terminal doesn't move or clear the marker | collection-only |
| web/e2e/focus-marker.spec.ts | Tiles never shows a current strip card; switching back to Focus restores exactly one (E3) | REQ-1, INV-3 | `#tiles-strip` never carries `aria-current`; Focus always has exactly one | collection-only |
| web/e2e/focus-marker.spec.ts | Cmd+2 moves the marker to the rail's second card (REQ-3) | REQ-3 | ⌘-N is one of the marker-following paths | collection-only |
| web/e2e/focus-marker.spec.ts | removing the focused session falls the marker through to the remaining session (REQ-3) | REQ-3 | Removal fallthrough moves the marker to the survivor | collection-only |
| web/e2e/focus-marker.spec.ts | a manual drag reorder follows the current session's id, never a stale DOM slot (REQ-3, INV-3) | REQ-3, INV-3 | A dragged current card keeps the marker; the card that takes its old slot never inherits it | collection-only |
| web/e2e/focus-marker.spec.ts | .card.current renders on --bg-hover with an --edge ring and its acts-row visible without hovering (REQ-2) | REQ-2 | Ground/ring/reveal styling, cross-checked against the live theme tokens, without `:hover` | collection-only |
| web/e2e/rename.spec.ts | clicking the mainhead title opens a prefilled, selected field; Enter commits the new title everywhere (E4) | REQ-10, REQ-11, REQ-13, REQ-14 | Open/prefill/select, commit, mainhead + rail + `GET` state all update | collection-only |
| web/e2e/rename.spec.ts | a status-line post's session_name never overrides an active title override (E5) | REQ-12, INV-1, INV-2 | A processed status post with a different `session_name` leaves the override's display title alone | collection-only |
| web/e2e/rename.spec.ts | clearing the field reverts the title to Claude's last-known name (E6) | REQ-11, REQ-14 | Empty commit with an override present sends `{"title": null}`; display reverts to Claude's name | collection-only |
| web/e2e/rename.spec.ts | pressing Escape cancels an edit with the title unchanged and no PUT …/title request sent (E7) | REQ-14 | Escape sends no request at all | collection-only |
| web/e2e/rename.spec.ts | an override survives a daemon restart, on the mainhead/rail card, and in Tiles on both the strip card and the promoted tile's header (E8, E9) | REQ-9, REQ-11 | `title_override` survives a restart+reload; renders correctly via both the strip-card and live-tile-header templates | collection-only |
| web/e2e/rename.spec.ts | renaming a live tile's header updates that tile, leaves a neighbour tile untouched, and reaches Focus's rail/mainhead; the header is undraggable only while editing (E11, E12) | REQ-13, REQ-14 | Tile-surface rename commits everywhere, a neighbour tile is unaffected (multi-session safety), `draggable` flips only while editing | collection-only |
| web/e2e/rename.spec.ts | a header drag still reorders the Tiles grid and opens no rename textbox (E13) | REQ-13 (edge case 16) | Drag-to-reorder still works and never opens an edit field | **ran green at authoring** |
| web/e2e/rename.spec.ts | a status-line post arriving mid-edit leaves the open mainhead field's value and focus untouched (REQ-15, INV-4) | REQ-15, INV-4 | Edit isolation across a real ingest-driven render, using genuine keystrokes (not `.fill()`) | collection-only |
| web/e2e/rename.spec.ts | a rename works on a dead session (REQ-16) | REQ-16 | The rename trigger and commit path work on an ended session | collection-only |
| web/e2e/type-scale.spec.ts | the root font size is 15px, and a rail card's title renders at the fs-base step, on a fresh load (E10) | REQ-6, REQ-7 | `--fs-root`/`--fs-base` land on `:root`/card title, on first paint | collection-only |

REQ-4/REQ-5 (contrast floors) and REQ-8 (terminal `fontSize`/`lineHeight` untouched) are
gated by `make contrast` and a grep respectively (Automated Checks W3/W8) — no E2E
duplicates those, per the plan's own Automated Checks table (`E1 make e2e` is the only
E-tagged automated check, and it runs the whole suite including these files).

## Fixture Changes

No new hook/status-line payload builders were needed. `helpers/payloads.ts`'s existing
`envelopedSessionStart` and `envelopedStatusLineFull` (both already carrying
`sessionName`) cover every fixture this plan's tests need — REQ-12/INV-2's "a status
post never touches `titleOverride`" is exercised with the existing `sessionName` option,
no new shape.

`helpers/session.ts` gained (all additive, following the file's existing
`sessionCard`/`stateBadge` pattern and `helpers/railorder.ts`'s `pinViaApi`):
- `SessionObject.titleOverride: string | null` — the new wire field (protocol §5.3 delta).
- `currentRailCard(page)` / `currentStripCard(page)` — the REQ-1 marker locator, scoped
  per surface the same way `helpers/terminal.ts`'s `stripCard` scopes to disambiguate a
  session's rail card from its strip copy.
- `mainheadHeading(page)` / `mainheadRenameButton(page)` / `mainheadRenameField(page)` —
  the mainhead's rename trigger/field (Testable UI Elements).
- `tileRenameButton(page, title)` / `tileRenameField(page, title)` — the tile-scoped
  rename trigger/field, built on `helpers/terminal.ts`'s `liveTile` (imported) so a
  shared-title collision between two tiles can't produce a strict-mode ambiguity (edge
  case 19).
- `putTitleViaApi(page, daemonBaseURL, id, title)` — direct `PUT …/title` for building a
  starting configuration (E8/E9's pre-restart override) without re-deriving it through
  the UI editor, mirroring `pinViaApi`.

## Coverage

| Requirement | E2E Tests |
|-------------|-----------|
| REQ-1 | E1, E2, E3, and every REQ-3 test (the marker itself) |
| REQ-2 | `.card.current renders on --bg-hover…` |
| REQ-3 | E1, E2, E3, Cmd+2, removal fallthrough, drag reorder |
| REQ-4, REQ-5 | not E2E — `make contrast` (W3), Reviewer-Verified W10 |
| REQ-6, REQ-7 | E10 |
| REQ-8 | not E2E — grep (W8), Reviewer-Verified |
| REQ-9 | E8/E9 (restart persistence) |
| REQ-10 | E4 (the endpoint itself, via the UI commit path) |
| REQ-11 | E4, E5, E6, E8/E9 |
| REQ-12 | E5 |
| REQ-13 | E4, E11/E12, E13 |
| REQ-14 | E4, E6, E7 |
| REQ-15 | "a status-line post arriving mid-edit…" |
| REQ-16 | "a rename works on a dead session" |
| REQ-17, REQ-18 | not E2E — Reviewer-Verified (docs) |
| REQ-19 | not E2E — Reviewer-Verified (tooltip text; the accessible name is the button's text either way, per the Testable UI Elements note) |

## Regression Pins Run Live at Authoring

One test in this delta is a regression pin masquerading under a new-feature acceptance
ID: `rename.spec.ts`'s "a header drag still reorders the Tiles grid and opens no rename
textbox (E13)" exercises only pre-existing drag-to-reorder behaviour
(`dragTileOnto`/`tilesGridOrder`, unchanged by this plan) plus a negative assertion
(`getByRole("textbox", { name: "Session title" })` has count 0) that is vacuously true
before the rename feature exists — nothing in the test's own body depends on code this
plan adds. Per the authoring-mode rule, it was rebuilt (`make web-build build`) and run
alone:

```
npx playwright test rename.spec.ts -g "a header drag still reorders the Tiles grid and opens no rename textbox"
✓ 1 [chromium] › e2e/rename.spec.ts:305:1 › a header drag still reorders the Tiles grid and opens no rename textbox (E13) (2.5s)
1 passed (3.4s)
```

No other test in this delta qualifies: every other test's very first assertion depends
on code this plan has not written yet (an `aria-current` attribute that is never set, a
`PUT …/title` endpoint that 404s, a mainhead/tile rename button that does not exist, a
15px root that is still 16px by default) — verified below.

## Sanity Run Against the Current (Pre-Implementation) Tree

Not required by the authoring gate (only collection + regression pins are), but run
anyway to confirm every new-behaviour test fails for the *right* reason — missing
feature, not a broken locator or helper bug — before handing off:

```
npx playwright test focus-marker.spec.ts type-scale.spec.ts rename.spec.ts
16 failed, 1 passed (46.8s)
```

Representative failures, all "feature not built yet" rather than a spec defect:
- `focus-marker.spec.ts` (7/7 fail): `toHaveAttribute("aria-current", "true")` — real
  card resolved, attribute simply absent (`main.ts` never threads `focusedId` through
  `renderSessions` yet).
- `type-scale.spec.ts`: `getComputedStyle(document.documentElement).fontSize` is `16px`
  (the browser's own default — `html` carries no font-size rule yet), not the expected
  `15px`.
- `rename.spec.ts` (8/9 fail): `locator('#mainhead h2.name').getByRole('button')` times
  out — the heading has no button child yet; `putTitleViaApi` throws `title PUT failed:
  404` — the route doesn't exist yet.
- `rename.spec.ts`'s E13 (the regression pin): passed, as logged above.

`npx tsc --noEmit -p .` (this project's `strict`/`noUncheckedIndexedAccess`/
`noUnusedLocals`/`exactOptionalPropertyTypes` config, which covers `e2e/`) exits 0 with
no output — the new files and the `SessionObject`/helper additions typecheck cleanly.

## Notes

- **Testable UI Elements accessible-name note (REQ-19-adjacent)**: the plan's own table
  says the rename trigger's accessible name is its text content (the display title),
  with `title="Rename"` (or REQ-19's extended tooltip) contributing only a description,
  not the name. `mainheadRenameButton`/`tileRenameButton` rely on that — `getByRole`
  matches by text, never by the tooltip string. If web-impl instead gives the button an
  `aria-label` (which would override the text-derived name), these locators will need a
  validate-mode repair; flagging it now so it isn't a surprise.
- **E8/E9's stripped-session assumption**: the combined test assumes the 5th
  (last-launched) of five sessions is the one the default 2x2 grid strips, mirroring
  `views.spec.ts`'s own density test's finding for identical launch order/no
  pinning/no attention-sort. It asserts this dynamically (checks which of the five is
  actually live/stripped) rather than hardcoding the index, so a different-but-still-one
  stripped/four-live split would still pass; only "the override lands on a stripped
  session at all" is assumed, which fails loudly (`expect(stripped).toEqual([...])`) if
  wrong rather than silently mismatching.
- **Unmeasured wire shapes**: none. Every fixture used (`envelopedSessionStart`,
  `envelopedStatusLineFull`) is a pre-existing, already-measured builder from
  `helpers/payloads.ts` — this plan added no new hook/status-line field to the wire.
- **`web/e2e/helpers/dragTileOnto`'s existing drag-source note**: edge case 16 says a
  mousedown on the rename button followed by movement fires `dragstart` on the header
  (the button is its child) — the existing `dragTileOnto`/`.dragTo()` helper drags from
  `.thead`'s own bounding-box center, which the plan's markup should keep clear of the
  button's hit area (a flex layout with the button only over the name text, not the
  whole header). If validate mode finds `.dragTo()` now lands on the button instead, that
  is a locator repair here, not a product change — full margin/geometry checking was out
  of scope for this authoring pass.

## Validate Attempt 1

Rebuilt in the required order — `make web-build` (0 errors; the `tsc --noEmit` pass over
`web/e2e/` including my three spec files and `helpers/session.ts` is clean), then `make
build` (embeds the fresh assets, `go build` exits 0) — then ran the three spec files live
from `web/`:

```
npx playwright test e2e/focus-marker.spec.ts e2e/rename.spec.ts e2e/type-scale.spec.ts
```

Result: **9/17 passed**. `focus-marker.spec.ts` (7/7) and `type-scale.spec.ts` (1/1) are
fully green. `rename.spec.ts` is 2/10 green (E13's drag-only regression pin, and the
initial page-load state incidentally not exercising the mainhead); **8/10 fail**, and
every failure traces to one root cause.

### Root cause (single defect, not a spec problem)

`web/src/render/mainhead.ts:47`, inside `renderMainhead`'s "no focused session" branch:

```ts
if (!session) {
  elements.root.hidden = true;
  elements.nameEl.textContent = "";   // <-- wipes the <button class="rename"> CHILD too
  elements.metaEl.textContent = "";
  return;
}
```

`main.ts` captures `renameBtn` once at startup via `requireElement<HTMLButtonElement>("#mainhead
button.rename")` (`main.ts:110`) — a live reference to the button node that ships inside
`<h2 class="name">` in the static markup (`web/index.html:69-70`, confirmed present
byte-identical in the built `internal/webui/assets/index.html`). `render()` always runs at
least once with zero sessions before the first `sessionUpsert` arrives (the dashboard's
initial paint precedes the async launch/broadcast), so this branch fires on page load,
sets `nameEl.textContent = ""`, and that assignment detaches the button element from the
DOM **permanently** — not just clears its text. Every subsequent call to `renderMainhead`
with a real session writes `elements.renameBtn.textContent = session.title ?? "untitled"`
onto that now-detached node (`mainhead.ts:57`), which has no visible effect because the
node is no longer inside `#mainhead`. The heading is left as `<h2 class="name"></h2>` —
empty, no button — for the rest of the page's life, on every session, in every one of my
tests that reads the mainhead.

Confirmed empirically with a throwaway debug spec (written, run, and deleted — not part
of the committed suite): loaded the dashboard, launched one session via the real
`POST /api/sessions`, and dumped `#mainhead`'s `outerHTML` at 0/100/300/600/1000/2000ms.
The button is already gone at the very first sample (0ms) and never returns:

```
AT +0ms MAINHEAD HTML:
<div id="mainhead" class="mainhead">
            <h2 class="name"></h2>
            <span class="meta">muster-e2e-repo-N8KmcZ · haiku</span>
            ...
```

Cross-checked `web/src/render/tiles.ts`'s `updateTileChrome` (lines 68-77) and confirmed
it does **not** have this bug: it writes only `renameBtn.textContent`, never
`nameEl.textContent`, so a tile's rename button survives every render pass. The defect is
isolated to the mainhead's no-session branch — one line, one file.

This is exactly the class of bug the plan's own REQ-15/INV-4 comment was guarding against
(never touch the button while an edit isn't open, so it stays live) — the "no session"
branch just wasn't written with the same care as the "has session" branch three lines
below it, which correctly reads `dataset["editing"]` and only ever writes
`renameBtn.textContent`.

### Why this is their defect, not mine

The plan's Testable UI Elements table pins the mainhead heading as `<h2 class="name">`
wrapping a `<button type="button" class="rename">` whose accessible name is the display
title (REQ-13(a)). My locators (`mainheadRenameButton`/`mainheadRenameField` in
`web/e2e/helpers/session.ts`) query exactly that shape and did so correctly through
authoring's collection-only pass. The button the plan specifies is present in the
committed static markup and in the built assets; the running app deletes it from the DOM
before any test ever touches it. There is no locator repair available here — the element
genuinely is not in the page by the time any test's first assertion runs, and no
`waitFor`/timeout increase would help since the node never comes back (verified by
sampling out to 2000ms above). Rewriting my locators to target the stale detached node,
or to walk `#mainhead`'s children some other way, would be routing around a real bug
rather than fixing a spec defect — explicitly forbidden.

I did not touch `web/src/render/mainhead.ts` or any other file under `web/src/`, `cmd/`,
or `internal/`. No spec file was changed in this attempt (no repair table — nothing in my
specs needed fixing).

## E2E Implementation Bugs (verdict = implementation-bug)

| Bug | Route | Plan reference | Expected (per plan) | Actual | Failing test |
|-----|-------|-----------------|----------------------|--------|--------------|
| `renderMainhead`'s no-session branch clears `nameEl.textContent`, permanently detaching the `<button class="rename">` child instead of leaving it in place | `[web-impl]` | Testable UI Elements: "Mainhead heading — `heading` — `#mainhead h2.name`" and "Rename trigger — `button` — inside the heading"; REQ-13(a) | `#mainhead h2.name` always contains a `button.rename` child once the dashboard has loaded, with its text set to the display title (or `untitled`) whenever a session is focused | `<h2 class="name">` is permanently empty (no button at all) from the very first render pass onward, on every session, because `mainhead.ts:47`'s `elements.nameEl.textContent = ""` wipes the button before any session data ever arrives | rename.spec.ts: E4, E5, E6, E7, E8/E9, E11/E12, "a status-line post arriving mid-edit…" (REQ-15/INV-4), "a rename works on a dead session" (REQ-16) — 8 of 10 tests in the file |

## Notes (Validate Attempt 1)

- `focus-marker.spec.ts` and `type-scale.spec.ts` needed no repairs and are fully green —
  REQ-1/REQ-2/REQ-3/INV-3 (the rail marker) and REQ-6/REQ-7 (the 15px type ramp) are
  correctly implemented and covered.
- `rename.spec.ts`'s tile-only assertions (inside E11/E12, after the mainhead check that
  fails first) are untested by this run because the test fails on its earlier mainhead
  assertion; `tiles.ts`'s rename wiring looks correct by inspection (see root-cause
  analysis above) but is not yet proven live by this suite — re-run once the mainhead
  defect is fixed to get real signal on the tile surface too.
- No fixture, helper, or config change was made. `helpers/session.ts`'s
  `mainheadRenameButton`/`mainheadRenameField`/`tileRenameButton`/`tileRenameField` are
  unchanged from authoring.
- Full-suite sweep (`make e2e`) was not run this attempt — the plan's own Validate Mode
  step 5 gates that on "once your own spec file passes," which it did not.

## Validate Attempt 2

Rebuilt in the required order (`make web-build build`) against the tree after the
mainhead fix (commit `eea314f`, "stop mainhead heading from wiping its rename button" —
Fix Attempt 1 in `web-implementation.md`): `web-build`'s `tsc --noEmit` over `web/e2e/`
including my three spec files passed with no output, `vite build` succeeded, and
`go build` embedded the fresh assets.

### Own spec files, first run

```
npx playwright test e2e/focus-marker.spec.ts e2e/rename.spec.ts e2e/type-scale.spec.ts
15 passed (11.5s)
2 failed
```

The mainhead fix resolved 6 of the 8 rename.spec.ts failures from Validate Attempt 1
outright (E4, E5, E6, E7, the mid-edit status-line test, and the dead-session rename
test all went green with zero spec changes). Two new failures surfaced — both locator
defects in my own spec, not implementation bugs (see Repairs below):

1. `focus-marker.spec.ts`'s "removing the focused session falls the marker through to
   the remaining session (REQ-3)" — `mainhead.getByRole("button", { name: "Remove" })`
   is a substring match by default, and now also matches the mainhead's rename trigger
   (accessible name = the display title) whenever that title itself contains "remove" —
   which this test's own fixture ("marker-remove-a") does.
2. `rename.spec.ts`'s E11/E12 tile-rename test — `tileRenameField`/`tileDragHandle` are
   scoped through `liveTile(page, title)`, which filters by `textContent`. The moment a
   tile's rename editor swaps its `button.rename` for `input.name-edit`, the title text
   moves into the input's `value` attribute (not `textContent`), so a `liveTile` locator
   built from the *old* title text stops matching that tile — an `expect` re-resolves a
   Playwright `Locator` lazily on every call, so this bit both the field assertion
   during editing and the drag-handle assertion which spans before/during/after the
   rename (the "after" state fails for the same reason with a different title).

### Own spec files, second run (after repairs)

```
npx playwright test e2e/focus-marker.spec.ts e2e/rename.spec.ts e2e/type-scale.spec.ts
17 passed (6.1s)
```

### Suite-wide collection re-check

```
npx playwright test --list
Total: 238 tests in 22 files
```
Clean — no duplicate titles, no collection errors.

### Full-suite sweep (`make e2e`)

First run surfaced 4 failures in pre-existing spec files, all one root cause traceable
to this plan's own approved delta:

```
4 failed
  e2e/actions.spec.ts:61:1  › End from the mainhead ends only the focused session… (E5, INV-2)
  e2e/actions.spec.ts:545:1 › Removing a live session ends it first… (E9)
  e2e/gauges.spec.ts:145:1  › the same status data renders in the Tiles view's tile header (E4)
  e2e/theme.spec.ts:189:1   › Tiles: choosing a theme re-themes both live tiles' grounds (E8, INV-3 Tiles multi-instance)
234 passed
```

Each failure is `strict mode violation`: a pre-existing `getByRole("button", { name:
"End"|"Remove"|"Tiles" })` locator (non-exact, default substring match) now also
matches the plan's new rename trigger — REQ-13/Testable UI Elements makes every session's
display title a button's accessible name on the mainhead heading and every tile header —
whenever that test's own fixture session title happens to contain the target word as a
substring (`end-mainhead-a`, `remove-live-a`, `gauge-e4-tiles`, `tiles-e8-a`). This is
the plan's approved Protocol/UI delta directly producing the new ambiguity in
pre-existing, unrelated tests — sanctioned breakage per Validate Mode step 5, not an
implementation bug (the mainhead End/Remove buttons and the view-switcher's Tiles button
all still exist, unchanged, and are exactly what each test intends to click). Fixed by
adding `exact: true` to the four specific call sites that collided; every other
`getByRole("button", { name: "End"|"Remove" })` locator in these files was left
untouched (their fixture titles don't collide, and touching them would be an
unnecessary, undeclared change to files outside my authored ones).

Second run of the full suite, after the four repairs:

```
make e2e
238 passed (58.9s)
```

Final collection re-check after all edits: `npx playwright test --list` → `Total: 238
tests in 22 files`, no errors.

## Repairs (Validate Attempt 2)

| # | Test | Symptom | Root cause in my spec | Fix | Assertion still covers |
|---|------|---------|-----------------------|-----|------------------------|
| 1 | focus-marker.spec.ts: "removing the focused session falls the marker through to the remaining session (REQ-3)" | `strict mode violation`: `mainhead.getByRole("button", { name: "Remove" })` resolved to 2 elements (the mainhead's own Remove button and the rename trigger, whose text "marker-remove-a" contains "remove") | Non-exact `getByRole` name match is a substring match; my own fixture title happens to contain the target word, and REQ-13 put a second, differently-named button in the same container | Added `exact: true` | REQ-3's removal-fallthrough assertion is unchanged — it still clicks the mainhead's actual Remove button and confirms the marker falls to the survivor; `exact: true` only removes the accidental second match, it does not touch what the test verifies |
| 2 | rename.spec.ts: "renaming a live tile's header updates that tile… (E11, E12)" | `element(s) not found` on `tileRenameField(page, "rename-tile-a")` while the field was open (its title text is inside the `<input>`'s `value`, not `textContent`, so the title-text-scoped `liveTile` filter stops matching); then the same failure mode moved to `tileDragHandle`'s draggable assertions once the field lookup was fixed | `liveTile`/`tileRenameField`/`tileDragHandle` all scope by `hasText: title`, and a Playwright `Locator` is lazily re-resolved on every `expect`/action call — so a locator built from a title that is mid-edit (in an input's value) or already renamed (post-commit) never matches that tile again | Added `liveTileById`/`tileRenameFieldById`/`tileDragHandleById` (data-session-id-scoped, additive helpers in `helpers/terminal.ts`/`helpers/session.ts`, following the existing `data-session-id` oracle pattern from `helpers/railorder.ts`); repointed this test's `field` and `handleA` locals to the id-scoped variants (captured from `sessionA.id`, already returned by `launchSession`) | REQ-13/REQ-14 (open/focus/prefilled field, commit) and REQ-13(b)/E12 (`draggable` flips false while editing, true again after) are asserted exactly as before — the id-scoped locator finds the same DOM node the title-scoped one found when it worked, just without losing it across the button↔input swap. Title-scoped `tileRenameButton`/`liveTile` calls elsewhere in the test (before any edit is open, or looking up a *different*, untouched tile) were left as-is since they aren't affected |
| 3 | actions.spec.ts:61 "End from the mainhead…(E5, INV-2)" — pre-existing, plan-superseded | `strict mode violation`: `mainhead.getByRole("button", { name: "End" })` matched the mainhead End button and the new rename trigger (title "end-mainhead-a" contains "end") | Sanctioned breakage: REQ-13/Testable UI Elements gives the mainhead heading a second button whose accessible name is the display title; this pre-existing test's own fixture title happens to collide | Added `exact: true` | E5/INV-2's assertion (End ends only the focused session; a live neighbour is unaffected) is unchanged — same button clicked, same outcome checked |
| 4 | actions.spec.ts:545 "Removing a live session…(E9)" — pre-existing, plan-superseded | Same violation, on `mainhead.getByRole("button", { name: "Remove" })` (title "remove-live-a") | Same delta collision | Added `exact: true` | E9's assertion (Remove ends-then-removes, warns in dialog copy, moves focus) is unchanged |
| 5 | gauges.spec.ts:145 "the same status data renders in the Tiles view's tile header (E4)" — pre-existing, plan-superseded | Same violation, on `page.getByRole("button", { name: "Tiles" })` (title "gauge-e4-tiles" contains "tiles") — the view-switcher's Tiles button vs. the launched session's own tile-header rename trigger | Same delta collision, on the global view switcher rather than the mainhead | Added `exact: true` | E4's assertion (status renders identically in the Tiles tile header) is unchanged — the view switch still happens via the same button |
| 6 | theme.spec.ts:189 "Tiles: choosing a theme re-themes both live tiles' grounds (E8, INV-3 Tiles multi-instance)" — pre-existing, plan-superseded | Same violation, on `page.getByRole("button", { name: "Tiles" })` (title "tiles-e8-a") | Same delta collision | Added `exact: true` | E8/INV-3's assertion (both live tiles re-theme) is unchanged |

No assertion was deleted, skipped, or weakened.

## Test Run Output (Validate Attempt 2, final)

```
$ npx playwright test e2e/focus-marker.spec.ts e2e/rename.spec.ts e2e/type-scale.spec.ts
17 passed (6.1s)

$ npx playwright test --list
Total: 238 tests in 22 files

$ make e2e
238 passed (58.9s)
```

## Notes (Validate Attempt 2)

- The Validate Attempt 1 implementation bug (mainhead's no-session branch detaching
  `button.rename`) is confirmed fixed — no rename.spec.ts test hit it this attempt.
- No fixture/payload change was needed. `helpers/session.ts` and `helpers/terminal.ts`
  gained three additive, id-scoped locator helpers (`liveTileById`,
  `tileRenameFieldById`, `tileDragHandleById`); no existing helper's signature or
  behaviour changed.
- Files touched this attempt, all under `web/e2e/`: `focus-marker.spec.ts`,
  `rename.spec.ts`, `helpers/session.ts`, `helpers/terminal.ts` (my own authored files),
  plus four sanctioned-breakage repairs in pre-existing, non-authored files:
  `actions.spec.ts`, `gauges.spec.ts`, `theme.spec.ts`. No file under `web/src/`,
  `cmd/`, or `internal/` was touched.

## Fix Wave (review cycle 1)

**Issue addressed**: Major 2, `[e2e-specs]` — "No spec covers REQ-15's view-switch
cancel, which is why a Critical reached review." Plus the coverage task: assert the new
user-facing behaviour recorded in `web-implementation.md`'s "Fix Attempt 1 (review cycle
1)" section — the ⌘\ keydown path and the masthead-button `mousedown` path are two
distinct mechanisms, both surfaces (mainhead, tile) need the pin, and an ordinary
blur-commit case (REQ-14) needed a green regression pin since none existed.

Four tests added to `web/e2e/rename.spec.ts`, all under the REQ-15 heading, placed
immediately before the existing E16 (dead-session rename) test:

1. **Tile edit + ⌘\ to Focus** — "switching to Focus via cmd-backslash while a tile
   rename is open sends no PUT and leaves the title unchanged (REQ-15)". Opens a tile's
   rename field, types, presses `Meta+\`, asserts the view actually switched
   (`aria-pressed="true"` on the Focus button — proof the handler ran, not that nothing
   happened), zero title PUTs observed, and `GET /api/state`'s `titleOverride` is still
   `null` with `title` unchanged.
2. **Tile edit + click Focus button** — the mouse path web-impl's fix log found failing
   first (a `mousedown` default-action blur races ahead of `requestView`/`click`). Same
   assertions, driven by `page.getByRole("button", { name: "Focus" }).click()` instead of
   the keyboard shortcut.
3. **Mainhead edit + switch to Tiles** — the mirror direction, one path (a direct click
   on the Tiles button, per the plan's "either path is enough" allowance). Also confirms
   the mainhead still reads the pre-edit title after switching back to Focus.
4. **Ordinary blur-commit still works (REQ-14 regression pin)** — opens the mainhead
   editor, types, clicks "New session" (a control with no view-switch guard), and
   asserts the *opposite*: exactly one title PUT fires and the new title is committed
   everywhere. No such test existed before this wave; without it, a future fix that
   over-broadened `cancelOpenRenames()` (e.g. calling it on every blur instead of only
   the two guarded buttons) could regress REQ-14 with nothing to catch it.

All four use the same `page.on("request", …)` PUT-counting pattern E7 already
established in this file, and the same `tileRenameButton`/`tileRenameFieldById`/
`mainheadRenameButton`/`mainheadRenameField`/`getState`/`findSession` helpers the rest of
the file uses — no new helper needed.

### Fixture Changes

None. No new payload shapes — these tests never POST a synthesized hook/status-line
payload; they drive the real UI and read back `GET /api/state`, the same oracle every
other test in this file already uses.

### Coverage

| Requirement | E2E Tests |
|-------------|-----------|
| REQ-15 (view-switch cancels an open rename, both surfaces, both mechanisms) | the three new tests above (cmd-backslash, masthead-click, mainhead-mirror) |
| REQ-14 (ordinary blur commits) | the new "clicking an unrelated control… still commits" regression pin |

### Absence-assertion proof (per the validate-mode rule, applied here since these are new tests asserting "no PUT")

Before logging this wave, deliberately broke the fix in `web/src/main.ts` (commented out
the `cancelOpenRenames()` call inside `applyPrefsFromSnapshot`'s `if (prefs.view !==
view)` block, and both `viewFocusBtn`/`viewTilesBtn` `mousedown` listeners), rebuilt
(`make web-build build`), and ran `npx playwright test e2e/rename.spec.ts -g "REQ-15"`:

```
✓  a status-line post arriving mid-edit … (REQ-15, INV-4)
✘  switching to Tiles while the mainhead rename is open … (REQ-15)
✘  clicking the masthead Focus button while a tile rename is open … (REQ-15)
✘  switching to Focus via cmd-backslash while a tile rename is open … (REQ-15)
3 failed
```

All three of the new cancel-pin tests went red exactly as expected — the pre-existing
mid-edit-status test (unaffected by this code path) stayed green, confirming the
breakage was scoped correctly and the new assertions are not vacuous. Restored
`web/src/main.ts` from a backup copy immediately after
(`git diff --stat -- web/src/main.ts` showed no changes), then rebuilt again — the
resulting `vite build` output hash (`index-Cw7tqe5Q.js`) was byte-identical to the
pre-breakage build, confirming a clean restore — and reran the full file green (see
below).

### Live run

```
$ npm run e2e -- e2e/rename.spec.ts
Running 13 tests using 6 workers
  13 passed (5.9s)
```

Full suite after the addition:

```
$ make e2e
242 passed (60.0s)
```

(238 pre-existing + 4 new = 242; no other spec's count or content changed.)

### Repairs

None — no existing assertion was touched, narrowed, or rewritten this wave. Only new
test bodies were added.

No assertion was deleted, skipped, or weakened.

### Notes

- `git status --porcelain` after this wave shows only `web/e2e/rename.spec.ts` modified.
- The `⌘\` shortcut is expressed as `page.keyboard.press("Meta+\\")` (a single literal
  backslash at runtime) — verified against `main.ts`'s own `event.key === "\\"` keydown
  check (`web/src/main.ts:958`).
- "New session" is scoped to `#view-focus` in the blur-commit test
  (`page.locator("#view-focus").getByRole("button", { name: "New session" })`) because
  Tiles has its own same-named button in the DOM (`#tiles-new-session-button`) and an
  unscoped `getByRole` would be a strict-mode violation, per the existing
  `tiles-launch.spec.ts` helper's own scoping.
