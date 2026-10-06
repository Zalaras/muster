# Review: launch-inflight-guard

**Plan**: launch-inflight-guard
**Verdict**: approved
**Cycle**: 2
**Gates**: 0 failed
**Parts**: code | skipped: browser, maintainability
**Part verdicts**: code approved

_Merged by orch-state.py merge-review; the verdict is computed from the parts and the gate run, never edited by hand._

## Correctness review

# Correctness review: launch-inflight-guard

**Plan**: launch-inflight-guard
**Part verdict**: approved
**Cycle**: 2
**Pack**: kb: pack 19022 words (budget 30000)

Scope: this is a full cycle, not a delta re-review, because cycle 1 carried an agent-tagged Major. Since `review_commits[1]` (`0260a7c1`), the only change outside `plans/` is one new E2E test in `web/e2e/launch.spec.ts` (`3897b456`). `git diff 0260a7c1..HEAD -- web/src internal cmd` is empty. R1, R2 and the hard rules were therefore re-read against the same source cycle 1 reviewed, which is the plan's full diff against `main`.

## Requirements

| Req | Implemented | Tested | Status |
|-----|-------------|--------|--------|
| REQ-1 | Yes. `submit()` returns early while `launchInFlight` is set and sets it before the first `await` (`web/src/features/launch.ts:594-604`). | Yes. E1 sends two synchronous clicks and asserts one `POST /api/sessions`, one card and one daemon session. It was red at authoring and is green in `18-E1.log`. | pass |
| REQ-2 | Yes. The flag clears in a `finally`, so success, refusal, the pre-request validation return and a throw all clear it. Success still closes the dialog in `dispatchSubmit` and `submitNew`. | Yes, now in full. E1 covers the enabled state after a success. The new cycle 2 test covers a non-model refusal: Launch is re-enabled, focus is back on the same node and survives a tick, one request was sent, and the retry launches one session. The existing `launch-model-check.spec.ts:46` retry covers the `model_unrecognized` path. The fix log shows the new test goes red when `restoreLaunchFocus` is made a no-op. | pass. Cycle 1 Major 1 is resolved. |
| REQ-3 | Yes. The guard wraps `dispatchSubmit`, the only caller of `resume.submit`. | By placement, per plan edge case 2 and R1. | pass |
| REQ-4 | Yes. The model-row render writes `state.invalid \|\| launchInFlight` (`web/src/render/launch.ts:229`). The Resume branch writes `!resume.hasSelection() \|\| launchInFlight` (`web/src/features/launch.ts:378`). No third writer exists. | By reading, per plan edge case 3 and R2. The cycle 1 browser review also measured it live with held requests. | pass |
| DIAG | `kb:diagram/web-components`, plus the launch spec's inline sequence diagram. `kb for web/e2e/launch.spec.ts` names no diagram. | — | pass. No module was added or moved. The new test changes no diagram. |

## Build & Tests

E2E tests: pass (715/715) · Daemon tests (race): pass · Web tests: pass (2404/2404) · Daemon build: pass · Web build: pass · Lint: pass (golangci-lint 0 issues, web lint clean, e2e-lint clean). All of these were read from `$GATES_LOG_DIR` (`gates-launch-inflight-guard-c2`, 0 failed lines).

- The E2E sweep shows no `✘`, failure or retry. The new test passed in it (`launch.spec.ts:1195`).
- The `FAIL` matches in the logs are package names such as `test/rig/failapi` and the contrast check's "0 failures".
- The contrast, versions, kb-check, dead-refs, features-scope, comment-checks and comment-ledger lines are clean.
- `16-size.log` warns that `features/launch.ts` has 796 lines. That warning belongs to review-maintainability.

## Acceptance Checks

| ID | Command | Result |
|----|---------|--------|
| E1 | `cd web && npx playwright test launch.spec.ts -g 'in flight'` | pass (`18-E1.log`: 1 passed) |
| W1 | `make web-lint` | pass (`06-web-lint.log`: 302 files, no fixes) |
| W2 | `make web-test` | pass (`05-web-test.log`: 2404 passed) |
| W3 | `make web-build` | pass (`04-web-build.log`: built) |
| E2 | `make e2e` | pass (`17-e2e.log`: 715 passed) |
| DOC | doc upkeep + Doc Delta vs what shipped | pass. The `TODO.md` entry is removed and appears ticked in `docs/history/todo-done.md` under the same heading. Neither log has a `deviation:` line, and `kb ls --feature launch --status proposed` is empty, so no ADR is owed. The only `doc-delta:` line says "none". `doc-delta.md` now carries the cycle 1 Major 2 wording, which is true of the code: a `model_unrecognized` refusal leaves `state.invalid` set, so Launch stays disabled until the selection changes. The focus-hand-back line is true as measured. See Note 2 for its scope. |

## Reviewer-Verified Criteria

| ID | Criterion | Result | Evidence |
|----|-----------|--------|----------|
| R1 | Guard set in the shared dispatcher before the New/Resume branch, cleared on every exit path | pass | `submit()` checks the flag, sets it, then runs `try { await dispatchSubmit() } finally { setLaunchInFlight(false); restoreLaunchFocus(...) }`. `dispatchSubmit` holds the group check and both the New and Resume branches. The form's submit listener (`:702`) is the only caller of `submit()`. Nothing else calls `dispatchSubmit`, `submitNew` or `resume.submit`. This is unchanged since cycle 1. |
| R2 | Neither existing writer can re-enable Launch while the flag is set | pass | `setLaunchInFlight` writes no DOM. It calls `refreshDialogFace`, which reaches one of the two writers, and both OR the flag in. In a `model_unrecognized` refusal, `updateModelRowState(true)` runs while the flag is still set, so Launch stays disabled. When the flag clears, Launch stays disabled on `state.invalid`. `restoreLaunchFocus` returns early unless focus is on `<body>` and Launch is enabled, so it leaves the forced focus on the invalid control alone. This is unchanged since cycle 1. |

## Hard-Rule Checklist

| # | Rule | Result |
|---|------|--------|
| 1 | Adapter boundary | pass. The change is web-only and holds no Claude Code format knowledge. |
| 2 | No terminal-output state parsing | pass |
| 3 | Non-blocking hook handler | pass. No hook code changed. |
| 4 | tmux via `-L muster`, no `resize-pane` sizing | pass. No tmux code changed. The test uses the per-test `daemon` fixture. |
| 5 | No payload logging | pass |
| 6 | Empty-gauge honesty | pass. The change draws no gauge. |
| 7 | Identity on tmux target | pass |
| 8 | No settings trespass | pass |
| 9 | No real `claude` outside canary/probes | pass. Both new tests run against the stub `claude` through the `daemon` fixture. |

## Issues

### Critical

None.

### Major

None.

### Minor

None.

### Notes

1. **[note]** The new test's synthesized refusal uses an error code this route never sends (`web/e2e/launch.spec.ts:1213`). The Protocol Contract's 500 for `POST /api/sessions` is `launch_failed`, not `internal`. The client branches only on `model_unrecognized`, so any other code exercises the same `showError` path and the test still proves REQ-2 and the focus hand-back. If the spec is touched again, use `launch_failed`. The `internal` code at `:681` comes from an older test on a different route.
2. **[note]** This is for doc-reconcile. `restoreLaunchFocus` returns focus to Launch only when focus has fallen to `<body>`. If the developer moves focus elsewhere, for example into Title, while the request is out, a refusal leaves focus where they put it. The staged sentence "When Launch held focus at the press, a refusal that lifts the hold hands focus back to it" is true for the ordinary case. A promoted clause should not promise more than that, so "hands focus back to it if focus has not moved" is the exact scope.
3. **[note]** Cycle 1 Note 1's stale comments are still present. They still credit `submit()` with work that `dispatchSubmit` and `submitNew` now do:
   - `web/src/features/launch.ts:510-512` says `submit()` decides New vs. Resume.
   - `web/src/features/launch.ts:151`, `:187`, `:190` and `:258` credit `submit` with the launch-time refusal and the `forceFocusInvalid` guard.
   - `web/src/render/launch.ts:201` names `submit` as the caller that passes `forceFocusInvalid`.
   - `web/src/features/launchresume.ts:76` says `submit()` calls `resume.submit`.

   These belong to the comment pass, not to this review.
4. **[note]** Cycle 1 Note 2 still applies to doc-reconcile. The two "stops being true" lines are word-budget cuts, not behaviour changes. `doc-delta.md` already records this under its reconcile notes.
