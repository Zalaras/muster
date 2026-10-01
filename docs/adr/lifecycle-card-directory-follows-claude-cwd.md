---
id: lifecycle-card-directory-follows-claude-cwd
type: decision
status: superseded
date: 2026-10-01
summary: A card's directory and branch follow the working directory Claude Code reports, not the launch directory; session identity still keys on the tmux target.
features: [lifecycle, ingest]
tags: [claude-code-format, user-decision]
files: []
tests: []
refs: [kb:fact/cwd-follows-claude-mid-session, kb:fact/cwd-changed-hook, kb:fact/enter-worktree-moves-project-dir]
supersedes: []
---
**Context.** The card shows the directory a session was launched in, and the branch read from
it. The backlog asked whether that should follow Claude's working directory, and said it should
if Claude reports the directory moving. The 2026-10-01 probe (2.1.286) showed that it does
move. A shell `cd` inside the project or into an `/add-dir` directory (which can be another
repo) and `EnterWorktree`/`ExitWorktree` all change the `cwd` on every later hook and the
status line. A `cd` elsewhere is reset to the project root.

**Options.** (A) Keep the launch directory. (B) Show the directory Claude reports, and the
branch of that directory.

**Decision.** B. This is the developer's conditional from the backlog, now met. The directory
is display state only. Identity stays on the tmux target and binding stays on the envelope, so
a session moving into another session's directory changes nothing about routing. Which signal
carries the directory is the plan's choice. The constraints are in the facts:
`CwdChanged` misses worktree moves and reports the wrong `new_cwd` on a reset `cd`, while every
hook's `cwd` and the status line's `workspace.current_dir` are right.

**Consequences.** A card can show a directory and branch other than the launch directory. That
includes a worktree under `.claude/worktrees/` or a different repo added with `/add-dir`.
Anything that today reads the launch directory as "where the session is" needs reviewing in the
plan. Examples are the docs reader's file root, past-session lookup and the
shell surface's start directory.
