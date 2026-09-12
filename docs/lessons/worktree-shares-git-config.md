---
id: worktree-shares-git-config
type: lesson
status: active
date: 2026-09-10
summary: A scratch git config user.* inside a worktree of this repo landed on the real repo; two commits reached main as a test identity.
features: []
tags: [pipeline, security]
roles: [daemon-impl, daemon-tests, e2e-specs, orchestrator]
files: [.githooks/pre-commit]
tests: []
refs: [CLAUDE.md, .githooks/pre-commit, docs/conventions.md, kb:adr/process-main-ruleset-blocks-deletion-and-force-push-only]
---
**What happened.** A pipeline agent ran `git config user.email test@example.invalid` inside a scratch `git worktree` of this repo to author a fixture commit. Worktrees share `.git/config`, so the override landed on the real repo and stayed after the worktree was removed.

**Cost.** Two commits reached `main`, and a release, authored as `test <test@example.invalid>`. The main ruleset blocks force-push, so they stand in history.

**What changed.** Never `git config user.*` in this repo or any worktree of it. A scratch repo is `git init` in a temp dir, or every command passes `-c user.name=… -c user.email=…`. `.githooks/pre-commit` refuses to commit while a repo-local `[user]` override exists, so the rule is mechanical rather than remembered.
