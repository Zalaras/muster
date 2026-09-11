---
id: surfaces-one-tmux-session-per-session
type: decision
status: accepted
date: 2026-08-23
summary: Each Muster session is its own tmux session, named muster-<id>, because a tmux client attaches to a session and Tiles needs several live at once.
features: [surfaces, lifecycle]
tags: [tmux, user-decision]
files: [internal/tmux/tmux.go, internal/server/terminal.go]
tests: [TestNewSession_NamesTheTmuxSessionMusterDashID, TestNewSession_DifferentIDsCreateDistinctTmuxSessions]
refs: [docs/history/spec-changelog.md, plan:m2-terminal, kb:anchor/terminal.ws, kb:anchor/state.liveness]
supersedes: [surfaces-one-window-per-session]
---
**Context.** A tmux client attaches to a tmux session and shows one window of it. Tiles needed up to six concurrent live surfaces, and the earlier layout put every session as a window inside one shared tmux session, so it could show only one at a time.

**Options.** (A) Keep one shared tmux session and accept a single live surface. (B) One tmux session per Muster session, one window each, all on Muster's dedicated socket.

**Decision.** B, settled with Damian in planning. Rows from before the change need no migration because the target string is what identifies a session.

**Consequences.** Liveness and reconcile enumerate sessions on the socket by name, and an unknown name of Muster's shape is reported rather than adopted. Killing a session is a whole-session kill. A later plain-shell surface follows the same pattern with a suffixed name.
