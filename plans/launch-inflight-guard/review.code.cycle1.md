# Correctness review: launch-inflight-guard

**Plan**: launch-inflight-guard
**Verdict**: needs-changes
**Cycle**: 1
**Pack**: kb: pack 19022 words (budget 30000)

## Requirements

| Req | Implemented | Tested | Status |
|-----|-------------|--------|--------|
| REQ-1 | Yes. `submit()` returns early while `launchInFlight` is set and sets the flag synchronously, before the first `await` (`web/src/features/launch.ts:594-604`). The first press disables Launch inside the same task, so a second synchronous `click()` dispatches nothing. | Yes. E1 sends two synchronous clicks and asserts one `POST /api/sessions`, one card and one daemon session. It went red at authoring with two requests (test-specs.md). | pass |
| REQ-2 | Yes. The flag is set before dispatch and cleared in a `finally`, so success, refusal, pre-request validation return and a throw all clear it. Success closes the dialog inside `dispatchSubmit`, as before. | Partly. E1 covers the enabled half after a success. The existing model-refusal retry test (`launch-model-check.spec.ts:46`, green in the gate run) would go red if the flag never cleared on error. No test drives a non-`model_unrecognized` refusal followed by a retry, or the focus hand-back the implementation added for it. See Major 1. | pass (coverage gap filed) |
| REQ-3 | Yes. The guard wraps `dispatchSubmit`, which is the only caller of `resume.submit`. `launchresume.ts` has no row double-click or Enter path that bypasses `submit()`. | By placement only, per plan edge case 2 and R1. | pass |
| REQ-4 | Yes. Both writers OR the flag in. The model-row render writes `state.invalid \|\| launchInFlight` (`web/src/render/launch.ts:229`). The Resume branch writes `!resume.hasSelection() \|\| launchInFlight` (`web/src/features/launch.ts:378`). `rg '\.disabled\s*='` finds no third writer of `#launch-button`. A verdict arrival, a radio change, a custom-field input, a mode change, a tab switch and a Resume selection change all reach one of those two writers. | By reading only, per plan edge case 3 and R2. The stub has no latency seam. | pass |
| DIAG | `kb:diagram/web-components` (named by `kb for` on both changed source files). The launch spec's inline sequence diagram was also read. | — | pass. No module was added or moved. The inline diagram depicts the daemon-side model check, which this plan did not touch. |

## Build & Tests

E2E tests: pass (714/714) · Daemon tests (race): pass · Web tests: pass (2404/2404, 89 files) · Daemon build: pass · Web build: pass · Lint: pass (golangci-lint 0 issues, web lint clean, e2e-lint clean). All of these were read from `$GATES_LOG_DIR` (`gates-launch-inflight-guard-c1`, 0 failed lines). The `make e2e` sweep shows no failure or retry. The size `WARN` (`features/launch.ts` 796 lines) belongs to review-maintainability.

## Acceptance Checks

| ID | Command | Result |
|----|---------|--------|
| E1 | `cd web && npx playwright test launch.spec.ts -g 'in flight'` | pass (`18-E1.log`: 1 passed) |
| W1 | `make web-lint` | pass (`06-web-lint.log`: deduped to the baseline web-lint line) |
| W2 | `make web-test` | pass (`05-web-test.log`: deduped, 2404 passed) |
| W3 | `make web-build` | pass (`04-web-build.log`: deduped, built) |
| E2 | `make e2e` | pass (`17-e2e.log`: deduped, 714 passed) |
| DOC | doc upkeep + Doc Delta vs what shipped | FAIL. Doc upkeep itself is fine: the `TODO.md` entry is ticked and moved to `docs/history/todo-done.md` under its own heading, neither log has a `deviation:` line so no ADR is owed, and the only `doc-delta:` line says "none". The Doc Delta has one false clause. See Major 2. |

## Reviewer-Verified Criteria

| ID | Criterion | Result | Evidence |
|----|-----------|--------|----------|
| R1 | Guard set in the shared dispatcher before the New/Resume branch, cleared on every exit path | pass | `submit()` checks and sets the flag, then `try { await dispatchSubmit() } finally { setLaunchInFlight(false) }`. `dispatchSubmit` holds the group check, the New branch (`submitNew`) and the Resume branch (`resume.submit`). Every return and every throw inside it passes through the `finally`. The form's `submit` listener is the only caller of `submit()`, and nothing else calls `submitNew`, `dispatchSubmit` or `resume.submit`. |
| R2 | Neither existing writer can re-enable Launch while the flag is set | pass | `setLaunchInFlight` writes no DOM. It calls `refreshDialogFace`, which routes to one of the two writers, and both OR the flag. `renderLaunchButtonFace` sets only the class and label. A `model_unrecognized` refusal calls `updateModelRowState(true)` while the flag is still set, so Launch stays disabled until the `finally`. After that, `state.invalid` keeps it disabled per kb:adr/launch-unrecognized-model-marked-blocks-launch. |

## Hard-Rule Checklist

| # | Rule | Result |
|---|------|--------|
| 1 | Adapter boundary | pass. The change is web-only. |
| 2 | Terminal-output state parsing | pass. None. |
| 3 | Blocking hook handler | pass. No daemon change. |
| 4 | Bare tmux / resize-pane | pass. No tmux use. |
| 5 | Payload logging | pass. None. |
| 6 | Empty-gauge dishonesty | pass. No gauge is touched. |
| 7 | Identity on `session_id` | pass. None. |
| 8 | Settings trespass | pass. None. |
| 9 | Real `claude` outside canary | pass. E1 uses the shared stub through the per-test `daemon` fixture. |

The plan has no design-token surface: no CSS changed and no `hidden` toggles were added. The new test's fixture is the per-test `daemon` fixture, which matches the plan's **Fixture plan** header. The test has no Repairs table to audit, because E2E Validate made no repairs.

## Issues

### Critical

None.

### Major

1. **[e2e-specs]** The implementation shipped behaviour that no test guards, and `doc-delta.md` promotes it to the launch spec. `restoreLaunchFocus` (`web/src/features/launch.ts:606-610`) hands focus back to Launch after a non-`model_unrecognized` refusal. Disabling a focused button drops focus to `<body>`, so without the restore a keyboard user who pressed Launch is left nowhere. The implementer measured this with a throwaway spec and then deleted the spec. If someone removed the function, every test would stay green. REQ-2's "any other error re-enables it" half is also only covered through the model-refusal path.
   - **Fix:** add one test to `web/e2e/launch.spec.ts`. Route `POST /api/sessions` to a non-model error such as a 500, focus Launch, press Enter, and wait for `#launch-error`. Then assert that Launch is enabled and focused. Then unroute, press Launch again, and assert that one session launches.

### Major (`[orchestrator]`, non-blocking)

2. **[orchestrator]** One Doc Delta clause would put a false sentence into the launch spec. The plan's Doc Delta, copied verbatim into `doc-delta.md`, says "a refusal re-enables it". That is false for a `model_unrecognized` refusal. Launch stays disabled until another model is picked, which the spec already states and kb:adr/launch-unrecognized-model-marked-blocks-launch requires. The code is right, so no code change is needed. Only the sentence must change before doc-reconcile promotes it, because as written it contradicts the paragraph above it. REQ-2's own wording makes the same overreach.
   - **Suggested wording:** "Launch is disabled from the press until the daemon answers, and a second press meanwhile sends nothing. A success closes the dialog, and any refusal lifts that hold, though a `model_unrecognized` refusal still blocks Launch until another model is picked."

### Minor

None.

### Notes

1. **[note]** Several code comments still name `submit()` for work that `dispatchSubmit` or `submitNew` now does. After the rename, `submit()` is only the in-flight guard.
   - `web/src/features/launch.ts:510-512`: the comment says "`submit()` is still the one place that decides New vs. Resume". `dispatchSubmit` decides that now.
   - `web/src/features/launch.ts:151`, `:187` and `:190`, plus `web/src/render/launch.ts:201`: these credit `submit` with the launch-time refusal and the `forceFocusInvalid` guard. Both are `submitNew`'s.
   - `web/src/features/launchresume.ts:76`: this says `submit()` calls `resume.submit`. The caller is `dispatchSubmit`.
   - `web/src/features/launch.ts:156`: the new `launchInFlight` flag has no comment, while its neighbour `modelVerdicts` documents its writers and readers.
2. **[note]** The plan's Doc Delta lists two sentences under "stops being true" that are still true: the full hybrid directory-memory sentence and "The dialog checks first, …". They are word-budget cuts of claims the records carry. They are not behaviour changes. Doc-reconcile should treat them as cuts and should not look for code that made them false.
3. **[note]** Plan edge case 4 holds, with one consequence worth knowing. If the dialog is cancelled mid-flight and reopened, the reopened dialog's Launch stays disabled until the first request answers. That is consistent with "a second press meanwhile sends nothing". As before this plan, a success from the first request still closes whichever dialog is open.
