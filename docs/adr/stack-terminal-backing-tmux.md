---
id: stack-terminal-backing-tmux
type: decision
status: accepted
date: 2026-08-16
summary: Sessions run the real claude CLI inside tmux on a dedicated socket; the Agent SDK and bare daemon-owned PTYs were rejected.
features: [surfaces, lifecycle]
tags: [tmux, deps, claude-code-format]
files: [internal/tmux/tmux.go, internal/claudecode/launch.go]
tests: []
refs: [SPEC.md, docs/history/interview-notes.md, docs/research/claude-session-manager-handoff.md, kb:adr/surfaces-shared-attach-single-pty, kb:adr/surfaces-one-tmux-session-per-session, kb:adr/lifecycle-session-identity-is-tmux-target]
supersedes: []
---
**Context.** Muster manages interactive Claude Code sessions and must keep them alive across its own crashes and restarts. It also depends on two signals only the interactive CLI emits: the hook events and the status-line JSON that carry state and usage.

**Options.** (A) Drive Claude through the Agent SDK or print mode instead of a terminal. The terminal escape sequences and the status line do not exist in that mode, which removes the usage and state data sources. (B) Spawn the CLI directly under a PTY the daemon owns; a daemon crash then takes every session with it. (C) Run the CLI inside tmux: sessions outlive the daemon, tmux enumerates and addresses them, and it is already a terminal emulator.

**Decision.** C. The SDK rejection was inherited from the research and never challenged, because it removes the very data Muster is built on.

**Consequences.** tmux is a hard dependency checked at startup, always on Muster's own socket, never the user's default server. Display is a pushed PTY attach, not polling, so the earlier premise that control mode might be needed is stale; capture-pane survives only as a test oracle and snapshot source. Session identity keys on the tmux target. Reconcile on start enumerates the socket to find sessions that outlived the previous daemon.
