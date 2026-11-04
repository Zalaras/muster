---
id: running-session-version-sources
type: fact
status: active
date: 2026-11-04
summary: A running session reports its own binary version (status line pre-prompt, registry, CLAUDE_CODE_EXECPATH) until relaunched; no hook carries one.
features: [connection, canary]
tags: [claude-code-format]
files: []
tests: []
refs: [kb:fact/status-version-matches-installed, kb:fact/session-registry-names-running-sessions, kb:fact/command-hooks-inherit-pane-env]
verified: 2.1.317..2.1.317
guard: TestRunningSessionReportsItsVersion
---
The version a running interactive session executes is the version of the binary it started
from. Launched through a `claude` symlink pointing at 2.1.317, then the symlink repointed to
2.1.318, the running session went on reporting 2.1.317 everywhere; a `--resume` of the same
session id and a fresh launch through the repointed symlink both reported 2.1.318.

Where the running version is visible:

- **Status line `version`** — on every post, including the posts an interactive session sends
  right after `SessionStart` and before any prompt (3 pre-prompt posts on startup, 1 on resume).
- **`~/.claude/sessions/<pid>.json` `version`** — matches the status line.
- **`CLAUDE_CODE_EXECPATH`** in the environment Claude gives its child processes (so command
  hooks and the status-line script inherit it): the absolute path of the versioned binary,
  e.g. `…/.local/share/claude/versions/2.1.318`. Claude sets it itself; with it unset in the
  pane it was still present.
- **Transcript lines' `version`** — per line, written only on activity, so a resumed transcript
  mixes versions (27 lines at 2.1.317, 14 at 2.1.318 in one file).

Where it is not: no hook payload carries a version (`SessionStart` keys: `cwd`,
`hook_event_name`, `model`, `scratchpad_dir`, `session_id`, `source`, `transcript_path`);
HTTP hooks send `User-Agent: axios/1.15.2`, not a Claude version; `claude agents --json` rows are
`{cwd, kind, name, pid, sessionId, startedAt, status}`.

The guard covers the single-binary half: the pre-prompt status-line `version` on a fresh start
and a resume, and no hook carrying one. The binary swap needs two installed versions.

Evidence (the 2.1.318 side is not yet canary-verified, so `verified` stops at 2.1.317): probe instance 3, 2026-11-04, sessions `7f223f32` (startup on 2.1.317, resume on
2.1.318) and `fb0117f0` (startup on 2.1.318), launched through a private symlink in the
instance directory; the developer's `~/.local/bin/claude` was not touched. Raw capture (local
only, not in git): `capture-3.jsonl`, from line 2115.
