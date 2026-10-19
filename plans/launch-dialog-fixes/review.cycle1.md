# Review: launch-dialog-fixes

**Plan**: launch-dialog-fixes
**Verdict**: needs-changes
**Cycle**: 1
**Gates**: 0 failed
**Parts**: code, browser | skipped: maintainability
**Part verdicts**: code needs-changes, browser approved

_Merged by orch-state.py merge-review; the verdict is computed from the parts and the gate run, never edited by hand._

## Correctness review

# Correctness review: launch-dialog-fixes

**Plan**: launch-dialog-fixes
**Part verdict**: needs-changes
**Cycle**: 1
**Pack**: kb: pack 20751 words (budget 30000)

## Requirements

| Req | Implemented | Tested | Status |
|-----|-------------|--------|--------|
| REQ-1 | Yes. `submitNew` force-focuses only when `appliedToCurrentStore && selectedModel() === model` (`web/src/features/launch.ts:600`). `applyVerdicts` still writes the refusal whatever the selection, so the refused model stays marked | Yes. E2E "a late refusal of a model no longer selected leaves focus where it is (REQ-1)" (`launch-model-check.spec.ts:537`) asserts the same Title node keeps focus and A's mark stays. It also checks that B, selected again, shows its mark and blocks Launch. Red at authoring, green in 18-E1.log | pass |
| REQ-2 | Yes. `knownRepos` is filled by `refreshKnownRepos()` at controller init (`launch.ts:672`), by `initOpen`'s own fetch (`:497`) and by `finishLaunch` on both New and Resume success (`:609-613`). `resetForm` applies `initialRestore(touched, knownRepos[0])` before `renderAll`/`showModal` (`:545`, `:485-488`) | Yes. E2E "the dialog opens showing … before its own fetch returns (REQ-2)" holds the open's repos and browse requests (`heldRepos > 0`). E2E "a launch made through the dialog refreshes what the next open restores" pins the `finishLaunch` refresh with no reload in between | pass |
| REQ-3 | Yes. `ok` applies `initialRestore`. `failed` applies `defaultRestore(touched)` before the browse-root fallback (`launch.ts:520`). `superseded` does nothing. The touched filter is set only from DOM events | Partly. `ok` and the touched filter are covered by the existing E9 race test and by the unit tests of `initialRestore`/`defaultRestore`. The `failed` branch's new reset of held values has **no test that fails without it**: see Major 1 | fail (coverage) |
| DIAG | `kb:diagram/web-components`, the only diagram `kb for` names for `launch.ts` and `launchrestore.ts`. No module or import edge changed, and the features/ module counts still hold | — | pass |

## Build & Tests

E2E tests: pass (964, full suite: the gate ran `make e2e` unscoped) · Daemon tests (race): pass (26 packages ok) · Web tests: pass (2778 across 96 files) · Daemon build: pass · Web build: pass · Lint: pass (golangci-lint 0 issues; web lint clean) · all read from `$GATES_LOG_DIR` (`gates-launch-dialog-fixes-c1`, summary 22 lines, 0 failed, 1 warn-only)

## Acceptance Checks

| ID | Command | Result |
|----|---------|--------|
| build | `go build ./...` | pass |
| test | `make test-race` | pass |
| lint | `make lint` | pass |
| web-build | `make web-build` | pass |
| web-test | `make web-test` | pass |
| web-lint | `make web-lint` | pass |
| contrast | `make contrast` | pass (0 failures in all three themes) |
| features-inventory | `features_inventory` | pass |
| versions | `make check-versions` | pass |
| e2e-honest | `! rg -n 'test\.(skip\|fixme\|only)\(' web/e2e` | pass |
| kb-check | `make check-kb` | pass (611 records, 0 problems) |
| e2e-lint | `make e2e-lint` | pass |
| features | `go tool kb scope --plan launch-dialog-fixes --touch` | pass (launch) |
| comments | `comment-checks.py --gates` | pass |
| comment-ledger | `go run ./tools/commentpass verify launch-dialog-fixes` | pass |
| size | `size-warn.sh --changed` | WARN (`launch.ts` 850 lines), never fails. This line belongs to review-maintainability |
| e2e | `make e2e` | pass (964 passed) |
| E1 | `cd web && npx playwright test launch-model-check.spec.ts launch-defaults.spec.ts -g 'late refusal\|before its own fetch'` | pass (2 passed) |
| W1 | `make web-lint` | pass (deduped to web-lint) |
| W2 | `make web-test` | pass (deduped to web-test) |
| W3 | `make web-build` | pass (deduped to web-build) |
| E2 | `make e2e` | pass (deduped to e2e) |
| DOC | doc upkeep + Doc Delta vs what shipped | pass. Both TODO entries moved to `docs/history/todo-done.md` under `#### Launch dialog`. `kb:adr/launch-restore-from-last-known-repos-at-open` is `accepted` (correct on the /fix track, fix SKILL §doc-upkeep), carries `refs: [plan:launch-dialog-fixes]` and describes what shipped. No `deviation:` or `doc-delta:` lines appear in the logs. Each Doc Delta clause holds in the code: the open shows the last-fetched list's values, the open's fetch corrects untouched fields, and a late refusal moves focus only while its model is selected. The "stops being true" target is spec line 51 ("default to the directory's last-used values; a value picked before they arrive is kept") together with line 67 ("Focus moves to the invalid control regardless of where it was"), which the second clause narrows |

## Reviewer-Verified Criteria

| ID | Criterion | Result | Evidence |
|----|-----------|--------|----------|
| RV1 | The open-time restore still goes through `initialRestore`'s touched filter; no second copy of that decision | pass | `restoreFromKnownRepos` calls `initialRestore(touched, first)` (`launch.ts:487`). `initialRestore` and `defaultRestore` both delegate to the one private `untouchedOnly` (`launchrestore.ts:50-68`). `rg 'touched\.(model\|mode\|effort)' web/src/features/launch.ts` finds only the four DOM-event writers (`:726-744`) and no reader that decides a restore |

## Hard-Rule Checklist

| # | Rule | Result |
|---|------|--------|
| 1 | Adapter boundary | pass. Web-only diff with no Claude Code format fields (`rg hook_event_name\|rate_limits\|permission_mode\|session_id` finds nothing in the touched files) |
| 2 | Terminal-output state parsing | pass. Not touched |
| 3 | Blocking hook handler | pass. No daemon change |
| 4 | Bare tmux / resize-pane | pass. No tmux |
| 5 | Payload logging | pass. No logging added |
| 6 | Empty-gauge dishonesty | pass. No gauge. Absent remembered values fall back to the documented defaults through `repoRestore` |
| 7 | Session identity on `session_id` | pass. Not touched |
| 8 | Settings trespass | pass. Not touched |
| 9 | Real `claude` outside canary/probes | pass. The E2E tests use the stub `claude` from `helpers/daemon.ts` |

## Issues

### Critical

None.

### Major

1. **[e2e-specs]** REQ-3's `failed` branch has no test that fails without the new reset. The code is `applyRestore(defaultRestore(touched))` (`web/src/features/launch.ts:520`), and it is the only thing that clears a vanished recent's held values. The plan's Edge Case 3 ("the held values show at open, then `failed` returns them to the defaults → E2 (the existing deleted-recent test)") and test-specs' Coverage row both rely on E12 (`launch-defaults.spec.ts`, "with the most recent Recent's directory deleted…"). E12 cannot exercise this path:
   - It seeds through `launchSession`, which is `page.request.post` (`helpers/session.ts:171`), *after* `page.goto`.
   - `knownRepos` is written only by `refreshKnownRepos` (at init and in `finishLaunch`) and by `initOpen`. At E12's open it is therefore still the empty list from page load.
   - So `resetForm` shows the defaults, and they are still on screen after `failed` whether or not line 520 exists.
   - `defaultRestore`'s unit tests cover the pure filter but not the controller calling it on `failed`.

   A fix must add an E2E test that fails when line 520 is removed, for example:
   - Seed a recent whose model, mode and effort differ from the defaults (say haiku / default / high).
   - Reload and wait for `networkidle`, so the init fetch knows the recent.
   - Delete its directory and open the dialog. Optionally assert the held values first.
   - After the browse-root fallback lands, assert `sonnet`, `auto` and effort `default` are checked.
   - A variant where one field is changed before the held fetch is released would pin the touched half on this branch too.

   E12 itself should stay unchanged. Its no-history premise is still worth pinning.

### Minor

None.

### Notes

1. **[note]** The open's repos fetch can fail (daemon down, or a transient error), and the fresh list can also come back empty. In both cases `repos = []` and the `!first` branch (`launch.ts:508`) now visibly returns untouched held values to the defaults. Before this plan those fields already showed the defaults. The new behaviour is consistent with REQ-3's "the open's fresh fetch still decides" and with the ADR's consequences. REQ-3 does not name this outcome, though, and no test covers it. Recorded so doc-reconcile does not word the spec as if only `failed` resets.
2. **[note]** The new REQ-1 test takes `startDaemon({})` with no options, while the plan's Fixture plan header says `daemon`. Both are per-test, so the header's substance ("per test, as the file's other tests") holds, and the neighbouring maintainability-regressions tests in the file use `startDaemon`. No change requested.
3. **[note]** `launch.ts` is over the file-length threshold (850 lines). The `WARN size` line and the implementer's reason ("already over before, change localised") are review-maintainability's to judge.
4. **[note]** The e2e gate ran the full suite (964), not a scoped subset. This branch predates `809046c4 docs(gates): scope the E2E gate per cycle` on `main`. The run is a stronger regression signal, not a problem.

## Browser review

# Browser review: launch-dialog-fixes

**Plan**: launch-dialog-fixes
**Part verdict**: approved
**Cycle**: 1
**Pack**: kb: pack 6717 words (budget 30000)
**Rig**: `make web-build build` at 76be2860; one fresh scratch daemon per test from the committed `startScratchDaemon` fixture (data dir `$TMPDIR/muster e2e-<owner>-*`, space-bearing; `-S` tmux socket inside it; shared E2E stub `claude`); headless Chromium 1280x720 driven by a throwaway `web/e2e/zz-browser-review.spec.ts` (deleted). Fixture teardown removed every daemon, socket and data dir; `git status --porcelain` shows nothing of mine. Gates log c1: 0 failed lines (`17-e2e` 964 passed, `18-E1` 2 passed).

## Matrix

Hosts: the launch dialog opens only from the masthead `#new-session-button`, which both Focus and Tiles show. `/doc.html` has no such button (`grep -c new-session-button web/doc.html` → 0), so pop-out cells are N/A. The Focus and Tiles cells produced the same values, apart from the frame timestamps.

"First frame" means the first `requestAnimationFrame` sample in which the dialog is `open`. It was taken through a real pointer click on New session, with `PerformanceResourceTiming` counting `/api/repos` and `/api/browse` responses completed since the click.

| Req | Host | State | Claim | Result | Evidence |
|-----|------|-------|-------|--------|----------|
| REQ-2 | focus | no data | opens on defaults | pass | first frame (t=63 ms, repos 0/browse 0): sonnet, auto, effort default; settled +1.5 s the same |
| REQ-2 | tiles | no data | opens on defaults | pass | first frame (t=76 ms, 0/0): sonnet, auto, default; settled the same |
| REQ-2 | focus | data | first frame shows the remembered values before the open's fetch | pass | seed haiku/default/high via API, reload, open with no route held: first frame t=53 ms, repos 0/browse 0: haiku, manual, high. All open frames show one distinct value set, so nothing flashes |
| REQ-2 | tiles | data | same | pass | first frame t=41 ms, 0/0: haiku, manual, high; one distinct value set across 2.5 s |
| REQ-2 | focus | data | a launch from the dialog refreshes the held list (no reload) | pass | pointer picks opus and effort low, Title typed, Launch clicked. Next open with every repos/browse GET held: first frame t=46 ms shows opus, manual, low |
| REQ-2 | tiles | data | same | pass | first frame t=58 ms, all held: opus, manual, low |
| REQ-2 | focus, tiles | data | Visible: the checked segment is visibly marked | pass | checked label: display block, visibility visible, opacity 1, bg rgb(28,32,41), colour rgb(232,230,225). Unchecked sibling: transparent bg, rgb(178,182,195) |
| REQ-2 | focus, tiles | data / no data | Placed: dialog inside the viewport | pass | dialog box 280,57.5–1000,662.5 inside the 1280x720 viewport. REQ-1 state 280,19.5–1000,700.5, also inside |
| REQ-3 | focus | data | a touched field survives the fresh fetch | pass | effort `max` clicked while repos/browse were held, then released, settled +1.5 s: opus, manual, **max** (untouched model and mode kept their restored values) |
| REQ-3 | tiles | data | same | pass | settled: opus, manual, max |
| REQ-3 | focus | data (recent dir deleted) | `failed` → untouched fields return to the defaults | pass | frames went opus/manual/low → sonnet/auto/default. Settled +2 s: sonnet, auto, default. Launch error empty (the browse-root fallback cleared it, as before) |
| REQ-3 | tiles | same | same | pass | same two value sets, settled on sonnet, auto, default |
| REQ-3 | focus, tiles | data | `superseded` → nothing further | N/A | not driven here. Covered by the existing E10 race spec (gate `17-e2e` green) |
| REQ-2/3 | focus | daemon-down | Daemon-down is surfaced; the dialog does not claim fresh data | pass | `#banner` "musterd unreachable — …" display block, opacity 1, not hidden. First frame showed the held haiku/plan/medium, then settled on sonnet/auto/default with "Could not reach musterd." in the dialog. See Note 2 |
| REQ-2/3 | tiles | daemon-down | same | pass | same banner computed style, the same two value sets, the same error text |
| REQ-1 | focus | data | a late refusal of a model no longer selected leaves focus where it is | pass | A refused (focus went to `#custom-model-input`, the existing rule). B's POST was held. The custom field was retyped to A by keyboard (Meta+A, type) and Title clicked. B was released, then +1.5 s (past a render tick): `document.activeElement` is the same node as before the release (`INPUT#title-input`) |
| REQ-1 | tiles | data | same | pass | same identity check true, `INPUT#title-input` |
| REQ-1 | focus, tiles | data | a refused model stays marked, either way | pass | with A selected: `#model-error` shows A's sentence, display block, opacity 1, Launch disabled. Retyped to B: B's sentence shows, Launch disabled |
| REQ-1 | focus, tiles | data | a refusal of the model still selected still moves focus | pass | C's POST held, Title clicked, C released: +1.2 s the active element is `#custom-model-input` |
| REQ-1 | focus, tiles | no data / daemon-down | refusal focus | N/A | a refusal needs a live daemon answering a POST. The no-data row above is the state this was driven in (a fresh daemon with no recents) |
| REQ-1/2/3 | pop-out | any | — | N/A | `/doc.html` hosts no launch dialog |

## Issues

### Critical
None.

### Major
None.

### Minor
None.

### Notes
1. **[note]** Edge case 1 (the dialog opens before the init `GET /api/repos` has returned) was not measured. Every data-state open above came after `networkidle`. The plan marks this case untested: it falls back to defaults until the fresh fetch lands.
2. **[note]** In the daemon-down state the dialog paints the held list's values for its first frames, then resets the untouched fields to the defaults when its repos fetch fails, with "Could not reach musterd." showing. The plan does not cover this case (REQ-3 covers `failed`, which means the directory is gone, not an unreachable daemon). The banner surfaces the outage prominently, so this breaks no §6 rule. No change requested.
3. **[note]** "Correct value" was checked against the values seeded through `POST /api/sessions` and the pointer picks made in the dialog, not against a re-read of `GET /api/repos`. Those inputs are what the daemon stores as the recents, so this is the same oracle one step earlier.
