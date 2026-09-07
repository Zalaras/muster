# E2E Test Specs: post-worktree-spike-issues

**Plan**: post-worktree-spike-issues
**Mode**: authoring
**Verdict**: harness-only
**Tests created**: 0 (existing test edited in place)
**Live run**: existing regression pin re-run live (see below); full authoring gate is collection-only per harness-only scope

## Tests

No new spec file. Per the plan's `E2E Scope: harness-only` and its own Affected Files list,
the e2e-specs deliverable is a targeted edit to the existing `web/e2e/views.spec.ts` test E7
(REQ-6), not a new test.

| File | Test Name | Requirement | What It Verifies |
|------|-----------|-------------|------------------|
| web/e2e/views.spec.ts | Cmd+\ toggles the view and Opt+Cmd+1 focuses the top-priority session regardless of launch order (E7) | REQ-6 | ⌥⌘1 is pressed only once the rail's own DOM order (`railOrderIds`) reflects attention sort, not once `#rail-sort`'s `<select>` value flips — closing the race the plan diagnosed (`focusNth` reads `railSort`, which only changes on the `prefs` broadcast per INV-6; `selectOption` flips the DOM value immediately, before that broadcast lands) |

## Fixture Changes

No new fixtures. Reused the existing `railOrderIds(page)` helper from
`web/e2e/helpers/railorder.ts` (already used throughout `rail-order.spec.ts`,
`shortcuts.spec.ts`, `terminal.spec.ts` with the same `expect.poll(() => railOrderIds(page))`
pattern) — this is the plan's named oracle (Testable UI Elements table: "Rail card order …
`railOrderIds(page)`").

One new local binding: `sessionB` (previously the return value of `launchSession(...)` for
session B was discarded). Needed so the wait's expected order `[sessionA.id, sessionB.id]` can
be stated without re-deriving B's id another way. No wire payload changed — `launchSession` and
`SessionObject` are untouched, existing helpers.

## Change Made

`web/e2e/views.spec.ts`, test E7 (REQ-6):

1. Added `import { railOrderIds } from "./helpers/railorder";`.
2. Captured B's session object: `await launchSession(...)` → `const sessionB = await launchSession(...)`.
3. After `page.locator("#rail-sort").selectOption("attention")` and its existing
   `toHaveValue("attention")` assertion (kept — it is a true, harmless assertion on the select's
   own state, just no longer the *readiness gate*), added:
   ```ts
   await expect.poll(() => railOrderIds(page)).toEqual([sessionA.id, sessionB.id]);
   ```
   before `page.keyboard.press("Alt+Meta+Digit1")`.

This is the exact fix REQ-6 specifies: gate the chord on the rail's own DOM order, not the
`<select>`'s value. All assertions after the chord (`terminalRegion(page, "prio-a")` visible,
`terminalRegion(page, "prio-b")` count 0) are untouched — REQ-6 requires them preserved verbatim,
and they are (no lines in that block were touched).

Not vacuous (Edge Case 9): manual order here is `[B, A]` (B launched first, then A) and
attention order is `[A, B]` (A has the permission prompt, needs-input sorts first per M1) — the
two orders genuinely differ, so the poll cannot pass by launch-order luck alone; it can only
pass once the daemon's `prefs` broadcast has actually landed and `railSort` has actually flipped
Focus's rendering to attention order.

## Coverage

| Requirement | E2E Tests |
|-------------|-----------|
| REQ-6 | views.spec.ts E7 (edited) |

## Regression Pin — run live at authoring

REQ-6's fix touches an *existing* test asserting *existing* attention-sort behaviour (no new
daemon/web code is needed for this specific assertion — `railOrderIds` and `#rail-sort` already
exist), so per the e2e-specs "regression pins run live at authoring" rule I built and ran it
live rather than leaving it collection-only.

```
make web-build build   # tsc + vite build, then go build -o bin/musterd ./cmd/musterd — succeeded
cd web && npx playwright test e2e/views.spec.ts -g "E7"
  ✓ Cmd+\ toggles the view and Opt+Cmd+1 focuses the top-priority session regardless of launch order (E7)  (2.5s)
  ✓ clicking a strip card at capacity places the promoted tile into the demoted tile's former index (E7, REQ-1)  (2.8s)
  2 passed (3.8s)
```

Then the specific E7 test alone, 4 more consecutive runs (5 total including the run above),
all green, ~0.8s each:

```
npx playwright test e2e/views.spec.ts -g "toggles the view and Opt\+Cmd\+1"
  ✓ ... (775ms)
  ✓ ... (775ms)
  ✓ ... (805ms)
  ✓ ... (810ms)
```

This satisfies the plan's E2 acceptance criterion's repeat-run shape (5 consecutive) for the
one test this step owns; the full `views.spec.ts` file × 5 runs (E2's literal Automated Check)
is the orchestrator's/e2e-validate's job at the pipeline's later step, since other tests in the
file are unaffected by this plan and this step's scope is REQ-6 only.

## Collection gate

```
npx playwright test --list
Total: 281 tests in 25 files
```
No error, no duplicate titles. Ran again after the edit to confirm suite-wide collection still
clean (unchanged count, 281).

## Notes

- Confirmed via `git diff --stat` that only `web/e2e/views.spec.ts` changed under my scope;
  `plans/post-worktree-spike-issues/plan.md`'s `Status: approved` → `in-progress` diff and the
  untracked `orchestration-state.json` are the orchestrator's, not touched here.
- No other test in `views.spec.ts` was changed, per REQ-6's "No other test in the file changes."
- Did not touch `web/playwright.config.ts`, `web/e2e/helpers/fixtures.ts`, or
  `web/scripts/e2e-lint.sh` (gate-integrity boundary; the plan's own harness edits for REQ-4/
  REQ-5/REQ-12 belong to web-impl per the Affected Files table, not this step).
- `helpers/railorder.ts` needed no changes — `railOrderIds` already existed with the exact
  shape the plan's Testable UI Elements table names, from the `order-sidebar` plan.
