---
id: surfaces-shell-spawn-http-then-attach-ws
type: decision
status: accepted
date: 2026-09-05
summary: A shell is spawned lazily by an HTTP post and attached over a second socket that never spawns, so a spawn failure has a body the dashboard can render.
features: [surfaces, connection]
tags: [envelope, tmux]
files: [internal/server/shells.go, internal/server/terminal.go, web/src/features/surfaces.ts]
tests: [TestHandleShellTerminal_AttachOnlyNeverSpawns, TestHandleShellTerminal_NoShellIs409NoShell, TestHandleCreateShell_SpawnFailureIs500ShellSpawnFailed, TestShellRegistry_ConcurrentEnsureOnlySpawnsOnce]
refs: [docs/history/protocol-changelog.md, docs/history/spec-changelog.md, plan:plain-terminal-session, kb:anchor/sessions.shell, kb:anchor/terminal.shell-ws, kb:adr/connection-commands-http-ws-push-only, kb:adr/surfaces-shell-is-attach-target-not-session]
supersedes: []
---
**Context.** The shell needed creating on first use and attaching thereafter. A browser cannot read the status or body of a WebSocket upgrade that fails, so a socket that also spawned would fail silently when the directory was missing or the shell could not start.

**Options.** (A) One socket that spawns the shell if absent and attaches. (B) An HTTP post that spawns idempotently and reports created or existing with a proper error body, followed by a socket that attaches only and refuses when no shell exists.

**Decision.** B, in keeping with the rule that commands travel over HTTP and sockets carry streams.

**Consequences.** A missing directory or a spawn failure reaches the user as a rendered error rather than a closed socket. Concurrent first requests spawn once. The socket's refusal when no shell exists is its own error code, so a dashboard that raced a restart shows why.
