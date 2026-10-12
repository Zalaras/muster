# Proposed backlog: masthead-indicators

Proposals only — nothing here is filed in `TODO.md`. `/land` puts each to the developer.

### The `parseUsage` suppression gives a reason the code no longer bears out

**Summary**: `biome-ignore` at `web/src/protocol/usage.ts:74` cites per-field comments the comment pass removed.
**Source**: review.cycle1.md correctness Note 1 and maintainability Note 1; review.md (cycle 2) maintainability Note 1 `[note]`.
**Change requested**: no — "The comment pass owns comments … so this is not routed."
**Suggested section**: Issues.
**Pre-existing**: no — this branch's comment pass (2e678971) removed the comments the reason cites.

### The comment pass drops pre-existing comments along with a plan's edits to them

**Summary**: Cycle 1's pass removed module headers from `features/connection.ts`, `features/usage.ts` and `render/masthead.ts`, plus `UsageInfo`'s doc comment and the `shellsBusy?` note.
**Source**: review.cycle1.md maintainability Note 2 and correctness Note 2; review.md (cycle 2) maintainability Note 2 `[note]`.
**Change requested**: no — "for you or `/retro` to weigh against the judge's edited-comment rule."
**Suggested section**: pipeline / `/retro`.
**Pre-existing**: yes — the comment-pass edited-comment rule; this branch is where it bit.

### The pending health-dot CSS rule repeats the base rule

**Summary**: `#connection-status[data-health="pending"]::before` sets the colour the base rule already sets.
**Source**: review.cycle1.md maintainability Note 4; review.md (cycle 2) maintainability Note 3 `[note]`.
**Change requested**: no — "it does no harm."
**Suggested section**: Issues.
**Pre-existing**: no — added on this branch.

## Decisions (the developer, 2026-10-12)

- The `parseUsage` suppression gives a reason the code no longer bears out: fixed directly on `main` after landing. Not filed.
- The comment pass drops pre-existing comments along with a plan's edits to them: filed: TODO.md § Pre-v1, "The comment pass keeps comments a plan did not write"
- The pending health-dot CSS rule repeats the base rule: fixed directly on `main` after landing. Not filed.
