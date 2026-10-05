# Review: groups

**Plan**: groups
**Verdict**: approved
**Cycle**: 2
**Gates**: 0 failed
**Parts**: code | skipped: browser, maintainability
**Part verdicts**: code approved

_Merged by orch-state.py merge-review; the verdict is computed from the parts and the gate run, never edited by hand._

## Correctness review

# Correctness review: Rail groups

**Plan**: groups
**Part verdict**: approved
**Cycle**: 4
**Pack**: kb: pack 66004 words (budget 20000)

Scope: a delta cycle granted by the developer after the three-cycle budget. Cycle 3 left this part two Majors and no Minors. The browser and maintainability parts approved cycle 3 and had no Minors. `git diff --stat 8c11b76b..HEAD` touches one test comment and plan-directory files only. No non-test file under `web/src/`, `internal/` or `cmd/` changed, so the §3–§6 re-read is skipped and every requirement verdict carries from cycle 3.

## Requirements

| Req | Implemented | Tested | Status |
|-----|-------------|--------|--------|
| REQ-1 – REQ-27 | Yes, unchanged since cycle 3; no source file changed | Yes, unchanged; every named test still green in this cycle's gate run | pass |
| DIAG | `web-components`: the `features/` box now reads 33 modules = 18 controllers + 4 sub-controllers + 11 DOM-free helpers. `ls web/src/features` counts 33 non-test modules. `main.ts` imports 18 `init*` controllers. The 4 sub-controllers named are `launchresume`, `launchgroup`, `groupsselect` and `groupsdialogs`. The other 11 have no DOM reference outside comments; `connectionrestore.ts` takes an injected `Element` subset. `one-launch-end-to-end` unchanged since cycle 3, still true. | — | pass |

## Build & Tests

E2E tests: pass (713) · Daemon tests (race): pass (24 packages `ok`, no FAIL) · Web tests: pass (2404 in 89 files) · Daemon build: pass · Web build: pass · Lint: pass (`0 issues.`; Biome clean, 302 files) — all read from $GATES_LOG_DIR (`gates-groups-c4`, 0 failed lines)

## Acceptance Checks

| ID | Command | Result |
|----|---------|--------|
| build | `go build ./...` | pass (`01-build.log` empty) |
| test | `make test-race` | pass (`02-test.log`, 24 `ok`, no FAIL) |
| lint | `make lint` | pass (`0 issues.`) |
| web-build | `make web-build` | pass (chunk-size warning only) |
| web-test | `make web-test` | pass (2404) |
| web-lint | `make web-lint` | pass |
| contrast | `make contrast` | pass (43 pairs × 3 themes, 0 failures) |
| versions | `make check-versions` | pass (all fragments fresh) |
| e2e-honest | `! rg -n 'test\.(skip\|fixme\|only)\(' web/e2e` | pass (`09-e2e-honest.log` empty) |
| kb-check | `make check-kb` | pass (522 records, 0 problems) |
| dead-refs | `dead-refs.py --all` | pass (3635 checked, 0 missing) |
| e2e-lint | `make e2e-lint` | pass |
| features | features-scope | pass |
| comments | comment-checks | pass |
| size | `make size-warn` | WARN (27 hits), review-maintainability's; no source changed since its cycle-3 approval |
| e2e | `make e2e` | pass (713 passed) |
| D1 | `make test` | pass (deduped to test-race) |
| D2 | `go build ./...` | pass (deduped to build) |
| D3 | `make lint` | pass (deduped to lint) |
| D17 | `! rg -n "hook_event_name" cmd/ internal/ --glob '!internal/claudecode/**'` | pass (`17-D17.log` empty) |
| D18 | `make test-race` | pass (deduped to test) |
| W1 | `make web-build` | pass (deduped) |
| W2 | `make web-test` | pass (deduped) |
| W3 | `make web-lint` | pass (deduped) |
| W4 | `make contrast` | pass (deduped) |
| W13 | `! rg -n ": any\b\|as any\b\|\.innerHTML = " web/src …` | pass (`18-W13.log` empty; cycle-3 Note 1 stands) |
| E28 | `make e2e` | pass (deduped to e2e, 713 passed) |
| DOC | doc upkeep + Doc Delta vs what shipped | pass. The `web-components` split is now true (DIAG). The Doc Delta and `doc-delta.md` are unchanged since cycle 3, and no code changed that could make a line false. Every `deviation:` line still carries `→ kb:adr/…` or a stated no-ADR reason. TODO ticks are correctly deferred until `approved`. |

## Reviewer-Verified Criteria

| ID | Criterion | Result | Evidence |
|----|-----------|--------|----------|
| D4–D16 | named daemon tests | pass | Only one comment changed, in `manager_writeorder_test.go`; no assertion changed. The comment is now true (Delta). |
| W5–W12 | Vitest coverage | pass | No web file changed; 2404 pass |
| W14 | main.ts registration only; no sibling controller imported | pass | `main.ts` unchanged; 18 `init*` imports |
| E1–E27 | driven live by review-browser | present | No spec file changed; review-browser approved cycle 3 on this tree's web code |
| copy | labels match the table verbatim | pass | No source change |
| colour | no literal, state tokens only for their state | pass | No stylesheet change |

## Hard-Rule Checklist

| # | Rule | Result |
|---|------|--------|
| 1 | Adapter boundary | pass — D17 green; the only Go change is a comment |
| 2 | Terminal-output state parsing | pass — none added |
| 3 | Blocking hook handler | pass — no hook path touched |
| 4 | Bare tmux | pass — no tmux invocation added |
| 5 | Payload logging | pass — no log line added |
| 6 | Empty-gauge dishonesty | pass — no render branch changed |
| 7 | Identity on `session_id` | pass — unchanged |
| 8 | Settings trespass | pass — none |
| 9 | Real `claude` | pass — none launched |

## Delta

| Prior issue | Fix commit | Verified how |
|-------------|------------|--------------|
| cycle 3 correctness Major 1 `[daemon-tests]` "is renumbered 0..n-1, which lowers values too. Either way no existing RailPos moves past nextRailPos" | `47cb3f2a` (orchestrator, at the developer's direction) | Diff read against `rebuild` (`railorder.go:205-243`) and the seed (`manager.go:313`). The claim is now scoped to a rail with unique railPos values, the only state the test builds. There each section gets back its own sorted slots, so no value rises. The comment now says the duplicate-railPos repair can raise a value and is not exercised there. Both are true. The diff is comment-only and no assertion changed. |
| cycle 3 correctness Major 2 `[orchestrator]` `web-components` features split sums to 31 | `7f0b87d9` | The split now reads 18 controllers, 4 sub-controllers and 11 DOM-free helpers, summing to the box's 33. Each count was matched against `ls` and `main.ts` (DIAG row). The commit touches only the diagram and orchestration state. |
| browser and maintainability parts, cycle 3 | — | Both approved with no Minors, so there was nothing to re-verify |

## Issues

### Critical

None.

### Major

None.

### Minor

None.

### Notes

1. **[note]** `plan.md` is stamped `**Status**: blocked` from the exhausted budget (`200960ac`). The orchestrator should flip it when this cycle completes.
2. **[note]** Cycle-3 correctness Notes 1–4 still stand unchanged. They cover the W13 glob reach, the latent duplicate-railPos edge that main's renumber shared, `launchpastlist.ts` missing from the features guide's helper list, and the carried cycle-2 Notes.
