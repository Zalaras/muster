# Web Implementation: Usage Bar Consistency

**Plan**: usage-bar-consistency
**Mode**: initial
**Pack**: kb: pack 23538 words (budget 30000)

## Changes

| File | Action | What and Why |
|------|--------|--------------|
| `web/src/sessions/usage.ts` | modified | `buildUsageBucketViewModel` returns the unknown view model for a bucket whose `resetsAt` is strictly before `now` (REQ-5, INV-1, W1, W2); the unknown view model is now one shared constant |
| `web/e2e/helpers/usageapi.ts` | unchanged (already edited in commit a870801a) | Checked: settable `five_hour`/`seven_day` buckets, `FAR_FUTURE_RESETS_AT`, `requestTimes` cover what the plan asks |

## Decisions

- REQ-5 covers all three bars with one edit: `rg buildUsageBucketViewModel web/src` shows its only production caller is `renderUsageBucket` (`render/masthead.ts`), which `features/usage.ts` calls for 5h and 7d and `renderUsageModelWeek` calls for the per-model window. No render-layer change was needed; `renderUsageBucket` already removes the bar/resets nodes on a known to unknown transition, so the render tick reuses nodes and the model `<select>` is untouched.
- Comparison is strict (`Date.parse(resetsAt) < now.getTime()`), so a reset equal to `now` stays a percentage (W2, edge case 10). An unparseable `resetsAt` (NaN) compares false and keeps the old verbatim path.
- The per-model `.stale` class and `title` (modelScopedError) are unchanged and independent of past-reset unknown.
- Testable UI Elements: every row honoured as-is; no markup changed.
- REQ-1..4, 6..9 are daemon-side; not web work.
- design: no new module, type or seam. Precedent: `buildUsageBucketViewModel`/`renderUsageBucket` is already the single derivation + renderer for the three readouts (`rg -n "buildUsageBucketViewModel" web/src`), so the past-reset rule is added inside it. Hoisted `UNKNOWN_VIEW_MODEL` constant (readonly use, only read by `renderUsageBucket`) so the null and past-reset paths share one shape.
- doc-delta: none beyond the plan's Doc Delta (the "Past a reset" protocol prose and spec § Honesty sentence match what shipped).

## Handoff

**Build status**: `npx tsc --noEmit` and `npm run build` exit 0; `npm run -s lint` clean; `make web-build build` ok.
**E2E smoke**: `npx playwright test e2e/usage-reset.spec.ts e2e/usage-model.spec.ts` → `5 failed, 8 passed (45.9s)`. usage-model.spec.ts 8/8 green. The 5 failures are all usage-reset.spec.ts (E1, E1 focus, E2, E3, E4) and need the daemon half: the binary built at smoke time had no daemon changes yet (daemon-impl running in parallel; no `internal/` file modified in the tree), so call-fed 5h/7d buckets and the reset-time call do not exist yet (E4 received `5hunknown` where the call's `20%` is expected; E1 expected 38% from the call). Re-run after daemon-impl lands.
**Sanctioned test breakage** (web-tests, vitest `4 failed | 3028 passed`), all in `web/src/render/masthead.test.ts`, each builds a bucket with a past `resetsAt` (2026-08-20-ish) against a later `now`, which REQ-5 now renders unknown:
- `renders a rounded percentage, bar and resets text when the bucket is present`
- `removes an existing bar/resets on a known -> unknown transition`
- `orders children lbl, bar, num, resets for a known bucket`
- `applies the 'warn' modifier at or above the 60% threshold and omits it below`
Fix: give those fixtures a `resetsAt` at or after their `now`. Also needed from web-tests: W1/W2 cases in `web/src/sessions/usage.test.ts`; render R1/R2 and replacement of `web/render/usage.spec.ts:728`. No spec locator mismatches.

## Fix Attempt 2 (review cycle 1)

**Failures addressed**: Maintainability Minor 3 — `resetHasPassed` in `web/src/sessions/usage.ts` reimplemented the ISO-instant-to-seconds helper `format.ts` owns.
**Changes made**: `resetHasPassed` is now `remainingSeconds(bucket.resetsAt, now) < 0` (`remainingSeconds` imported from `./format`, the helper `sessions/cache.ts` also uses). Only path exhibiting the defect: `resetHasPassed` is the sole caller of `Date.parse` in `usage.ts` (`rg 'resetHasPassed|remainingSeconds' web/src/sessions`); `buildUsageBucketViewModel` is its one consumer, so masthead 5h/7d/model-week all go through it.
**Evidence**: scratch Vitest (deleted after) with now = 2026-01-01T00:00:00Z: reset equal to now -> `42%` (strict), one second past -> `unknown`, unparsable -> `42%` (NaN compares false, as before). `npx tsc --noEmit`, `npm run build`, `npm run -s lint` exit 0; full `npx vitest run`: 106 files, 3037 tests passed.
**Decisions**: design: reuse `remainingSeconds` (format.ts) rather than a second `Date.parse` comparison; no new helper. No deviation, no doc-delta.
