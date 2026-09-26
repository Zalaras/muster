# Correctness review: Maintainability Regressions

**Plan**: maintainability-regressions
**Verdict**: needs-changes
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
