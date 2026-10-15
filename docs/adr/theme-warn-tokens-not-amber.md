---
id: theme-warn-tokens-not-amber
type: decision
status: accepted
date: 2026-10-15
summary: Warnings use a --warn token family, a yellow outside amber's band in every theme; amber stays Needs-Input and the banner/danger tokens keep their roles.
features: [focus]
tags: [ux, user-decision]
files: []
tests: []
refs: [plan:effort, kb:adr/theme-danger-tokens-not-rose, docs/design/design-system.md, "#68"]
supersedes: []
---
**Context.** The launch-mismatch strip needs a warning colour. Amber means Needs-Input (design
system §3), the banner tokens mean the daemon, and danger means a destructive action.

**Decision.** A `--warn` / `--warn-bg` / `--warn-line` / `--warn-fg` family is added to every theme
block, its hue outside amber's 25–45° band, held by `make contrast` (pairs and hue band). It is not
a state colour. Chosen with mockup option A, 2026-10-15.

**Consequences.** The design system's token table gains the row; any later warning uses it rather
than amber.
