# Decision: connection-health-dot-hues-kept

**Outcome**: A — keep as shipped. `--health-ok`, `--health-pending` and `--health-down` keep the values web-impl chose (down a red-orange at 17–18°, pending 47–49°).
**Reached by**: user decision (review cycle 1, browser Decision 1; asked 2026-10-12, answered "2 A")
**Decisive argument**: Every token is outside the §1 state hue bands with ≥ 4.7:1 contrast, and the down and update-pending dots are always accompanied by a banner that names the state, so the dot is never the only signal.
**Dissent to honour**: At 6px the down dot (Instrument, Dark) and the pending dot (Light) sit near `--amber`; W11's "same alarm as the banner" holds through the banner shown beside the dot, not through the hue alone.
**Landed in**: plans/masthead-indicators/plan.md (W11 note), docs/adr/connection-health-dot-hues-kept.md
