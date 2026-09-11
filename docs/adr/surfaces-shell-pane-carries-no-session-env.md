---
id: surfaces-shell-pane-carries-no-session-env
type: decision
status: accepted
date: 2026-09-05
summary: The shell pane carries no Muster session environment and gets no settings written, so a nested Claude Code fires hooks that persist unrouted.
features: [surfaces, ingest]
tags: [tmux, state-machine, security]
files: [internal/server/shells.go, internal/tmux/tmux.go]
tests: [TestHandleCreateShell_LeavesSettingsLocalJSONUnchanged, TestIngestRouting_EnvelopeNamingAnUnknownMusterSessionPersistsUnrouted]
refs: [docs/history/spec-changelog.md, docs/history/protocol-changelog.md, plan:plain-terminal-session, kb:fact/command-hooks-inherit-pane-env, kb:anchor/ingest.envelope, kb:adr/ingest-envelope-binds-never-cwd, kb:adr/surfaces-shell-is-attach-target-not-session]
supersedes: []
---
**Context.** Hooks learn which Muster session they belong to from the pane environment the command wrappers inherit. A shell opened in a session's directory sits inside a directory Muster has instrumented, so a user typing the Claude Code command there would fire the same hooks.

**Options.** (A) Give the shell pane the parent's session environment so a nested Claude Code binds to the parent. (B) Give it none and write no settings for it, so nested hooks carry no session and are persisted unrouted.

**Decision.** B. The parent's state machine describes one Claude Code process, and a second one binding to it would corrupt that story; isolation is structural rather than a check at ingest.

**Consequences.** A nested run's events land in the event table with a null session and drive nothing. The shell can therefore never be mistaken for a session by the envelope, which was the ambiguity the envelope was introduced to remove. The directory's hook entries are unchanged either way, by the permanence rule.
