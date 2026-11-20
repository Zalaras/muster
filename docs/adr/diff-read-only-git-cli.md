---
id: diff-read-only-git-cli
type: decision
status: accepted
date: 2026-11-20
summary: The diff is read through the git CLI and never writes to the repository; a rename shows only as git reports it.
features: [diff]
tags: [security]
files: [internal/gitdiff/*.go, internal/gitutil/gitutil.go]
tests: [TestRead_NeverWritesTheRepository]
refs: [plan:diff-viewer, kb:adr/stack-git-and-gh-clis-not-go-git]
supersedes: []
---
**Context.** Git goes through its CLI (kb:adr/stack-git-and-gh-clis-not-go-git). Detecting an unstaged move as a rename would need an index holding the untracked files.

**Options.** (A) Read-only: diff tracked changes and list untracked files separately. (B) Build a temporary index, writing objects into the repository.

**Decision.** A: nothing refreshes the index, writes objects or takes optional locks. Porcelain `git diff` refreshes the index on a stat-only change even with `--no-optional-locks`, so tracked changes are read against a scratch copy of the index (`GIT_INDEX_FILE`).

**Consequences.** A staged `git mv` reads `old → new`; an unstaged move reads as a deletion plus an added file.
