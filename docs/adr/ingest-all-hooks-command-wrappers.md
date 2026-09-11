---
id: ingest-all-hooks-command-wrappers
type: decision
status: accepted
date: 2026-08-27
summary: Every hook and the status line is a command wrapper that exits silently when unmanaged or when the daemon is down; Muster writes no http hook entries.
features: [ingest, launch]
tags: [claude-code-format, envelope, security]
files: [internal/claudecode/settings.go, internal/server/sessions.go]
tests: [TestMergeSettings_FreshFileRegistersCommandEntryOnAllElevenEvents, TestMergeSettings_FreshFileHasNoHTTPEntry, TestWriteEnvelopeScript_EarlyExitIsTheFirstNonCommentLine, TestWrapperScriptsShellRoundTrip_DaemonUnreachableExitsSilentlyAndFast, TestCommandHooksCarryEnvelopeOnEveryEvent]
refs: [docs/history/spec-changelog.md, plan:m4-hook-lifetime, kb:fact/command-hooks-inherit-pane-env, kb:fact/sessionstart-not-over-http, kb:anchor/ingest.transport, kb:anchor/ingest.envelope]
supersedes: [ingest-sessionstart-command-wrapper]
---
**Context.** Muster's http hook entries sat in a per-directory file, so they fired for every Claude Code session in that directory, managed or not, could not tell which was which, and printed a connection error inline on every tool call whenever the daemon was stopped. Unmanaged sessions flooded the event table with unrouted rows.

**Options.** (A) Keep http hooks and add a daemon-down surface plus an unrouted-event policy. (B) Make every hook, including the status line, one generic command wrapper whose first line exits when the Muster session variable is unset and which swallows a failed post. (C) B with a compiled helper instead of a shell script.

**Decision.** B. The merge strips Muster's legacy http entries, the legacy start-only wrapper and its own http allow-list values from an already-instrumented file rather than replacing them.

**Consequences.** The ingest token leaves the settings file and lives only in the private scripts, which are rewritten at every start, so a port or token rotation touches no settings file. A stopped daemon costs a silent shell exit per event and the dashboard banner is the only daemon-down surface. Per-event cost roughly doubles against http; a compiled helper is recorded as a post-v1 option.
