# E2E Test Specs: sweep-2026-11-03-1

**Plan**: sweep-2026-11-03-1
**Mode**: authoring (red-first); validate (review cycle 1)
**Pack**: kb: pack 32933 words (budget 30000)
**Verdict**: pass
**Tests created**: 0 new, 1 rewritten (E4), 1 retitled (E2)
**Live run**: 5/5 passing in reconcile.spec.ts (validate, review cycle 1); E4 was red at authoring as the plan's Proof required, green against c8c24118

## Tests

| File | Test Name | Requirement | What It Verifies | Live run |
|------|-----------|-------------|------------------|----------|
| web/e2e/reconcile.spec.ts | stopping the daemon with -on-exit=kill kills the tmux session and the next startup brings the row back ended and resumable (E4) | e2e journey (kb:adr/lifecycle-ended-rows-kept-until-remove) | -on-exit=kill restart: tmux session gone, `/api/state` keeps the row `alive:false` with `endedAt` set, after reload the card is present, ended, Resume enabled | ran-red-at-authoring; ran-green at validate (5 passed in file run, 9.9s) |
| web/e2e/reconcile.spec.ts | a session whose pane died while the daemon was down reconciles to ended and kept, and stays kept until removed (E2, INV-1, INV-3) | E2 (retitled, body unchanged) | unchanged | ran-green-at-authoring (4 passed in file run); ran-green at validate (5 passed in file run) |

Red output (`make e2e SPECS=web/e2e/reconcile.spec.ts`), the row is swept today:

```
1) reconcile.spec.ts:116 stopping the daemon with -on-exit=kill ... (E4)
    Error: session 1 not found in state snapshot
       at helpers/session.ts:220  (findSession, called from reconcile.spec.ts:143)
  1 failed / 4 passed
```

## Deleted Tests

None. E4's old assertions (`state.sessions.some(...)` false, `toHaveCount(0)`) were inverted to the new contract; the tmux-gone assertions are kept.

## Fixture Changes

No changes needed.

## Comment fixes (no assertion touched)

- web/e2e/actions.spec.ts (~703-705): the comment claimed the reconcile sweep deletes alive:false rows; rewritten to cite kb:adr/lifecycle-ended-rows-kept-until-remove.
- web/e2e/effort-header.spec.ts (~190): replaced the citation of kb:adr/lifecycle-ended-rows-swept-next-start.

## Coverage

| Requirement | E2E Tests |
|-------------|-----------|
| ended rows never deleted at start (-on-exit kill) | E4 |

## Handoff

None.

## Notes

Collection: `npx playwright test --list` Total: 647 tests in 60 files, no error. Go tests untouched.

## Validate (review cycle 1)

Implementation c8c24118. No test was changed in this pass; no repairs; no assertion was deleted, skipped, or weakened.

First `make e2e SPECS=web/e2e/reconcile.spec.ts` exited 75 (gate lock held by the muster-sweep-2026-11-03-2 worktree for 4m0s; not a test failure). Rerun:

```
Running 5 tests using 4 workers
  ✓ reconcile.spec.ts:165 ... (E3)
  ✓ reconcile.spec.ts:75 ... (E3, survive policy)
  ✓ reconcile.spec.ts:116 stopping the daemon with -on-exit=kill ... (E4)
  ✓ reconcile.spec.ts:204 ... (REQ-2)
  ✓ reconcile.spec.ts:24 ... (E2, INV-1, INV-3)
  5 passed (9.9s)
```

Note: the harness printed "scratch musterd did not exit within 5s of SIGTERM; escalating to SIGKILL" during the E2 test teardown; the test passed. Not soaked in this pass (the orchestrator's instruction was a single re-run).
