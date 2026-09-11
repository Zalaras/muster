---
id: theme-two-layer-tokens-not-white-label
type: decision
status: accepted
date: 2026-09-02
summary: Theming is two token layers, semantic tokens over per-theme palette blocks, on one single-user dashboard; a custom theme is a source block, not a file.
features: [theme]
tags: [ux, user-decision]
files: [web/src/style.css, web/src/theme.ts, docs/design/design-system.md]
tests: [web/e2e/theme.spec.ts]
refs: [docs/history/spec-changelog.md, plan:new-ui-design-colors, docs/design/design-system.md, kb:adr/theme-instrument-visual-direction, kb:adr/theme-three-builtin-themes-instrument-default]
supersedes: []
---
**Context.** The design system carried one flat palette, and a request came in for a lighter and a more conventional dark look. Muster is single-user by charter, so the question was how far to generalise: a colour tweak, real themes, or a white-label surface.

**Options.** (A) Keep one palette and adjust its values. (B) White-labelling: themes as user-loadable files, names and branding swappable. (C) Theming: components reference semantic tokens; each theme is a palette block that binds them; a custom theme is a new source block, with the file format left as architecture only.

**Decision.** C, settled with Damian at the spec interview. The dashboard stays one product with swappable palettes; loading a theme file is deferred until someone needs it.

**Consequences.** Every component colour must go through a semantic token, so a hard-coded hue is a defect a gate can catch. Adding a theme is adding a block and re-running the contrast gate, never touching components. The visual direction is unchanged; the theme work is a palette on its structure.
