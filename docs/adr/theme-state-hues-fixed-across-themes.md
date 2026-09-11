---
id: theme-state-hues-fixed-across-themes
type: decision
status: accepted
date: 2026-09-02
summary: State colours keep fixed hue families in every theme, tuned per theme for lightness only; the design system's meaning rules carry across palettes.
features: [theme]
tags: [ux, user-decision]
files: [web/src/style.css, docs/design/design-system.md]
tests: []
refs: [docs/history/spec-changelog.md, plan:new-ui-design-colors, docs/design/design-system.md, kb:adr/theme-no-traffic-light-state-palette, kb:adr/theme-role-named-surface-tokens-hue-named-state]
supersedes: []
---
**Context.** The design system reserves each state colour for one meaning. Once several palettes existed, a theme author could have chosen its own state colours, and a user switching themes would have had to relearn which colour meant blocked.

**Options.** (A) Each theme picks its own state palette. (B) The hue family per state is fixed across themes; a theme may adjust lightness and saturation to sit on its own grounds, nothing more.

**Decision.** B, settled with Damian. State colour is vocabulary, not decoration; a theme changes the paper, not the words.

**Consequences.** State tokens keep their hue names because the hue is the semantic, while surface and text tokens are named by role. A new meaning still gets a new token family rather than a reused hue, as the banner and danger families did before. The contrast gate checks each state hue as text against each theme's grounds.
