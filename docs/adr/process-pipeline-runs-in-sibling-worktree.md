---
id: process-pipeline-runs-in-sibling-worktree
type: decision
status: accepted
date: 2026-09-26
summary: Every /orchestrate run lives in a sibling worktree on plan/<plan>, created by make worktree before the session starts; the primary stays on main for /land.
features: []
tags: [pipeline, user-decision]
files: [scripts/worktree.sh, Makefile, .claude/skills/orchestrate/SKILL.md, .claude/skills/land/SKILL.md, .claude/skills/plan-work/SKILL.md]
tests: []
refs: [kb:adr/worktree-muster-owned-sibling-path, kb:adr/worktree-merge-queue-daemon-driven, kb:fact/worktree-flag-defaults, kb:lesson/worktree-shares-git-config, kb:adr/process-playwright-runs-exclusive-on-machine, plans/worktree-lifecycle/spec.md]
supersedes: []
---
**Context.** The pipeline ran every plan on `plan/<name>` inside the one primary checkout, so two plans could not be worked at once, and a live main session forced code work into a hand-made tree that was left behind. The product already decided that Muster creates a sibling tree before the session (kb:adr/worktree-muster-owned-sibling-path) and that merge handling is scripted plumbing with an LLM only for judgment, this repo's rules being an adapter (kb:adr/worktree-merge-queue-daemon-driven). Hooks and subagents key off the directory a session started in, so a session cannot move into a tree.

**Options.** (A) A persistent orchestrator session steering the others — the control half the merge-queue ADR already dropped. (B) `claude --worktree` — nests the tree and locks it with a dead pid (kb:fact/worktree-flag-defaults). (C) The tree exists first: `make worktree NAME=<plan>` from the primary commits the planning-session edits onto `plan/<plan>`, adds `../<repo>-<plan>`, copies the gitignored local files and builds; orchestrate pre-flight only asserts it is there; `/land` runs from the primary and removes the tree before deleting the branch.

**Decision.** C, the developer's choice. Merging stays `/land`'s serial job; `make worktrees` keeps A's observation half as a script — which plan branches touch the same files. Dirty files outside the planning set stay in the primary, reported not refused: a separate tree cannot fold them into an agent's commit. `worktree-rm` refuses a dirty tree, a branch holding content `main` lacks (the merge-tree test — a squash never empties `main..plan/x`), or a tree a `claude` still has as cwd. Never `git config user.*` in a tree (kb:lesson/worktree-shares-git-config).

**Consequences.** Two pipelines run side by side, their sweeps serialised by the gate lock (kb:adr/process-playwright-runs-exclusive-on-machine). Open: `plan/<name>` here versus the product spec's unprefixed `<name>` — one adapts when that feature lands; `make run` keeps its fixed port: one dev daemon at a time.
