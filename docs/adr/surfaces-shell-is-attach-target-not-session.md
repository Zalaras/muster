---
id: surfaces-shell-is-attach-target-not-session
type: decision
status: accepted
date: 2026-09-05
summary: A session may carry an ephemeral plain shell as a second attach target; the shell is not a session, no row, card, state or wire kind, forgotten on restart.
features: [surfaces, lifecycle]
tags: [tmux, ux, revisit]
files: [internal/server/shells.go, internal/tmux/tmux.go, web/src/features/surfaces.ts, web/src/terminal/surfaceswitch.ts]
tests: [TestShellLifecycle_NeverWritesAnySQLiteRow, TestHandleCreateShell_NoShellYetSpawnsOneAndReturnsCreatedTrue, TestIsShellSessionName_Table, web/e2e/plain-shell.spec.ts]
refs: [docs/history/spec-changelog.md, docs/history/protocol-changelog.md, plan:plain-terminal-session, kb:anchor/sessions.shell, kb:anchor/terminal.shell-ws, kb:anchor/ws.session, kb:adr/surfaces-one-tmux-session-per-session, kb:adr/surfaces-shell-spawn-http-then-attach-ws, kb:adr/surfaces-shell-lifetime-until-exit-remove-or-reconcile, TODO.md, "#21"]
supersedes: []
---
**Context.** Muster could show only a Claude session, so running a version-control or search command meant leaving for a terminal application or going through Claude Code's shell prefix. The wish was a plain shell in the session's directory, visible in the same place.

**Options.** (A) A real session of a new shell kind, with a row, a rail card, a wire kind and restore across restarts. (B) A global untethered terminal unrelated to any session. (C) An ephemeral second attach target hanging off an existing session: the user's shell, interactive, in the session's directory, in a sibling tmux session with a suffixed name, swapped into the surface body by a segmented control in the Focus mainhead and each tile footer.

**Decision.** C, the smallest shape that removes the itch, settled at the spec interview. The session object on the wire is unchanged and nothing about the shell appears on the state stream.

**Consequences.** Almost all machinery is reused: the terminal surface is view-agnostic and the per-target socket law already moves geometry ownership, so switching surfaces is mechanically what switching sessions is. The daemon holds shells in memory only; reconcile kills every shell of Muster's shape at startup rather than adopting it. The richer shape, a shell kind, a global terminal, restore, several shells per session, stays in the backlog.
