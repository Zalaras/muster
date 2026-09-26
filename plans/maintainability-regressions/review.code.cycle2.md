# Correctness review: Maintainability Regressions

**Plan**: maintainability-regressions
**Verdict**: needs-changes
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
