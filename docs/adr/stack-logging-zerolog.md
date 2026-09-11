---
id: stack-logging-zerolog
type: decision
status: accepted
date: 2026-08-16
summary: Structured logging is zerolog; slog was considered and familiarity won.
features: []
tags: [deps, user-decision]
files: [cmd/musterd/main.go, go.mod]
tests: []
refs: [docs/history/spec-changelog.md, docs/conventions.md]
supersedes: []
---
**Context.** The daemon needed structured logs from the first milestone, readable in a terminal and greppable in a file, and the build agents needed one logger to inherit rather than one per package.

**Options.** (A) The standard library's slog. (B) zerolog, Damian's structured logger of habit.

**Decision.** B.

**Consequences.** Log fields are typed key-value pairs on a chained event, and the conventions document names the levels and the one rule that matters more than the library: hook payloads carry prompt text and are never logged anywhere world-readable. Swapping to slog later would be mechanical but would still be a deliberate change.
