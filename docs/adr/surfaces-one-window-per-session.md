---
id: surfaces-one-window-per-session
type: decision
status: superseded
date: 2026-08-16
summary: Each session runs in its own tmux window inside one shared tmux session; sizing is a window-level operation.
features: [surfaces, lifecycle]
tags: [tmux]
files: [internal/tmux/tmux.go]
tests: []
refs: [docs/history/spec-changelog.md, spikes/FINDINGS.md]
supersedes: []
---
**Context.** The research vocabulary spoke of panes, and that vocabulary produced the wrong sizing primitive. The spike established that sizing is per window and that the window-size option is per window, latched by a resize.

**Options.** (A) One pane per session inside one window. (B) One window per session inside one shared tmux session, one pane per window. (C) One tmux session per Muster session.

**Decision.** B, at the time. It matched the single-focused-pane layout and kept enumeration to one session on Muster's socket.

**Consequences.** Every tmux verb Muster runs targets a window. When the Tiles view needed several concurrent live clients, a client's attachment to a whole tmux session made B unworkable, and the superseding record moved to C.
