---
id: comment-pass-reads-rewritten-main-comment-as-added
type: lesson
status: active
date: 2026-10-26
summary: A rewrite of a comment that exists on main reaches the judge as added, so the why-test can delete a doc a reviewer or a CLAUDE.md rule requires.
features: []
tags: [pipeline]
roles: [orchestrator]
files: [tools/commentpass/**]
tests: []
refs: [plan:remove-unread-right-click-1, plans/remove-unread-right-click-1/comment-pass.json, plans/remove-unread-right-click-1/review.cycle2.md]
---
`commentpass strip` labelled the rewritten `actionEnabled` and `Session.Unread` docs, both on `main`, as `added`. The judge dropped the first, losing a doc `main` had, and would have dropped the second, which review cycle 2 had required, plus two anchor citations `internal/server/CLAUDE.md` requires. Before `apply`, the orchestrator reads every `drop` of a block that exists on `main` (`git show main:<file>`) or that a review issue or a CLAUDE.md rule requires, and moves it to `keep` with that reason.
