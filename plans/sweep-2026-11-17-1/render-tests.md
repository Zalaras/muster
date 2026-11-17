# Render Tests: sweep-2026-11-17-1

**Plan**: sweep-2026-11-17-1
**Verdict**: authored
**Pack**: kb: pack 4635 words (budget 30000)

## Summary

Tests created: 2 (mainhead, tile footer) | Passing at HEAD: 2 | Red against the pre-fix CSS: 2.

## Tests

| File | Test Name | Criterion | What It Verifies | Status |
|------|-----------|-----------|------------------|--------|
| `surfaces.spec.ts` | the busy spinner's ring stays centred on its box at every angle, on the Focus mainhead (#126, REQ-1) | REQ-1 | ink bounds centred on the box and equal in size at 0/90/180/270 deg, `shell-busy` | pass |
| `surfaces.spec.ts` | the busy spinner's ring stays centred on its box at every angle, in a tile footer (#126, REQ-1) | REQ-1 | same, `shell-busy-tiles` (7 px) | pass |

## Fixtures used

- `shell-busy`: busy shell, Focus mainhead (9 px indicator)
- `shell-busy-tiles`: busy shell, tile footer (7 px indicator)

## Handoff

None

## Notes

Ink bounds only (no centroid), so the (b) ring with its uneven arc weight is green once the ring is complete.
Fix after web-impl's ec1aa987: the clip is the indicator's box plus 1.5 px (it was a fixed 16 px that caught the tile footer's `.surfseg` border), and the centre tolerance is 0.51 px, not 0.35: the 7 px tile box sits on a half pixel (cy 387) and the ring snaps to the pixel grid, so a round ring reads 0.5 px off; an empty quarter moves it 0.8 to 1 px. The test is split in two so each host reports on its own.

## Test Run Output

Pre-fix CSS (`git checkout ec1aa987^ -- web/src/style.css`, rebuilt; both red, restored afterwards):
```
Error: ring centre y offset at 0deg   (mainhead)  Expected: <= 0.51  Received: 0.8125
Error: ring centre y offset at 0deg   (tile)      Expected: <= 0.51  Received: 1
2 failed
```
HEAD CSS (rebuilt):
```
✓ ...ring stays centred... in a tile footer (#126, REQ-1)
✓ ...ring stays centred... on the Focus mainhead (#126, REQ-1)
7 passed (surfaces.spec.ts)
```
