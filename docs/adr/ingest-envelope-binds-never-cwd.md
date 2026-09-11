---
id: ingest-envelope-binds-never-cwd
type: decision
status: superseded
date: 2026-08-20
summary: SessionStart and status posts wrap their payload in an envelope naming the Muster session and pane; raw hooks route by session_id and never by cwd.
features: [ingest, lifecycle]
tags: [envelope, claude-code-format]
files: [internal/claudecode/ingest.go, internal/session/manager.go]
tests: [TestParseIngestBody_EnvelopedVsRaw, TestIngestRouting_EnvelopedSessionStartBindsThenRawHookRoutesByClaudeSessionID]
refs: [docs/history/spec-changelog.md, kb:fact/command-hooks-inherit-pane-env, kb:anchor/ingest.envelope]
supersedes: []
---
**Context.** A hook payload names Claude's session id and working directory but nothing Muster assigned. The daemon had to learn which Muster session a given Claude id belongs to without guessing.

**Options.** (A) Match events to sessions by working directory. (B) Have the command-wrapped SessionStart and the status-line script wrap their stdin in an envelope carrying a Muster session variable set on the pane at spawn plus the tmux pane id, establish the Claude-id-to-session map from that, and route raw http hooks through the map.

**Decision.** B. Two sessions in one directory are ordinary, so A is wrong by construction; the envelope rests on the pane environment being inherited by the wrapper, which a probe then confirmed.

**Consequences.** Events for an unknown Claude id are persisted unrouted and logged, never attached to a guessed session. The map is rebuilt from the session table on start. When every hook later became a wrapper, the superseding record made the envelope authoritative on every event.
