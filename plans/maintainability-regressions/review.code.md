# Correctness review: Maintainability Regressions

**Plan**: maintainability-regressions
**Verdict**: approved
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
