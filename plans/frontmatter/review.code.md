# Correctness review: Frontmatter

**Plan**: frontmatter
**Verdict**: approved
**Cycle**: 4
**Pack**: kb: pack 25860 words (budget 8000) (WARN: pack exceeds budget of 8000), features=reader,lifecycle

This is a full review, and the first one run with lifecycle in the pack. No code has changed since cycle 3. `git diff dd34d73..HEAD` (dd34d73 is the cycle-3 review commit) touches only `plans/`, generated kb files, `.claude/rules/*`, and one frontmatter line in `docs/adr/reader-plan-sticky-once-named.md` (`features: [reader, lifecycle]`). The one commit after the gate run, `849187e`, adds a block to `plans/frontmatter/proposed-backlog.md` and nothing else, so the c4 gate run still covers this exact source tree.

I re-read the four lifecycle-owned files against the lifecycle spec, the lifecycle slice of `docs/protocol.md` (state machine, transitions, ordering, liveness, Session object), the lifecycle ADRs that `kb for` names for `internal/session/manager.go`, and `kb:lesson/invariant-missed-by-per-transition-tests`. The four files are `internal/session/manager.go` (`ApplyPlanScan`, and `SetPlan`'s comment), `internal/session/session.go`, `internal/store/session.go` and `internal/server/sessionwire.go`. I also re-checked the reader-side daemon path that feeds them (`scanPlan`, `observeWrite`, the ingest 200 path). Lifecycle context turns up nothing new that needs a fix. The cycle-3 rows are carried forward where they are unaffected.

## Requirements

| Req | Implemented | Tested | Status |
|-----|-------------|--------|--------|
| REQ-1 … REQ-7, REQ-10 (web) | Unchanged since cycle 3. No lifecycle file is involved | Unchanged (web-tests, E3–E6, W16) | pass (carried) |
| REQ-8 (sticky once named) | `Manager.ApplyPlanScan` (`internal/session/manager.go:1039`). A planless scan (`foundPath == ""`) keeps `sess.PlanPath` and re-stats it. A scan that names a plan replaces the old one. `grep PlanPath\|PlanExists` over non-test code confirms that the only in-memory writers are `SetPlan`, `ApplyPlanScan` and the row load (`applyReaderRowFields`). The clear-rebind reset in the machine does not touch plan, which matches the lifecycle transitions row ("reset context + compactions + lastActivity + lastPrompt") | `TestScanPlan_StickyOnceNamed` crosses every starting retention state (none, retained+file, retained+deleted) with every scan outcome, which is the invariant crossing the lesson asks for. D4 and D6 tests, E1 | pass |
| REQ-9 (straggler gate) | `ApplyPlanScan` refuses when `claudeSessionID` is not the current binding, the same as `SetPlan`. This is consistent with `kb:adr/ingest-monotonic-rebind` and `kb:adr/lifecycle-session-identity-is-tmux-target`: the key is the Muster id, and the Claude id is only a gate | D4 (late SessionEnd), E2 | pass |
| INV-PLAN-STICKY source states | /clear pair (D4, E1), transcript deleted (D1), straggler (E2), other sessions present (D6). Restart is untested by design (plan edge 9). A narrow SQL-level exception is in Note 3 | — | pass |
| DIAG | `kb:diagram/daemon-components`, `kb:diagram/store-schema`, `kb:diagram/domain-model` ("at most one per session", `0..1`, still true), `kb:diagram/web-components`. No package edge, column or relation changed | — | pass |

## Build & Tests

E2E tests: pass (432) · Daemon tests (race): pass (20 packages ok; `internal/session` ok 35.5s, `internal/server` ok 104.0s) · Web tests: pass (1822, 44 files) · Daemon build: pass · Web build: pass · Lint: pass (golangci 0 issues; biome 179 files clean). All of these are read from `$GATES_LOG_DIR` (`gates-frontmatter-c4`, 0 failed lines). The same run shows these green too:
- contrast: 43 pairs × 3 themes, 0 failures
- versions: fresh
- e2e-honest: empty log
- kb check: 402 records, 0 problems
- dead-refs: 2884 checked, 0 missing
- e2e-lint: clean

The `WARN size` line (8 hits, including `internal/session/manager.go` at 1810 lines) belongs to review-maintainability.

## Acceptance Checks

| ID | Command | Result |
|----|---------|--------|
| D0 | `go build ./...` | pass (01-build.log, empty) |
| D8 | `make test` | pass (deduped to test-race, 02-test.log) |
| D9 | `make lint` | pass (03-lint.log, 0 issues) |
| D10 | `make test-race` | pass (02-test.log, no FAIL) |
| W11 | `make web-build` | pass (04-web-build.log) |
| W12 | `make web-test` | pass (05-web-test.log, 1822 passed) |
| W13 | `make web-lint` | pass (06-web-lint.log) |
| E7 | `make e2e` | pass (14-e2e.log, 432 passed) |
| K1 | `make check-kb` | pass (10-kb-check.log) |
| DOC | doc upkeep + Doc Delta vs what shipped | pass. `kb ls --feature lifecycle --status proposed` lists exactly `kb:adr/reader-plan-sticky-once-named`: `proposed`, `refs: plan:frontmatter`, and `files` names `internal/session/manager.go`. It describes what shipped. The logs contain no `deviation:` or `doc-delta:` line. The daemon log names `ApplyPlanScan`, which sits in the Manager that the plan's Affected Files already allowed ("or in `Manager.SetPlan`"). For lifecycle, the Doc Delta needs no new line: no sentence in `docs/features/lifecycle/spec.md` is now false (its /clear reset list never included plan), and lifecycle's generated contract slice already carries the merged `plan` comment, which is true of the code. The two reader claims in `doc-delta.md` are true of the code (REQ-8 above, and the frontmatter table carried from cycle 3) |

## Reviewer-Verified Criteria

| ID | Criterion | Result | Evidence |
|----|-----------|--------|----------|
| D7 | retention rule in exactly one function | pass | Re-read with lifecycle context. The retain-or-replace choice exists only in `ApplyPlanScan` (`manager.go:1052-1055`). `scanPlan` passes on what the scan found and nothing else. `SetPlan` is reached only from `observeWrite` with the session's current non-empty path, so it can never write the empty (null) value |
| W10 | `createElement` + `textContent` only | pass | Carried from cycle 3 (no web change) |
| W15 | no `any` | pass | Carried from cycle 3 |
| W16 | wraps in a 3×2 tile, no horizontal scroll | pass | Carried from cycle 3. The E2E is green in 14-e2e.log |
| W17 | no heading holds frontmatter text | pass | Carried from cycle 3 |

## Hard-Rule Checklist

| # | Rule | Result |
|---|------|--------|
| 1 | Adapter boundary | pass. The added `+` lines in `internal/`, `cmd/` and `web/src` contain no hook field, status-line key, CLI flag or transcript format. `ApplyPlanScan` handles an opaque path and `os.Stat`. The package invariant "no Claude Code payload key or event name appears here" still holds |
| 2 | No terminal-output state parsing | pass |
| 3 | Non-blocking hook handler | pass. `handleIngest` (`internal/server/ingest.go:299-316`) does only a token check, a body read, an enqueue and the 200, and takes no `Manager.mu`. So the stat that `ApplyPlanScan` now holds under the lock cannot delay a hook's 200 |
| 4 | tmux socket / sizing | pass. No tmux in the diff |
| 5 | No payload logging | pass. The `scanPlan` logs carry the error and session id only |
| 6 | Empty-gauge honesty | pass (unchanged; `plan: null` still renders `no plan yet`) |
| 7 | Identity on tmux target | pass. `ApplyPlanScan` keys on the Muster id, and the Claude id is only the straggler gate |
| 8 | Settings trespass | pass |
| 9 | Real `claude` | pass. None |

## Issues

### Critical
None.

### Major
None.

### Minor
None.

### Notes
1. **[note]** This answers the question doc-reconcile left open. With lifecycle in scope, the lifecycle spec needs no new sentence: plan retention is a reader concept, and nothing the lifecycle spec says is contradicted. The retention rule sits on `Manager` because `internal/session` owns every session field for all four of its features (its `CLAUDE.md` lists lifecycle, rail, reader and rename), and the plan allowed that placement. No change is requested.
2. **[note]** `ApplyPlanScan` runs `os.Stat` while it holds `Manager.mu`, the mutex every ingest transition takes. On `main` the stat ran in `scanPlan` outside the lock. The `Manager.mu` comments forbid holding it across tmux I/O but say nothing about a local stat, and hard rule 3 is unaffected (row 3 above). Whether this guard is right is a shape question, so it belongs to review-maintainability.
3. **[note]** The `ApplyPlanScan` doc comment says "the write" happens inside the `Manager.mu` critical section. That is the in-memory commit. The SQLite persist and the broadcast come after unlock, as with every setter. Every setter persists the whole row, so a row captured before a scan's first plan commit and persisted after it can leave `plan_path` NULL in SQLite until the next write. A restart inside that window would show `plan: null`. That is the pre-existing persist-order issue, already proposed in `plans/frontmatter/proposed-backlog.md` ("Session setters persist after unlock"). This branch copies the shape and does not widen it. No change is requested here.
4. **[note]** The `observeWrite` Get-then-`SetPlan` revert is still possible, and it remains a pre-existing backlog proposal. With lifecycle context I confirmed it can only write a real, non-empty path. It can never null a plan, so INV-PLAN-STICKY holds in memory.
