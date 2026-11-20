---
id: process-comment-pass-moved-comment-judged-on-requirement
type: decision
status: accepted
date: 2026-11-20
summary: A comment that came with code the branch moved is labelled moved and kept when it guards or a repository rule requires it there; otherwise dropped.
features: [comment-pass]
tags: [pipeline]
files: [internal/commentpass/moved.go, internal/commentpass/strip.go, internal/commentpass/render.go, .claude/agents/comment-judge.md]
tests: [TestStrip_CommentMovedFromMainIsMovedNotAdded]
refs: [kb:adr/process-comment-pass-edited-comment-judged-on-truth, kb:lesson/comment-pass-reads-rewritten-main-comment-as-added, plan:better-terminal, plans/better-terminal/review.maintainability.cycle1.md]
supersedes: []
---
**Context.** On `better-terminal` the daemon moved the shell registry out of `shells.go` into a
new `shellregistry.go`. Every comment that travelled with it was new to its file, so `strip`
labelled it `added` and the judge put it to the guard test. Cycle 1 dropped all of them,
including the notes naming which mutex guards `activeIDs` and which code writes it — notes
`docs/conventions.md` § Design requires at the declaration. The maintainability reviewer caught
the loss; the orchestrator restored them by hand and moved 17 dropped main-origin blocks back to
keep in cycle 2. `kb:lesson/comment-pass-reads-rewritten-main-comment-as-added` asks the
orchestrator to check drops against `git show main:<file>`, which finds nothing for a file that
did not exist on `main`.

**Decision.** `strip` labels an otherwise-`added` block `moved` when every one of its lines
stands in a single file of the merge base, and names that file. The judge keeps a `moved` block
when it guards (the `added` test) or, failing that, when one of two repository rules requires it
at that spot: shared state naming its guard and writers (`docs/conventions.md` § Design), or a
route comment citing its anchor (`internal/server/CLAUDE.md`). Everything else is dropped — the
move is the chance to shed `main`'s explaining comments, unlike an `edited` block, which keeps
on truth alone.

**Consequences.** A refactor that moves code no longer loses the docs a rule requires, and no
longer keeps every explaining comment it carries. Measured on the cycle-1 candidates relabelled
as `strip` now labels them: the judge kept the `locks`, `mu` and `activeIDs` notes and the
`spawn` guard, and dropped the restating docs; the `shellTmuxTimeout` doc kept on one run and
dropped on another, a guard-test judgement call. A rule not named in the judge's list is not
known to it; adding one is an edit to `.claude/agents/comment-judge.md` § Moved candidates.
