# Plan: Usage Bar Consistency

**Created**: 2026-10-26
**Status**: completed
**Work Type**: full-stack
**E2E Scope**: new-specs
**Fixture plan**: usage-reset.spec.ts startDaemon (each test computes `-usage-poll`, `-usage-api-url` and the fake endpoint's responses, and one test restarts the daemon)
**Render fixtures**: usage-known
**Features**: usage
**Touches**: ingest, connection, rail
**Description**: The 5h, 7d and per-model bars follow the usage call as well as the status line, re-read at each reset, and never show a percentage past its reset.

## Overview

Issue [#105](https://github.com/Zalaras/muster/issues/105): the 5h bar showed 100% after its
window reset, and neither the refresh button nor a page reload changed it. Today the 5h and 7d
bars have one source, the routed status post (`internal/server/ingest.go` → `Aggregator.Record`),
and the daemon serves the last one for as long as it runs, whatever its `resetsAt`
(`internal/usage/aggregator.go` `snapshotLocked`). A failed or idle session posts nothing more
(kb:fact/status-line-around-failed-turns), so the stale value stays. The usage call
(`internal/claudecode/usageapi.go` `InterpretUsageReport`) reads only `limits[]` rows of kind
`weekly_scoped` and drops the response's `five_hour`/`seven_day` (kb:fact/usage-api-oauth-shape),
so the refresh button cannot reach the 5h bar. The web derivation
(`web/src/sessions/usage.ts` `buildUsageBucketViewModel`) renders a past reset verbatim. The
diagnosis and the agreed design are in `plans/bugs-one-batch/research/e3.md` (2026-10-22).

The fix, as agreed with the developer: every usage call (timer and refresh button) feeds
`five_hour`/`seven_day` into the 5h and 7d bars; when any bar's reset passes the daemon makes the
call at once; the status line and the call both feed the bars and the newest arrival wins, bucket
by bucket; a value whose reset has already passed is never adopted; and the dashboard shows
`unknown` for any bar whose reset has passed until a fresh value arrives, so a failed call after
a reset leaves `unknown`, never the stale percentage. The per-model weekly bar gets the same
reset-time call and the same `unknown`-past-reset display (the developer, 2026-10-26).

No wire shape changes. The `usage` message keeps its fields; what changes is where the
`fiveHour`/`sevenDay` half comes from, that each bucket can now be known independently, and the
prose in `docs/protocol.md` § `ws.usage` and `kb:anchor/usage.refresh` that says so. No schema
change.

## Requirements

### Must Have
- [ ] REQ-1: Every successful usage call (start-up, timer, refresh button, reset wake) offers the
  response's `five_hour` and `seven_day` windows to the 5h and 7d bars, alongside the per-model
  windows it already records.
- [ ] REQ-2: The 5h and 7d bars are fed by both sources, and for each bucket independently the
  most recently arrived adoptable value wins, whichever source it came from.
- [ ] REQ-3: The daemon never adopts a bucket value whose `resetsAt` is at or before the moment
  it arrives; the bar keeps its current value for that bucket (status post and usage call alike).
- [ ] REQ-4: When the reset instant of the known 5h bucket, 7d bucket or any known per-model
  window passes, the daemon makes a usage call at once (subject to the existing one-in-flight
  coalescing), rather than waiting for the timer. Each reset instant wakes it once.
- [ ] REQ-5: The dashboard renders any usage bar (5h, 7d, per-model) whose `resetsAt` is
  strictly before its clock as `unknown` with no track and no reset suffix, until a value with
  a later reset arrives. It needs no daemon message to do so.
- [ ] REQ-6: A daemon that has just started fills the 5h and 7d bars from its start-up usage call,
  without waiting for a status post. Nothing is read back from `usage_sample` rows
  (kb:adr/usage-no-hydration-across-restart's decision stands).
- [ ] REQ-7: A usage call that fails changes neither the 5h nor the 7d bucket; only
  `modelScopedError` reports the failure, as today.
- [ ] REQ-8: A `usage_sample` history row is written whenever the merged 5h/7d state changes and
  both buckets are known. A row from a usage call carries the last known status-line model, or
  an empty model when none is known, and `source` `subscription-api`; status-post rows keep
  `subscription`.

### Should Have
- [ ] REQ-9: The value-level de-dup holds across sources: a usage call returning the same 5h/7d
  values the status line already gave sends no `usage` message and writes no row
  (kb:adr/usage-sample-dedup-by-value).
  *Amended (review cycle 1, correctness Major 1):* "the same values" means the same window
  stated to the second and percentages within float noise — the call's `resets_at` is rounded up
  to the whole second at the adapter (kb:adr/usage-call-resets-rounded-up-to-the-second,
  kb:fact/rate-limit-resets-differ-in-precision-across-sources).

## Protocol Contract

Delta against `docs/protocol.md`. **No shape change** to any message or endpoint; prose only.

### HTTP: POST /api/usage/refresh (`kb:anchor/usage.refresh`)

Unchanged status codes, auth and coalescing. The sentence "Wakes the per-model usage poller
(`kb:anchor/ws.usage` `modelScoped`) for an immediate fetch" becomes: "Wakes the usage poller for
an immediate fetch, whose result feeds `modelScoped` and the `fiveHour`/`sevenDay` buckets".

### WS: daemon→UI `usage` (`kb:anchor/ws.usage`)

Shape unchanged. Field comments change:

```jsonc
"fiveHour": { "usedPct": 61.2, "resetsAt": "2026-08-20T11:00:00Z" },  // null until the first adopted value since daemon start, from either source; independent of sevenDay
"sevenDay": { "usedPct": 23.0, "resetsAt": "2026-08-22T06:00:00Z" },  // as fiveHour
"sampledAt": "2026-08-20T09:15:31Z",   // when the last bucket value was adopted; null iff both buckets null
```

Prose replacing the "Two sources, one object" paragraph's first sentence and the
"No hydration" / "A sample is recorded only from a routed status post" sentences:

- **Two sources feed the buckets.** A routed status post carrying `rate_limits` and musterd's own
  call to `/api/oauth/usage` (its `five_hour`/`seven_day`) both offer `fiveHour`/`sevenDay`
  values. Each bucket takes the most recently arrived value, except that a value whose `resetsAt`
  is at or before its arrival is never adopted. The call also feeds `modelScoped*`, as before.
- **The call runs** at daemon start, every `-usage-poll` interval, on `kb:anchor/usage.refresh`,
  and at the instant any known bucket's or `modelScoped` window's `resetsAt` passes.
- **No hydration**: after a daemon restart every bucket is null until the first adopted value,
  normally the start-up call's.
- **Past a reset**, a bucket still on the wire with a `resetsAt` before the client's clock is
  stale; clients render it unknown. A failed call never clears or changes a bucket.
- Value-level change detection covers the merged buckets regardless of source.

## Schema Changes

No schema changes required. `usage_sample.source` (TEXT NOT NULL) takes the new value
`subscription-api`; `model_id`/`model_display_name` (NOT NULL) take the carried model or `""`.

## UI Specifications

### Views
- Masthead (`docs/design/design-system.md` §5 "Gauge thresholds", §6 "Honesty rules";
  kb:adr/usage-unknown-renders-word-not-track, kb:adr/usage-reset-time-bracketed): the 5h, 7d and
  per-model readouts. No markup change; the three readouts gain the past-reset `unknown` state.

### User Flows
1. Bar at 100% from a status post → its reset passes → the bar reads `unknown` at once → the
   daemon's reset-time call returns → the bar shows the call's value with its new reset.
2. Developer presses Refresh usage → the 5h, 7d and per-model readouts show the call's values.
3. Reset passes while the call fails (or polling is off) → the bar stays `unknown`.

### States
- No data yet: `unknown`, no track (unchanged).
- Past reset: the same `unknown` rendering, no track, no reset suffix (REQ-5).
- Daemon down: the readouts keep the last snapshot's values; a bar whose reset passes while the
  daemon is down still turns `unknown` (REQ-5 needs no message).

### Testable UI Elements

| Element | Role | Name / Text Pattern | Notes |
|---------|------|---------------------|-------|
| 5h usage readout | — | contains `\d+%` or `unknown` | `#usage-5h` span, existing; no role |
| 7d usage readout | — | contains `\d+%` or `unknown` | `#usage-7d` span, existing; no role |
| Per-model usage readout | — | contains `\d+%` or `unknown` | `#usage-model-week` span, existing; no role |
| Refresh usage button | `button` | `Refresh usage` | existing `aria-label`; unchanged |

### Invariants

- **INV-1**: The masthead never shows a percentage for a bar whose `resetsAt` is before the
  dashboard's clock — from every source state: value from a status post, from a usage call,
  daemon connected, daemon down, polling disabled. → W1, R1
- **INV-2**: The daemon's current 5h and 7d buckets never hold a value that had already passed
  its reset when it arrived — from every source state: no value yet, a status-post value, a
  call value; for both sources as the arriving one. → D3
- **INV-3**: With the status-line writer (ingest worker) and the call writer (poller goroutine)
  recording concurrently, no adopted value is lost and every `usage_sample` row matches the state
  that was broadcast with it. → D7

## Affected Files

### Daemon (daemon-impl)
- `internal/claudecode/usageapi.go` — REQ-1: interpreting a usage response also yields the
  `five_hour`/`seven_day` windows (`utilization`, `resets_at`); a missing, null or unparseable
  window yields none for that bucket without failing the rest.
- `internal/usage/aggregator.go` — REQ-2, REQ-3, REQ-8, REQ-9, INV-2, INV-3: per-bucket adoption
  from two writers, newest arrival wins, past-reset values refused, row only when both known,
  de-dup across sources; the single-writer assumption in `Record`'s comments stops being true.
- `internal/usage/usage.go` — REQ-2, REQ-8: snapshot buckets independently nullable.
- `internal/server/usagepoll.go` — REQ-1, REQ-4, REQ-7: feed call buckets to the aggregator;
  wake at the next known reset instant among 5h, 7d and per-model windows.
- `internal/server/usage.go` — REQ-1, REQ-4: wiring between poller and aggregator.
- `internal/server/usagewire.go` — REQ-2: wire buckets map independently; `sampledAt` null iff
  both null.
- `internal/server/ingest.go` — REQ-2, REQ-3: status-post samples go through the same adoption.
- `internal/server/renderfix_scenarios.go` — `driveUsageKnown`'s 5h/7d `resets_at` (today
  2026-01-01/2026-01-06, already past against the real clock, so REQ-3 would refuse them) move to
  fixed future instants with the same ordering and spacing, so the normalised `usage-known`
  fixture is unchanged in meaning.
- `cmd/musterd/main.go` — `-usage-poll` flag help text names all three bars (one string).

### Web (web-impl)
- `web/src/sessions/usage.ts` — REQ-5, INV-1: a bucket or window whose `resetsAt` is strictly
  before `now` derives the unknown view model.
- `web/e2e/helpers/usageapi.ts` — E1–E4: the fake response's `five_hour`/`seven_day` become
  settable per test (today fixed at a past 2026-08-30 reset, which REQ-3 refuses anyway).

### Existing tests this breaks
- render-tests: `web/render/usage.spec.ts:728` "a stale resetsAt already in the past renders
  verbatim in the other-day form" — asserts the opposite of REQ-5; replaced by R1.
- daemon-tests: `internal/usage/aggregator_test.go` — tests building samples with fixed past
  resets (check each `Record` case's `ResetsAt`) are refused under REQ-3; the persisted-row test
  (`:240`) gains the source/model rules of REQ-8.
- daemon-tests: `internal/claudecode/usageapi_test.go:59` `MissingLimitsKeyIsNilNotError` — its
  body carries a `five_hour` that now yields a bucket.
- daemon-tests: `internal/server/usagepoll_test.go:84` `Tick_SuccessRecordsWindows` — a success
  now also offers buckets to the aggregator.
- e2e-specs: `web/e2e/usage-model.spec.ts` — none expected to break (the fake's past-reset
  buckets are refused); confirm in the Handoff.

## Edge Cases

1. A late status post carrying the pre-reset 100% arrives after the reset and after a fresh call
   value → refused (REQ-3); the fresh value stays → D3
2. A status post arrives after a call value, both with future resets → the status post's value
   wins (REQ-2) → D2
3. The reset-time call returns the old window, its reset still past (server lag) → refused; the
   bar stays `unknown` until the next timed call or a status post → D3 (shared with edge case 1)
4. The reset-time call fails (`unreachable`, `unauthorized`, `no-credentials`) → buckets
   unchanged; the dashboard shows `unknown` past the reset → E3
5. `-usage-poll 0` → no reset-time call; the bar reads `unknown` from the reset until the next
   status post → D5 (no poller, no wake)
6. The call returns `five_hour` but `seven_day` null or missing → 5h adopted, 7d unchanged, no
   row if 7d was never known (REQ-8) → D6
7. Several resets fall within one in-flight call → coalesced to at most one extra call → D4
8. Daemon restart → buckets null, then filled by the start-up call (REQ-6) → E4
9. Daemon down when a reset passes → the bar turns `unknown` from the client clock → W1
10. The render fixture's clock equals a reset instant exactly → not past (strict `<`), still a
    percentage → W2
11. API-key auth: no `rate_limits`, and the call fails → bars stay `unknown` as today → D10
12. Hook loss / `/clear` / pane death → unaffected: account usage is not keyed on a session →
    untested: no session-keyed rule changes
13. A status post and a call value with identical buckets → one row, one broadcast (REQ-9) → D8

## Acceptance Criteria

### Daemon
- **D1**: Interpreting the measured usage response shape yields `five_hour` and `seven_day` as
  buckets with their percent and RFC3339 reset; a missing or null window yields no bucket for it.
- **D2**: For each bucket, the most recently recorded adoptable value is current, whichever of
  the two sources supplied it, in both orders.
- **D3**: A value whose reset is at or before its arrival is never adopted, from every starting
  state (no value, status value, call value) and from both sources (INV-2).
- **D4**: The poller makes a call at each known reset instant of 5h, 7d and every per-model
  window, once per instant, coalesced with any call in flight.
- **D5**: With polling disabled, a reset instant causes no call and the buckets are unchanged.
- **D6**: A call carrying only one bucket adopts that bucket alone and writes no row while the
  other bucket has never been known.
- **D7**: Concurrent recording from the ingest and poller goroutines loses no value and every
  row written matches the snapshot broadcast with it (INV-3); `go test -race` clean.
- **D8**: Identical bucket values offered by the second source send no `usage` message and write
  no row.
- **D9**: A call-sourced row carries `source` `subscription-api` and the last status-line model,
  or empty model fields when none is known.
- **D10**: A failed call (each of `no-credentials`, `unauthorized`, `unreachable`) leaves both
  buckets exactly as they were, known or null (REQ-7).

### Web
- **W1**: `buildUsageBucketViewModel` with a `resetsAt` before `now` returns the unknown view
  model (`unknown`, no fill, no reset text, not warn), for any `usedPct`.
- **W2**: `buildUsageBucketViewModel` with `resetsAt` equal to `now` or later returns the
  percentage view model.

### Render
- **R1**: On the `usage-known` fixture with the page clock pinned past both buckets' resets, the
  5h and 7d readouts read `unknown` with no track markup and no reset suffix (replaces
  `usage.spec.ts:728`).
- **R2**: On the `usage-known` fixture with the clock between the 5h and the 7d reset, the 5h
  readout reads `unknown` while the 7d one keeps its percentage and suffix.

### E2E
- **E1**: With the fake endpoint reporting 5h and 7d values different from the last status post,
  pressing Refresh usage makes the 5h and 7d readouts show the endpoint's percentages.
- **E2**: A status post puts the 5h bar at 100% with a reset a few seconds ahead, the poll
  interval is an hour, and the endpoint reports a lower 5h value with a later reset; after the
  reset, with no click, the 5h readout shows the endpoint's percentage and the endpoint saw a
  request after the reset instant.
- **E3**: As E2 but the endpoint answers 500; after the reset the 5h readout reads `unknown` and
  never `100%`.
- **E4**: A daemon restarted with the fake endpoint reporting 5h and 7d values shows those
  percentages with no status post sent.

### Automated Checks

```checks
D1 make test
D2 go build ./...
D3 make lint
D4 make check-render-fixtures
W1 make web-build
W2 make web-test
W3 make web-lint
R1 make render-test
E1 make e2e
```

### Reviewer-Verified

- **V1**: no `any` types in new web code.
- **V2**: `internal/usage` stays free of Claude-Code-format vocabulary (`five_hour`,
  `utilization`); the mapping happens in `internal/claudecode` and `internal/server`.
- **V3**: no comment in `internal/usage/aggregator.go` still claims a single writer.

## Doc Delta

**usage** (`docs/features/usage/spec.md`, 758 words; may pass 800 — the size-budget review in `TODO.md` § Tooling and docs covers it, so no true sentence is cut to fit) — becomes true:
- § Account-level bars: "The masthead shows a five-hour bar and a seven-day bar, each with a used
  percentage and its reset time, from the status line's rate-limit buckets
  (kb:fact/rate-limits-wire-shape) and the usage call below (kb:fact/usage-api-oauth-shape); each
  bucket takes the newest value whose reset is still ahead."
- § Account-level bars: "After a daemon restart the buckets are unknown until the start-up usage
  call or a status post (kb:adr/usage-no-hydration-across-restart)."
- § Account-level bars, third-bar paragraph: "The daemon calls Claude Code's OAuth usage endpoint
  at start, on the `-usage-poll` interval (zero disables it), at each bar's reset, and when the
  masthead refresh control asks through `kb:anchor/usage.refresh`, coalesced to one in-flight
  call."
- § Honesty: "A bar whose reset has passed reads unknown until a fresh value arrives."

**usage** — stops being true:
- "from the status line's rate-limit buckets (kb:fact/rate-limits-wire-shape)" as the sole source.
- "After a daemon restart the buckets are unknown until the next status post".
- "The daemon polls Claude Code's OAuth usage endpoint on the `-usage-poll` interval, where zero
  disables it, and a masthead refresh control wakes it early through `kb:anchor/usage.refresh`,
  coalesced to one in-flight fetch".

`docs/protocol.md` — as the Protocol Contract above (merged at approval).

## Out of scope

- Nothing.

## Implementation Notes

**Hints (non-binding):**
- The E2E fake's `five_hour`/`seven_day` resets sit in August 2026, so every existing
  `usage-model.spec.ts` run sends refused buckets; that is why none of those tests should move.
- The render normaliser maps timestamps to the fixture epoch plus whole minutes in walk order and
  starts the page clock at the epoch, so R1/R2 pin the clock with `pinClock` the way `:728` does;
  keep the comparison strict (`<`) so a reset equal to the epoch stays a percentage (W2).
- E2E status payloads already default resets to 2099 (`web/e2e/helpers/payloads.ts:734`); E2/E3
  pass `fiveHourResetsAt` a few seconds ahead in epoch seconds.
- `runTicked` (`bgloop.go`) drives the poller from a fixed interval plus the refresh channel; a
  reset wake is a third trigger whose instant changes whenever the aggregator or `ModelScoped`
  takes a new reset.

**Decisions** (written as `proposed` ADRs at approval):
- `kb:adr/usage-all-windows-polled-and-refetched-at-reset` — supersedes
  `kb:adr/usage-model-window-polled-from-oauth-api`: the usage call feeds the 5h, 7d and per-model
  bars, runs at start, on the timer, on refresh and at every known reset; the status line and the
  call both feed 5h/7d and the newest arrival wins per bucket.
- `kb:adr/usage-past-reset-reads-unknown` — a bar whose reset has passed reads unknown on the
  dashboard until a fresh value arrives, and the daemon never adopts a value already past its
  reset (the developer, 2026-10-26: "unknown is fine since we already use it").

`kb:adr/usage-no-hydration-across-restart` keeps its decision (no read-back of rows); only its
summary's "until the next status post" goes stale, which the spec sentence above corrects.

**Doc upkeep (orchestrator):** tick #105 in `TODO.md` § Bugs and move it to
`docs/history/todo-done.md`; flip both ADRs to `accepted` at Completion and mark
`usage-model-window-polled-from-oauth-api` superseded.
