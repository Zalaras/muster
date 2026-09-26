# Review: maintainability-regressions

**Plan**: maintainability-regressions
**Verdict**: needs-changes
**Cycle**: 2
**Gates**: 0 failed
**Parts**: code, browser, maintainability
**Part verdicts**: code needs-changes, browser approved, maintainability needs-changes

_Merged by orch-state.py merge-review; the verdict is computed from the parts and the gate run, never edited by hand._

## Correctness review

# Correctness review: Maintainability Regressions

**Plan**: maintainability-regressions
**Part verdict**: needs-changes
**Cycle**: 2
**Pack**: `kb: pack 29453 words (budget 20000)`, WARN over budget. Sections: rules 1984 · features 7394 · diagrams 4305 · decisions 6992 · proposed 1058 · facts 5237 · lessons 2475 · runbooks 2 (features launch, ingest, connection)

This is a full re-review. The orchestrator's prompt gave no §9 line. Every cycle 1 correctness finding was checked against the code; the results are under Notes → "Cycle 1 findings".

## Requirements

| Req | Implemented | Tested | Status |
|-----|-------------|--------|--------|
| REQ-1 parallel `GET /api/models` | Yes. `launchermodels.go` `verdicts()` runs one goroutine per model | D2 `TestModelsFeature_FourUncachedModelsCheckedConcurrently`; D6 handler tests | pass |
| REQ-2 cache keyed on binary identity | Yes. `claudecode.ResolveBinaryIdentity` (LookPath → EvalSymlinks → Stat). `verdict()` resets both maps and bumps `generation` when the identity changes. 64-entry bound | D1, D3, `TestModelsFeature_CheckInFlightWhenIdentityChanges_NotCachedNorServed`, `TestResolveBinaryIdentity_*` | pass |
| REQ-3 error, timeout or no identity gives `unchecked`, not cached | Yes | D4 (both halves) | pass |
| REQ-4 Launch reads the same cache | Yes. `newSessionLauncher`'s closure calls `models.verdict` | D9 `TestLauncher_CachedVerdict_LaunchRunsNoCheck` | pass |
| REQ-5 concurrent lookups share one run | Yes. A finishing call now deletes only its own in-flight entry (`launchermodels.go:227`). The shared run uses `context.WithoutCancel` (`:218`), and a waiter honours its own ctx (`:207-212`) | D5, the identity-change-in-flight test, `TestModelsFeature_LeaderCancellation_…` | pass |
| REQ-6 request on open, and again for a restored non-preset | Yes. `openModal` → `requestModelVerdicts(MODEL_PRESETS)`; `applyModelRestore` | E1, the restore E2E test, `api/launch.test.ts` | pass |
| REQ-7 unselected unrecognised preset disabled | Yes | W1, E1, E3 | pass |
| REQ-8 selected unrecognised: kept, marked, Launch blocked | Yes | W1, E2, E3 | pass |
| REQ-9 custom refusal marks the field; editing clears it | Yes. Decision A is implemented: `model_unrecognized` goes to `#model-error` only (`features/launch.ts:425-434`). But the recorded decision's focus condition is met only when Launch had focus (Major 1) | W1, E4, the focus E2E test (click path only, Major 3) | fail (Major 1) |
| REQ-10 failure marks nothing | Yes. A failed `checkModels` never calls `applyVerdicts` | E5, now gated on `requestfailed`; `api/launch.test.ts` | pass |
| REQ-11 atomic replace, 0o700 temp file in the same directory | Yes. `AtomicWriteFile` does `CreateTemp(dir)` → `Chmod(perm)` → write → fsync → close → rename | D7 | pass |
| REQ-12 unchanged content left untouched | Yes | D8 | pass |
| REQ-13 stale verdicts ignored | Yes. The open-time request and the launch-refusal merge both capture the generation before their `await` (`features/launch.ts:158`, `:419`) | W3 | pass |
| DIAG | `kb:diagram/web-components` (true again: the features/protocol/api counts are 24/8/8 and there is no `render/`→`features/` import); `kb:diagram/containers` (updated, true); `kb:diagram/daemon-components` (true); the plan's launch-spec sequence delta (matches what shipped) | — | pass |

## Build & Tests

E2E tests: pass (461/461) · Daemon tests (race): pass (every package `ok`) · Web tests: pass (1855 in 75 files) · Daemon build: pass · Web build: pass · Lint: pass (golangci-lint 0 issues, Biome clean). All were read from `$GATES_LOG_DIR` (`gates-maintainability-regressions-c2`, 0 failed lines). `size` is WARN with 4 hits; that belongs to review-maintainability.

## Acceptance Checks

| ID | Command | Result |
|----|---------|--------|
| D0 | `go build ./...` | pass (deduped to baseline `build`, 01-build.log) |
| D10 | `make lint` | pass (deduped to baseline `lint`, 03-lint.log: 0 issues) |
| D11 | `make test` | pass (deduped to `test-race`, 02-test.log) |
| D12 | `make test-race` | pass (baseline `test`, 02-test.log: all `ok`) |
| W0 | `make web-build` | pass (deduped, 04-web-build.log) |
| W4 | `make web-lint` | pass (deduped, 06-web-lint.log) |
| W5 | `make web-test` | pass (deduped, 05-web-test.log: 1855 passed) |
| E0 | `make e2e` | pass (deduped, 16-e2e.log: 461 passed) |
| K1 | `make check-kb` | pass (deduped, 10-kb-check.log: 441 records, 0 problems) |
| baseline contrast / versions / e2e-honest / dead-refs / e2e-lint / features / comments | — | pass (07, 08, 09, 11, 12, 13, 14; `comment-checks: clean`) |
| DOC | doc upkeep + Doc Delta vs what shipped | **FAIL**: web-impl's `deviation:` line (`web-implementation.md:63`, `protocol/models.ts` → `api/launch.ts`) ends "→ ADR: pending" and has no record (Major 4). The other five ADRs are `proposed` with `refs: plan:maintainability-regressions` and describe what shipped, except one consequence sentence in `launch-model-refusal-shown-in-field-error-only` (Major 1). Design-system §5 carries the pattern. The `TODO.md` tick happens at Completion, as the plan says. Every Doc Delta sentence matches the code. |

## Reviewer-Verified Criteria

| ID | Criterion | Result | Evidence |
|----|-----------|--------|----------|
| R1 | The catalog sentence and argv stay in `internal/claudecode`; the cache sees only neutral verdicts | pass | `rg -g '!internal/claudecode/**' -g '!*_test.go' -e '--bare' -e "isn.t described" -e no-session-persistence internal cmd` finds nothing. `launchermodels.go` uses only `CheckModel`, `ModelVerdict`, `ModelUnrecognised`, `BinaryIdentity` and `ResolveBinaryIdentity` |
| R2 | One cache owner, used by both endpoints | pass | `server.go:204` builds one `modelsFeature`, registers it and passes it into `newSessionLauncher`. The only non-test reference to `claudecode.CheckModel` is `launchermodels.go:87` |
| R3 | No new colour token; only `--banner-fg`, `--banner-line`, `--disabled-fg` | pass | The `style.css` diff adds no `--x:` definition and no literal. It uses those three tokens plus `--mono`/`--fs-xs`. `make contrast`: 0 failures in all three themes |
| R4 | In a browser, invalid reads as "selected and wrong" in all three themes | not mine | Measured on screen, so review-browser owns it |
| R5 | No `any` in new web code | pass | Among the added lines of `api/launch.ts`, `features/launch.ts`, `features/launchmodels.ts` and `render/launch.ts`, `any` appears only in prose comments. There is no `as unknown`, and no `innerHTML` |
| R6 | Generated script body byte-identical | pass | The `settings.go` diff starts after the template's closing `, MusterSessionEnvVar, url)`. Only the write call changed |

## Hard-Rule Checklist

| # | Rule | Result |
|---|------|--------|
| 1 | Adapter boundary | pass |
| 2 | Terminal-output state parsing | pass (none) |
| 3 | Blocking hook handler | pass (no hook handler or registration change) |
| 4 | Bare tmux / resize-pane | pass (no tmux added) |
| 5 | Payload logging | pass (the two new warn logs carry only `bin`/`model` and the error) |
| 6 | Empty-gauge dishonesty | pass (`unchecked` and "no answer yet" both take the unmarked branch) |
| 7 | Session identity on `session_id` | pass (n/a) |
| 8 | Settings trespass | pass |
| 9 | Real `claude` outside canary/probes | pass. Every new Go test fakes `check`/`identify` or points `PATH` at a temp dir. The E2E tests use the shared stub `claude` |

## Issues

### Critical

(none)

### Major

1. **[web-impl]** A `model_unrecognized` refusal submitted with Enter, from the Title field or a radio, is never announced. The recorded decision says it would be.
   - Decision A relies on focus moving to the invalid control after a refusal. `kb:adr/launch-model-refusal-shown-in-field-error-only` says so in its Consequences: "The refusal has no live region of its own, so focus moves to the invalid control after a refusal, and that control is described by the message". `decisions/model-refusal-message-placement/decision.md` calls this "a condition of this outcome, not an optional polish".
   - `render/launch.ts:206-209` moves focus only when `document.activeElement === launchButton`.
   - The form also submits implicitly on Enter in `#title-input` (`features/launch.ts:522`), and then focus stays in Title. `#model-error` has no role (`index.html:153`), and `showError` (`role="alert"`) is now skipped for this code. So nothing announces the refusal.
   - On `main`, the same Enter path announced it through `#launch-error`'s `role="alert"`. This is an accessibility regression that the decision's dissent guarded against.
   - A fix must make this true: after any launch-time `model_unrecognized` refusal that marks a control invalid, focus is on that control, wherever focus was before. The Launch-focused case already works.
2. **[e2e-specs]** `web/e2e/launch-model-check.spec.ts:31-32`: the header says "Plan acceptance: E1-E5 (E6 is the two tests above passing unchanged)". That is false. E6 was amended in cycle 1, and both of those tests now read the message from `#model-error` and assert `#launch-error` hidden (`:58-63`, `:120-124`). Fix: say that E6's two tests keep every assertion except where the refusal is read, per the amended E6.
3. **[e2e-specs]** Major 1's condition has no test. The focus test (`:359-393`) drives only a pointer click on Launch. That is the one path where focus was already on Launch, so it cannot fail for Major 1. Fix: add the Enter-from-Title case (fill Title, press Enter, then expect the refusal and `Custom model` to be focused). Before web-impl's fix, that test must fail on the focus assertion.
4. **[orchestrator]** `web-implementation.md:63` has a `deviation:` line with no `→ kb:adr/…` ("→ ADR: pending"). The plan's Affected Files names `web/src/protocol/models.ts` (new) and says `protocol/` is connection's. What shipped puts the verdict type and parser in `web/src/api/launch.ts`, and `protocol/models.ts` does not exist. No proposed ADR under launch or connection records this (`kb ls --feature launch|connection --status proposed`).

### Minor

1. **[daemon-impl]** Two comments still say the wrapper scripts are rewritten at every daemon start. That is the exact claim the plan's Doc Delta retires from the ingest spec, because `AtomicWriteFile` now skips unchanged content:
   - `internal/claudecode/settings.go:221` ("WriteWrapperScripts rewrites the scripts themselves at every daemon start")
   - `internal/server/launcher.go:82-83` ("the URL lives only inside the scripts themselves, rewritten at every daemon start")

   Fix: say the scripts are replaced at daemon start whenever their content (URL or token) changed.
2. **[daemon-impl]** `internal/server/server.go:138`: `New`'s doc comment says "one construction-plus-register line per feature (13 features)". `New` now registers 15: models, reader, sessions, terminal, shell, locate, browse, repos, issue, prefs, ingest, usage, theme, shellActivity and update. The count was already one short on `main` (14), and this plan's `models` line adds another. This comment is the recorded reason for `New`'s funlen WARN. Fix: correct the count.

### Notes

1. **[note]** Cycle 1 findings. Every correctness item is fixed as asked:
   - Critical 1/2: the comments gate is clean.
   - Major 1: `modelcheck.go` comments now name the caller-chosen directory and `modelsFeature`, and cite the new ADR.
   - Major 2: `features/CLAUDE.md` lists `launchmodels.ts`.
   - Major 3: `rg '"\.\./features' web/src --glob '!*.test.ts'` finds nothing.
   - Major 4: `containers.md` is updated.
   - Major 5: the E4 comment matches its assertions.
   - Major 6: decision A is implemented.
   - Minors 1-5: the guarded delete, `WithoutCancel`, the generation captured before `await`, E5 gated on `requestfailed`, and the new identity-change-in-flight test.
2. **[note]** `AtomicWriteFile` is now also `writeSettings`' writer. So `settings.local.json` inherits skip-when-unchanged, which the plan scoped only to the wrapper scripts. On `main` every launch re-asserted mode 0o600. Now a byte-identical `settings.local.json` keeps whatever mode it has. The file holds no secret (the token lives in the scripts), and no doc pins the mode, so no change is requested. The helper's placement is review-maintainability's.
3. **[note]** Production comments cite the plan's "Protocol Contract" section as their authority (`launchermodels.go:20`, `:58`; `launcherrors.go:58-60`, which quotes the plan). `kb:anchor/models.check` now carries the same text, and a merged comment would read better citing it. The gate allows this, so no change is requested.
4. **[note]** `launchermodels_test.go:392,409,443,460` label edge case 10 (dedupe) as "D10". In the plan, D10 is the `make lint` check. The assertions are right; only the label is off.
5. **[note]** `test-specs.md`'s authoring-time Tests table and Coverage row still say the two pre-existing tests are "pre-existing, untouched" and that "E6 … pass unchanged". The Fix Attempt 1 section and the Repairs table below them record the change honestly. The Repairs table was checked row by row: each repaired assertion still verifies its requirement, and none was deleted or weakened.
6. **[note]** `TestModelsFeature_CheckInFlightWhenIdentityChanges_NotCachedNorServed` starts `resultB2` and closes `releaseB` straight away, so B2 may read B's cached verdict instead of joining the run. It passes either way. The guard itself is proven by the `stillInFlight` require at `:256`, which fails against an unconditional delete.
7. **[note]** `docs/design/design-system.md` §5 cites "plan `maintainability-regressions`" in prose, which conventions says not to do (cite by token, never by plan name). There is precedent in the same file ("settled by m3-gauges planning"). This is orchestrator-owned; no change is requested.
8. **[note]** For review-maintainability: the size WARNs (`Launch` funlen, which the daemon log now shows predates this plan; `New` 42>40; `features/launch.ts` 589 lines; the new 55-statement test function) and the exported `claudecode.AtomicWriteFile` as a generic file helper inside the adapter package.

## Browser review

# Browser review: Maintainability Regressions

**Plan**: maintainability-regressions
**Part verdict**: approved
**Cycle**: 2
**Pack**: kb: pack 16131 words (budget 20000)
**Rig**: `make web-build build` at 3c2b8c0 (the only dirty files were the orchestrator's `orchestration-state.json` and a sibling reviewer's part file). Scratch daemons came from the committed `web/e2e/helpers` (`startDaemon`), with data dirs `$TMPDIR/muster e2e-XXXX` (the path contains a space) and tmux `-S <dataDir>/tmux.sock`. `claude` was the shared stub (`$TMPDIR/muster e2e-stub-cd75a542396fd84f`). Headless Chromium ran at 1280×720, 900×600 and 1280×560. One throwaway spec (15 probe tests) was deleted afterwards. `git status --porcelain` shows nothing of mine, and no `musterd` or `tmux` process is left running.

Gates log (cycle 2): every line is green. `16-e2e` passed 461, and `04-web-build` is clean, so the app I drove is the one that will ship.

This cycle re-checks cycle 1's three findings: browser Major 1, Minor 1 and Minor 2. Major 1 was settled by `decisions/model-refusal-message-placement`, outcome A, which makes browser Minor 1 a condition of that outcome. I also re-ran the full matrix against the new build, because the refusal path, the focus handling in `renderModelRowState` and the type moves all changed. The "remembered model that the binary now refuses" case was set up for real: launch `fable` on a clean stub, then restart the same scratch daemon with the stub refusing `fable` and `opus`. I stubbed a response body only where a cell needs one: `unchecked` for every model, a 500, a stale body, and a held response.

## Matrix

Hosts: **focus** means the dialog was opened from Focus view. **tiles** means it was opened after pressing Tiles (`aria-pressed=true`). **pop-out** is `/doc.html`, which has no launch dialog (`grep -c launch-dialog web/doc.html` = 0). Every pop-out cell is therefore N/A.

| Req | Host | State | Claim | Result | Evidence |
|-----|------|-------|-------|--------|----------|
| REQ-9 / User Flow 5 (decision A) | focus, tiles | data | a custom refusal shows in `#model-error` only | pass | after a pointer click on Launch: `#model-error` computes `display:block`, and its accessible text is exactly the daemon message. `#launch-error` is `[hidden]` with `display:none` and empty text. One `POST /api/sessions` |
| REQ-9 (decision A) | focus, tiles | data | same result when submitted by keyboard (Tab to Launch, then Enter) or by Enter in Title | pass | `#launch-error` is `H/none ""` in every case |
| REQ-9 (decision A) | focus, tiles | data | the refused preset (open-time verdict `unchecked`, refused at Launch) shows in `#model-error` only | pass | fable is checked, `aria-invalid`, `aria-describedby=model-error`. `#model-error` holds the fable sentence and `#launch-error` is `H/none ""` |
| REQ-8/9 (cycle 1 Major 1's fix condition) | focus, tiles | data | once the mark clears, no visible text names the model that is no longer selected | pass | after Backspace: input not invalid, and both errors `none`, Launch enabled. After picking haiku by pointer: the same. After ArrowLeft off the refused fable radio, or a click on sonnet: the same |
| REQ-9 | focus, tiles | data | retyping the refused text re-marks it, and returning to `other…` with refused text re-marks it | pass | `…-zz` typed again: `inv=true`, message back, Launch disabled. Pointer on `other…`: the same |
| REQ-9 | focus, tiles | data | a fixed text launches | pass | `probe-ok-model` gives one POST, the dialog closes, and `/api/state` shows `probe-p1` with model id `probe-ok-model` |
| Focus after refusal (cycle 1 Minor 1, a condition of decision A) | focus, tiles | data | a pointer click on Launch moves focus to the invalid custom input | pass | `activeElement` = `INPUT#custom-model-input` right after the refusal |
| Focus after refusal | focus, tiles | data | Tab then Enter on Launch moves focus to the invalid custom input | pass | the same `activeElement` |
| Focus after refusal | focus, tiles | data | a preset refused at Launch moves focus to the invalid radio | pass | `activeElement` = `INPUT[name=model][value=fable]` (checked, invalid) |
| Keeps focus | focus, tiles | data | the moved focus survives a render tick | pass | I marked the node with an attribute, waited 1.5 s, and the same marked node was still `activeElement` (custom input and fable radio) |
| Focus after refusal | focus, tiles | data | Tab from the invalid control stays in the dialog, and Shift+Tab returns | pass | Tab went to an `INPUT` with `inDialog=true`; Shift+Tab went back to `#custom-model-input` |
| Focus after refusal | focus, tiles | data | a refusal submitted from Title does not steal focus | pass | `activeElement` stays `INPUT#title-input` (see Note 1) |
| Decision dissent (a11y) | focus, tiles | data | the newly focused control's accessible description is the refusal | pass | `toHaveAccessibleDescription` passes on `Custom model` with the exact daemon message, and the `⚠` glyph is excluded |
| REQ-8 | focus, tiles | data | Enter in the invalid custom input cannot submit | pass | 0 POSTs in 600 ms, and the state is unchanged |
| REQ-13 (new submit-generation capture) | focus | data | a refusal that lands after cancel and reopen marks nothing | pass | POST held, Escape, reopen, same `…-zz` typed, then released. After 1.5 s: input `inv=null`, both errors `none`, Launch enabled |
| REQ-6 | focus | no data yet | opening the dialog requests the four presets | pass | exactly one request, `?model=sonnet&model=opus&model=haiku&model=fable` |
| REQ-6 / edge 11 | focus, tiles | data | a restored non-preset gets its own request | N/A this cycle: the code path is unchanged since cycle 1's pass (`applyModelRestore` diff is comment-only), and E4-restore in the gate run is green | |
| UI States: no data yet | focus | no data yet (response held 1.2 s) | nothing is marked or disabled, and there is no spinner | pass | all radios enabled with no `I`, `#model-error` `H/none`, Launch enabled |
| REQ-7 | focus, tiles | data | an unrecognised preset that is not selected is disabled, and its title can be reached | pass | `fable:D` and `opus:D`. `elementFromPoint` at the label centre is the INPUT with `title="Claude Code doesn't recognise this model"`. Label `rgb(90,96,112)` = `--disabled-fg` |
| REQ-7 | focus | data | a pointer can't select it, and the keyboard skips it | pass | a forced click on fable leaves `haiku:C fable:D`. ArrowRight ×5 from sonnet goes `opus→haiku→other→sonnet→opus` |
| edge 4 | focus | data | a verdict that lands after switching presets doesn't mark the new selection | pass | click fable, click haiku, release: `haiku:C` unmarked, `fable:D` |
| REQ-8 (User Flow 3) | focus, tiles | data (remembered `fable`, now refused) | kept, marked, message shown, Launch disabled | pass | `fable:CId`, `opus:D`, `#model-error` `block` with the fable sentence, `#launch-error` `H/none`, Launch disabled |
| REQ-8 | focus, tiles | data | Enter in Title can't submit while blocked | pass | 0 POSTs |
| REQ-8 | focus, tiles | data | keyboard focus on the invalid radio survives a tick | pass | the marked fable radio is still `activeElement` after 1.5 s |
| REQ-8 / User Flow 4 | focus, tiles | data | picking sonnet clears the mark and disables fable | pass | `sonnet:C opus:D fable:D`, both errors `none`, Launch enabled |
| Placed / contained | focus, tiles | data, 1280×720 | `#model-error` sits inside the dialog without overflow | pass | preset invalid: box 297,521–983,534 inside dialog 280,85–1000,635, `scrollWidth 686 = clientWidth 686`, dialog `sh 548 = ch 548`. Custom invalid: 297,495–983,521 inside 280,59–1000,661, `sh 600 = ch 600` |
| Reachable | focus | data, 900×600 and 1280×560 | the custom-invalid dialog scrolls to Launch | pass | the dialog has `overflow-y:auto` and `max-height: calc(100% - 36px)`. At 600: `sh 600 > ch 562`. At 560: `sh 600 > ch 522`. See Note 2 |
| REQ-10 / edge 1 | focus, tiles | daemon-down (SIGTERM) | nothing is marked or disabled | pass | waited for `requestfailed` on `/api/models`, then 1.2 s: `sonnet:C`, all others enabled, `#model-error` `none`, Launch enabled |
| REQ-10 / §6 | focus, tiles | daemon-down | daemon-down is surfaced prominently | pass | `#banner` `display:block` at y 46, 1280×32, "musterd unreachable — …". The dialog's `#launch-error` reads "Could not reach musterd." |
| REQ-10 (decision A keeps other codes) | focus, tiles | daemon-down | a refusal with another code still goes to `#launch-error` | pass | Launch → `#launch-error` `block` "Choose a directory to launch into.", `#model-error` `none` |
| REQ-10 | focus | data (500) | a non-2xx response marks nothing | pass | every radio unmarked, Launch enabled |
| INV-4 (web half) | focus | data (`unchecked` for all) | `unchecked` never marks or disables | pass | `sonnet:C`, nothing `D` or `I`, no message |
| REQ-13 / edge 2 | focus | data | a late GET from a closed dialog is ignored | pass | the first open's response was held with sonnet and opus `unrecognized`. After close, reopen (settled `fable:D`) and release: `sonnet:C opus: fable:D`, no message |
| R4 | tiles (the view preference carried over) | data | invalid reads as "selected and wrong", distinct from disabled, in every theme | pass | instrument: invalid `rgb(243,183,183)` with a 1px outline `rgb(90,44,44)`, disabled `rgb(90,96,112)`. Dark: `rgb(244,185,185)` / `rgb(92,47,47)` against `rgb(94,100,110)`. Light: `rgb(122,31,31)` / `rgb(229,182,182)` against `rgb(166,170,179)`. The Light screenshot shows the checked background under the error tone |
| R3 | tiles | data | only `--banner-fg`, `--banner-line` and `--disabled-fg` are used | pass | every computed colour equals that theme's resolved token (`#f3b7b7`/`#5a2c2c`/`#5a6070`, `#f4b9b9`/`#5c2f2f`/`#5e646e`, `#7a1f1f`/`#e5b6b6`/`#a6aab3`) |
| design-system §5 | tiles | data | `#model-error` uses `--fs-xs` and a mono font | pass | 11.25 px = `.75rem` × the 15 px root, `ui-monospace, SFMono-Regular…`, colour = `--banner-fg` |
| Hidden | focus, tiles | all | a `[hidden]` `#model-error` or `#launch-error` computes `display:none` | pass | every reading where the element was `H` also read `none` |
| every row | pop-out | — | — | N/A: `/doc.html` has no launch dialog | |
| REQ-1–5 timing and cache | — | — | parallel checks, per-identity cache, single-flight | N/A: nothing about these is visible in the browser (the stub answers in milliseconds). D1–D5 and D9 are review-work's | |
| REQ-11 / REQ-12 / INV-5 | — | — | atomic wrapper write | N/A: a fact about daemon files, with nothing shown in the dashboard | |
| §7 terminal rules | — | — | — | N/A: the plan touches no terminal surface. The probe's launches opened normally in both hosts (the tiles host showed a live 84×10 tile) | |

## Issues

### Critical

(none)

### Major

(none)

### Minor

(none)

Cycle 1's findings are resolved:
- Major 1 (duplicate and stale refusal text) is fixed per decision A, in every host and every submit path.
- Minor 1 (focus dropped to `BODY`) is fixed for both the custom input and the invalid preset radio, and the fix survives a tick.
- Minor 2 is fixed: the E4 test and both E6 tests in `web/e2e/launch-model-check.spec.ts` now assert that `#launch-error` is hidden, including after the edit. So they would fail on the cycle 1 build. A new focus-retention test uses a node-identity check.

### Notes

1. **[note]** Decision A's dissent (`#model-error` has no live region) is answered only when Launch had focus. When the refusal comes from Enter in Title (or Enter in the custom input), focus correctly stays where it was. In the Title case, though, the focused control is not `aria-describedby="model-error"`, and neither `#model-error` nor anything else is `role="alert"` or `aria-live`. So nothing tells assistive technology about the refusal. This is the scope the decision chose ("after a refusal disables a focused Launch"), so no change is requested. It is recorded in case the orchestrator wants it for the design-system §5 write-up.
2. **[note]** At 900×600 the custom-invalid dialog is 600 px of content in a 562 px box. The inserted `#model-error` pushes the footer, including Launch at 582–607, just below the visible bottom (582) until you scroll. Before the refusal it fit, off by 1 px. The dialog scrolls (`overflow-y:auto`), Launch is disabled in that state anyway, and focus lands on the visible custom input. Editing the text hides the message and the footer comes back. At 1280×560 the custom row overflows even before any refusal, which predates this plan. No change requested.
3. **[note]** This predates the plan: while a `POST /api/sessions` is in flight, Launch stays enabled and focused (P5: `launchDisabled:false`, `activeElement = BUTTON#launch-button` during a held POST). INV-1 mentions an in-flight submit as a disable reason that composes with it, but none exists on this tree. This plan doesn't touch it, and nothing here depends on it.
4. **[note]** R4 and R3 were measured in the tiles host, because the view preference from the preceding tiles pass persisted. Cycle 1 measured the same tokens in the focus host, and the style rules changed only in comments since then.

## Maintainability review

# Maintainability review: Maintainability Regressions

**Plan**: maintainability-regressions
**Part verdict**: needs-changes
**Cycle**: 2
**Pack**: kb: pack 20782 words (budget 20000) — sections: rules 1938 · features 2133 · diagrams 4305 · decisions 6992 · proposed 0 · facts 5237 · lessons 169 · runbooks 2 (WARN: over budget)
**Scope**: 15 files from `git diff main...HEAD -- cmd internal web/src ':!*_test.go' ':!*.test.ts'`. Four of them are GENERATED `CLAUDE.md` trailers: only the hash and record-count lines changed, plus the hand-written `launchmodels.ts` list entry in `features/CLAUDE.md`. This is a full re-review, not a delta, because cycle 1 had open Majors.

## Files

| File | Siblings opened | design: line | Size warnings | Result |
|------|-----------------|--------------|---------------|--------|
| internal/claudecode/settings.go | server/launcher.go `writeSettings`, selfupdate/apply.go `installBinary`, the leaf packages boundedwait/evict/keyedlock/locate (package docs and importers) | yes (`AtomicWriteFile` home, fix attempt 1) | — | pass (Notes 1, 2) |
| internal/claudecode/modelcheck.go | version.go, credentials.go, server/updatemanager.go:325 | yes (`BinaryIdentity`/`ResolveBinaryIdentity`) | — | pass |
| internal/server/launchermodels.go | browse.go, usage.go, issue.go, terminal.go (sentinels), session/writeorder.go | yes (`modelsFeature`, `inflight`, `modelVerdict`) | — | pass (Notes 3, 4) |
| internal/server/launcher.go | browse.go, usage.go | yes (`defaultClaudeBin`) | funlen `Launch` 83>60; pre-existing and unchanged, reason corrected in fix attempt 1 and it holds | pass |
| internal/server/launcherrors.go | respond.go | n/a (extract of an existing literal) | — | pass |
| internal/server/server.go | composition root, checked against kb:adr/process-composition-roots-registration-only | covered by the `modelsFeature` line | funlen `New` 42>40; reason in `New`'s doc comment holds | pass |
| web/src/api/launch.ts | api/reader.ts (`READER_LISTING_KINDS`/`isReaderListingKind`), api/issue.ts, api/update.ts, protocol/session.ts (`PERMISSION_MODES`) | yes (fix attempt 1, parser moved here) | — | pass |
| web/src/features/launchmodels.ts | launchcrumbs.ts, launchrestore.ts | yes | — | pass |
| web/src/features/launch.ts | issue.ts, surfaces.ts, connection.ts (focus handling) | yes | filelen 589; reason (controller glue, plus the writer-list and generation comments) holds | pass |
| web/src/render/launch.ts | render/crumbs.ts (`Crumb`), render/focuskeep.ts, render/diagramdialog.ts, render/rename.ts (`.focus()` in `render/`) | yes (corrected to cite `Crumb`) | — | pass |
| web/src/style.css | `.btn:disabled`, `.surfseg button:disabled`, `.launch-error` | n/a | — | pass (Note 6) |
| internal/server/launchermodels_test.go (size log only) | — | — | funlen `TestModelsFeature_CheckInFlightWhenIdentityChanges_NotCachedNorServed` 55>40 statements; **no reason** | Minor 1 |
| internal/claudecode/CLAUDE.md, internal/server/CLAUDE.md, web/src/features/CLAUDE.md, web/src/render/CLAUDE.md | — | generated trailer | — | not reviewed |

## Cycle 1 findings

| Cycle 1 finding | Fix commit | Verified how |
|-----------------|-----------|--------------|
| Major 1: duplicate atomic write | 893805c | `rg -n 'AtomicWrite\|writeScriptAtomically\|CreateTemp\|os\.Rename\(' internal cmd tools -g '!*_test.go'` shows one temp/fsync/rename body (`settings.go:376`), called from `settings.go:361` and `launcher.go:480`. The design line names the home and says why `selfupdate`'s variant is left out. |
| Major 2: `render/` → `features/` import | dea21cf | `rg -n '"\.\./features' web/src/render --glob '!*.test.ts'` finds nothing. `features/launchmodels.ts:7` imports the types from `../render/launch`, the same direction as `launchcrumbs.ts:5` → `render/crumbs`. |
| Minor 1: finishing call deletes a newer entry | 893805c | `launchermodels.go` has `if f.inflight[model] == call { delete(...) }`. `TestModelsFeature_CheckInFlightWhenIdentityChanges_NotCachedNorServed` drives the A/B/C interleaving through `identify`/`check`, under `-race` in the gates' test line. |
| Minor 2: waiters take the leader's ctx | 893805c | The run uses `context.WithoutCancel(ctx)`. Waiters `select` on `call.done` and on their own `ctx.Done()`. The verdict doc comment states the trade-off (see Note 3). |
| Minor 3: missing design: lines | 893805c | `design:` lines exist for `modelVerdict`, `BinaryIdentity`/`ResolveBinaryIdentity` (it weighs `updatemanager.go:325`) and `defaultClaudeBin`. |
| Minor 4: `Launch` funlen reason contradicts the code | log only | The fix attempt's Decisions entry says the warning is pre-existing on `main` and unchanged. That holds. |
| Minor 5: `protocol/models.ts` placement | dea21cf | `protocol/` no longer has `models.ts`. The parser sits in `api/launch.ts` beside `parseRepo`/`parseBrowseResult`. `MODEL_VERDICT_KINDS` + `isModelVerdictKind` follow `api/reader.ts:16-28` line for line. |
| Minor 6: `modelVerdicts` writers and generation | dea21cf | The declaration (`features/launch.ts:118-125`) names all three writers. `submit` now captures `generation` before `await launchSession(body)`, like `requestModelVerdicts`. |

## Issues

### Critical

None.

### Major

None.

### Minor

1. **[daemon-tests]** `internal/server/launchermodels_test.go:203`, `TestModelsFeature_CheckInFlightWhenIdentityChanges_NotCachedNorServed`, trips `funlen` (55 > 40 statements; `15-size.log`), and nothing in `daemon-tests.md` gives a reason. The test was added in the cycle-1 fix wave (0ceccac). The "Fix Cycle 1" section never mentions size. The only size claim in the log, "none of the touched test files triggered a size warning" (`daemon-tests.md:203`), dates from wave 1 and no longer holds. This breaks `docs/conventions.md` § Design, "Size is read, not obeyed … Exceeding one is fine with a reason in Decisions". To fix, the log must state a reason for this hit that the test's shape supports. Do not split the test (kb:adr/process-size-linters-warn-never-fail). The test is one ordered interleaving with four gate channels, and a table would not express that. If that is the reason, say so.

### Notes

1. **[note]** `AtomicWriteFile` is generic file I/O exported from the Claude Code adapter package, whose package doc says it is "the adapter boundary for everything Claude-Code-specific". The design line gives two reasons. There is no import cycle to break. A new package would need a feature-spec `go:` glob that daemon-impl cannot add mid-wave. The first reason only half holds: `internal/locate` is a leaf package that breaks no cycle (it is imported by `cmd/musterd` and `internal/server`). The second is a process limit, not a design reason. Both callers write Claude Code config files (the wrapper scripts and `settings.local.json`), so a newcomer would find this home plausible. `selfupdate.installBinary` is still a third variant, and the design line names it as a follow-up. That follow-up is worth a `TODO.md` entry, so it does not live only in a plan log.
2. **[note]** Behaviour for `review-work`, not shape. `writeSettings` now inherits `AtomicWriteFile`'s skip-if-unchanged path. Before, every launch rewrote `settings.local.json` and re-applied 0o600. Now a file whose bytes already equal `merged` keeps whatever mode it has. `writeSettings` also reads the file (`launcher.go:456`) and `AtomicWriteFile` reads it again to compare (`settings.go:377`).
3. **[note]** The leader of a shared check runs on `context.WithoutCancel(ctx)`, so the leader's own caller waits out the run (bounded by `modelCheckTimeout`, 5 s), even after its request has gone. Waiters do not wait. The `verdict` doc comment states this, and cycle 1 accepted either a fix or a stated reason. One symmetric alternative: start the run detached and have the leader `select` on `done`/`ctx.Done()` like the waiters. That would bring the whole function in line with § Go "nothing ignores ctx". No change requested.
4. **[note]** `modelCatalogCall.verdict` is shared across goroutines, but the lock doesn't guard it. It is written once by the leader before `close(done)` and read only after `<-done`, which is sound through the close's happens-before. The struct's doc says others "wait on done" but doesn't state that write-before-close rule. The `mu` comment on `modelsFeature` lists its own fields only. One clause would complete § Design "names its writers and its guard". `errModelsInvalid` (cycle 1 Note 5) is still a sentinel no caller branches on, and it still hard-codes "8" beside `modelsMaxRequested`.
5. **[note]** For `review-work`, comment truth:
   - `New`'s doc (`server.go:138`) says "13 features". The file has 17 `register(s,` calls, against 16 on `main`.
   - `render/launch.ts`'s `ModelRowState` doc says "`features/launchmodels.ts` recomputes this on every verdict arrival". The recompute happens in `features/launch.ts`'s `updateModelRowState`.
   - `MODEL_PRESETS`'s doc (`launchmodels.ts:9-10`) calls it "the one place this list is written" in the same sentence that says `index.html` names the same four values.
   - `AtomicWriteFile`'s doc lists its two callers by name, which will go stale the next time someone calls it.
6. **[note]** In `style.css`, `.seg-track label:has(input[aria-invalid="true"])` and `#custom-model-input[aria-invalid="true"]` still repeat the same outline, offset and colour declarations (cycle 1 Note 7). A selector list would give one rule.
7. **[note]** Diagram check: no new module or dependency edge. The `features/` → `render/` and `features/` → `api/` edges are already on kb:diagram/web-components. `server` → `claudecode` is already on kb:diagram/daemon-components. Focus placement in `render/launch.ts:206-210` has `render/` precedent (`focuskeep.ts:66`, `diagramdialog.ts:93,126`, `rename.ts:117`).
