# Maintainability review: frontmatter

**Plan**: frontmatter
**Verdict**: needs-changes
**Cycle**: 2
**Pack**: `kb: pack 10993 words (budget 8000)`, over budget (WARN)
**Scope**: 14 files from `git diff main...HEAD -- cmd internal web/src` (tests excluded). 10 are code or CSS: `internal/server/{reader,readerwire,sessionwire}.go`, `internal/session/{manager,session}.go`, `internal/store/session.go`, `web/src/{protocol.ts,features/reader.ts,reader/frontmatter.ts,reader/markdown.ts,style.css}`. The other 3 are generated `CLAUDE.md` trailers. This cycle's delta against cycle 1 (`29580c7..HEAD`) was read line by line.

## Files

| File | Siblings opened | design: line | Size warnings | Result |
|------|-----------------|--------------|---------------|--------|
| internal/session/manager.go | `SetPlan`, `SetTranscript`, `MarkSeen`, `SetTitle` in the same file; `mu`/`idLocks` declarations | yes (Fix Attempt 1: rule lives only in `ApplyPlanScan`; stat under the lock, with the reason) | filelen 1810 (1751 on main) | pass, Notes 1–3 |
| internal/server/reader.go | readerwire.go, sessionwire.go, `observeWrite`/`handleReaderList` in the same file | yes | none | pass, Note 1 |
| internal/server/readerwire.go, sessionwire.go | each other | n/a (comment only) | none | pass |
| internal/session/session.go, internal/store/session.go | manager.go | n/a (comment only) | none | pass |
| web/src/style.css | the surrounding `.md table` rules | yes (cycle 1 layout line; the fix adds no tokens) | n/a | Minor 1 |
| web/src/features/reader.ts | reader/*.ts | n/a (comment only) | filelen 611 (610 on main) | Minor 1, Note 4 |
| web/src/protocol.ts | — | n/a (comment only) | none | pass |
| web/src/reader/frontmatter.ts, markdown.ts | slug.ts, paths.ts, mermaid.ts (checked in cycle 1, unchanged since) | yes | none | pass |

**Cycle 1 Major 1 is resolved.** The retain-or-replace decision now happens inside one `Manager.mu` critical section in `Manager.ApplyPlanScan` (`internal/session/manager.go:1039-1079`). That section reads the live `sess.PlanPath`, runs the stat, checks for no change and writes. `scanPlan` (`reader.go:227-240`) only passes on what the scan found. `rg` finds exactly one place that reads `PlanPath` and then decides to retain it:

```
$ rg -n "SetPlan\(|ApplyPlanScan\(" internal cmd -g '!*_test.go'
internal/session/manager.go:1001:func (m *Manager) SetPlan(...)
internal/session/manager.go:1039:func (m *Manager) ApplyPlanScan(...)
internal/server/reader.go:192:  f.manager.SetPlan(ctx, sessionID, claudeSessionID, sess.PlanPath, true)   <- observeWrite, real path only
internal/server/reader.go:237:  f.manager.ApplyPlanScan(ctx, sessionID, claudeSessionID, pf.Path)          <- scanPlan
```

`ApplyPlanScan` has the same shape as its sibling setters: lock, `ErrUnknownSession`, a `claudeSessionID` gate that returns a snapshot, a no-change short-circuit, `sessionToRow` + `Clone`, unlock, then `UpdateSession` wrapped as `"persisting plan for session %d: %w"` and `broadcast`. Compare `func (m *Manager) SetPlan(ctx context.Context, id int64, claudeSessionID, path string, exists bool) (*Session, bool, error)` with `func (m *Manager) ApplyPlanScan(ctx context.Context, id int64, claudeSessionID, foundPath string) (*Session, bool, error)`. All 53 `Manager` methods live in `manager.go`, so placing it beside `SetPlan` also matches the package.

## Issues

### Critical

### Major

### Minor

1. **[web-impl]** Two comments added in the cycle-1 fix narrate history instead of stating the current reason. This breaks conventions § Comments: "don't narrate history".
   - `web/src/style.css:1035-1048` gives the whole measurement story: the first attempt that failed, "measured with Playwright", `scrollWidth 525 > clientWidth 233`, "This supersedes the plan's Affected Files instruction … (review cycle 1, browser Major 1 …)". A newcomer will never see the plan or the review it refers to.
   - `web/src/features/reader.ts:451-453` says: "Since REQ-8 a `/clear` keeps the retained plan …, so this fallback is no longer about surviving a `/clear`; E5 now asserts the badge stays after one". That describes what the code used to be for, not what it does.

   A fix must leave each comment stating only the constraint that is true now. For the CSS: auto table layout treats a cell width as a hint, so `table-layout: fixed` is what makes the key column's 40% a hard cap that long keys wrap inside. For reader.ts: the listing's plan is a fallback only while `session` is unknown. The measurement and review-cycle story already lives in `plans/frontmatter/web-implementation.md` Fix Attempt 1.

### Notes

1. **[note]** One check-then-act on `PlanPath` remains, it predates this branch, and its code is unchanged here. `main:internal/server/reader.go` has the identical `SetPlan(ctx, sessionID, claudeSessionID, sess.PlanPath, true)` line. In `observeWrite` (`internal/server/reader.go:176-195`), ingest worker I reads `sess.PlanPath == X` through `Get` (lock released). Handler goroutine H, in `handleReaderList` → `scanPlan` → `ApplyPlanScan`, then commits plan Y. Then I calls `SetPlan(X, true)`, which writes X back over Y because `X != Y`. That reverts a newer plan. This is the same revert shape cycle 1 named for `scanPlan`. It is not the sticky-once-named rule, and this branch did not introduce it. I suggest the orchestrator add it to `TODO.md`: the exists-flip should commit only if `PlanPath` still equals the path it read.
2. **[note]** `ApplyPlanScan` calls `os.Stat` while holding `Manager.mu`. No sibling does I/O under `mu`: `SetPlan`, `MarkSeen` and the others release it before `UpdateSession`, and `idLocks` is documented as "never held across tmux I/O". The `design:` line states this trade-off (a local stat, only during a scan, with no read-decide-write gap), and the reason holds for a single-user, local-disk tool. This is also the first `os` import in `internal/session`.
3. **[note]** Size: `internal/session/manager.go` filelen grew from 1751 to 1810 lines. That was already far over the 500-line threshold before this branch. The only reason given in Decisions is "pre-existing … unchanged in kind", which is thin. The placement is still right, because every `Manager` method lives in this file, so no split is asked. `TestScanPlan_StickyOnceNamed` funlen grew from 106 to 131 lines. The reason in `plans/frontmatter/daemon-tests.md:36-41` (one crossed table) still holds.
4. **[note]** `web/src/features/reader.ts` filelen went from 610 to 611 lines, and the extra line is a comment. The warning predates the branch.
5. **[note]** No test calls `ApplyPlanScan` concurrently or directly. It is exercised only through the `scanPlan` table. The implementer's stress test was a throwaway and was deleted. Whether to pin atomicity with a test is `review-work`'s coverage call. The race detector could not see this lost update in any case.
6. **[note]** `readerManager` (`reader.go:105-110`) grew to four methods for a single consumer with no fake (`rg -n readerManager -g '*_test.go'` finds no hits). This matches how the interface already stood, so no change is asked.
