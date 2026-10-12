# E2E Test Specs: masthead-indicators

**Plan**: masthead-indicators
**Mode**: validate (attempt 1)
**Pack**: kb: pack 16531 words (budget 30000)
**Verdict**: pass
**Tests created**: 17 new (14 in masthead-indicators.spec.ts, 1 in masthead-update-dot.spec.ts, 2 in masthead-layout.spec.ts for the 1512px and 1440px widths), plus 5 existing tests updated to the plan's delta
**Live run**: 45/45 passing across the six plan specs; full `make e2e` sweep 737/737 passing; every plan spec soaked 10x green

## Tests

| File | Test Name | Requirement | What It Verifies | Live run |
|------|-----------|-------------|------------------|----------|
| web/e2e/masthead-indicators.spec.ts | a same-day reset renders as (HH:MM) on both status-line buckets, with no resets word or separator (E1, REQ-4) | REQ-4 | Synthesized status post with a same-day `resets_at`; `.resets` equals the browser-computed `(HH:MM)` and matches the table pattern; no `resets` or `·` | 10x soak green (see Validate Attempt 1) |
| web/e2e/masthead-indicators.spec.ts | an other-day reset renders as (HH:MM Ddd), including just after local midnight and a week out on today's weekday (E1, REQ-4, edge cases 3-4) | REQ-4 | Tomorrow 00:01 and +7 days at 15:59 both carry the weekday (today's own weekday for the +7 case) | 10x soak green (see Validate Attempt 1) |
| web/e2e/masthead-indicators.spec.ts | a stale resetsAt already in the past renders verbatim in the other-day form (REQ-4, edge case 5) | REQ-4 | `resets_at` three days ago renders `(HH:MM Ddd)` | 10x soak green (see Validate Attempt 1) |
| web/e2e/masthead-indicators.spec.ts | each reset suffix carries a title with the weekday, date and the HH:MM it shows (E8, REQ-12) | REQ-12 | `title` on a same-day and an other-day suffix contains the shown HH:MM and the short weekday | 10x soak green (see Validate Attempt 1) |
| web/e2e/masthead-indicators.spec.ts | a fresh daemon shows unknown buckets with no reset text, and a status post then brings the suffixes in (E3, REQ-5) | REQ-5 (unchanged) | Fresh daemon: `unknown`, no track, no `.resets`; after a post the same locator finds one suffix per bucket | ran-green-at-authoring (2 passed, 4.4s) |
| web/e2e/masthead-indicators.spec.ts | the masthead has no model readout before or after a status post carrying a model (E4, REQ-1, INV-2) | REQ-1 | The model readout element is absent and the masthead never shows the posted model name | 10x soak green (see Validate Attempt 1) |
| web/e2e/masthead-indicators.spec.ts | the usage object carries no model key in the snapshot, in GET /api/state and in every usage message, with null and with known buckets (D1, REQ-2, INV-2) | REQ-2 | Captures WS frames and `/api/state`; no `model` key on any `usage` object | 10x soak green (see Validate Attempt 1) |
| web/e2e/masthead-indicators.spec.ts | a status post changing only the model still records a usage_sample row with that model (D2, REQ-3) | REQ-3 (unchanged) | sqlite `usage_sample` gains a second row carrying the new model | ran-green-at-authoring (same run as above) |
| web/e2e/masthead-indicators.spec.ts | a status post changing only the model broadcasts a usage whose wire content equals the previous one (edge case 2, REQ-2) | REQ-2, edge case 2 | Last two known `usage` frames deep-equal; masthead unchanged | 10x soak green (see Validate Attempt 1) |
| web/e2e/masthead-indicators.spec.ts | connected, the dot reads ok with the connected word and title; a killed daemon turns it down with the banner; a restart turns it ok again (E5, REQ-6 to REQ-9, INV-1) | REQ-6, REQ-7, REQ-8, REQ-9, INV-1 | `data-health`, text and `title` through connected, killed and restarted; per-render record agrees with the banner | 10x soak green (see Validate Attempt 1) |
| web/e2e/masthead-indicators.spec.ts | before the first hello the dot is pending with the connecting word and title and no banner, then ok once the hello lands (E5, REQ-6, INV-1 first load) | REQ-6, REQ-8, INV-1 | Routed WS withholds the hello; pending, `Connecting to musterd…`, no banner; then ok | 10x soak green (see Validate Attempt 1) |
| web/e2e/masthead-indicators.spec.ts | an update restart that outlasts the banner's 30 s window turns the dot from pending to red with the banner, and a reconnect returns it to ok (INV-1, edge case 7) | INV-1, edge case 7 | Injected `update` (restarting) arms the record, daemon killed: pending with the updating banner; `page.clock.fastForward(31 s)`: down with the unreachable banner; restart: ok | 10x soak green (see Validate Attempt 1) |
| web/e2e/masthead-indicators.spec.ts | the dot's pending, ok and down colours are three distinct colours, none of them a state token (E5, REQ-10) | REQ-10 | Computed dot colour per state: distinct, non-empty, none equal to `--amber`/`--rose`/`--teal`/`--violet`/`--idle` | 10x soak green (see Validate Attempt 1) |
| web/e2e/masthead-indicators.spec.ts | the connection readout is a status whose word is visually hidden, leaving only a dot-sized box (REQ-7) | REQ-7 | `role=status`, text `connected`, box at most 24px | 10x soak green (see Validate Attempt 1) |
| web/e2e/masthead-update-dot.spec.ts | during Update and restart the dot is pending with the restarting title while the updating banner shows, then ok after the new hello, agreeing with the banner at every render (E6, REQ-6, REQ-8, INV-1) | REQ-6, REQ-8, INV-1, edge case 9 | Real apply and restart against FakeReleaseServer; per-render record across the reload: pending with `Restarting musterd for an update…` while the updating banner shows, ok beside the neutral confirmation, ok after | 10x soak green (see Validate Attempt 1) |
| web/e2e/masthead-layout.spec.ts | at 1512px with every gauge known, the model-week selector showing and other-day resets on all three bars, the masthead is one row with no wrapped text and no model readout (E7, REQ-11, issue #52) | REQ-11, REQ-1 | No overflow, no readout or suffix wraps, masthead height equals its height at 2400px, selector visible, resets in the bracketed form on all three bars | 10x soak green (see Validate Attempt 1) |
| web/e2e/masthead-layout.spec.ts | at 1440px with every gauge known, the model-week selector showing and other-day resets on all three bars, the masthead is one row with no wrapped text and no model readout (E7, REQ-11, issue #52) | REQ-11, REQ-1 | Same as above at 1440px | 10x soak green (see Validate Attempt 1) |
| web/e2e/masthead-layout.spec.ts | at and below the 1840px tier the masthead gauge bars shrink to 40px, and above it they render at their full 96px width (issue #52) | issue #52 (unchanged) | Bar widths by tier; only the long model name in the post was dropped | 10x soak green (see Validate Attempt 1) |
| web/e2e/gauges.spec.ts | a full status post fills both masthead gauge bars with rounded percentages and bracketed reset suffixes, and shows no model readout (E5) | REQ-1, REQ-4 | Updated to the delta; see Repairs-style notes below | 10x soak green (see Validate Attempt 1) |
| web/e2e/gauges.spec.ts | a status post's session name updates the card title and its model leaves the masthead without a model readout (E7) | REQ-1 | Updated to the delta | 10x soak green (see Validate Attempt 1) |
| web/e2e/usage-model.spec.ts | with the fake endpoint returning a Fable 61% window, the readout shows the select, percent, warn bar and resets suffix (E1) | REQ-4, REQ-12 | Model-week suffix equals the browser-computed bracketed text for the posted instant, with the HH:MM in the title | 10x soak green (see Validate Attempt 1) |
| web/e2e/usage-model.spec.ts | the fake endpoint switched to 401 marks the readout stale while keeping the last-good percent, and a later 200 clears it (E5) | REQ-4, edge case 6 | Added: the stale readout keeps its bracketed reset text | 10x soak green (see Validate Attempt 1) |
| web/e2e/shell.spec.ts | GET /api/state returns exactly the empty-daemon snapshot object once authenticated | REQ-2 | `model: null` removed from the expected `usage`; added `not.toHaveProperty("model")` | 10x soak green (see Validate Attempt 1) |

Pin run, from `web/` after `make web-build build`:
`npm run e2e -- e2e/masthead-indicators.spec.ts -g "fresh daemon shows unknown buckets|changing only the model still records"` gave `2 passed (4.4s)`.
A full run of masthead-indicators.spec.ts, done only to check the new tests fail for the right reason, left 12 red on the expected assertions (old `· resets 17:27` text, `[id=usage-model]` count 1, `model: null` on the wire, empty `data-health`) and the 2 pins green.

## Deleted Tests

- `web/e2e/masthead-layout.spec.ts`: "at a 14-inch laptop's 1512px viewport, the masthead fits one row with no wrap and the model readout truncates via title (issue #52)". It asserted the truncation and `title` of the removed model readout and the `· resets HH:MM` form. The plan names it as broken (Existing tests this breaks). Its still-valid assertions (no overflow, no spill into the right padding, single-line readouts) are carried into the two new width tests, which add the suffixes, the selector and an explicit one-row measure. The only dropped assertions are the model truncation and title ones, which have no element left to check.

## Fixture Changes

- `web/e2e/helpers/masthead.ts` (new): locators, the title and pattern constants from Testable UI Elements, date builders, a browser-side oracle for REQ-4's text (`expectedResetsText`), `recordHealth` (a per-render `data-health`/title/word/banner record that survives a reload) with `healthViolations` for INV-1, and `dotColour`/`resolvedColours` for REQ-10.
- `web/e2e/helpers/gauges.ts`: `mastheadModelReadout` removed (the plan's X1 forbids it); `mastheadBucketResets` lives in `helpers/masthead.ts`.
- `web/e2e/helpers/db.ts`: `listUsageSampleModels` added (additive).
- No payload builder changes. Every status post is `envelopedStatusLineFull` with a `resets_at` epoch, the shape `payloads.ts` already synthesizes from the measured status-line capture. The `update` WS message in the 30 s fallback test is the shape `update.spec.ts` already injects (kb:anchor/ws.update), a daemon-originated message and not a Claude Code one.

## Coverage

| Requirement | E2E Tests |
|-------------|-----------|
| REQ-1 | the masthead has no model readout before or after a status post carrying a model; gauges E5 and E7; both E7 layout tests |
| REQ-2 | the usage object carries no model key (snapshot, `/api/state`, `usage` messages); shell.spec.ts empty snapshot; the model-only broadcast test |
| REQ-3 | a status post changing only the model still records a usage_sample row (pin) |
| REQ-4 | same-day, other-day, past-reset tests; gauges E5; usage-model E1 and E5; both E7 layout tests |
| REQ-5 | a fresh daemon shows unknown buckets with no reset text (pin); usage-model E2 (unchanged) |
| REQ-6 | connected/kill/restart; first-hello pending; 30 s fallback; update-dot E6 |
| REQ-7 | the readout-is-a-status test; connected/kill/restart (word assertions) |
| REQ-8 | connected/kill/restart; first-hello; update-dot E6 (all four titles) |
| REQ-9 | every dot test asserts `data-health` |
| REQ-10 | colours-are-distinct-and-not-state-tokens test (W6 per-theme declaration is a unit test) |
| REQ-11 | the two E7 layout tests (1512px, 1440px) |
| REQ-12 | each-reset-suffix-carries-a-title; usage-model E1 |
| INV-1 | connected/kill/restart, first-hello, 30 s fallback and update-dot E6, each asserting `healthViolations(...)` is empty over the recorded run |
| INV-2 | no-model-readout test; wire test |

## Handoff

1. **X1 in the plan's Automated Checks is wrong as written.** `#usage-model\b` matches `#usage-model-week` (a `\b` sits between `l` and `-`). Evidence: `echo '#usage-model-week' | rg -o '#usage-model\b'` prints `#usage-model`. The pattern would flag every `#usage-model-week` locator in `web/src`, `web/index.html` and `web/e2e` (16 lines in src and e2e at the last count) even after the work is done. Suggested fix: `#usage-model([^-[:alnum:]_]|$)`. I wrote no `#usage-model` or `usage-model"` literal in e2e; the REQ-1 absence assertion uses the attribute selector `[id=usage-model]` (`removedModelReadout` in `helpers/masthead.ts`) so it passes both the plan's pattern and the corrected one.
2. **Plan omission.** `web/e2e/shell.spec.ts` ("GET /api/state returns exactly the empty-daemon snapshot object…") asserts `usage.model: null` and is not in the plan's "Existing tests this breaks". I updated it to the delta (removed `model: null`, added `not.toHaveProperty("model")`).
3. **Fixture-plan deviation.** The header says `masthead-indicators.spec.ts` uses `daemon`. It does, for every test in it. The model-week reset assertions (E2) need a fake usage endpoint with a runtime port, so they sit in `usage-model.spec.ts` and `masthead-layout.spec.ts`, which already use `startDaemon`.
4. **Locator guesses for validate to check, because the plan does not pin them:** (a) which node paints the dot (`dotColour` reads the host's, its pseudo-elements' and its children's background); (b) REQ-7's "visually hidden" is asserted as a box of at most 24px; (c) the REQ-12 title is asserted to contain the shown HH:MM and the short weekday. The plan's example, `Resets Tue 13 Oct, 15:59`, does contain both. A plain en-US `toLocaleString` would render a 12-hour time and fail that, which would be an implementation-bug against the Testable UI Elements row.
5. The 30 s fallback test relies on `page.clock.install()` plus `fastForward(31_000)` with a proxied `/ws`. It has not been run, and validate may need to adjust it.
6. No new harness-file changes needed (`playwright.config.ts`, `fixtures.ts`, `gatelock.ts` and `e2e-lint.sh` untouched). No wire shape was invented, so no `/interface-probe` is needed.

## Test Run Output

```
npx playwright test --list   ->  Total: 737 tests in 51 files (clean; tsc --noEmit clean; e2e-lint clean; biome clean)
pins: 2 passed (4.4s)
```

## Notes

- `rg -n -F "· resets" web/e2e web/src` finds nothing. The X1 pattern in e2e hits only `#usage-model-week` lines (see Handoff 1).
- gauges.spec.ts E5 and E7 were retitled to match the removed readout; their E-ids are kept in the titles so the coverage mapping holds. The replaced `toHaveText("Haiku 4.5")` and `toHaveText("Opus 5")` model assertions are the plan's sanctioned delta (REQ-1), with `[id=usage-model]` count 0 asserted in their place.


## Validate Attempt 1

Rebuilt with `make web-build build`, then ran the six plan specs live: `45 passed (31.4s)` on the first run (no locator repair needed; the authoring-time guesses in Handoff 4 all held). Full sweep `make e2e`: `737 passed (6.0m)`. `npx playwright test --list`: `Total: 737 tests in 51 files`; biome and `e2e-lint.sh` clean.

Soaks (`make e2e-soak SPEC=<file> N=10`):

| File | Summary line |
|------|--------------|
| web/e2e/masthead-indicators.spec.ts | first soak `139 passed`, 1 failed (see Repairs 1); after repair `140 passed (1.0m)` |
| web/e2e/masthead-update-dot.spec.ts | `10 passed (48.7s)` |
| web/e2e/masthead-layout.spec.ts | `30 passed (25.5s)` |
| web/e2e/gauges.spec.ts | `120 passed (54.3s)` |
| web/e2e/usage-model.spec.ts | `110 passed (43.0s)` |
| web/e2e/shell.spec.ts | `40 passed (25.3s)` |

## Repairs

| # | Test | Symptom | Root cause in my spec | Fix | Assertion still covers |
|---|------|---------|-----------------------|-----|------------------------|
| 1 | a status post changing only the model broadcasts a usage whose wire content equals the previous one (edge case 2, REQ-2) | Soak run 1 of 10 red: `toEqual` on the two last known `usage` frames differed only in `"sampledAt": "2026-10-12T16:08:28Z"` vs `"...:29Z"` | `sampledAt` is stamped from the daemon wall clock at `Aggregator.Record` (`internal/usage/aggregator.go:55`), so two posts straddling a clock second legitimately differ there; the plan's "wire content equals the previous one" cannot hold for that key | Compare every `usage` key except `sampledAt` with `toEqual`, and assert `sampledAt` parses and is not earlier than the previous frame's | REQ-2 / edge case 2: a model-only change leaves every wire field (buckets, resets, modelScoped*, source) identical and puts no `model` key on the wire (a leaked, differing `model` would fail the rest-object equality; the no-`model`-key check also stays in the D1 test). Only the clock-stamped key is exempted. |

No assertion was deleted, skipped, or weakened.

The repaired assertion is an equality, not an absence assertion, so no deliberate-breakage run was required; the original form was proven red at authoring (model still on the wire).

## Validate Handoff

- Plan wording defect: Protocol Contract prose says a model-only change broadcasts a `usage` "whose wire content now equals the previous one". Strictly it equals it except `sampledAt`, which is the record time. Doc-reconcile may want "apart from `sampledAt`".
- X1 in Automated Checks was already amended by the orchestrator (see Authoring Handoff 1); the e2e tree carries no `#usage-model` literal.
- Implementation bugs: none.
