# Correctness review: New Session Improvement

**Plan**: new-session-improvement
**Verdict**: needs-changes
**Cycle**: 2
**Pack**: kb: pack 35443 words (budget 8000, WARN exceeds); sections — rules 1876 · features 10176 · diagrams 3889 · decisions 11693 · proposed 1380 · facts 2462 · lessons 3959 · runbooks 2 (features=launch,focus,tiles,surfaces,connection,actions,rail,rename)

Full re-review (cycle 1 had agent-tagged Majors). Every cycle-1 correctness issue was re-checked against the tree. The two Majors and five Minors tagged to agents are fixed (see the table at the end of Notes). One new small issue remains: a test-honesty Minor for daemon-tests.

## Requirements

| Req | Implemented | Tested | Status |
|-----|-------------|--------|--------|
| REQ-1 (check after validate and before any write; 7-element argv; empty stdin; runs in dir; 5 s; 400 `model_unrecognized` with the exact message; nothing written) | Yes. `internal/claudecode/modelcheck.go` `CheckModel` (5 s `WithTimeout` now inside it, `:85-86`) and `RunModelCheck`; `internal/server/sessions.go:216-223` runs before `gitutil`/`UpsertRepo`; `server.go:192-194` wires it in one statement | Yes. D5 `TestCheckModel_ArgvAndDir`, `TestRunModelCheck_StdinIsEmpty`, `TestRunModelCheck_UsesGivenDirectory`; D7 covers both source states; E3 | pass |
| REQ-2 (fail open; warn log names dir and model, never stderr; exit code carries no signal) | Yes. `ctx.Err()` is checked before the `ExitError` swallow; the warn line carries `directory`/`model`/`err`, and stderr is dropped on the error path | Yes. D4 table, `TestCheckModel_RunError_FailsOpen`, `…ContextDeadlineExceeded_FailsOpen`, `TestRunModelCheck_ContextDeadlineBoundsAHungProcess`, `TestRunModelCheck_ReturnsStderrRegardlessOfExitCode`, `TestLauncher_ModelCheckRunError_FailsOpenAndLogsWarn` | pass |
| REQ-3 (refusal shown in `#launch-error`; dialog stays open; fields untouched) | Yes. The existing `showError` path; nothing resets on error | Yes. E3 asserts title, custom model, `other…` and `plan` | pass |
| REQ-4 (`--permission-mode` for all four modes, on launch and resume) | Yes. `launch.go:34` | Yes. D10 `TestBuildArgv_PermissionModeAlwaysExplicit` (4 modes × resume on/off, exactly once) | pass |
| REQ-5 (auto fallback; static `checked` on auto) | Yes. `api.ts` fallback `"auto"`; `resetForm` calls `setPermissionMode(null)`; `index.html:162-165` | Yes. W4 (every named row now present), E1/E2, E12 | pass |
| REQ-6 (a) touched fields kept, (b) superseded does nothing, (c) failed falls back to browse root; clicking a Recent is unchanged | Yes. `touched` is set only from DOM `change`/`input`; `navigate()` returns a three-way outcome; `initOpen` switches on it directly (`launch.ts:369-380`); the Recent click restores via `repoRestore` on `ok` | Yes. W5 (`initialRestore`, 4 combinations plus fallbacks); E9 (a), E10 (b), E12 (c, new); E11 / `launch.spec.ts:298` cover the Recent click | pass |
| REQ-7 (Focus: current marker, mainhead title, keyboard focus; rail scroll untouched per amendment) | Yes. `onLaunched` calls `focus.bringForward(session)` (→ `app.focus` + `render`), then `surfaces.focusSelected(id)`; no `scrollIntoView` was added | Yes. E5/E6 (second session), the new lone-session test, E8 | pass |
| REQ-8 (Tiles: promoted, keyboard focus in its tile) | Yes. `bringForward` → `deps.promoteTile`, then `focusSelected` | Yes. E7 plus the free-slot test | pass |
| REQ-9 (static needles; zero-token `CheckModel` canary; explicit-`default` sweep row) | Yes. `static_test.go` has 3 needles; run F plus `TestModelCatalogPrecheck`; `sessionUnauthDefault` row. Run F now relies on `CheckModel`'s own 5 s bound | Static tier green in D12. The harness half is D13, which has not run (Note 1) | pass (D13 pending) |
| INV-1 | Yes | D7 (both source states: repo rows, session rows, tmux calls, upserts, settings bytes or absence) plus both E2E tests | pass |
| INV-2 | Yes | D4, D6 | pass |
| INV-3 | Yes | D10 | pass |
| INV-4 (five source states) | Yes | **Five of five.** `launch-opens-session.spec.ts:44` is the new "Focus with no sessions" test (marker, `activeElementInsideTerminal` before and after `settleFor`, no-click round trip). The header no longer claims every test launches a second session | pass |
| INV-5 | Yes | W5 plus E9/E10/E12. W6 was amended away (kb:adr/launch-open-outcome-decided-in-controller) | pass |
| DIAG | `kb:diagram/daemon-components` (claudecode still imports nothing internal: true). `kb:diagram/containers` ("a model-catalog check before each launch": true). `kb:diagram/web-components`: **stale**, `render/` is drawn as "21 modules" but holds 22 since `launchrestore.ts` moved there (Major 1, `[orchestrator]`). The launch spec's inline sequence fence belongs to doc-reconcile, and its insertion point is now corrected in `doc-delta.md` | — | fail (orchestrator, non-blocking) |

## Build & Tests

E2E tests: pass (443/443, `15-e2e.log`) · Daemon tests (race): pass (every package `ok`, `02-test.log`) · Web tests: pass (1837 in 45 files, `05-web-test.log`) · Daemon build: pass (`01-build.log` empty, exit 0) · Web build: pass (`04-web-build.log`) · Lint: pass (`03-lint.log` 0 issues; `06-web-lint.log` 184 files clean). All read from `$GATES_LOG_DIR`, not re-run.

Other gate lines: contrast pass (43 pairs × 3 themes, 0 failures); versions pass; e2e-honest pass (empty); dead-refs pass (2943 refs, 0 missing); e2e-lint clean; features-scope pass (8 features); size WARN ×13 (review-maintainability's).

No soak was needed this cycle. No flake repair landed since cycle 1: the `## Repairs (fix attempt 1)` table records new tests only, no repaired assertion. Repair 3's flake fix was soaked in cycle 1 (40/40, mine) and again by e2e-specs (40/40 and 50/50).

## Acceptance Checks

| ID | Command | Result |
|----|---------|--------|
| D1 | `make test` | pass (deduped to baseline `go test -race -count=1 ./...`, `02-test.log`) |
| D2 | `go build ./...` | pass (deduped to baseline `build`, `01-build.log`) |
| D3 | `make lint` | pass (`03-lint.log`: 0 issues) |
| D11 | `! rg -n -e '"--no-session-persistence"' -e '"--bare"' -e "model catalog" internal/ cmd/ --glob '!internal/claudecode/**'` | pass (`16-D11.log` empty). By hand: the new `Launch` doc comment reads "runs the model check", not "model catalog" |
| D12 | `MUSTER_CANARY_OFFLINE=1 make canary` | pass (`17-D12.log`: `TestInstalledBinaryCarriesInterfaceStrings` PASS; the harness skips offline) |
| W1 | `make web-build` | pass |
| W2 | `make web-test` | pass (1837) |
| W3 | `make web-lint` | pass |
| E1 | `make e2e` | pass (443; all 11 plan tests and the 7 `permission-mode.spec.ts` tests green) |
| K1 | `make check-kb` | **FAIL**. `10-kb-check.log` lists exactly 7 files as "owned by no feature": `internal/claudecode/modelcheck.go`, `internal/claudecode/modelcheck_test.go`, the three `web/e2e/launch-*.spec.ts`, `web/src/render/launchrestore.ts` and `web/src/render/launchrestore.test.ts`. `doc-delta.md`'s amendments stage globs that cover all 7 (`modelcheck*.go`, `web/src/render/launchrestore*.ts`, the three specs). Critical 1, `[orchestrator]` |
| DOC | doc upkeep and Doc Delta vs what shipped | pass. The cycle-1 orchestrator items are done. `docs/claude-code-versions.md` now reads C ×5 (explicit `default` row), adds an F row and names the three static needles. `kb:fact/model-catalog-precheck-zero-token` has `files: [modelcheck.go]`, three `tests` and `guard: TestModelCatalogPrecheck`. `kb:fact/permission-mode-no-flag-follows-configured-default` has `guard: TestLaunchFlags` (Note 3 covers how much that guards). `kb:adr/launch-refuses-model-outside-binary-catalog` `files` = modelcheck.go, sessions.go, server.go. `doc-delta.md` places the diagram insertion before `S->>G`. No `deviation:` lines in any log. Both new ADRs from this cycle (`launch-open-outcome-decided-in-controller`, `rail-launch-leaves-rail-scroll-untouched`) are `proposed` with `refs: plan:new-session-improvement`. No log `doc-delta:` line is missing from the delta. The TODO tick is deferred to Completion by design. Every Doc Delta sentence matches the code (checked against `launch.ts`, `launch.go`, `sessions.go` and `focus.ts`). The DIAG row is failed separately |

## Reviewer-Verified Criteria

| ID | Criterion | Result | Evidence |
|----|-----------|--------|----------|
| D4 | `stderrSaysUnrecognised` true for the measured line, false for 4 rows | pass | `TestStderrSaysUnrecognised`. The positive row is now the measured sentence verbatim (`…; update Claude Code, or map it with behavesAs on a modelPicker row.`) |
| D5 | 7 argv elements, empty stdin, runs in `dir` | pass | `TestCheckModel_ArgvAndDir` pins the exact slice; the stdin and dir tests run a real `sh` |
| D6 | run error or blocking past the deadline → error, and Launch proceeds | pass | `TestCheckModel_RunError_FailsOpen`, `…ContextDeadlineExceeded_FailsOpen` (still valid with the inner `WithTimeout`: a child's deadline is the earlier of the two), `TestRunModelCheck_ContextDeadlineBoundsAHungProcess`, `TestLauncher_ModelCheckRunError_FailsOpenAndLogsWarn` |
| D7 | 400, the message, nothing written, both INV-1 states | pass | `TestLauncher_ModelUnrecognised_RefusesAndWritesNothing` |
| D8 | recognised → 201 with the row the pre-plan launch produced | pass | `TestLauncher_ModelRecognised_ProceedsToCreated` now compares a `checkModel: nil` launcher's row against the checked launcher's row across 17 session fields, plus the repo row's `LaunchCount`/`LastModel`/`LastPermissionMode`. Its comment overclaims what it compares (Minor 1) |
| D9 | a validation failure never invokes the check | pass | `TestLauncher_ValidationFailure_NeverInvokesTheModelCheck` |
| D10 | exactly once for each of 4 modes × resume | pass | `TestBuildArgv_PermissionModeAlwaysExplicit` |
| D13 | forced canary: run F and the explicit-`default` row | **not yet run** | Runs once from the main session with the developer's approval (orchestrator context). No agent tag |
| W4 | `"auto"` for `null`, `""`, `"bypassPermissions"`, `"nonsense"`; the four modes round-trip | pass | `api.test.ts` has every named row, plus `"someFutureMode"` |
| W5 | the four touched combinations | pass | `launchrestore.test.ts` `initialRestore` block (4 `toStrictEqual` cases with key-absence checks, plus the fallback rows) |
| W6 | *amended away* | n/a → E10/E11/E12 | The plan's inline amendment and kb:adr/launch-open-outcome-decided-in-controller. `initOpen`'s three branches (`launch.ts:369-380`) are each reached end to end: `ok` by E9/E11, `superseded` by E10, `failed` by E12 |
| W7 | no `any` in new web code | pass | No `: any`, `<any>`, `as any` or `innerHTML` in the added lines of `git diff main...HEAD -- web/src web/e2e` |
| E2–E12 | covered by E1's `make e2e` | pass | All green in `15-e2e.log`. E12 (`launch-defaults.spec.ts:152`) seeds `haiku`/`default`, deletes the directory, then asserts the browse-root crumb and footer, a hidden error, `aria-pressed="false"` on the stale Recent, and the `auto`/`sonnet` fallbacks. It checks what REQ-6c says |

## Hard-Rule Checklist

| # | Rule | Result |
|---|------|--------|
| 1 | Adapter boundary | pass. The catalog sentence, `--bare`, `--no-session-persistence`, the argv and the 5 s policy live only in `internal/claudecode/modelcheck.go`. `server.go` binds `claudeBin` in one statement; `sessions.go` sees only `ModelVerdict`. D11 is green |
| 2 | Terminal-output state parsing | pass. The verdict comes from the check subprocess's stderr, not a pane; no `capture-pane` was added |
| 3 | Blocking hook handler | pass. No hook path is touched. The ~1 s check blocks `POST /api/sessions` only |
| 4 | Bare tmux | pass. No tmux invocation was added |
| 5 | Payload logging | pass. The warn line logs `directory`, `model` and a process-level `err`. `CheckModel` discards stderr on the error path |
| 6 | Empty-gauge dishonesty | n/a. No gauge is touched |
| 7 | Identity on `session_id` | pass. No identity code is touched |
| 8 | Settings trespass | pass. Nothing reads or writes user-level settings. `CLAUDE_CONFIG_DIR` appears only in the pre-existing canary unauthenticated run C |
| 9 | Real `claude` outside canary/probes | pass. Unit tests run `sh`/`echo`; E2E uses the stub's `--bare` branch; the only real `claude` calls are canary run F (Note 2) |

## Issues

### Critical
1. **[orchestrator]** K1 `make check-kb` is red. Seven of this plan's files are "owned by no feature" (listed in the Acceptance Checks row). The fix is launch-spec frontmatter globs, which belong to doc-reconcile after approval. `doc-delta.md` already stages them, updated for the move to `web/src/render/launchrestore*.ts`. No pipeline agent can fix this, so it is not routed. The run must not complete until doc-reconcile turns K1 green. This is the same finding and disposition as cycle 1.

### Major
1. **[orchestrator]** `kb:diagram/web-components` is stale. Its `render/` component says "21 modules" (`docs/diagrams/web-components.md:44`), but `web/src/render/` now holds 22 non-test modules. `launchrestore.ts` moved there in the cycle-1 fix wave; `main` has 21. CLAUDE.md § Doc upkeep says a diagram that `kb for <path>` names is updated in the same commit. Pipeline agents may not write `docs/`, so this does not block approval. Fix: change the count to 22 in the doc upkeep. If the move stands, also consider whether "DOM only — view-model in, DOM out" still describes the directory; see Note 5, which is placement and belongs to review-maintainability.

### Minor
1. **[daemon-tests]** `TestLauncher_ModelRecognised_ProceedsToCreated` claims more than it asserts, in two places. File: `internal/server/sessions_test.go:436-446` and `:495`.
   - Its doc comment lists the excluded fields and then says "every other field must match". The test never compares `LastSnapshot`, `LastSnapshotAt`, `TranscriptPath`, `PlanPath`, `PlanExists`, `Unread` or `LastPrompt`, and it compares `Model` by `ID`/`DisplayName` only.
   - The repo-row block is labelled `// D7:`, but it asserts D8 (D7 is the refusal test just above).

   A reader trusting the comment would take those seven fields as pinned. Fix either way: compare the omitted fields (for example, one `assert.Equal` on the two sessions after zeroing the excluded fields), or reword the claim to name only the fields compared. Also relabel `D7` → `D8`.

### Notes
1. **[note]** D13 has not run. It is the only live evidence that 2.1.280 classifies `muster-canary-unrecognized-model` as unrecognised and haiku as recognised through the production `CheckModel`. Per the orchestrator it runs once from the main session with the developer's approval, and its log should be pasted into the review.
2. **[note]** Canary run F calls the real `claude` with a non-haiku `--model` (`muster-canary-unrecognized-model`). The call is `--bare … -p ""`, which cannot authenticate and makes no API call (kb:fact/model-catalog-precheck-zero-token), and REQ-9 names this model string. The hard rule guards token spend, so this is not a violation. Carried over from cycle 1.
3. **[note]** `kb:fact/permission-mode-no-flag-follows-configured-default` now names `guard: TestLaunchFlags`. That test's C runs use a fresh unauthenticated `CLAUDE_CONFIG_DIR`, whose configured default is already manual. So the "unauth, no flag" row cannot detect the fact's headline claim (no flag follows a non-manual configured default). The "unauth, explicit default" row proves `--permission-mode default` is still accepted and reported as `"default"`, but it would pass even if the flag were ignored. REQ-9 asked for exactly this row, so nothing is out of spec. The guard covers acceptance of the explicit spelling, not the "forces manual" half.
4. **[note]** `TestCheckModel_ExitErrorIsNotAFailure` (`modelcheck_test.go:111`) has a fake that returns a nil error, so it duplicates the "recognised" row of `TestCheckModel_VerdictFollowsStderr`. `CheckModel` passes any run error through, `*exec.ExitError` included. The property the name claims is `RunModelCheck`'s, and `TestRunModelCheck_ReturnsStderrRegardlessOfExitCode` guards it. The test's comment says so, which is why this is not a finding.
5. **[note]** For review-maintainability (placement is theirs): `web/src/render/launchrestore.ts`'s header says "a pure decision split out of a controller lives here, not in features/". `docs/conventions.md` § Composition roots bullet 3 and `web/src/render/CLAUDE.md` both say `render/` holds pure DOM builders and `sessions/`/`terminal/` hold pure logic. The move cites `render/focusrestore.ts` and `render/crumbs.ts` as precedent. Whether that precedent or the written rule decides the home is maintainability's call. The comment's wording should follow whichever wins.
6. **[note]** `launch-opens-session.spec.ts:35` says the Tiles tests "each launch only one session too". The full-grid test launches four seed sessions over HTTP before its one dialog launch. The meaning (one launch under test) is clear from the code.
7. **[note]** The Doc Delta's "Frontmatter `refs` gain … the three new ADRs" is still true, but the plan now has two more launch-feature ADRs: kb:adr/launch-open-outcome-decided-in-controller and kb:adr/rail-launch-leaves-rail-scroll-untouched (features: launch, rail, focus). Doc-reconcile may want them in the launch refs too. Also, `kb:adr/launch-opens-launched-session`'s `files` names `launch.ts` and `main.ts`. The Focus half of that decision now executes in `focus.ts`'s `bringForward`.
8. **[note]** This predates the plan: `Launch`'s doc comment (`sessions.go:150-153`) sits above `func validateLaunchRequest`, not above `func (l *sessionLauncher) Launch` (`:206`), so `go doc` attaches it to the wrong function. The same layout is on `main`. This plan only edited the wording.
9. **[note]** Carried from cycle 1: the worst-case check time is 5 s plus 2 s (`WaitDelay`), against "≤ 5 s" in `docs/protocol.md`. Edge case 1 accepts `WaitDelay` as the second bound.
10. **[note]** Cycle-1 correctness items, verified fixed:
    - Major 1 `[e2e-specs]`: fixed by the new lone-session test and the corrected header.
    - Major 2 `[daemon-tests]`: fixed; `static_test.go:59-64` states D11's scope correctly.
    - Minor 1 `[daemon-tests]`: fixed; the measured line is now used.
    - Minor 2 `[daemon-tests]`: fixed; D8 compares against a baseline launch, with a residual wording issue in the new Minor 1.
    - Minor 3 `[web-tests]`: fixed; the `bypassPermissions` and `nonsense` rows are present.
    - Minor 4 `[daemon-impl]`: fixed; the Launch doc comment names the check, and the field comment drops the D9 attribution.
    - Minor 5 `[daemon-impl]`: fixed; `internal/claudecode/CLAUDE.md:10` names both seams.
    - Orchestrator Minors 1 and 2 and orchestrator Major 3: done (DOC row).
