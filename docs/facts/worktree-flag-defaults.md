---
id: worktree-flag-defaults
type: fact
status: active
date: 2026-09-14
summary: claude --worktree nests the tree in the main checkout at .claude/worktrees/<name>, git-locked by a dead pid; an existing name is silently reused.
features: []
tags: [claude-code-format]
files: []
tests: []
refs: [kb:fact/worktree-create-hook-owns-path, kb:adr/worktree-muster-owned-sibling-path]
verified: 2.1.270..2.1.270
guard: none
---
With no `WorktreeCreate` hook configured, `claude -w/--worktree <name>` creates the tree **inside
the main working tree** at `<repo>/.claude/worktrees/<name>`, on a new branch `worktree-<name>`.
Omitting the name generates a random three-word one (observed: `tender-painting-steele`).

The session then runs there: every hook payload of that session reports `cwd` as the worktree
path. The **launching process's cwd does not move** — the parent shell's `$PWD` is unchanged.

Consequences measured in the scratch repo, both of which cost the parent checkout:

- `git status` in the main checkout reports the nested tree as untracked (`?? .claude/`); every
  `git add -A`, grep, build and test run there recurses into a full second checkout of itself.
- Each tree is `locked`, with the reason naming the creating session's pid
  (`claude session probe1 (pid 43351 start Mon Sep 14 17:07:16 2026)`). The lock outlives the
  process, so `git worktree prune` will not reap it and `git worktree remove` refuses:
  `fatal: cannot remove a locked working tree ... use 'remove -f -f' to override or unlock first`.

Other behaviour, same run: creation happens **before any API call** (it completed under an
unauthenticated `CLAUDE_CONFIG_DIR`, which then died at `Not logged in`), so it costs no tokens; a
dirty main working tree is no obstacle; re-using an existing name **silently reuses that tree**
rather than erroring (2/2 sessions started in `.../worktrees/probe1`); and a non-git directory
fails with `Error: Can only use --worktree in a git repository ... Configure a WorktreeCreate hook
in settings.json to use --worktree with other VCS systems.`

Evidence: probe instance 3, 2026-09-14, `test/rig/captures/capture-3.jsonl` (5 of 5 sessions).
