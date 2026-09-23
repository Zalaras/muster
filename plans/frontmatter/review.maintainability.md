# Maintainability review: frontmatter

**Plan**: frontmatter
**Verdict**: approved
**Cycle**: 4
**Pack**: `kb: pack 21855 words (budget 8000)`, over budget (WARN). Features: reader, lifecycle.
**Scope**: 14 files from `git diff main...HEAD -- cmd internal web/src` (tests excluded). No code has changed since cycle 3, so this cycle re-reads the lifecycle-owned changes under the lifecycle pack: `internal/session/manager.go` (the new `Manager.ApplyPlanScan`), and the doc comments in `internal/session/session.go`, `internal/store/session.go` and `internal/server/sessionwire.go`. For context it also re-reads the one caller, `internal/server/reader.go` `scanPlan`. The reader-side files carry forward from cycle 3, which approved them, and the lifecycle context does not change their result.

## Files

| File | Siblings opened | design: line | Size warnings | Result |
|------|-----------------|--------------|---------------|--------|
| internal/session/manager.go | `SetPlan` (:1001), `SetTranscript` (:972), the other persist-after-unlock setters (:311, :612, :660, :838, :896, :931, :959), the `Manager`/`mu`/`idLocks` declarations (:84-108), `internal/session/CLAUDE.md`, machine.go, railorder.go, status.go | yes (Fix Attempt 1: two `design:` lines, one on the single owner of retention and one on the stat running under the lock) | filelen 1810 (1751 on main, +55 from `ApplyPlanScan`). `rowToSession`/`sessionToRow` funlen hits predate this branch and are untouched. | pass |
| internal/session/session.go | the other field comments in `Session` | n/a (comment only) | none | pass |
| internal/store/session.go | the other `SessionRow` field comments | n/a (comment only) | `InsertSession` funlen predates this branch and is untouched | pass |
| internal/server/sessionwire.go | readerwire.go, and the other `sessionWire` field comments | n/a (comment only) | none | pass |
| internal/server/reader.go (caller) | observeWrite, sessions.go | yes | none | pass |
| web/src/*, internal/server/readerwire.go, internal/server/CLAUDE.md, the `CLAUDE.md` trailers | carried from cycle 3 | yes / n/a | reader.ts filelen 609, protocol.ts filelen 970. Both were accepted in cycle 3. | pass (carried) |

### `ApplyPlanScan` checked against the lifecycle rules

- **Match the siblings** (conventions § Design). `ApplyPlanScan` has the same shape as `SetPlan` (:1001) and `SetTranscript` (:972):
  - the same signature prefix, `(ctx, id int64, claudeSessionID, …)`;
  - the same `ErrUnknownSession` return for an unknown id;
  - the same straggler gate, which returns a snapshot with `changed=false` when `sess.ClaudeSessionID != claudeSessionID`. This gate enforces `kb:adr/ingest-monotonic-rebind`;
  - the same unchanged short-circuit;
  - `sessionToRow` and `Clone` taken under `mu`, then persist and broadcast after unlock;
  - the error wrap `"persisting plan for session %d: %w"`, identical to `SetPlan`'s.

  A reader who knows `SetPlan` knows this method.
- **Reuse before add.** `rg -n 'ApplyPlanScan|SetPlan\(|os\.Stat' internal --type go -g '!*_test.go'` returns:
  ```
  internal/session/manager.go:1001:func (m *Manager) SetPlan(...)
  internal/session/manager.go:1039:func (m *Manager) ApplyPlanScan(...)
  internal/session/manager.go:1058:		if info, statErr := os.Stat(path); statErr == nil && !info.IsDir() {
  internal/server/reader.go:192:		... f.manager.SetPlan(ctx, sessionID, claudeSessionID, sess.PlanPath, true) ...
  internal/server/reader.go:237:	if _, _, err := f.manager.ApplyPlanScan(ctx, sessionID, claudeSessionID, pf.Path); ...
  ```
  The branch diff removes the plan-exists stat from `reader.go` `scanPlan` and moves it here, so it still has exactly one home. The retention rule also has exactly one home (§ Design "One owner per concept").
- **Shared state and its guard.** Everything `ApplyPlanScan` reads and writes on `sess.PlanPath`/`PlanExists` happens inside one `m.mu` critical section. That closes the interleaving from cycle 1 Major 1. `make test-race` (the gates' `02-test.log`: `go test -race -count=1 ./...`, green) covers it through `internal/server` `scanPlan`. The implementer also reports a 30× `-race` stress run that fails against the old two-lock split.
- **Lifecycle invariants** (`internal/session/CLAUDE.md`). The method writes no state-machine field and never calls `applyInput`. It reads no Claude Code vocabulary; the path arrives as an opaque string from `claudecode.LocatePlanFile` in the caller. It changes no attention, failure or alive state. It keys on the Muster id, with `claudeSessionID` used only as the straggler gate (`kb:adr/lifecycle-session-identity-is-tmux-target`). None of these invariants is crossed.
- **Layering.** The `claudecode` import stays in `internal/server/reader.go`, and `internal/session` gains only `"os"`. No composition root changed.

## Issues

### Critical

### Major

### Minor

### Notes

1. **[note]** `ApplyPlanScan` (`manager.go:1058`) is the first `internal/session` code to hold `Manager.mu` across I/O, and the first file in the package to import `"os"`. The sibling comment on `idLocks` (:102-103) says "never held across tmux I/O". Every other setter releases `mu` before `m.store.UpdateSession`. `mu` is the lock the ingest worker and the liveness poll also take, so a slow stat would stall lifecycle transitions for every session. The Fix Attempt 1 `design:` line gives the reason: a local stat against `~/.claude/plans`, which buys an atomic retain-decide-write. That reason still holds under the lifecycle lens. No change requested. Two follow-ups are outside this review:
   - The `Owns` line in `internal/session/CLAUDE.md` lists the package's outside routes (store, and tmux via interfaces) but not the filesystem. Whether that line should mention it is a doc-truth question for review-work.
   - If a second I/O-under-`mu` case ever appears, it should be a named rule on `mu`'s declaration.
2. **[note]** The tail of `ApplyPlanScan` (`manager.go:1063-1079`) repeats `SetPlan`'s (:1011-1023) line for line: the compare, the assign, `sessionToRow`/`Clone`, unlock, persist, broadcast. `dupl` did not flag it. The package idiom inlines this tail in every setter (:311, :612, :660, :838, :896, :931, :959), so the repeat matches the siblings rather than diverging from them. No change requested.
3. **[note]** A pre-existing, package-wide ordering applies to the new method as it does to every sibling setter. Each setter snapshots the whole row under `mu` but persists after unlock. So two writers to one session can reach SQLite in the opposite order to their in-memory commits: A commits, B commits, B persists, A persists, and the store holds A's older row until the next write. `ApplyPlanScan` inherits this pattern without widening it. This branch introduced nothing here, so it is recorded for the backlog only.
4. **[note]** No test calls `ApplyPlanScan` directly in `internal/session`. `rg -n ApplyPlanScan internal -g '*_test.go'` returns nothing; the method is exercised only through `internal/server` `TestScanPlan_StickyOnceNamed`. Test coverage belongs to review-work, and this note only names it.
5. **[note]** The cycle 3 notes carry forward unchanged: the cycle 2 notes 1-6, and the `transcriptB` comment in `reader_test.go`. The two test funlen hits (`TestScanPlan_StickyOnceNamed` at 131 lines, `TestIngestRouting_StragglerFromBeforeAClearNeverMovesTranscriptOrPlan` at 46 statements) are in test files outside this diff. The first is a table test written on this branch, and the second predates it.
