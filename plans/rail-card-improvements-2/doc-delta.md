# Doc Delta: rail-card-improvements-2

Seeded from `plans/rail-card-improvements-2/plan.md` § Doc Delta, then amended by the
orchestrator. `plan.md` itself is unchanged — amending this file is not a plan amendment.

**Amendment 1 (review cycle 1, Major 2 `[orchestrator]`).** The plan's Doc Delta named
`docs/protocol.md` only for `kb:anchor/update.check` and `canCheck`, leaving the
`railDensity` prose at `docs/protocol.md:199-201` falsified by REQ-1 and REQ-3 with nothing
instructing `doc-reconcile` to touch it — and `make gen-kb` regenerates that text into
`docs/features/views/contract.md` and `docs/features/settings/contract.md`. The **rail**
"stops being true" list below carries the missing line.


**rail** — becomes true:
- `docs/features/rail/spec.md` says a card is a title that wraps, above a state row of
  badge, time in the current state and pin.
- `docs/features/rail/spec.md` says compact clamps the title to one line and drops the
  activity line, comfortable clamps the activity line to three lines, and expanded lets it
  run to whatever it needs.
- `docs/features/rail/spec.md` says the activity line carries its full text as a hover
  title, alongside the repo line and the title.

**rail** — stops being true:
- "A card is a state row (badge, time in the current state, pin) above a title that wraps".
- "compact clamps the title to one line and drops the gauge track and the activity line,
  expanded lets the activity line run to three lines".
- `docs/protocol.md`'s `railDensity` prose (the prefs section): "`compact` clamps the title
  to one line and drops the gauge track and the activity line, `expanded` lets the activity
  line run to three lines (kb:adr/rail-card-state-row-then-wrapping-title)". REQ-3 falsifies
  the gauge-track half, REQ-1 the expanded half, and the ADR it cites is superseded by
  `kb:adr/rail-card-title-leads-and-density-ramp-corrected`. What becomes true in its place:
  `comfortable` is the reference render and clamps the activity line to three lines,
  `compact` clamps the title to one line and drops the activity line, `expanded` lets the
  activity line run to as many lines as it needs, and the gauge track renders in all three.
  (Added by the orchestrator in review cycle 1; the plan's own Doc Delta omitted it.)

**update** — becomes true:
- `docs/features/update/spec.md` says the `updateCheck` preference governs automatic
  checking only, and that a user-initiated check runs regardless of it.
- `docs/features/update/spec.md` says the Updates section carries a Check now button and
  shows how long ago the last successful check ran.
- `docs/protocol.md` carries `kb:anchor/update.check` and documents `canCheck` under
  `kb:anchor/ws.update`.

**update** — stops being true:
- "turning it off clears the available version and stops every update-related request" —
  the second half only; the clearing still happens.
- `ws.update`'s "null when ... `prefs.updateCheck` is false" as a reason `available` is
  null.
- the prefs section's "`updateCheck`: governs **checking only**".

**settings** — becomes true:
- `docs/features/settings/spec.md` says Updates shows a Check now button beside a "Check
  for updates daily" toggle that governs automatic checking only.

**settings** — stops being true:
- "a \"Check for updates daily\" toggle that governs checking only".

**surfaces** — no doc change. `docs/features/surfaces/spec.md` already says the segment
"shows a spinner while busy and a tick once work finishes"; REQ-6 makes the code match the
sentence rather than the sentence match the code.

