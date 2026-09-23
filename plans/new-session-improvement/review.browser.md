# Browser review: New Session Improvement

**Plan**: new-session-improvement
**Verdict**: approved
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
