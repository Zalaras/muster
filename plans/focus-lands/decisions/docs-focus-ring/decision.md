# Decision: docs-focus-ring

**Outcome**: A — keep Chrome's default ring.
**Reached by**: consensus (advocate-b conceded in turn 1)
**Decisive argument**: advocate-a, turn 1: "The reader root mounts inside a tile too (`web/src/features/tiles.ts:187-189`) … so `.md:focus-visible { outline: 1px solid var(--amber) }` draws an amber rectangle round a whole tile body — the exact signal §3 reserves for a session that needs you", while `outline: none` removes "the only visible evidence focus landed there" (the reader has no cursor), and the UA ring is already what every unstyled control, the surface switch's own `.seg-btn` included, shows on keyboard focus.
**Dissent to honour**: advocate-b: the UA blue is a colour no theme defines and the contrast gate never measures; its computed `rgb(0,95,204)` against `--well` is 3.20:1 Instrument, 3.08:1 Dark, 5.98:1 Light — all clear the 3:1 non-text floor, so taste only, no follow-up.
**Landed in**: plans/focus-lands/plan.md (REQ-2 amended note), docs/adr/reader-body-keyboard-focus-keeps-ua-ring.md, docs/design/design-system.md (§5 Segmented control paragraph)
