---
id: cwd-changed-hook
type: fact
status: active
date: 2026-10-01
summary: CwdChanged fires (http and command) after a shell cd with old_cwd/new_cwd; not on EnterWorktree/ExitWorktree, and a reset cd's new_cwd is wrong.
features: [ingest]
tags: [claude-code-format]
files: []
tests: [TestInstalledBinaryCarriesInterfaceStrings]
refs: [test/rig/captures/capture-3.jsonl, kb:fact/cwd-follows-claude-mid-session]
verified: 2.1.286..canary
guard: TestInstalledBinaryCarriesInterfaceStrings
---
`CwdChanged` is a hook event: it reaches both an http hook and a `type:"command"` wrapper.
The payload is the common set
(`session_id`, `transcript_path`, `cwd`, `hook_event_name`, `prompt_id`, `scratchpad_dir`) plus
`old_cwd` and `new_cwd`:

```json
{"hook_event_name":"CwdChanged","cwd":"…/repo/sub","old_cwd":"…/repo","new_cwd":"…/repo/sub",
 "prompt_id":"…","session_id":"…"}
```

It fires once per shell `cd`, from a `!` command or Claude's Bash tool. For the Bash tool it
lands right after that tool's `PostToolUse`.

Two limits:

- **Worktree moves fire nothing.** `EnterWorktree` and `ExitWorktree` change `cwd` with no
  `CwdChanged` (0 of 2 entries, 0 of 1 exit). Only the tool's `PostToolUse.cwd` and later
  events show the move.
- **`new_cwd` can be wrong.** A `cd` outside the allowed directories fires `CwdChanged` with
  `new_cwd` naming the target. The shell is then reset to the project root, and no second
  `CwdChanged` reports that (2 of 2). In that payload `cwd` is already the project root,
  so read `cwd`, never `new_cwd`.

So hooks carry the working directory anyway; `CwdChanged` alone would miss worktree moves.
The rig's generated settings do not register this event, nor `PreModelSwitch`,
`PostModelSwitch` or `DirectoryAdded`, all of which the 2.1.286 bundle lists. The bundle's
hook-event list is `PreToolUse PostToolUse PostToolUseFailure PostToolBatch Notification
UserPromptSubmit UserPromptExpansion SessionStart SessionEnd Stop StopFailure SubagentStart
SubagentStop PreCompact PostCompact PreModelSwitch PostModelSwitch PermissionRequest
PermissionDenied Setup TeammateIdle TaskCreated TaskCompleted Elicitation ElicitationResult
ConfigChange WorktreeCreate WorktreeRemove InstructionsLoaded CwdChanged FileChanged
DirectoryAdded MessageDisplay`. `DirectoryAdded` was registered and did not fire on `/add-dir`
(0 of 1, registered only in the later session, so not measured against that).

Evidence: probe instance 3, 2026-10-01, sessions `8b5e8581` and `f0f21860`: 3 `CwdChanged` per
transport.

The guard checks only that the event and its two fields are still in the bundle. Production registers no `CwdChanged` hook, so no canary run can observe it.
