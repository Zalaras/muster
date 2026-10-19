# Correctness review: launch-dialog-fixes

**Plan**: launch-dialog-fixes
**Verdict**: approved
**Cycle**: 2
**Pack**: kb: pack 20751 words (budget 30000)

Scope: cycle 1's only open issue was correctness Major 1 `[e2e-specs]`, so this cycle reviews the delta `8998e0d4..HEAD`. That delta is `832728f6`, plus the cycle-1 archive and the state file. `git diff 8998e0d4..HEAD --name-only -- web/src internal cmd` is empty: no implementation file changed. Cycle 1's findings on `launch.ts`/`launchrestore.ts` therefore still hold unchanged: REQ-1, REQ-2, RV1, DIAG, the hard rules and the Doc Delta. They are carried forward below, and §1/§2 are re-read from the cycle-2 gate run.

## Requirements

| Req | Implemented | Tested | Status |
|-----|-------------|--------|--------|
| REQ-1 | Yes, unchanged since cycle 1 (`submitNew` force-focuses only when `appliedToCurrentStore && selectedModel() === model`) | Yes. `launch-model-check.spec.ts:537`, green in 18-E1 and 17-e2e | pass |
| REQ-2 | Yes, unchanged (`knownRepos` filled at init, by `initOpen` and by `finishLaunch`; `resetForm` → `restoreFromKnownRepos`) | Yes. `launch-defaults.spec.ts:193` (held open fetch) and the dialog-launch refresh test, both green | pass |
| REQ-3 | Yes, unchanged. `ok` → `initialRestore`; `failed` → `applyRestore(defaultRestore(touched))` then `navigate(undefined)` (`web/src/features/launch.ts:518-520`); `superseded` → nothing | Yes, now. Two new tests in `launch-defaults.spec.ts:396` and `:413` (see Delta). Both seed before a reload, so the init fetch knows the recent. Both assert the held haiku/manual/high first, then sonnet/auto/default after the `failed` fallback. The touched variant keeps a mid-open `opus` pick (the radio `change` listener sets `touched.model`, `launch.ts:725-726`). The orchestrator's mutation measurement shows both go red with line 520 removed ("Expected: checked / Received: unchecked", "2 failed"). Both are green in 17-e2e (`✓ 410`, `✓ 411`) | pass |
| DIAG | `kb:diagram/web-components` was checked in cycle 1. No source changed since, so no diagram can have gone stale | — | pass |

## Build & Tests

E2E tests: pass (966, full suite: 17-e2e ran `make e2e` unscoped, and the two new tests are #410/#411) · Daemon tests (race): pass (26 packages ok) · Web tests: pass (2778 across 96 files) · Daemon build: pass · Web build: pass · Lint: pass (golangci-lint 0 issues; web lint clean, 338 files) · all read from `$GATES_LOG_DIR` (`gates-launch-dialog-fixes-c2`, summary 22 lines, 0 failed, 1 warn-only)

## Acceptance Checks

| ID | Command | Result |
|----|---------|--------|
| build | `go build ./...` | pass |
| test | `make test-race` | pass |
| lint | `make lint` | pass |
| web-build | `make web-build` | pass |
| web-test | `make web-test` | pass (2778) |
| web-lint | `make web-lint` | pass |
| contrast | `make contrast` | pass (0 failures in all three themes) |
| features-inventory | `features_inventory` | pass |
| versions | `make check-versions` | pass |
| e2e-honest | `! rg -n 'test\.(skip\|fixme\|only)\(' web/e2e` | pass |
| kb-check | `make check-kb` | pass (611 records, 0 problems) |
| e2e-lint | `make e2e-lint` | pass |
| features | `go tool kb scope --plan launch-dialog-fixes --touch` | pass (launch) |
| comments | `comment-checks.py --gates` | pass |
| comment-ledger | `go run ./tools/commentpass verify launch-dialog-fixes` | pass (1 block, kept) |
| size | `size-warn.sh --changed` | WARN (`launch.ts` 850 lines), never fails. This line belongs to review-maintainability |
| e2e | `make e2e` | pass (966 passed) |
| E1 | `cd web && npx playwright test launch-model-check.spec.ts launch-defaults.spec.ts -g 'late refusal\|before its own fetch'` | pass (2 passed) |
| W1 | `make web-lint` | pass (deduped to web-lint) |
| W2 | `make web-test` | pass (deduped to web-test) |
| W3 | `make web-build` | pass (deduped to web-build) |
| E2 | `make e2e` | pass (deduped to e2e) |
| DOC | doc upkeep + Doc Delta vs what shipped | pass. Unchanged from cycle 1. TODO entries moved; `kb:adr/launch-restore-from-last-known-repos-at-open` is accepted (fix track) with `refs: [plan:launch-dialog-fixes]`; no `deviation:`/`doc-delta:` lines; the Doc Delta clauses still hold, because no source changed |

## Reviewer-Verified Criteria

| ID | Criterion | Result | Evidence |
|----|-----------|--------|----------|
| RV1 | The open-time restore still goes through `initialRestore`'s touched filter; no second copy of that decision | pass | Unchanged since cycle 1. `restoreFromKnownRepos` calls `initialRestore(touched, first)` (`launch.ts:487`). `initialRestore`/`defaultRestore` share the private `untouchedOnly` (`launchrestore.ts:50-68`) |

## Hard-Rule Checklist

| # | Rule | Result |
|---|------|--------|
| 1 | Adapter boundary | pass. No source change. The new test code carries no Claude Code format fields |
| 2 | Terminal-output state parsing | pass. Not touched |
| 3 | Blocking hook handler | pass. No daemon change |
| 4 | Bare tmux / resize-pane | pass. No tmux |
| 5 | Payload logging | pass. No logging |
| 6 | Empty-gauge dishonesty | pass. Not touched |
| 7 | Session identity on `session_id` | pass. Not touched |
| 8 | Settings trespass | pass. Not touched |
| 9 | Real `claude` outside canary/probes | pass. The tests use the `daemon` fixture's stub `claude` |

## Delta

| Prior issue | Fix commit | Verified how |
|-------------|------------|--------------|
| cycle 1 correctness Major 1 `[e2e-specs]` "REQ-3's `failed` branch has no test that fails without the new reset" | `832728f6` | Diff read. `openOntoVanishedRecent` does five things in order: seeds haiku/`default`/high via the API, reloads and waits for `networkidle` (so the init fetch fills `knownRepos`), deletes the directory, holds only GET `/api/browse` (the open's own repos fetch is left free, so `initOpen` reaches `navigate(first.path)`), then asserts the held values while `heldBrowse > 0`. After release, the browse-root crumb is awaited before the defaults are asserted. The touched variant pins `untouchedOnly` on this branch: opus stays checked, and auto/default return. The fixture is `daemon`, matching the Fixture plan header. E12 is unchanged, as asked. No assertion was removed or weakened elsewhere (the diff only adds lines to the spec). Discrimination: the orchestrator's mutation run turned both red with line 520 removed, and both are green in 17-e2e. test-specs' Tests and Coverage rows are updated to match |

## Issues

### Critical

None.

### Major

None.

### Minor

None.

### Notes

1. **[note]** `plan.md` Edge Case 3 still says the vanished-recent reset is covered by "E2 (the existing deleted-recent test)". Cycle 1 showed that test cannot reach it. The coverage now lives in the two new tests, and test-specs' Coverage row says so. The plan is not promoted, so no change is requested. Recorded so nobody reads the plan's mapping as current.
2. **[note]** `openOntoVanishedRecent` returns a `browseHeld` accessor that neither caller uses. That is shape, so it is review-maintainability's if it runs.
3. **[note]** Cycle 1 Notes 1–4 still stand: the `!first`/fetch-failure branch also resets untouched fields, the REQ-1 test uses `startDaemon`, `launch.ts` is over the size threshold, and the e2e gate ran unscoped.
