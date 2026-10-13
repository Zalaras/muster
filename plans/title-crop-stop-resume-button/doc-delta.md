# Doc delta: title-crop-stop-resume-button

Seeded from `plan.md` § Doc Delta, then amended with the `doc-delta:` lines in
`web-implementation.md` (the first implementation and its fix attempts), as they
stand after review cycle 1. Where a later fix attempt replaced an earlier line, only the later
wording is kept. `plan.md` stays as approved.

## focus (`docs/features/focus/spec.md`)

Becomes true:
- "a meta line of the repo readout (folder over branch, each line as wide as its text, kb:adr/focus-header-readout-sized-by-text)".
- "As the row narrows the header gives way in a fixed order: the `↳` block hides whole, then the surface switch and the actions move together to a second row, then the folder and branch lines ellipsize to their 8-character floor, and only then the title shortens to its 6rem floor (kb:adr/focus-header-give-way-order-title-last). The model never truncates at any width."
- The `↳` block is drawn only when the whole header, the right cluster included, fits on one row; otherwise it is removed whole (not wrapped), so it can hide at ordinary window widths.
- In the narrowest headers, where the title floor, the readout floor and the model no longer fit side by side, the model stacks under the readout inside the meta block; the title and the readout stay side by side, and the readout is at its floor whenever the title is shortened (kb:adr/focus-header-give-way-order-title-last).
- On a dead session the ended age sits under the model, without a leading `·`, in a slot the header reserves whether or not it shows (a third row in the stacked band), so a Stop or a Resume moves nothing at any width (kb:adr/actions-mainhead-one-stop-resume-button).
- Below about 316 px of header content the action cluster tightens its padding; it stays one row in the same order.
- "The `claude | shell | docs` surface switch sits with the action buttons in one right-aligned cluster, so a longer title or readout never moves it (kb:adr/focus-surface-switch-pinned-with-actions)."
- "The action cluster holds one Stop/Resume button — `Stop` while alive, `Resume` while dead, the same box under both — and Remove (kb:adr/actions-mainhead-one-stop-resume-button)."

Stops being true:
- "capped at 30ch and 44ch, kb:adr/rail-repo-line-wraps-at-slash" in the meta-line sentence.
- "as the row narrows the `↳` block hides whole first, then the title shortens, never below its 6rem floor, and the repo block never hides, though a long folder may ellipsize above its 8-character floor (kb:adr/focus-repo-block-keeps-floor-beside-group-control)".
- "The mainhead wraps the surface switch and actions onto a second row (a third in the narrowest windows with the ended age or bypass chip) before the repo block would drop below its floor (kb:adr/focus-mainhead-wraps-to-second-row-when-narrow)".
- "the Stop, Resume and Remove action row (kb:adr/actions-placement-mainhead-and-card-rows)".
- "the title shortening beside it (… kb:adr/focus-group-control-stays-while-title-shortens)" — the control's hide rule stays; the "title shortening beside it" clause goes.
- Any sentence placing the ended age after the model behind a `·` in the Focus header.
- Any citation of kb:adr/focus-mainhead-title-keeps-a-floor for "the title shrinks first"; its 6rem floor still stands (superseded by kb:adr/focus-header-give-way-order-title-last).

## actions (`docs/features/actions/spec.md`)

Becomes true:
- "In the Focus mainhead Stop and Resume are one button, labelled by whether the session is alive, that keeps its box across the swap (kb:adr/actions-mainhead-one-stop-resume-button); tile footers keep their separate buttons."

Stops being true:
- nothing (the first paragraph's "They live in the Focus mainhead above the terminal" stays true).

## card-location, groups, rename, rail, theme

No spec change (touched for their tests only). review-work cycle 1 noted citations to records
this plan supersedes in `docs/features/rail/spec.md:24` and the card-location spec's `refs`:
repoint each to the superseding record if the sentence it backs is still true, without changing
behaviour claims.

## Not doc-reconcile's

`docs/design/design-system.md` § Focus mainhead is the orchestrator's and is already updated on this branch (review cycle 2 code Major 2).
