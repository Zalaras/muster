# Review: maintainability-regressions

**Plan**: maintainability-regressions
**Verdict**: needs-changes
**Cycle**: 3
**Gates**: 0 failed
**Parts**: code, browser, maintainability
**Part verdicts**: code needs-changes, browser needs-changes, maintainability needs-changes

_Merged by orch-state.py merge-review; the verdict is computed from the parts and the gate run, never edited by hand._

## Correctness review

# Correctness review: Maintainability Regressions

**Plan**: maintainability-regressions
**Part verdict**: needs-changes
**Cycle**: 3
**Pack**: `kb: pack 29631 words (budget 20000)`, WARN over budget. Sections: rules 1984 · features 7394 · diagrams 4305 · decisions 6992 · proposed 1236 · facts 5237 · lessons 2475 · runbooks 2 (features launch, ingest, connection)

This is a full re-review. The orchestrator's prompt gave no §9 line. The code changed since cycle 2 (`26a060d..HEAD`) was read line by line: the `forceFocusInvalid` focus fix in `render/launch.ts` and `features/launch.ts`, three daemon comment fixes, the new ADR, and the spec file's header rewrite, new test and E2 additions. Every requirement and reviewer-verified item from cycle 2 was re-checked against the current tree. Each cycle 2 correctness finding is resolved under Notes → "Cycle 2 findings".

## Requirements

| Req | Implemented | Tested | Status |
|-----|-------------|--------|--------|
| REQ-1 parallel `GET /api/models` | Yes. `launchermodels.go` `verdicts()` runs one goroutine per model | D2, D6 | pass |
| REQ-2 cache keyed on binary identity | Yes. `ResolveBinaryIdentity`; an identity change resets both maps; 64-entry bound | D1, D3, the identity-change-in-flight test | pass |
| REQ-3 error, timeout or no identity gives `unchecked`, not cached | Yes | D4 | pass |
| REQ-4 Launch reads the same cache | Yes. `newSessionLauncher`'s closure calls `models.verdict` | D9 | pass |
| REQ-5 concurrent lookups share one run | Yes. Guarded delete, `WithoutCancel` shared run, a waiter honours its own ctx | D5, the leader-cancellation test | pass |
| REQ-6 request on open, and again for a restored non-preset | Yes. `openModal` → `requestModelVerdicts(MODEL_PRESETS)`; `applyModelRestore` | E1, the restore E2E test | pass |
| REQ-7 unselected unrecognised preset disabled | Yes | W1, E1, E3 | pass |
| REQ-8 selected unrecognised: kept, marked, Launch blocked | Yes | W1, E2, E3 | pass |
| REQ-9 custom refusal marks the field; editing clears it | Yes. The refusal goes to `#model-error` only. `submit`'s `model_unrecognized` branch now calls `updateModelRowState(true)` (`features/launch.ts:444`), so `renderModelRowState` focuses the invalid control after any launch-time refusal (`render/launch.ts:217`). That makes the ADR's consequence true on the Enter path too | W1, E4, the click-path focus test, and the new Enter-from-Title test (`launch-model-check.spec.ts:414`), which the log shows failing against pre-fix `c809f5e` | pass |
| REQ-10 failure marks nothing | Yes | E5, `api/launch.test.ts` | pass |
| REQ-11 atomic replace, 0o700 temp in the same directory | Yes. `AtomicWriteFile` | D7 | pass |
| REQ-12 unchanged content left untouched | Yes | D8 | pass |
| REQ-13 stale verdicts ignored | Yes. The generation is captured before each `await` (`features/launch.ts:164`, `:427`) | W3 | pass |
| DIAG | `kb:diagram/web-components`, `kb:diagram/containers` and `kb:diagram/daemon-components` are unaffected: this cycle's changes are comments plus one defaulted parameter, with no new module or import. The plan's launch-spec sequence delta still matches | — | pass |

## Build & Tests

E2E tests: pass (462/462) · Daemon tests (race): pass (every package `ok`) · Web tests: pass (1855 in 75 files) · Daemon build: pass · Web build: pass · Lint: pass (golangci-lint 0 issues, Biome 253 files clean). All were read from `$GATES_LOG_DIR` (`gates-maintainability-regressions-c3`, 0 failed lines). `size` is WARN with 4 hits (`Launch`, the 55-statement test, `New`, `features/launch.ts` now 602 lines). Those belong to review-maintainability.

## Acceptance Checks

| ID | Command | Result |
|----|---------|--------|
| D0 | `go build ./...` | pass (deduped to baseline `build`, 01-build.log, empty) |
| D10 | `make lint` | pass (deduped, 03-lint.log: 0 issues) |
| D11 | `make test` | pass (deduped to `test-race`, 02-test.log) |
| D12 | `make test-race` | pass (02-test.log: all `ok`) |
| W0 | `make web-build` | pass (deduped, 04-web-build.log) |
| W4 | `make web-lint` | pass (deduped, 06-web-lint.log) |
| W5 | `make web-test` | pass (deduped, 05-web-test.log: 1855 passed) |
| E0 | `make e2e` | pass (deduped, 16-e2e.log: 462 passed) |
| K1 | `make check-kb` | pass (deduped, 10-kb-check.log: 442 records, 0 problems) |
| baseline contrast / versions / e2e-honest / dead-refs / e2e-lint / features / comments | — | pass (07: 0 failures in all three themes; 08; 09; 11: 0 missing; 12: clean; 13; 14: `comment-checks: clean`) |
| DOC | doc upkeep + Doc Delta vs what shipped | pass. Both `deviation:` lines now end in a `→ kb:adr/…`. `launch-check-model-seam-keeps-its-signature` and the new `launch-model-verdict-parser-in-api-launch` are `proposed`, carry `refs: plan:maintainability-regressions`, and describe what shipped. The parser is unexported in `api/launch.ts:133`, `protocol/` has 8 non-test modules, the named sibling parsers exist in `api/`, and the malformed-body cases run through `checkModels` in `api/launch.test.ts`. The refusal ADR's consequence ("focus moves to the invalid control after a refusal") is now true on every submit path. The `TODO.md` tick happens at Completion, as the plan says. Every Doc Delta sentence matches the code, including ingest's "replaced atomically at daemon start when their content changed" |

## Reviewer-Verified Criteria

| ID | Criterion | Result | Evidence |
|----|-----------|--------|----------|
| R1 | Catalog sentence and argv stay in `internal/claudecode`; the cache sees neutral verdicts | pass | `rg -g '!internal/claudecode/**' -g '!*_test.go' -e '--bare' -e "isn.t described" -e no-session-persistence internal cmd` finds nothing |
| R2 | One cache owner, used by both endpoints | pass | The only non-test `claudecode.CheckModel` reference is `launchermodels.go:87`. `server.go` builds one `modelsFeature` and passes it into `newSessionLauncher` |
| R3 | No new colour token | pass | `style.css` is unchanged since cycle 2, when it was verified. `make contrast`: 0 failures |
| R4 | Invalid reads as "selected and wrong" in all three themes | not mine | Measured on screen, so review-browser owns it |
| R5 | No `any` in new web code | pass | In the added `web/src` lines, `any` appears only in English prose ("any other verdict response", "any mark"). There is no `as unknown` and no `innerHTML` |
| R6 | Generated script body byte-identical | pass | This cycle's `settings.go` change is a comment in `MergeSettings`' doc. The template is untouched |

## Hard-Rule Checklist

| # | Rule | Result |
|---|------|--------|
| 1 | Adapter boundary | pass |
| 2 | Terminal-output state parsing | pass (none) |
| 3 | Blocking hook handler | pass (no hook handler or registration change) |
| 4 | Bare tmux / resize-pane | pass (no tmux invocation added) |
| 5 | Payload logging | pass |
| 6 | Empty-gauge dishonesty | pass (`unchecked` and "no answer yet" take the unmarked branch) |
| 7 | Session identity on `session_id` | pass (n/a) |
| 8 | Settings trespass | pass |
| 9 | Real `claude` outside canary/probes | pass. Go tests fake `check`/`identify`. The E2E tests use the stub `claude` |

## Issues

### Critical

(none)

### Major

1. **[e2e-specs]** A test comment states a focus rule that the shipped code breaks on purpose. `web/e2e/launch-model-check.spec.ts:196-202` says a verdict from the dialog-open request "must never move focus, wherever it already is". That is false when focus is on Launch.
   - `renderModelRowState` (`render/launch.ts:215-218`) moves focus onto the invalid control whenever Launch had focus and is being disabled, whatever the value of `forceFocusInvalid`. That includes a verdict from `requestModelVerdicts`.
   - The move is intentional: it is cycle 1 browser Minor 1's fix, so focus does not drop to `<body>`. This path is reachable. Tab to Launch while the open-time request is in flight with `fable` selected, and when the verdict lands, focus moves to the `fable` radio.
   - Harm: a reader who trusts the comment could "fix" that branch and bring back the focus drop.
   - Fix: limit the claim to what the test measures. For example: "never moves focus off a control that stays enabled; only a Launch it disables hands focus to the invalid control". The test's closing comment (`:225-226`, "must not steal focus back onto it") is accurate and can stay.

### Minor

(none)

### Notes

1. **[note]** Cycle 2 findings, all resolved:
   - Major 1: `submit` passes `forceFocusInvalid=true`. A dialog-open or restore verdict can no longer take the forced path, because every other call site uses the default.
   - Major 2: the spec header now says E6's two tests keep every assertion except where the refusal is read.
   - Major 3: the Enter-from-Title test exists. `test-specs.md` pastes its failure against pre-fix `c809f5e` (`Custom model` "inactive"). It also shows the new E2 focus assertion going red when the guard is weakened. The `## Repairs (fix cycle 2)` rows were checked: nothing was deleted or weakened.
   - Major 4: `kb:adr/launch-model-verdict-parser-in-api-launch` is recorded.
   - Minor 1: `settings.go:221` and `launcher.go:82-83` now say "replaced at daemon start whenever their content changed". `rg 'rewritten at every|every daemon start' internal cmd` finds nothing.
   - Minor 2: `New` now says 15 features, and `awk` over `New` counts 15 `register(` calls.
2. **[note]** Two source comments use the same "never steals focus" framing as Major 1:
   - `features/launch.ts:142-144`: "leaves it at the default so it never steals focus from wherever the dialog already put it".
   - `render/launch.ts:193-196`.

   `render/launch.ts` states the Launch-disabled exception in its first paragraph, and moving focus off a Launch that is being disabled saves focus from dropping to `<body>` rather than taking it. So both comments read as true in context, and no change is requested. The E2E comment in Major 1 says "move", not "steal", and it has no such context.
3. **[note]** `forceFocusInvalid` has no Vitest coverage. `render/launch.test.ts` tests only `renderLaunchFooter`. Both directions are covered end to end instead: forced on the Enter path, and not forced by the E2 test's Title-focus assertion. The plan's W criteria do not ask for more.
4. **[note]** `test-specs.md` header says "Tests created: 9 (6 from authoring + 1 … + 1 …)". That adds up to 8. The live-run count (10 = 8 new + 2 pre-existing) is right. This is a plan log, not a shipped statement.
5. **[note]** Carried from cycle 2, still true, no change requested:
   - Production comments cite the plan's Protocol Contract (`launchermodels.go:20`, `:58`; `launcherrors.go:58-60`).
   - `launchermodels_test.go` labels dedupe cases "D10".
   - `test-specs.md`'s authoring-time Tests table still says "pre-existing, untouched".
   - `settings.local.json` inherits skip-when-unchanged through `AtomicWriteFile`.
   - design-system §5 cites the plan by name.
6. **[note]** For review-maintainability: `features/launch.ts` grew to 602 lines, and the growth is this cycle's doc comments. Two E2E test titles carry review-process labels ("(review cycle 2 code Major 1/3)", "(review cycle 1 browser Minor 1)").

## Browser review

# Browser review: Maintainability Regressions

**Plan**: maintainability-regressions
**Part verdict**: needs-changes
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

## Maintainability review

# Maintainability review: Maintainability Regressions

**Plan**: maintainability-regressions
**Part verdict**: needs-changes
**Cycle**: 3
**Pack**: kb: pack 20782 words (budget 20000) — sections: rules 1938 · features 2133 · diagrams 4305 · decisions 6992 · proposed 0 · facts 5237 · lessons 169 · runbooks 2 (WARN: over budget)
**Scope**: 15 files from `git diff main...HEAD -- cmd internal web/src ':!*_test.go' ':!*.test.ts'`, the same set as cycle 2. Four of them are GENERATED `CLAUDE.md` trailers. This is a full re-review, since the spawn prompt did not declare a delta. Since cycle 2 (`26a060d..HEAD`), five of the 15 files changed. Three are comment-only: `settings.go`, `launcher.go` and `server.go`. The other two, `features/launch.ts` and `render/launch.ts`, have a code change: the `forceFocusInvalid` parameter. I re-read the remaining ten against cycle 2's reading. They are byte-identical, so cycle 2's results for them stand.

## Files

| File | Siblings opened | design: line | Size warnings | Result |
|------|-----------------|--------------|---------------|--------|
| internal/claudecode/settings.go | (cycle 2) server/launcher.go `writeSettings`, selfupdate/apply.go, leaf packages. Changed since cycle 2: comment only (`MergeSettings` doc, `:221`) | yes | — | pass |
| internal/claudecode/modelcheck.go | (cycle 2) version.go, credentials.go, server/updatemanager.go:325. Unchanged | yes | — | pass |
| internal/server/launchermodels.go | (cycle 2) browse.go, usage.go, issue.go, terminal.go. Unchanged | yes | — | pass (cycle 2 Notes 3 and 4 still stand, not repeated) |
| internal/server/launcher.go | (cycle 2) browse.go, usage.go. Changed since cycle 2: comment only (`:82-83`) | yes | funlen `Launch` 83>60. Pre-existing and unchanged on `main`; the reason holds | pass |
| internal/server/launcherrors.go | respond.go. Unchanged | n/a | — | pass |
| internal/server/server.go | composition root. Changed since cycle 2: doc comment only. `awk '/^func New\(/,/^}/' … \| grep -c 'register(s'` → 15, which matches the corrected "15 features" | covered | funlen `New` 42>40; the reason in `New`'s doc holds | pass |
| web/src/api/launch.ts | api/reader.ts, api/issue.ts, protocol/session.ts. Unchanged | yes | — | pass |
| web/src/features/launchmodels.ts | launchcrumbs.ts, launchrestore.ts. Unchanged (`applyVerdicts` read again for Minor 1) | yes | — | pass |
| web/src/features/launch.ts | issue.ts, surfaces.ts, connection.ts; the boolean-parameter precedent in `features/tiles.ts:204`. Changed since cycle 2: `updateModelRowState(forceFocusInvalid)`, `submit`'s refusal branch | no new type/module/seam, so none needed | filelen 602 (504 on `main`). The growth is controller glue plus doc comments; the reason in `web-implementation.md:30,67,103` holds | **Minor 1**, Note 1 |
| web/src/render/launch.ts | render/mainhead.ts:57 and render/tiles.ts:67 (positional `boolean` params in `render/`), render/focuskeep.ts:66, render/diagramdialog.ts:93,126, render/rename.ts:117 (`.focus()` in `render/`). Changed since cycle 2: 7th parameter `forceFocusInvalid` | none needed (widened signature, not a new seam) | — | pass (Note 1) |
| web/src/style.css | Unchanged | n/a | — | pass (cycle 2 Note 6 stands) |
| internal/server/launchermodels_test.go (size log only) | — | — | funlen `TestModelsFeature_CheckInFlightWhenIdentityChanges_NotCachedNorServed` 55>40. The reason is now in `daemon-tests.md:207-215` and holds: one ordered interleaving over four gate channels (`aStarted`/`releaseA`/`bStarted`/`releaseB`, 12 references in the file) | pass |
| internal/claudecode/CLAUDE.md, internal/server/CLAUDE.md, web/src/features/CLAUDE.md, web/src/render/CLAUDE.md | — | generated trailer | — | not reviewed |

## Cycle 2 findings

| Cycle 2 finding | Fix commit | Verified how |
|-----------------|-----------|--------------|
| Minor 1: no size reason for the launchermodels test funlen | 25ee176 | `daemon-tests.md` now gives the reason: one ordered interleaving that a table cannot express, citing kb:adr/process-size-linters-warn-never-fail. The test at `launchermodels_test.go:203` does drive A/B through four channels, so the reason matches the code. |

## Issues

### Critical

None.

### Major

None.

### Minor

1. **[web-impl]** The launch-time focus force skips the generation guard that `modelVerdicts` names at its declaration. The race is at `web/src/features/launch.ts:436-444`. `modelVerdicts`'s declaration (`:118-125`) names generation as the guard against a response from an earlier open. `submit` honours that guard for the store write: `applyVerdicts` returns the store unchanged when `generation !== store.generation` (`launchmodels.ts:71`). But the new `updateModelRowState(true)` runs unconditionally after that write. So a refusal the guard dropped still forces focus in whatever dialog is open now. Concrete interleaving:
   - Open g1 with model X selected. X's verdict is not in the store yet (cold cache).
   - The developer presses Enter in Title. `submit` captures g1 and awaits `POST /api/sessions`, whose daemon-side check shares the in-flight run for X.
   - The developer cancels and reopens: `resetForm` advances to g2, and `applyModelRestore(X)` or the preset request asks for X again, joining the same in-flight run.
   - g2's `GET /api/models` response lands first and marks X unrecognized. Now g2's `state.invalid` is true.
   - The stale g1 refusal lands. `applyVerdicts` drops it, and `updateModelRowState(true)` → `renderModelRowState` (`render/launch.ts:217`) moves focus onto the model control. The developer's focus is on the browse list or Title in a dialog they did not submit from.

   That breaks the invariant `renderModelRowState`'s own doc states (`render/launch.ts:193-196`): "a verdict arriving from the dialog-open request or a restore must never steal focus". It also breaks § Design "Shared state names its writers and its guard": the guard is named, but this async writer's side effect runs outside it. A fix must make one thing true: a refusal that the generation guard drops moves no focus. The force applies only when the refusal was merged into the current open's store.

### Notes

1. **[note]** The same reason for `forceFocusInvalid` is now written three times: `updateModelRowState`'s doc (`features/launch.ts:139-144`), `renderModelRowState`'s doc (`render/launch.ts:190-196`) and the inline comment at the call site (`features/launch.ts:439-443`). The `render/` doc also names its caller ("`features/launch.ts`'s `submit` is the only one that passes `true`"). That claim goes stale as soon as a second caller appears, the same pattern as cycle 2 Note 5's `AtomicWriteFile` caller list. § Comments says "Don't explain what well-named code already says". One statement at the parameter's home would carry it. A trailing positional `boolean` on a `render/` function has sibling precedent (`render/mainhead.ts:57`, `render/tiles.ts:67`), so the signature shape is not a divergence.
2. **[note]** Cycle 2 Notes 1, 3, 4 and 6 are unchanged, since their code did not move: the `AtomicWriteFile` home and the `selfupdate` follow-up, the leader running on `WithoutCancel`, `verdict`'s write-before-close rule left unstated, and the repeated invalid outline in `style.css`. I am not refiling them.
3. **[note]** Diagram check: no module or dependency edge was added since cycle 2. kb:diagram/web-components already shows `protocol/` as "8 modules" (`docs/diagrams/web-components.md:59`), which matches `ls web/src/protocol/*.ts` without tests → 8.
