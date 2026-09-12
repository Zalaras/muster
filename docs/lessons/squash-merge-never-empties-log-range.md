---
id: squash-merge-never-empties-log-range
type: lesson
status: active
date: 2026-08-31
summary: git log main..plan/<plan> showed 27 commits ahead on an already-landed branch, because a squash creates a new commit; 'something to land' is a tree test.
features: []
tags: [pipeline]
roles: [orchestrator]
files: []
tests: []
refs: [plan:issue-capture, .claude/skills/land/SKILL.md]
---
**What happened.** The land skill checked that a branch had something to land with `git log main..plan/<plan>`. An already-landed branch still showed 27 commits ahead, because a squash-merge creates a new commit on `main` rather than adding the branch's commits to its ancestry; that range never empties.

**Cost.** A landed plan looked landable, one wrong answer away from a double merge.

**What changed.** The check is a tree test, `git merge-tree` against `main` producing no change, never the log range; the skill says so and why.
