# E2E Test Specs: launch-inflight-guard

**Plan**: launch-inflight-guard
**Mode**: fix (attempt 1)
**Pack**: kb: pack 12875 words (budget 30000)
**Verdict**: pass
**Tests created**: 2
**Live run**: 29/29 passing in launch.spec.ts; soak 450/450 (N=10)

## Tests

| File | Test Name | Requirement | What It Verifies | Live run |
|------|-----------|-------------|------------------|----------|
| web/e2e/launch.spec.ts | a second press on Launch while the first is in flight sends nothing: one session, one card (REQ-1, REQ-2, E1) | REQ-1, REQ-2 | Two synchronous click() calls on Launch send one POST /api/sessions, leave one rail card and one daemon session, and a reopened dialog has Launch enabled | ran-red-at-authoring (below) |

## Deleted Tests

None

## Fixture Changes

No changes needed. The test reuses `trackMutations` from helpers/groups.ts and `settleFor` from helpers/fixtures.ts, and launches with no synthesized Claude Code payloads.

## Coverage

| Requirement | E2E Tests |
|-------------|-----------|
| REQ-1 | the new in-flight test |
| REQ-2 | the new in-flight test (enabled half after the answer); the refusal half is covered by the existing launch-model-check retry test (E2) |
| REQ-3, REQ-4 | none, per the plan's edge cases 2 and 3 (no latency seam; reviewer R1/R2) |

## Handoff

None. The request count is asserted before the card count on purpose: the cards of a two-session launch arrive at different moments, so a card count alone can read 1 transiently. The plan's named failure (card count 2) is therefore reached after the request count in the green case.

## Test Run Output

```
$ cd web && npx playwright test launch.spec.ts -g 'in flight'
  ✘  1 [chromium] › e2e/launch.spec.ts:1153:1 › a second press on Launch while the first is in flight sends nothing: one session, one card (REQ-1, REQ-2, E1) (2.3s)
    Error: one launch request for two presses
    Expected length: 1
    Received length: 2
    Received array:  ["POST /api/sessions", "POST /api/sessions"]
  1 failed
```

## Notes

Red on the double send is the diagnosis holding: nothing in the dialog records an in-flight request. `npx playwright test --list` is clean (714 tests in 49 files) and the e2e lint passes.

## Fix Attempt 1

Review cycle 1, Major 1 `[e2e-specs]`: nothing guarded the focus hand-back after a non-model refusal, and REQ-2's "any other error re-enables it" half was only covered through the model-refusal path.

### Tests

| File | Test Name | Requirement | What It Verifies | Live run |
|------|-----------|-------------|------------------|----------|
| web/e2e/launch.spec.ts | a refused launch (500) re-enables Launch with focus still on it, and the retry launches one session (REQ-2, focus hand-back) | REQ-2 | Launch focused, Enter, `POST /api/sessions` routed to a 500: `#launch-error` shows the message, Launch is enabled, `document.activeElement` is Launch and the tagged node survives a >1 s tick, one request was sent. After unroute, Enter again launches one session and one card | 29/29 passing in launch.spec.ts, soak 450/450 (`make e2e-soak SPEC=launch.spec.ts N=10`) |
| web/e2e/launch.spec.ts | a second press on Launch while the first is in flight sends nothing: one session, one card (REQ-1, REQ-2, E1) | REQ-1, REQ-2 | Unchanged from authoring; now green | passing |

### Proof the new assertion guards the function

With `restoreLaunchFocus` made a no-op (early `return`, `make web-build`), the test fails on the focus assertion and nothing else:

```
Error: focus is back on the Launch button
  -   "id": "launch-button",   +   "id": "",
  -   "node": "launch",        +   "node": null,
  Timeout 15000ms exceeded while waiting on the predicate
```

The source was restored from a copy, `git status` showed only `web/e2e/launch.spec.ts` changed under `web/`, and `make web-build build` was re-run before the final live run and the soak.

### Repairs

None. No existing assertion was deleted, skipped, or weakened.

### Handoff

None.

### Notes

Launch is focused with `locator.focus()` as setup, then activated with a real `keyboard.press("Enter")`, so a focus drop between them is visible. The 500 body uses the daemon's `{error:{code,message}}` envelope. The first throwaway attempt at the proof failed to build (TS6133 unused parameter), so the first run after it tested the unbroken bundle; the proof above is from the second, successful build.
