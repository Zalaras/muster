---
id: surfaces-one-live-client-per-attach-target
type: decision
status: accepted
date: 2026-09-05
summary: The one-live-client law is per attach target, not per session: a session's Claude socket and shell socket coexist and never supersede each other.
features: [surfaces, tiles, rail]
tags: [tmux, ux]
files: [internal/server/terminal.go, web/src/sessions/live.ts, web/src/render/sessions.ts]
tests: [TestHandleShellTerminal_SecondSocketSupersedesFirstButNeverTheClaudeSocket, TestHandleTerminal_OpeningClaudeSocketNeverSupersedesAnOpenShellSocket, TestHandleTerminal_TakeoverNeverLeavesTwoClientsAttachedAtOnce, web/e2e/plain-shell.spec.ts]
refs: [docs/history/protocol-changelog.md, docs/history/spec-changelog.md, plan:plain-terminal-session, spikes/FINDINGS.md, kb:anchor/terminal.ws, kb:anchor/terminal.shell-ws, kb:adr/surfaces-one-live-client-per-session, kb:adr/surfaces-shared-attach-single-pty, kb:adr/surfaces-shell-is-attach-target-not-session]
supersedes: [surfaces-one-live-client-per-session]
---
**Context.** tmux sizes a session to its smallest attached client, so the law has been that a session is live on one surface at one geometry and every other rendering is a snapshot. A second attach target per session, the plain shell, made the law's unit ambiguous: keyed on the session it would have let a shell socket close the Claude socket.

**Options.** (A) Keep the law per session: opening a shell takes over the session's one live slot. (B) Re-key the law on the attach target, the tmux session behind a socket, so each of a session's targets is live once and the two are independent.

**Decision.** B. Geometry is a property of the PTY being rendered, and each target has its own.

**Consequences.** Everything the earlier record established holds per target: the rail and Tiles strip show snapshots, switching views moves geometry ownership with a debounced resize, and a second socket for the same target takes over and the first closes with a dedicated code. A session can therefore have two live panes at once, one per target, and a shell's death never nudges the parent's liveness. The Focus pane shows one target at a time; the segmented control chooses which.
