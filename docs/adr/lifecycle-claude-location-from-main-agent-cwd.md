---
id: lifecycle-claude-location-from-main-agent-cwd
type: decision
status: accepted
date: 2026-10-01
summary: Claude's location is read from every main-agent hook's cwd and the status line's working directory; never CwdChanged's target and never subagent-marked events.
features: [lifecycle, ingest, card-location]
tags: [claude-code-format]
files: []
tests: []
refs: [plan:stale-dirs-models-branches, kb:fact/cwd-changed-hook, kb:fact/cwd-follows-claude-mid-session, kb:fact/enter-worktree-moves-project-dir, kb:fact/hook-delivery-best-effort]
supersedes: []
---
**Context.** Three signals carry Claude's working directory: the `CwdChanged` hook, the `cwd`
on every hook, and the status line's `workspace.current_dir`. `CwdChanged` misses worktree
moves and names the wrong directory on a reset `cd` (kb:fact/cwd-changed-hook). A subagent's
`cwd` is unmeasured, and one with worktree isolation could report its own tree.

**Options.** (A) Register `CwdChanged`. (B) Read the `cwd` every hook already carries, plus the
status line's working directory. (C) B, ignoring subagent-marked events.

**Decision.** C. No hook is added. An absent or empty value changes nothing. Last-applied
wins: an unordered straggler can briefly revert the reading until the next event, which is
accepted, not guarded.

**Consequences.** Launch and resume clear the recorded directory, because Claude restarts in
the launch directory.
