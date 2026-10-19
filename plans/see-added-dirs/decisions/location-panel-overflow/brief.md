# Decision brief: location-panel-overflow

**Question**: When the Focus header's location panel has more added-directory rows than fit under the readout, does it bound itself or keep listing every row?
**Source**: plans/see-added-dirs/review.md — browser Decision 1, cycle 1
**Option A**: bound the panel: cap the rows at what fits below the readout and end with a stated `+K more` line, so the panel never covers the readout or leaves the viewport. Cost: a new visible line and a plan amendment to edge case 15. It also means the full list is not shown anywhere.
**Option B**: accept as is: keep listing every row and record that past about 13–20 directories (depending on viewport height) the panel covers the header and drops rows off-screen. Cost: none now. The panel is wrong only at counts the developer is unlikely to reach.

## Pinned reading list (both advocates read all of it before turn 1)
- plans/see-added-dirs/review.md — browser Decision 1 (quoted below), and browser Minor 1 (the panel is a snapshot while open)
- plans/see-added-dirs/plan.md — REQ-7, REQ-9, edge case 15, § UI Specifications (States, Testable UI Elements "Location panel" and "Panel directory row"), § Out of scope (keyboard access is out of scope: mouse only)
- plans/see-added-dirs/mockups/final.html (the design authority for the panel)
- docs/design/design-system.md §"Focus mainhead" (around line 264-290) and §"Popover" (around line 327)
- web/src/render/locationpanel.ts and web/src/render/anchored.ts (`placeAnchored`: how the panel is placed and flipped to top 8)
- web/src/render/grouppopover.ts (the existing `.pop` the panel copies) and `.pop` in web/src/style.css
- docs/adr/focus-added-dirs-folder-suffix-and-location-panel.md (proposed for this plan)
- kb:fact/added-dirs-in-status-line (what sources add directories: /add-dir, --add-dir, settings permissions.additionalDirectories)
- `go tool kb pack --plan see-added-dirs --role planner` for the ADRs governing focus and card-location (accepted ones bind)
- Measurements: the reviewer's numbers in the issue below (1280 px wide, 83-character paths wrapping to two lines; does not fit below the readout at 13/15/18 directories for 720/800/900 px viewports; 22 directories span 8–1281 px in an 800 px viewport)

## The issue, verbatim
1. **[orchestrator:decision]** How the location panel behaves when its rows do not fit under the readout. Measured at 1280 px wide with 83-character paths (each path wraps to two lines): the panel no longer fits below the readout at 15 directories (800 px tall), 13 (720) and 18 (900). `placeAnchored` then moves it to top 8, where it covers the readout and the session name. At 20+ directories it runs past the bottom of the viewport: 22 long paths give 8–1281 in an 800 px viewport. Because the panel is `pointer-events: none` with no overflow rule, the rows past the edge cannot be reached. Edge case 15 says "the panel lists all", and with this many rows that cannot be done inside the viewport without a scroll the panel cannot take.
   - **Option A — bound the panel:** cap the rows at what fits below the readout and end with a stated `+K more` line, so the panel never covers the readout or leaves the viewport. Cost: a new visible line and a plan amendment to edge case 15. It also means the full list is not shown anywhere.
   - **Option B — accept as is:** keep listing every row and record that past about 13–20 directories (depending on viewport height) the panel covers the header and drops rows off-screen. Cost: none now. The panel is wrong only at counts the developer is unlikely to reach.

## Rules
Up to 3 turns each, ≤400 words per turn, advocate-a opens. Argue from the pinned docs and
measurable consequences; cite file:line; steelman before rebutting; concede when convinced.
Append each turn to debate.md before sending it. The ending turn's author reports once to
`main`. Agent names: advocate-a (Option A), advocate-b (Option B).
