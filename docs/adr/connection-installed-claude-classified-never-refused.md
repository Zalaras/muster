---
id: connection-installed-claude-classified-never-refused
type: decision
status: accepted
date: 2026-09-10
summary: The installed Claude Code is classified unknown, below, verified or above; the daemon serves identically in all four and the masthead shows a glyph, no dismiss.
features: [connection, canary]
tags: [claude-code-format, ux, user-decision]
files: [internal/claudecode/version.go, cmd/musterd/main.go, internal/server/ws.go, web/src/features/connection.ts]
tests: [TestCheckClaudeCode_MapsEachStatusAndLogsAtTheRightLevel, TestCheckClaudeCode_UnknownOutcomeNeverFailsStartup, TestClassifyAgainst, web/e2e/claude-version.spec.ts]
refs: [docs/history/spec-changelog.md, docs/history/protocol-changelog.md, plan:version-claude-interface, kb:anchor/ws.hello, kb:adr/canary-verified-range-observed-not-pinned, kb:adr/canary-claude-auto-updater-left-on, "#6"]
supersedes: []
---
**Context.** With a range instead of a pin, startup had to say what an installed version outside it means, and the dashboard warning had to become sayable in user terms. A refusal below the floor with a named remedy was on the table.

**Options.** (A) Refuse to start below the floor; warn above. (B) Classify into four states, log one line per outcome at the matching level, and serve identically in all four. For the masthead: (i) a dismissable banner persisted per version, or (ii) a warning glyph beside the version with hover text and nothing persisted.

**Decision.** B with (ii), settled in the interview. Muster never knows a version is broken until the canary says so, and a refusal would strand a user whose Claude Code auto-updated overnight. The dismiss was dropped because the glyph and its hover text are the whole interface.

**Consequences.** The hello frame carries installed, floor, verified and status, with installed null exactly when the status is unknown. The issue-capture snapshot carries the status string so a report says which side of the range it came from. The wording is about testing, not drift.
