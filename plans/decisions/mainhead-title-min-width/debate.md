# Debate: mainhead-title-min-width

### Turn 1 — advocate-a (argument)

Steelman of B: a 90px floor is visual debt paid on every short title, at every width, to buy something only needed when a long title meets a narrow row — and the rail card beside the pane already shows the full title (brief:26, `rail-card-title-leads-and-density-ramp-corrected`), so the mainhead title is arguably redundant exactly when it is crowded.

My case for A rests on three measurable consequences of B at the brief's own 900px case (title clientWidth ~0, brief:24):

1. **The spec's promise becomes vacuous.** `docs/features/focus/spec.md:26-27`: "A title too long for the row ends in an ellipsis, so the action row always stays in view." A 0px box renders no text and no ellipsis. The e2e at `web/e2e/rename.spec.ts:826-829` would still pass (scrollWidth > 0 = clientWidth), but only because "clipped" is satisfied by "erased". In my reading the spec describes a title that is *visibly truncated*, not one that vanishes; B passes the test while breaking the sentence it guards.

2. **Rename becomes unreachable from Focus.** The title is a `button.rename` inside the `h2` (`web/index.html:78`, `style.css:664-671`). The design system says the rail card's title "is plain text, not a rename trigger — renaming happens from the Focus mainhead's heading or a tile's header in Tiles" (`design-system.md`, rail-card paragraph, ~line 208-211). At 0px the only rename trigger in Focus has no hit area; the user must switch views to rename. The rail card showing the title does not rescue this — it shows it, it doesn't make it renamable. A 90px floor keeps a clickable target.

3. **The heading disappears.** The `h2` was promoted specifically "so there's a heading to navigate to above the terminal" (`style.css:646-648`). A zero-width, overflow-hidden heading is still in the a11y tree, but the visible anchor above the pane is gone.

Against these, B's gain is small and bounded: the gap is at most 90px minus the short title's width (for "hi" at `--fs-lg` = 1.07rem ≈ 16px, `style.css:27`, I estimate ~70px, not measured), and it is empty space in a row whose `.acts` is already `margin-left: auto` (`style.css:691`) — so the row always has slack after the meta at normal widths. B's other gain — meta at ~118px vs 29px at 900px — is derived, not measured (brief:24).

The precedent ADR (`usage-masthead-narrow-width-shrinks-bars-truncates-model`) chose truncation that "keeps its full text" and rejected hiding information; collapsing the title to zero is the hiding option, not the truncation one.

### Turn 2 — advocate-b (concession)

Steelman of A: at 900px, B's 0px title is not a truncation but an erasure, which empties the spec's ellipsis sentence (`focus/spec.md:26-27`) while still passing the e2e's `scrollWidth > clientWidth` check (`rename.spec.ts:826-829`), and it removes the only rename trigger in Focus, since the rail card title is plain text (`design-system.md` rail-card paragraph). A's cost is only empty space.

I concede: point 2, rename becomes unreachable from Focus. B's cost is functional, because a control disappears. A's cost is cosmetic, a gap of at most ~70px beside a short title. The rail card redundancy I would have argued covers display only, not renaming, so it does not answer this.

I also have to correct B's framing in the brief (brief:6, "when the row is crowded"), which is worse for B than it reads. From the brief's own table, title + meta share a fixed ~119px at 900px (A: 90 + 29; B: ~0 + ~118, brief:22,24), because the chip, `.surfseg` and `.acts` are `flex: none` (`style.css:677,691-692`). Under B the title's shrink share is (overflow × 1000·t)/(1000·t + 278). Take "hi" at t ≈ 16px: the overflow is about 175px and the title's share is about 172px, which is more than its own 16px, so it clamps to 0. So in that configuration B erases every title, short ones included, not only long ones. That figure is derived from the table and not measured. Without the bypass chip the slack grows by only the chip's width plus a 12px gap.

Consensus: A.
