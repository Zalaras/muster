---
id: worktree-muster-owned-sibling-path
type: decision
status: accepted
date: 2026-09-14
summary: Muster creates worktrees itself as siblings of the checkout, per-repo overridable, and registers a WorktreeCreate hook so Claude-started trees land there too.
features: []
tags: [user-decision]
files: []
tests: []
refs: [kb:fact/worktree-flag-defaults, kb:fact/worktree-create-hook-owns-path, kb:adr/stack-git-and-gh-clis-not-go-git, kb:adr/launch-hybrid-mru-directory-memory, SPEC.md]
supersedes: []
---
**Context.** SPEC §3.2 said to "prefer Claude Code's native `--worktree` and worktree hooks over reimplementing", written before anything was measured. Speccing `worktree-lifecycle` forced the question, and a probe on 2.1.270 measured what native creation does (kb:fact/worktree-flag-defaults, kb:fact/worktree-create-hook-owns-path).

**Options.** (A) Native `--worktree`, adopting Claude's placement. (B) Muster runs `git worktree add` before spawning the pane and launches a plain `claude` there. (C) Muster registers a `WorktreeCreate` hook and lets Claude drive creation through it.

**Decision.** B as the primary path, plus C as a backstop — Damian's decision in the spec interview, 2026-09-14. Trees are **siblings** of the checkout (`../<repo>-<name>`) by default, overridable per repo; no central worktree root. A is rejected: it nests a second checkout inside the main working tree, so the parent's `git status`, `git add -A`, greps, builds and tests all recurse into it, and each tree is locked by a pid that has already exited, so `prune` skips it and removal needs `remove -f -f`. B keeps the path known **before** the pane is spawned — the pane cwd, session row, branch display, terminal and editor button all depend on it — and lets setup scripts run before `claude` starts. C exists because `--worktree` typed inside a session would otherwise create a tree Muster cannot see, in the location A was rejected for; Muster already writes project-scoped settings, so registering the hook is free.

**Consequences.** This supersedes the "prefer native `--worktree`" sentence in SPEC §3.2; its worktree-hooks half survives as C. Muster owns naming and branch creation, so collisions are Muster's to detect — warn in the dialog, fail the launch, never silently reuse as native does. The stored path is the single truth for tether and removal. Removal semantics, setup-script configuration and the status view are the spec's business.
