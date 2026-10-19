---
id: lifecycle-added-dirs-from-status-line-cleared-on-death
type: decision
status: accepted
date: 2026-10-19
summary: A session's added directories come from the status line's workspace.added_dirs, are emptied on every death, and carry a git reading from the repo poll.
features: [card-location, lifecycle]
tags: [claude-code-format, store]
files: []
tests: []
refs: [plan:see-added-dirs, kb:fact/added-dirs-in-status-line, kb:fact/resume-restores-model-and-mode-except-plan, kb:adr/lifecycle-branch-refreshed-by-repo-poll, "#93", "#101"]
supersedes: []
---
**Context.** The developer wants to see which directories a session has added (#93, #101). Two
signals exist (kb:fact/added-dirs-in-status-line): the `DirectoryAdded` hook, and the status line's
`workspace.added_dirs`. The list does not say which entries were added for the session only, and a
resume drops those while keeping the ones saved to settings.

**Options.** (A) The `DirectoryAdded` hook. (B) The status line's list, kept on a dead session as
last-known, like the branch. (C) The status line's list, emptied when the session dies.

**Decision.** C (the developer, 2026-10-19: "show none"). Every routed status post carrying the key
replaces the list, minus the launch directory, normalised like Claude's directory. Launch, resume
and every death empty it; `/clear` and a daemon restart keep it while alive. Each directory's
branch comes from the repo poll, and a missing reading never holds a directory back: it shows with
no branch until read. A is rejected because the hook misses `--add-dir` and settings directories
and does not re-fire after `/clear`; B because a dead card could show directories a resume will not
bring back.

**Consequences.** A resumed session sends its first status post before any prompt
(kb:fact/resume-restores-model-and-mode-except-plan), so the surviving entries return within
moments. The list persists in a new `session.added_dirs` column; the per-directory git readings do
not, and the start-up poll re-reads them.
