# Decision: mainhead-title-min-width

**Outcome**: A — keep `min-width: 6rem` on `.mainhead .name` (with `flex: 0 1000 auto`), so the title never collapses below about 90px at narrow widths, at the cost of a very short title reserving about 90px and leaving a gap before the bypass chip and meta line.
**Reached by**: consensus (advocate-b conceded in turn 2)
**Decisive argument**: the title is the only rename trigger in Focus, because the rail card title is plain text (`docs/design/design-system.md`, rail-card paragraph). At 0px that trigger has no hit area. Advocate-b conceded in turn 2: "B's cost is functional, because a control disappears. A's cost is cosmetic, a gap of at most ~70px beside a short title." Advocate-b added that the 900px row gives title and meta a fixed ~119px to share, so under B even a short title like "hi" would be clamped to 0 (derived, not measured).
**Dissent to honour**: None. Both sides noted that the e2e's clipped check (`web/e2e/rename.spec.ts:826-829`, `scrollWidth > clientWidth`) is also satisfied by a title erased to 0px. It does not tell truncation from erasure.
**Landed in**: `docs/adr/focus-mainhead-title-keeps-a-floor.md`.
