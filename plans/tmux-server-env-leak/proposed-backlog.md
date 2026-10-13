# Proposed backlog — plan `tmux-server-env-leak`

Follow-up this run found, proposed for the developer to file or drop at `/land`. Nothing here is filed.

### The `execSeparated` doc comment does not mention the environment scrub

**Summary**: the doc comment on the tmux client's production exec seam still describes only the stdout/stderr split and the WaitDelay, not that it strips `MUSTER_SESSION`.
**Source**: `review.code.md` Note 1 `[note]`.
**Change requested**: no — the reviewer called it "incomplete rather than false"; the comment pass judges any added or edited comment on a later branch.
**Suggested section**: Refactor (beside "Decide the owner of the ingest route and `MUSTER_SESSION`", which this plan's second spelling of the name in `internal/tmux` bears on).
**Pre-existing**: no — this branch added the scrub beside that comment without editing it.

## Decisions (the developer, 2026-10-13)

- The `execSeparated` doc comment does not mention the environment scrub — not doing as a backlog entry: fixed directly on `main` right after this plan lands, at the developer's request. Not filed.
