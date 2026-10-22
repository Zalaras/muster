---
id: process-session-enters-worktree-in-place
type: decision
status: accepted
date: 2026-10-22
summary: A pipeline run lives in a sibling worktree that the same session enters with EnterWorktree; no second session is launched there.
features: []
tags: [pipeline, user-decision]
files: [scripts/worktree.sh, Makefile, .claude/skills/orchestrate/SKILL.md, .claude/skills/fix/SKILL.md, .claude/skills/land/SKILL.md, .claude/skills/plan-work/SKILL.md, .claude/skills/orchestrate/scripts/subagent-stop-hook.sh]
tests: []
refs: [kb:adr/worktree-muster-owned-sibling-path, kb:fact/enter-worktree-moves-project-dir, kb:fact/cwd-follows-claude-mid-session, kb:fact/worktree-flag-defaults, kb:adr/process-playwright-runs-exclusive-on-machine]
supersedes: [process-pipeline-runs-in-sibling-worktree]
---
**Context.** The superseded decision put every pipeline run in `../<repo>-<plan>` on
`plan/<plan>` and required a fresh session started there, because hooks and subagents keyed off
the launch directory. That cost a hand-off on every run. Two facts change the premise: a plain
`cd` outside the project is reset after each command (kb:fact/cwd-follows-claude-mid-session),
but `EnterWorktree`, given the `path` of a tree in `git worktree list`, moves the session's cwd
and project directory into it and every later hook fires there
(kb:fact/enter-worktree-moves-project-dir). The developer asked, 2026-10-22, that a session be
able to check out a worktree and keep going.

**Options.** (A) Keep the second session. (B) `cd` into the tree — reset, so not available.
(C) `make worktree NAME=<plan>` from the primary, then `EnterWorktree` with the tree's path in
the same session; `ExitWorktree` with `keep` returns to the primary for `/land`.

**Decision.** C, the developer's choice. The tree is still the sibling `make worktree` builds —
never `EnterWorktree` with a `name`, which nests a locked tree inside the checkout
(kb:fact/worktree-flag-defaults). The pre-flight checks are unchanged: toplevel ends in
`<repo>-<plan>`, HEAD is `plan/<plan>`, the common dir is not `.git`. Every agent prompt's
`Project root:` is the tree and every script runs from the tree's copy. The `SubagentStop` hook
reads the payload's `cwd` before `CLAUDE_PROJECT_DIR`, so the comment check reads the tree the
agent worked in. `/land` runs from the primary: a session that entered the tree leaves it first.

**Consequences.** `/plan-work`, `/orchestrate` and `/fix` create and enter the tree themselves
instead of stopping. `worktree-rm`'s live-session refusal still catches a session launched in
the tree. Two pipelines side by side and the gate lock are as before
(kb:adr/process-playwright-runs-exclusive-on-machine).
