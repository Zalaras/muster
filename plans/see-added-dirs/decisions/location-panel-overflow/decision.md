# Decision: location-panel-overflow

**Outcome**: B — accept as is: keep listing every row and record that past about 13–20 directories (depending on viewport height) the panel covers the header and drops rows off-screen.
**Reached by**: consensus (advocate-a conceded in turn 2)
**Decisive argument**: advocate-b, turn 1: A caps at the room *below the readout* (about 89–792 px in an 800 px viewport) while B's flip uses 8–792 px; the reviewer measured 15 long-path rows at 8–726, every row visible. "So across the band of roughly 13–19 long-path (or up to ~20 short-path) directories, B shows the full list and A withholds part of it, with no other place to read it." What the flipped panel covers (folder, branch, `+N`) is restated inside it, and the true N is in the `Added directories · N` sub-heading.
**Dissent to honour**: advocate-a: past ~20 rows the cut is silent, so a reader must count against N to notice it; and edge case 15 was never tested (it mapped to W4, the suffix check), so the reworded limit gets a real E2E test this cycle.
**Landed in**: plans/see-added-dirs/plan.md (edge case 15, *Amended*), docs/adr/focus-location-panel-lists-every-row.md
