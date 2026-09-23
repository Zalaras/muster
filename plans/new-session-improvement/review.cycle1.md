# Review: new-session-improvement

**Plan**: new-session-improvement
**Verdict**: needs-changes
**Cycle**: 1
**Gates**: 1 failed
**Parts**: code, browser, maintainability
**Part verdicts**: code needs-changes, browser needs-changes, maintainability needs-changes

_Merged by orch-state.py merge-review; the verdict is computed from the parts and the gate run, never edited by hand._

## Correctness review

# Correctness review: New Session Improvement

**Plan**: new-session-improvement
**Part verdict**: needs-changes
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

## Browser review

# Browser review: New Session Improvement

**Plan**: new-session-improvement
**Part verdict**: needs-changes
**Cycle**: 1
**Pack**: kb: pack 26789 words (budget 8000) — WARN exceeds; sections rules 1340 · features 10176 · diagrams 0 · decisions 11693 · proposed 0 · facts 2459 · lessons 1113 · runbooks 2 (features=launch,focus,tiles,surfaces,connection,actions,rail,rename)
**Rig**: `make web-build build` at b3e7963 (tree dirty only by `orchestration-state.json`); one scratch daemon per probe test from `helpers/fixtures.ts` — data dir `$TMPDIR/muster e2e-XXXXXX` (space-bearing), tmux `-S <datadir>/tmux.sock`, stub `claude` at `$TMPDIR/muster e2e-stub-635d9c3a50837164/claude`; headless Chromium 1280×720; throwaway `web/e2e/zz-review-browser-probe.spec.ts` deleted, no musterd/tmux server left, `git status --porcelain` shows nothing of mine.

Gates log read, not re-run: `web-build` and `e2e` are green (441 passed). The only red line is `10-kb-check` (7 "owned by no feature" globs), which is doc-reconcile's to fix. So the app I drove is the one that will ship.

## Matrix

Hosts: the launch dialog is a modal `<dialog>` opened from the masthead, so it is measured opened from **Focus** and opened from **Tiles**. The launched surface is measured in **focus** (main slot) and **tiles** (grid). **pop-out** (`/doc.html`) hosts only the reader, with no launch dialog and no terminal, so it is N/A for every row.

| Req | Host | State | Claim | Result | Evidence |
|-----|------|-------|-------|--------|----------|
| REQ-5 | served `index.html` | no data yet | static `checked` is on auto, not manual | pass | `GET /` → 200; `value="auto" checked` present, `value="default" checked` absent |
| REQ-5 | dialog from Focus | no data yet (`GET /api/repos` held by `page.route`) | form shows its reset values | pass | checked model `sonnet`, mode `auto` while repos held |
| REQ-5 / E1 / E2 | dialog from Focus | fresh daemon, no history | sonnet + auto, settled | pass | after 1.2 s hold: `sonnet`/`auto`, crumb `browse-root`; dialog box 280,97–1000,623 inside 1280×720 viewport |
| REQ-5 | dialog from Tiles (opened by ⌥⌘N) | fresh | sonnet + auto | pass | `sonnet`/`auto`; dialog 280,97–1000,623 |
| REQ-5 | dialog from Focus | first recent `lastPermissionMode: null` (set via sqlite; `/api/repos` confirmed `null`) | mode falls back to auto, model still restored | pass | `opus`/`auto` |
| REQ-5 | dialog | stored `bypassPermissions` (no radio) | auto on initial restore and on Recent click | pass | `opus`/`auto` on both paths |
| REQ-5 | dialog | daemon-down (SIGTERM) | reset values | pass | `sonnet`/`auto`, `#launch-error` "Could not reach musterd." |
| E11 / Edge 17 | dialog from Focus | data (recent: haiku / acceptEdits) | restored on open | pass | `haiku`/`acceptEdits` |
| REQ-3 / E3 | dialog from Focus | data: previously launched dir (INV-1 state 2) | refusal message exact, visible, contained; dialog open; fields untouched | pass | text = `Claude Code doesn't recognise the model "muster-e2e-unrecognized-zeta" — update Claude Code, or pick another model`; computed display block / visibility visible / opacity 1; alert 281,575–999,611 inside dialog 280,60–1000,661; `open=true`; `other…` + custom text + `plan` + title intact |
| INV-1 / Edge 8 | same | same | refusal writes nothing | pass | `/api/repos` byte-identical; `settings.local.json` bytes and mtime identical; tmux sessions `[muster-1]` unchanged; `/api/state` 1→1 sessions; **0** `/ws` frames received during the refusal (listener attached before `goto`) |
| REQ-3 | same | settled | alert survives a render tick; keyboard focus stays in the form | pass | still visible after 1.2 s; `activeElement` = `#title-input` |
| REQ-3 / INV-1 / Edge 7 | dialog from Focus | never-launched dir | refusal + nothing written | pass | exact message; no `<dir>/.claude`; `/api/repos` holds only the prior dir; Recent buttons 1; tmux unchanged |
| REQ-3 | dialog from Tiles | data (2 live tiles) | alert visible and contained; grid untouched | pass | alert 281,575–999,611 inside 280,60–1000,661, opacity 1; tiles 2; tmux `[muster-1, muster-2]` |
| REQ-3 | dialog | refusal with a 184-char model | message contained horizontally | note | alert and dialog `scrollWidth 1208` vs `clientWidth 718` (Note 1) |
| E4 / Edge 9 | dialog → focus | retry with `sonnet` (pointer), submit with Enter | dialog closes, exactly one session, launched session opened | pass | 1 session `model.id=sonnet`; current card `p2-refused`; `activeElement` in `Terminal: p2-refused`; argv `--model sonnet … --permission-mode plan` |
| REQ-3 | dialog from Focus | daemon-down | network error shown, dialog open, fields untouched | pass | "Could not reach musterd." visible; `open=true`; `opus`/`plan` intact |
| REQ-4 | tmux oracle | launch via dialog, every mode | `--permission-mode <m>` explicit | pass | `pane_start_command` carries `--permission-mode default` / `acceptEdits` / `plan` / `auto`, each exactly once |
| REQ-4 / Edge 19 | tmux oracle | resume of a `default` session | explicit on resume | pass | `POST …/resume` 200; argv `--resume claude-p12 --permission-mode default` |
| REQ-7 | focus | no sessions; ⌥⌘N, pick, type title, Enter (keyboard only) | marker, mainhead, keyboard focus, typed input reaches B | pass | 1 `aria-current` card (`p4-b`); mainhead `p4-b`; `activeElement` = `xterm-helper-textarea` in `Terminal: p4-b` at dialog close, at READY and after 1.2 s; `tmux capture-pane` of B holds `stub-echo:p4-typed` |
| REQ-7 | focus | no sessions | terminal placed in its host, geometry real | pass | terminal 300,90–1280,694 = `#main-terminal-slot`, inside `#view-focus` 0,46–1280,720; sizenote `130×25` = tmux `130x25` |
| REQ-7 / E5 / E6 / INV-4 | focus | A focused by pointer, 10 seeds | B focused, A bystander untouched, input to B only | pass | B `aria-current=true`, A none, 1 current; mainhead `p5-b`; focus in `Terminal: p5-b` after 1.2 s; capture of B has `stub-echo:p5-typed`, capture of A does not; 1 terminal region, 1 live `/ws/terminal`; A's `/api/state` row: 0 keys changed |
| REQ-7 | focus | A focused, rail overflows | B's current marker can be seen in the rail | FAIL (Minor 1) | card B 0,1740–299,1906 vs rail viewport 0,85–299,720; `#sessions` scrollHeight 1821 / clientHeight 635, `overflow-y: auto`, scrollTop 0 |
| REQ-7 / E8 / Edge 11 | focus (attention sort) | another session in needs-input | launched C stays focused past render ticks; input reaches C | pass | rail order `[needy, a, c]`; C `aria-current`, count 1, mainhead `p6-c` after 2.2 s; focus in `Terminal: p6-c`; echo in C's tmux pane |
| REQ-8 / INV-4 | tiles | free slot | keyboard focus in the new tile; input reaches it; tile inside grid | pass | focus in `Terminal: p7-free` after 1.2 s; echo in tmux; tile 641,403–1279,719 inside grid 0,84–1280,720 |
| REQ-8 / E7 / Edge 13 | tiles | full grid (4) | promoted, focused, typed input arrives, geometry real, one client | pass | 4 tiles, `p7-free` demoted to strip (static card); focus in `Terminal: p7-full` at close and after 1.2 s; echo in tmux; `expectAllTileGeometrySettled` on all 4 live tiles = match; tile 641,328–1279,570 inside grid 0,84–1280,571; 4 terminal regions for 4 live tiles |
| REQ-8 | tiles → focus | after a Tiles launch, switch view | (no plan requirement) | note | Focus shows `p7-seed-0`, not the launched `p7-full` (Note 3) |
| REQ-7 / REQ-8 | pop-out | any | — | N/A — `/doc.html` hosts the reader only | |
| REQ-7 / REQ-8 | focus / tiles | daemon-down | — | N/A — a launch cannot succeed with the daemon down; the refusal path is the REQ-3 daemon-down row | |
| REQ-6a / E9 / Edge 14 | dialog | first `GET /api/browse` held; `opus` picked by pointer | opus kept, untouched mode restored | pass | mid-race `opus`/`auto` → settled `opus`/`acceptEdits`, crumb = recent's dir |
| REQ-6a | dialog | same; mode changed by keyboard (ArrowLeft) | mode kept, untouched model restored | pass | mid `sonnet`/`plan` → settled `haiku`/`plan` |
| REQ-6a | dialog | same; `other…` + typed custom model | custom kept, mode restored | pass | `other`/`my-custom`, `acceptEdits` |
| REQ-6a | dialog | `GET /api/repos` held; `fable` picked | kept | pass | `fable`/`acceptEdits` |
| REQ-6 | dialog | reopen after touch + Escape | touched state resets, restore applies again | pass | `haiku`/`acceptEdits` |
| REQ-6b / E10 / Edge 15 | dialog | second Recent clicked while first browse held | second listed and pressed, its values applied, no browse-root fallback | pass | after 1.5 s: crumb and footer = older dir; older `aria-pressed=true`, newer `false`; `haiku`/`plan` |
| REQ-6b | dialog | superseding Recent's directory deleted | — | note | no crumbs, empty listing, footer `—`, error shown (Note 2) |
| REQ-6c / Edge 16 | dialog | first recent's directory deleted | browse-root fallback; error cleared once settled | pass | footer `…/browse-root`, `#launch-error` hidden, `sonnet`/`auto` |
| Hidden | dialog | all | `[hidden]` elements computed `display: none` | pass | `#custom-model-row`, `#custom-model-input`, `#launch-error`, `.branch` all `none` |
| §6.7 | page | daemon-down | banner shown prominently | pass | `#banner` visible 0,46–1280,78, opacity 1, "musterd unreachable — …" |
| §6.1 / §6.3 | rail card | launched session | unknown shown as a word; permission mode never shown as authoritative | pass | card reads `ctx unknown`; `permissionMode` is never rendered (`web/src` has no renderer for it) |
| §7.1 | focus / tiles | data | one live client per session | pass | Focus: 1 region, 1 socket; Tiles: one region per live tile, demoted session only as a static strip card |
| §7.4 | focus / tiles | — | xterm `scrollback: 0` | note — not measured (Note 6) | |

## Issues

### Critical

None.

### Major

None.

### Minor

1. **[orchestrator:decision]** A launch into a rail that overflows puts the current marker on a card the user cannot see. REQ-7 names the marker as its visible consequence. With 10 seeds and A focused, the launched B's card lands at 0,1740–299,1906. The rail's scroll viewport is 0,85–299,720 (`#sessions` scrollHeight 1821 / clientHeight 635, `overflow-y: auto`), and scrollTop stays 0. The mainhead does show B's title. No focus path in `web/src` calls `scrollIntoView`, so number chords behave the same way today. Launch is new here because it appends the card at the bottom of manual order and then focuses it. Options:
   - **(A)** `onLaunched` (`web/src/features/launch.ts`) scrolls the launched card into view in the rail (`block: "nearest"`), so the marker REQ-7 names is on screen.
   - **(B)** Keep rail scroll untouched, matching the number chords and ⌥⌘0. The mainhead title confirms the launch, and REQ-7's marker claim holds in the DOM.

### Notes

1. **[note]** The refusal message echoes the model string as typed, and `.launch-error` has no `overflow-wrap`. With a 184-character unbroken model name, both the alert and the dialog measure `scrollWidth 1208` against `clientWidth 718`, so the dialog scrolls sideways. Realistic model ids (≤ ~40 characters) wrap at the message's spaces and fit. The fix, if wanted, is one CSS line (`overflow-wrap: anywhere` on `.launch-error`, `web/src/style.css:2784`).
2. **[note]** REQ-6b plus a failing superseding navigation leaves the dialog empty. With two recents and the first `GET /api/browse` held, I deleted the older recent's directory and clicked it. The user's navigation failed and there was no earlier listing to restore. The initial restore, correctly superseded, did no fallback. The settled dialog showed no crumbs, an empty listing, a footer of `—`, and "directory does not exist or is not a directory". The other Recent is still clickable (this race needs two or more recents), so the user can recover in one click. That is why this is a note rather than a defect. If it is ever fixed, the fix belongs in `navigate`'s failure path (fall back to the browse root when `current` is null), not in the initial restore, which keeps REQ-6b as written.
3. **[note]** After a launch from Tiles (full grid), switching to Focus shows `p7-seed-0` (the old `focusedId`), not the launched `p7-full`. The plan only calls `app.focus` in Focus, so this is what the plan specifies. I am recording it because `kb:adr/launch-opens-launched-session`'s wording ("focuses the launched session in Focus") could be read either way.
4. **[note]** This predates the plan and is not caused by it. Pressing Launch while a child navigation is still loading launches into the previously listed directory. Measured: footer `…/browse-root`, listing `loading…`, launched `directory` `…/browse-root`. The footer states that directory truthfully, so this is not an honesty violation. My first probe run hit it by accident.
5. **[note]** This also predates the plan. With the daemon down, the dialog's Recent sidebar reads "No recent directories" beside "Could not reach musterd.". The sidebar states an absence Muster does not know. The error line explains it, so I am not filing it as §6.
6. **[note]** Not measured: xterm `scrollback: 0` (§7.4). The plan does not touch terminal construction (`pane.ts` changed only a doc comment), and xterm's options are not reachable from the DOM without its internals.
7. **[note]** Setup, not a claim: I switched the rail to attention sort with `selectOption` as a precondition for the E8 row. Every claim cell used real pointer or keyboard input: label clicks, typing, Enter, ArrowLeft, ⌥⌘N.
8. **[note]** The refusal took 23–52 ms because the stub answers the pre-check instantly. The real binary's ~1 s is D13's to measure (forced canary), since this rig never runs the real `claude`.

## Maintainability review

# Maintainability review: New Session Improvement

**Plan**: new-session-improvement
**Part verdict**: needs-changes
**Cycle**: 1
**Pack**: kb: pack 30622 words (budget 8000) — sections — rules 1874 · features 10176 · diagrams 3889 · decisions 11693 · proposed 0 · facts 2459 · lessons 523 · runbooks 2
**Scope**: 12 files from `git diff main...HEAD -- cmd internal web/src ':!*_test.go' ':!*.test.ts'` (3 of them generated CLAUDE.md trailers)

## Files

| File | Siblings opened | design: line | Size warnings | Result |
|------|-----------------|--------------|---------------|--------|
| internal/claudecode/CLAUDE.md | — (generated trailer) | n/a | — | pass |
| internal/claudecode/launch.go | settings.go, credentials.go | n/a (no new type) | — | pass |
| internal/claudecode/modelcheck.go | credentials.go, version.go, internal/ghissue/ghissue.go | yes (2) | — | Major 1 (wiring shape), notes |
| internal/server/CLAUDE.md | — (generated trailer) | n/a | — | pass |
| internal/server/server.go | usage.go, issue.go | no `design:` for the closure (a plain Decisions line gives the reason) | funlen `New` 48>40, no reason | Major 1, Minor 3 |
| internal/server/sessions.go | usage.go; in-file `launchError` constructors | n/a (`modelUnrecognized` matches its siblings) | funlen `Launch` 83>60 and filelen 814: growth recorded, no reason given; `Resume` 41>40 is an untouched function | Minor 3 |
| web/src/api.ts | app.ts, protocol.ts | n/a | filelen 777, no reason | Minor 4 |
| web/src/features/CLAUDE.md | — (generated trailer) | n/a | — | pass |
| web/src/features/launch-restore.ts | all 16 features/*.ts, sessions/rename.ts, render/focusrestore.ts, render/crumbs.ts | yes, but says "no grep … was needed" | — | Major 3, Minor 1 |
| web/src/features/launch.ts | focus.ts, rail.ts, surfaces.ts, tiles.ts | yes (3) | filelen 573, reason holds | Major 2, Minor 2 |
| web/src/main.ts | — | n/a | — | pass (one-line registration change) |
| web/src/terminal/pane.ts | terminal/*.ts | n/a (comment only) | — | pass |

## Issues

### Critical

None.

### Major

1. **[daemon-impl]** The model-check timeout policy and a closure that applies it live in the composition root: `internal/server/server.go:22-25` (`modelCheckTimeout` with its measured rationale) and `:198-202` (`context.WithTimeout` + `defer cancel()` + `claudecode.CheckModel(ctx, claudecode.RunModelCheck, claudeBin, dir, model)`). This breaks kb:adr/process-composition-roots-registration-only and conventions § Composition roots bullet 1 ("build dependencies and register each feature in one line"). It also diverges from the sibling that the `design:` line says it mirrors. `internal/claudecode/credentials.go` owns its own timeout: `const keychainExecTimeout = 2 * time.Second` (`:50`) is applied inside `KeychainTokenReader(user string, run execFunc) TokenReader` (`:57-59`). Its wiring is one expression, `claudecode.KeychainTokenReader(cfg.KeychainUser, claudecode.RunCommand)` (`internal/server/usage.go:77`), which sits in the feature file, not the root. The new shape is `CheckModel(ctx, run, bin, dir, model)`, with the deadline added by the caller. The reason Decisions gives for this ("keeps `CheckModel` timeout-agnostic … tested directly … without needing the production 5 s value") does not hold. `context.WithTimeout` on a parent that has an earlier deadline keeps the earlier one, so a test that passes a short-deadline ctx controls the timing even if the timeout lives inside `claudecode`, and `KeychainTokenReader`'s tests already work this way. This cites § Design "Match the siblings". I did not file it as Critical because the root's existing `attach` default (`server.go:157`) is a closure of the same form. **A fix must make these true:** the `checkModel` wiring in `server.go` is a single expression with no constant or policy of its own, and the timeout sits next to the check in `internal/claudecode`, the way `keychainExecTimeout` does.

2. **[web-impl]** `launch.ts:560-564` adds a second copy of focus.ts's `focusSession`. This cites § Design "Reuse before add" and "One owner per concept". `rg -n -B1 -A4 'app\.state\.view === "(tiles|focus)"' web/src/features/launch.ts web/src/features/focus.ts`:
   ```
   web/src/features/launch.ts:560:      if (app.state.view === "tiles") {
   web/src/features/launch.ts-561-        deps.tiles.promote(session.id);
   web/src/features/launch.ts-562-      } else {
   web/src/features/launch.ts-563-        app.focus(session.id);
   web/src/features/launch.ts-564-        app.render();
   --
   web/src/features/focus.ts-108-  function focusSession(session: Session): void {
   web/src/features/focus.ts:109:    if (app.state.view === "focus") {
   web/src/features/focus.ts-110-      app.focus(session.id);
   web/src/features/focus.ts-111-      app.render();
   web/src/features/focus.ts-112-    } else {
   web/src/features/focus.ts-113-      deps.promoteTile(session.id);
   ```
   focus.ts's own doc comment calls this "the shared tail of `nth`/`neediest`". Before this plan, launch.ts only split promote from render. The added `app.focus(session.id)` turns it into a line-for-line copy of `focusSession`. If one copy changes (for example, Tiles also setting `focusedId`), the other will not follow. **A fix must make this true:** "bring a session forward in the current view" has one owner. The number chords and `onLaunched` both call it, reaching it through a structurally typed `deps` entry (web/src/features/CLAUDE.md invariant 2: no sibling import).

3. **[web-impl]** `web/src/features/launch-restore.ts` is a pure-logic module in the controllers directory. `web/src/features/CLAUDE.md` "Owns" says: "one controller per feature … Pure logic lives in `sessions/` or `terminal/`, DOM building in `render/`". Conventions § Composition roots bullet 3 says the same, and kb:diagram/web-components draws `features/` as "16 controllers — Stateful per-feature controllers". Every sibling that splits a pure decision out of a controller puts it outside `features/`:
   - `sessions/rename.ts` holds the pure commit semantics that `render/rename.ts` calls.
   - `render/focusrestore.ts` holds the "pure focus-restore decision" for `features/connection.ts`.
   - Launch's own existing pure helper, `splitCrumbs`, is in `render/crumbs.ts`.

   `rg -n 'from "\./' web/src/features --glob '!*.test.ts'` returns one hit, `web/src/features/launch.ts:30`, so this is now the only intra-`features/` import in the tree. It is also the only hyphenated filename under `web/src`. A newcomer who reads kb:adr/process-one-name-per-feature (one name shared by controller, handler file, E2E prefix and helper) will look for a `launch-restore` feature that does not exist. The `design:` line says the plan named the location and "no grep … was needed". § Design "Reuse before add" asks for that grep in Decisions. **A fix must make these true:** `features/` holds only controllers, the pure restore decision lives where the directory rules put pure logic, and Decisions records the grep. A plan's placement does not override the directory's own CLAUDE.md. Changing that rule would be a conventions edit, and that is not an impl agent's call.

### Minor

1. **[web-impl]** `openFallback` (`launch-restore.ts:43`) is a 1:1 relabelling of `NavigateOutcome` (`ok→restore`, `failed→browse-root`, `superseded→none`). `initOpen` (`launch.ts:357-364`) then branches on its result with the same `if`/`else if` it would need on the outcome itself. The module header says the split keeps `initOpen` under Biome's cognitive-complexity ceiling, but that reason does not apply to this function, because the caller's branch count is unchanged. This cites § Design "seams where a test needs one and nowhere else" and "a pattern earns its name by the problem it solves". **A fix must make this true:** each exported decision in the module decides something its caller could not write as the same branch. (`initialRestore`'s touched filter does meet this bar.)

2. **[web-impl]** A repo's restore values are still computed in two places. The clicked-Recent path in `launch.ts:181-182` does `setModel(repo.lastModel ?? "sonnet")` / `setPermissionMode(repo.lastPermissionMode)`. `initialRestore` in `launch-restore.ts:27-28` computes the same pair, and with `touched` all false it gives an identical result. The default model `"sonnet"` now appears at `launch.ts:181`, `launch.ts:377` and `launch-restore.ts:27`, while `permissionModeToCheck` (api.ts) is the single owner for the mode fallback. This duplication existed before, but this change created an owner and left one caller outside it. This cites § Design "One owner per concept". **A fix must make this true:** a repo's restore values and the default model each have one owner, and both the Recent click and the initial restore ask it.

3. **[daemon-impl]** Two size warnings on touched functions lack a reason. `server.go:127` `New` funlen 48>40 grew with the closure, and Decisions gives no reason. `sessions.go:206` `Launch` funlen 83>60 and the 814-line file: Decisions records the growth ("noted here for the maintainability reviewer") but gives no reason the new step belongs inline. In this same function, the other steps are named (`validateLaunchRequest` `:159`, `writeSettings` `:252`, `spawnAndRecordLaunch` `:290`). This cites § Design "Size is read, not obeyed" and kb:adr/process-size-linters-warn-never-fail. **A fix must make this true:** Decisions gives a reason for each warning, and the code bears it out. This is not a request to split anything.

4. **[web-impl]** `web/src/api.ts` is 777 lines (filelen, threshold 500). This change touched it (a comment rewrite, +2 lines) and Decisions gives no reason. Citation as Minor 3. **A fix must make this true:** Decisions carries a reason.

### Notes

1. **[note]** `RunModelCheck` is the tree's fourth exec runner. `rg -n "^func Run[A-Za-z]*\(ctx context.Context" internal` finds `ghissue.RunCommand` (`ghissue.go:57`, stdout+stderr), `selfupdate.RunVersionProbe` (`exeversion.go:42`), `claudecode.RunModelCheck` (`modelcheck.go:52`) and `claudecode.RunCommand` (`credentials.go:32`, stdout only; stderr discarded; non-nil on exit ≠ 0). None of them can be reused here. `claudecode` is a leaf that imports nothing internal (kb:diagram/daemon-components), and `RunCommand`'s stderr-discarding behaviour is what `KeychainTokenReader` needs. The signature `(ctx, dir string, argv []string)` differs from every sibling's `(ctx, name string, args ...string)`, which the `dir` parameter explains.
2. **[note]** `modelCheckWaitDelay` (`modelcheck.go:38`) is a named constant, while all 11 other `cmd.WaitDelay` sites write `2 * time.Second` inline. It is harmless, but it is the one site that reads differently.
3. **[note]** `sessionLauncher.checkModel == nil` means "skip the check" (`sessions.go:145-148, 216`), and that branch exists only for literal-built test launchers. The nearest sibling optional dependency, `cfg.Attach`, resolves nil to the production default at construction (`server.go:155-163`), so a missing value there cannot silently drop the behaviour.
4. **[note]** `Restore.mode` is already a `PermissionMode` (via `permissionModeToCheck`). `applyInitialRestore` then passes it to `setPermissionMode`, which runs `permissionModeToCheck` on it again. This is idempotent, so the only cost is that the mode decision runs twice.
5. **[note]** Spelling: `claudecode.ModelUnrecognised` and `modelUnrecognized`/`"model_unrecognized"` sit on adjacent lines (`sessions.go:220-221`), so one grep will not find both. The tree already mixes the two spellings in identifiers (`tmux.StatusUnrecognized`, `kb.recognisedKBComment`), so there is no single convention to cite.
6. **[note]** The `launch.ts` filelen of 573 has a reason that holds: the decisions moved out, and `initOpen` meets the Biome ceiling. The `sessions.go` `Resume` funlen (41>40) is in a function this diff does not touch. The funlen hits on test files (`launch_test.go`, `sessions_test.go`) are outside this review's diff, and the size log has no `dupl` lines.
7. **[note]** Shared state. On the web side, `touched` (`launch.ts:91`) is declared with its writers named: the three DOM listeners at `:495/:500/:504` plus `resetForm`. Its one reader is `applyInitialRestore`. The page is single-threaded, and I found no interleaving that a guard would fix. On the daemon side, the `checkModel` closure captures only the immutable `claudeBin`, and `RunModelCheck`'s buffer is local. `go test -race` is green (`02-test.log`).
8. **[note]** Layering. `rg -n -e '"--no-session-persistence"' -e '"--bare"' -e "model catalog" internal cmd --glob '!internal/claudecode/**'` returns no matches (exit=1), so no Claude-Code-format knowledge has leaked. `main.ts` changed by one argument in an existing registration line.
9. **[note]** For review-work (registry/DIAG): `docs/features/launch/spec.md:10`'s `web:` glob (`web/src/features/launch.ts, web/src/render/crumbs*.ts`) does not cover `launch-restore.ts`, and `kb for web/src/features/launch-restore.ts` names no feature spec. kb:diagram/web-components counts `features/` as "16 controllers".
10. **[note]** For review-work (§ Comments, "don't narrate history"): `api.ts:278` begins "fallback changed by plan new-session-improvement REQ-5".
