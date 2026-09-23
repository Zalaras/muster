# Correctness review: New Session Improvement

**Plan**: new-session-improvement
**Verdict**: needs-changes
**Cycle**: 1
**Pack**: kb pack 35043 words (budget 8000, WARN exceeds); sections — rules 1876 · features 10176 · diagrams 3889 · decisions 11693 · proposed 983 · facts 2459 · lessons 3959 · runbooks 2 (features=launch,focus,tiles,surfaces,connection,actions,rail,rename — the widened header)

## Requirements

| Req | Implemented | Tested | Status |
|-----|-------------|--------|--------|
| REQ-1 (check after validate, before `UpsertRepo`; 7-element argv; empty stdin; dir; 5 s; 400 `model_unrecognized` + exact message; nothing written) | Yes — `internal/claudecode/modelcheck.go` `CheckModel`/`RunModelCheck`; `internal/server/sessions.go:212-223`; `server.go:198-202` (5 s `WithTimeout`) | Yes — D5 `TestCheckModel_ArgvAndDir`, `TestRunModelCheck_StdinIsEmpty`/`UsesGivenDirectory`; D7 both source states; E3 | pass |
| REQ-2 (fail open; warn with dir+model, never stderr; exit code not a signal) | Yes — `ctx.Err()` ahead of the `ExitError` swallow (Fix Attempt 1); warn line names `directory`/`model`, `err` never carries stderr | Yes — D4 table, `TestCheckModel_RunError_FailsOpen`, `TestRunModelCheck_ContextDeadlineBoundsAHungProcess`, `TestLauncher_ModelCheckRunError_FailsOpenAndLogsWarn` | pass |
| REQ-3 (message in `#launch-error`, dialog open, fields untouched) | Yes — existing `submit()` `showError` path, no reset on error | Yes — E3 (title, custom model, `other…`, `plan` all asserted) | pass |
| REQ-4 (`--permission-mode` for all four, launch and resume) | Yes — `launch.go:34` | Yes — D10 `TestBuildArgv_PermissionModeAlwaysExplicit` (4 modes × resume on/off) | pass |
| REQ-5 (auto fallback; static `checked` on auto) | Yes — `api.ts` fallback, `resetForm` → `setPermissionMode(null)`, `index.html` | Yes — W4 (partial, Minor 3), E1/E2 | pass |
| REQ-6 (a) touched kept / (b) superseded does nothing / (c) failed → browse root; Recent click unchanged | Yes — `touched` set only from DOM `change`/`input`; `navigate()` three-way; `initOpen` dispatches on `openFallback` | Yes — W5, W6, E9, E10 | pass |
| REQ-7 (Focus: current marker, mainhead, keyboard focus) | Yes — `onLaunched` `app.focus(id)` → `render()` → `surfaces.focusSelected(id)`; never branches on store membership (edge case 10) | Yes — E5/E6/E8 | pass |
| REQ-8 (Tiles: promoted, keyboard focus in tile) | Yes — `promote` then `focusSelected` | Yes — E7 + free-slot test | pass |
| REQ-9 (static needles, zero-token `CheckModel` canary, explicit-`default` sweep row) | Yes — `static_test.go` 3 needles, run F + `TestModelCatalogPrecheck`, `sessionUnauthDefault` row | Static tier green in D12; harness half is D13 (not yet run — orchestrator's, post-fix-wave) | pass (D13 pending) |
| INV-1 | Yes | D7 (both source states, settings bytes, repo rows, session rows, tmux calls, upserts) + E3/second model-check test | pass |
| INV-2 | Yes | D4, D6 | pass |
| INV-3 | Yes | D10 | pass |
| INV-4 (five source states) | Yes | **Four of five** — "Focus with no sessions" has no test (Major 1) | fail |
| INV-5 | Yes | W5 × W6 (pure) + E9/E10 | pass |
| DIAG | `kb:diagram/daemon-components` (claudecode still imports nothing internal — true), `kb:diagram/containers` (updated this branch: "a model-catalog check before each launch" — true), `kb:diagram/web-components` (no new cross-feature import; `launch-restore.ts` is launch's own helper); launch spec's inline sequence diagram is doc-reconcile's (see orchestrator Minor 1 on its insertion point) | — | pass |

## Build & Tests

E2E tests: pass (441/441, `15-e2e.log`) · Daemon tests (race): pass (every package `ok`, `02-test.log`) · Web tests: pass (1833, `05-web-test.log`) · Daemon build: pass (`01-build.log`, empty, exit 0) · Web build: pass (`04-web-build.log`) · Lint: pass (`03-lint.log` 0 issues; `06-web-lint.log` 184 files clean) — all read from `$GATES_LOG_DIR`. Also: contrast pass (43 pairs × 3 themes, 0 failures), versions pass, e2e-honest pass, dead-refs pass (2931 refs, 0 missing), e2e-lint clean, features-scope pass, size WARN ×12 (review-maintainability's).

Soak I ran myself (Repair 3 in `test-specs.md` repaired an intermittent failure in `launch-opens-session.spec.ts`, and the ```checks block does not soak it): `npx playwright test e2e/launch-opens-session.spec.ts --repeat-each=10` → **40 passed (36.6s)**. I ran Playwright directly rather than `make e2e-soak` so as not to rebuild `bin/musterd`/`internal/webui/assets` under the concurrently running browser reviewer (kb:lesson/concurrent-build-invalidates-running-e2e); the built artifacts are of this tree (only `orchestration-state.json` and untracked review files differ).

## Acceptance Checks

| ID | Command | Result |
|----|---------|--------|
| D1 | `make test` | pass (deduped to baseline `test` → `go test -race -count=1 ./...`, `02-test.log`) |
| D2 | `go build ./...` | pass (deduped to baseline `build`, `01-build.log`) |
| D3 | `make lint` | pass (`03-lint.log`: 0 issues) |
| D11 | `! rg -n -e '"--no-session-persistence"' -e '"--bare"' -e "model catalog" internal/ cmd/ --glob '!internal/claudecode/**'` | pass (`16-D11.log` empty; gates.sh refuses to run unless `rg` is demonstrably runnable, so not a vacuous inversion) |
| D12 | `MUSTER_CANARY_OFFLINE=1 make canary` | pass (`17-D12.log`: `TestInstalledBinaryCarriesInterfaceStrings` PASS with the three new needles; harness tests skip offline) |
| W1 | `make web-build` | pass (`04-web-build.log`) |
| W2 | `make web-test` | pass (1833 passed) |
| W3 | `make web-lint` | pass |
| E1 | `make e2e` | pass (441 passed, `15-e2e.log`) |
| K1 | `make check-kb` | **FAIL** — `10-kb-check.log`: exactly 7 "owned by no feature": `internal/claudecode/modelcheck.go`, `internal/claudecode/modelcheck_test.go`, `web/e2e/launch-defaults.spec.ts`, `web/e2e/launch-model-check.spec.ts`, `web/e2e/launch-opens-session.spec.ts`, `web/src/features/launch-restore.test.ts`, `web/src/features/launch-restore.ts`. All seven are staged in `doc-delta.md`'s orchestrator amendment for doc-reconcile (Step 7). Critical 1, `[orchestrator]` |
| DOC | doc upkeep + Doc Delta vs what shipped | **FAIL** — ADRs: pass (no `deviation:` lines in any log; the four `proposed` ADRs exist with `refs: plan:new-session-improvement`, and `decisions/features-scope` has its ADR). TODO ticks: deferred to Completion, as the orchestrate skill requires ("no ✅ tick until `review.md` says `approved`") — not a defect. Doc Delta: every line matches what shipped (see orchestrator Minor 1 for the diagram insertion point). **Stale:** `docs/claude-code-versions.md`'s canary run table (Major 3); `kb:fact/model-catalog-precheck-zero-token` still says `guard: none`, `files: []` and `tests: []`, although this branch now guards it (`TestModelCatalogPrecheck`, the static needles) and implements it in `modelcheck.go`; `kb:adr/launch-refuses-model-outside-binary-catalog`'s `files` names `launch.go` and `launch.ts`, which that decision did not change, and omits `modelcheck.go`/`server.go` (orchestrator Minor 2) |

## Reviewer-Verified Criteria

| ID | Criterion | Result | Evidence |
|----|-----------|--------|----------|
| D4 | `stderrSaysUnrecognised` true for the measured line, false for 4 rows | pass | `TestStderrSaysUnrecognised` has all 5 rows. The "measured full line" row is not the measured line (Minor 1) |
| D5 | 7 argv elements, empty stdin, in `dir` | pass | `TestCheckModel_ArgvAndDir` pins the exact slice; `TestRunModelCheck_StdinIsEmpty`, `TestRunModelCheck_UsesGivenDirectory` |
| D6 | run error / past-deadline → error, Launch proceeds | pass | `TestCheckModel_RunError_FailsOpen`, `TestCheckModel_ContextDeadlineExceeded_FailsOpen`, `TestRunModelCheck_ContextDeadlineBoundsAHungProcess` (real `sleep 30` killed at 100 ms → error), `TestLauncher_ModelCheckRunError_FailsOpenAndLogsWarn` (lerr nil, log names dir + model) |
| D7 | 400 + message + nothing written, both INV-1 source states | pass | `TestLauncher_ModelUnrecognised_RefusesAndWritesNothing`: repo rows equal (incl. `lastLaunchedAt`), session rows equal, `newSessionCalls` equal, upserts empty, settings bytes equal / file absent |
| D8 | recognised → 201 with the same row the pre-plan launch produced | **partial** | `TestLauncher_ModelRecognised_ProceedsToCreated` asserts only `State` and non-empty `TmuxTarget`; its comment claims "exactly as a launch with no check configured" but compares nothing (Minor 2) |
| D9 | validation failure never invokes the check | pass | `TestLauncher_ValidationFailure_NeverInvokesTheModelCheck` (relative dir → `invalid_request`, 0 calls) |
| D10 | exactly once, 4 modes × resume | pass | `TestBuildArgv_PermissionModeAlwaysExplicit` counts occurrences and checks the value |
| D13 | forced canary: run F + explicit-`default` row | **not yet run** | Orchestrator runs it from the main session after the fix waves, with the developer's approval. Its log must be pasted into the review before approval |
| W4 | `"auto"` for `null`, `""`, `"bypassPermissions"`, `"nonsense"`; four values unchanged | **partial** | `api.test.ts` covers `null`, `""`, `"someFutureMode"` and the four round-trips; `"bypassPermissions"` and `"nonsense"` are absent (Minor 3) |
| W5 | four touched combinations | pass | `launch-restore.test.ts` four `toStrictEqual` cases plus key-absence checks |
| W6 | ok→restore, failed→browse-root, superseded→none | pass | `it.each` over the whole union |
| W7 | no `any` in new web code | pass | `git diff main...HEAD -- web/src web/e2e` added lines: no `: any`, `<any>`, `as any` (also no `innerHTML`) |
| E2–E11 | covered by E1's `make e2e` | pass | E2 `launch-defaults` test 1; E3/E4 `launch-model-check` test 1; E5/E6/E7/E8 `launch-opens-session`; E9/E10 `launch-defaults` tests 2–3 (both discriminate against the pre-plan code: pre-plan `initOpen` would overwrite `opus`, and would fall back to the browse root on the superseded `false`); E11 `permission-mode.spec.ts` unmodified, green |

## Hard-Rule Checklist

| # | Rule | Result |
|---|------|--------|
| 1 | Adapter boundary | pass — the sentence, `--bare`, `--no-session-persistence` and the argv exist only in `internal/claudecode/modelcheck.go` (D11 green; `git grep` over `internal cmd web/src` outside `internal/claudecode` finds none). The server sees only `ModelVerdict` |
| 2 | Terminal-output state parsing | pass — the verdict comes from the check subprocess's stderr, not a pane; no `capture-pane` added |
| 3 | Blocking hook handler | pass — no hook path touched. The ~1 s check blocks `POST /api/sessions`, not hook receipt |
| 4 | Bare tmux | pass — no tmux invocation added |
| 5 | Payload logging | pass — the warn line logs `directory`, `model` and a process-level `err` (start failure or `ctx.Err()`); stderr bytes are dropped on the error path |
| 6 | Empty-gauge dishonesty | n/a — no gauge touched |
| 7 | Identity on `session_id` | pass — no identity code touched |
| 8 | Settings trespass | pass — nothing reads or writes user-level settings; no `CLAUDE_CONFIG_DIR` in production code |
| 9 | Real `claude` outside canary/probes | pass — unit tests use `sh`/`echo`; E2E uses the stub (`--bare` branch); the only real `claude` runs are canary run F. Its first call uses `muster-canary-unrecognized-model`, not haiku. REQ-9 specifies that call, and `--bare -p ""` cannot authenticate, so it spends no tokens (see Note 2) |

## Issues

### Critical
1. **[orchestrator]** K1 `make check-kb` is red: 7 of this plan's new files are "owned by no feature" (listed in the Acceptance Checks row). The fix is a glob in `docs/features/launch/spec.md`'s frontmatter. That is doc-reconcile's file (Step 7, after approval), and the globs are already staged in `plans/new-session-improvement/doc-delta.md`. No pipeline agent can fix it, so it is not routed. This matches the `terminal-fixes-cleanup` precedent. The run must not complete until doc-reconcile turns K1 green.

### Major
1. **[e2e-specs]** INV-4 names five source states and says "This is asserted from these source states"; `web/e2e/launch-opens-session.spec.ts` covers four of them. **Focus with no sessions** is untested, and the `test-specs.md` Coverage row ("INV-4 | … all four tests") lists four states without flagging the gap. The file's header gives a reason for leaving it out: "the only way to tell 'the new launch was focused' apart from the pre-existing 'top of sort order' default-focus behaviour". That reason is false for the half this plan adds. Keyboard focus in the terminal is new even for a lone first session, because pre-plan `onLaunched` never called `focusSelected`. The header also says "Every test below therefore launches a SECOND session after a first one already holds focus", which the Tiles free-slot test (`:135`) does not do. — `web/e2e/launch-opens-session.spec.ts:20-27` — Fix: add a test on a fresh `daemon` in Focus that launches from the dialog with no prior session. Assert `aria-current` on the new card, `activeElementInsideTerminal` before and after a `settleFor`, and a no-click keystroke round-trip. Correct the header.
2. **[daemon-tests]** A comment misstates acceptance criterion D11: "mirrored here rather than imported (D11: they may not appear outside that package in non-test code, …)". D11 says the opposite: "Test files are inside the net". An `internal/server` test holding the sentence would fail D11's `rg`. A reader who trusts this comment would put it there. (The real reason the strings are mirrored is that `modelCatalogSentence` is unexported, and `test/canary` sits outside D11's `internal/`/`cmd/` scope.) — `test/canary/static_test.go:59-62` — Fix: restate D11's scope correctly.
3. **[orchestrator]** `docs/claude-code-versions.md` describes the canary this branch changed, and three of its statements are now false. The run table's "C ×4 … one run per launch permission mode (no flag, `plan`, `acceptEdits`, `auto`)" is five runs now, with the explicit `default` row. There is no row for run F, the zero-token `CheckModel` run. The static-tier paragraph lists the needles, but not the three this plan added (the catalog sentence, `--bare`, `--no-session-persistence`). — `docs/claude-code-versions.md:185` and the static-tier paragraph below it — Fix: amend with the doc upkeep. Pipeline agents may not write `docs/`, so this does not block approval.

### Minor
1. **[daemon-tests]** The D4 row named "the measured full line" is not the measured line. Its stderr ends `update Claude Code, or pick another model.`, which is Muster's own refusal wording. The plan (Affected Files › E2E) and the E2E stub (`web/e2e/helpers/daemon.ts:135`) both carry the measured tail, `update Claude Code, or map it with behavesAs on a modelPicker row.` The substring test still passes, but the row's label is a false claim of provenance. — `internal/claudecode/modelcheck_test.go:24-25` — Fix: use the measured line.
2. **[daemon-tests]** D8 says "returns 201 with the same row the pre-plan launch produced". The test asserts only `State == started` and a non-empty `TmuxTarget`. Its doc comment still claims the launch proceeds "exactly as a launch with no check configured at all". — `internal/server/sessions_test.go:437-458` — Fix: compare against a `checkModel: nil` launcher's row on a second directory, field by field (excluding id, directory and timestamps). Or assert the full row the pre-plan `TestLauncher_*` tests pin: model, permission-mode latch and repo defaults.
3. **[web-tests]** W4 names `"bypassPermissions"` and `"nonsense"`. Neither is tested; the suite uses `"someFutureMode"`. `"bypassPermissions"` is the row that matters, because it is a real Claude Code mode the dialog deliberately does not offer (kb:adr/launch-bypass-and-dontask-unoffered). A fallback keyed on Claude Code's mode list would pass `"someFutureMode"` and fail it. — `web/src/api.test.ts:87-97` — Fix: add the `"bypassPermissions"` row (and `"nonsense"`, or rename `"someFutureMode"`).
4. **[daemon-impl]** `Launch`'s doc comment lists the launch steps "in that order" but leaves out the model pre-check, the one step this plan added to that sequence. The `checkModel` field comment says nil-tolerance exists for "D9's own literal-constructed test launchers". D9 is the validation-order criterion; the plan's reason is that existing literal-constructed launchers keep compiling. — `internal/server/sessions.go:151-153`, `:145-147` — Fix: name the check in the sequence, and drop the D9 attribution.
5. **[daemon-impl]** The hand-written invariant "Subprocesses run through the injectable `execFunc`" is now wrong about this plan's subprocess, which runs through `ModelCheckRun`. The plan's Affected Files asked for this file's hand-written part to be updated if it lists the package's subprocesses; the impl log's reason for leaving it ("already not literally true") makes it less true, not more. — `internal/claudecode/CLAUDE.md:10` — Fix: "through an injectable run seam (`execFunc`, `ModelCheckRun`)".

**Orchestrator Minors (do not block):**
- **[orchestrator]** 1. The Doc Delta's diagram entry places the pre-check "inserted before `UpsertRepo`". In the launch spec's current fence, `S->>G` (gitutil) sits just before `UpsertRepo`, but the code runs the check before the gitutil probes (`sessions.go:216` precedes `:225`). Promoted verbatim, the diagram would misorder them. Amend `doc-delta.md` to insert the `S->>A` step and the `alt` after `UI->>S: POST /api/sessions` (and the validate step), before `S->>G`.
- **[orchestrator]** 2. Update the records: `kb:fact/model-catalog-precheck-zero-token` should get `guard: TestModelCatalogPrecheck` (plus the static needles), `files: [internal/claudecode/modelcheck.go]` and `tests`. `kb:adr/launch-refuses-model-outside-binary-catalog`'s `files` should name `internal/claudecode/modelcheck.go` and `internal/server/server.go` in place of `launch.go`/`launch.ts`. `kb:fact/permission-mode-no-flag-follows-configured-default`'s explicit-spelling half is now swept by `TestLaunchFlags`' "unauth, explicit default" row.

### Notes
1. **[note]** D13 has not run. Per the orchestrator it runs once from the main session after the fix waves. Its log is the only live evidence that the real 2.1.280 binary classifies `muster-canary-unrecognized-model` and haiku as specified.
2. **[note]** Canary run F calls the real `claude` with a non-haiku `--model`. The hard rule's wording ("always pass `--model claude-haiku-4-5-20251001`") guards spending tokens. This call is `--bare … -p ""`, which cannot authenticate and makes no API call (kb:fact/model-catalog-precheck-zero-token), and REQ-9 names this exact model string. Recorded so that no one reads it as a violation.
3. **[note]** `modelUnrecognized` formats with `%q`. For a model string containing `"`, `\` or non-printable characters, the message shows Go escapes rather than the raw string. Every realistic model string is unaffected.
4. **[note]** Worst-case check time is 5 s (ctx) plus 2 s (`WaitDelay`) when a descendant holds the stderr pipe. REQ-1 says "bounded at 5 s"; Edge case 1 accepts `WaitDelay` as the second bound.
5. **[note]** `launch-restore.ts` is a pure module in `web/src/features/`, while `docs/conventions.md` § Composition roots says "`features/` holds controllers; `sessions/` … pure logic". The plan allowed either home. Placement is review-maintainability's call.
6. **[note]** `docs/protocol.md`'s `permissionMode` comment ends one line with `"auto" added by`, and the next line starts a different clause. The sentence was broken on `main` before this plan; the plan's edit left it as it was.
7. **[note]** `bin/musterd` and `internal/webui/assets` were rebuilt at 10:26, after the gate run (10:24), presumably by the browser reviewer. My soak ran against those artifacts. The tree is unchanged, so they are equivalent.
