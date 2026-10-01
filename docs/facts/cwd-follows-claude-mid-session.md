---
id: cwd-follows-claude-mid-session
type: fact
status: active
date: 2026-10-01
summary: Hooks' cwd and the status line's cwd/current_dir follow a mid-session cd inside the project or an /add-dir directory; a cd elsewhere resets to the root.
features: [ingest, lifecycle]
tags: [claude-code-format]
files: []
tests: []
refs: [test/rig/captures/capture-3.jsonl, kb:fact/cwd-changed-hook, kb:fact/enter-worktree-moves-project-dir]
verified: 2.1.286..2.1.286
guard: none
---
A session's working directory is not fixed at launch. After a `cd` — typed as a `!` shell
command or run by Claude's own Bash tool — the next hooks (`PostToolUse`, `Stop`, …) carry the
new `cwd`, and so do the status line's `cwd` and `workspace.current_dir`.
`workspace.project_dir` stays the launch directory. The one exception is a worktree entered
mid-session, which moves it too (kb:fact/enter-worktree-moves-project-dir).

Where the shell may go:

- **Inside the project** (`repo/sub`, then `cd ..` back): `cwd` follows.
- **An `/add-dir` directory**: `cwd` follows, even into a different git repo on a different
  branch. `workspace.added_dirs` lists the added directory as typed. Note that its first entry
  is the project in its unresolved `/tmp/…` spelling, while `cwd` is `/private/tmp/…`.
- **Anywhere else**: the command runs, then the TUI prints `Shell cwd was reset to <project
  root>`. Every later event reports the project root. If the shell was in a subdirectory
  before, it does not go back there.

So a card that shows only the launch directory goes stale, and so does the branch read from
that directory: an added directory can be a different repo.

Evidence: probe instance 3, 2026-10-01, 2 interactive sessions (`50447df0`, `8b5e8581`): 3 in-project
`cd`s, 2 outside-project resets, 1 `/add-dir` `cd` into a repo on branch `otherbranch`.
