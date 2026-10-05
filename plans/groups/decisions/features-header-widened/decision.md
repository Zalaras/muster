# Decision: widen the plan's Features header to `update` and `surfaces`

**Reached by**: user decision (asked by the orchestrator on 2026-10-05, before Step 5).

**Why it came up.** The wave-1 gate's features-scope check refused `web/src/features/updaterestart.test.ts` (feature `update`) after the web tester added the snapshot's two new keys (`groups`, `ungrouped`) to its fixture; `web/e2e/shell.spec.ts` (feature `surfaces`) asserts the exact state object and needs the same repair at validate. Both are forced by the approved protocol delta; neither feature's behaviour changes.

**Options put to the developer.**
1. Widen the header to both features, letting the two mechanical repairs land.
2. Keep the header; the two files stay untouched, leaving a compile failure and a red spec for the developer to resolve by hand.

**Outcome.** Option 1. The header now lists `update` and `surfaces`; later agents' packs include those features' records.
