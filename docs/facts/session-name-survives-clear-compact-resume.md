---
id: session-name-survives-clear-compact-resume
type: fact
status: active
date: 2026-10-05
summary: A name survives /clear (onto the new session id), /compact and --resume, each SessionStart carrying it as session_title; --resume <id> --name X renames.
features: [rename, lifecycle]
tags: [claude-code-format]
files: []
tests: []
refs: [test/rig/captures/capture-3.jsonl, kb:fact/name-flag-reaches-title, kb:fact/clear-mints-new-session-id, kb:fact/resume-keeps-session-identity]
verified: 2.1.289..2.1.289
guard: none
---
A name set by `/rename` or by a hook carries across the session's own transitions (1/1 each):

- `/clear` mints a new session id (kb:fact/clear-mints-new-session-id), and the new id keeps
  the name. `SessionStart{source:"clear"}.session_title` carries it, the registry keeps
  `nameSource` and `nameSince`, and status posts on the new id read it.
- `/compact` keeps it: `SessionStart{source:"compact"}.session_title` carries it, and so does
  every later status post.
- `--resume <id>` with no `--name` comes back under the last `/rename` name (the transcript's
  last `custom-title`).
- `--resume <id> --name X` renames on resume. `SessionStart{source:"resume"}.session_title`
  reads `X`, and the transcript gains a `custom-title` line for `X`.

On exit, Claude Code prints `claude --resume "<name>"`, so a name doubles as a resume handle.

Evidence: probe sessions s1/s6 (clear, resume), s2 (compact) and s3 (resume with `--name`) on
capture-3, 2026-10-05.
