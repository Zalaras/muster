# Maintainability review: frontmatter

**Plan**: frontmatter
**Verdict**: approved
**Cycle**: 3
**Pack**: `kb: pack 10993 words (budget 8000)`, over budget (WARN)
**Scope**: 14 files from `git diff main...HEAD -- cmd internal web/src` (tests excluded), unchanged from cycle 2. This cycle's delta against the cycle-2 review commit (`b0bd83c..HEAD`) touches only two in-scope files, `web/src/features/reader.ts` and `web/src/style.css`, both comment-only. It also touches one test file, `internal/server/reader_test.go`, which is outside the diff. All three were read line by line. The other 12 files have not changed since cycle 2 approved their shape.

## Files

| File | Siblings opened | design: line | Size warnings | Result |
|------|-----------------|--------------|---------------|--------|
| web/src/style.css | the surrounding `.md table` rules | n/a (comment only this cycle) | n/a | pass (cycle 2 Minor 1 resolved) |
| web/src/features/reader.ts | reader/*.ts (cycle 1/2) | n/a (comment only this cycle) | filelen 609 (610 on main) | pass (cycle 2 Minor 1 resolved) |
| internal/session/manager.go | unchanged since cycle 2 | yes | filelen 1810 (1751 on main); funlen `rowToSession`/`sessionToRow` are untouched by this branch and have only shifted lines | pass |
| internal/server/{reader,readerwire,sessionwire}.go, internal/session/session.go, internal/store/session.go, web/src/{protocol.ts,reader/frontmatter.ts,reader/markdown.ts} | unchanged since cycle 2 | yes / n/a | protocol.ts filelen 970 (967 on main, the growth is comments); `InsertSession` funlen predates this branch and is untouched | pass |

**Cycle 2 Minor 1 is resolved.**
- The `style.css:1035-1041` comment now states only the current constraint. Auto table layout treats `width`/`max-width` as a hint, and `table-layout: fixed` turns the key column's 40% into a hard cap. The Playwright measurements and the reference to the review cycle are gone.
- The `reader.ts:449-451` comment now says only that the listing's plan is a fallback while `session` is unknown. It cites `kb:adr/reader-plan-sticky-once-named`, and the REQ-8/E5 history is gone.

## Issues

### Critical

### Major

### Minor

### Notes

1. **[note]** Cycle 2 Notes 1–6 still stand unchanged. Note 1 was the pre-existing check-then-act on `PlanPath` in `observeWrite`, and commit f8d4699 has now proposed it in `plans/frontmatter/proposed-backlog.md`. Note 2 was `os.Stat` under `Manager.mu`, and its stated reason still holds.
2. **[note]** The new `transcriptB` comment in `internal/server/reader_test.go:1068-1073` (test file, outside the diff) explains why the file is written for real by stating the current reason, with no history narration. `TestIngestRouting_StragglerFromBeforeAClearNeverMovesTranscriptOrPlan` has a funlen hit (46 statements), but that function predates this branch and this cycle did not change it.
