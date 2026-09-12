---
id: worktree-merge-queue-daemon-driven
type: decision
status: accepted
date: 2026-09-01
summary: Worktree conflict handling is muster-core; the merge queue is a daemon state machine doing git plumbing, with an opt-in integration session for judgment only.
features: []
tags: [user-decision, deferred]
files: []
tests: []
refs: [docs/history/design/worktree-conflicts.md, kb:adr/launch-hybrid-mru-directory-memory, kb:adr/stack-git-and-gh-clis-not-go-git]
supersedes: []
---
**Context.** Several worktrees touch the same files without knowing about each other until merge time. Creating and assigning worktrees is the easy half; the hard half is landing them without wasted work. This repo's pipeline (plan branches, serial squash-merge landing, an Affected Files manifest per plan) is one consumer of whatever muster builds.

**Options.** (A) A cross-worktree manager in the daemon that steers each orchestrator mid-run. (B) A merge-time resolver session that runs the whole queue, as the land skill does today. (C) A daemon-driven queue (queued, rebasing, verifying, awaiting resolution or confirm, merging, done or failed) that does git plumbing itself and summons an integration session only for conflict resolution or a verify-failure diagnosis. (D) Partition files at plan time and refuse overlap.

**Decision.** C, Damian's decision in the research session. Conflict handling is muster-core and generic; this repo's rules are an adapter. The integration session is user opt-in at repo setup, summonable by default, persistent only as an opt-up. The queue never operates inside a live session's worktree; it works in its own after an ownership handoff. A's observation half survives as a conflict radar; its control half is dropped because steering a mid-pipeline orchestrator is fragile and anything lock-shaped risks stalls.

**Consequences.** Queue reliability is a daemon property, not an LLM one, and mechanics burn no tokens. Push policy, undo depth, integration-session details and build order stay open; the feature is parked until the worktree manager it depends on is specced, and nothing is built yet. The frozen research note holds the option analysis, the external survey and the experiment log.
