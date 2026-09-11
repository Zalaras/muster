---
id: theme-claude-theme-read-only-poll
type: decision
status: accepted
date: 2026-09-02
summary: Claude Code's theme is read, never set: musterd polls one key of Claude's config file read-only and broadcasts a light, dark or unknown family.
features: [theme, connection]
tags: [claude-code-format, security, user-decision]
files: [internal/claudecode/theme.go, internal/server/themepoll.go]
tests: [TestReadThemeFamily_NeverWritesThePath, TestReadThemeFamily_IgnoresEveryOtherTopLevelKey, TestReadThemeFamily_PrefixMapping, TestServer_ClaudeThemePollZeroConstructsNoPoller]
refs: [docs/history/spec-changelog.md, docs/history/protocol-changelog.md, plan:new-ui-design-colors, kb:fact/theme-config-key-and-enum, kb:anchor/ws.claude-theme, kb:anchor/ws.snapshot, kb:adr/usage-keychain-token-read-only]
supersedes: []
---
**Context.** Following Claude Code's theme needs the daemon to know it. No hook or status-line field carries the theme, and the CLI's config-get command no longer exists in the installed version. The only source is Claude Code's own config file, which is otherwise account data.

**Options.** (A) Ask the user to state the family in Settings. (B) Have the daemon set Claude Code's theme to match Muster's. (C) Poll the one theme key of the config file read-only on a timer, map it to a family, and broadcast the family on change.

**Decision.** C, settled with Damian. Claude Code's configuration is never written, in the same spirit as the Keychain token being read and never stored.

**Consequences.** The daemon broadcasts a family, not the raw theme name, so the wire carries no Claude Code vocabulary. The file path and key name live only in the Claude Code package, with a test seam for the path and the poll interval. Review measured that the file's modification time never changed under polling and that nothing is logged per tick.
