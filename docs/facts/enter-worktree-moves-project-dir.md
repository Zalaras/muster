---
id: enter-worktree-moves-project-dir
type: fact
status: active
date: 2026-10-01
summary: EnterWorktree moves cwd and project_dir into the worktree and adds a status-line worktree object with its branch; launch-time hooks keep firing there.
features: [ingest, lifecycle]
tags: [claude-code-format]
files: []
tests: []
refs: [test/rig/captures/capture-3.jsonl, kb:fact/cwd-changed-hook, kb:fact/worktree-flag-defaults]
verified: 2.1.286..2.1.286
guard: none
---
Claude's `EnterWorktree` tool (no `WorktreeCreate` hook configured) creates
`<repo>/.claude/worktrees/<name>` on branch `worktree-<name>`. It then moves the session into
it. `PostToolUse(EnterWorktree)` and every later hook carry the worktree as `cwd`. The status
line moves both `cwd` and `workspace.project_dir` there, unlike a plain `cd`
(kb:fact/cwd-follows-claude-mid-session), and gains a key:

```json
"worktree": {"name":"probewt","path":"…/repo/.claude/worktrees/probewt",
             "branch":"worktree-probewt","original_branch":"main","original_cwd":"…/repo"}
```

`ExitWorktree` (action `keep`) moves everything back: the next status post has the launch
directory as `project_dir` and no `worktree` key. No `CwdChanged` fires either way
(kb:fact/cwd-changed-hook).

The settings loaded at launch keep working in the worktree. With the hooks only in a
gitignored `.claude/settings.local.json`, so absent from the worktree checkout, a prompt sent
after `EnterWorktree` still produced `UserPromptSubmit`, `Stop` and status posts (1 of 1). The
worktree is left locked (`claude session <name> (pid …)`) after the session exits.

The bundle's status-line builder also has conditional `agent{name}`, `remote{session_id}`,
`pr{number,url,review_state,kind}` and `vim{mode}` keys, none seen in these captures.

Evidence: probe instance 3, 2026-10-01, sessions `8b5e8581` (enter + exit, tracked settings)
and `f0f21860` (enter, local-only settings).
