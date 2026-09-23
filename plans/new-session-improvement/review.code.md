# Correctness review: New Session Improvement

**Plan**: new-session-improvement
**Verdict**: approved
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
