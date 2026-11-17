# Plan: sweep-2026-11-17-1

**Status**: completed
**Shape**: fix
**Work Type**: web
**E2E Scope**: none
**Fixture plan**: none
**Render fixtures**: shell-busy, shell-busy-tiles
**Features**: surfaces, theme
**Description**: The shell segment's busy spinner turns in place — one `--fg-dim` arc over a faint full `--line-control` ring — instead of appearing to slide around its centre (#126).

## Symptom

### e1 — The loading animation on the shell tab is off-center

- [ ] **The loading animation on the shell tab is off-center** ([#126](https://github.com/Zalaras/muster/issues/126)) — The
  loading spinner on the shell tab shifts position while it is spinning instead of staying centered.
  Expected: The loading spinner should stay still in the center and only rotate.
  Filed 2026-11-16 from musterd 0.30.0 / Claude Code 2.1.322, focus view, session idle.
  Labels: bug, shell, ux.

## Findings

From `plans/sweep-2026-11-17/research/e1.md`. A render probe on `shell-busy` paused the
`shellact-spin` animation at 0/45/…/315° and measured the indicator: its `getBoundingClientRect()`
centre (1125.813, 70.188) and the ring's outer extents at 45° multiples are identical at every angle
— the element does not translate. The ink, however, does: at deg=0 the ink spans x [4..13], y [5..13]
of a 16 px clip, at deg=180 y [4..12]; the ink centroid traces a circle of ~1.18 CSS px (DPR 1 and 2)
around the box centre once per 0.7 s turn.

Cause: `web/src/style.css` `.shellact[data-act="busy"]` draws `border: 1.5px solid var(--fg-dim);
border-top-color: transparent;` and rotates the whole box. One quarter of the ring is empty, so the
visible ink is rotationally asymmetric and its mass orbits the rotation centre — on a 9 px glyph that
reads as drift. What did not hold: no transform conflict, the box is square (9×9, 7×7 in a tile
footer), `transform-origin` is its centre, the element is not rebuilt per tick.

Developer's answer: **(b)** — one `--fg-dim` arc over a faint full-ring track in `--line-control`, at
both sizes (mockup `plans/sweep-2026-11-17/mockups/spinner.html`, column "(b) Arc on faint ring":
`border-color: var(--line-control); border-top-color: var(--fg-dim);`). `--line-control` is an
existing neutral line token, not a state hue and not a new token, so
`kb:adr/theme-shell-pip-retired-for-activity-indicator` holds; no new ADR. Proof measure for (b):
the ink-centroid test cannot be used as-is (a full ring plus one arc is still off-centre by ink
weight), so the test measures the ring's ink bounds — red today, green with (b).

## Requirements

### Must Have

- **REQ-1**: While a shell is busy, its indicator draws a complete ring at every rotation angle — the
  ring's ink bounds (all pixels differing from the button background) stay the same, centred on the
  indicator's box, at 0°, 90°, 180° and 270° — on the Focus mainhead (9 px) and in a tile footer
  (7 px). (e1)
- **REQ-2**: The busy ring is two colours from existing tokens only: one quarter arc in `--fg-dim`
  and the remaining three quarters a faint track in `--line-control`; the reduced-motion rule (no
  animation, busy shape kept) and the done tick are unchanged. (e1)

## Affected Files

### Web (web-impl)

- `web/src/style.css` — REQ-1, REQ-2: `.shellact[data-act="busy"]` gets `border: 1.5px solid
  var(--line-control); border-top-color: var(--fg-dim);` (the arc is the top quarter, the rest is the
  track); the comment above `.shellact` that says busy is `--fg-dim` is updated to name the track.
  The 7×7 tile override and the reduced-motion rule need no change.

### Existing tests this breaks

- none

## Proof

- **e1** — render test, written by **render-tests**, in `web/render/surfaces.spec.ts`:
  `the busy spinner's ring stays centred on its box at every angle, on the Focus mainhead and in a tile footer (#126)`.
  Opens `shell-busy` (mainhead) and `shell-busy-tiles` (tile footer); for each indicator pauses its
  animations and seeks `currentTime` to `700 * deg / 360` ms for deg ∈ {0, 90, 180, 270}; screenshots
  a clip of the indicator's box plus 1.5 px (so the tile footer's `.surfseg` border stays out); finds
  the ink bounds (pixels differing from the button background beyond a small tolerance); asserts the
  bounds' centre is within 0.51 CSS px of the box centre on each axis at every angle (the 7 px tile
  box sits on a half pixel, so a complete ring snapped to the grid reads 0.5 px; an empty quarter
  reads 0.8–1 px), and the bounds' width and height are equal across the four angles within 0.5 px;
  split into one test per host (mainhead, tile footer). Red today: at deg=0 the empty top quarter leaves ink y [5..13] (centre ≈1 px
  below the box centre), at 180° y [4..12].

## Edge Cases

1. Tile footer's 7×7 variant → R1
2. Reduced motion keeps the busy shape and stops the spin → untested: unchanged rule, already covered by the existing reduced-motion render test in `web/render/surfaces.spec.ts`

## Acceptance Criteria

### Automated Checks

```checks
R1 cd web && npx playwright test -c playwright.render.config.ts render/surfaces.spec.ts
R2 make render-test
W1 make web-lint
```

### Reviewer-Verified

- The busy glyph reads as one `--fg-dim` arc over a faint `--line-control` ring in all three themes,
  matching the mockup's column (b), and no longer appears to slide around its centre.

## Doc Delta

No doc change.

## Out of scope

Nothing.
