# Plan: comment-pass-edited

**Status**: completed
**Shape**: chore
**Work Type**: tools
**Features**: comment-pass
**Description**: The comment pass judges a pre-existing comment the branch edited on truth alone, and shows the judge only that block's own previous lines.

## Symptom

From `TODO.md` § Pre-v1 (filed 2026-10-12 by the developer from
`plans/masthead-indicators/proposed-backlog.md`):

> **The comment pass keeps comments a plan did not write** — on `masthead-indicators` the pass
> removed module headers from `features/connection.ts`, `features/usage.ts` and
> `render/masthead.ts`, plus `UsageInfo`'s doc comment and the `shellsBusy?` note, all of which
> predate the plan. Expected: a comment that existed before the plan survives the pass, even
> where the plan edited it; weigh against the judge's edited-comment rule.

## Findings

Measured 2026-10-13 against the surviving cycle-1 run directory
(`$TMPDIR/comment-pass-masthead-indicators-c1/candidates.md`) and
`git diff 6a48ff2d 2e678971^`:

- All five were one-line edits of 6–7-line blocks (`UsageInfo`: 3 of 6): the plan renamed
  "connection status" → "connection health dot" or deleted a reference to the removed `model`
  field. Under the judge's guard-only rule a module header cannot survive, so the verdicts
  were correct for the rule; the rule was the cause.
- `strip.go:114` set a block's `Previous` from `d.removedComments(path)` — every comment line
  the branch removed in the file. `masthead.ts#1`'s `previously:` fence showed the module
  header's old first line plus the nine-line `renderUsageModel` doc comment deleted with its
  function elsewhere in the file.

## Change

- `gitdiff.go`: the parser keeps hunks (new-file start, count, removed lines);
  `removedComments(path, start, end)` returns only the hunks landing inside the block.
- `strip.go`: `edited` iff the branch added at most half the block's lines; otherwise `added`.
- `comment-judge.md`, `render.go`: an `edited` or `stale-ref` candidate is judged on truth,
  the guard test on `added` only.
- ADR `process-comment-pass-edited-comment-judged-on-truth`; `docs/features/comment-pass/spec.md`.

## Automated Checks

- `go test ./internal/commentpass/` — `TestStrip_EditedBlockIsWholeWithPrevious` (previous
  text is the block's own), `TestStrip_MajorityNewBlockIsAddedNotEdited`,
  `TestParseDiff_HunksAndRemovedIdents`.
- `make check`.
