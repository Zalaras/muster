---
id: process-e2e-per-run-ports-and-sockets-no-reuse
type: decision
status: accepted
date: 2026-08-16
summary: Every E2E daemon gets its own port, data directory, browse root and tmux socket path inside a scratch directory; Playwright never reuses a running server.
features: []
tags: [testing, tmux, pipeline]
files: [web/e2e/helpers/daemon.ts, web/playwright.config.ts, cmd/musterd/main.go]
tests: [web/e2e/resilience.spec.ts, web/e2e/reconcile.spec.ts]
refs: [docs/history/todo-done.md, docs/conventions.md, kb:adr/process-e2e-explicit-fixtures, kb:adr/process-tests-run-space-bearing-data-dir, kb:adr/surfaces-one-tmux-session-per-session]
supersedes: []
---
**Context.** The pipeline this project inherited let Playwright attach to an already running development server, which silently tests whatever build happens to be up. Later, browse tests walked the real home directory, and tmux sockets accumulated by the hundred in the shared per-user socket directory because each run named a new one there.

**Options.** (A) One shared development daemon, reused across runs, with the tester responsible for restarting it. (B) Every daemon a test spawns is fresh: its own port, its own temporary data directory, a browse root inside that directory passed through a flag, and a tmux socket given as a path inside the scratch directory rather than a name in the shared directory; the Playwright config declares no web server at all.

**Decision.** B, applied when the pipeline was adapted and extended as each leak surfaced.

**Consequences.** A stale server can never be what a test asserts against. No test touches the real home directory or the user's tmux server. The socket flag accepts a path exactly when it contains a slash, and the Go tests and probe rig use the same per-run convention. Scratch directories carry a space so the production default path is exercised for free.
