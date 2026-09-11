---
id: theme-terminal-ground-follows-claude-family
type: decision
status: accepted
date: 2026-09-02
summary: The terminal pane ground always follows Claude Code's theme family, override or not; each theme supplies a light and a dark terminal pair.
features: [theme, surfaces]
tags: [ux, user-decision]
files: [web/src/style.css, web/src/features/theme.ts, web/src/terminal/pane.ts]
tests: [web/e2e/theme.spec.ts]
refs: [docs/history/spec-changelog.md, plan:new-ui-design-colors, docs/design/design-system.md, kb:adr/theme-claude-theme-read-only-poll, kb:adr/theme-term-split-from-well]
supersedes: []
---
**Context.** Claude Code draws its own TUI inside the pane with colours chosen for its own light or dark theme. Muster owns the pane's background but not its contents, so a dark Muster theme around a TUI drawn for a light terminal produces unreadable text in the middle of the dashboard.

**Options.** (A) The pane ground follows the Muster theme like every other surface. (B) The pane ground follows Claude Code's family regardless of the Muster theme, and each theme supplies a terminal pair, one ground for each family.

**Decision.** B, settled with Damian. The pane is Claude Code's canvas; Muster matches the paper to what Claude is drawing for.

**Consequences.** A dark dashboard with a light terminal is a legitimate and expected combination. Chrome recesses such as inputs must not share the pane ground token, which forced a later split. Theme switching never re-renders the terminal contents, only its ground.
