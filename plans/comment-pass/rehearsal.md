# Comment pass rehearsal — 2026-10-06

Replayed `c8abb76` (fix(launch): check models when New Session opens; write hooks
atomically — 764 added production lines, 282 of them comment lines) on a scratch branch
`plan/cp-rehearsal` cut at `c8abb76~1`, via `git cherry-pick --no-commit`, so the index held
the whole commit staged the way a pipeline worktree holds a peer's staged files. The binary
was built from `plan/comment-pass`. No pipeline ran; the judge was spawned by hand as a
`general-purpose` agent carrying `comment-judge.md`'s body, once per model.

## strip

```
strip: 65 candidates in 10 files (56 added, 9 edited, 0 stale-ref; 0 already kept)
```

64 own-line blocks, 1 trailing segment. `git diff --stat` after strip: 313 deletions, 8
insertions — the insertions are gofmt re-aligning struct fields whose neighbour lost a
trailing comment. `candidates.md` was 3,511 lines (140 KB); a judge reads it in two `Read`
calls.

## judge

| Run | Model | Rule | Kept | Dropped | Survival |
|---|---|---|---|---|---|
| 1 | Haiku | first draft ("keep only if a reader would break the code") | 55 | 10 | 85% |
| 2 | Haiku | guard-not-explanation, reason names the edit | 14 | 51 | 22% |
| 2 | Sonnet | same | 6 | 59 | 9% |

Run 1 dropped only signature restatements and kept every doc comment that carried a
rationale; its reasons read "non-obvious", "critical invariant", "worth noting". The rule
was rewritten to the explain-versus-guard test with the reason form "Without it a reader
would `<edit>`; that breaks `<what>` at `<line>`" and three keep/drop pairs from this run as
worked examples (commit 2a4ddd9d).

Run 2, Sonnet's six keeps, all guards with a concrete wrong edit: the wrapper script's
`0o700` mode (a reader widens it and exposes the token), `fsync` before rename (deleted as
redundant), `AtomicWriteFile` under a per-session lock that does not serialise two sessions
in one directory, `context.WithoutCancel` on a shared model check, removing only this call's
inflight entry under a newer generation, and capturing a store generation before an
`await`. Five of the six were also in Haiku's fourteen; Haiku's other nine are "could
drift" and "might duplicate" explanations. The definition pins `model: sonnet` on this
measurement.

Verdict files: `rehearsal/verdicts-haiku-v1.json`, `rehearsal/verdicts-haiku-v2.json`,
`rehearsal/verdicts-sonnet-v2.json`.

## apply, verify, drop

With Sonnet's verdicts:

```
apply: cycle 1 — 65 candidates, 6 kept, 59 dropped; ledger plans/cp-rehearsal/comment-pass.json
verify: 6 added comment blocks, all kept in plans/cp-rehearsal/comment-pass.json
```

The commit held the ten touched files plus the ledger and nothing else; the 67 cherry-picked
entries stayed staged and uncommitted. `go build ./...` green. `git diff c8abb76` showed
only the dropped comments plus the gofmt re-alignments.

A comment appended and committed by hand:

```
commentpass: 1 of 7 added comment blocks are not ledger keeps — run the comment pass:
  internal/claudecode/modelcheck.go:129: // late rehearsal comment
```

`drop cp-rehearsal internal/claudecode/modelcheck.go:129` removed it, committed the file
and the ledger (`by: orchestrator`), and `verify` passed again. A second `strip` reported
`0 candidates (6 already kept)`.

## defects found and fixed here

- `apply` and `drop` refused to commit because the index held files outside the pass. The
  staged-set check assumed a clean index; a pipeline worktree never has one. Commits now go
  by pathspec and the check reads the commit afterwards (commit e50925db, test
  `TestApply_LeavesUnrelatedStagedFilesStaged`).
- The first judge rule let Haiku keep 85%; see above.
