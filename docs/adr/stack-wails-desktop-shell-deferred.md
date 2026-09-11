---
id: stack-wails-desktop-shell-deferred
type: decision
status: proposed
date: 2026-08-16
summary: A Wails desktop wrapper around the browser-served dashboard is deferred; the app window comes from the browser until a dock icon matters.
features: [connection]
tags: [deps, deferred, ux]
files: [cmd/musterd/main.go]
tests: []
refs: [SPEC.md, docs/history/interview-notes.md, kb:adr/stack-frontend-web-app-served-by-daemon, kb:adr/connection-dashboard-auto-opens-on-terminal]
supersedes: []
---
**Context.** The own-window requirement is met by opening the dashboard in a browser app window. A native shell would add a dock icon and a menu bar entry, nothing the dashboard needs to function.

**Options.** (A) Wrap the web app in Wails from the start. (B) Ship browser-first and add Wails later as a thin cosmetic shell if a dock icon turns out to matter.

**Decision.** B. Wails is a wrapper around the same frontend, so deferring it costs nothing architecturally; the daemon already opens the dashboard in the browser at startup.

**Consequences.** If the shell is ever built it lives as a second command beside the daemon under the cmd tree, which is why the layout put the daemon under cmd rather than at the repository root. Nothing in the frontend may assume a browser-only or a Wails-only host.
