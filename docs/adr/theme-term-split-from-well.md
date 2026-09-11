---
id: theme-term-split-from-well
type: decision
status: accepted
date: 2026-09-02
summary: The pane ground token splits from a new well token: the pane follows Claude Code's family, chrome recesses ground on the well, which follows the Muster theme.
features: [theme]
tags: [ux]
files: [web/src/style.css]
tests: [web/e2e/theme.spec.ts]
refs: [docs/history/spec-changelog.md, plan:new-ui-design-colors, docs/design/design-system.md, kb:adr/theme-terminal-ground-follows-claude-family]
supersedes: []
---
**Context.** One token grounded both the live pane and every chrome recess: text inputs, the issue preview, the browse pane, the empty placeholder and dead snapshots. Once the pane ground followed Claude Code's family, a light Claude Code beside a dark Muster theme would have flipped every input field light.

**Options.** (A) Let the recesses follow the pane, accepting bleached inputs under a mismatched family. (B) Introduce a well token for recesses that follows the Muster theme, leaving the pane token alone to follow Claude Code.

**Decision.** B, found and taken at planning; the spec had not foreseen the shared token.

**Consequences.** Two tokens now mean recessed, and a component must pick the right one: the pane and only the pane follows Claude Code. Dead snapshots ground on the well because they are chrome, not a live TUI. The contrast pairs cover both grounds.
