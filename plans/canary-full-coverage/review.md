# Review: canary-full-coverage

**Plan**: canary-full-coverage
**Cycle**: 2 (delta re-review, §9)
**Verdict**: approved

Cycle 1's sole open agent-tagged issue was a Minor: the stale `ScrollSpeed` doc comment in
`internal/claudecode/launch.go`. It is fixed in `c888cd5`, the fix says what is actually true,
and the diff touches nothing else outside `plans/`. The full regression net was re-run from
scratch this cycle — `make e2e` (281 passed, exit 0), `go build ./...`, `make test`,
`make lint`, the web build and Vitest, and all four authored checks — all green. No new issues.

## Delta

| Prior Minor | Fix commit | Verified how |
|-------------|------------|--------------|
| cycle 1 Minor 1 `[daemon-impl]` — "`ScrollSpeed`'s doc comment is now false about what `make canary` asserts" (`internal/claudecode/launch.go:55-58`, "It is not yet asserted by `make canary` … the canary assertion is owed") | `c888cd5` | Read the diff: the four stale lines are replaced by "Since 2026-09-10, `make canary`'s static tier asserts this variable's presence (by name, read from LaunchEnv()) in the installed binary, which catches an upstream rename or removal; it does not catch a change in the variable's effect on scroll rate — that stays a manual re-measurement against spikes/S6-scroll-bandwidth.md." Verified the new claim is true rather than merely different: `test/canary/static_test.go:46-48` builds its needle set by iterating `claudecode.LaunchEnv()` (whose only key today is `CLAUDE_CODE_SCROLL_SPEED`) and asserts each is present in the resolved installed binary, so presence-by-name is exactly what is asserted and effect is exactly what is not. The distinction the comment now draws matches the test. `ScrollSpeed` itself and the rest of the comment (the S6 measurements, the UNSUPPORTED INTERFACE warning, the 2.1.259-vs-pin caveat) are untouched. Scope: `git diff 1cf6075..HEAD --stat -- . ':!plans'` is `internal/claudecode/launch.go` alone, 5 insertions / 4 deletions — nothing beyond the Minor's stated scope, so §3–§7 are not re-read. |

## Build & Tests

E2E tests: pass (281 passed, exit 0 — full sweep re-run this cycle, not the orchestrator's)
Daemon tests: pass (`make test`, 13 packages ok, 3 with no test files)
Web tests: pass (1053 tests, 29 files)
Daemon build: pass (`go build ./...`, exit 0)
Web build: pass (`npm run build`, tsc + Vite)
Lint: pass (`make lint` → "0 issues."; `gofmt -l` empty; `npm run -s e2e:lint` → "e2e-lint: clean")

This plan authors no Playwright specs and changed no spec file, so there is no `test-specs.md`
and no `## Repairs` table to audit. The sweep is a pure regression net here: every one of the
281 specs belongs to earlier plans, and none regressed.

## Acceptance Checks

| ID | Command | Result |
|----|---------|--------|
| D1 | `go vet -tags=canary ./test/canary/...` | pass |
| D3 | `MUSTER_CANARY_OFFLINE=1 go test -tags=canary -count=1 -v -run '^TestInstalledBinaryCarriesInterfaceStrings$' ./test/canary/... \| grep -q -- '--- PASS: …'` | pass |
| D14 | `make lint` | pass |
| D16 | `make test` | pass |
| DOC | orchestrator doc upkeep (`861aeae`) | pass — unchanged since cycle 1 and re-spot-checked: `TODO.md:588` ticks the coverage item and `TODO.md:867` ticks the `#13` `CLAUDE_CODE_SCROLL_SPEED` sub-item naming the static tier and its rename/removal-only scope, `SPEC.md:1436` carries the changelog entry, `spikes/canary-fields.md` holds the 2.1.267 re-validation. `docs/protocol.md` needs nothing — no protocol delta. |

All four ran via `.claude/skills/orchestrate/scripts/gates.sh canary-full-coverage
--checks-only`: "4 lines, 0 failed".

## Reviewer-Verified Criteria

D2, D4–D13 and D15 were verified in full in cycle 1 against `canary-run.log` and the code, and
none of their subject matter changed. Per §9 they are not re-derived; the cycle-1 table stands
in `review.cycle1.md`. Two were re-confirmed this cycle because the fix's own claim depends on
them:

| ID | Criterion | Result | Evidence |
|----|-----------|--------|----------|
| D8 | static tier: env var iterated from `LaunchEnv()`, not spelled; chunked overlapping scan; per-string failure with the resolved path | pass | Re-read `test/canary/static_test.go`. `for k := range claudecode.LaunchEnv()` builds the needles; the variable name is never written in an assertion. 4 MiB chunks with a 64-byte carry against a 24-byte longest needle. `assert.Emptyf` names the resolved path and every miss. |
| D12 | full `make canary` log; only `TestInstalledVersionMatchesPin` fails | pass | `canary-run.log` (committed `861aeae`) has one `--- FAIL`, `TestInstalledVersionMatchesPin`, and 15 `--- PASS` lines covering runs A/B, C ×4, D, E, the static tier and all three live tests. `git diff 861aeae HEAD --stat -- . ':!plans'` is the `launch.go` comment alone, so the log still describes the code under review. I did **not** run `make canary` — the plan forbids it and the orchestrator's instruction repeated it. |

## Hard-Rule Checklist

The cycle-1 sweep stands; the only change since is a doc comment. Re-checked the two rules that
prose could plausibly touch:

| # | Rule | Result |
|---|------|--------|
| 1 | Adapter boundary | pass — the edited comment is inside `internal/claudecode/`, the package that is allowed to name Claude Code variables; it introduces no name anywhere else, and `LaunchEnv()` remains the only way the name reaches a caller. |
| 5 | No payload logging | pass — no logging or assertion text changed. |
| 2, 3, 4, 6, 7, 8, 9 | — | pass, unchanged from cycle 1 (no code path touched). |

## Manual Verification

No UI in this plan, so §2a's browser pass does not apply; §9 also waives it for a delta cycle.
What I did verify by hand this cycle:

- **Re-ran the full E2E sweep myself** rather than reading the orchestrator's: `make e2e`
  rebuilt the dashboard and binary and ran every spec, 281 passed, exit 0.
- **Read the fix diff against the test it describes** — see the Delta table. The comment's new
  claim is checked against `static_test.go`, not taken from the commit message.
- **Confirmed the fix is scoped** — `git diff 1cf6075..HEAD` outside `plans/` is one file, and
  `git status` is empty after building the daemon, the dashboard and running every suite.

## Issues

### Critical

None.

### Major

None.

### Minor

None.

### Notes

Carried forward from cycle 1, all still accurate and none requesting a change:

1. **[note]** `f.interactive.idlePromptAt` and `f.interactive.transcriptPath`
   (`harness_test.go`) are write-only bookkeeping. The resume cross-check reads the two
   `SessionStart` captures directly, which is the right thing to do, and this matches the
   struct's pre-existing style.
2. **[note]** `answerTrustPrompt` takes the first pane line containing `❯` as the selection
   marker. Correct and safe by construction on 2.1.267; a future build rendering another `❯`
   above the option list would fail loudly on the existing trust-prompt timeout. Worth
   remembering at the next pin bump.
3. **[note]** Acceptance criterion D2 names `TestLaunchFlags` for the `session_name`
   assertion while the plan's Implementation Notes place it in `TestStatusLineFields`.
   daemon-tests followed the more specific instruction; REQ-2 is met in full either way.
4. **[note]** The run observed a status-line key not previously in the inventory,
   `prompt_cache`. Recorded in `spikes/canary-fields.md`; nothing reads it. A candidate for the
   next `/interface-probe`.
5. **[note]** The pin bump 2.1.246 → 2.1.267 remains the deliberate post-`/land` step-2 ritual
   (plan Decision 4), which is why `TestInstalledVersionMatchesPin` is the single expected
   failure in `canary-run.log`.
