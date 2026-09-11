---
id: stack-daemon-go
type: decision
status: accepted
date: 2026-08-16
summary: The daemon is written in Go, Damian's daily language; Rust was considered and lost on speed of delivery.
features: []
tags: [deps, user-decision]
files: [go.mod, cmd/musterd/main.go]
tests: []
refs: [SPEC.md, docs/history/interview-notes.md, docs/research/claude-session-manager-handoff.md, docs/conventions.md]
supersedes: []
---
**Context.** Muster's core is a long-running local daemon: it owns PTYs, talks to tmux, serves HTTP and WebSockets, and stores state. The language had to suit that shape and, for a personal tool built in spare time, had to be one Damian already writes every day.

**Options.** (A) Rust: attractive for a daemon, but new to Damian, so every milestone would have carried a learning tax. (B) Go: the daily language, with a standard library that covers HTTP, process control and embedding, and a single static binary at the end.

**Decision.** B. Speed of delivery outweighed any technical edge Rust might have offered; the earlier research had reached the same conclusion and re-examination did not move it.

**Consequences.** Every other stack choice is a Go choice: the HTTP server, WebSocket library, logger, SQLite driver and PTY library are all picked from the Go ecosystem, and the conventions document sets the Go idioms the build agents follow. Cross-compilation without cgo is what lets releases build on a Linux runner.
