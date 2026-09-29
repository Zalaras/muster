# Correctness review: Resume and Dangerously Allow

**Plan**: resume-and-dangerously-allow
**Verdict**: approved
**Cycle**: 3
**Pack**: `kb: pack 44423 words (budget 20000)`

This is a full cycle, not a §9 delta: cycle 2 had an agent-tagged Major. The non-test code diff since the cycle-2 review (`8f050bf..HEAD`) is four daemon files in 4500836 and two web files in 3f45762. Both were read in full. Every other requirement was verified in cycle 2 against code this cycle leaves unchanged, and the result is carried forward.

## Requirements

| Req | Implemented | Tested | Status |
|-----|-------------|--------|--------|
| REQ-1 … REQ-5 | Yes (unchanged since cycle 2) | Yes | pass |
| REQ-6 | Yes. The text now says "bound to it or pending a resume of it" (4804f20), and that matches `AliveByClaudeSessionID` | Yes: D3–D8, D16, pending E2E | pass |
| REQ-7 … REQ-11 | Yes (unchanged) | Yes | pass |
| REQ-12 | Yes. The amended text (bound or pending, for both 409s) matches `launchResume` and `Resume`, which both go through `AliveByClaudeSessionID` under `LockClaudeSession` | Yes: D11, D12, pending 201→409 E2E, actions.spec not_resumable (soaked, see Build & Tests) | pass |
| REQ-13 … REQ-15 | Yes (unchanged) | Yes | pass |
| INV-1 … INV-4 | Yes (unchanged) | Yes | pass |
| States: null model | Yes (unchanged) | Yes | pass |
| DIAG | Plan `## Diagrams` sequence (`plan.md:187`, now `alt held by an alive row (bound or pending a resume)`), `kb:diagram/containers`, `daemon-components`, `web-components`, `store-schema` | — | pass. The sequence diagram now matches the code. The cycle-3 code diff (comment text, one unreachable `default` arm, one type moved between modules) changes nothing any diagram shows |

## Build & Tests

E2E tests: pass (497/497) · Daemon tests (race): pass (every package `ok`, 0 `FAIL`) · Web tests: pass (1929/1929, 77 files) · Daemon build: pass · Web build: pass · Lint: pass (golangci 0 issues, Biome clean on 262 files). All of these come from `$GATES_LOG_DIR` (`gates-resume-and-dangerously-allow-c3`).

Baseline gate lines:
- contrast: pass (43 pairs × 3 themes, 0 failures)
- versions: pass
- e2e-honest: pass
- **kb-check: FAIL.** The same three unowned e2e files as before (`web/e2e/bypass.spec.ts`, `helpers/resume.ts`, `past-sessions.spec.ts`). The developer accepted this until Step 7 doc-reconcile registers them. It has not grown since cycle 1.
- dead-refs: pass (3333 checked, 0 missing)
- e2e-lint: pass
- **features: FAIL.** The same two minor `ingest` touches (`claudecodetest/transcripts.go`, `e2e/helpers/payloads.ts`). The developer declined to widen **Features**. Neither file changed this cycle.
- comments: pass
- size: WARN. This belongs to `review-maintainability`.

Flake soak: I ran `make e2e-soak SPEC=e2e/actions.spec.ts N=10` myself. That spec's not_resumable race is Repairs row 3 of the cycle-1 fix wave, and the ```checks block does not soak it. Result: **170 passed, 0 failed (1.1 m)**. The `expect.poll` on `claudeSessionId` holds. It is a real fix, not a lucky run.

## Acceptance Checks

| ID | Command | Result |
|----|---------|--------|
| D0 | `make build` | pass (17-D0.log) |
| D17 | `! rg -n '"custom-title"\|"ai-title"\|"last-prompt"\|\.claude/projects' cmd/ internal/ --glob '!internal/claudecode/**' --glob '!**/*_test.go'` | pass (18-D17.log is empty) |
| D18 | `make test` | pass (deduped to 02-test.log, run with race) |
| D19 | `make lint` | pass (deduped to 03-lint.log) |
| W0 | `make web-build` | pass (deduped to 04-web-build.log) |
| W10 | `make web-lint` | pass (deduped to 06-web-lint.log) |
| W11 | `make web-test` | pass (deduped to 05-web-test.log) |
| E0 | `make e2e` | pass (deduped to 16-e2e.log, 497 passed) |
| K1 | `make check-kb` | **FAIL** (10-kb-check.log). These are the three unowned e2e files the developer accepted until doc-reconcile, so the line is not routed |
| DOC | doc upkeep + Doc Delta vs what shipped | pass. 4804f20 carries the pending-resume amendment to REQ-6, REQ-12, the sequence diagram, protocol.md's `not_resumable` (`docs/protocol.md:326`) and the guard ADR summary. 8a582bf shortened that summary to "holds it (bound or resuming)" to fit the budget, and it stays true. protocol.md's `openSessionId` comment (line 372) and the Contract's `already_open` line (plan line 43) already say "bound to, or pending a resume of". The Doc Delta's "actions: Resume is also refused when another alive session holds the same Claude session id" uses "holds", which covers both cases. The four `proposed` ADRs carry `refs: plan:resume-and-dangerously-allow`. No `deviation:` lines. The superseded `doc-delta:` line 43 is still to be excluded at Step 7, as the orchestrator said in cycle 1 |

## Reviewer-Verified Criteria

| ID | Criterion | Result | Evidence |
|----|-----------|--------|----------|
| W9 | no `any` in new web code | pass | The 3f45762 diff adds only a type import and moves an interface |
| R1 | chip and danger button use `--danger`, never `--rose` | pass | No style change this cycle |
| R2 | exactly one filled button | pass (code) | Unchanged |
| R3 | real verification on haiku | not yet run | This runs after the pipeline, in the main session |

## Hard-Rule Checklist

| # | Rule | Result |
|---|------|--------|
| 1 | Adapter boundary | pass. D17 is green, and the new comments name no Claude Code format outside `internal/claudecode/` |
| 2 | No terminal-output state parsing | pass |
| 3 | Non-blocking hook handler / ≤2 s timeouts | pass (no hook code touched) |
| 4 | tmux `-L muster` / sizing | pass (no tmux code touched) |
| 5 | No payload logging | pass. The new `default` arm logs `directory` and the error, not a hook payload |
| 6 | Empty-gauge honesty | pass (unchanged) |
| 7 | Identity on the tmux target | pass |
| 8 | Settings trespass | pass |
| 9 | Real `claude` outside canary | pass |

## Cycle 2 issues

| Cycle-2 issue | Fix commit | Verified how |
|---------------|------------|--------------|
| code Major 1 `[daemon-impl]` stale permission-mode comments (`launch.go` `LaunchParams`, `session.go` "four") | `4500836` | Diff read. `LaunchParams`' doc now says `BuildArgv` never re-validates, and that validating or deliberately not validating is the caller's job. The field comment says any non-empty value is sent verbatim, and empty omits the flag. Both are true of `BuildArgv` (`launch.go:69-70`: `if p.PermissionMode != "" { … "--permission-mode", p.PermissionMode }`). `session.go:47` now reads "one of PermissionModes", with no count |
| code Major 2 `[orchestrator]` pending-resume amendment missing from REQ-6, REQ-12, the diagram, `not_resumable` and the guard ADR | `4804f20`, `8a582bf` | Diff read. All five texts now cover bound and pending. The generated `actions/contract.md` and the INDEX files were regenerated in `94172e5` |
| maintainability Minor 1 (`claudeLocks` Forget invariant) | `4500836` | Maintainability owns the verdict on this one. For correctness: the new comment's claim about `keyedlock.Locks.Forget` ("a later Lock allocates a fresh *sync.Mutex that shares no exclusion with anyone still queued on the old one") matches `keyedlock.go:38-47` |
| maintainability Minor 2 (past-sessions error switch has no `default`) | `4500836` | Maintainability owns the verdict. For correctness: the arm is unreachable today, because `validateLaunchDirectory` (`launcher.go:163-170`) returns only the two sentinels, so the contract is unchanged. See Notes 1 |
| maintainability Minor 4 (`PastRow`/`PastRowView` declared twice) | `3f45762` | Maintainability owns the verdict. For correctness: both new comments are true. `features/launchmodels.ts:7` imports `ModelRowState` from `render/launch`, and `rename.ts`, `connectionversion.ts`, `tiles.ts` and `surfaces.ts` all import from `../render/` |

## Issues

### Critical

None.

### Major

None.

### Minor

None.

### Notes

1. **[note]** The new `default` arm in `handleListPastSessions` would send `500 internal_error`. `docs/protocol.md` § pastsessions.list does not list that response. No input reaches the arm today, so the contract still holds. If a third validation error is ever added, that change should also add the response to the contract.
2. **[note]** Cycle-2 Notes 1 and 2 still apply, and doc-reconcile may want to act on them. The Resume action now passes an unlisted latched mode verbatim. The pending claim lives in memory only, so it does not survive a daemon restart.
3. **[note]** The `kb-check` and `features` lines are red, as described above. The developer accepted both. They are listed here so the backstop can see them: doc-reconcile's registration of the three e2e files should turn `kb-check` green.
