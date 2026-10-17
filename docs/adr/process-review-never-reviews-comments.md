---
id: process-review-never-reviews-comments
type: decision
status: accepted
date: 2026-10-17
summary: Reviewers neither request nor judge code comments, not even as a note; the comment pass alone owns them, and the orchestrator's drop-on-note route is retired.
features: [comment-pass]
tags: [pipeline, user-decision]
files: [.claude/skills/orchestrate/review-scale.md, .claude/agents/review-work.md, .claude/skills/orchestrate/SKILL.md, docs/conventions.md]
tests: []
refs: [kb:adr/process-comment-pass-owns-code-comments, kb:adr/process-comment-pass-drop-reaches-tests-and-css, plan:docs-search-bar, plans/docs-search-bar/review.cycle1.md, plans/docs-search-bar/review.cycle2.md]
supersedes: []
---
**Context.** kb:adr/process-comment-pass-owns-code-comments kept one review route for comments: a
reviewer's `[note]` naming a false or stale comment, answered by `commentpass drop`
(kb:adr/process-comment-pass-drop-reaches-tests-and-css widened its reach). In plan docs-search-bar
the maintainability reviewer went further: cycle 1 Minor 3 asked for a comment, citing conventions
§ Design ("shared state … says so where it is declared"); web-impl wrote it and the comment judge
dropped it in cycle 2, and three later cycles carried the disagreement as notes.

**Options.** (A) Keep the note-and-drop route and exempt shared-state declarations from the judge.
(B) Take comments out of review entirely.

**Decision.** B (the developer, 2026-10-17). No issue or note asks for, judges or cites a code
comment. The orchestrator no longer runs `drop` on a reviewer's note; the subcommand stays for
direct use. Conventions § Design's shared-state rule is met by the implementer's `design:` line,
not a code comment.

**Consequences.** A stale pre-existing comment the branch did not touch goes unflagged by review;
strip still catches comments naming an identifier the diff removed.
