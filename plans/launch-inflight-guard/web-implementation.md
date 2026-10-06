# Web Implementation: launch-inflight-guard

**Plan**: launch-inflight-guard
**Mode**: initial
**Pack**: kb: pack 17076 words (budget 30000)

## Changes

| File | Action | What and Why |
|------|--------|--------------|
| `web/src/features/launch.ts` | modified | `launchInFlight` flag owned by the controller; `submit()` is now a guard wrapper (early return, set, try/finally clear) around the former dispatcher, renamed `dispatchSubmit`; flag is an input to `updateModelRowState` and to `refreshDialogFace`'s Resume branch; `restoreLaunchFocus` hands focus back after a refusal. REQ-1, REQ-2, REQ-3, REQ-4 |
| `web/src/render/launch.ts` | modified | `renderModelRowState` takes `launchInFlight` and writes `disabled = state.invalid || launchInFlight`. REQ-4 |

## Decisions

- The guard wraps the whole dispatch before the New/Resume branch (R1), so both tabs share it; the flag clears in a `finally`, covering success, refusal, validation return and a thrown error.
- `#launch-button.disabled` keeps its two writers; each ORs the flag in (R2). `setLaunchInFlight` writes no DOM itself, it calls `refreshDialogFace`, the existing single recompute. `rg 'launchButton.disabled' web/src` shows only those two.
- Measured: with the flag alone, a refused press (500 from `POST /api/sessions`, Launch focused, Enter) left `document.activeElement` as BODY after re-enable; before the change focus stayed on Launch. `restoreLaunchFocus` fixes it: after the fix `AFTER launch-button`. It refocuses only when focus is on body, the dialog is open and Launch is enabled, so a `model_unrecognized` refusal's forced focus on the invalid control is untouched. Throwaway spec used for the measurement, deleted.
- design: no new module or type. Precedent: `renderModelRowState` already moves focus when it disables a focused Launch (`launchHadFocus`), `rg 'launchHadFocus|activeElement' web/src/render/launch.ts`; the in-flight flag follows `modelVerdicts`, a controller-owned `let` read by the recomputes. The new flag adds no focus handoff of its own to the render function; the controller restores it.
- design: `renderModelRowState` gains an eighth positional parameter with a default, matching `forceFocusInvalid`; folding the two into an options object was left alone as out of scope.
- Size warning kept: `features/launch.ts` is 804 lines (threshold 500), already over before this change; +38 lines of guard and focus restore, no split made here.
- Plan Hint alternative `web/src/features/launchmodels.ts` not taken: the flag is not part of the pure verdict derivation.
- doc-delta: none beyond the plan's `## Doc Delta`.

## Handoff

**Build status**: `npx tsc --noEmit` and `npm run build` exit 0; `make web-test` 2404 passed; `make web-lint` clean
**E2E smoke**: no spec authored (the plan's regression test is the proof): `npx playwright test launch.spec.ts -g 'in flight'` 1 passed; full `launch.spec.ts` plus `tiles-launch.spec.ts`, 44 passed
None. A frozen unit test for `renderModelRowState` is unaffected (the new parameter defaults to false).
