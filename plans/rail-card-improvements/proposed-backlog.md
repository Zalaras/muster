# Proposed backlog — rail-card-improvements

Follow-up this run found. **Nothing here is filed**: an open `TODO.md` item is the user's to
write (kb:adr/process-backlog-entries-are-the-users-to-file). Each block is ready to paste if
the user wants it, and states whether a change was actually requested.

---

### `dead-refs --all` is red in any fresh worktree

**Source**: `review.cycle1.md` Note 1 `[note]`.
**Change requested**: no — "it is not this plan's doing … Nothing in the diff introduced one,
and no pipeline agent can fix it. Worth knowing that `dead-refs --all` will fail for any review
run out of a fresh worktree."
**Suggested section**: pipeline / tooling (the user chooses).
**Pre-existing**: yes — the 27 missing references point at `.claude/settings.local.json` (24) and
`test/rig/captures/…` (3), both gitignored, present in the main checkout and absent from a
worktree. This branch touches none of them.

The reviewer's baseline gate reports red for a reason that has nothing to do with the branch
under review. Either the script skips references into gitignored paths, or the review agent's
definition says the gate is advisory in a worktree. A pipeline-doc matter for `/retro` rather
than a code change in a feature plan.

### Every role's `kb pack` overran its 8000-word budget by 2.5–4×

**Source**: `review.cycle1.md` Note 4 `[note]`; the orchestrator's own pack was 30381 words,
e2e-specs 23639, daemon-impl 23289, the reviewer 31890.
**Change requested**: no — "Five runs in a row is a signal about the pack itself rather than
about any one role."
**Suggested section**: pipeline / knowledge tooling (the user chooses).
**Pre-existing**: yes — the budget and the pack composition live in `internal/kb` and the record
tree; this plan's six features (rail, settings, views, tiles, launch, lifecycle) pull 7327 words
of feature specs and 8343 of decisions before any role-specific section is added.

The warning is printed and ignored on every spawn. Worth a look at whether the budget is wrong,
the decisions section should carry summaries rather than full records for features outside the
plan's Affected Files, or the pack should be trimmed per role.
