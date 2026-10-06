# Review: launch-inflight-guard

**Plan**: launch-inflight-guard
**Verdict**: needs-changes
**Cycle**: 1
**Gates**: 0 failed
**Parts**: code, browser | skipped: maintainability
**Part verdicts**: code needs-changes, browser approved

_Merged by orch-state.py merge-review; the verdict is computed from the parts and the gate run, never edited by hand._

## Correctness review

# Correctness review: launch-inflight-guard

**Plan**: launch-inflight-guard
**Part verdict**: needs-changes
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

## Browser review

# Browser review: launch-inflight-guard

**Plan**: launch-inflight-guard
**Part verdict**: approved
**Cycle**: 1
**Pack**: kb: pack 6642 words (budget 30000)
**Rig**: `make web-build build` at f3723929 (tree dirty only in `plans/`), driven by a throwaway Playwright spec on the committed `helpers/fixtures.ts` `daemon` fixture — per-test space-bearing scratch data dir, per-test tmux socket path, the stub `claude` from `helpers/daemon.ts`; headless Chromium 1280×720, foreground with `--global-timeout`; spec deleted, no daemon or tmux server left, `git status --porcelain` shows nothing of mine.

Latency seam: the stub has none, so every in-flight cell holds `POST /api/sessions` in the browser with `page.route` and releases it by hand. A press counts as sent when it reaches that route handler. Disabled is read from `button.disabled` plus computed `color`/`background-color`/`cursor`/`opacity`/`display`/`visibility`. The oracles are `GET /api/state`, `daemon.tmuxSessions()` on the scratch socket and the rail-card or tile count, all read after a ≥1.3 s settle.

Gates log (cycle 1): 0 failed lines; `17-e2e` 714 passed, `04-web-build` exit 0 — the app driven is the one that ships.

## Matrix

Hosts: **focus** (the default view) and **tiles** (the Tiles view's masthead New session button) both host the one `#launch-dialog`. The pop-out (`/doc.html`) does not host it.
States: **no data** (fresh daemon, no sessions), **data** (existing sessions or past transcripts), **daemon-down** (scratch daemon SIGTERMed).

Enabled face, every cell below that reads "enabled": `disabled=false`, color `rgb(18,20,28)` on `rgb(242,163,60)`, cursor `pointer`, opacity 1, display block, visibility visible.
Disabled face, every cell below that reads "disabled": `disabled=true`, color `rgb(90,96,112)` on `rgb(34,38,47)` (the `.btn:disabled` tokens), cursor `not-allowed`, opacity 1, display block, visibility visible.

| Req | Host | State | Claim | Result | Evidence |
|-----|------|-------|-------|--------|----------|
| REQ-1 | focus | no data | pointer press, second pointer press + Enter in Title while held → one request, one session | pass | POSTs reaching network 1 after both re-presses; after release cards 1, `/api/state` 1 session, tmux `[muster-1]` |
| REQ-1 | focus | data | real `dblclick()` on Launch, no hold → one more session | pass | POSTs 1; cards 2; `/api/state` `[t2-dbl, existing]`; tmux `[muster-1, muster-2]` |
| REQ-1 | focus | no data | keyboard: Enter on Launch, then Enter and Space again while held | pass | POSTs 1 after the re-presses |
| REQ-1 | tiles | no data | pointer press + second pointer press while held | pass | POSTs 1; after release tiles 1, live tile `t5-held` 1, `/api/state` 1 session |
| REQ-1 | tiles | data | real `dblclick()` with one tile already present | pass | POSTs 1; tiles 2; `/api/state` `[t5-held, t5-dbl]`; tmux `[muster-1, muster-2]` |
| REQ-1 | focus/tiles | daemon-down | second press while the first is out | N/A — with the daemon dead the first press answers at once with a network failure, so no window stays open; the re-enable is the REQ-2 daemon-down rows | |
| REQ-2 | focus | no data | Launch disabled from the press, visibly | pass | before: enabled; at +0 and +1.2 s in flight: disabled face |
| REQ-2 | tiles | no data | same | pass | in flight +1.2 s: disabled face |
| REQ-2 | focus | no data | success closes the dialog and the next open offers Launch | pass | dialog hidden on release; reopened Launch enabled; keyboard focus inside the launched session's terminal (`activeElementInsideTerminal` true) |
| REQ-2 | focus | no data | `model_unrecognized` refusal (custom model, keyboard Enter) then a corrected retry succeeds | pass | in flight: disabled; after the answer `#model-error` shows the refusal sentence, Launch disabled by the invalid mark, not the flag, and focus on `custom-model-input` (existing rule); typing a recognised model → enabled; the retry launches `t3-refused:claude-sonnet-4-5`, 1 card |
| REQ-2 | focus | no data | other refusal (500 `launch_failed`) re-enables Launch and keeps keyboard focus across a tick | pass | in flight: disabled, focus parked on BODY; answered at +0 and +1.2 s: enabled, `document.activeElement` = `launch-button`, `#launch-error` "rb stub failure"; Enter from it retries and launches |
| REQ-2 | focus | no data | Group row "New group…" with no name, a refusal before any request | pass | POSTs 0; `#launch-error` "Enter a name for the new group."; +1.2 s: enabled, focus `launch-button` |
| REQ-2 | focus | daemon-down | daemon SIGTERMed while the press is held → Launch re-enabled, failure surfaced | pass | in flight: disabled; answered +1.2 s: enabled, focus `launch-button`, `#launch-error` "Could not reach musterd."; `role=alert` banner "musterd unreachable — …" visible at 0,46 1280×32; a second Enter: re-enabled again, same error, dialog open |
| REQ-2 | tiles | daemon-down | press with the daemon already down | pass | +1.2 s: enabled, focus `launch-button`, banner visible (the error text is the Notes 3 observation) |
| REQ-2 | tiles | data | — | N/A — the tiles/data dblclick row already covers the success path in that state | |
| REQ-3 | focus | data | Resume tab: pointer press + second pointer press while held → one resume | pass | Launch reads "Resume", in flight: disabled; POSTs 1; after release `/api/state` 1 session, tmux `[muster-1]`, 1 card |
| REQ-3 | tiles | data | Resume tab double press | N/A — the dialog and its controller are the same in both hosts, and REQ-3's guard sits in the shared dispatcher; tiles was measured on the New tab | |
| REQ-3 | any | no data | Resume tab with no past sessions | N/A — no row can be selected, so Launch has nothing to resume | |
| REQ-4 | focus | data | dialog-open `GET /api/models` held, verdict released mid-flight → stays disabled | pass | before press, verdict pending: enabled; in flight: disabled; verdict response landed +1.2 s: disabled |
| REQ-4 | focus | data | model selection changes mid-flight (pointer opus, other… + typed custom, back to sonnet) → stays disabled | pass | disabled at +1.2 s after each change; after release only the one held request launched (`t2-req4:haiku` — the restored model at press time) |
| REQ-4 | focus | data | Resume row selection change mid-flight (Resume branch of the face refresh) → stays disabled | pass | clicking a second row "Past B" while held: +1.2 s disabled, POSTs 1 |
| REQ-4 | focus | data | tab switches mid-flight: New → Resume and select a row → back to New | pass | Resume with a row selected +1.2 s: disabled ("Resume"); back on New +1.2 s: disabled ("Launch"); POSTs 1, one session `t8` |
| REQ-4 | focus | data | selection moved onto an unrecognised preset mid-flight | N/A — an unrecognised preset's radio is disabled (launch-model-check REQ-6), so pointer selection is impossible; the click timed out against the disabled radio | |
| REQ-4 | tiles | data | verdict or selection change mid-flight | N/A — the same controller and recompute serve both hosts; host-independent state measured in focus | |
| Edge 1 | focus | no data | a refused launch re-enables Launch and a corrected retry succeeds | pass | the REQ-2 `model_unrecognized` and 500 rows above |
| Edge 2 | focus | data | Resume double press | pass | the REQ-3 row above |
| Edge 3 | focus | data | verdict or selection change in flight | pass | the REQ-4 rows above |
| Edge 4 | focus | no data | Escape mid-flight, then the answer → the launched session opens | pass | in flight focus on BODY; Escape closed the dialog; after release 1 card, `/api/state` `[t7]`, keyboard focus in its terminal (see Notes 1 for a reopen inside the window) |
| §6 daemon-down surfaced | focus, tiles | daemon-down | the banner is prominent while the dialog shows the failure | pass | `role=alert` display block, visibility visible, opacity 1, full width at y 46 |
| §6 other honesty rules | — | — | — | N/A — this change draws no gauge, percentage, permission mode, Done state, cost or stale value | |
| §7 terminal rules | — | — | — | N/A — this change touches no terminal surface; a launched session's terminal took keyboard focus in every success cell, as before | |
| Placement | focus, tiles | no data | Launch inside the dialog, dialog inside the viewport | pass | both hosts: dialog 280,75.5 720×569 in a 1280×720 viewport; Launch 918.4,606.5 64.6×25 inside the dialog box |

## Issues

### Critical

None.

### Major

None.

### Minor

None.

### Notes

1. **[note]** A dialog reopened while an earlier launch is still in flight measures as follows. Launch is disabled with the disabled face, and the title is empty with no error shown, so nothing on the form says why. A press there sends nothing. When the earlier answer lands it closes the reopened dialog and drops what was typed into it, then opens the earlier session. The disabled half is what REQ-2 specifies. The closing half predates this plan: the success branch closes whatever dialog is open. The window is the daemon's answer time, about 1 s, so this is a candidate for `proposed-backlog.md`, not a change to this run.
2. **[note]** During the flight, keyboard focus sits on `<body>` because Chromium blurs a focused button once it is disabled. This was measured at +0 and +1.2 s. Escape still closes the dialog from there. A refusal returns focus to Launch, and a success moves it into the launched terminal. A baseline Tab from an *enabled* Launch also leaves the dialog for `<body>`, so the focus trap's edge is unchanged.
3. **[note]** In the Tiles view, pressing Launch with the daemon already down shows "Choose a directory to launch into." rather than "Could not reach musterd.". The dialog could not browse, so no directory was set and the request is never made. The masthead banner is visible beside it. This is not this plan's code.
4. **[note]** The Group row's "New group…" was chosen with `selectOption`, which is not a real input path. That cell measures Launch after the refusal, not whether the select is operable.
5. **[note]** For the daemon-down mid-flight cell, the daemon was SIGTERMed while the browser held the request. On release, the request failed at connect, not mid-response. A response cut off halfway was not measured; the same `finally` clears the flag on both paths.
