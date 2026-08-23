# E2E Test Specs: M3 — Gauges

**Plan**: m3-gauges
**Mode**: fix (review cycle 1, wave 3)
**Verdict**: pass
**Tests created**: 12
**Live run**: 71/71 passing (full suite, `make e2e`)

## Tests

| File | Test Name | Requirement | What It Verifies |
|------|-----------|-------------|------------------|
| web/e2e/gauges.spec.ts | a fresh session and a fresh daemon render every gauge as unknown with no track markup (E1) | E1, REQ-11, INV-3 | Fresh session card shows "ctx unknown" with zero track elements; masthead 5h/7d both show "unknown" with zero track elements |
| web/e2e/gauges.spec.ts | a pre-first-response status post leaves the unknown rendering unchanged — null is not 0% (E2) | E2, REQ-2, REQ-3 | Synthesized pre-first-response status post (null pcts, zero tokens, absent rate_limits) → rendering stays identical to E1's unknown state |
| web/e2e/gauges.spec.ts | a full status post renders the Focus rail card's context row with track, rounded percent, and compact tokens (E3) | E3, REQ-13, W5 | Full status post → card `.r3` row shows "42%" and "84k", track-fill element present |
| web/e2e/gauges.spec.ts | the same status data renders in the Tiles view's tile header (E4) | E4, REQ-13 | Same fixture, Tiles view → `.ctxinfo` shows the same values + track (both hosting views per m2 retro rule) |
| web/e2e/gauges.spec.ts | a full status post fills both masthead gauge bars with rounded percentages and reset suffixes, and shows the model readout (E5) | E5, REQ-11, REQ-12, REQ-14 | Masthead 5h/7d show rounded %, a "resets" suffix, track-fill present; model readout shows displayName verbatim |
| web/e2e/gauges.spec.ts | two identical rapid status posts persist exactly one usage_sample row; a changed third posts a second (E6, INV-5) | E6, REQ-5, INV-5 | sqlite oracle (`usage_sample` count): 2 identical posts → 1 row; a 3rd with a changed value → 2 rows total |
| web/e2e/gauges.spec.ts | a status post's session name updates the card title and its model updates the masthead model readout (E7) | E7, REQ-4 | `session_name` in a status post renames an "untitled" card; `model` object in the same post is reflected in the masthead model readout |
| web/e2e/gauges.spec.ts | a status post sent while a session is needs_input leaves its state, stateSince, and attention untouched (E8, INV-1) | E8, INV-1 | `/api/state` oracle before/after a full status post while `needs_input`: `state`/`stateSince`/`attention`/`alive` all bit-identical; badge stays "needs input" |
| web/e2e/gauges.spec.ts | with two live sessions, a status post routed to one leaves the other's card and wire object unchanged while the masthead updates (E9, INV-4) | E9, INV-4 | 2-session daemon; status routed to B updates B's row + the account-global masthead; A's card and full wire object are asserted unchanged |
| web/e2e/gauges.spec.ts | /clear returns the context row to ctx unknown and resets the compaction counter (E10) | E10, REQ-9 | Context filled + `⟳1` via PreCompact, then the SessionEnd(clear)/SessionStart(clear) sequence → card returns to "ctx unknown", `⟳` gone, track gone |
| web/e2e/gauges.spec.ts | after a daemon restart the masthead reads unknown until a fresh post, while the session card keeps its last-known context (E11) | E11, REQ-7, REQ-16 | Context/usage filled, `daemon.restart()` + reload → masthead reverts to unknown (no hydration) while the session card still shows its last-known context (persisted row) |
| web/e2e/gauges.spec.ts | a status post at or above 60% renders the hot context track and the warn masthead bar, but not the untouched bucket (E12) | E12, R1 | 61%-used context → card track carries `hot`; 61%-used 5h bucket carries `warn`; the untouched 23%-used 7d bucket does **not** carry `warn` |

## Fixture Changes

- **`web/e2e/helpers/payloads.ts`** — added `envelopedStatusLineFull(sessionId, opts)` (REQ-15): the post-first-API-response status-line shape (real `context_window` percentages/current_usage + both `rate_limits` buckets present), synthesized from `spikes/canary-fields.md` §"Status-line payload"'s measured `rate_limits`/`context_window`/`model` shapes — the same top-level structure as the existing `envelopedStatusLinePreFirstResponse`, with the null/absent fields replaced by real values. Every option defaults to a fixed, non-random, non-wall-clock-dependent value (e.g. `fiveHourResetsAt`/`sevenDayResetsAt` default to a fixed far-future epoch, `4070908800`) so two calls with no overrides are byte-identical — required by E6/INV-5's dedup assertion. Default percentages (61% / 23%) intentionally match the mockup reference pair `docs/design/design-system.md` cites for the warn/hot threshold decision.
- **`web/e2e/helpers/db.ts`** — added `countUsageSamples(dbPath)`: a plain `SELECT COUNT(*) FROM usage_sample` oracle for E6/INV-5. No per-session filter, since every m3-gauges test that uses it runs its own isolated scratch daemon (see below) — account usage/`usage_sample` is daemon-global, not per-session.
- **`web/e2e/helpers/gauges.ts`** (new) — locator helpers: `mastheadBucket`/`mastheadBucketTrack`/`mastheadBucketWarn`/`mastheadModelReadout` for the masthead, `cardContextRow`/`cardContextTrack`/`cardContextHot` for rail/strip cards, `tileContextInfo`/`tileContextTrack` for Tiles. See Notes below for the locator-choice reasoning and hedges.

## Coverage

| Requirement | E2E Tests |
|-------------|-----------|
| E1  | "a fresh session and a fresh daemon render every gauge as unknown with no track markup (E1)" |
| E2  | "a pre-first-response status post leaves the unknown rendering unchanged — null is not 0% (E2)" |
| E3  | "a full status post renders the Focus rail card's context row with track, rounded percent, and compact tokens (E3)" |
| E4  | "the same status data renders in the Tiles view's tile header (E4)" |
| E5  | "a full status post fills both masthead gauge bars with rounded percentages and reset suffixes, and shows the model readout (E5)" |
| E6  | "two identical rapid status posts persist exactly one usage_sample row; a changed third posts a second (E6, INV-5)" |
| E7  | "a status post's session name updates the card title and its model updates the masthead model readout (E7)" |
| E8  | "a status post sent while a session is needs_input leaves its state, stateSince, and attention untouched (E8, INV-1)" |
| E9  | "with two live sessions, a status post routed to one leaves the other's card and wire object unchanged while the masthead updates (E9, INV-4)" |
| E10 | "/clear returns the context row to ctx unknown and resets the compaction counter (E10)" |
| E11 | "after a daemon restart the masthead reads unknown until a fresh post, while the session card keeps its last-known context (E11)" |
| E12 | "a status post at or above 60% renders the hot context track and the warn masthead bar, but not the untouched bucket (E12)" |
| INV-1 | E8 |
| INV-4 | E9 |
| INV-5 | E6 |
| REQ-9 (`/clear` context reset) | E10 |
| REQ-14 (reset-time formatting) | E5 (presence of "resets", deliberately format-branch-agnostic — see Notes) |

## Test Run Output

Not run — authoring mode. Gate is `npx playwright test --list` (below), not execution.

```
$ npx playwright test --list
...
Total: 71 tests in 9 files
```

`web/e2e/gauges.spec.ts`'s 12 tests all appear in the listing (no duplicate titles, no
collection errors). `npx tsc --noEmit -p .` (which includes `e2e/`, strict mode,
`noUnusedLocals`/`noUnusedParameters`/`exactOptionalPropertyTypes` all on) also passed
clean against the new files.

## Notes

The implementation doesn't exist yet, so every locator choice below is a documented guess
from the plan text, `docs/design/mockups/a-instrument.html`, and `docs/design/design-system.md`
— not verified against real DOM. Flagging the specific risk areas for validate mode:

1. **Masthead bucket text** (`#usage-5h`/`#usage-7d`, kept from M2). I deliberately used
   `toContainText("45%")` / `toContainText(/unknown/i)` as **separate** assertions rather
   than one anchored regex like the Testable UI Elements table's literal
   `/^5h (\d+%|unknown)/`, because the planned masthead markup nests `.lbl`/`.num`/`.resets`
   spans (Implementation Notes: "`.gauge` → `.lbl`/`.bar > i`/`.num`/`.resets`") and
   adjacent elements can concatenate in `textContent` with no separating whitespace
   (validate-mode guidance / m2-terminal lesson) — a `\s+`-anchored pattern could fail on
   correct markup that simply has no literal space character between "5h" and "61%". If
   validate mode finds the real DOM *does* keep them as one text node (as M2 did), the
   table's tighter anchored pattern is safe to reintroduce; I erred toward the
   concatenation-safe form since I can't inspect the real markup yet.
2. **Masthead model readout** has no id in current `index.html` and none is specified by
   the plan beyond "e2e-specs picks the locator against the real DOM" — `helpers/gauges.ts`'s
   `mastheadModelReadout()` guesses `.model` (the Implementation Notes' own class name)
   scoped under `.masthead-right`/`.masthead`, with a `data-testid="masthead-model"`
   fallback in the same selector list. Whichever web-impl actually ships, this is the
   single locator to repair.
3. **`warn`/`hot` threshold classes** (`mastheadBucketWarn`, `cardContextHot` in
   `helpers/gauges.ts`) are hedged across 2-3 plausible attachment points each (`.bar.warn`
   vs. a bare `.warn` descendant vs. the container itself; `.ctx.hot` vs. a bare `.hot`
   descendant) via Playwright's `.or()`, since design-system.md pins the class *names*
   (settled 2026-08-23) but not which element carries them.
4. **Track-fill elements** (`mastheadBucketTrack`, `cardContextTrack`, `tileContextTrack`)
   assume a bare `<i>` tag per the mockup's literal markup (`<span class="bar warn"><i
   style="width:61%"></i></span>`, `<span class="ctx"><i style="width:42%"></i></span>`) —
   these are the presence/absence checks the plan calls "the honesty assertion", so getting
   the tag right matters; if web-impl uses a `<b>`/`<span class="fill">` instead, all six
   `toHaveCount` calls against these need the same one-line fix.
5. **E7's "model updates the card's model readout"**: the plan's acceptance criterion E7
   says a status post "with a model object updates the card's model readout", but no
   per-card model UI element exists anywhere in the plan's Requirements, UI Specifications,
   Testable UI Elements table, or Affected Files (`web/src/sessions/`/`render/sessions.ts`
   are scoped only to the context row) — the only model readout the plan actually
   specifies is the masthead's (REQ-12, account-global, "freshest sample's model"). I
   interpreted this as a plan wording imprecision and tested the masthead model readout
   instead (which the same status post's model object *does* legitimately drive, via the
   usage aggregator), alongside the title update on the card itself. If web-impl or review
   surfaces an actual intended per-card model element, this test's second assertion should
   move there instead — flagging this now rather than guessing a nonexistent element.
6. **REQ-14 reset-time formatting** is deliberately tested only for "a reset time renders
   at all" (`/resets/i`), not for which of the two branches (same-day `HH:MM` vs. short
   weekday) fires — the branch depends on comparing the fixed fixture epoch to the real
   wall-clock day the suite happens to run on, which the harness rules forbid depending on.
   `formatResets`'s two branches are unit-tested instead (plan W6, web-tests' job).
7. Every test uses a fresh, isolated scratch daemon (`withDaemon`, mirroring
   `views.spec.ts`'s pattern) rather than sharing one daemon across the file the way
   `sessions.spec.ts` does, because account usage (the masthead, `usage_sample`) is
   daemon-global — sharing a daemon would let concurrently-running tests' status posts
   corrupt each other's exact-percentage and exact-row-count assertions under
   `fullyParallel: true`.
8. E6's dedup ordering avoids a fixed sleep by waiting for a *third, distinct* post's
   visible effect before reading the sqlite oracle — since the ingest worker processes
   posts in submission order (plan R4), that guarantees the two identical posts before it
   already finished processing (or deduping) by the time the oracle is read.

## Validate Attempt 1

### Real-DOM check against daemon-implementation.md / web-implementation.md

Before running, I read both implementation logs and the actual shipped markup
(`web/index.html`, `web/src/render/masthead.ts`, `web/src/render/context.ts`) against
every hedge flagged in the authoring Notes above:

- Masthead bucket track: `renderUsageTrack` appends `<span class="bar[.warn]"><i
  style="width:NN%"></i></span>` as children of `#usage-5h`/`#usage-7d` themselves — the
  exact structure `mastheadBucketTrack`/`mastheadBucketWarn` (Note 1/3) were written
  against. No repair needed.
- Masthead model readout: ships as `<span id="usage-model" class="model" hidden>` inside
  `.masthead-right` (`web/index.html:20`) — matches `mastheadModelReadout`'s `.model`
  guess (Note 2) exactly; the `data-testid` fallback in that selector list was unused but
  harmless.
- Track-fill tag: a bare `<i>` in both `renderUsageTrack` and `renderContextRow` (Note 4)
  — matches `mastheadBucketTrack`/`cardContextTrack`/`tileContextTrack` exactly.
- `warn`/`hot` attachment point: `renderUsageTrack` puts `warn` on the `.bar` span
  (`bar.className = "bar warn"`), `renderContextRow` puts `hot` on the `.ctx` span
  (`track.className = "ctx hot"`) — both match the first (most specific) alternative in
  `mastheadBucketWarn`/`cardContextHot`'s `.or()` chains (Note 3).
- E7's model-readout ambiguity (Note 5): confirmed no per-card model element exists
  anywhere in `web-implementation.md`'s Changes table — the masthead-model interpretation
  stands as tested.

No locator needed changing. Ran `npx playwright test --list` first (gate, unchanged from
authoring): 71 tests in 9 files, no collection errors.

### Live run 1 — 10/12 failed (my defect, repaired without touching the spec)

`npm run e2e -- e2e/gauges.spec.ts` failed 10 of 12 tests (E3-E12; only E1/E2, which never
depend on a status post actually taking effect, passed). Every failure showed the card
frozen at `ctx unknown` / masthead frozen at `unknown` after a full status post that
should have updated them.

Root cause: not a spec or implementation defect. `web/e2e/helpers/daemon.ts` spawns the
**prebuilt** `bin/musterd` binary and serves the **prebuilt** `web/dist` — it does not
build them itself. `make e2e` builds both first (`e2e: build web-build`), but I initially
ran `npm run e2e` directly per this agent's validate-mode instructions, against a
`bin/musterd` still compiled from before daemon-impl's M3 changes landed (`internal/session`,
`internal/usage`, `internal/server/ingest.go` etc. were all newer than the binary's mtime).
Confirmed by rebuilding: `make build` changed the binary's size (16586528 -> 16630256
bytes) and `make web-build` regenerated `web/dist`. I independently verified the *new*
daemon code was correct before rebuilding, by running the real Go integration tests
directly against source (`go test ./internal/server/... -run TestIngestStatusLine -v`):
all 6 passed, proving `InterpretStatus` -> `ApplyStatus` -> broadcast was already correct
in source — the stale artifact was the only thing wrong.

This is not a "repair" under this agent's Repairs table (no spec file was edited) — it's
a stale-build issue in my own invocation, not a defect in the test or the implementation.
Flagging it here per the mode's "state what you found" requirement rather than silently
re-running.

### Live run 2 — 12/12 passing

After `make build && make web-build`, re-ran `npm run e2e -- e2e/gauges.spec.ts`: all 12
tests passed (8.7s). Re-ran `npx playwright test --list` afterward: still 71 tests in 9
files, no collection errors.

## Repairs (validate mode)

No spec edits were made. Every locator authored against the plan's mockup references
matched the real DOM on the first live run once a fresh build was used.

No assertion was deleted, skipped, or weakened.

## Test Run Output (validate attempt 1, final)

```
Running 12 tests using 6 workers

  ✓  a fresh session and a fresh daemon render every gauge as unknown with no track markup (E1) (2.9s)
  ✓  a pre-first-response status post leaves the unknown rendering unchanged — null is not 0% (E2) (2.8s)
  ✓  a full status post renders the Focus rail card's context row with track, rounded percent, and compact tokens (E3) (2.7s)
  ✓  the same status data renders in the Tiles view's tile header (E4) (7.7s)
  ✓  a full status post fills both masthead gauge bars with rounded percentages and reset suffixes, and shows the model readout (E5) (3.0s)
  ✓  two identical rapid status posts persist exactly one usage_sample row; a changed third posts a second (E6, INV-5) (2.9s)
  ✓  a status post's session name updates the card title and its model updates the masthead model readout (E7) (1.1s)
  ✓  a status post sent while a session is needs_input leaves its state, stateSince, and attention untouched (E8, INV-1) (1.1s)
  ✓  with two live sessions, a status post routed to one leaves the other's card and wire object unchanged while the masthead updates (E9, INV-4) (1.2s)
  ✓  /clear returns the context row to ctx unknown and resets the compaction counter (E10) (1.2s)
  ✓  after a daemon restart the masthead reads unknown until a fresh post, while the session card keeps its last-known context (E11) (1.6s)
  ✓  a status post at or above 60% renders the hot context track and the warn masthead bar, but not the untouched bucket (E12) (892ms)

  12 passed (8.7s)
```

`npx playwright test --list` (post-fix, suite-wide): `Total: 71 tests in 9 files`, no
duplicate-title or collection errors.

## Notes (validate attempt 1)

For any future validate/fix run of this or another plan invoked outside `make e2e`:
`web/e2e/helpers/daemon.ts` never rebuilds `bin/musterd` or `web/dist` itself, so
`npm run e2e` against a stale build silently exercises old daemon/web code. Run
`make build && make web-build` (or `make e2e`, which does both) before trusting a live
result — this is a harness characteristic, not something in this agent's remit to fix
(the harness-rules boundary excludes `playwright.config.ts`/global setup, and this is
outside even that: it's the Makefile's own build-then-test sequencing).

## Fix Attempt 1 (review cycle 1, wave 3)

**Issues addressed**: review.md Critical 1 and Critical 2 (both tagged `[e2e-specs]`).
Both were pre-existing specs (from plans m0/m1 and m2-terminal) contradicting this
plan's own approved protocol delta — sanctioned breakage per the review, not weakening.

**Critical 1 — `web/e2e/sessions.spec.ts`'s M1-era title assertion.** The test
`"a status-line post persists and routes but mutates no session field in M1 (REQ-13)"`
asserted `found?.title).toBe("walk-status-line")` (the launch title, unchanged) with a
comment claiming "that refresh is M3, not M1". Protocol §5.3's merged M3 value semantics
(`docs/protocol.md:335`) state `title` now refreshes from the status line's session name
whenever present, and REQ-4 requires it. Fixed:
- Retitled the test to `"a status-line post persists, routes, and refreshes the title
  per M3 value semantics (REQ-4)"` (no more claiming an M1 scope note that this plan
  supersedes).
- Changed the final assertion to `expect(found?.title).toBe("a status-line-derived
  title")` — the `sessionName` value the test's own fixture already sends in the status
  post (`sessions.spec.ts:376`, unchanged).
- Replaced the stale comment with one citing protocol §5.3 and noting this is sanctioned
  protocol-delta breakage, not an implementation defect.
- Every other assertion in the test body (SessionStart + status-line routing, the
  `queryEvents` persistence poll for both posts, `statusRes.status()` 200) is untouched
  and still exercises exactly what it exercised before — only the field-mutation
  expectation changed, matching the new contract.
- Checked for other readers of this test's outcome: `grep -rn "walk-status-line"
  web/e2e` returns only the one launch-title assignment at line 367 (unchanged, it's
  still the pre-refresh title used to prove the SessionStart-bound session resolves
  correctly before the status post arrives) — no other spec or fixture depends on the
  old post-refresh expectation.

**Critical 2 — `web/e2e/shell.spec.ts`'s frozen `/api/state` snapshot.** The M0 snapshot
assertion (`shell.spec.ts:52`, `"GET /api/state returns exactly the M0 snapshot object
once authenticated"`) was missing the new `usage.model` key that protocol §5.4's m3-gauges
delta adds (`docs/protocol.md:354`, present as explicit `null` until the first status
post carries buckets + model together — same treatment as `fiveHour`/`sevenDay`/
`sampledAt`, and the same species of update m2-terminal already made to this exact
assertion for `prefs.density`). Fixed: added `model: null` to the expected `usage`
object, alphabetically/contractually placed alongside the other bucket fields, and
added a comment naming the m3-gauges delta and the density precedent (mirroring the
existing comment style in the same test). No other key in the frozen object changed.

**This cycle's other web-impl fixes, checked for missing E2E coverage** (per this
wave's instructions): read `web-implementation.md`'s Fix Attempt 1 (Major 1: deleted the
dead `CardViewModel.contextText` derivation; Major 2: reordered the masthead gauge's DOM
children to `.lbl` / `.bar` / `.num` / `.resets`; Minor 1: `.bar` overflow guard).
- Major 1 (`contextText` removal) has no E2E-visible surface — it was dead output only
  `card.test.ts` ever read (web-tests' fix, not mine); `render/sessions.ts` and
  `render/tiles.ts` already derive the rendered context row independently via
  `renderContextRow`, which `gauges.spec.ts` E3/E4 already assert against. Nothing to
  add.
- Major 2 (masthead child reorder) is a DOM-structure change, but the *user-facing* text
  content is unchanged (`web-implementation.md`'s own live verification: `innerHTML`
  concatenates to the same `"5h61%· resets 16:20"` / `"5hunknown"` either order), so
  every existing text-content-based assertion (`shell.spec.ts:39`'s
  `getByText(/5h[\s\S]*unknown/i)`, `helpers/gauges.ts`'s `mastheadBucket`/
  `mastheadBucketTrack`/`mastheadBucketWarn` `toContainText` checks used throughout
  `gauges.spec.ts` E1/E5/E12) already covers it and needed no change — confirmed by
  the full-suite run below, all of which passed unmodified. The plan's own task
  instructions note wave-2's unit tests (`masthead.test.ts`) already guard the child
  order at that level, so no new E2E test was added for the reorder itself: DOM child
  order with no observable text/visual assertion difference is not new user-facing
  behaviour by the plan's Testable UI Elements contract (which pins the text pattern,
  not node order).
- Minor 1 (`.bar { overflow: hidden }`) is a CSS-only guard against a bucket rendering
  above 100%, which never occurs in this plan's fixtures (percentages are all ≤100 in
  every synthesized payload); no E2E oracle exists for computed overflow behaviour and
  none is warranted here.

## Repairs (fix wave 3)

| # | Test | Symptom | Root cause in my spec | Fix | Assertion still covers |
|---|------|---------|-----------------------|-----|------------------------|
| 1 | `sessions.spec.ts`: "a status-line post persists and routes but mutates no session field in M1 (REQ-13)" | `expect(found?.title).toBe("walk-status-line")` failed: `Received: "a status-line-derived title"` | Spec encoded the M1-era rule (status line never mutates title) that this plan's approved protocol §5.3 delta explicitly supersedes for M3 | Retitled the test to "…refreshes the title per M3 value semantics (REQ-4)" and changed the expectation to `"a status-line-derived title"` (the fixture's own `sessionName` value) | REQ-4 (title refresh from status line) and REQ-13's routing/persistence behaviour — the SessionStart+status routing and `queryEvents` persistence assertions are unchanged and still pass |
| 2 | `shell.spec.ts`: "GET /api/state returns exactly the M0 snapshot object once authenticated" | `toEqual` failed: expected object missing `usage.model: null` present in the actual response | Spec's frozen snapshot predated the m3-gauges protocol §5.4 delta that added `UsageInfo.Model` as an explicit-null wire field | Added `model: null` to the expected `usage` object | REQ-17 (`/api/state` reflects everything) and the M0 snapshot contract — every other key/value in the frozen object is unchanged and still asserted exactly |

No assertion was deleted, skipped, or weakened.

## Test Run Output (fix wave 3, full suite via `make e2e`)

```
Running 71 tests using 6 workers
  ✓  71 passed (22.1s)
```

Full per-test listing confirmed: all 9 spec files' tests pass, including both fixed
tests —
`sessions.spec.ts:360 › a status-line post persists, routes, and refreshes the title
per M3 value semantics (REQ-4)` and
`shell.spec.ts:52 › GET /api/state returns exactly the M0 snapshot object once
authenticated`.

Collection re-verified suite-wide after the edits: `npx playwright test --list` →
`Total: 71 tests in 9 files`, no duplicate-title or collection errors.

## Notes (fix wave 3)

Both fixes were pure expectation updates to bring pre-existing (pre-this-plan) specs in
line with this plan's own approved and merged protocol delta — no locator repair, no
timing fix, no fixture-shape change was needed. Confirmed via `git log`/plan history
these two tests were authored by earlier plans (m0/m1-sessions and m2-terminal) and
carried no `[e2e-specs]`-tagged ownership boundary that this plan's fix wave couldn't
touch — review.md explicitly assigned both to `[e2e-specs]` and named the fix directly.
