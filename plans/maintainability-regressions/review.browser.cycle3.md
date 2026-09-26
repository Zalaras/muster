# Browser review: Maintainability Regressions

**Plan**: maintainability-regressions
**Verdict**: needs-changes
**Cycle**: 3
**Pack**: kb: pack 16131 words (budget 20000)
**Rig**: `make web-build build` at 8106dee (the only dirty file was the orchestrator's `orchestration-state.json`). Scratch daemons came from the committed `web/e2e/helpers` (`startDaemon`), with data dirs `$TMPDIR/muster e2e-XXXX` (the path contains a space) and tmux `-S <dataDir>/tmux.sock`. `claude` was the shared E2E stub, never the real binary. Headless Chromium ran at 1280×720. One throwaway spec (21 probe tests) was deleted afterwards. `git status --porcelain` shows nothing of mine (only the orchestrator's state file and the sibling reviewers' part files). No `musterd` or `tmux` process is left running, and no scratch data dir remains.

Gates log (cycle 3): every line is green. `16-e2e` passed 462, and `04-web-build` is clean apart from the usual chunk-size warning, so the app I drove is the one that will ship.

What changed since cycle 2 (3c2b8c0..8106dee):
- Web: `submit()`'s `model_unrecognized` branch now calls `updateModelRowState(true)`. `renderModelRowState` then focuses the invalid control whenever `state.invalid && (launchHadFocus || forceFocusInvalid)`.
- Daemon: comment-only changes to three files.
- Spec: two changes to `launch-model-check.spec.ts`.

So this cycle re-measures every focus cell, in every submit path, in both hosts. It adds cells for the new guarantee: a verdict from the dialog-open request or a restore never moves focus, and a stale refusal is ignored. It also re-runs a regression subset of the non-focus cells. Where I stubbed a response body, the cell says so.

## Matrix

Hosts: **focus** means the dialog was opened from Focus view. **tiles** means it was opened after pressing `#view-tiles-btn` (`aria-pressed=true`). **pop-out** is `/doc.html`, which has no launch dialog, so every pop-out cell is N/A.

| Req | Host | State | Claim | Result | Evidence |
|-----|------|-------|-------|--------|----------|
| Focus after refusal (Fix Attempt 2) | focus, tiles | data | Enter in Title with a refused custom model moves focus to the invalid custom input | pass | `activeElement` = `INPUT#custom-model-input`, `aria-invalid=true`, `aria-describedby=model-error`. One `POST /api/sessions` |
| Keeps focus | focus, tiles | data | the moved focus survives a render tick | pass | I marked the node with an attribute, waited 1.5 s, and the same marked node was still `activeElement` |
| Decision A's condition (a11y) | focus, tiles | data | the newly focused control's accessible description is the refusal | pass | `toHaveAccessibleDescription` on `:focus` equals the exact daemon message. The `⚠` glyph is excluded. This answers cycle 2's Note 1 |
| REQ-9 (decision A) | focus, tiles | data | the refusal shows in `#model-error` only | pass | `#model-error` is `block` with the message. `#launch-error` is `[hidden]`, `display:none`, with empty text |
| Focus after refusal | focus, tiles | data | Tab from the invalid input stays in the dialog, and Shift+Tab returns | pass | Tab went to `INPUT[name=permission-mode][value=auto]` with `inDialog=true`. Shift+Tab went back to `#custom-model-input` |
| REQ-8 | focus, tiles | data | Enter in the invalid custom input cannot submit | pass | 0 POSTs in 600 ms |
| REQ-9 / cycle 1 Major 1 condition | focus, tiles | data | editing the text clears the mark, and no stale text is left | pass | after Backspace: `customInvalid=null`, both errors `H/none`, Launch enabled, focus stays on the input |
| Focus after refusal (regression) | focus, tiles | data | a pointer click on Launch moves focus to the invalid custom input | pass | `activeElement` = `INPUT#custom-model-input`. The same node was still focused after 1.5 s |
| Focus after refusal (regression) | focus, tiles | data | Tab to Launch, then Enter, moves focus to the invalid custom input | pass | before: `BUTTON#launch-button`. After: `INPUT#custom-model-input` |
| Focus after refusal (Fix Attempt 2) | focus, tiles | data | Enter on a radio (the permission-mode `plan` radio, focused by pointer) submits, and focus moves to the invalid custom input | pass | 1 POST. `activeElement` = `INPUT#custom-model-input` |
| Focus after refusal (Fix Attempt 2) | focus, tiles | data (open-time verdict stubbed `unchecked` for all, stub refuses fable) | Enter in Title with a preset refused at Launch moves focus to the invalid radio | pass | `activeElement` = `INPUT[name=model][value=fable]` (`fable:CI`). Its accessible description is the fable sentence. The same node was still focused after 1.5 s |
| REQ-8 | focus, tiles | data | ArrowRight off the refused fable clears the mark and disables fable | pass | `fable:D other:C`, both errors `none`, Launch enabled |
| Dialog-open verdict leaves focus alone | focus, tiles | data (models held until fable was selected) | focus in Title stays in Title | pass | `pre = post = INPUT#title-input`, same node after 1.5 s, `fable:CI` |
| Dialog-open verdict leaves focus alone | focus, tiles | data (held) | focus on the checked fable radio stays there | pass | same node |
| Dialog-open verdict leaves focus alone | focus, tiles | data (held) | focus on Cancel stays there | pass | same node, `BUTTON#cancel-button` |
| Dialog-open verdict, Launch focused | focus, tiles | data (held) | the verdict disables a focused Launch | pass (by design) | focus moved from `BUTTON#launch-button` to `INPUT[value=fable]`, the pre-existing `launchHadFocus` branch. Without it, focus would drop to `BODY`. See Note 1 |
| Restore verdict leaves focus alone (REQ-6 / edge 11) | focus | data (recent seeded with `zephyr-probe`; `/api/models` stubbed so zephyr-probe is `unrecognized`, held) | the restored non-preset is marked, and focus is not moved | pass | `pre = post = INPUT#title-input`, same node. The custom input is `aria-invalid=true`. `#model-error` holds the zephyr-probe sentence. Launch disabled |
| REQ-13 + dialog-open focus rule | focus, tiles | data (POST held on a refused custom model; Escape; reopen with models held; fable selected, then marked by its open-time verdict; Title clicked) | a stale refusal from the cancelled dialog changes nothing | **FAIL** | the verdict is correctly dropped: `#model-error` still holds the fable sentence, not the custom one. But focus moved from `INPUT#title-input` to `INPUT[name=model][value=fable]` (`sameNode=false`). Reproduced in both hosts, on two runs each (browser Minor 1) |
| REQ-13 | focus, tiles | data (POST held; Escape; dialog left closed) | a stale refusal into a closed dialog moves no visible focus | pass | `activeElement` stays `BUTTON#new-session-button`, `activeInDialog=false` |
| REQ-13 | focus, tiles | data (the same, then reopened) | the reopened dialog carries no stale mark | pass | `sonnet:C`, `customInvalid=null`, both errors `H/none`, Launch enabled |
| REQ-7 (regression) | focus | data (stub refuses fable and opus) | an unrecognised preset that is not selected is disabled, and its title can be reached | pass | `opus:D fable:D`. `elementFromPoint` at the label centre is the INPUT with `title="Claude Code doesn't recognise this model"`. Label colour `rgb(90,96,112)` = `--disabled-fg` |
| Placed / contained (regression) | focus | data, 1280×720 | `#model-error` sits inside the dialog without overflow | pass | box 297,495–983,521 inside dialog 280,59–1000,661. `scrollWidth 686 = clientWidth 686`, dialog `sh 600 = ch 600`. 11.25 px, `rgb(243,183,183)` = `--banner-fg` |
| INV-4 (regression) | focus | data (`unchecked` for all) | `unchecked` never marks or disables | pass | `sonnet:C`, nothing `D` or `I`, both errors `H/none`, Launch enabled |
| REQ-10 (regression) | focus | data (500) | a non-2xx response marks nothing | pass | same as the row above |
| REQ-10 / edge 1 | focus, tiles | daemon-down (the daemon was killed, and I waited for `requestfailed` on `/api/models`) | nothing is marked or disabled | pass | `sonnet:C`, all others enabled, `#model-error` `H/none`, Launch enabled |
| §6 daemon-down | focus, tiles | daemon-down | surfaced prominently | pass | `#banner` `display:block` at top 46, 1280×32, "musterd unreachable — …". `#launch-error` reads "Could not reach musterd." |
| REQ-10 (decision A keeps other codes) | focus, tiles | daemon-down | Enter in Title sends another code to `#launch-error`, and focus is not moved | pass | `#launch-error` is `block` "Choose a directory to launch into.", `#model-error` `none`, focus stays `INPUT#title-input` |
| Hidden | focus, tiles | all | a `[hidden]` `#model-error` or `#launch-error` computes `display:none` | pass | every reading where the element was `H` also read `none` |
| Reachable at 900×600 / 1280×560 | focus | data | the custom-invalid dialog scrolls to Launch | N/A this cycle: no style or markup changed since cycle 2's pass (`git diff 3c2b8c0..HEAD -- web/src/style.css web/index.html` is empty) | |
| R3 / R4 / design-system §5 tokens, three themes | tiles | data | invalid differs from disabled, tokens only | N/A this cycle: the same (no CSS diff). Cycle 2 measured all three themes | |
| every row | pop-out | — | — | N/A: `/doc.html` has no launch dialog | |
| REQ-1–5, REQ-11, REQ-12, INV-3, INV-5 | — | — | cache, single-flight, atomic wrapper write | N/A: nothing is visible in the browser, and the daemon diff this cycle is comment-only | |
| §7 terminal rules | — | — | — | N/A: the plan touches no terminal surface | |

## Issues

### Critical

(none)

### Major

(none)

### Minor

1. **[web-impl]** **A stale refusal still moves focus.** A `model_unrecognized` refusal from a submit the developer cancelled (Escape while the POST is in flight) moves focus in the reopened dialog. The stale verdict itself is dropped: `applyVerdicts` sees a generation mismatch. But `submit()` still calls `updateModelRowState(true)` unconditionally (`web/src/features/launch.ts`, the `model_unrecognized` branch). So if the reopened dialog's current selection is invalid for its own reason (here, fable marked by the new open-time verdict), focus jumps from wherever the developer put it (Title) onto that invalid control.
   - Measured in both hosts: `pre = INPUT#title-input`, `post = INPUT[name=model][value=fable]`, `sameNode=false`.
   - The window is real in production. The POST's pre-check for an uncached custom model is a ~1 s subprocess.
   - This contradicts REQ-13 ("a verdict that arrives for a model no longer relevant is ignored … a closed dialog"). It also contradicts the rule the fix's own doc comments state: a verdict from the dialog-open request must never steal focus.
   - A fix must make this true: a refusal whose generation no longer matches changes nothing, focus included. For example, force focus only when the refusal was applied to the current store.
   - Nothing in the E2E suite covers this path. `renderModelRowState` has no unit test, so the regression check needs an E2E like this probe (POST held, Escape, reopen onto an invalid selection, release, assert the focused node is unchanged).

### Notes

1. **[note]** **A dialog-open verdict does move focus in one case.** When the open-time verdict marks the selected preset invalid while Launch has focus, focus moves from Launch to the invalid radio. This is the cycle 1 `launchHadFocus` fix; without it, focus would drop to `BODY`. That is correct behaviour, but two statements overclaim it. The fix's doc comments in `web/src/render/launch.ts` and `web/src/features/launch.ts`, and the new comment in `web/e2e/launch-model-check.spec.ts` (the E2 test), say a dialog-open verdict "must never move focus, wherever it already is". The orchestrator's brief for this cycle says the same. Wording is review-work's territory.
2. **[note]** Cycle 2's Note 1 is resolved. Enter in Title now moves focus to the invalid control, whose accessible description is the refusal (measured for both the custom input and a refused preset radio). So every launch-time refusal path now has its announcement.
3. **[note]** Cycle 2's Note 3 (Launch stays enabled during an in-flight POST) predates this plan. I did not re-measure it this cycle, because nothing in the diff touches it.
