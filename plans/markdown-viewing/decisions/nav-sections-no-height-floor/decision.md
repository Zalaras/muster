# Decision: nav sections keep proportional shrink, no height floor

**Plan**: markdown-viewing
**Raised by**: review cycle 3, `[orchestrator:decision]` note 1 (`plans/markdown-viewing/review.cycle3.md`)
**Reached by**: user decision
**Date**: 2026-09-13

## The question

The nav's vertical space is split between the file tree and the outline by plain proportional
flex-shrink, with no floor. Measured by the cycle-3 reviewer in a 2x2 tile with a 30-heading file
open: `.tree` `clientHeight` **20px** against `scrollHeight` 315 (21 rows), `.outline` 41px against
651 (31 rows). Both remain reachable by scrolling — this is not the cycle-2 clipping Critical
returning — but a one-row file tree is a poor compact reader, and any plan or ADR opened in a tile
has 30+ headings.

## Options as put by the reviewer

- **Option A — leave as measured.** Proportional shrink, no floor. Zero further change; a 2x2 tile
  reader shows one file row and two outline rows at a time when a long file is open.
- **Option B — floor each section.** A `min-height` of ~3 rows on `.rnav .tree` and `.rnav .outline`,
  with the nav's own `overflow: hidden auto` picking up the remainder. Costs one CSS rule plus a
  re-measure of the tile hosts; risks the nav itself scrolling in a 3x2 tile, which the chosen
  scroll model otherwise avoids.

## Outcome

**Option A.** The developer's call, 2026-09-13: leave it as measured and adjust later if using it shows a
floor is wanted — "we can always adjust later after feedback".

The reviewer explicitly declined to assign this, correctly: it is a density judgement, not a
defect, and the mockups are static single-screen renders that settle neither option. Nothing is
unreachable either way, so Option A ships no known defect; it ships a density that may or may not
prove comfortable in daily use, which is a thing real use answers better than a measurement does.

## Consequence

No code change. `.rnav .tree` and `.rnav .outline` keep `overflow-y: auto` with no `min-height`.
Revisiting this needs only the one CSS rule Option B describes.
