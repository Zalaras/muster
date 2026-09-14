---
id: worktree-create-hook-owns-path
type: fact
status: active
date: 2026-09-14
summary: A WorktreeCreate hook takes over --worktree entirely: it must create the directory itself and print that path as its last stdout line.
features: []
tags: [claude-code-format]
files: []
tests: []
refs: [kb:fact/worktree-flag-defaults, kb:adr/worktree-muster-owned-sibling-path]
verified: 2.1.270..2.1.270
guard: none
---
`WorktreeCreate` and `WorktreeRemove` are hook events. When a `WorktreeCreate` hook is configured,
`--worktree` delegates creation to it completely — none of the defaults in
kb:fact/worktree-flag-defaults apply.

Payload (http, `POST /hook/WorktreeCreate`):

```json
{"session_id":"426499cd-…","transcript_path":"…/426499cd-….jsonl",
 "cwd":"/private/tmp/…/repo","hook_event_name":"WorktreeCreate","name":"probe1"}
```

`cwd` is the **repo** the session was launched from, and `name` is the requested worktree name
(the `--worktree` argument, or the generated one when none was given).

The hook must **create the directory itself** and return its path — the last line of stdout for a
`command` hook, `hookSpecificOutput.worktreePath` for http/callback. Returning nothing fails the
launch with `Error creating worktree: WorktreeCreate hook failed: hook succeeded but returned no
worktree path`. Returning a path that does not exist fails with `Error: worktree directory <path>
does not exist or is not a directory. The path came from a WorktreeCreate hook — the hook must
print the directory it created as the last line of its stdout.` Note the http flavour must still
return a body: the rig's capture server replies 200 empty, which reads as "no worktree path".

Verified end to end: a command hook running `git worktree add -b muster/mine <dest>` and writing a
`.env` into it yielded a session whose `SessionStart`, `UserPromptSubmit` and `SessionEnd` all
report `cwd` as `<dest>`, on branch `muster/mine`, unlocked, with the setup file in place. So the
hook owns the path, the branch name and any setup work, and the tree escapes both the nested
location and the stale lock.

`WorktreeRemove` did **not** fire when such a session ended (0 of 1); when it does fire is
unmeasured.

Evidence: probe instance 3, 2026-09-14, `test/rig/captures/capture-3.jsonl`.
