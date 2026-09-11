---
id: stack-frontend-web-app-served-by-daemon
type: decision
status: accepted
date: 2026-08-16
summary: The frontend is a daemon-served web app with interactive terminal panes in an app window; TUI, Gio, Fyne, Electron and a read-only side dashboard lost.
features: [connection, surfaces]
tags: [deps, ux, user-decision]
files: [web/src/main.ts, web/vite.config.ts, internal/webui/webui.go]
tests: []
refs: [SPEC.md, docs/history/interview-notes.md, docs/research/claude-session-manager-handoff.md, kb:adr/stack-terminal-rendering-xterm-js, kb:adr/stack-wails-desktop-shell-deferred, kb:adr/connection-dashboard-embedded-in-binary]
supersedes: []
---
**Context.** Damian runs several sessions in Terminal tabs in one window and wanted them all in one place with state, usage and context visible. The interview first settled on a dashboard beside the terminal, then had to decide what the dashboard itself would be built with.

**Options.** For scope: (A) a read-only dashboard of derived state that jumps to a Terminal tab; (B) interactive panes so the dashboard is the workspace. For the surface: (C) a TUI, acceptable only with mouse support; (D) a native Go GUI on Gio with a Go-side terminal renderer, a month of renderer work and no phone access; (E) Fyne, whose widget and text model fights dense terminal grids; (F) Electron, heavy, with a large dependency tree for no gain over a wrapper; (G) a web app the daemon serves over WebSockets, opened as a standalone app window.

**Decision.** B and G. A was chosen mid-interview and then overturned: moving from read-only to interactive later would be an architectural rework, so the terminal went in from the start. G is the lowest-cost route, one codebase, and keeps remote access possible for free.

**Consequences.** The dashboard is the primary workspace, so notifications outside it were cut. The frontend is framework-free TypeScript built with Vite and later embedded in the binary. Being browser-served is the only accommodation made for phone access; real auth would still be needed. A native dock icon is available through a deferred thin wrapper rather than a rewrite.
