---
id: added-dirs-in-status-line
type: fact
status: active
date: 2026-10-16
summary: Status-line workspace.added_dirs lists every added directory from any source, led by the launch dir; DirectoryAdded fires only for /add-dir.
features: [ingest]
tags: [claude-code-format]
files: []
tests: [TestAddedDirsInStatusLine, TestInstalledBinaryCarriesInterfaceStrings]
refs: [test/rig/captures/capture-0.jsonl, kb:fact/status-line-keys, kb:fact/cwd-changed-hook, "#93", "#101"]
verified: 2.1.301..canary
guard: TestAddedDirsInStatusLine
---
Every status-line post carries `workspace.added_dirs`, the session's full directory list. It
updates in the post right after an `/add-dir`. Three things to know when reading it:

- **The first entry is the launch directory itself**, so a session with nothing added still has
  one entry. Entries keep the path as typed, unresolved: `/tmp/…/repo` where
  `workspace.project_dir` reads `/private/tmp/…/repo`. Drop the entry that matches the project
  directory to get the directories that were actually added.
- **It covers every source.** Directories from `/add-dir`, from the `--add-dir` launch flag and
  from `permissions.additionalDirectories` in settings all appear. Observed order: the launch
  directory, then settings, then the flag (one session), and `/add-dir` entries in the order
  they were added. Flag entries and `/add-dir` entries were never seen in the same session.
- **It is the live list.** It survives `/clear` (the new `session_id`'s first post has the same
  list). A `--resume` loses the directories that `/add-dir` added for that session only, and
  keeps the ones it saved to settings.

The `DirectoryAdded` hook does fire on 2.1.301. kb:fact/cwd-changed-hook did not measure it,
because the event was not registered when that `/add-dir` ran. It reaches both transports. The
payload is the common set plus `directory` (as typed) and `source`:

```json
{"hook_event_name":"DirectoryAdded","directory":"/tmp/…/extraA","source":"slash_command",
 "cwd":"…/repo","prompt_id":"…","session_id":"…","transcript_path":"…","scratchpad_dir":"…"}
```

It fires only for `/add-dir`, with `source: "slash_command"` whichever of "for this session" or
"remember this directory" was picked. It does not fire for directories from the `--add-dir` flag
or from settings at startup or on resume, and it does not re-fire after `/clear`. So the hook
alone misses directories the status line shows. The transcript has only the `/add-dir` echo
as user text.

Evidence: probe instance 0, 2026-10-16. Session `1289b2cc` ran one `/add-dir` per option
(2 `DirectoryAdded` per transport), then `/clear` (`008f26d7`) and `--resume`. Session
`a4c781cc`, launched with `--add-dir`, fired none.
