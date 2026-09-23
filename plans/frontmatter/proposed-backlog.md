# Proposed backlog: frontmatter

Follow-up this run found. Nothing here is filed in `TODO.md` — each block waits for the developer.

### observeWrite's plan exists-flip can write an older plan back over a newer one

- [ ] **observeWrite plan revert** — `observeWrite` (`internal/server/reader.go`) reads the plan
  with `manager.Get`, then calls `SetPlan(path, true)` under a separate lock; a reader-list scan
  committing a new plan between the two is overwritten by the old path. Commit the exists-flip
  only if the stored path still equals the one read (compare-and-set inside `Manager.mu`).

- **Source**: `review.maintainability.md` cycle 2 Note 1; `review.code.md` cycle 2 Note 2.
- **Change requested**: no — "Suggested for `TODO.md`: one plan-revert race remains, but it
  predates this branch (`main` has the identical line)" (maintainability); correctness filed it
  under Notes, "no change requested".
- **Suggested section**: the reader / "plan and document tab" group.
- **Pre-existing**: yes — `main` has the identical `Get`-then-`SetPlan` in `observeWrite`; this
  branch did not touch it (it moved only `scanPlan`'s rule into `Manager.ApplyPlanScan`).

### Session setters persist after unlock, so two writers can reach SQLite out of order

- [ ] **Setter persist order** — every `Manager` setter in `internal/session/manager.go` mutates
  the in-memory session under `Manager.mu`, then persists and broadcasts after unlocking; two
  writers to one session can therefore write their rows to SQLite in the opposite order to the
  one they committed in memory, leaving the stored row stale until the next write.

- **Source**: `review.maintainability.md` cycle 4 Note 3.
- **Change requested**: no — "a pre-existing problem shared by every setter … This branch did not
  widen it; it is for the backlog."
- **Suggested section**: lifecycle / durability.
- **Pre-existing**: yes — every setter on `main` has the shape; this branch's `ApplyPlanScan`
  copies it rather than introducing it.
