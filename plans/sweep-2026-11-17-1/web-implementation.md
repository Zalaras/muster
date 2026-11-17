# Web Implementation: sweep-2026-11-17-1

**Plan**: sweep-2026-11-17-1
**Mode**: initial
**Pack**: kb: pack 20387 words (budget 30000)

## Changes

| File | Action | What and Why |
|------|--------|--------------|
| `web/src/style.css` | edited | REQ-1/REQ-2: `.shellact[data-act="busy"]` is `--line-control` ring with `--fg-dim` top arc; comment above `.shellact` names the track |

## Decisions

- design: CSS-only, no new token, module or helper; reduced-motion rule, 7x7 tile override and done tick untouched.
- Mainhead case of the render test is green (bounds 9x9 at all four angles, dx -0.31 / dy 0.31). The tile-footer case still fails: the 16 px clip around the 7 px indicator also contains the `.surfseg` 1 px top/bottom border, so ink bounds are 16x14 at every angle (stable, ring-independent) and the centre offset is just `floor(cx) - cx` = -0.64. No CSS change to the ring can alter that.

## Handoff

**Build status**: `npx tsc --noEmit` and `npm run build` exit 0; lint and `make contrast` clean
**E2E smoke**: no spec authored
**Render run**: `5 passed, 1 failed` in surfaces.spec.ts - only the #126 test, on the tile-footer half (`ring centre x offset at 0deg`, 0.640625 > 0.35). Spec defect for render-tests: shrink the clip (or mask the segment border) for the 7 px tile indicator.
