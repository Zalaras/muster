# Review: new-session-improvement

**Plan**: new-session-improvement
**Verdict**: needs-changes
**Cycle**: 2
**Gates**: 1 failed
**Parts**: code, browser, maintainability
**Part verdicts**: code needs-changes, browser approved, maintainability needs-changes

_Merged by orch-state.py merge-review; the verdict is computed from the parts and the gate run, never edited by hand._

## Correctness review

# Correctness review: New Session Improvement

**Plan**: new-session-improvement
**Part verdict**: needs-changes
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

## Browser review

# Browser review: New Session Improvement

**Plan**: new-session-improvement
**Part verdict**: approved
**Cycle**: 2
**Pack**: kb: pack 26792 words (budget 8000) — WARN exceeds; sections rules 1340 · features 10176 · diagrams 0 · decisions 11693 · proposed 0 · facts 2462 · lessons 1113 · runbooks 2 (features=launch,focus,tiles,surfaces,connection,actions,rail,rename)
**Rig**: `make web-build build` at 49bcd3b (clean tree), producing `bin/musterd` v0.17.0-48-g49bcd3b. Each probe test got its own scratch daemon from `helpers/fixtures.ts`: data dir `$TMPDIR/muster e2e-XXXXXX` (the path contains a space), tmux on `-S <datadir>/tmux.sock`, and the stub `claude` at `$TMPDIR/muster e2e-stub-635d9c3a50837164/claude`. Browser was headless Chromium at 1280×720. The three throwaway specs (`web/e2e/zz-rbc2-{dialog,views,scroll}.spec.ts`) are deleted. No musterd or tmux server is left running, and `git status --porcelain` shows nothing of mine.

I read the gates log for cycle 2 and did not re-run it. `web-build` is green, and `e2e` is green (443 passed). The only red line is `10-kb-check` (7 unowned globs), which is doc-reconcile's to fix. So the app I drove is the one that will ship.

What changed since cycle 1 is the code path, not the plan. `onLaunched` now goes through `focus.bringForward`, the same path the number chords use, and the restore logic now lives in `render/launchrestore.ts`. So I re-measured every cycle-1 cell on this build, and added rows for the number chords going through `bringForward` in both views.

## Matrix

**Hosts.** The launch dialog is a modal `<dialog>`, so I measured it opened from Focus (by button and by ⌥⌘N) and opened from Tiles (⌥⌘N). I measured the launched surface in the Focus main slot and in the Tiles grid. The pop-out (`/doc.html`) hosts only the reader: it has no launch dialog and no terminal, so every row is N/A there.

| Req | Host | State | Claim | Result | Evidence |
|-----|------|-------|-------|--------|----------|
| REQ-5 | served `index.html` | no data yet | the static `checked` is on auto, not manual | pass | `GET /` → 200; `value="auto" checked` present, `value="default" checked` absent |
| REQ-5 | dialog from Focus | no data yet (`GET /api/repos` held by `page.route`) | the form shows its reset values | pass | while held: checked `sonnet` / `auto`, 0 Recent buttons |
| REQ-5 / E1 / E2 | dialog from Focus | fresh daemon, no history | sonnet + auto, settled | pass | after a 1.2 s hold: `sonnet`/`auto`, crumb `browse-root`; dialog box 280,97–1000,623 inside the 1280×720 viewport |
| REQ-5 | dialog from Tiles (⌥⌘N) | fresh | sonnet + auto | pass | `sonnet`/`auto`; dialog 280,97–1000,623 |
| REQ-5 | dialog from Focus | first recent has `lastPermissionMode: null` (set via sqlite; `/api/repos` confirms `null`) | mode falls back to auto; model still restored | pass | `opus`/`auto` |
| REQ-5 | dialog | stored `bypassPermissions` (no radio for it) | auto on the initial restore and on a Recent click | pass | initial `opus`/`auto`; after checking manual by pointer and then clicking the Recent: `opus`/`auto` |
| REQ-5 | dialog | daemon down (SIGTERM) | reset values | pass | reopened while down: `sonnet`/`auto`, `#launch-error` "Could not reach musterd." |
| E11 / Edge 17 | dialog from Focus | data (recent: haiku / acceptEdits) | restored on open | pass | `haiku`/`acceptEdits` |
| REQ-3 / E3 | dialog from Focus | data: a directory launched before (INV-1 state 2) | refusal message exact, visible and contained; dialog open; fields untouched | pass | text = `Claude Code doesn't recognise the model "muster-e2e-unrecognized-zeta" — update Claude Code, or pick another model`; computed display block, visibility visible, opacity 1; alert 281,575–999,611 inside dialog 280,60–1000,661; `open=true`; `other` + `muster-e2e-unrecognized-zeta` + `plan` + title `a4-refused` intact |
| INV-1 / Edge 8 | same | same | a refusal writes nothing | pass | `/api/repos` byte-identical; `settings.local.json` bytes and mtime identical; tmux `[muster-1]` → `[muster-1]`; `/api/state` sessions 1 → 1; **0** `/ws` frames during the refusal, and still 0 after a 1.2 s tick (listener attached before `goto`) |
| REQ-3 | same | settled | the alert survives a render tick; keyboard focus stays in the form | pass | after 1.2 s: display block, opacity 1; `activeElement` = `#launch-button` (the button clicked with the pointer) |
| REQ-3 / INV-1 / Edge 7 | dialog from Focus | never-launched directory | refusal, and nothing written | pass | exact message; no `<dir>/.claude`; `/api/repos` byte-identical (holds only the seed dir); 1 Recent button; tmux `[muster-1]` unchanged; sessions 1 → 1; `open=true` |
| REQ-3 | dialog from Tiles (⌥⌘N) | data (2 live tiles) | alert visible and contained; grid untouched | pass | alert 281,575–999,611 inside 280,60–1000,661, opacity 1; 2 tiles; tmux `[muster-1, muster-2]` |
| REQ-3 | dialog | refusal with a 184-character model | message contained horizontally | note | alert and dialog `scrollWidth 1208` vs `clientWidth 718`, `overflow-wrap: normal` (Note 1) |
| E4 / Edge 9 | dialog → Focus | retry with `sonnet` (pointer), submitted with Enter in Title | dialog closes, one new session, and it is opened | pass | sessions `[a4-seed opus, a4-refused sonnet]`; the current card is `a4-refused` (card reads `ctx unknown`); mainhead `a4-refused`; `activeElement` in `Terminal: a4-refused`; argv `--model sonnet --name a4-refused --permission-mode plan` |
| REQ-3 | dialog from Focus | daemon down | network error shown; dialog open; fields untouched | pass | "Could not reach musterd." (display block, opacity 1); `open=true`; `opus`/`plan` intact |
| REQ-4 / INV-3 | tmux oracle | launch via the dialog, every mode (label clicked by pointer) | `--permission-mode <m>` explicit, exactly once | pass | `pane_start_command`: `--permission-mode default` / `acceptEdits` / `plan` / `auto`, each 1× |
| REQ-4 / Edge 19 | tmux oracle | resume of a `default` session | explicit on resume | pass | `POST …/end` 200, `POST …/resume` 200; argv `--model claude-haiku-4-5-20251001 --resume claude-b8 --permission-mode default` |
| REQ-7 / INV-4 | Focus | no sessions; opened with ⌥⌘N, child picked, title typed, Enter | marker, mainhead, keyboard focus, typed input reaches the new session | pass | 1 current card (`b1-lone`); mainhead `b1-lone`; `activeElement` = `xterm-helper-textarea` in `Terminal: b1-lone` at dialog close, at READY and after 1.2 s; `tmux capture-pane` shows `stub-echo:b1-typed` |
| REQ-7 | Focus | no sessions | terminal placed in its host; geometry real | pass | region 300,90–1280,694 = `#main-terminal-slot` 300,90–1280,694, inside `#view-focus` 0,46–1280,720; sizenote `130×25` = tmux `130x25`; 1 terminal socket, 1 attached tmux client |
| REQ-7 / E5 / E6 / INV-4 | Focus | A focused by pointer (3 seeds) | B focused; bystander A untouched; input goes to B only | pass | current `[b2-b]`, A's `aria-current` null; mainhead `b2-b`; focus in `Terminal: b2-b` at close and after 1.2 s; B's pane has `stub-echo:b2-typed`, A's pane does not; 1 region, 1 live `/ws/terminal`, 1 attached client; A's `/api/state` row: 0 keys changed; A's card visible |
| REQ-7 / E8 / Edge 11 | Focus (attention sort) | another session in needs-input | launched C stays focused across render ticks; input reaches C | pass | rail order `[b3-needy, b3-a, b3-c]`; current `[b3-c]`, mainhead `b3-c` after 2.2 s; focus in `Terminal: b3-c`; echo in C's tmux pane |
| REQ-7 | Focus | A focused, rail overflows | marker visible in the rail | N/A — settled as Option B (kb:adr/rail-launch-leaves-rail-scroll-untouched); not re-filed | |
| REQ-8 / INV-4 | Tiles | free slot (1 seed), opened with ⌥⌘N | keyboard focus in the new tile; input reaches it; tile inside the grid | pass | focus in `Terminal: b4-free` at close and after 1.2 s; echo in tmux; tile 640,85–1279,402 inside grid 0,84–1280,720; 2 tiles |
| REQ-8 / E7 / Edge 13 | Tiles | full grid (4) | promoted, focused, typed input arrives, geometry real, one client each | pass | live `[seed0, seed1, seed2, b5-full]`, `seed3` demoted to the strip; focus in `Terminal: b5-full` at close and after 1.2 s; echo in tmux; `expectAllTileGeometrySettled` over all 4 = match; tile 640,328–1279,570 inside grid 0,84–1280,571; 4 regions, 4 sockets, 4 attached clients |
| REQ-8 | Tiles → Focus | after a Tiles launch, switch view | (no plan requirement) | note | Focus shows `b5-seed0`, not the launched `b5-full` (Note 3, unchanged from cycle 1) |
| chords via `bringForward` | Focus | 3 sessions, c3 focused by pointer (keyboard focus in c3's terminal) | ⌥⌘1 / ⌥⌘2 / ⌥⌘0 select, and stay select-only | pass | ⌥⌘1 → current `[b6-c1]`, mainhead `b6-c1`, 1 region, 1 socket, `activeElement` BODY; ⌥⌘2 → `[b6-c2]`, BODY; ⌥⌘0 with c3 needs-input → `[b6-c3]`, BODY. Per kb:adr/launch-opens-launched-session, chords are select-only and launch moves keyboard focus into the terminal, so the shared owner kept that split |
| chords via `bringForward` | Focus | right after a dialog launch | the launch focuses the terminal; a later chord moves selection away | pass | after launch: `[b6-new]`, focus in `Terminal: b6-new`; ⌥⌘1 → `[b6-c1]`, BODY, 1 region, 1 socket, 1 attached client |
| chords via `bringForward` | Tiles | 5 sessions, grid full, t5 in the strip | ⌥⌘5 promotes t5 into the grid, geometry settled, select-only | pass | live `[t1..t4]` → `[t1, t2, t3, t5]`; `expectAllTileGeometrySettled` = match; t5 tile 640,328–1279,570 inside grid 0,84–1280,571; 4 tiles, 4 attached clients; `activeElement` BODY before and after |
| REQ-7 / REQ-8 | pop-out | any | — | N/A — `/doc.html` hosts only the reader | |
| REQ-7 / REQ-8 | Focus / Tiles | daemon down | — | N/A — a launch cannot succeed with the daemon down; the refusal-path daemon-down row is under REQ-3 | |
| REQ-6a / E9 / Edge 14 | dialog | first `GET /api/browse` held; `opus` picked by pointer | opus kept; the untouched mode restored | pass | mid-race `opus`/`auto` → settled `opus`/`acceptEdits`; crumb = the recent's dir |
| REQ-6a | dialog | same, but mode changed by keyboard (focus auto, ArrowLeft) | mode kept; the untouched model restored | pass | mid-race `sonnet`/`plan` → settled `haiku`/`plan` |
| REQ-6a | dialog | same, but `other…` picked and a custom model typed | custom kept; mode restored | pass | `other`/`my-custom`, `acceptEdits` |
| REQ-6a | dialog | `GET /api/repos` held; `fable` picked | kept | pass | `fable`/`acceptEdits` |
| REQ-6 | dialog | reopen after a touch + Escape | touched state resets; the restore applies again | pass | `haiku`/`acceptEdits` |
| REQ-6b / E10 / Edge 15 | dialog | second Recent clicked while the first browse is held | the second is listed and pressed, its values applied, no browse-root fallback | pass | after 1.5 s: crumb and footer = older dir; older `aria-pressed=true`, newer `false`; `haiku`/`plan`; `#launch-error` display none |
| REQ-6c / E12 / Edge 16 | dialog | first recent's directory deleted | browse-root fallback; error cleared once settled | pass | crumb `browse-root`, footer = `daemon.browseRoot`; `sonnet`/`auto`; `#launch-error` display none, empty |
| REQ-6b | dialog | the superseding Recent's own directory deleted | — | note — not re-measured (Note 2): `navigate`'s failure path is unchanged since cycle 1 | |
| Hidden | dialog | fresh | `[hidden]` elements computed `display: none` | pass | `#custom-model-row`, `#custom-model-input`, `#launch-error`, `.branch` all `none` |
| §6.7 | page | daemon down | banner shown prominently | pass | `#banner` 0,46–1280,78, display block, opacity 1, "musterd unreachable — hook output in open panes is Muster's absence, not session failure." |
| §6.1 / §6.3 | rail card | launched session | unknown shown as a word; permission mode never shown as authoritative | pass | the launched card reads `ctx unknown`; no permission-mode text on the card |
| §7.1 | Focus / Tiles | data | one live client per session | pass | Focus: 1 region / 1 socket / 1 attached client in every Focus cell; Tiles: 4 / 4 / 4 for 4 live tiles, demoted session shown only as a static strip card |
| §7.4 | Focus | launched session, 60 typed lines (>120 output lines) | xterm `scrollback: 0` | pass | `.xterm-viewport` scrollHeight 600 = clientHeight 600, scrollTop 0, 25 row divs; the first visible row is `l48` (older lines are gone, not scrollable) |

## Issues

### Critical

None.

### Major

None.

### Minor

None.

### Notes

1. **[note]** Re-measured and unchanged from cycle 1 Note 1. A refusal for a very long unbroken model name (184 characters) makes the dialog scroll sideways: `.launch-error` has `overflow-wrap: normal`, and the alert and dialog measure `scrollWidth 1208` against `clientWidth 718`. Realistic model ids wrap at the message's spaces and fit (718/718 in every other refusal cell). If a fix is wanted, it is one CSS line: `overflow-wrap: anywhere` on `.launch-error`.
2. **[note]** Not re-measured: the case where REQ-6b's superseding navigation itself fails and leaves the dialog empty (cycle 1 Note 2). The cycle-1 fix wave did not touch `navigate`'s failure path, only `initOpen`'s dispatch, and E10/E12, which bracket that path, pass above.
3. **[note]** Still true from cycle 1 Note 3. After a launch from Tiles, switching to Focus shows the old `focusedId` (`b5-seed0`), not the launched session. The plan only focuses in Focus, so this matches the plan.
4. **[note]** Cycle 1 Notes 4 and 5 predate this plan. I re-observed Note 5: with the daemon down, the Recent sidebar reads "No recent directories" beside "Could not reach musterd.". This is not filed.
5. **[note]** Setup, not a claim. I switched the rail to attention sort with `selectOption` as a precondition for the E8 row, drove needs-input with hook POSTs, and set the null and `bypassPermissions` stored modes with `sqlite3` against the scratch DB. Every claim cell used real pointer or keyboard input: radio and label clicks, typing, Enter, ArrowLeft, ⌥⌘N, ⌥⌘0–5.
6. **[note]** The refusal is instant against the stub. The real binary's ~1 s is D13's to measure (the forced canary), because this rig never runs the real `claude`.

## Maintainability review

# Maintainability review: New Session Improvement

**Plan**: new-session-improvement
**Part verdict**: needs-changes
**Cycle**: 2
**Pack**: kb: pack 30625 words (budget 8000) — sections — rules 1874 · features 10176 · diagrams 3889 · decisions 11693 · proposed 0 · facts 2462 · lessons 523 · runbooks 2
**Scope**: 14 files from `git diff main...HEAD -- cmd internal web/src ':!*_test.go' ':!*.test.ts'` (4 of them CLAUDE.md files: 3 changed only in the generated trailer, and `internal/claudecode/CLAUDE.md` also changed one hand-written invariant line)

## Cycle-1 findings, re-checked

| Cycle-1 finding | State now | Evidence |
|---|---|---|
| Major 1 (timeout policy in the composition root) | resolved | `modelCheckTimeout` now sits in `internal/claudecode/modelcheck.go:80` and is applied inside `CheckModel` (`:121-122`), matching `credentials.go`'s `keychainExecTimeout`. `server.go:192-194` is a one-statement closure that only binds `claudeBin`, the same form as the root's existing `attach` default (`:151-158`). The canary harness's redundant outer wrap is gone (`rg modelCheckRunTimeout test/canary` finds nothing). |
| Major 2 (second copy of `focusSession`) | resolved | `rg -n 'app\.focus\(\|\.promote\(\|promoteTile\(' web/src --glob '!*.test.ts'` now finds the Focus/Tiles branch only in `focus.ts:114-121` (`bringForward`). `launch.ts:574` reaches it through a structurally typed `deps.focus`, the same shape as `rail.ts:23`'s `surfaces: { focusSelected(id: number): void }`. |
| Major 3 (pure module in `features/`) | resolved as filed | `rg -n 'from "\./' web/src/features --glob '!*.test.ts'` finds nothing, and there is no hyphenated filename left. The new location `render/` is covered in Note 1. |
| Minor 1 (`openFallback` relabel) | resolved | The function was removed, and `initOpen` (`launch.ts:351-379`) switches on the outcome itself. This removal is what Minor 1 below follows from. |
| Minor 2 (restore values computed twice) | resolved | `repoRestore` (`launchrestore.ts:33`) is the one owner. The Recent click (`launch.ts:188`) and `initialRestore` (`:42`) both call it. `DEFAULT_MODEL` is the only fallback literal, and `MODEL_PRESETS` at `launch.ts:38` is a separate concept. |
| Minor 3 (size reasons missing, daemon) | resolved | Reasons are now in Decisions. See Notes 4 and 5. |
| Minor 4 (`api.ts` filelen reason) | resolved | A reason is now in Decisions (pre-existing file; this change is comment-only). |

## Files

| File | Siblings opened | design: line | Size warnings | Result |
|------|-----------------|--------------|---------------|--------|
| internal/claudecode/CLAUDE.md | — (one hand-written invariant line, plus the trailer) | n/a | — | pass |
| internal/claudecode/launch.go | settings.go, credentials.go | n/a (no new type) | — | pass |
| internal/claudecode/modelcheck.go | credentials.go, version.go | yes (2), plus the fix-attempt reason for the timeout | — | pass |
| internal/server/CLAUDE.md | — (generated trailer) | n/a | — | pass |
| internal/server/server.go | usage.go; the `attach` default in the same function | reason given in the cycle-1 fix attempt | funlen `New` 48>40, reason holds | pass (Note 4) |
| internal/server/sessions.go | the in-file `launchError` constructors; `validateLaunchRequest`/`writeSettings`/`spawnAndRecordLaunch` | n/a | funlen `Launch` 83>60 and filelen 814, reason holds; `Resume` 41>40 is untouched | pass (Note 5) |
| web/src/api.ts | app.ts, protocol.ts | n/a | filelen 776, reason holds | pass |
| web/src/features/CLAUDE.md | — (generated trailer) | n/a | — | pass |
| web/src/features/focus.ts | rail.ts, surfaces.ts, launch.ts, main.ts | yes (fix attempt) | — | pass |
| web/src/features/launch.ts | focus.ts, rail.ts, surfaces.ts | yes | filelen 582, reason holds | Minor 1 |
| web/src/main.ts | — | n/a | — | pass (one registration argument changed) |
| web/src/render/CLAUDE.md | — (generated trailer) | n/a | — | pass |
| web/src/render/launchrestore.ts | render/crumbs.ts, render/focusrestore.ts, render/dead.ts, sessions/*.ts | yes (fix attempt, with grep) | — | Minor 1, Note 1 |
| web/src/terminal/pane.ts | terminal/*.ts | n/a (comment only) | — | pass |

## Issues

### Critical

None.

### Major

None.

### Minor

1. **[web-impl]** `NavigateOutcome` is declared at `web/src/render/launchrestore.ts:53`, but that module neither produces nor consumes it. Its only producer is `navigate()` at `web/src/features/launch.ts:297`, and its only consumers are `navigateUp` (`:321`) and `initOpen` (`:351-379`) in the same file. It stayed behind when `openFallback` was removed. This diverges from its siblings. Every other exported type in the pure `render/` modules appears in an exported function signature in its own module:
   - `crumbs.ts:7` `Crumb` → `splitCrumbs(path: string): Crumb[]` (`:18`)
   - `focusrestore.ts:10` `RestorableCandidate` → `isRestorableControl` (`:19`)
   - `focusrestore.ts:26` `FocusRestoreInput` → `shouldRestoreFocus` (`:41`)
   - `launchrestore.ts`'s own `Touched`/`Restore` → `initialRestore` (`:41`)

   `NavigateOutcome` is the only exception. `launch.ts` already declares its own exported types (`LaunchModalElements` `:40`, `LaunchModalHandlers` `:63`). The type's doc comment (`:49-52`) also describes a function that no longer exists ("why the outcome-to-fallback mapping that used to live here was removed"). This cites § Design "Match the siblings" and "One owner per concept". **A fix must make these true:** `navigate()`'s return type is declared beside `navigate()`, and `render/launchrestore.ts` exports only what its own functions take or return.

### Notes

1. **[note]** Where `launchrestore.ts` now lives. Conventions § Composition roots bullet 3 reads "`web/src/render/` holds pure DOM builders … `web/src/sessions/` and `web/src/terminal/` hold pure logic". `render/CLAUDE.md` opens "pure DOM builders, no state … derivation lives in `web/src/sessions/`/`web/src/reader/`", and kb:diagram/web-components labels `render/` "DOM only". `launchrestore.ts` has no DOM in it. The fix-attempt `design:` line gives a reason with a grep: it follows `render/focusrestore.ts`, which is also DOM-free ("No DOM here", from plan general-cleanup), and the `render/→api` edge already exists (`render/dead.ts:9`). Moving the module to `sessions/` would add a new `sessions/→api` edge to a graph the diagram calls strictly layered. So the placement follows a real sibling, and a newcomer would not misread it. My cycle-1 bar pointed at `focusrestore.ts` as a sibling, so filing this again would move the goalposts. The rule and the practice disagreed before this plan. Settling where a controller's non-DOM pure decision goes is a conventions edit, and that belongs in the backlog, not with an impl agent.
2. **[note]** For review-work (§ Comments, "don't narrate history"). This branch added comments that cite review findings or earlier states: `focus.ts:65-66` (the `bringForward` doc), `launch.ts:186`, `:347-349` (a paragraph about the removed `openFallback`), `:572-573`, `launchrestore.ts:4-5`, `:30`, `:51-52`, and `sessions.go:147` and `:214` ("before this plan"). A newcomer cannot resolve "review-maintainability cycle 1 Major 2" from the code. The tree already had this habit before this plan (`sessions.go:418, :470, :486, :584`, `pane.ts:195`).
3. **[note]** For review-work (comment truth, pre-existing). The "Launch validates req, runs the model check, …" paragraph (`sessions.go:150-153`) sits in the same comment block as `validateLaunchRequest`'s doc (`:154-158`), so Go attaches it to `validateLaunchRequest`. `Launch` itself (`:206`) has no doc comment. Cycle 1's correctness Minor 4 edited the paragraph where it stood.
4. **[note]** The reason given for `New` funlen 48>40 holds. `New` is the single composition root. The `checkModel` field is one more entry in the existing `launcher := &sessionLauncher{…}` literal, which adds no statement, and the fix attempt measured 48 on `main` as well.
5. **[note]** The reason given for `Launch` funlen 83>60 / file 814 holds in substance. The model-check block (`sessions.go:209-220`) has the same shape as the fail-open probe that already sits inline in the same function: the `MaxSessionID` call, warn on error, degrade (`:267-271`). One part of the argument is muddled, though. It cites `validateLaunchRequest` as a reason not to extract, but that function is exactly the extracted `if lerr := …; lerr != nil { return nil, lerr }` shape. No split requested (kb:adr/process-size-linters-warn-never-fail).
6. **[note]** Some Decisions lines now contradict the code, because the fix-attempt sections superseded them without striking them. `daemon-implementation.md` Decisions bullet 3 still says "The 5 s timeout is applied at the `server.go` wiring closure, not inside `CheckModel`". `web-implementation.md` Decisions bullets 3 and 6 still describe `launch-restore.ts` beside `launch.ts` and say "No grep … was needed". These are plan artifacts, not code, so no change is requested. A later reader of the log, such as retro, should take the fix-attempt sections as current.
7. **[note]** Unchanged from cycle 1 and still no change requested. `modelCheckWaitDelay` is the one named `WaitDelay` constant. A nil `checkModel` means "skip the check" for literal-built test launchers, where the sibling `cfg.Attach` resolves nil to a default instead. The spellings `ModelUnrecognised` and `modelUnrecognized` sit side by side.
8. **[note]** Shared state. `touched` (`launch.ts:97`) is declared with its writers named: the DOM listeners (`:508`, `:513`, `:517`) and `resetForm` (`:387`). Its one reader is `applyInitialRestore`. The page is single-threaded. The only async interleaving is a close and reopen while `initOpen` is still awaiting, and that already goes through `browseRequestId`'s `"superseded"` path. On the daemon side, the `checkModel` closure captures only the immutable `claudeBin`. `go test -race` is green (`02-test.log`).
9. **[note]** Layering. No Claude-Code-format knowledge has leaked: the D11 grep over `internal`/`cmd` outside `internal/claudecode/` is clean, and `server.go`/`sessions.go` see only `ModelVerdict`. `main.ts` changed by one argument in an existing registration line.
10. **[note]** For review-work (registry/DIAG). The gates' `10-kb-check.log` fails with `internal/claudecode/modelcheck.go` (and its test, plus two e2e specs) "owned by no feature". kb:diagram/web-components still counts `render/` as "21 modules", but 22 non-test modules now exist there.
11. **[note]** The size log's funlen hits on test files (`launch_test.go` `TestBuildArgv`, three in `sessions_test.go`, two in `test/canary/harness_test.go`) are outside this review's diff, and the log has no `dupl` lines.
