# Proposed backlog — status-inconsistencies

Proposed by the pipeline, never filed; `/land` puts each to the developer.

### An interrupt right after a musterd restart leaves the card working

- **Summary**: after a daemon restart, an Esc before the session's next hook leaves the card `working` until the next prompt.
- **Source**: `review.md` correctness Note 1 `[note]`; daemon-tests residual (`daemon-tests.md`).
- **Change requested**: no — the reviewer: "This matches the plan's 'for the current prompt' … It may be worth a line in `proposed-backlog.md`."
- **Suggested section**: Issues — turn-state gaps.
- **Pre-existing**: no — this branch adds the interrupt sweep; the gap is that the current prompt id is not persisted.

### A live tile shows no background-task indicator

- **Summary**: in Tiles, a session shown as a live tile has no "1 background task" cue; only its strip card does.
- **Source**: `review.md` browser Note 2 `[note]`.
- **Change requested**: no — the reviewer: "That follows the plan, but the developer may expect one on the tile header."
- **Suggested section**: Issues.
- **Pre-existing**: no — this branch adds the card line.

### Split the lifecycle feature spec before its next addition

- **Summary**: `docs/features/lifecycle/spec.md` fits its 800-word budget only after compression; the next addition needs a split.
- **Source**: `doc-reconcile.md` `[orchestrator]` note.
- **Change requested**: yes — doc-reconcile: "the next addition to it will need a feature-split decision".
- **Suggested section**: Issues — From the maintainability cleanup (Refactor).
- **Pre-existing**: partly — the spec was near the budget; this branch's additions brought it to the edge.

## Decisions (the developer, 2026-10-01)

1. An interrupt right after a musterd restart leaves the card working — not doing.
2. A live tile shows no background-task indicator — not doing.
3. Split the lifecycle feature spec before its next addition — not doing ("will deal with it when it becomes a problem").
