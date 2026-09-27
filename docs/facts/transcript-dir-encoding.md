---
id: transcript-dir-encoding
type: fact
status: active
date: 2026-09-27
summary: Transcripts live in ~/.claude/projects/<name>: the resolved path with each char outside A-Za-z0-9 and - made -, cut to 200 chars plus a hash.
features: [launch]
tags: [claude-code-format]
files: []
tests: []
refs: [plan:resume-and-dangerously-allow, kb:fact/transcript-session-lines]
verified: 2.1.283..2.1.283
guard: none
---
Claude Code keeps each session's transcript at `~/.claude/projects/<name>/<session_id>.jsonl`.
`<name>` is the session's working directory with symlinks resolved (`/tmp/…` becomes
`-private-tmp-…`), then every character outside `[A-Za-z0-9-]` replaced by one `-`: `.`, `_`,
space, `+`, `@` and a non-ASCII letter (`é`) each became a single `-`; case is kept.

The mapping is not one-to-one. `…/a.b` and `…/a-b` both wrote into `…-a-b`, so one folder can
hold several directories' sessions. Every `user`, `assistant` and `attachment` line carries the
real `cwd`, which tells them apart.

A name longer than 200 characters is cut to its first 200, then `-` and a six-character suffix
(`-a9ltme` for one 256-character path). The suffix's algorithm was not identified, so a long
name can be matched by its 200-character prefix but not computed.

Besides the `*.jsonl` sessions, a folder holds a `memory/` directory and, per session that ran
subagents, a `<session_id>/subagents/agent-*.jsonl` tree. Those are not sessions.

Evidence: nine zero-token runs (`CLAUDE_CONFIG_DIR` auth-failure induction, which still writes
the transcript) from directories named for each character class, 2026-09-27, plus the live
probe runs' `transcript_path` in capture-3.
