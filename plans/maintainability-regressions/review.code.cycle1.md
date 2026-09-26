# Correctness review: Maintainability Regressions

**Plan**: maintainability-regressions
**Verdict**: needs-changes
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
