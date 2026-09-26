# Maintainability review: Maintainability Regressions

**Plan**: maintainability-regressions
**Verdict**: approved
**Cycle**: 4
**Pack**: kb: pack 20782 words (budget 20000) — sections: rules 1938 · features 2133 · diagrams 4305 · decisions 6992 · proposed 0 · facts 5237 · lessons 169 · runbooks 2 (WARN: over budget)
**Scope**: 15 files from `git diff main...HEAD -- cmd internal web/src ':!*_test.go' ':!*.test.ts'`, the same set as cycles 2 and 3. Four of them are GENERATED `CLAUDE.md` trailers. The spawn prompt did not declare a delta, so this is a full re-review. Since cycle 3 (`7c327a5..HEAD`), only two source files changed: `web/src/features/launch.ts` (the generation guard on the force-focus, plus comments) and `web/src/render/launch.ts` (doc comment only). The other thirteen are byte-identical to what cycle 3 read, so cycle 3's results for them stand.

## Files

| File | Siblings opened | design: line | Size warnings | Result |
|------|-----------------|--------------|---------------|--------|
| internal/claudecode/settings.go | (cycle 2) server/launcher.go `writeSettings`, selfupdate/apply.go. Unchanged since cycle 3 | yes | — | pass |
| internal/claudecode/modelcheck.go | (cycle 2) version.go, credentials.go. Unchanged | yes | — | pass |
| internal/server/launchermodels.go | (cycle 2) browse.go, usage.go, issue.go, terminal.go. Unchanged | yes | — | pass |
| internal/server/launcher.go | (cycle 2) browse.go, usage.go. Unchanged | yes | funlen `Launch` 83>60. Pre-existing on `main` and unchanged; the reason holds | pass |
| internal/server/launcherrors.go | respond.go. Unchanged | n/a | — | pass |
| internal/server/server.go | composition root. Unchanged | covered | funlen `New` 42>40; the reason in `New`'s doc holds | pass |
| web/src/api/launch.ts | api/reader.ts, api/issue.ts. Unchanged | yes | — | pass |
| web/src/features/launchmodels.ts | launchcrumbs.ts, launchrestore.ts. Unchanged; `applyVerdicts` (`:66-75`) re-read against the new guard | yes | — | pass |
| web/src/features/launch.ts | launchmodels.ts, issue.ts; `navigate()`'s `requestId !== browseRequestId` (`:308`) as the capture-and-compare precedent. Changed since cycle 3: `submit`'s `appliedToCurrentStore` (`:440`), plus comments | no new type, module or seam; Fix Attempt 3 says "no new helper" and pastes the `rg` | filelen 606 (602 at cycle 3, 504 on `main`). The +4 is doc comments; the reason in `web-implementation.md` still holds | pass (Notes 1 and 2) |
| web/src/render/launch.ts | render/mainhead.ts:57, render/tiles.ts:67 (cycle 3). Changed since cycle 3: `renderModelRowState`'s doc only (`:181-202`) | none needed | — | pass (Note 2) |
| web/src/style.css | Unchanged | n/a | — | pass |
| internal/server/launchermodels_test.go (size log only) | — | — | funlen 55>40. The reason in `daemon-tests.md:207-215` holds (verified in cycle 3; file unchanged) | pass |
| internal/claudecode/CLAUDE.md, internal/server/CLAUDE.md, web/src/features/CLAUDE.md, web/src/render/CLAUDE.md | — | generated trailer | — | not reviewed |

## Cycle 3 findings

| Cycle 3 finding | Fix commit | Verified how |
|-----------------|-----------|--------------|
| Minor 1: the launch-time focus force ran outside the generation guard | 9973f3e | `features/launch.ts:440` computes `appliedToCurrentStore = generation === modelVerdicts.generation` before `modelVerdicts` is reassigned at `:441`. `generation` is the value captured before the `await` (`:427`). `:449` passes that flag to `updateModelRowState` in place of `true`. The predicate is the exact negation of `applyVerdicts`'s drop condition (`launchmodels.ts:71`, `if (generation !== store.generation) return store;`). So the force applies iff the write was merged. In the cycle 3 interleaving, g1's stale refusal now gets `false`, and `renderModelRowState:221` moves focus only through the `launchHadFocus` path. That path is the default for every other caller. The regression E2E is in f0ee1aa. |

## Issues

### Critical

None.

### Major

None.

### Minor

None.

### Notes

1. **[note]** The generation predicate is now written twice: `applyVerdicts`'s `generation !== store.generation` (`launchmodels.ts:71`) and `submit`'s `generation === modelVerdicts.generation` (`features/launch.ts:440`). § Design "One owner per concept" says "Two places that must agree will not". I am not filing this, for two reasons. It is one comparison, and the comment at `:436-439` names its twin, so a reader changing one sees the other. If the guard ever grows past a single comparison, deriving the flag from `applyVerdicts`'s own result would give the rule one home. `applyVerdicts` returns the same `store` reference when it drops a write. No change requested.
2. **[note]** This belongs to `review-work`'s comment-truth part, so I am not filing it. `renderModelRowState`'s doc says the focus rule is "stated once here; `features/launch.ts`'s callers reference this comment rather than restate it" (`render/launch.ts:187-188`). It also now describes the caller's internal guard: "the same generation guard `applyVerdicts` applies" (`:199-202`). Meanwhile `submit` restates that guard in two inline comments (`features/launch.ts:436-439`, `:446-449`). The "just above" in `:439` points at `navigate()`, which is 130 lines up (`:304-308`). Cycle 3 Note 1 (a `render/` doc naming its caller) still applies, and more strongly now that it names the caller's guard too.
3. **[note]** Diagram check: no module or dependency edge added since cycle 3. Both changed files keep their imports unchanged (`git diff 7c327a5..HEAD -- web/src` touches no `import` line).
4. **[note]** Cycle 2 Notes 1, 3, 4 and 6 are still as filed, because their code did not move. I am not refiling them.
