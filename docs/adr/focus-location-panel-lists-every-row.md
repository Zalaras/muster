---
id: focus-location-panel-lists-every-row
type: decision
status: accepted
date: 2026-10-19
summary: The location panel lists every added directory uncapped; past what fits below the readout it flips to the top, and rows past the viewport drop off.
features: [focus]
tags: [ux, consensus]
files: []
tests: []
refs: [plan:see-added-dirs, plans/see-added-dirs/decisions/location-panel-overflow/decision.md, kb:adr/focus-added-dirs-folder-suffix-and-location-panel]
supersedes: []
---
**Context.** The location panel is a `pointer-events: none` tooltip that closes when the mouse
leaves the readout, so it cannot scroll. Measured at 1280 px with two-line paths, it stops
fitting below the readout at 13–18 directories (viewport 720–900 px tall) and `placeAnchored`
moves it to the top of the viewport, over the header; at 20+ it runs past the bottom edge.

**Decision.** The panel lists every row, with no cap and no `+K more` line. Flipped to the top it
shows at least as many rows as a cap below the readout would at every count, and all of them up to
about 20; what it covers is restated inside it, and the `Added directories · N` sub-heading
carries the true count. Past the viewport the lower rows are not shown: a known limit at counts a
Muster session (which never passes `--add-dir`) is unlikely to reach.

**Consequences.** No new UI beyond `final.html`. A reader with more rows than fit must compare
the visible rows with N to notice the shortfall. The flip-and-fit behaviour has an E2E test.
