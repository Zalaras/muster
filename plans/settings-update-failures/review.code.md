# Correctness review: Settings Update Failures

**Plan**: settings-update-failures
**Verdict**: approved
**Cycle**: 4
**Pack**: `kb: pack 26048 words (budget 8000)` — WARN pack exceeds budget of 8000 words

This is a §9 delta re-review. Cycle 3's only open agent-tagged issues were maintainability Minors 1 and 2. I read `git diff 8f0dc8e..HEAD` (the cycle-3 review commit to `218b109`). Outside `plans/`, the diff touches:

- `internal/selfupdate/failure.go`: one comment.
- `web/src/features/connection.ts`, `web/src/features/updaterestart.ts`, `web/src/main.ts`, `web/src/wsapp.ts`: Minor 1's stated scope.
- `web/e2e/update.spec.ts`: one comment.

Nothing touches non-test code under `web/src/`, `internal/` or `cmd/` beyond a Minor's scope, so I skipped the §3–§6 re-read. The cycle-3 correctness tables still hold. Below I re-check only what the diff could affect.

## Requirements

| Req | Implemented | Tested | Status |
|-----|-------------|--------|--------|
| REQ-1 – REQ-15, REQ-17 – REQ-19 | Unchanged since cycle 3. No behavioural diff in their code. `failure.go` changed a comment only | Unchanged | pass (as in cycle 3) |
| REQ-16 reload on first hello, mismatch included; no mismatch screen | Yes. The suppression moved from `wsapp.ts` into `connection.ts` `showProtocolMismatch()` (`if (deps.reloading()) return;`, `:175`). `main.ts:85-88` passes `reloading: updateRestart.reloading`. That is a closure over `reloaded` (`updaterestart.ts:185-187`) with no `this`, so passing it unbound is safe, like `bannerOverride`. `doc.ts` still registers `coreWsHandlers`, which has no mismatch handler, so the pop-out is unaffected | Yes. E2E `update.spec.ts:1386` "reloads on a mismatched-protocol reconnect without ever showing the mismatch screen" passes in `15-e2e.log` | pass |
| DIAG | `kb:diagram/web-components`, the only record `kb for` names for `wsapp.ts`/`connection.ts`. The change removes `wsapp.ts`'s type import of `UpdateRestartHandle` and adds no module or directory edge. The diagram still draws `main → wsapp`, `wsapp → app`, `wsapp → ws`. The plan's inline state diagram doesn't name which module gates the mismatch | — | pass |

## Build & Tests

E2E tests: pass (454/454, `15-e2e.log`) · Daemon tests (race): pass (every package `ok`, `02-test.log`) · Web tests: pass (74 files / 1803, `05-web-test.log`) · Daemon build: pass (`01-build.log` empty) · Web build: pass (`04-web-build.log`, which includes `tsc --noEmit`; only the existing chunk-size warning) · Lint: pass (golangci-lint 0 issues; Biome 251 files clean). All read from `$GATES_LOG_DIR` = `gates-settings-update-failures-c4`, 0 failed lines. The `14-size.log` WARN lines are maintainability's.

## Acceptance Checks

| ID | Command | Result |
|----|---------|--------|
| D20 | `make test` | pass (deduped to baseline `go test -race -count=1 ./...`, `02-test.log`) |
| D21 | `make lint` | pass (deduped; `03-lint.log` 0 issues) |
| D22 | `make test-race` | pass (`02-test.log`) |
| D23 | `! rg -n "not installed by the muster installer" internal cmd web/src web/e2e` | pass (`16-D23.log` empty) |
| W20 | `make web-build` | pass (`04-web-build.log`) |
| W21 | `make web-test` | pass (`05-web-test.log`, 1803 passed) |
| W22 | `make web-lint` | pass (`06-web-lint.log`) |
| W23 | `make contrast` | pass (`07-contrast.log`: 43 pairs × 3 themes, 0 failures) |
| E20 | `make e2e` | pass (`15-e2e.log`, 454 passed) |
| K1 | `make check-kb` | pass (`10-kb-check.log`: 436 records, 0 problems) |
| gates | versions, e2e-honest, dead-refs, e2e-lint, features-scope | pass (`08` fresh, `09` empty, `11` 0 missing, `12` clean, `13` update/connection/surfaces) |
| DOC | doc upkeep + Doc Delta vs what shipped | pass. The cycle-3 fix logs add no `deviation:` or `doc-delta:` line. Web Fix Attempt 3 has one `design:` line, and daemon Fix Attempt 4 has none. Both cited ADRs exist, are `proposed`, and carry `refs: plan:settings-update-failures`: `kb:adr/update-restart-reloads-dashboard` and `kb:adr/update-failure-one-sentence-chain-in-log`. No Doc Delta sentence names which module gates the mismatch, so every sentence stays true |

## Reviewer-Verified Criteria

| ID | Criterion | Result | Evidence |
|----|-----------|--------|----------|
| W8 | no `any` in new web code | pass | The cycle-4 web diff adds no `any`; it adds one boolean method and one guard |
| W9 | `#banner` has one writer, `features/connection.ts` | pass | The diff doesn't touch banner writes. `updaterestart.ts` still crosses only as data through `ConnectionDeps` |
| W10 | restarting keeps `--banner-*`; confirmation neutral | pass (unchanged; `style.css` untouched) | — |
| W11 | restarting banner seen during a real Update and restart | review-browser's | — |
| D14 | `install` read under `mu`; race test | pass (unchanged; `updatemanager.go` untouched; `internal/server` ok under `-race`) | — |
| D15 | no Go file outside `internal/selfupdate` composes release-host failure text | pass (unchanged; the only Go change is a comment inside `internal/selfupdate`) | — |

## Hard-Rule Checklist

| # | Rule | Result |
|---|------|--------|
| 1 | Adapter boundary | pass: diff adds no Claude Code field names |
| 2 | Terminal-output state parsing | pass: none |
| 3 | Blocking hook handler | pass: no hook code touched |
| 4 | Bare tmux / `resize-pane` | pass: no tmux touched |
| 5 | Payload logging | pass: no log lines added |
| 6 | Empty-gauge dishonesty | pass: no rendering branch added besides the no-op guard |
| 7 | Session identity on `session_id` | pass: not touched |
| 8 | Settings trespass | pass: none |
| 9 | Real `claude` outside canary/probes | pass: none |

## Delta

| Prior Minor | Fix commit | Verified how |
|-------------|------------|--------------|
| cycle 3 maintainability Minor 1 `[web-impl]` "mismatch-screen suppression decided in two places: `wsapp.ts` and `connection.ts`" | `c829d15` (+ `6d2d505`, E2E comment) | Diff read. The review's first option was taken. `ConnectionDeps` gains `reloading()`, `showProtocolMismatch()` checks it first, and `wsapp.ts:84` is now the plain relay `onProtocolMismatch: () => connection.showProtocolMismatch()`. `dashboardWsHandlers` lost its `updateRestart` parameter and import. The headers now agree: `connection.ts:4-7` claims the decision, `updaterestart.ts:4-8` names `ConnectionDeps` as the one contact point for both methods, and `wsapp.ts:5-6` ("only calls into whatever `WsAppConnection` the caller already built") is true again. The cycle-3 maintainability Note 1 is settled by this. `rg` shows no leftover reference to the old gate in `web/src` or `web/e2e`. No other behaviour changed. The E2E guard test passes (`15-e2e.log`, test 438) |
| cycle 3 maintainability Minor 2 `[daemon-impl]` "plan-scoped `INV-2` id in `failure.go:77-78`" | `eb9aada` | Diff read. The comment now states the invariant ("no URL reaches the wire") and cites `kb:adr/update-failure-one-sentence-chain-in-log`, which exists. The review's own grep, `git diff main...HEAD -- cmd internal web/src ':!*_test.go' ':!*.test.ts' \| grep '^+' \| grep -nE "REQ-[0-9]\|INV-[0-9]\|\bW[0-9]+\b\|\bD[0-9]+\b"`, now prints nothing. The code is unchanged |

## Issues

### Critical

None.

### Major

None.

### Minor

1. **[orchestrator]** `plans/settings-update-failures/plan.md:4` still reads `**Status**: blocked` (commit `74a256e`). Commit `e2a390c` reopened the run, and `orchestration-state.json` says `in-progress`. Flip the plan status back to match the state. This does not block approval.

### Notes

1. **[note]** Cycle 3 Note 2 still stands in its new form. The mismatch-suppression guard, now in `connection.ts` `showProtocolMismatch()`, has no unit test: no test constructs `initConnection`, and no `wsapp.test.ts` exists. The E2E at `update.spec.ts:1386` covers it. e2e-specs showed in cycle 2 that this E2E goes red with the gate reverted. No change requested.
2. **[note]** e2e-specs Fix Attempt 3 changed only the comment above the guard E2E test; its test body is byte-identical. Its Repairs section says no repairs were needed, which is correct. No flake was repaired, so §1's soak trigger doesn't apply.
3. **[note]** Cycle 3 Note 5 carries forward. The `kb:adr/update-install-kinds-decide-who-may-apply` citations in `internal/selfupdate/CLAUDE.md` and `cmd/musterd/main.go` need retargeting when the superseding ADR flips at Completion.
