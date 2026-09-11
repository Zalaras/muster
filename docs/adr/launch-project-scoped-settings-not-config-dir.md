---
id: launch-project-scoped-settings-not-config-dir
type: decision
status: accepted
date: 2026-08-16
summary: Muster instruments a directory through project-scoped .claude settings, never through CLAUDE_CONFIG_DIR, which breaks subscription OAuth.
features: [launch, ingest]
tags: [claude-code-format, auth]
files: [internal/claudecode/settings.go, internal/claudecode/launch.go]
tests: [TestMergeSettings_PreservesKeysMusterDoesNotOwn]
refs: [docs/history/spec-changelog.md, kb:fact/config-dir-breaks-oauth, kb:fact/local-settings-honoured, kb:anchor/sessions.create]
supersedes: []
---
**Context.** Muster must register its hooks and status line for the sessions it launches without touching the user's global Claude Code settings, which other live sessions depend on. An environment variable exists that redirects the whole config directory.

**Options.** (A) Point each launched session at a Muster-owned config directory. (B) Merge Muster's entries into the project-scoped settings file inside the launched directory, preserving whatever the user already has there.

**Decision.** B. The redirect isolates hooks but also isolates credentials, forcing a fresh login on every session.

**Consequences.** Muster performs a JSON merge that owns only its own entries and leaves foreign keys untouched, and every test isolates itself the same way in a scratch repo. Which project-scoped file receives the merge, and how the ingest token is kept out of anything committable, is the subject of a later record.
