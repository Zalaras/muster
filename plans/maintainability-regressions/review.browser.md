# Browser review: Maintainability Regressions

**Plan**: maintainability-regressions
**Verdict**: approved
**Cycle**: 4
**Pack**: kb: pack 16131 words (budget 20000)
**Rig**: `make web-build build` at 35cd840 (the only dirty file was the orchestrator's `orchestration-state.json`). Scratch daemons came from the committed `web/e2e/helpers` (`startDaemon`), with data dirs `$TMPDIR/muster e2e-XXXX` (the path contains a space) and tmux `-S <dataDir>/tmux.sock`. `claude` was the shared E2E stub, never the real binary. Headless Chromium ran at 1280×720. One throwaway spec (26 probe tests, then 8 reruns) was deleted afterwards. `git status --porcelain` shows nothing of mine: only the orchestrator's state file and the sibling reviewers' untracked parts. No `musterd` or `tmux` process is left running, and no scratch data dir remains.

Gates log (cycle 4): every line is green. `16-e2e` passed 463, and `04-web-build` is clean apart from the usual chunk-size warning, so the app I drove is the one that will ship.

What changed since cycle 3 (8106dee..35cd840):
- Web: `submit()`'s `model_unrecognized` branch now passes `appliedToCurrentStore` (`generation === modelVerdicts.generation`) to `updateModelRowState`, instead of `true`. The rest of the web diff is comment wording in `features/launch.ts` and `render/launch.ts`.
- Spec: one new E2E test in `launch-model-check.spec.ts` for the stale refusal.
- There is no CSS, markup or daemon change.

So this cycle does three things:
- It re-measures cycle 3's failing cell.
- It re-measures every focus cell that the new guard could have broken (each fresh-refusal submit path, in both hosts).
- It adds cells for the guard's edges: a stale refusal with the same custom text, and a refusal that lands in the same open after the custom text was edited.

It also re-runs a regression subset of the non-focus cells. Where I stubbed a response body, the cell says so.

## Matrix

Hosts: **focus** means the dialog was opened from Focus view. **tiles** means it was opened after pressing `#view-tiles-btn` (`aria-pressed=true`). **pop-out** is `/doc.html`, which has no launch dialog, so every pop-out cell is N/A.

| Req | Host | State | Claim | Result | Evidence |
|-----|------|-------|-------|--------|----------|
| REQ-13 + focus rule (cycle 3 Minor 1) | focus, tiles | data (POST held on a refused custom model; Escape; reopen with models held; fable selected, then marked by its own open-time verdict; Title clicked) | a stale refusal from the cancelled dialog changes nothing, focus included | pass | POST returned 400. `pre = post = INPUT#title-input`, the same marked node after 1.5 s. The row is still `fable:CI` and `#model-error` still holds the fable sentence. `customInvalid=null`. Two runs per host |
| REQ-13 | focus, tiles | data (the same, but the reopened dialog has `other…` and the same refused text typed in again) | a stale refusal for the exact model now shown marks nothing and moves no focus | pass | `customInvalid=null`. Both errors are `hidden`/`display:none`. Launch is enabled. Focus stays on the same marked Title node |
| REQ-13 | focus, tiles | data (POST held; Escape; dialog left closed) | a stale refusal into a closed dialog moves no focus | pass | `activeElement` stays on the same marked `BUTTON#new-session-button`, with `dialogOpen=false` |
| REQ-13 | focus, tiles | data (the same, then reopened) | the reopened dialog carries no stale mark | pass | `sonnet:C`, `customInvalid=null`, both errors `H/none`, Launch enabled |
| Focus after refusal (Fix Attempt 2 regression) | focus, tiles | data | Enter in Title with a refused custom model moves focus to the invalid custom input, and it stays | pass | `activeElement` is `INPUT#custom-model-input`, still the same marked node after 1.5 s. `aria-invalid=true`, `aria-describedby=model-error`. One POST |
| Focus after refusal (regression) | focus, tiles | data | pointer click on Launch moves focus to the invalid custom input | pass | same as the row above |
| Focus after refusal (regression) | focus, tiles | data | Tab to Launch, then Enter, moves focus to the invalid custom input | pass | before: `BUTTON#launch-button`. After: `INPUT#custom-model-input`, still the same node after 1.5 s |
| Focus after refusal (regression) | focus, tiles | data | Enter on the permission-mode `plan` radio (focused by pointer) moves focus to the invalid custom input | pass | 1 POST. `activeElement` is `INPUT#custom-model-input` |
| Decision A's condition (a11y) | focus, tiles | data | the newly focused control's accessible description is the refusal | pass | `toHaveAccessibleDescription` on `:focus` equals the exact daemon message, with the `⚠` glyph excluded |
| REQ-9 (decision A) | focus, tiles | data | the refusal shows in `#model-error` only | pass | `#model-error` is `block` and holds the message. `#launch-error` is `[hidden]`, `display:none`, with empty text |
| Focus after refusal | focus | data | Tab from the invalid input stays in the dialog, and Shift+Tab returns | pass | Tab went to `INPUT[name=permission-mode][value=auto]` with `inDialog=true`. Shift+Tab went back to `#custom-model-input` |
| REQ-8 | focus | data | Enter in the invalid custom input cannot submit | pass | the POST count stayed at 1 over 600 ms |
| REQ-9 | focus | data | Backspace clears the mark and leaves no stale text | pass | `customInvalid=null`, both errors `H/none`, Launch enabled, focus stays on the input |
| Focus after refusal (preset) | focus, tiles | data (open-time verdict stubbed `unchecked` for all; the stub refuses fable) | Enter in Title with a preset refused at Launch moves focus to the invalid radio | pass | `activeElement` is `INPUT[name=model][value=fable]` (`fable:CI`), with the fable sentence as its accessible description. Still the same node after 1.5 s |
| REQ-8 / REQ-7 | focus, tiles | data (the same) | ArrowRight off the refused fable clears the mark and disables fable | pass | `fable:D other:C`, both errors `none`, Launch enabled |
| Dialog-open verdict leaves focus alone | focus, tiles | data (models held until fable was selected) | focus in Title stays in Title | pass | `pre = post = INPUT#title-input`, the same marked node after 1.5 s, with fable marked |
| Dialog-open verdict leaves focus alone | focus, tiles | data (held) | focus on Cancel stays on Cancel | pass | the same marked node, `BUTTON#cancel-button` |
| Restore verdict leaves focus alone (REQ-6 / edge 11) | focus | data (recent seeded with `zephyr-probe`; `/api/models` held and stubbed so zephyr-probe is `unrecognized`) | the restored non-preset is marked, and focus does not move | pass | `pre = post = INPUT#title-input`, the same node. `customInvalid=true`, `#model-error` holds the zephyr-probe sentence, Launch disabled |
| REQ-13 edge 3 (same open) | focus, tiles | data (A refused; text edited to B; Enter, with the POST held; text edited back to A, which is re-marked from the store; Title clicked; B's refusal released) | a refusal for B, which is no longer the text, moves focus | observed: moves | focus moved from Title to `INPUT#custom-model-input` (value A). `#model-error` shows A's sentence, and B's message is never shown. This is the documented `forceFocusInvalid` rule, not a regression. Two runs per host. See Note 1 |
| REQ-13 edge 3 (same open) | focus, tiles | data (POST for A held; text edited to B, which has no verdict; Title clicked; released) | a refusal for edited-away text marks nothing and moves no focus | pass | same marked Title node. `customInvalid=null`, both errors `H/none`, Launch enabled |
| REQ-7 (regression) | focus | data (the stub refuses fable and opus) | an unrecognised preset that is not selected is disabled, and its title can be reached | pass | `opus:D fable:D`. `elementFromPoint` at the label centre is the INPUT with `title="Claude Code doesn't recognise this model"`. The label colour is `rgb(90,96,112)`, which is `--disabled-fg` `#5a6070` |
| Placed / contained (regression) | focus | data, 1280×720 | `#model-error` sits inside the dialog without overflow | pass | box 297,495–983,521 inside the dialog's 280,59–1000,661. `scrollWidth 686 = clientWidth 686`, dialog `sh 600 = ch 600`. Font 11.25 px, colour `rgb(243,183,183)`, opacity 1, visible |
| REQ-10 / edge 1 | focus, tiles | daemon-down (daemon killed; waited for `requestfailed` on `/api/models`) | nothing is marked or disabled | pass | `sonnet:C` and no `D`/`I` anywhere. `#model-error` is `H/none`. Launch enabled |
| §6 daemon-down | focus, tiles | daemon-down | surfaced prominently | pass | `#banner` is `display:block`, visible, opacity 1, at top 46, 1280×32, reading "musterd unreachable — …". `#launch-error` reads "Could not reach musterd." |
| REQ-10 (decision A keeps other codes) | focus, tiles | daemon-down | Enter in Title sends another code to `#launch-error`, and focus does not move | pass | `#launch-error` is `block` with "Choose a directory to launch into.". `#model-error` is `none`. Focus stays on `INPUT#title-input` |
| Hidden | focus, tiles | all | a `[hidden]` `#model-error` or `#launch-error` computes `display:none` | pass | every reading where the element was hidden (asserted in each of the 34 row-state reads) also read `none` |
| Reachable at 900×600 / 1280×560 | focus | data | the custom-invalid dialog scrolls to Launch | N/A this cycle: no style or markup changed since cycle 2's pass (`git diff 8106dee..HEAD` touches no `.css` or `.html`) | |
| R3 / R4 / design-system §5 tokens, three themes | tiles | data | invalid differs from disabled, using tokens only | N/A this cycle: same reason (no CSS diff). Cycle 2 measured all three themes | |
| every row | pop-out | — | — | N/A: `/doc.html` has no launch dialog | |
| REQ-1–5, REQ-11, REQ-12, INV-3, INV-5 | — | — | cache, single-flight, atomic wrapper write | N/A: nothing is visible in the browser, and there is no daemon diff this cycle | |
| §7 terminal rules | — | — | — | N/A: the plan touches no terminal surface | |

## Issues

### Critical

(none)

### Major

(none)

### Minor

(none)

### Notes

1. **[note]** **A refusal can still move focus after the custom text changed, within the same open.** The sequence:
   - Refuse custom model A.
   - Edit the text to B and submit. While B's pre-check is in flight, edit the text back to A. A is re-marked from the store, since its verdict is still cached there.
   - Click Title.
   - When B's refusal lands, focus moves from Title to the custom input.

   The generation matches, so `appliedToCurrentStore` is true and the forced focus fires. The input is invalid because of A's stored verdict, not B's refusal. Measured in both hosts on two runs.

   This matches the rule `renderModelRowState`'s doc comment states: a launch-time refusal that merged into the current store forces focus regardless. The focus lands on the one control that genuinely blocks the developer's own just-attempted launch in this dialog. It is not the cycle 3 defect (a refusal from a cancelled dialog), which is fixed. The sequence is also contrived: it needs a selection change during the pre-check window, and the one realistic variant, switching to a preset, is blocked because an unrecognised unselected preset is disabled.

   I request no change. If the orchestrator wants REQ-13 edge 3 read as covering focus too, the tighter condition is to also require that the refused `model` equal `selectedModel()` at arrival.
2. **[note]** The committed stale-refusal E2E (`launch-model-check.spec.ts`, the review cycle 3 test) drives the same interleaving as my cycle-3 probe, which failed on 8106dee. It asserts both node identity and `#model-error` after a `settleFor`, so it could have failed for that defect. This is consistent with web-impl's recorded revert check.
3. **[note]** Cycle 3's Note 1 (a focused Launch hands focus to the invalid control when a dialog-open verdict disables it) is now stated accurately in `render/launch.ts`'s doc comment, as the one default-path exception. I did not re-measure it this cycle, because the branch is unchanged.
4. **[note]** Cycle 2's Note 3 (Launch stays enabled while a POST is in flight) predates this plan. I did not re-measure it. It is also what makes Note 1's sequence possible.
