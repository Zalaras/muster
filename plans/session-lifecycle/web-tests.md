# Web Tests: Session lifecycle robustness

**Plan**: session-lifecycle
**Verdict**: implementation-bug
**Pack**: `kb: pack 21907 words` / `kb: WARN pack exceeds budget of 8000 words` (features=lifecycle,actions,launch,surfaces,ingest)

## Summary

This is the **red-first** pass (Implementation Notes § Red-first): every test below is
written against behaviour that does not exist yet, run against the unmodified tree, and is
expected to fail. No implementation code was touched.

Tests created: 14 | Passing (pre-existing, unaffected): 1572 | Failing (new, expected red): 6

`make web-test` runs to completion and reports exactly these 6 failures — nothing else in
the suite regressed.

## Tests

| File | Test Name | What It Tests | Status |
|------|-----------|---------------|--------|
| `src/render/actionerror.test.ts` | writes the envelope's message and un-hides the alert on a failed action | W2: failure renders the message | **red** (module doesn't exist) |
| `src/render/actionerror.test.ts` | clears the alert when a subsequent action succeeds (message: null) | W2: success clears it | **red** (module doesn't exist) |
| `src/render/actionerror.test.ts` | a later failure replaces an earlier one rather than concatenating | W2: no stacking | **red** (module doesn't exist) |
| `src/render/actionerror.test.ts` | starts hidden with no message | W2: initial state | **red** (module doesn't exist) |
| `src/render/mainhead.test.ts` | disables Resume with a non-empty reason when the session has no bound Claude session id | W3: mainhead Resume, no `claudeSessionId` | **red** (no reason set) |
| `src/render/mainhead.test.ts` | enables Resume with no disabling reason for a dead session with a bound Claude session id | W3: mainhead Resume, bound id | pass (pre-existing `disabled` logic already correct) |
| `src/render/dead.test.ts` | disables Resume with a non-empty reason when the session never bound a Claude session id | W3: dead-surface Resume, no `claudeSessionId` | **red** (no reason set) |
| `src/render/dead.test.ts` | enables Resume with no disabling reason once a Claude session id is bound | W3: dead-surface Resume, bound id | pass (pre-existing `disabled` logic already correct) |
| `src/reader/memory.test.ts` | removes the stored entry for this session id | W4: `forget` removes the key | **red** (`forget` doesn't exist) |
| `src/reader/memory.test.ts` | leaves other sessions' entries untouched | W4: keyed strictly per id | **red** (`forget` doesn't exist) |
| `src/reader/memory.test.ts` | is a no-op when nothing was ever stored for this session id | W4: no-op, not a throw | **red** (`forget` doesn't exist) |
| `src/reader/memory.test.ts` | does not throw when the storage accessor throws | W4: survives a throwing accessor | **red** (`forget` doesn't exist) |

(mainhead.test.ts and dead.test.ts each contribute 2 tests to the table above; the totals
count each file's pair once.)

## Implementation Bugs (as-built gaps this red pass pins)

| Gap | File | Expected (per plan) | Actual (unmodified tree) |
|-----|------|---------------------|--------------------------|
| No visible action-failure surface | `web/src/features/actions.ts:107-140` | REQ-17/W2: a failed End/Resume/Remove renders the envelope's `message` into `#action-error` via `renderActionError(el, message)`, cleared by the next success | `doEnd`/`doResume`/`doRemove` only `console.error`; nothing renders, and `render/actionerror.ts` doesn't exist |
| Resume disabled with no reason | `web/src/render/mainhead.ts:103`, `web/src/render/dead.ts:116` | REQ-17/W3 (narrowed 2026-09-14, `c725880`): Resume disabled for a `claudeSessionId === null` session carries the reason as `title`/`aria-description` | `resumeBtn.disabled` is *already* correctly `true` in this case (pre-existing, not part of this plan — the correction below) but no `title`/`aria-description`/any reason is ever set — the button is silently unusable |
| `muster.reader.<id>` never cleared | `web/src/reader/memory.ts`, `web/src/features/actions.ts:139` (`handleRemoved`) | REQ-17/W4: a `forget(id)` helper removes the key on `sessionRemoved`, tolerant of a throwing accessor | No `forget` export exists; `handleRemoved` never touches `localStorage` |

**Verdict is `implementation-bug`** in the sense the pipeline uses it here: these are the
red-first pins the plan asked for, not a claim that existing code is broken outside REQ-17's
scope. `web-impl` should treat every red test above as its acceptance target for REQ-17.

## Corrections and decisions from the first pass

Both flags below were raised in the first commit (`632d446`) and resolved by the team lead
in `c725880` (plan.md updated accordingly) before this revision.

1. **W3's premise was wrong — corrected.** `resumeBtn.disabled = … ||
   session.claudeSessionId === null` already existed in both `web/src/render/mainhead.ts:103`
   and `web/src/render/dead.ts:116`, pre-dating this plan. REQ-17/W3 now cover only the
   missing *reason* (`title`/`aria-description`), and my test split reflects that: the
   "disabled" half of each pair already passes, only the "non-empty reason" half is red.
   `resumeDisabledReason()` (in both `mainhead.test.ts` and `dead.test.ts`) accepts either a
   native `.title` write or `setAttribute("aria-description"|"title", …)`, since the plan
   deliberately leaves the mechanism open.

2. **W2 placement — settled.** `#action-error` is now static global markup in
   `web/index.html`, immediately after `#banner`, because actions dispatch from the
   mainhead, rail cards and tile footers — a region scoped to one surface would swallow
   failures from the others. The pure toggle is `renderActionError(el: HTMLElement, message:
   string | null)` in `web/src/render/actionerror.ts`, signature aligned to
   `renderBanner(el, visible)` (`web/src/render/banner.ts`) rather than the refs-object shape
   `render/dead.ts`/`render/mainhead.ts` use for driving several elements at once — `banner.ts`
   drives exactly one element too, and already has unit coverage (`banner.test.ts`), so it's
   the closer analogue. `actionerror.test.ts` was reworked to that bare-`el` signature and
   re-confirmed red for the same reason (module missing), not a signature mismatch.

## Test Run Output

```
$ npx tsc --noEmit
src/reader/memory.test.ts(7,3): error TS2305: Module '"./memory"' has no exported member 'forget'.
src/render/actionerror.test.ts(12,35): error TS2307: Cannot find module './actionerror' or its corresponding type declarations.

$ npm test   (= make web-test)
 ❯ src/render/dead.test.ts (21 tests | 1 failed) 45ms
   ❯ renderDeadSurface — Resume disabled reason (REQ-17/W3) (2)
     × disables Resume with a non-empty reason when the session never bound a Claude session id 7ms
 ❯ src/reader/memory.test.ts (22 tests | 4 failed) 76ms
   ❯ forget (REQ-17/W4: clears muster.reader.<id> on sessionRemoved) (4)
     × removes the stored entry for this session id 8ms
     × leaves other sessions' entries untouched 2ms
     × is a no-op when nothing was ever stored for this session id 25ms
     × does not throw when the storage accessor throws (private window / blocked site data — W4's specific case) 1ms
 ❯ src/render/mainhead.test.ts (5 tests | 1 failed) 49ms
   ❯ renderMainhead — Resume disabled reason (REQ-17/W3) (2)
     × disables Resume with a non-empty reason when the session has no bound Claude session id 43ms
 ❯ src/render/actionerror.test.ts (0 test)

FAIL  src/render/actionerror.test.ts [ src/render/actionerror.test.ts ]
Error: Cannot find module './actionerror' imported from
  /web/src/render/actionerror.test.ts
 ❯ src/render/actionerror.test.ts:12:1
     12| import { renderActionError } from "./actionerror";

FAIL src/reader/memory.test.ts > forget (...) > removes the stored entry for this session id
TypeError: forget is not a function
 ❯ src/reader/memory.test.ts:185:5

FAIL src/reader/memory.test.ts > forget (...) > leaves other sessions' entries untouched
TypeError: forget is not a function
 ❯ src/reader/memory.test.ts:196:5

FAIL src/reader/memory.test.ts > forget (...) > is a no-op when nothing was ever stored for this session id
AssertionError: expected [Function] to not throw an error but 'TypeError: (0 , __vite_ssr_import_1__…' was thrown
 ❯ src/reader/memory.test.ts:204:42

FAIL src/reader/memory.test.ts > forget (...) > does not throw when the storage accessor throws (...)
AssertionError: expected [Function] to not throw an error but 'TypeError: (0 , __vite_ssr_import_1__…' was thrown
 ❯ src/reader/memory.test.ts:209:52

FAIL src/render/dead.test.ts > renderDeadSurface — Resume disabled reason (REQ-17/W3) > disables Resume with a non-empty reason when the session never bound a Claude session id
AssertionError: expected '' not to be '' // Object.is equality
 ❯ src/render/dead.test.ts:377:54

FAIL src/render/mainhead.test.ts > renderMainhead — Resume disabled reason (REQ-17/W3) > disables Resume with a non-empty reason when the session has no bound Claude session id
AssertionError: expected '' not to be '' // Object.is equality
 ❯ src/render/mainhead.test.ts:170:58

 Test Files  4 failed | 33 passed (37)
      Tests  6 failed | 1572 passed (1578)

$ npm run build   (= tsc --noEmit && vite build)
src/reader/memory.test.ts(7,3): error TS2305: Module '"./memory"' has no exported member 'forget'.
src/render/actionerror.test.ts(12,35): error TS2307: Cannot find module './actionerror' or its corresponding type declarations.
```
