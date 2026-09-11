---
id: launch-settings-local-json-not-settings-json
type: decision
status: accepted
date: 2026-08-20
summary: Muster writes the gitignored project settings.local.json, which alone honours hooks and status line, so the ingest token never lands in a committable file.
features: [launch, ingest]
tags: [security, claude-code-format]
files: [internal/claudecode/settings.go, internal/server/sessions.go]
tests: [TestMergeSettings_CalledTwiceProducesByteIdenticalOutput, TestHandleCreateShell_LeavesSettingsLocalJSONUnchanged]
refs: [docs/history/spec-changelog.md, kb:fact/local-settings-honoured, kb:anchor/sessions.create, kb:adr/launch-project-scoped-settings-not-config-dir, kb:adr/ingest-separate-token-in-url-path]
supersedes: []
---
**Context.** Project-scoped settings were already the chosen scope. Within it, the plain settings file is usually committed, and Muster's hook entries then carried the ingest token in a URL, so instrumenting a repo risked committing a secret. Whether the local variant honoured hooks and the http allow-list on its own was unmeasured.

**Options.** (A) Write settings.json and rely on the user not to commit it. (B) Write settings.local.json, which Claude Code gitignores, once a probe shows it is sufficient alone.

**Decision.** B. The probe confirmed the local file alone honours hooks, the status line and the http allow-list.

**Consequences.** Muster never touches the committed project settings file. Later, when every hook became a script wrapper, the token left the settings file altogether and lives only in the private wrapper scripts, but the local file remains the one Muster owns.
