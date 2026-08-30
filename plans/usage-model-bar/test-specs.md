# E2E Test Specs: usage-model-bar

**Plan**: usage-model-bar
**Mode**: fix (attempt 2) — review cycle 2, wave 3
**Verdict**: pass
**Tests created**: 11 (10 prior + 1 this cycle)
**Live run**: 115/115 passing (full suite)

## Tests

| File | Test Name | Requirement | What It Verifies |
|------|-----------|-------------|------------------|
| web/e2e/usage-model.spec.ts | with the fake endpoint returning a Fable 61% window, the readout shows the select, percent, warn bar and resets suffix (E1) | REQ-1, REQ-4, REQ-9 | Immediate on-Start fetch renders select=Fable (1 option), `.num`=61%, `.bar.warn > i`, `.resets` starting `· resets` |
| web/e2e/usage-model.spec.ts | before the first fetch completes, the readout reads unknown with a disabled single-option select and no track markup (E2) | REQ-9, REQ-10, INV-2 | Held fake endpoint → `unknown`, zero `.bar`/`i`/`.resets`, select disabled with 1 option = pref default |
| web/e2e/usage-model.spec.ts | choosing a second model in the select re-renders to that model's percent and survives a reload (E3) | REQ-8, REQ-9, REQ-12 | select→Opus re-renders to 20%; `GET /api/state` echoes `prefs.usageModel:"Opus"`; survives reload |
| web/e2e/usage-model.spec.ts | clicking Refresh usage causes a second request at the fake endpoint within 1s, and the button is aria-busy until the usage message lands (E4) | REQ-7, REQ-12 | Button click → fake endpoint sees a second request within 1s (`expect.poll` timeout 1000ms) → `aria-busy="true"` → release → 70% renders, `aria-busy` cleared |
| web/e2e/usage-model.spec.ts | the fake endpoint switched to 401 marks the readout stale while keeping the last-good percent, and a later 200 clears it (E5) | REQ-6, REQ-11, INV-3 | 401 → `.stale` + `title="unauthorized"`, `.num`/track unchanged (last-good kept); 200 → `.stale` gone |
| web/e2e/usage-model.spec.ts | a daemon started with -usage-poll 0 shows unknown and 404s the refresh endpoint, never calling the fake endpoint (E6) | REQ-7, edge case 14 | `-usage-poll 0` → `unknown`, `POST /api/usage/refresh` → 404 `not_found`, fake endpoint request count stays 0 |
| web/e2e/usage-model.spec.ts | the daemon's captured log output never contains the usage token string, across a success and a failure poll (E7, INV-4) | REQ-2, INV-4 | Grep of `daemon.log` (stdout+stderr tail) for the fixture's fake token string, after both a successful and a 401 poll |
| web/e2e/usage-model.spec.ts | a usageModel change in one window re-renders another window's readout via the prefs echo, seen from both Focus and Tiles (INV-6) | REQ-8, REQ-12, INV-6 | Two browser contexts; select change in A propagates to B's readout with B first in Focus then in Tiles |

E8 (`make e2e` passes) is exercised by the harness itself, not an individual spec.

## Fixture Changes

- `web/e2e/helpers/usageapi.ts` (new) — `FakeUsageAPI` (Node `http` server standing in
  for `https://api.anthropic.com`), `weeklyScopedUsageResponse(windows)`,
  `credentialsFileContent(token)`.
  - `weeklyScopedUsageResponse` is synthesized directly from
    `spikes/canary-fields.md`'s "`GET /api/oauth/usage` measured live 2026-08-30" entry:
    top-level `five_hour`/`seven_day`/`seven_day_opus`/`seven_day_sonnet`/
    `seven_day_oauth_apps`/`extra_usage` (present in the real response, unused by the
    decode) plus one `amber_ladder` noise key (named in the capture, exercises "unknown
    keys ignored"), and a `limits[]` entry per window with exactly the measured field set
    — `kind:"weekly_scoped"`, `group`, `percent` (int), `severity:"normal"`, `resets_at`
    (RFC3339 with micros + offset, e.g. `2026-09-01T13:59:59.522599+00:00`),
    `scope:{model:{id:null,display_name}, surface:null}`, `is_active`. No field here is
    invented — every key traces to that capture.
  - `credentialsFileContent` builds the `{"claudeAiOauth":{"accessToken":"…"}}` shape
    the plan's Implementation Notes name as what `internal/claudecode`'s token reader
    parses (same shape for both the Keychain item and `-usage-token-file`).
  - `FakeUsageAPI` has a request counter (E4/E6), a settable status/body
    (`setResponse`), and a `hold()`/`release()` gate so E2/E4 observe the
    pre-fetch-complete and pending-refresh states deterministically instead of racing a
    poll interval.

- `web/e2e/helpers/daemon.ts` (edited, additively) — `ScratchDaemonOptions` gains
  `usagePoll?`, `usageApiURL?`, `usageTokenContent?`. Every scratch daemon now passes
  `-usage-token-file <dataDir>/usage-token.json` **unconditionally** (REQ-13/INV-4): this
  makes it structurally impossible for *any* E2E spec — this plan's or any other file's
  — to fall through to the real macOS Keychain, regardless of whether that spec cares
  about the usage-model feature. `usagePoll`/`usageApiURL` only add flags when the caller
  passes them; every pre-existing call site (`startScratchDaemon()` with no options)
  behaves exactly as before except for the new unconditional token-file flag. Added a
  public `get log()` accessor exposing the previously-private captured stdout+stderr
  tail, for E7/INV-4's grep.

- `web/e2e/helpers/gauges.ts` (edited, additively) — `mastheadModelWeek`,
  `mastheadModelWeekPercent`, `mastheadModelWeekTrack`, `mastheadModelWeekWarn`,
  `mastheadModelWeekResets`, `mastheadModelSelect`, `mastheadUsageRefreshButton`. Unlike
  the pre-existing `mastheadModelReadout` in this file (explicitly hedged across
  multiple guessed markups because no prior plan pinned it), these are direct locators
  against IDs/aria-labels the usage-model-bar plan's own UI Specifications section pins
  verbatim (`#usage-model-week`, `aria-label="Usage model"`, accessible name
  "Refresh usage") — not hedged, since a mismatch there is a build defect, not a locator
  guess.

## Coverage

| Requirement | E2E Tests |
|-------------|-----------|
| REQ-1 | E1 (immediate on-Start fetch), E2 (held fetch) |
| REQ-2 | E7 (token never logged) |
| REQ-4 | E1 (decode into displayName/usedPct/resetsAt from the measured `limits[]` shape) |
| REQ-6 | E5 (401 → `unauthorized`, last-good kept) |
| REQ-7 | E4 (refresh wakes poller, coalesced target), E6 (404 when disabled) |
| REQ-8 | E3, INV-6 (prefs persistence/echo) |
| REQ-9 | E1, E2, E3 (select, bar/percent/resets rendering) |
| REQ-10 | E2 (unknown, zero track) |
| REQ-11 | E5 (`.stale` + `title`) |
| REQ-12 | E3 (select→PUT→re-render), E4 (refresh button + aria-busy) |
| REQ-13 | All tests (fake endpoint + scratch token file; no real Keychain/network) |
| INV-2 | E2 |
| INV-3 | E5 |
| INV-4 | E7 |
| INV-6 | dedicated INV-6 test (two windows, Focus and Tiles) |

REQ-3, REQ-5, REQ-14 and INV-1/INV-5 are daemon-internal (request shape, dedup/persist
ordering, `modelScopedAt` null-iff-null, single-writer holders) — covered by the plan's
Go unit tests (D5-D9), not restated here since the E2E harness can't observe them any
more precisely than "the rendered value is right," which E1/E2/E5 already assert.

## Test Run Output

Not run — authoring mode. Collection gate only:

```
$ npx playwright test --list
...
[chromium] › usage-model.spec.ts:46:1 › with the fake endpoint returning a Fable 61% window, the readout shows the select, percent, warn bar and resets suffix (E1)
[chromium] › usage-model.spec.ts:73:1 › before the first fetch completes, the readout reads unknown with a disabled single-option select and no track markup (E2)
[chromium] › usage-model.spec.ts:102:1 › choosing a second model in the select re-renders to that model's percent and survives a reload (E3)
[chromium] › usage-model.spec.ts:141:1 › clicking Refresh usage causes a second request at the fake endpoint within 1s, and the button is aria-busy until the usage message lands (E4)
[chromium] › usage-model.spec.ts:179:1 › the fake endpoint switched to 401 marks the readout stale while keeping the last-good percent, and a later 200 clears it (E5)
[chromium] › usage-model.spec.ts:214:1 › a daemon started with -usage-poll 0 shows unknown and 404s the refresh endpoint, never calling the fake endpoint (E6)
[chromium] › usage-model.spec.ts:241:1 › the daemon's captured log output never contains the usage token string, across a success and a failure poll (E7, INV-4)
[chromium] › usage-model.spec.ts:270:1 › a usageModel change in one window re-renders another window's readout via the prefs echo, seen from both Focus and Tiles (INV-6)
...
Total: 112 tests in 12 files
```

No collection errors, no duplicate titles. Also ran `npx tsc --noEmit -p .` (covers
`e2e/` per `tsconfig.json`'s `include`) with exit code 0 — strict mode,
`exactOptionalPropertyTypes`, `noUnusedLocals`/`noUnusedParameters` all clean on the new
and edited files.

## Notes

- Every test in this file omits `-usage-poll` except E6 (which explicitly sets `"0"`):
  REQ-1's immediate on-Start fetch is sufficient for every "first data" assertion, and
  all subsequent transitions are driven by explicit `POST /api/usage/refresh` calls (via
  the button in E4, via `page.request` elsewhere) rather than waiting out a timer. This
  keeps the suite fast and removes any dependency on poll-interval timing.
- E4 exercises the actual `#usage-refresh` button click (the UI wiring REQ-12
  describes); E5/E6/E7 hit `POST /api/usage/refresh` directly via `page.request` since
  those tests are about the protocol/error-kind/log-safety behaviour, not the button —
  E4 already covers the button-to-endpoint wiring once.
- `mastheadModelSelect`/`mastheadUsageRefreshButton` rely on `<select>` mapping to ARIA
  role `combobox` in Chromium's accessibility tree when neither `multiple` nor a
  `size > 1` attribute is set — the same mapping the plan's own Testable UI Elements
  table asserts. If web-impl's markup ever adds `size` or `multiple` to that `<select>`,
  the role would change and this locator would need repair in validate mode; nothing in
  the plan suggests that, so it isn't hedged.
- The E7/INV-4 log-grep test only proves the token is absent from *this run's* captured
  stdout+stderr tail (bounded to the last 16KB per `daemon.ts`'s existing drain logic,
  unchanged by my edit). That is the harness's existing crash-diagnostics buffer, not an
  unbounded transcript; a token logged early and pushed out of the tail by later chatty
  output would not be caught. I did not widen that buffer — it's shared daemon.ts
  infrastructure this plan doesn't call out for change beyond the usage seams, and 16KB
  comfortably covers a short-lived scratch-daemon test run's actual output based on
  every existing spec's usage of the same buffer.
- Two locators (`mastheadModelWeekTrack` as `.bar i`, `mastheadModelWeekWarn` as
  `.bar.warn`) are written directly against the plan's own prose ("existing
  `renderUsageTrack` shape", ">= 60% warn rule") rather than hedged with `.or()` the way
  the pre-existing `mastheadBucketWarn`/`cardContextHot` in gauges.ts are — those predate
  a plan that pinned the exact classes, this one's UI Specifications section already
  does (mirrors the existing `.bar.warn i` rule in `web/src/style.css:209`).
- No real `claude` process is launched anywhere in this file. No test in this file or in
  `helpers/daemon.ts`'s shared code path constructs a Keychain-reading token reader —
  every scratch daemon now passes `-usage-token-file` unconditionally.

## Validate Attempt 1

Implementation and unit tests (daemon-implementation.md, web-implementation.md,
daemon-tests.md, web-tests.md) are all complete and green per their own logs — every
build-blocking sanctioned-breakage fixup they flagged for each other was already applied
by the time I started (`go build ./...`, `npx tsc --noEmit`, `go test ./...`,
`npx vitest run` all clean per their handoffs).

### Rebuild

```
$ make build web-build
go build -ldflags "-X main.version=7f8a312-dirty" -o bin/musterd ./cmd/musterd
cd web && npm run build
> tsc --noEmit && vite build
✓ 30 modules transformed.
dist/index.html                   9.43 kB │ gzip:  2.16 kB
dist/assets/index-wP9f5eDg.css   19.98 kB │ gzip:  4.42 kB
dist/assets/index-BoI-ocAT.js   374.39 kB │ gzip: 96.74 kB │ map: 905.51 kB
✓ built in 251ms
```

`web/e2e/**` type-checked clean as part of `tsc --noEmit` (no separate step needed —
the plan's own gate note applies).

### My spec file, live, first run

```
$ npm run e2e -- e2e/usage-model.spec.ts
Running 8 tests using 6 workers
  ✓ before the first fetch completes... (E2)
  ✓ a daemon started with -usage-poll 0... (E6)
  ✓ with the fake endpoint returning a Fable 61% window... (E1)
  ✓ clicking Refresh usage causes a second request... (E4)
  ✓ the fake endpoint switched to 401 marks the readout stale... (E5)
  ✓ choosing a second model in the select re-renders... (E3)
  ✓ the daemon's captured log output never contains the usage token string... (E7, INV-4)
  ✓ a usageModel change in one window re-renders another window's readout... (INV-6)
  8 passed (3.9s)
```

All 8 tests passed on the first live run. No locator repairs were needed — every ID,
`aria-label`, and class this spec asserts against (`#usage-model-week`,
`aria-label="Usage model"`, "Refresh usage", `.num`/`.bar i`/`.bar.warn`/`.resets`,
`.stale` + `title`) matches web-implementation.md's `renderModelWeek` and
`index.html` edits exactly as the plan's UI Specifications/Testable UI Elements table
described them.

### Full suite sweep (Validate Mode step 5)

```
$ make e2e
Running 112 tests using 6 workers
...
2 failed
  [chromium] › e2e/shell.spec.ts:52:1 › GET /api/state returns exactly the M0 snapshot object once authenticated
  [chromium] › e2e/views.spec.ts:472:1 › GET /api/state's prefs snapshot carries both view and density (M2 protocol delta)
110 passed (27.3s)
```

Both failures were frozen-shape `toEqual()` literals against `GET /api/state`, from
before this plan existed. Per the plan's approved Protocol Contract:

- `usage` (§5.4 delta): adds `modelScoped`/`modelScopedAt`/`modelScopedError`/
  `modelScopedSource`, and `snapshot.usage` "carries the same fields."
- `prefs` (§5.5/§3.3 delta): adds `usageModel`, default `"Fable"`.

Both failures are exactly what this delta predicts and nothing else — sanctioned
breakage, not implementation bugs. `shell.spec.ts`'s scratch daemon (`startScratchDaemon()`
with no `usageTokenContent`) has an empty `-usage-token-file`, so its immediate
on-Start fetch (REQ-1) fails fast with `"no-credentials"` — the real body's
`modelScopedError` value, which I pinned exactly rather than guessing `null` (INV-1
still holds: `modelScoped`/`modelScopedAt` stay null since no fetch ever succeeded).

## Repairs

| # | Test | Symptom | Root cause in my spec | Fix | Assertion still covers |
|---|------|---------|-----------------------|-----|------------------------|
| 1 | `shell.spec.ts` — "GET /api/state returns exactly the M0 snapshot object once authenticated" | `toEqual()` failed: actual body had 4 extra `usage.modelScoped*` keys and `prefs.usageModel` | Test pre-dates this plan; asserted the pre-delta frozen shape | Added `modelScoped: null, modelScopedAt: null, modelScopedError: "no-credentials", modelScopedSource: "subscription-api"` to the expected `usage` object and `usageModel: "Fable"` to the expected `prefs` object, per the plan's §5.4/§5.5/§3.3 Protocol Contract delta | Still asserts the *entire* `/api/state` body shape exactly (M0 fields unchanged, new fields pinned to their actual REQ-1/INV-1 values — stricter, not looser) |
| 2 | `views.spec.ts` — "GET /api/state's prefs snapshot carries both view and density (M2 protocol delta)" | `toEqual()` failed on `before.prefs`/`after.prefs`: actual had an extra `usageModel` key | Same — pre-dates this plan, asserted the pre-usageModel prefs shape | Added `usageModel: "Fable"` to both expected `prefs` objects (before and after the density PUT) and widened the TS annotation to include it | Still asserts `view`/`density` exactly as before, plus the new field — no assertion removed or loosened |

No assertion was deleted, skipped, or weakened.

### Re-verified collection and full suite after the repairs

```
$ npx playwright test --list
Total: 112 tests in 12 files
(no collection errors, no duplicate titles)

$ npm run e2e
112 passed (27.4s)
```

## Test Run Output (validate attempt 1, final)

```
$ npm run e2e
Running 112 tests using 6 workers
...
112 passed (27.4s)
```

## Fix Attempt 1

**Mode**: fix (attempt 1) — review cycle 1, wave 3

**Review issue addressed** (`[e2e-specs]`, review.md Major 1):

> No regression test pins the fix for Critical 1 — every existing spec drives the select
> through `selectOption`, which cannot see the defect. Add a spec that focuses
> `#usage-model-week select`, waits past one render tick (> 1 s), and asserts the element
> still holds focus (and, ideally, that the same node instance survives).

**Re-read before editing**: `plans/usage-model-bar/web-implementation.md` Fix Attempt 1
(the `modelWeekCache`/`buildModelWeek`/`applyModelTrack` split in
`web/src/render/masthead.ts`) and `plans/usage-model-bar/daemon-implementation.md` Fix
Attempt 1 (no daemon-side wire changes touch this area). Confirmed the real markup and
locator names (`#usage-model-week`, `aria-label="Usage model"`) are unchanged from
authoring — `web/e2e/helpers/gauges.ts`'s existing `mastheadModelSelect`/`mastheadModelWeek*`
helpers apply directly, no new locator needed.

### Test 1 — Critical 1 regression (the review's own repro)

Added to `web/e2e/usage-model.spec.ts`: **"the model select keeps focus and the same
node instance across a render tick (Critical 1 regression)"**.

- Focuses the live `<select>` (`mastheadModelSelect`), tags the actual DOM node with a
  custom property (`__e2eTag`) so "same node" can be told apart from "a different node
  that happens to also be focused" — a plain `toBeFocused()` alone cannot distinguish a
  preserved node from a rebuild that happens to refocus an equivalent new one.
- Waits 1.6 s (past the 1 s render tick with margin, matching the reviewer's own 1.6 s
  measurement window in review.md's Manual Verification section).
- Asserts, after the wait: `select` is still focused, the tag survived (proving the same
  node instance, not a replacement), and the value still reads correctly (`"Fable"`) —
  covering both the focus symptom and the underlying node-identity defect the reviewer
  measured three ways (`data-` attribute survival, `activeElement`, functional
  typeahead-after-a-tick).
- Does **not** attempt to observe the native `<select>` popup itself — Playwright cannot
  observe that (the review's own "Not verified" note) — so this test targets exactly what
  is measurable: node identity and focus.

### Test 2 — Minor 3 fix, new user-visible behaviour (per this cycle's instruction to cover implementation fixes proactively)

Read `web-implementation.md` Fix Attempt 1's Minor 3 section: when `prefs.usageModel`
names a model absent from a non-null `modelScoped` list, `renderModelWeek` now prepends a
disabled placeholder `<option>` carrying the pref name (`names = [selectedModel,
...rawNames]`) instead of leaving `select.value` unmatched (`selectedIndex -1`, blank).
This is new behaviour this cycle's fix introduced with no review issue tagging it, so per
this cycle's instructions I added coverage myself.

Added: **"a usageModel pref naming a model absent from a non-null list shows a disabled
placeholder option instead of going blank (Minor 3 fix)"**.

- Starts from a non-null two-window list (`Fable`, `Opus`), then `PUT /api/prefs
  {usageModel: "Sonnet"}` — a model absent from that list.
- Asserts INV-2 still holds (`.num` reads `unknown`, zero `.bar`/`i`/`.resets` nodes) even
  though the list itself is non-null — this is the case the plan's own W4/INV-2 unit
  coverage already asserts in Vitest, but no E2E test drove the pref-divergence path
  through a real daemon before.
- Asserts the select shows exactly 3 options in order `["Sonnet", "Fable", "Opus"]`, that
  option 0 (`"Sonnet"`) carries the `disabled` attribute, and that `select.value` reads
  `"Sonnet"` (not blank / not falling back to the first real option) — the actual
  observable difference between the fix and the pre-fix behaviour the reviewer measured
  (`{value:"", selectedIndex:-1}`).

### Live run — my spec file

Rebuilt first (`make build web-build`, both daemon and web build clean, no errors), then:

```
$ npm run e2e -- e2e/usage-model.spec.ts
Running 10 tests using 6 workers
  ✓ before the first fetch completes... (E2)
  ✓ a daemon started with -usage-poll 0... (E6)
  ✓ with the fake endpoint returning a Fable 61% window... (E1)
  ✓ the fake endpoint switched to 401 marks the readout stale... (E5)
  ✓ clicking Refresh usage causes a second request... (E4)
  ✓ choosing a second model in the select re-renders... (E3)
  ✓ the daemon's captured log output never contains the usage token string... (E7, INV-4)
  ✓ a usageModel pref naming a model absent from a non-null list shows a disabled placeholder option instead of going blank (Minor 3 fix)
  ✓ a usageModel change in one window re-renders another window's readout... (INV-6)
  ✓ the model select keeps focus and the same node instance across a render tick (Critical 1 regression)
  10 passed (5.4s)
```

All 10 passed on the first live run (8 original unchanged + 2 new). No locator repairs
needed.

### Collection re-check

```
$ npx playwright test --list
Total: 114 tests in 12 files
(no collection errors, no duplicate titles)
```

### Full suite sweep

```
$ make e2e
...
114 passed (27.8s)
```

No pre-existing spec broke. The Minor 3 fix only changes rendering for the specific
pref-absent-from-non-null-list case; `shell.spec.ts` and `views.spec.ts`'s frozen `/api/state`
assertions (already updated in Validate Attempt 1's Repairs table) pin `usageModel:
"Fable"` against daemons where the pref equals the default and no list diverges from it,
so they are unaffected by this cycle's change. No new repair needed to any pre-existing
spec.

## Repairs (fix attempt 1)

No repairs to existing specs were needed this cycle — both new tests passed on their
first live run with no locator adjustments, and the full-suite sweep found no
plan-superseded pre-existing specs beyond the two already recorded in Validate Attempt
1's Repairs table (unaffected by this cycle's change; re-verified still passing above).

No assertion was deleted, skipped, or weakened.

## Test Run Output (fix attempt 1, final)

```
$ npm run e2e -- e2e/usage-model.spec.ts
10 passed (5.4s)

$ npx playwright test --list
Total: 114 tests in 12 files

$ make e2e
114 passed (27.8s)
```

## Fix Attempt 2

**Mode**: fix (attempt 2) — review cycle 2, wave 3

**Task**: no review issue this cycle is tagged `[e2e-specs]`. review.md Major 1 ("the
node-reuse cache keys on the option-*name* sequence only, so a placeholder-state flip
that leaves the names identical never re-syncs per-option `disabled`") was fixed by
web-impl (`web/src/render/masthead.ts` — `ModelWeekState.placeholderNeeded`, the
`renderModelWeek` reuse guard) and pinned by web-tests (`masthead.test.ts`, two new
node-reuse cases). The review's own text calls out the gap this closes: "the E2E specs
never move a model out of and back into the list." Per the orchestrator's instructions,
added exactly that coverage to `web/e2e/usage-model.spec.ts`.

Rebuilt first (`make build web-build`) — both daemon and web builds were current for
this cycle (no prior wave had left the binary stale).

### New test

Added to `web/e2e/usage-model.spec.ts`: **"a model dropped from the list and later
restored becomes selectable again via real keyboard input (Major 1 regression)"**.

Reproduces the review's exact collision transition end-to-end:

1. Pref stays at its default `"Fable"` (REQ-8); the fake endpoint's list starts as
   `[Opus]` only → asserts the placeholder state (`.num` `unknown`, zero track markup,
   select value `"Fable"`, 2 options, option 0 `"Fable"` `disabled`, option 1 `"Opus"`).
2. The fake endpoint is switched to `[Fable(61%), Opus(20%)]` — the review's own
   collision: the resulting option-name sequence is still exactly `["Fable","Opus"]`
   (the placeholder synthesizes that same order), so this is the specific state pair the
   node-reuse cache used to treat as "unchanged." Driven via the `↻` refresh button
   (not a poll wait — the daemon's default poll is 5m and no test here should depend on
   waiting one out).
3. Asserts the live percent renders (`61%`, one track node) and that option 0 (`Fable`)
   is now `toBeEnabled()` — the direct fix assertion.
4. Then proves selectability with a **real keyboard interaction**, not `selectOption`:
   focuses the select and sends native single-character typeahead — `"O"` moves the
   selection to Opus (`.num` → `20%`), then, after a wait past the browser's own
   typeahead search-string timeout (see Repairs below), `"F"` moves it back to Fable
   (`.num` → `61%`, one track node). `selectOption` sets `.value` programmatically and
   bypasses the browser's own per-option `disabled` gate a real interaction goes through,
   so it could not have caught Major 1 — this is why the task asked for keyboard/focus
   input specifically.
5. Confirms the keyboard-driven change actually persisted server-side (`GET /api/state`
   → `prefs.usageModel: "Fable"`), not just in the DOM.

### Repairs

| # | Test | Symptom | Root cause in my spec | Fix | Assertion still covers |
|---|------|---------|------------------------|-----|--------------------------|
| 1 | a model dropped from the list and later restored becomes selectable again via real keyboard input (Major 1 regression) | First live run: after pressing `"O"` (→ Opus, correct) then immediately pressing `"F"`, the select stayed on `"Opus"` instead of returning to `"Fable"`. | Wrong assumption about native `<select>` typeahead: I pressed `"F"` immediately after `"O"`. Isolated the mechanism outside the app entirely — a bare two-option `<select>` in a fresh page, no daemon involved — and reproduced the same result (`O` then immediate `F` → stays on Opus; `O` then a ≥1.1s pause then `F` → correctly returns to Fable). This is the browser's own typeahead search-string concatenation window (HTML select typeahead buffers consecutive keypresses into one search string when they arrive close together — `"O"`+`"F"` within the window searches for `"OF"`, which matches nothing, so the selection doesn't move): a real user's keystrokes are almost never that fast, but two scripted `page.keyboard.press()` calls back-to-back are. This is a fact about genuine browser keyboard-input semantics, not an artifact of headless mode or of Playwright — the reproduction above also failed identically in headed Chromium. | Added `await page.waitForTimeout(1100)` between the `"O"` and `"F"` presses — the wait models the pause a real user's second keystroke would have, and clearing the typeahead buffer is a prerequisite for the *second* keystroke to mean what it says, not a workaround for anything the app does. | REQ-12 (select changes model, persists via `PUT /api/prefs`) and the Major 1 fix (Fable option genuinely selectable via a real interaction) are both still asserted at full strength — nothing about the assertions themselves changed, only the timing between two real keystrokes. |

No assertion was deleted, skipped, or weakened.

### Live run

```
$ npm run e2e -- e2e/usage-model.spec.ts
Running 11 tests using 6 workers
  ✓ with the fake endpoint returning a Fable 61% window... (E1)
  ✓ before the first fetch completes... (E2)
  ✓ choosing a second model in the select re-renders... (E3)
  ✓ clicking Refresh usage causes a second request... (E4)
  ✓ the fake endpoint switched to 401 marks the readout stale... (E5)
  ✓ a daemon started with -usage-poll 0... (E6)
  ✓ the daemon's captured log output never contains the usage token string... (E7, INV-4)
  ✓ a usageModel change in one window re-renders another window's readout... (INV-6)
  ✓ the model select keeps focus and the same node instance across a render tick (Critical 1 regression)
  ✓ a usageModel pref naming a model absent from a non-null list shows a disabled placeholder option instead of going blank (Minor 3 fix)
  ✓ a model dropped from the list and later restored becomes selectable again via real keyboard input (Major 1 regression)
11 passed (4.4s)
```

### Collection re-check

```
$ npx playwright test --list
Total: 115 tests in 12 files
(no collection errors, no duplicate titles)
```

### Full suite sweep

```
$ make e2e
...
115 passed (27.4s)
```

No pre-existing spec broke; no plan-superseded pre-existing assertion found this cycle
(the plan's protocol contract didn't change in this fix wave).

## Notes

- The Major-1 fix itself required no locator changes elsewhere — `masthead.ts`'s public
  DOM shape (ids, classes, `aria-label`s) is unchanged; only the internal reuse-cache
  keying changed, which is exactly what the new test observes indirectly (via `disabled`
  and selectability) rather than by inspecting the cache.
- Flagging for anyone reusing keyboard-driven `<select>` interactions elsewhere in this
  suite: native typeahead's search-string concatenation window (~1s) means consecutive
  `page.keyboard.press()` calls targeting *different* option letters need an explicit
  wait in between to behave like two independent user keystrokes; the existing Critical-1
  regression test in this same file never hit this because it only ever sends a single
  keypress.
