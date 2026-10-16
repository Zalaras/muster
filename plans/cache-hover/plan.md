# Plan: cache-hover

**Status**: completed
**Shape**: fix
**Work Type**: web
**E2E Scope**: new-specs
**Fixture plan**: cache-warmth.spec.ts daemon (per test, as every test in the file — they fix the page clock and some restart the daemon)
**Features**: rail, tiles, usage, groups
**Description**: The rail card timer's cache hover opens after a short delay and stays readable while the cards above it change height, instead of waiting on Chrome's native tooltip (#99).

## Symptom

> **Hover for cache takes too long to show** ([#99](https://github.com/Zalaras/muster/issues/99)) — The
> hover that shows cache information takes too long to appear. Expected: The cache hover should
> appear much more quickly.
> Filed 2026-10-16 from musterd 0.22.2 / Claude Code 2.1.293, focus view, session working.

The developer narrowed it in research: the group header timer's hover is fine; the rail card timer's
is the slow one. The issue snapshot had six sessions, all working, in attention order.

## Findings

- The card timer's hover is a native `title` (`web/src/render/sessions.ts:110`, text from
  `cacheWarmth` in `web/src/sessions/cache.ts`). Chrome on macOS decides the native tooltip's delay
  (about a second) and a page cannot shorten it.
- Ruled out — the per-second tick. The group header timer rewrites its `textContent` and `title`
  every tick too (`web/src/render/railsections.ts:145-146`, and `writeSummary` rebuilds its
  siblings with `replaceChildren`), and the developer reports it as fine. The hover text changes
  once a minute until the last minute. The card is reused, never rebuilt (`reconcileCards`), and
  `reconcileKeyedOrder` moves no node in a steady rail.
- Measured — the card timer moves under a still pointer. A throwaway probe against a scratch
  daemon (four sessions; three above the target card posting a prompt or reply of varying length
  about every 0.7 s; the target timer's on-screen position sampled every frame for 20 s):

  | traffic above the target | timer moved | largest jump | card detached | hover text changed |
  |---|---|---|---|---|
  | prompts only (stay working) | 11 times | 35.5 px | 0 | 0 |
  | full turns (working ↔ idle) | 29 times | 35.5 px | 0 | 0 |

  Each prompt or reply rewrites the activity line under a card's title (one to three lines), so
  the card's height changes and every card below it slides. A group header heads its section, so
  nothing above it inside the rail changes height. Each move leaves the pointer over a different
  element, which restarts or ends the native tooltip's wait.
- Not measured: that a move under a still pointer restarts Chrome's own tooltip delay. Native
  macOS tooltips follow only the real cursor. This terminal has neither Screen Recording nor
  Accessibility permission (`CGPreflightPostEventAccess() == false`), and Playwright's synthetic
  mouse never showed a native tooltip even on a static control.
- The dashboard's own hover already exists: the group popover (`web/src/render/grouppopover.ts`)
  opens `POPOVER_DELAY_MS` (350 ms) after `mouseenter` and is placed by `placeAnchored`
  (`web/src/render/anchored.ts`), appended to `document.body` with `role="tooltip"`.

## Requirements

### Must Have
- **REQ-1**: Hovering a card timer opens a `role="tooltip"` panel holding that timer's one-line
  warmth text (`cache warm · cold in <n>`, `cache cold`, `cache unknown` — the strings
  `cacheWarmth` already composes) `POPOVER_DELAY_MS` after the pointer enters the timer. The same
  applies on the Tiles strip card, which shares the template and builder.
- **REQ-2**: While open, the panel stays open when the card moves under a still pointer, as long
  as the pointer is still over the same card. On each render it repositions to the timer's current
  box and re-reads its text, so it counts down live. It closes when the pointer leaves the card, on
  a pointerdown, and when the card is removed.
- **REQ-3**: The card timer has no native `title` (no second, slow tooltip). Its warmth text is
  its `aria-description`; `aria-label="time in state"` is unchanged.
- **REQ-4**: Behaviour unchanged: the group header timer keeps its native `title`, the group
  popover is untouched, and the panel never takes a click (`pointer-events: none`, as `.pop`).

## Affected Files
### Web (web-impl)
- `web/src/render/sessions.ts` — REQ-1, REQ-3: the card timer stops writing `title` and writes
  `aria-description`; it wires the hover through the controller `CardRenderOptions` hands it.
- `web/src/render/<new or shared builder>.ts` — REQ-1, REQ-2: a hover-tip controller (instance
  state only, per render/CLAUDE.md) that reuses `POPOVER_DELAY_MS` and `placeAnchored`; it may be
  lifted out of `grouppopover.ts` if that is the smaller change.
- `web/src/features/rail.ts`, `web/src/features/tiles.ts` — REQ-1, REQ-2: create one controller per
  host, pass it down, refresh it on render, and close it on the same signals the group popover
  closes on.
- `web/src/style.css` — REQ-1, REQ-4: the panel's style, from the design system's tooltip and
  popover tokens.
### Existing tests this breaks
- `web/e2e/cache-warmth.spec.ts`: E14, the fade test and the boundary test assert the card timer's
  `title`; they move to `aria-description` (REQ-3). The Proof agent rewrites them in the red pass.

## Proof

Written by **e2e-specs** in `web/e2e/cache-warmth.spec.ts` (helpers in `helpers/cache-warmth.ts`):

1. New test, *"a card timer's cache hover opens within the popover delay and stays open, counting
   down, while a card above it changes height"*. Two sessions; the lower is idle with a warm 1h
   cache under the fixed warmth clock. Hover the lower card's timer: a `role="tooltip"` with text
   `cache warm · cold in 60m` is visible within 1 s. Post prompts of different lengths to the
   upper session until the lower card's box has measurably moved: the tooltip is still visible,
   and its top is within the timer's box plus the anchor gap. Advance the clock 50 minutes: its
   text reads `cache warm · cold in 10m`. Move the pointer off the card: it is hidden. Red today
   because no `role="tooltip"` element ever appears.
2. The existing card-timer `title` assertions become `aria-description` assertions, plus one
   `not.toHaveAttribute("title")`. They are red today too.

## Edge Cases
1. Pointer leaves the timer before the delay elapses → no panel → E1.
2. The hovered card is removed (session removed) while the panel is open → the panel goes with it → untested: a hover across a removal needs a timed race this suite avoids; reviewer reads the close path.
3. Rail scrolls under a still pointer → treated as a card move (REQ-2) → untested: same as 2.

## Acceptance Criteria
### Automated Checks
```checks
E1 cd web && npx playwright test cache-warmth.spec.ts
W1 make web-lint
W2 make web-test
W3 make web-build
E2 make e2e
```
### Reviewer-Verified
- The panel reads as one with the group popover (font, ground, edge gap) and opens below the
  timer, clear of the card's own title. Near the viewport bottom it flips above the timer as the
  menu and the group popover do, and may then cover the title — accepted by the developer in
  review cycle 1 (Decision 1, option A).

## Doc Delta
**rail** — becomes true: the card timer names the warmth in its own hover panel, opened 350 ms
after the pointer enters it and kept open while the pointer stays on the card; the text is the
timer's accessible description. Stops being true: nothing (the spec says only "names the warmth on
hover"). The hover text itself (`kb:adr/rail-timer-tinted-wherever-cache-warmth-known`) is unchanged.

## Out of scope
- Cards changing height as their activity line rewrites, which moves every card below them
  (option 2 in research). The developer may file it.
