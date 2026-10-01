---
id: lifecycle-branch-refreshed-by-repo-poll
type: decision
status: accepted
date: 2026-10-01
summary: An alive session's branch and worktree flag are re-read from its launch directory on a 5 s repo poll plus a nudge, not from hooks or a file watcher.
features: [lifecycle, card-location]
tags: [state-machine]
files: []
tests: []
refs: [plan:stale-dirs-models-branches, plans/stale-dirs-models-branches/daemon-implementation.md]
supersedes: []
---
**Context.** The branch was read once at launch. A checkout made by Claude, the shell pane or
anything outside Muster left the card wrong for the session's lifetime. Only the first of
those fires a hook.

**Options.** (A) Re-read on hooks. This misses the shell pane and outside checkouts. (B) Watch
the git `HEAD` file. That needs a watcher dependency and per-repo handles. (C) Poll.

**Decision.** C. A poll at the liveness cadence (`-repo-poll`, default 5 s, `0` disables the
timer) runs for **alive** sessions only (the developer, 2026-10-01). It is also nudged
whenever Claude's reported directory changes, so the ↳ readout updates at once. Git runs
outside the session manager's lock. A missing launch directory skips the session for that
tick, so both `repo` and `claudeLocation` keep their last-known values (without a launch top
level, every directory inside a checkout would read as elsewhere); a dead session keeps its
`repo` (its `claudeLocation` is null while dead), including against a reading that was in flight when it died, even if it was resumed before
that reading landed (an in-memory death counter on the session tells a stale reading apart). With `-repo-poll 0` the poll still runs once at start, so a restarted daemon derives
`claudeLocation` from a persisted `claude_dir`, and then only on a nudge.

**Consequences.** `branch` and `is_worktree` are no longer immutable session fields. A
detached HEAD mid-session shows the folder name alone, the same as at launch.
