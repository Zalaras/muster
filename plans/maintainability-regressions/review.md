# Review: maintainability-regressions

**Plan**: maintainability-regressions
**Verdict**: approved
**Cycle**: 4
**Gates**: 0 failed
**Parts**: code, browser, maintainability
**Part verdicts**: code approved, browser approved, maintainability approved

_Merged by orch-state.py merge-review; the verdict is computed from the parts and the gate run, never edited by hand._

## Correctness review

# Correctness review: Maintainability Regressions

**Plan**: maintainability-regressions
**Part verdict**: approved
**Cycle**: 4
**Pack**: `kb: pack 29631 words (budget 20000)`, WARN over budget (features launch, ingest, connection)

This is a full re-review. The orchestrator's prompt gave no §9 line. The code changed since the cycle 3 review (`7c327a5..HEAD`) was read line by line:
- `9973f3e`: the `appliedToCurrentStore` guard in `submit` (`web/src/features/launch.ts:437-448`), plus doc comments in `features/launch.ts` and `render/launch.ts`.
- `f0ee1aa`: the rescoped E2 comment and the new stale-refusal test in `web/e2e/launch-model-check.spec.ts:445`, plus the `test-specs.md` Fix Attempt 3 and Repairs (fix cycle 3).

Nothing under `internal/`, `cmd/`, `docs/`, `web/src/style.css` or `web/index.html` changed since cycle 3 (`git diff 7c327a5..HEAD --stat` on those paths is empty). So cycle 3's daemon, CSS, markup and doc results still hold for the same bytes. Every requirement and reviewer-verified item was re-checked against that.

## Requirements

| Req | Implemented | Tested | Status |
|-----|-------------|--------|--------|
| REQ-1 parallel `GET /api/models` | Yes. `launchermodels.go` `verdicts()` runs one goroutine per model. Unchanged since cycle 3 | D2, D6 | pass |
| REQ-2 cache keyed on binary identity | Yes. Unchanged | D1, D3, the identity-change-in-flight test | pass |
| REQ-3 error, timeout or no identity gives `unchecked`, not cached | Yes. Unchanged | D4 | pass |
| REQ-4 Launch reads the same cache | Yes. Unchanged | D9 | pass |
| REQ-5 concurrent lookups share one run | Yes. Unchanged | D5, the leader-cancellation test | pass |
| REQ-6 request on open, and again for a restored non-preset | Yes. `openModal` → `requestModelVerdicts(MODEL_PRESETS)`, and `applyModelRestore` | E1, the restore E2E test | pass |
| REQ-7 unselected unrecognised preset disabled | Yes | W1, E1, E3 | pass |
| REQ-8 selected unrecognised: kept, marked, Launch blocked | Yes | W1, E2, E3 | pass |
| REQ-9 custom refusal marks the field; editing clears it | Yes. The refusal goes to `#model-error` only. A refusal merged into the current store forces focus onto the invalid control | W1, E4, the click-path, Enter-from-Title and stale-refusal E2E tests | pass |
| REQ-10 failure marks nothing | Yes | E5, `api/launch.test.ts` | pass |
| REQ-11 atomic replace, 0o700 temp in the same directory | Yes. `AtomicWriteFile`. Unchanged | D7 | pass |
| REQ-12 unchanged content left untouched | Yes. Unchanged | D8 | pass |
| REQ-13 stale verdicts ignored | Yes. `applyVerdicts` drops a stale generation's write. The new `appliedToCurrentStore = generation === modelVerdicts.generation` (`features/launch.ts:441`) is computed before the reassignment and uses the same condition as `launchmodels.ts:71`, so a dropped refusal no longer forces focus either | W3; the new E2E `launch-model-check.spec.ts:445`, proven red against a reverted guard (`test-specs.md` Fix Attempt 3: `Received: inactive` on the node-identity Title locator) | pass |
| DIAG | `kb for web/src/features/launch.ts` names only `kb:diagram/web-components`. This cycle adds no module and no import edge: one inline boolean plus comments. The plan's launch-spec sequence delta is unaffected, since the daemon is unchanged | — | pass |

## Build & Tests

All results were read from `$GATES_LOG_DIR` (`gates-maintainability-regressions-c4`, 0 failed lines):
- E2E tests: pass, 463/463. The plan's 11 `launch-model-check.spec.ts` tests include the new stale-refusal test (#100, 2.3 s).
- Daemon tests (race): pass. 23 packages `ok`, and no `FAIL` or `panic`.
- Web tests: pass, 1855 in 75 files.
- Daemon build: pass (01-build.log is empty).
- Web build: pass (only the usual chunk-size warning).
- Lint: pass. golangci-lint reports 0 issues; Biome checked 253 files clean.

The gate run started at 02:57, after HEAD `35cd840` (02:57:32). The only dirty file is the orchestrator's `orchestration-state.json`. `size` is WARN with 4 hits: `Launch`, the 55-statement test, `New`, and `features/launch.ts` at 606 lines. Those belong to review-maintainability.

## Acceptance Checks

| ID | Command | Result |
|----|---------|--------|
| D0 | `go build ./...` | pass (deduped to baseline `build`, 01-build.log empty) |
| D10 | `make lint` | pass (deduped, 03-lint.log: 0 issues) |
| D11 | `make test` | pass (deduped to `test-race`, 02-test.log) |
| D12 | `make test-race` | pass (02-test.log: 23 `ok`, no FAIL) |
| W0 | `make web-build` | pass (deduped, 04-web-build.log) |
| W4 | `make web-lint` | pass (deduped, 06-web-lint.log) |
| W5 | `make web-test` | pass (deduped, 05-web-test.log: 1855 passed) |
| E0 | `make e2e` | pass (deduped, 16-e2e.log: 463 passed) |
| K1 | `make check-kb` | pass (deduped, 10-kb-check.log: 442 records, 0 problems) |
| baseline contrast / versions / e2e-honest / dead-refs / e2e-lint / features / comments | — | pass: 07 has 0 failures in each of the three themes, 08 says fragments fresh, 09 is empty, 11 has 0 missing of 3203, 12 is clean, 13 finds every changed file in **Features**, 14 says `comment-checks: clean` |
| DOC | doc upkeep + Doc Delta vs what shipped | pass. Both `deviation:` lines end in `→ kb:adr/…`. `launch-check-model-seam-keeps-its-signature` and `launch-model-verdict-parser-in-api-launch` are `proposed`, carry `refs: plan:maintainability-regressions`, and describe what shipped. `launch-model-refusal-shown-in-field-error-only`'s consequence ("focus moves to the invalid control after a refusal") still holds: the guard withholds focus only from a refusal to a dialog that no longer exists. No new `deviation:` or `doc-delta:` line was added this cycle (web-implementation.md Fix Attempt 3: "Decisions: none new"). No Doc Delta sentence mentions focus, and the daemon and docs are byte-identical to cycle 3, when every sentence was verified. The `TODO.md` tick happens at Completion, as the plan says |

## Reviewer-Verified Criteria

| ID | Criterion | Result | Evidence |
|----|-----------|--------|----------|
| R1 | Catalog sentence and argv stay in `internal/claudecode`; the cache sees neutral verdicts | pass | `rg -g '!internal/claudecode/**' -g '!*_test.go' -e '--bare' -e no-session-persistence internal cmd` finds nothing |
| R2 | One cache owner, used by both endpoints | pass | Daemon unchanged since cycle 3, where the only non-test `claudecode.CheckModel` call was `launchermodels.go:87` and `server.go` passed the one `modelsFeature` into `newSessionLauncher` |
| R3 | No new colour token | pass | `style.css` unchanged since cycle 2. `make contrast`: 0 failures |
| R4 | Invalid reads as "selected and wrong" in all three themes | not mine | Measured on screen, so review-browser owns it |
| R5 | No `any` in new web code | pass | `rg 'innerHTML\|: any\b\|as any'` over the four launch web modules finds only English prose ("any other error", "any other verdict response") |
| R6 | Generated script body byte-identical | pass | `settings.go` unchanged since cycle 3. The template is untouched |

## Hard-Rule Checklist

| # | Rule | Result |
|---|------|--------|
| 1 | Adapter boundary | pass. The `permission_mode` hits outside `internal/claudecode` are pre-existing DB column names and comments in `store/` and `session/`, none from this plan |
| 2 | Terminal-output state parsing | pass (none) |
| 3 | Blocking hook handler | pass (no hook handler or registration change) |
| 4 | Bare tmux / resize-pane | pass (no tmux invocation added) |
| 5 | Payload logging | pass |
| 6 | Empty-gauge dishonesty | pass (`unchecked` and "no answer yet" take the unmarked branch) |
| 7 | Session identity on `session_id` | pass (n/a) |
| 8 | Settings trespass | pass |
| 9 | Real `claude` outside canary/probes | pass. Go tests fake `check`/`identify`. The E2E tests use the stub `claude`, and the new test forwards the held POST to the scratch daemon's stub |

## Issues

### Critical

(none)

### Major

(none)

### Minor

(none)

### Notes

1. **[note]** Cycle 3 findings, all resolved:

   | Cycle 3 finding | Fix commit | Verified how |
   |-----------------|------------|--------------|
   | correctness Major 1 `[e2e-specs]`: the E2 comment claimed a dialog-open verdict "must never move focus, wherever it already is" | `f0ee1aa` | Diff read. `launch-model-check.spec.ts:196-203` now says the default path never moves focus off a control that stays enabled, and names the focused-Launch exception. That matches `render/launch.ts:218-220` (`state.invalid && (launchHadFocus \|\| forceFocusInvalid)`). No assertion changed (Repairs row 1). |
   | browser Minor 1 / maintainability Minor 1 `[web-impl]`: a stale refusal forced focus | `9973f3e` | Diff read. `appliedToCurrentStore` is computed before `modelVerdicts` is reassigned, so it compares against the generation `applyVerdicts` checks. It is passed in place of the bare `true`. The regression E2E is proven red against the reverted guard and green with it. The first draft's false green was caught and fixed with `settleFor(page, 1_500)`, and a 10× soak passed (110/110). |
   | correctness Note 4: `test-specs.md` header count | `f0ee1aa` | The header now reads 6+1+1+1 = 9 new tests, with 11 live (9 + 2 pre-existing). That matches the 11 `launch-model-check` lines in 16-e2e.log. |

   Maintainability Note 1 (the focus reason written three times) is also addressed: `render/launch.ts`'s doc is now the single statement, and both `features/launch.ts` comments point to it.
2. **[note]** The new guard checks the generation, not whether the refused model is still selected. One narrow same-generation path remains:
   - With a cold cache, the developer submits custom `zephyr` and, while the POST is in flight, selects the `fable` preset before its own open-time verdict lands.
   - `fable`'s verdict then marks it invalid.
   - The `zephyr` refusal lands in the same generation, so it forces focus onto the `fable` radio.

   The developer has usually just clicked that radio. The forced target is the control that now blocks Launch, and it is described by its own message. No stale text shows: the `zephyr` verdict is keyed on `zephyr` and marks nothing. So REQ-13's "ignored" holds for every visible mark, and no change is requested.
3. **[note]** The new test's closing assertion that `#model-error` still shows fable's message does not isolate the store-write guard. Even without that guard, the `zephyr` verdict would be keyed on `zephyr` and would not mark `fable`. The test's comment does not claim otherwise ("the store write is already known to drop a stale generation"), and W3 covers that half at unit level. The load-bearing assertion is the node-identity focus check, and that one is proven red.
4. **[note]** Carried from cycles 2 and 3, still true, no change requested:
   - Production comments cite the plan's Protocol Contract (`launchermodels.go`, `launcherrors.go`).
   - `launchermodels_test.go` labels dedupe cases "D10".
   - `forceFocusInvalid` has no Vitest coverage. Both directions are covered end to end.
   - design-system §5 cites the plan by name.
5. **[note]** For review-maintainability:
   - `features/launch.ts` is now 606 lines.
   - The new E2E test's title and comments carry review-process labels ("review cycle 3 code Major 1 / browser Minor 1", "web-implementation.md's Fix Attempt 3 repro"), as two earlier titles already do.

## Browser review

# Browser review: Maintainability Regressions

**Plan**: maintainability-regressions
**Part verdict**: approved
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

## Maintainability review

# Maintainability review: Maintainability Regressions

**Plan**: maintainability-regressions
**Part verdict**: approved
**Cycle**: 4
**Pack**: kb: pack 20782 words (budget 20000) — sections: rules 1938 · features 2133 · diagrams 4305 · decisions 6992 · proposed 0 · facts 5237 · lessons 169 · runbooks 2 (WARN: over budget)
**Scope**: 15 files from `git diff main...HEAD -- cmd internal web/src ':!*_test.go' ':!*.test.ts'`, the same set as cycles 2 and 3. Four of them are GENERATED `CLAUDE.md` trailers. The spawn prompt did not declare a delta, so this is a full re-review. Since cycle 3 (`7c327a5..HEAD`), only two source files changed: `web/src/features/launch.ts` (the generation guard on the force-focus, plus comments) and `web/src/render/launch.ts` (doc comment only). The other thirteen are byte-identical to what cycle 3 read, so cycle 3's results for them stand.

## Files

| File | Siblings opened | design: line | Size warnings | Result |
|------|-----------------|--------------|---------------|--------|
| internal/claudecode/settings.go | (cycle 2) server/launcher.go `writeSettings`, selfupdate/apply.go. Unchanged since cycle 3 | yes | — | pass |
| internal/claudecode/modelcheck.go | (cycle 2) version.go, credentials.go. Unchanged | yes | — | pass |
| internal/server/launchermodels.go | (cycle 2) browse.go, usage.go, issue.go, terminal.go. Unchanged | yes | — | pass |
| internal/server/launcher.go | (cycle 2) browse.go, usage.go. Unchanged | yes | funlen `Launch` 83>60. Pre-existing on `main` and unchanged; the reason holds | pass |
| internal/server/launcherrors.go | respond.go. Unchanged | n/a | — | pass |
| internal/server/server.go | composition root. Unchanged | covered | funlen `New` 42>40; the reason in `New`'s doc holds | pass |
| web/src/api/launch.ts | api/reader.ts, api/issue.ts. Unchanged | yes | — | pass |
| web/src/features/launchmodels.ts | launchcrumbs.ts, launchrestore.ts. Unchanged; `applyVerdicts` (`:66-75`) re-read against the new guard | yes | — | pass |
| web/src/features/launch.ts | launchmodels.ts, issue.ts; `navigate()`'s `requestId !== browseRequestId` (`:308`) as the capture-and-compare precedent. Changed since cycle 3: `submit`'s `appliedToCurrentStore` (`:440`), plus comments | no new type, module or seam; Fix Attempt 3 says "no new helper" and pastes the `rg` | filelen 606 (602 at cycle 3, 504 on `main`). The +4 is doc comments; the reason in `web-implementation.md` still holds | pass (Notes 1 and 2) |
| web/src/render/launch.ts | render/mainhead.ts:57, render/tiles.ts:67 (cycle 3). Changed since cycle 3: `renderModelRowState`'s doc only (`:181-202`) | none needed | — | pass (Note 2) |
| web/src/style.css | Unchanged | n/a | — | pass |
| internal/server/launchermodels_test.go (size log only) | — | — | funlen 55>40. The reason in `daemon-tests.md:207-215` holds (verified in cycle 3; file unchanged) | pass |
| internal/claudecode/CLAUDE.md, internal/server/CLAUDE.md, web/src/features/CLAUDE.md, web/src/render/CLAUDE.md | — | generated trailer | — | not reviewed |

## Cycle 3 findings

| Cycle 3 finding | Fix commit | Verified how |
|-----------------|-----------|--------------|
| Minor 1: the launch-time focus force ran outside the generation guard | 9973f3e | `features/launch.ts:440` computes `appliedToCurrentStore = generation === modelVerdicts.generation` before `modelVerdicts` is reassigned at `:441`. `generation` is the value captured before the `await` (`:427`). `:449` passes that flag to `updateModelRowState` in place of `true`. The predicate is the exact negation of `applyVerdicts`'s drop condition (`launchmodels.ts:71`, `if (generation !== store.generation) return store;`). So the force applies iff the write was merged. In the cycle 3 interleaving, g1's stale refusal now gets `false`, and `renderModelRowState:221` moves focus only through the `launchHadFocus` path. That path is the default for every other caller. The regression E2E is in f0ee1aa. |

## Issues

### Critical

None.

### Major

None.

### Minor

None.

### Notes

1. **[note]** The generation predicate is now written twice: `applyVerdicts`'s `generation !== store.generation` (`launchmodels.ts:71`) and `submit`'s `generation === modelVerdicts.generation` (`features/launch.ts:440`). § Design "One owner per concept" says "Two places that must agree will not". I am not filing this, for two reasons. It is one comparison, and the comment at `:436-439` names its twin, so a reader changing one sees the other. If the guard ever grows past a single comparison, deriving the flag from `applyVerdicts`'s own result would give the rule one home. `applyVerdicts` returns the same `store` reference when it drops a write. No change requested.
2. **[note]** This belongs to `review-work`'s comment-truth part, so I am not filing it. `renderModelRowState`'s doc says the focus rule is "stated once here; `features/launch.ts`'s callers reference this comment rather than restate it" (`render/launch.ts:187-188`). It also now describes the caller's internal guard: "the same generation guard `applyVerdicts` applies" (`:199-202`). Meanwhile `submit` restates that guard in two inline comments (`features/launch.ts:436-439`, `:446-449`). The "just above" in `:439` points at `navigate()`, which is 130 lines up (`:304-308`). Cycle 3 Note 1 (a `render/` doc naming its caller) still applies, and more strongly now that it names the caller's guard too.
3. **[note]** Diagram check: no module or dependency edge added since cycle 3. Both changed files keep their imports unchanged (`git diff 7c327a5..HEAD -- web/src` touches no `import` line).
4. **[note]** Cycle 2 Notes 1, 3, 4 and 6 are still as filed, because their code did not move. I am not refiling them.
