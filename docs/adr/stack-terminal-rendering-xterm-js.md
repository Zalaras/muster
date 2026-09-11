---
id: stack-terminal-rendering-xterm-js
type: decision
status: accepted
date: 2026-08-16
summary: Terminal panes render with xterm.js; a Go-side VT emulation with a canvas renderer was rejected for v1 because it reimplements selection, scrollback and copy.
features: [surfaces]
tags: [deps, ux]
files: [web/src/terminal/pane.ts, web/package.json]
tests: []
refs: [SPEC.md, docs/history/interview-notes.md, docs/conventions.md, kb:adr/surfaces-shared-attach-single-pty, kb:adr/stack-frontend-web-app-served-by-daemon]
supersedes: []
---
**Context.** The dashboard shows live terminal panes fed by PTY bytes over a WebSocket. Something in the browser has to interpret those bytes, lay out a grid, and give the user selection, copy, links and search.

**Options.** (A) Emulate the terminal on the Go side and ship cell updates to a canvas renderer in the browser: full control over rendering, but selection, scrollback, copy and link detection all have to be rebuilt. (B) xterm.js, a mature emulator that provides all of those and is what comparable tools use.

**Decision.** B for v1. A could be revisited if xterm.js disappoints, but nothing has pointed that way.

**Consequences.** The browser owns emulation and the daemon relays bytes, so the terminal bridge is a byte pipe with a resize side channel. xterm.js and its fit addon are pinned to exact versions. Scrollback is tmux's, since Claude Code runs on the alternate screen and xterm keeps none of its own; theme work supplies xterm a palette per theme rather than styling cells itself.
