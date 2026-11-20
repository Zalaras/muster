# Correctness review: terminal-ended-rule-1

**Plan**: terminal-ended-rule-1
**Verdict**: approved
**Cycle**: 2
**Pack**: kb: pack 27416 words (budget 30000)

Delta re-review over `git diff 9ec67fa6..HEAD`. Three commits are under review: `cd8f9f3d` (plan Doc Delta), `5b462efe` (web tests) and `673c588e` (daemon test). No production file changed, so §3–§6 apply only to the three test files and the plan's Doc Delta.

## Requirements

| Req | Implemented | Tested | Status |
|-----|-------------|--------|--------|
| REQ-1 | Yes, unchanged since cycle 1 (`web/src/features/surfaces.ts` `observeSpawnReply` against `appliedRev`) | Yes. The snapshot basis is now covered: `surfacesrev.test.ts` "a spawn reply judged against the snapshot's terminalsRev alone". Snapshot 9 with `{1:[t1]}` gives reply rev 9 → not switched and rev 10 → shown. `terminalsrev.test.ts` unit-tests `appliedRev`, `applyListRev` and the applied half of `forgetSeenRev` | pass |
| REQ-2 | Yes, unchanged (`internal/server/shellactivity.go` `sync`) | Yes (`TestPollerRev_FailedFollowUpListingAnswersAFreshRevAndForcesNextBroadcast`) | pass |
| REQ-3 | Yes, unchanged (`reconcile`, forced loop, with `[]` for a nil list) | Yes. `TestPollerRev_ForcedSessionWithNoTerminalsBroadcastsAnEmptyList` reaches the `list == nil → []terminalWire{}` branch. It asserts one broadcast for session 2, with a list that is non-nil (`assert.NotNil` fails on a nil slice) and empty, and checks that the force clears | pass |
| DIAG | `kb:diagram/daemon-components`, `kb:diagram/web-components`: no production change this cycle | — | pass |

## Build & Tests

E2E tests: pass (114, scoped to 12 files: auth, claude-version, embedded, masthead-update-dot, plain-shell, resilience, shell-activity, shell-keys, shell-scroll, shell, terminal, terminals) · Daemon tests: pass (`go test -count=1 ./cmd/musterd ./internal/server`, no `-race` on the gate line) · Web tests: pass (116 files, 3414 tests) · Render tests: pass (509) · Daemon build: pass · Web build: pass · Lint: pass (golangci-lint 0 issues; web lint clean). All were read from $GATES_LOG_DIR (`gates-terminal-ended-rule-1-c2`, 0 failed lines). These lines are also green: render fixtures (119 scenarios), render-lint, contrast (54 pairs ×3, 0 failures), versions, kb check (713 records, 0 problems), e2e-lint, features-scope, comment checks and comment ledger. `WARN size` (funlen `TestTick_BusyGating_Table`, untouched) and the e2e-level census are review-maintainability's or pre-existing.

## Acceptance Checks

| ID | Command | Result |
|----|---------|--------|
| W1 | `cd web && npx vitest run src/features/surfacesrev.test.ts src/terminal/terminalsrev.test.ts` | pass (2 files, 28 tests, up from 22; `23-W1.log`) |
| D1 | `go test -count=1 -run 'TestPollerRev_' ./internal/server/` | pass (`24-D1.log`) |
| D2 | `go test -count=1 ./internal/server/` | pass (`25-D2.log`) |
| D3 | `make lint` | pass (deduped to the gates' lint line, 0 issues, `03-lint.log`) |
| DOC | doc upkeep + Doc Delta vs what shipped | pass. This is a sweep batch, so the open `TODO.md` entry is ticked by the loop on `main`. There are no `deviation:`/`doc-delta:` lines in the logs. The Doc Delta now states that ws.shell-activity's "never when nothing changed" stops being true, with the forced re-broadcast after a failed follow-up listing as the one exception. That claim matches `reconcile`'s forced loop: an unchanged list is broadcast on the next successful poll (`tick` or `sync`) and the mark is cleared. The target sentence exists at `docs/protocol.md:1755` |

## Reviewer-Verified Criteria

| ID | Criterion | Result | Evidence |
|----|-----------|--------|----------|
| RV1 | The daemon change matches `docs/protocol.md` § Revisions and ws.shell-activity as they stand | pass | The daemon is unchanged since cycle 1. The one self-contradiction found in cycle 1 (`docs/protocol.md:1755` against § Revisions) is now carried by the Doc Delta for doc-reconcile to promote |

## Hard-Rule Checklist

| # | Rule | Result |
|---|------|--------|
| 1 | Adapter boundary | pass (test-only delta) |
| 2 | No terminal-output state parsing | pass |
| 3 | Non-blocking hook handler | pass |
| 4 | tmux via `-L muster`; sizing | pass (tests use `paneActivityStub`, no tmux) |
| 5 | No payload logging | pass |
| 6 | Empty-gauge honesty | pass |
| 7 | Identity on the tmux target | pass |
| 8 | No settings trespass | pass |
| 9 | No real `claude` outside canary/probes | pass |

## Delta

| Prior issue (id) | Status | Fix commit | Verified how |
|---|---|---|---|
| correctness Major 1 `[web-tests]` web/src/features/surfacesrev.test.ts:observeSpawnReply:snapshot basis untested | resolved | `5b462efe` | Read the diff. The wire test sends only `w.snapshot(9, {1:[info(1)]})` with no `terminals` message, then reply rev 9 → `{selected:"claude", shell:1}` and rev 10 → `{selected:"shell", shell:2}`. If `resetSeenRev` stopped setting the applied base, rev 9 would be shown and the test would fail. The helper tests in `terminalsrev.test.ts` pin `appliedRev(resetSeenRev(5),1)===5`, check that `raiseSeenRev` does not move applied, that `applyListRev` is per-session and monotonic, and that `forgetSeenRev` drops applied back to the base. Exactly what the issue asked; test-only |
| correctness Major 2 `[daemon-tests]` internal/server/terminalsrevpoller_test.go:reconcile:forced empty list untested | resolved | `673c588e` | Read the diff. Session 2 is absent from both listings, `sync(ctx,2)` fails, and the next tick broadcasts `[]` (non-nil) for session 2 only, after which the force clears. The commit also prepends one `reconcile` to the pre-existing `TestPollerRev_SessionKeepsItsRevAfterItsListGoesEmpty` without changing any assertion (see Note 1). Ran both tests `-count=200`: green |
| correctness Major 3 `[orchestrator]` docs/protocol.md:ws.shell-activity:never-when-unchanged now false | resolved | `cd8f9f3d` | The plan's `## Doc Delta` now carries the stops-being-true / becomes-true pair under **surfaces** for ws.shell-activity. It was checked against `shellactivity.go` `reconcile`. The doc edit itself is doc-reconcile's |

## Issues

### Critical

None.

### Major

None.

### Minor

None.

### Notes

1. **[note]** `673c588e` also adds `p.reconcile({1:[shell 1]})` before the two-session reconcile in `TestPollerRev_SessionKeepsItsRevAfterItsListGoesEmpty` (`internal/server/terminalsrevpoller_test.go:79`). Neither the commit message nor `daemon-tests.md` mentions it. On `main` that test reconciles sessions 1 and 2 from empty in one call. `reconcile` numbers `pending` in map-iteration order, so `revFor(2) == 2` held only when 2 iterated second, which made the test order-dependent. The added line gives session 1 its rev first, which makes the asserted revs (1→3, 2→2) deterministic. Every assertion is unchanged, so this is a de-flake, not a weakening. 200 consecutive runs were green.
2. **[note]** Cycle-1 Notes 1–3 (equal-rev unit case covered only by E2E, a forced mark outliving a killed session, no `-race` on the gate line) stand as recorded. Nothing in this delta changes them.
