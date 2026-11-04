---
id: restart-behind-means-older-than-installed
type: decision
status: accepted
date: 2026-11-04
summary: A session is behind only when alive and its running version is strictly older, by semver, than a known installed version; equal or newer is never offered.
features: [actions, connection]
tags: []
files: [internal/claudecode/version.go]
tests: []
refs: [plan:restart-latest-claude]
supersedes: []
---
**Context.** The restart notice needs one rule for which sessions it offers, shared by the daemon (which decides) and the wire (which the dashboard renders).

**Options.** (A) Any difference from the installed version. (B) Strictly older by semver.

**Decision.** B, computed by the daemon and carried as `claudeVersion.behind`. An unknown installed version makes nothing behind.

**Consequences.** A rollback of the installed version offers no restart and clears pending ones; a version-check failure does the same.
