---
id: theme-shell-pip-own-token
type: decision
status: accepted
date: 2026-09-05
summary: The running-shell pip gets its own token in every theme rather than reusing teal, which is reserved for Working; no exemption is recorded.
features: [theme, surfaces]
tags: [ux, user-decision]
files: [web/src/style.css, docs/design/design-system.md]
tests: []
refs: [docs/history/spec-changelog.md, plan:plain-terminal-session, plans/plain-terminal-session/decisions/shell-pip-hue/decision.md, docs/design/design-system.md, kb:adr/theme-state-hues-fixed-across-themes, kb:adr/theme-danger-tokens-not-rose]
supersedes: []
---
**Context.** The approved plan and mockup gave the shell segment a teal pip to mean a shell is running. Review raised that teal is reserved for the Working state, and the design system's rule is that a state colour may mean only that state. It was a vocabulary question for Damian, not a defect for an agent or a debate.

**Options.** (A) Keep teal and record a second sanctioned meaning in the design system so the next reviewer does not re-raise it; no code change. (B) Give the pip its own token in every theme block and point the pip at it, leaving the four state hues untouched; one token per theme, one rule changed, and the contrast gate re-run.

**Decision.** B, Damian's decision at review.

**Consequences.** The rule stands unbroken for the third time a new meaning wanted a reserved hue, after the banner and danger families. The plan's requirement was amended to match rather than the design system. A pip colour is now a theme concern, so a new theme must supply it.
