# Review: maintainability-regressions

**Plan**: maintainability-regressions
**Verdict**: needs-changes
**Cycle**: 1
**Gates**: 1 failed
**Parts**: code, browser, maintainability
**Part verdicts**: code needs-changes, browser needs-changes, maintainability needs-changes

_Merged by orch-state.py merge-review; the verdict is computed from the parts and the gate run, never edited by hand._

## Correctness review

# Correctness review: Maintainability Regressions

**Plan**: maintainability-regressions
**Part verdict**: needs-changes
**Cycle**: 1
**Pack**: `kb: pack 29223 words (budget 20000)` — WARN over budget; sections rules 1984 · features 7394 · diagrams 4297 · decisions 6992 · proposed 836 · facts 5237 · lessons 2475 · runbooks 2 (features launch, ingest, connection)

## Requirements

| Req | Implemented | Tested | Status |
|-----|-------------|--------|--------|
| REQ-1 parallel `GET /api/models` | Yes — `launchermodels.go` `verdicts()` runs one goroutine per model | D2 `TestModelsFeature_FourUncachedModelsCheckedConcurrently`; D6 handler tests | pass |
| REQ-2 cache keyed on binary identity | Yes — `claudecode.ResolveBinaryIdentity` (LookPath → EvalSymlinks → Stat); `verdict()` clears both maps when the identity changes; 64-entry bound | D1, D3, `TestResolveBinaryIdentity_*` | pass |
| REQ-3 error/timeout/no identity → `unchecked`, not cached | Yes | D4 (both halves) | pass (see Notes: edge case 7 wording) |
| REQ-4 Launch reads the same cache | Yes — `newSessionLauncher`'s closure calls `models.verdict` | D9 `TestLauncher_CachedVerdict_LaunchRunsNoCheck` | pass |
| REQ-5 concurrent lookups share one run | Yes, except when the identity changes while a check runs (Minor 1) and when the initiating request is cancelled (Minor 2) | D5 | pass with Minors |
| REQ-6 request on open plus a restored non-preset | Yes — `openModal` → `requestModelVerdicts(MODEL_PRESETS)`; `applyModelRestore` | E1, the restore E2E test, `api/launch.test.ts` | pass |
| REQ-7 unselected unrecognised preset disabled | Yes — `deriveModelRowState` → `renderModelRowState` (`disabled`, `title`) | W1, E1, E3 | pass |
| REQ-8 selected unrecognised: kept, marked, Launch blocked | Yes | W1, E2, E3 | pass |
| REQ-9 custom refusal marks the field; editing clears it | Yes, by merging the refusal into the verdict store | W1, E4 | pass (see Major 6: where the message shows is contradictory in the plan) |
| REQ-10 failure marks nothing | Yes — a failed `checkModels` never calls `applyVerdicts` | E5 (Minor 4), `api/launch.test.ts` | pass with Minor |
| REQ-11 atomic replace, 0o700 temp file in the same directory | Yes — `writeScriptAtomically` | D7 | pass |
| REQ-12 unchanged content not touched | Yes | D8 | pass |
| REQ-13 stale verdicts ignored | Dialog-open requests: yes, via the per-open generation. The launch-refusal merge: no (Minor 3) | W3 | pass with Minor |
| DIAG | `kb:diagram/web-components` (stale: Major 3), `kb:diagram/containers` (stale: Major 4), `kb:diagram/daemon-components` (still true), the plan's launch-spec sequence delta (matches what shipped) | — | fail |

## Build & Tests

E2E tests: pass (460/460) · Daemon tests (race): pass (every package `ok`) · Web tests: pass (1857 in 76 files) · Daemon build: pass · Web build: pass · Lint: pass (golangci 0 issues, Biome clean) — all read from `$GATES_LOG_DIR`. The one red gate line is `comments` (Critical 1 and 2). `size` is WARN (4 hits), which is review-maintainability's to read.

## Acceptance Checks

| ID | Command | Result |
|----|---------|--------|
| D0 | `go build ./...` | pass (deduped to the baseline `build`, 01-build.log) |
| D10 | `make lint` | pass (deduped to baseline `lint`, 03-lint.log: 0 issues) |
| D11 | `make test` | pass (deduped to `test-race`) |
| D12 | `make test-race` | pass (deduped to baseline `test`, 02-test.log) |
| W0 | `make web-build` | pass (deduped, 04-web-build.log) |
| W4 | `make web-lint` | pass (deduped, 06-web-lint.log) |
| W5 | `make web-test` | pass (deduped, 05-web-test.log: 1857 passed) |
| E0 | `make e2e` | pass (deduped, 16-e2e.log: 460 passed) |
| K1 | `make check-kb` | pass (deduped, 10-kb-check.log) |
| baseline `comments` | `comment-checks.py --gates` | **FAIL**: 34 plan-ID comments (14-comments.log) |
| baseline contrast / versions / e2e-honest / dead-refs / e2e-lint / features | — | pass |
| DOC | doc upkeep + Doc Delta vs what shipped | pass: all four ADRs are `proposed` with `refs: plan:maintainability-regressions`, including `launch-check-model-seam-keeps-its-signature` for the one `deviation:` line; design-system §5 carries the invalid-field pattern; the `TODO.md` tick is at Completion, as the plan says. Every Doc Delta sentence matches the code. |

## Reviewer-Verified Criteria

| ID | Criterion | Result | Evidence |
|----|-----------|--------|----------|
| R1 | Catalog sentence and argv stay in `internal/claudecode`; the cache sees neutral verdicts only | pass | `launchermodels.go` imports only `CheckModel`, `ModelVerdict` and `BinaryIdentity`; `rg -- '--bare\|isn.t described'` finds nothing outside `internal/claudecode` |
| R2 | One cache owner, used by both endpoints | pass | `server.go:204` builds one `modelsFeature`, registers it and passes it into `newSessionLauncher`; no other caller of `claudecode.CheckModel` exists (`rg CheckModel internal cmd`) |
| R3 | No new colour token; only `--banner-fg`, `--banner-line`, `--disabled-fg` | pass | the `style.css` diff adds no `--x:` definition and no literal colour; `make contrast` 0 failures |
| R4 | In a browser, invalid reads as "selected and wrong" in all three themes, distinct from disabled | not mine | this is measured on screen, so it belongs to review-browser |
| R5 | No `any` in new web code | pass | no `any` or `as unknown as` in the added lines of `launchmodels.ts`, `protocol/models.ts`, `features/launch.ts`, `render/launch.ts`, `api/launch.ts` |
| R6 | Generated script body byte-identical | pass | the `settings.go` diff leaves the `writeEnvelopeScript` template untouched; only the write call after it changed |

## Hard-Rule Checklist

| # | Rule | Result |
|---|------|--------|
| 1 | Adapter boundary | pass |
| 2 | Terminal-output state parsing | pass (none) |
| 3 | Blocking hook handler | pass (no hook handler change) |
| 4 | Bare tmux / resize-pane | pass (no tmux added) |
| 5 | Payload logging | pass (logs carry only the model name and the error) |
| 6 | Empty-gauge dishonesty | pass (`unchecked` and "no answer yet" both lead to the unmarked branch) |
| 7 | Session identity on `session_id` | pass (n/a) |
| 8 | Settings trespass | pass |
| 9 | Real `claude` outside canary/probes | pass (every new test fakes `check`/`identify` or sets `PATH` to a temp dir; `newModelsTestHandler` avoids a full `New()` for exactly this reason) |

## Issues

### Critical

1. **[daemon-impl]** The `comments` gate line fails: production comments carry plan IDs. Flagged lines: `internal/server/launchermodels.go:15,25,36,46,48,64,73,140,170-172`, `internal/server/launcher.go:226` (`REQ-4`), `internal/claudecode/settings.go:357,361` (`REQ-11`, `REQ-12`), `internal/claudecode/modelcheck.go:145` (`REQ-3`). The gate's regex does not match Reviewer-Verified IDs, so these carry the same defect too: `launcher.go:114` (`R2`), `server.go:202` (`R2`), `launchermodels.go:44` (`R2`), `launchermodels.go:221` (`R1`). Fix: state the reason, or cite `kb:adr/…` / `kb:anchor/models.check`. Full list in 14-comments.log.
2. **[web-impl]** Same gate line, web side: `web/src/features/launch.ts:62,121,150,151,172,416,499`, `web/src/features/launchmodels.ts:26,30,32,35,61`, `web/src/render/launch.ts:146,148,149`, `web/src/style.css:2864,2876,2900,2913`. `render/launch.ts:146` also names the plan (`plan maintainability-regressions`), and so does `launchmodels.ts:1-2` (`plan maintainability-regressions, #55`); `features/launch.ts:118-119` has the same. Same fix.

### Major

1. **[daemon-impl]** `internal/claudecode/modelcheck.go` now has comments that are false about what shipped:
   - `:39-40` says `dir` "is prepended because this check must run in the launch directory". The only production caller now runs it in `os.TempDir()`, per the Protocol Contract's "daemon-chosen directory, not a launch directory".
   - `:101-105` says CheckModel's error is "returned to the caller so Launch can fail open". The caller is now `modelsFeature`, which turns the error into `unchecked`.
   - `:28`, `:64` and `:105` still cite the superseded `kb:adr/launch-refuses-model-outside-binary-catalog` for the fail-open.

   Fix: reword the comments to say the check runs in a caller-chosen directory and to name the cache as the caller, and cite `kb:adr/launch-model-check-cached-per-binary-identity`.
2. **[web-impl]** The hand-written part of `web/src/features/CLAUDE.md:3` lists "the pure ones: `actionscopy.ts`, `connectionrestore.ts`, `connectionversion.ts`, `launchcrumbs.ts`, `launchrestore.ts`, `updateview.ts`". It leaves out the new `launchmodels.ts`, which web-impl's own log places in exactly this shape. The list is now incomplete, and it disagrees with `kb:diagram/web-components`, which was updated to "7 DOM-free helpers". Fix: add `launchmodels.ts`.
3. **[web-impl]** DIAG: `kb:diagram/web-components` is now false. Its prose says the graph "is acyclic… `render/`… sit[s] below `features/`… no loop closes back up". `web/src/render/launch.ts:10` (`import type { ModelRowState, ModelSelection } from "../features/launchmodels"`) is the first import from `render/` into `features/` (`rg '"\.\./features' web/src --glob '!*.test.ts'` outside `features/` finds only it). That creates a `features/`↔`render/` loop. The diagram draws type-only edges (`Rel(render, terminal, "segment types")`, `Rel(render, app, "status type")`), and it records cutting a cycle by moving a type (`ConnectionStatus` off `render/masthead.ts`). Fix: remove the edge, e.g. declare the two interfaces where `render/` owns them and have `features/launchmodels.ts` import them in the direction the diagram draws. If the orchestrator would rather keep the edge, the diagram record must draw it and drop the acyclic claim, which makes it `[orchestrator]`. Whether the edge is the right shape is review-maintainability's to rule on.
4. **[orchestrator]** DIAG: `docs/diagrams/containers.md:62` (`kb:diagram/containers`, named by `kb for internal/server/server.go`) still describes Claude Code as "…plus a version probe at startup and a model-catalog check before each launch". The check now runs when the dialog opens, and its result is cached per binary identity. A launch normally reads the cache and runs no check. Neither the Doc Delta nor the plan's Diagrams section covers this record.
5. **[e2e-specs]** `web/e2e/launch-model-check.spec.ts:256-257` has a comment that says "the refused custom field is marked… via #model-error, not #launch-error". Line 254, just above it, asserts `launchError(dialog).toHaveText(REFUSAL_MESSAGE)`, so the test asserts the opposite of its own comment. `test-specs.md`'s row for this test makes the same false claim. Fix: make the comment and the row say what the test asserts. Its final wording depends on how Major 6 is decided.
6. **[orchestrator:decision]** The plan contradicts itself on where a custom-model refusal's message goes. UI Flow 5 says the message goes "in `#model-error`, not in `#launch-error`". E6 says the pre-existing refusal tests "pass unchanged", and both of them assert `#launch-error` shows that message (`launch-model-check.spec.ts:59-60,117-118`). The shipped code shows it in both (`features/launch.ts:415` `showError` is unconditional, then the verdict merge). The two options:
   - **A — both (as shipped):** the message appears in `#launch-error` and in `#model-error`. E6 holds as written; Flow 5 and the launch spec/ADR wording are amended to say both. It costs a duplicated message on screen.
   - **B — `#model-error` only:** `submit()` skips `showError` for `model_unrecognized`. Flow 5 holds; E6 is amended and the two pre-existing tests change to assert `#model-error`. It costs editing tests an approved criterion froze, a web-impl and e2e-specs wave, and possibly a user decision if amending E6 counts as scope.

### Minor

1. **[daemon-impl]** `internal/server/launchermodels.go:207`: `delete(f.inflight, model)` runs whatever the generation is. Say a check started under identity A finishes after a lookup under identity B has reset the maps and registered its own in-flight call. The A check then deletes B's entry from the new map, and the next lookup under B starts a second run for the same (identity, model), which REQ-5 forbids. Fix: delete only when `f.generation == generation` (or when `f.inflight[model] == call`).
2. **[daemon-impl]** `internal/server/launchermodels.go:203`: the shared run uses the initiating request's `ctx`. If that request is cancelled (a page reload during the dialog's cold check), every caller that joined the run gets `unchecked`, including a Launch pressed during that second. That Launch then proceeds with a model the binary would have refused. So a joiner's answer depends on another caller's lifetime, which is not what "share one run" means. Fix: run the shared check on `context.WithoutCancel(ctx)`. CheckModel's own 5 s timeout still bounds it.
3. **[web-impl]** `web/src/features/launch.ts:421`: the REQ-9 merge passes `modelVerdicts.generation` as read when the POST answers, not when it was sent. A refusal that arrives after the dialog was cancelled and reopened is merged into the new open's store, which REQ-13 ("that covers a closed dialog") rules out. Fix: capture the generation before `await launchSession(body)`, as `requestModelVerdicts` already does.
4. **[e2e-specs]** `web/e2e/launch-model-check.spec.ts:313-331` (E5): every assertion checks that something is absent, and nothing ties them to the verdict request having happened and failed. Playwright's `toBeEnabled`/`toBeHidden` pass on the first poll, so the test passes whether or not the failed request is handled correctly. It also went green before the feature existed ("ran-green-at-authoring"). Fix: before asserting, wait for the `/api/models` request to fail (`page.waitForEvent("requestfailed", r => r.url().includes("/api/models"))`).
5. **[daemon-tests]** INV-3's only non-trivial path has no test: the generation guard that stops a check started under identity A from caching its verdict once a lookup under B has run. D3 covers only the sequential case. Fix: add a test that holds the A check in `f.check`, runs a lookup that returns B, releases A, and asserts that B's lookup is not served A's verdict and that A's result is not cached. Once Minor 1 is fixed, also assert that a second concurrent B lookup still shares B's run.

### Notes

1. **[note]** Edge case 7 says an unresolvable binary's "check still runs as today". The code returns `unchecked` without running it (`TestModelsFeature_UnresolvableIdentity_UncheckedWithoutRunningCheck` asserts 0 runs). The outcome is identical: `unchecked`, not cached, fail-open. I request no change.
2. **[note]** The coverage is looser than the criteria's wording in three places, with no change requested. D3 changes size and mtime together but never the resolved path alone; struct `==` covers the path. D6 asserts the `invalid_request` code but not the contract-pinned message. D4's timeout case goes through the same error path as the run-error case.
3. **[note]** D5 (`launchermodels_test.go:187`) sleeps 20 ms to give both goroutines time to start. A broken coalescer still fails with high probability, and the comment says this honestly.
4. **[note]** Edge case 11's "marked before any Launch" for a restored non-preset model is proved only as the pieces: the restore E2E test shows the request fires, and W1 covers deriving the mark. `test-specs.md` explains why the full scenario cannot be seeded end to end.
5. **[note]** The `title` sits on the radio, not the label the plan's sentence names. The radio covers its label (`.seg-track input { position: absolute; inset: 0 }`), so a hover lands on it. Whether the tooltip shows on a *disabled* input is review-browser's to measure.
6. **[note]** For review-maintainability: the size WARNs (`launcher.go` `Launch` funlen and file length, `server.go` `New`, `features/launch.ts` 580 lines) and the shape of the `render`→`features` type import (Major 3).
7. **[note]** For the orchestrator: `comment-checks.py`'s `PLAN_ID` regex (`[DWE]\d`) misses Reviewer-Verified IDs (`R1`, `R2`), so four such comments passed the gate (Critical 1). Whether to widen it is a pipeline change the orchestrator can propose.

## Browser review

# Browser review: Maintainability Regressions

**Plan**: maintainability-regressions
**Part verdict**: needs-changes
**Cycle**: 1
**Pack**: kb: pack 16131 words (budget 20000)
**Rig**: `make web-build build` at ef572b9 (tree dirty only in `orchestration-state.json`); scratch daemons from the committed `web/e2e/helpers` (`startDaemon`), data dirs `$TMPDIR/muster e2e-XXXX` (space-bearing), tmux `-S <dataDir>/tmux.sock`, the shared stub `claude` (`$TMPDIR/muster e2e-stub-cd75a542396fd84f`); headless Chromium at 1280×720 and 900×600; two throwaway specs (19 probe tests), deleted afterwards; `git status --porcelain` shows only the orchestrator's `orchestration-state.json`; no `musterd`/tmux left running.

Gates log: the one red line is `14-comments` (plan IDs in `style.css` comments, which belongs to review-work). `16-e2e` (460 passed) and `04-web-build` are green, so the app I drove is the one that will ship.

How I set things up: a "Claude Code update that drops a model" was simulated by launching a session with that model on a clean stub, then restarting the same scratch daemon with the stub's `MUSTER_E2E_STUB_UNRECOGNIZED_MODELS` set to it. That gives a real recent whose remembered model the binary now refuses (plan User Flow 3 and edge case 11), without faking any response. I stubbed a response body only where the cell needs one: `unchecked`, a non-2xx reply, and a stale body.

## Matrix

Hosts: **focus** = the dialog opened from Focus view. **tiles** = opened after pressing Tiles (`aria-pressed=true`). **pop-out** = `/doc.html`, which has no launch dialog (`grep launch-dialog web/doc.html` finds nothing), so every pop-out cell is N/A for that reason.

| Req | Host | State | Claim | Result | Evidence |
|-----|------|-------|-------|--------|----------|
| REQ-6 | focus, tiles | no data yet | open requests the four presets | pass | route saw exactly `?model=sonnet&model=opus&model=haiku&model=fable`, one request per open |
| REQ-6 / edge 11 | focus, tiles | data | a restored non-preset gets its own request | pass | requests `[…4 presets…, "?model=zephyr-probe"]` |
| REQ-6 | pop-out | — | — | N/A — no dialog in `/doc.html` | |
| no-data-yet (UI States) | focus, tiles | no data yet (response held 1.2 s) | nothing marked or disabled, no spinner | pass | all 5 radios enabled with no `aria-invalid`; `#model-error` `hidden` + computed `display:none`; Launch `disabled=false` |
| REQ-7 | focus, tiles | data | unrecognised unselected preset disabled | pass | `fable:D`, label computed `color rgb(90,96,112)` = resolved `--disabled-fg` |
| REQ-7 | focus, tiles | data | marked "not recognised" (title reachable) | pass | `elementFromPoint` at the label centre is the INPUT, which carries `title="Claude Code doesn't recognise this model"` |
| REQ-7 | focus, tiles | data | pointer can't select it | pass | real click on fable's label: fable `checked=false`, sonnet still checked |
| REQ-7 | focus, tiles | data | keyboard skips it | pass | Tab into group, then ArrowRight ×5: `sonnet→opus→haiku→other→sonnet→opus` |
| REQ-7 | focus, tiles | data | keeps focus across a render tick | pass | focused radio `haiku` before and after 1.5 s |
| REQ-8 | focus, tiles | data (remembered `fable`, now refused) | kept selected, marked, message, Launch disabled | pass | `fable:CI` (checked, enabled, `aria-invalid=true`, `aria-describedby=model-error`); label `color rgb(243,183,183)`=`--banner-fg`, `outline solid 1px rgb(90,44,44)`=`--banner-line`; `#model-error` `display:block`, accessible text (aria-hidden glyph excluded, trimmed) exactly the daemon message; Launch `disabled=true` |
| REQ-8 | focus, tiles | data | Enter in Title can't submit while blocked | pass | Enter pressed in `#title-input`: 0 `POST /api/sessions`, dialog open |
| REQ-8 | focus, tiles | data | keyboard focus on the invalid radio survives a tick | pass | `fable` before and after 1.5 s |
| REQ-8 | focus, tiles | data | pointer pick of sonnet clears it, fable disabled | pass | `sonnet:C`, `fable:D`, `#model-error` `display:none`, Launch enabled; Launch then posts once and closes |
| REQ-8 / INV-2 | focus, tiles | data | `#model-error` contained, not overflowing | pass | box x297–983 inside dialog 280–1000; `scrollWidth 686 = clientWidth 686`; dialog `sh 548 = ch 548`; at 900×600 dialog 25–575 fits the 600 viewport |
| REQ-9 | focus, tiles | data | custom refusal marks Custom model | pass | input `aria-invalid=true`, `outline solid 1px rgb(90,44,44)`, `color rgb(243,183,183)`; Launch disabled; the same happens for Enter from the input |
| REQ-9 | focus, tiles | data | message in `#model-error`, **not** `#launch-error` (User Flow 5) | FAIL | both visible with the same sentence (`#launch-error` `display:block`, same text) (Major 1) |
| REQ-9 | focus, tiles | data | editing the text clears the mark | pass | Backspace: input `aria-invalid` removed, `#model-error` `display:none`, Launch enabled |
| REQ-8/9 | focus, tiles | data | after edit or re-select, no refusal message remains | FAIL | after Backspace, and after picking `haiku`, `#launch-error` still reads `…the model "muster-e2e-unrecognized-zz"…` while Launch is enabled (Major 1) |
| REQ-9 | focus, tiles | data | focus survives a refusal from a focused Launch | FAIL | pointer click or Tab+Enter on Launch → refusal disables Launch → `activeElement` = `BODY`; the next Tab also leaves `BODY` (Minor 1) |
| REQ-9 | focus | data | retyping the refused text re-marks it | pass | `zz` again → `aria-invalid=true`, message back (the latest verdict for that text) |
| REQ-10 / edge 1 | focus, tiles | daemon-down (SIGTERM) | nothing marked or disabled | pass | all radios enabled with no `aria-invalid`; `#model-error` `display:none`; Launch enabled |
| REQ-10 | focus, tiles | daemon-down | daemon-down surfaced prominently (§6) | pass | `#banner` "musterd unreachable — …" at 0,46 1280×32 `display:block`; dialog `#launch-error` "Could not reach musterd." |
| REQ-10 | focus, tiles | daemon-down | Launch reports its own error as today | pass | Launch → `#launch-error` "Choose a directory to launch into." (behaviour predates this plan, see Note 3) |
| REQ-10 | focus | data (non-2xx reply) | a 500 marks nothing | pass | fulfilled 500: every radio unmarked, Launch enabled |
| INV-4 (web half) | focus | data (`unchecked` for all) | `unchecked` never marks or disables | pass | `sonnet:C opus: haiku: fable: other:`, no message, Launch enabled |
| INV-1 | focus | data | custom selected with empty text doesn't block | pass | `other:C`, custom `""`, Launch enabled, no message |
| REQ-13 / edge 2 | focus | data | a late response from a closed dialog is ignored | pass | 1st open's response held, dialog closed and reopened, then a stale body (`sonnet`/`opus` unrecognized) released: sonnet/opus unmarked and enabled; only the reopen's fable verdict applies |
| REQ-13 / edge 2 | focus | data | closed before arrival, reopen issues its own | pass | reopen settles to `fable:D`, sonnet unmarked |
| REQ-13 / edge 3 | focus | data | custom edited while its verdict is in flight | pass | restored `zed-probe`, typed `x`, then released: `zed-probex` unmarked, Launch enabled; Backspace back to `zed-probe` → marked (correct verdict for that text) |
| edge 4 | focus | data | verdict lands after switching presets | pass | fable clicked, then haiku, then release: `haiku:C` unmarked, `fable:D` |
| R4 | focus | data | invalid reads "selected and wrong", distinct from disabled, in each theme | pass | instrument: invalid `rgb(243,183,183)`+`1px rgb(90,44,44)` vs disabled `rgb(90,96,112)`; dark: `rgb(244,185,185)`+`rgb(92,47,47)` vs `rgb(94,100,110)`; light: `rgb(122,31,31)`+`rgb(229,182,182)` vs `rgb(166,170,179)`; screenshots confirm the checked background stays under the error tone |
| R3 | focus | data | only `--banner-fg`/`--banner-line`/`--disabled-fg` | pass | every computed colour above equals the resolved token in that theme |
| Hidden | focus, tiles | all | `[hidden]` `#model-error` computes `display:none` | pass | `display:none` in every hidden reading (covered by `.fields [hidden]`) |
| REQ-1 / edge 9 / edge 10 | — | data (oracle) | wire shape, dedupe, errors | pass | `?fable&sonnet&fable&opus` → 3 entries in first-seen order, `message` only on fable; none, empty and 9 models → 400 `invalid_request`; no cookie → 401 `unauthorized` |
| REQ-1/2/3/4/5 timing and cache | — | — | parallel cost, per-identity cache, single-flight | N/A — no browser-observable consequence; the stub answers in ms (cold 28 ms, warm 6 ms). D1–D5, D9 are review-work's | |
| REQ-11 / REQ-12 / INV-5 | — | — | atomic wrapper write | N/A — a daemon file fact, nothing in the dashboard | |
| §7 terminal rules | — | — | — | N/A — the plan touches no terminal surface; launches from the probe opened normally in both hosts | |

## Issues

### Critical

(none)

### Major

1. **[web-impl] [orchestrator:decision]** A `model_unrecognized` refusal shows the same sentence twice, and one copy goes stale. `web/src/features/launch.ts` `submit()` calls `showError(result.error.message)` for every refusal as well as folding it into the verdict store. So `#launch-error` and `#model-error` both show the refusal, about 125 px apart (P4, Q2, and the custom-invalid screenshots in all three themes). Plan User Flow 5 says the message goes "in `#model-error`, not in `#launch-error`". Worse, `#launch-error` is never cleared by the edit or re-selection that clears the mark. After Backspace in the field, or after picking `haiku`, the dialog still says `Claude Code doesn't recognise the model "muster-e2e-unrecognized-zz"` while Launch is enabled and the field holds a different value. That contradicts REQ-8's "clears the mark and the message". web-impl kept the call on purpose, because E6's two pre-existing tests assert `#launch-error`. The plan contradicts itself (Flow 5 against "E6 passes unchanged"), which is why this needs a decision:
   - **(A)** A `model_unrecognized` refusal goes to `#model-error` only (no `showError` for that code). E6's two existing tests move their assertion to `#model-error`, and the plan records that E6 changed.
   - **(B)** Keep both, but clear `#launch-error` whenever the model selection or custom text changes, and amend Flow 5 to say both show.

   Either fix must make this true: once the mark has cleared, no visible refusal text names a model that is no longer selected.

### Minor

1. **[web-impl]** Launch loses keyboard focus when a refusal disables it. If Launch is activated from the button (a pointer click, or Tab then Enter), the refusal sets `launchButton.disabled = true` on the focused element. `document.activeElement` drops to `BODY`, and the next Tab leaves `BODY` too; only Shift+Tab gets back to Cancel (Q2). `web/src/render/launch.ts` `renderModelRowState`. A fix must make this true: after a refusal that disables a focused Launch, focus lands on the invalid control (the custom input or the invalid radio).
2. **[e2e-specs]** The E4 test in `web/e2e/launch-model-check.spec.ts` ("an unrecognised custom model submitted via Launch…") asserts `launchError(dialog)` has the refusal text, next to a comment reading "via #model-error, not #launch-error". So it encodes Major 1's duplicate as expected, and no test checks that `#launch-error` is gone after the edit. It could not have failed for Major 1. Whichever option is chosen, the spec should assert that option's `#launch-error` state after the refusal and after the edit.

### Notes

1. **[note]** When `other…` is selected, `#model-error` sits between the Model row and the `Custom model` input it describes, so the message reads above its field (custom-invalid screenshots). This is where the plan puts it ("directly after the Model fieldset"). No change requested; it is recorded for the design-system §5 pattern write-up.
2. **[note]** When `#model-error` appears, the dialog grows 24 px and re-centres. It moves up 12 px (y 97→85), so the Model row shifts under the pointer about 1 s after open, in the post-update case. No change requested.
3. **[note]** With the daemon down, pressing Launch replaces "Could not reach musterd." with "Choose a directory to launch into.", because the browse listing never loaded. This predates this plan, and REQ-10 keeps it as it was.
4. **[note]** The cells for REQ-1–5 (parallelism, per-identity cache, single-flight) and REQ-11/12 (atomic write) have no browser-visible consequence. I cross-checked only the wire shape, dedupe, 400 and 401 against `GET /api/models`; the rest belongs to review-work's D1–D9.
5. **[note]** The red gate `14-comments` (plan IDs in `web/src/style.css` comments at 2900/2913) belongs to review-work.

## Maintainability review

# Maintainability review: Maintainability Regressions

**Plan**: maintainability-regressions
**Part verdict**: needs-changes
**Cycle**: 1
**Pack**: kb: pack 20774 words (budget 20000) — sections: rules 1938 · features 2133 · diagrams 4297 · decisions 6992 · proposed 0 · facts 5237 · lessons 169 · runbooks 2 (WARN: over budget)
**Scope**: 16 files from `git diff main...HEAD -- cmd internal web/src ':!*_test.go' ':!*.test.ts'` (4 of them are GENERATED `CLAUDE.md` trailers, not reviewed for shape)

## Files

| File | Siblings opened | design: line | Size warnings | Result |
|------|-----------------|--------------|---------------|--------|
| internal/claudecode/modelcheck.go | version.go, credentials.go (seam shape), settings.go | none for `BinaryIdentity`/`ResolveBinaryIdentity` | — | Minor 3 |
| internal/claudecode/settings.go | server/launcher.go `writeSettings`, selfupdate/apply.go `installBinary` | none for `writeScriptAtomically` | — | Major 1 |
| internal/server/launchermodels.go | browse.go, usage.go, repos.go, launcherrors.go, session/writeorder.go (cited coalescing precedent), updatemanager.go | yes (`modelsFeature`, `inflight`); none for `modelVerdict` | — | Minor 1, Minor 2, Minor 3 |
| internal/server/launcher.go | browse.go, usage.go (constructor shape) | none for `defaultClaudeBin` | funlen `Launch` 83>60, filelen 507 | Minor 3, Minor 4 |
| internal/server/launcherrors.go | respond.go | n/a (extract of an existing literal) | — | pass |
| internal/server/server.go | — (composition root; checked against kb:adr/process-composition-roots-registration-only) | covered by `modelsFeature` line | funlen `New` 42>40, reason in `New`'s doc comment holds | pass (note) |
| web/src/api/launch.ts | api/issue.ts, api/reader.ts, api/update.ts, api/sessions.ts | n/a | — | pass |
| web/src/protocol/models.ts | protocol/update.ts, protocol/prefs.ts, protocol/session.ts; api/launch.ts, api/issue.ts, api/reader.ts | none | — | Minor 5 |
| web/src/features/launchmodels.ts | launchcrumbs.ts, launchrestore.ts | yes | — | pass |
| web/src/features/launch.ts | issue.ts, surfaces.ts (request-counter idiom) | yes (REQ-13 generation) | filelen 580, reason holds | Minor 6 |
| web/src/render/launch.ts | render/crumbs.ts, render/masthead.ts | yes (flagged as a judgment call) | — | Major 2 |
| web/src/style.css | `.launch-error`, `.seg-track` rules | n/a | — | pass (note) |
| internal/claudecode/CLAUDE.md, internal/server/CLAUDE.md, web/src/features/CLAUDE.md, web/src/render/CLAUDE.md | — | generated trailer only | — | not reviewed |

## Issues

### Critical

None.

### Major

1. **[daemon-impl]** `writeScriptAtomically` is a second implementation of the temp-file, fsync, chmod and rename replace that `sessionLauncher.writeSettings` already does. See `internal/claudecode/settings.go:364` against `internal/server/launcher.go:474-505`. This breaks `docs/conventions.md` § Design, "Reuse before add … A second implementation of an existing idea is a defect even when both work". Decisions has no `design:` line for the new helper and no grep. The two bodies match nearly line for line. They use the same temp-name pattern `"."+filepath.Base(path)+".tmp-*"`, the same `defer func() { _ = os.Remove(tmpPath) }() // no-op once the rename below succeeds`, and the same comment, `// fsync before the rename, or a crash between them can still lose the write despite the rename itself being atomic (durable, not just atomic).` They differ only in the file mode and in where the chmod sits.
   ```
   $ rg -n 'CreateTemp|os\.Rename\(' internal cmd tools -g '!*_test.go'
   internal/selfupdate/install.go:158:	f, err := os.CreateTemp(dir, ".musterd-writable-*")
   internal/selfupdate/apply.go:232:	if err := os.Rename(tmpPath, exePath); err != nil {
   internal/claudecode/settings.go:373:	tmp, err := os.CreateTemp(dir, "."+filepath.Base(path)+".tmp-*")
   internal/claudecode/settings.go:400:	if err := os.Rename(tmpPath, path); err != nil {
   internal/server/launcher.go:481:	tmp, err := os.CreateTemp(settingsDir, "."+filepath.Base(path)+".tmp-*")
   internal/server/launcher.go:503:	if err := os.Rename(tmpPath, path); err != nil {
   ```
   A fix must leave one implementation of "atomically replace a file with these bytes at this mode". Both the wrapper-script writer and `writeSettings` must call it. A `design:` line must name its home and why that package owns it. It is generic file I/O, not Claude Code format, so "it's in `claudecode/` because the scripts are" is not enough of a reason. `selfupdate.installBinary` (`apply.go:220`) is a third, older variant with a fixed temp name and no fsync. The line should say whether it folds in too or why not.

2. **[web-impl]** `render/launch.ts:10` adds `import type { ModelRowState, ModelSelection } from "../features/launchmodels"`. It is the only shipped `render/*.ts` → `features/` edge, and it inverts the layering that three places document. kb:diagram/web-components says "features above render", with `features → render` as the only drawn direction. `web/src/render/CLAUDE.md` says wiring lives in `features/` and "a builder here takes the computed value". § Composition roots says "`render/` holds the DOM half only, taking the already-computed value as a parameter". The `design:` line says the only alternative was "two structurally-identical interfaces, one per file". The exact sibling in this same launch feature shows a third option: the type lives with the DOM half and the pure helper imports it downward.
   ```
   web/src/features/launchcrumbs.ts:5:import type { Crumb } from "../render/crumbs";
   web/src/render/crumbs.ts:8:export interface Crumb {
   ```
   Beside it, the new code has:
   ```
   web/src/render/launch.ts:10:import type { ModelRowState, ModelSelection } from "../features/launchmodels";
   ```
   A fix must leave `render/` importing nothing from `features/`. The parameter types `renderModelRowState` takes must be declared where `features/` already reaches, as `Crumb` is. The `design:` line must be corrected to name the sibling it matches.

### Minor

1. **[daemon-impl]** `modelsFeature.verdict` can let two check runs for the same (identity, model) go at once. Its own `modelCatalogCall` doc says this never happens ("every other caller for the same key waits on done instead of starting a second one"). The cause is that a finishing call deletes whatever inflight entry holds its key, including a newer generation's entry. Concrete interleaving:
   - A calls `verdict("opus")` under identity 1, registers `inflight1["opus"]=callA` and runs.
   - The binary changes.
   - B calls `verdict("opus")`, sees the new identity and replaces the map (`launchermodels.go:187`). It registers `inflight2["opus"]=callB` and runs.
   - A finishes. `delete(f.inflight, model)` (`:207`) removes callB from `inflight2`. The generation check correctly skips caching.
   - C calls `verdict("opus")`. It finds no cache entry and no inflight entry, so it starts a second concurrent run.
   - When B finishes it deletes C's entry the same way.

   Every run still returns a correct verdict, so this is extra subprocesses, not wrong answers. It breaks § Design, "Shared state names its writers and its guard": the guard is present, but the map's invariant is not held under it. None of the `TestModelsFeature_*` cases changes identity while a check is in flight. A fix must make a finishing call remove only its own entry, and a unit test must drive that interleaving through the `identify`/`check` seams.

2. **[daemon-impl]** Waiters on a shared run get the answer that depends on the leader's context. They also ignore their own context: `<-call.done` at `launchermodels.go:196` has no `ctx.Done()` arm, and the run uses the leader's `ctx` (`:203`). This breaks § Go, "context.Context is the first parameter of anything that blocks … nothing ignores ctx". Concrete interleaving:
   - The dialog-open `GET /api/models?model=opus` is the leader.
   - Its client goes away (a page reload), so `r.Context()` is cancelled. `runModelCheck` returns `ctx.Err()` (`modelcheck.go:90`), and the run becomes `catalogUnchecked`.
   - A `POST /api/sessions` with `model=opus`, already waiting on that call, gets `unchecked`. `newSessionLauncher`'s closure maps that to `ModelRecognised`, and the launch proceeds unchecked.

   On `main` that launch ran its own check under its own context. The cited precedent, `session/writeorder.go`'s write chain, also waits without ctx, but its waiters don't consume the leader's result. A fix must make one caller's cancellation unable to become another live caller's verdict. Alternatively, a `design:` line can state why that is accepted here.

3. **[daemon-impl]** New types and helpers have no `design:` line, which breaks § Design ("reported in its log's `## Decisions` as a `design:` line per new type, module or seam"):
   - `claudecode.BinaryIdentity`/`ResolveBinaryIdentity` (`modelcheck.go:130-160`). This is a new exported type in the adapter whose own doc calls it "generic file identity, not anything about Claude Code". `internal/server/updatemanager.go:325` already identifies a binary by size and mtime (`info.Size() == prev.Size() && info.ModTime().Equal(prev.ModTime())`). The line should say whether that was considered.
   - `modelVerdict`, the server-side tri-state beside `claudecode.ModelVerdict` (`launchermodels.go:23-33`).
   - `defaultClaudeBin` (`launcher.go:104`).

   A fix must add a `design:` line for each, giving the shape, why, and what it reused or matched.

4. **[daemon-impl]** The size reason for `launcher.go`'s `Launch` funlen hit contradicts the code. Decisions says `Launch` "crossed `funlen`'s 60-line threshold … from the `checkModel`/`newSessionLauncher` doc-comment expansion". But the only change inside `Launch` is two comment lines (hunk `@@ -208,10 +222,12 @@`), and funlen counts no comments. Counting non-comment lines in the body gives 83 on both `main` (`launcher.go:205-302`) and this branch (`:219-318`), so the warning predates the branch unchanged. The entry gives no reason why an 83-line `Launch` is fine; it only misattributes the cause. kb:adr/process-size-linters-warn-never-fail asks for a reason, and this is none. A fix must make the Decisions line state the pre-existing length and a reason that holds, or state that it is pre-existing and out of this plan's scope. Do not split `Launch`.

5. **[web-impl]** `web/src/protocol/models.ts` is a new module with no `design:` line. Its placement differs from every sibling HTTP-only response parser. `protocol/`'s other modules (`hello`, `messages`, `session`, `prefs`, `theme`, `update`, `usage`) are wire concepts the WS stream carries. Each HTTP-only response keeps its type and parser in its `api/<family>.ts`: `api/launch.ts:40 parseRepo`, `:91 parseBrowseResult`, `api/issue.ts:20 parseIssueCapture`, `api/reader.ts:51 parseReaderListing`, `api/update.ts:47 parseRestartImpact`, `api/terminal.ts:11 parseLocatedFile`. `GET /api/models` is HTTP-only. Its one runtime importer is `api/launch.ts:5`, and `features/launchmodels.ts` needs only the type, just as `launchrestore.ts:5` takes `Repo` from `api/launch`. This breaks § Design, "Match the siblings … or says in Decisions why it diverges". A fix must either put the verdict type and parser where the other launch-endpoint parsers live, or add a `design:` line saying why this wire gets a `protocol/` module.

6. **[web-impl]** The `modelVerdicts` declaration doesn't name all its writers, and one of them skips the generation capture the module rests on. The declaration (`features/launch.ts:118-122`) says "Read only through `updateModelRowState`/`requestModelVerdicts` below". Yet `resetForm` (`:382`) and `submit` (`:421`) also write it. `submit` passes `modelVerdicts.generation` read after `await launchSession(...)`, so its merge can never be dropped. `requestModelVerdicts` (`:154`) captures the generation before its await. Concrete interleaving:
   - Submit a model.
   - Press Cancel while the POST is in flight, then reopen. `resetVerdictStore` bumps the generation.
   - The 400 `model_unrecognized` lands and merges into the new open's store.

   `launchmodels.ts:59-63` says this staleness is what the generation exists to prevent. This breaks § Design, "Shared state names its writers and its guard". A fix must make the declaration name every writer. The launch-time merge must then either capture the generation before its await, like its sibling does, or state why a refusal deliberately applies to whichever open is current.

### Notes

1. **[note]** `review-work`'s part:
   - `features/CLAUDE.md`'s list of pure `<owner><concern>.ts` modules (`actionscopy.ts, connectionrestore.ts, connectionversion.ts, launchcrumbs.ts, launchrestore.ts, updateview.ts`) doesn't include `launchmodels.ts`.
   - `New`'s doc comment (`server.go:138`) still says "13 features".
   - The `.field-error` CSS comment says "same tone/type as `.launch-error`", but it uses `--fs-xs` against `.launch-error`'s `--fs-sm`.
   - The comments gate (`14-comments.log`) lists about 30 REQ-/INV-/D-/plan-name citations in shipped comments.
2. **[note]** For `review-work`'s DIAG row: the `render → features` edge in Major 2 is not drawn on kb:diagram/web-components. It goes away if Major 2 is fixed.
3. **[note]** The production `checkModel` closure (`launcher.go:127-132`) never returns an error, because `runCheck` now logs and folds errors into `catalogUnchecked`. Launch's own warn-and-proceed branch is therefore reachable only from test literals. It also round-trips the verdict: `claudecode.ModelVerdict`+err → `modelVerdict` → `claudecode.ModelVerdict`+nil. This is the shape kb:adr/launch-check-model-seam-keeps-its-signature (proposed) chose, so no change is asked.
4. **[note]** `newModelsFeature` takes a pre-defaulted `claudeBin` string, so `server.go:204` calls `defaultClaudeBin(...)` inline. Its sibling `newSessionLauncher` takes `LaunchConfig` and defaults inside. This is argument construction, not composition-root logic, but the two constructors resolve the same default at different layers.
5. **[note]** `errModelsInvalid` (`launchermodels.go:105`) is a sentinel no caller branches on. § Go allows "sentinel errors only where a caller genuinely branches on them", and `browse.go`'s sentinels exist because `handleBrowse` does branch. Its text also hard-codes "8" beside `modelsMaxRequested`.
6. **[note]** `launchermodels.go` holds `modelsFeature`/`GET /api/models`. § Composition roots names `internal/server/<name>.go`, but `themepoll.go`/`themeFeature` is prior art for a non-matching file name, so no change is asked.
7. **[note]** In `style.css`, `.seg-track label:has(input[aria-invalid="true"])` and `#custom-model-input[aria-invalid="true"]` repeat the same outline/offset/colour declarations. A selector list would give one rule.
8. **[note]** Size: `server.go` `New` 42>40 is pre-existing at 41 on `main`, with its reason in `New`'s own doc comment. That reason (one line per feature) holds for the added `models` line. `launcher.go` at 507 lines (491 on `main`) grew from comment prose plus `defaultClaudeBin`, and the reason holds. `features/launch.ts` at 580 lines (504 on `main`) grew from controller glue with the pure derivation extracted, and the reason holds.
