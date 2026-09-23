# Review: new-session-improvement

**Plan**: new-session-improvement
**Verdict**: approved
**Cycle**: 4
**Gates**: 0 failed
**Parts**: code, browser, maintainability
**Part verdicts**: code approved, browser approved, maintainability approved

_Merged by orch-state.py merge-review; the verdict is computed from the parts and the gate run, never edited by hand._

## Correctness review

# Correctness review: New Session Improvement

**Plan**: new-session-improvement
**Part verdict**: approved
**Cycle**: 4
**Pack**: kb: pack 35654 words (budget 8000)

This is a delta re-review (§9). In cycle 3 the only open agent-tagged issue was correctness Minor 1 `[web-impl]`. The browser and maintainability parts had none. Cycle 3 also had Critical 1 `[orchestrator:user-decision]` (K1), which the developer settled as Option A.

I read `git diff 50f9462..HEAD`. Under `web/src/`, `internal/` and `cmd/` it touches only `web/src/features/launch.ts`: two comment lines, which is exactly the Minor's scope. Everything else in the diff is registry, ADR and plan-directory material, plus `canary-run.log`. So §3–§6 were not re-read.

The Minor is fixed, K1 is green, D13 is met as written, and every gate line is green.

## Requirements

Unchanged from cycle 3: this cycle's diff changes no behaviour.

| Req | Implemented | Tested | Status |
|-----|-------------|--------|--------|
| REQ-1 … REQ-9, INV-1 … INV-5 | Yes (cycle 2 table) | Yes (cycle 2/3 evidence). REQ-9's live half is now evidenced by D13 | pass |
| DIAG | `kb:diagram/web-components` (`render/` "22 modules"), `daemon-components`, `containers`. None changed; no diagrammed code changed this cycle | — | pass |

## Build & Tests

E2E tests: pass (443/443, `15-e2e.log`) · Daemon tests (race): pass (every package `ok`; `internal/server` 111.3 s, `02-test.log`) · Web tests: pass (1837, `05-web-test.log`) · Daemon build: pass (`01-build.log` is empty and was written 11:56, after HEAD `c4debbb` at 11:56:20) · Web build: pass · Lint: pass (`03-lint.log` 0 issues; `06-web-lint.log` 184 files clean). All of these were read from `$GATES_LOG_DIR`, not re-run.

Other gate lines:
- contrast: pass (43 pairs × 3 themes, 0 failures)
- versions: pass ("all fragments fresh")
- e2e-honest: pass (empty)
- kb-check: **pass** ("413 records, 23 features, 0 problem(s)")
- dead-refs: pass (2941 refs, 0 missing)
- e2e-lint: clean
- features-scope: pass
- size: WARN ×12 (review-maintainability's to judge)

No soak was needed, because the diff repairs no spec.

## Acceptance Checks

| ID | Command | Result |
|----|---------|--------|
| D1 | `make test` | pass (deduped to baseline `make test-race`, `02-test.log`) |
| D2 | `go build ./...` | pass (deduped to baseline `build`) |
| D3 | `make lint` | pass |
| D11 | `! rg -n -e '"--no-session-persistence"' -e '"--bare"' -e "model catalog" internal/ cmd/ --glob '!internal/claudecode/**'` | pass (`16-D11.log` empty) |
| D12 | `MUSTER_CANARY_OFFLINE=1 make canary` | pass (`17-D12.log`: `TestInstalledBinaryCarriesInterfaceStrings` PASS, `ok test/canary`) |
| W1 | `make web-build` | pass |
| W2 | `make web-test` | pass (1837) |
| W3 | `make web-lint` | pass |
| E1 | `make e2e` | pass (443 passed) |
| K1 | `make check-kb` | **pass** (`10-kb-check.log`: 0 problems). It went green through `ac20108`, which added the 7 previously unowned files to the launch spec. Its `spec.md` diff touches only the `go:`/`web:`/`e2e:` frontmatter lines, and those match the globs staged in `doc-delta.md`'s amendments, including the relocated `web/src/render/launchrestore*.ts`. The rest of that diff is the regenerated `docs/features/launch/INDEX.md` and `.claude/rules/launch.md` |
| DOC | doc upkeep and Doc Delta vs what shipped | pass. The fix wave added no `deviation:` or `doc-delta:` line (`web-implementation.md` § Fix Attempt — review cycle 3). `doc-delta.md` has not changed since cycle 2, when every sentence was checked against the code. The user decision is recorded as proposed kb:adr/process-unowned-file-globs-land-before-approval (`status: proposed`, `refs: plan:new-session-improvement`), and it describes what landed: the frontmatter only, with the spec body left to doc-reconcile. The decision log is `decisions/check-kb-before-approval/decision.md` |

## Reviewer-Verified Criteria

These are unchanged from cycle 3, except for D13.

| ID | Criterion | Result | Evidence |
|----|-----------|--------|----------|
| D13 | the forced canary's zero-token `CheckModel` test and its explicit-`default` sweep row pass against the installed binary | pass (as written) | See the breakdown below this table and Note 1. |

**D13 breakdown.** The log is `plans/new-session-improvement/canary-run.log`. It was a forced `make canary` run against installed 2.1.280, classified verified, committed in `91bb017`.
- `TestModelCatalogPrecheck`: both rows PASS (log lines 73-78). `muster-canary-unrecognized-model` came back `ModelUnrecognised`, and haiku came back `ModelRecognised`, through the production `CheckModel`/`RunModelCheck`.
- `TestLaunchFlags/.../unauth,_explicit_default`: PASS (line 66).
- The run is red overall on `TestPlanModeSequence` alone (lines 45-51). That test is outside D13's two targets, and the code it exercises is unchanged on this branch (Note 1).
- Because of the `&&` chain, the red run stopped before `versions bump`, so it recorded nothing. The versions gate is "all fragments fresh".

## Hard-Rule Checklist

The only source change this cycle is a two-line doc comment, which touches no rule's surface. Every row carries over from cycle 3.

| # | Rule | Result |
|---|------|--------|
| 1 | Adapter boundary | pass (D11 green) |
| 2 | Terminal-output state parsing | pass |
| 3 | Blocking hook handler | pass |
| 4 | Bare tmux | pass |
| 5 | Payload logging | pass |
| 6 | Empty-gauge dishonesty | n/a |
| 7 | Identity on `session_id` | pass |
| 8 | Settings trespass | pass |
| 9 | Real `claude` outside canary/probes | pass. The only real-binary run this cycle is the developer-approved forced canary, which runs on haiku |

## Delta (delta re-review only)

| Prior Minor | Fix commit | Verified how |
|-------------|------------|--------------|
| cycle 3 correctness Minor 1 `[web-impl]`: "`initOpen` and `navigateUp` switch on this directly (REQ-6b/c)" is untrue of `navigateUp` | `b6643a9` | Diff read. `launch.ts:285-287` now says "`initOpen` switches on this directly (REQ-6b/c); `navigateUp` passes it through." That matches the code: `navigateUp` (`:320-325`) returns `navigate(...)` or `null` without examining the outcome. It is the suggested wording verbatim. Only the comment changed, and `web/src/features/launch.ts` is the only source file in `50f9462..HEAD` |
| cycle 3 correctness Critical 1 `[orchestrator:user-decision]` (K1 deadlock) | `ac20108` | The developer chose Option A. K1 is green this cycle (Acceptance Checks row). The landed edit is frontmatter only, and it matches the staged globs |
| cycle 3 browser part | — | No Minors in that part |
| cycle 3 maintainability part | — | No Minors in that part |

## Issues

### Critical

None.

### Major

None.

### Minor

None.

### Notes

1. **[note]** D13, and whether a rerun is needed. D13 is met as written, and for this plan I do not think a rerun is required. `TestPlanModeSequence` failed because run E never emitted `PreToolUse{ExitPlanMode}`. On this branch, run E's body, its session constant (48), its prompt and its argv (`--permission-mode plan` plus resume) are all unchanged from `main`. The branch's harness diff adds only `runF`, which runs after `runE`, and the `sessionUnauthDefault` row of the unauth sweep. The log also shows that haiku raised `AskUserQuestion` instead: `TestNotifications` records the plan-mode PermissionRequest as `tool_name="AskUserQuestion"` (line 83). That means the model did not call the tool, which is the cause `docs/claude-code-versions.md:230-233` accepts as flakiness.

   The wording there names a slightly different symptom: a *PermissionRequest wait timing out*. Here a PermissionRequest did arrive, but for a different tool, so the doc covers this case by cause but not by its literal words. Whether that paragraph should also name this symptom is a possible retro item. No change is requested here.

   A rerun is needed only if someone wants this log to count as a green canary for extending or re-verifying the version range. That falls under the `/claude-code-upgrade` ritual, not this plan, and it would need the developer's approval again.
2. **[note]** `plan.md` still reads `**Status**: blocked`, set in `43b6efc` when the cycle budget ran out. The orchestrator owns that field for the rest of the run.
3. **[note]** Cycle 3 Notes 2 and 3 still stand as written. Nothing in this cycle's diff touches them:
   - `internal/server/sessions.go:147`/`:214` say "exactly as before this plan".
   - `render/launchrestore.ts:3-5` states the unsettled placement rule that the `proposed-backlog.md` item covers.

## Browser review

# Browser review: New Session Improvement

**Plan**: new-session-improvement
**Part verdict**: approved
**Cycle**: 4
**Pack**: kb: pack 26792 words (budget 8000) — WARN exceeds; sections rules 1340 · features 10176 · diagrams 0 · decisions 11693 · proposed 0 · facts 2462 · lessons 1113 · runbooks 2
**Rig**: no daemon was started this cycle. I proved the change behaviour-neutral statically instead. I built the dashboard twice with `vite build` under Node 24.21.0 and `MUSTER_RELEASE=1`: once from `git archive 50f9462` and once from `git archive HEAD` (c4debbb). Both sources were extracted into my scratchpad, with `node_modules` symlinked, and each build went to its own out-dir in the scratchpad. The scratchpad was deleted afterwards. `git status --porcelain` shows nothing of mine.

## Scope

The orchestrator scoped this cycle to one question: is the only `web/src` change since cycle 3 (b6643a9) behaviour-neutral? The full matrix was not re-run. Cycle 3's matrix (`review.browser.cycle3.md`, approved) still stands for every cell, because the shipped bundle is byte-identical to the one it measured (see below).

Gates log `gates-new-session-improvement-c4`: 0 failed lines. The `web-build` and `e2e` logs are green.

## Matrix

| Req | Host | State | Claim | Result | Evidence |
|-----|------|-------|-------|--------|----------|
| b6643a9 | — | — | diff is comment-only | pass | `git diff 50f9462..HEAD -- web/src` is 1 file (`web/src/features/launch.ts`), +2/−2. Both changed lines sit inside the `/** … */` JSDoc above `type NavigateOutcome`, lines 285–287. No token outside the comment changed. |
| b6643a9 | all hosts | all states | built dashboard unchanged | pass | `diff -r out-50f9462 out-HEAD`: no output (IDENTICAL), across all 103 emitted files, including `index.html` and `doc.html`. The entry chunk `assets/index-BeUa5-8B.js` is sha256 `ae7e6b5f…fdb654` in both builds. |
| b6643a9 | — | — | compared chunk contains the launch code | pass | `grep -l superseded` over the gate run's `internal/webui/assets/assets/*.js` finds only `index-BeUa5-8B.js`. That is the same content-hashed name both scratch builds produced, so the `navigate()`/`NavigateOutcome` code is inside the file compared. |
| REQ-* (cycle-3 matrix) | focus / tiles / pop-out | no data / data / daemon-down | all cycle-3 cells | carried | The bundle is byte-identical to the one cycle 3 drove. Sourcemaps were excluded from the comparison with `MUSTER_RELEASE=1`, because their embedded `sourcesContent` carries the comment text and is not executed. |

## Issues

### Critical
None.

### Major
None.

### Minor
None.

### Notes
1. **[note]** I did no live dialog-launch smoke in Focus. The byte-identical build output proves statically that the running app cannot differ from the cycle-3 app, which the orchestrator's brief accepts in place of a smoke.

## Maintainability review

# Maintainability review: New Session Improvement

**Plan**: new-session-improvement
**Part verdict**: approved
**Cycle**: 4
**Pack**: kb: pack 30625 words (budget 8000) — sections — rules 1874 · features 10176 · diagrams 3889 · decisions 11693 · proposed 0 · facts 2462 · lessons 523 · runbooks 2
**Scope**: 1 file. `git diff 43b6efc..HEAD --stat -- cmd internal web/src` shows only `web/src/features/launch.ts | 4 ++--`, all from `b6643a9`, which rewords one doc comment. The other commits since cycle 3 (`ac20108`, `91bb017`, `c4debbb`) touch no source. The other 13 files in the branch diff have not changed since my cycle-3 part approved them, and that part's Files table still holds for them.

## The cycle-3 change, checked

`launch.ts:285-287` used to say "`initOpen` and `navigateUp` switch on this directly". It now says "`initOpen` switches on this directly (REQ-6b/c); `navigateUp` passes it through." I checked this against the code:

- `initOpen` (`:365-373`) does switch on the outcome: `if (outcome === "ok") … else if (outcome === "failed") …`, and `"superseded"` falls through.
- `navigateUp` (`:320-325`) returns `navigate(last.dataset.path)` without looking at it, or returns `null`. Its one caller that reads the value (`:483`) only checks for `null`.

So the new comment is true. The change adds no type, helper or seam, and the line count stays at 578, so the `design:` and size questions are the same as in cycle 3. The fix attempt's own Decisions section says no `design:` line is needed for a comment-only change, and I agree.

## Files

| File | Siblings opened | design: line | Size warnings | Result |
|------|-----------------|--------------|---------------|--------|
| web/src/features/launch.ts | focus.ts, rail.ts (cycle 3); the code the comment describes (`:296`, `:320`, `:365`, `:483`) | n/a (comment-only) | filelen 578 (unchanged), reason holds | pass |

## Issues

### Critical

None.

### Major

None.

### Minor

None.

### Notes

1. **[note]** Cycle-3 Notes 1–3 and 5 still apply unchanged, because none of the code they describe has changed. They are: the function-scoped `NavigateOutcome` placement; the two daemon "before this plan" comments at `internal/server/sessions.go:147` and `:214` (review-work's § Comments); the `render/launchrestore.ts:4-5` placement comment that states the open backlog item as a settled rule (review-work's comment truth); and the unchanged race and shared-state picture. Cycle-3 Note 4 (the kb-check "owned by no feature" failure) is gone: this cycle's gates have 0 failed lines, after `ac20108` landed the spec globs.
2. **[note]** Gates this cycle: web-test 45 files and 1837 tests passed. `14-size.log` has 12 WARN hits and no `dupl` lines, the same as cycle 3. The only web hits are `api.ts` at 776 lines and `launch.ts` at 578, and both were reasoned in earlier cycles.
