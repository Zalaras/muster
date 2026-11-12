---
id: scratchpad-dir-per-session-id
type: fact
status: active
date: 2026-11-12
summary: scratchpad_dir names <tmp>/claude-<uid>/<cwd>/<session_id>/scratchpad; /clear moves to a new one, --resume returns, -p sends null.
features: [reader, ingest]
tags: [claude-code-format]
files: []
tests: []
refs: [kb:fact/status-line-keys, kb:fact/hook-payload-fields, kb:fact/transcript-dir-encoding, kb:fact/resume-keeps-session-identity]
verified: 2.1.322..2.1.322
guard: none
---
The temporary directory Claude Code tells the model to write scratch files into (#121) is
named, as an absolute path, by `scratchpad_dir` on every hook and every status-line post of
an **interactive** session:

`/private/tmp/claude-<uid>/<encoded cwd>/<session_id>/scratchpad`

`<encoded cwd>` is the same encoding as the transcript folder (kb:fact/transcript-dir-encoding):
`/tmp/muster-probe/instances/1/repo` became `-private-tmp-muster-probe-instances-1-repo`.
`<session_id>` is the hook's `session_id`. A sibling `tasks/` folder holding background-task
`*.output` files appears beside `scratchpad/` once a session has run one.

Measured with one interactive session through a write, `/clear`, `/exit` and `--resume`, and two
`-p` sessions (`test/rig/captures/capture-1.jsonl`, lines 46–97):

- **Created at startup, empty.** The folder exists by the first status-line post, before any write.
  A write into it ran with no permission prompt in `manual` mode (the TUI said "Made 1 scratchpad
  edit"), while a write elsewhere did prompt.
- **`/clear` moves the session to a new folder.** `SessionEnd` named the old path,
  `SessionStart{source:"clear"}` and every post after it the new session id's path. The old
  folder and its file were kept.
- **`/exit` deletes nothing.** Both folders and the file survived the session ending.
- **`--resume <id>` returns to the original folder.** `SessionStart{source:"resume"}` named the
  first session's path, with its file still in it. The resumed launch also created an empty
  folder under a session id that no hook ever named, so listing the parent folder finds folders
  that belong to no session.
- **`-p` sends `scratchpad_dir: null`** on every hook (2 of 2 headless sessions, 16 hooks) and
  creates no folder; a model asked to write there guessed `~/.claude/scratchpad` instead.

The folders sit under the system temp directory, so macOS can remove them; older probe instances'
folders named in earlier captures were already gone. Not measured: whether a subagent's hooks
carry its parent's `scratchpad_dir`, and whether the folder follows a mid-session `cd` or
`EnterWorktree`.
