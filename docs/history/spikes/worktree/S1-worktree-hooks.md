# S1 — Native worktree hooks probe (measured 2026-09-06)

**Binary:** Claude Code **2.1.263** installed (pin is 2.1.246 — `docs/claude-code-pin.md`).
Three probe runs on rig instance 3 (`/tmp/muster-probe/instances/3`, port 8783, private
tmux socket); capture at `test/rig/captures/capture-3.jsonl` in the spike worktree
(gitignored). `~/.claude/settings.json` md5 verified unchanged after teardown. Cost: 3 Haiku
"say hi" turns; the first run failed before any API call.

**Question.** Do `WorktreeCreate`/`WorktreeRemove` fire (S2 spike saw neither), and what
does `--worktree` do? SPEC §4.2 prefers these over a bespoke worktree manager.

## Findings

1. **`WorktreeCreate` fires, and it is a blocking, response-bearing hook.** Payload:
   `{cwd, hook_event_name, name, session_id, transcript_path}` — `name` is the
   `--worktree <name>` argument. Claude Code expects the hook to *create* the worktree and
   return its path: command hooks echo it on stdout; http hooks must return
   `hookSpecificOutput.worktreePath`. Run 1 (http hook, 200 empty body) failed with
   `Error creating worktree: WorktreeCreate hook failed: hook succeeded but returned no
   worktree path` and **no session started**. So a registered create hook is not an
   observer — it *is* the creator. The daemon's existing command-wrapper hooks (m4) can
   fill this role: POST to musterd, print the path musterd returns.
2. **Run A (command hook that `git worktree add`s and echoes the path): full success.**
   Session ran inside the returned path; `SessionStart`, `UserPromptSubmit`, `Stop`,
   `SessionEnd` all reported `cwd` = the worktree. `WorktreeCreate` itself reports
   `cwd` = the original repo, and its `transcript_path` is keyed by the *repo* project dir
   while every later event's is keyed by the *worktree* project dir — the transcript
   location moves during launch.
3. **Run B (no create hook): default behaviour.** Worktree at
   `<repo>/.claude/worktrees/<name>` on branch `worktree-<name>`, **locked** with reason
   `claude session <name> (pid <N> start <date>)`. That lock reason is a free
   worktree→pid ownership record the daemon can read via `git worktree list --porcelain`.
   Headless (`-p`) exit left the worktree in place and locked with a dead pid;
   `WorktreeRemove` did **not** fire.
4. **`WorktreeRemove` fires only on interactive exit** (`/exit`; `SessionEnd.reason` =
   `prompt_input_exit`), after `Stop` and before `SessionEnd`, with payload
   `{cwd, hook_event_name, prompt_id, scratchpad_dir, session_id, transcript_path,
   worktree_path}`. No keep/remove prompt appeared (the tree was clean). With an http hook
   answering 200 empty, the worktree was **not** removed — removal, like creation, is
   delegated to the hook when one is registered. `-p` runs never fire it (2 of 2).
5. `--tmux` exists ("Create a tmux session for the worktree, requires --worktree"; iTerm2
   panes by default, `--tmux=classic` for tmux). Not probed; Muster owns its own tmux.

## Consequences for SPEC §4.2

- Muster can own worktree creation **through** Claude Code's own flag: launch with
  `--worktree <name>`, and the daemon's `WorktreeCreate` handler creates the tree (sibling
  path, naming policy, **setup scripts** — copy `.env`, install steps — all run before the
  path is returned, so the session's first prompt already sees a usable tree). This is the
  "prefer native hooks" preference realised without Claude Code dictating the layout.
- Ownership: `worktree_path` from the hooks plus the lock-reason pid; the `worktree` table
  gets written by the hook handler, not by a launch-form field.
- Cleanup: the daemon's `WorktreeRemove` handler decides (remove if clean, keep and flag if
  dirty/unpushed) — and it must also sweep trees left by headless exits and crashes, since
  the hook does not fire for those. Reconcile-on-start is the natural place.
- Unverified: behaviour when the tree is dirty at `/exit` (does a prompt appear? does the
  hook still fire?), and whether the http flavour of `WorktreeCreate` accepts
  `hookSpecificOutput.worktreePath` — only the command flavour was exercised, and Muster's
  hooks are command wrappers anyway.
