---
id: no-running-session-signal
type: fact
status: active
date: 2026-09-27
summary: Nothing stable says which Claude Code session ids are running: ~/.claude/sessions has no session id and transcripts are not held open.
features: [launch]
tags: [claude-code-format]
files: []
tests: []
refs: [plan:resume-and-dangerously-allow]
verified: 2.1.283..2.1.283
guard: none
---
With a session live in the probe:

- `~/.claude/sessions/` held `<pid>.json` for each running process of this version, with keys
  `peerToken`, `pidDomain` and `procStart` and no session id, beside a `<pid>.<hash>.key` file that
  looks like a credential. Neither maps a process to a session.
- `lsof` on the live session's transcript showed no process holding it open, and the process had
  nothing under `~/.claude/projects` open.
- The process argv is the launch command line: it names a session id only when started with
  `--resume <id>`.

So a session running outside Muster cannot be told apart from an ended one. Muster knows its own
running sessions from its rows.

Evidence: probe run A (2026-09-27). The `.key` file was never opened.
