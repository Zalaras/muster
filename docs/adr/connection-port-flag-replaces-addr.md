---
id: connection-port-flag-replaces-addr
type: decision
status: accepted
date: 2026-10-23
summary: musterd takes -port N|default instead of -addr; the host is always 127.0.0.1 and default means 8765.
features: [connection]
tags: [ux]
files: [cmd/musterd/main.go]
tests: []
refs: [plan:custom-port]
supersedes: []
---
**Context.** Every daemon bound `127.0.0.1:8765` through `-addr`. Loopback is machine-wide, so a second macOS profile's daemon could not bind (#107). `-addr` also suggested a configurable host, which Muster never allows.

**Options.** (A) Keep `-addr`. (B) Add `-port` beside `-addr`. (C) Replace `-addr` with `-port`.

**Decision.** C. `-port` takes an integer 0–65535 or the word `default` (8765); any other value exits before the tmux preflight. `0` stays available as an ephemeral port for tests.

**Consequences.** Scripts and tests that passed `-addr` must pass `-port`. The host can no longer be changed from the command line.
