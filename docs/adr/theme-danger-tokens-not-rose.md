---
id: theme-danger-tokens-not-rose
type: decision
status: accepted
date: 2026-08-27
summary: Destructive actions use a danger token family; rose stays reserved for the Failed state rather than the rule being amended.
features: [theme, actions]
tags: [ux, user-decision]
files: [web/src/style.css, web/src/render/confirm.ts]
tests: []
refs: [docs/history/spec-changelog.md, plan:m4-reconcile, docs/design/design-system.md, kb:adr/theme-banner-tokens-not-rose]
supersedes: []
---
**Context.** Confirm dialogs for End and Remove wanted a destructive-action colour. The obvious hue was rose, which the design system reserves for a failed session with the words rose is never delete.

**Options.** (A) Amend the design system so rose may also mean delete. (B) Add a danger family with base, line and foreground tokens for destructive controls.

**Decision.** B, Damian's choice.

**Consequences.** A red on a button means an action; a red stripe on a card means a state. This is the second time a new meaning got a new token family rather than a reused one, and it sets the pattern for any further colour role.
