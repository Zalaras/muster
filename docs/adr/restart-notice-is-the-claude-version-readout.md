---
id: restart-notice-is-the-claude-version-readout
type: decision
status: accepted
date: 2026-11-04
summary: The restart notice is the Claude version readout as a button, with a counts panel and a confirm of collapsible lists; Ignore is per tab.
features: [connection, actions]
tags: [ux]
files: []
tests: []
refs: [plan:restart-latest-claude, kb:adr/connection-claude-version-readout-short-unknown-fixed-width]
supersedes: []
---
**Context.** The developer needs to see that sessions run an older Claude Code and restart them, with many sessions at once in mind. Mockups: `plans/restart-latest-claude/mockups/`.

**Options.** (A) A notice chip beside the readout. (B) The readout itself as the control. (C) A neutral banner under the masthead. Within B: counts then a dialog (B1), the panel as the confirm (B2), the panel folded by reason (B3).

**Decision.** B1 (the developer, 2026-11-04): the readout becomes a button in its fixed width (`claude <oldest>→<installed>`, or `claude ↻N queued`) with a neutral dot; its panel shows the two counts with Ignore and Restart…; Restart… opens a confirm dialog whose Restart now and Restart when free sections each expand and collapse. Ignore is kept in session storage per installed version. There is no per-session or per-group restart.

**Consequences.** Restarting takes three clicks, like every other process-killing action behind a confirm. A new tab shows an ignored notice again.
