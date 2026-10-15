---
id: connection-claude-version-watched-and-pushed
type: decision
status: accepted
date: 2026-10-15
summary: The Claude Code version is checked after the daemon starts serving, re-checked when the claude binary file changes, and pushed to open dashboards.
features: [connection, issue]
tags: [claude-code-format, ux, user-decision]
files: [cmd/musterd/main.go, internal/server/claudeversion.go, internal/server/ws.go, web/src/features/connection.ts]
tests: [web/e2e/claude-version.spec.ts]
refs: [plan:claude-version-watch, kb:fact/new-claude-binary-first-run-slow-on-macos, kb:adr/connection-installed-claude-classified-never-refused, kb:anchor/ws.hello, "https://github.com/Zalaras/muster/issues/89"]
supersedes: []
---
**Context.** Issue #89: the startup version check ran before the daemon listened, bounded at 5 s. The first run of a newly installed `claude` takes about 11 s on macOS (kb:fact/new-claude-binary-first-run-slow-on-macos), so a start right after an update stalled 5 s and then read `unknown` for the daemon's life. The version reached the dashboard only in `hello`, once per connection.

**Options.** (A) Raise the startup bound past 11 s, delaying startup. (B) Check in the background and leave the readout `unknown` until a page refresh. (C) Check in the background, re-check when the binary changes, and push each new result over a new message.

**Decision.** C, the developer's choice: startup must never wait on `claude`, and a page refresh is the only thing that re-sends `hello`. The change was small enough to make on the `/fix` track.

**Consequences.** The daemon stats the resolved binary every 30 s and runs `claude --version` once per new identity, bounded at 30 s. That run also pays macOS's first-run hold before the next launch does, which is what shortens #81's launches. `hello.claudeCode` is the latest result, and `unknown` also means not checked yet. A `claudeCode` message is sent only when the result changes. A failed check replaces a known version with `unknown` and is pushed; that identity is not checked again until the file changes. The issue snapshot reads the latest result.
