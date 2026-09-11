---
id: theme-role-named-surface-tokens-hue-named-state
type: decision
status: accepted
date: 2026-09-02
summary: Surface and text tokens are named by role (bg, fg, well, edge and kin); state tokens keep their hue names because the hue is the semantic.
features: [theme]
tags: [ux, user-decision]
files: [web/src/style.css, docs/design/design-system.md]
tests: []
refs: [docs/history/spec-changelog.md, plan:new-ui-design-colors, docs/design/design-system.md, kb:adr/theme-state-hues-fixed-across-themes, kb:adr/theme-two-layer-tokens-not-white-label]
supersedes: []
---
**Context.** With several palettes binding the same tokens, a token named after its original colour would lie in every other theme. The state tokens, by contrast, are the same hue family in every theme by rule.

**Options.** (A) Name every token by role, including state. (B) Keep the original colour-flavoured names everywhere. (C) Role names for surfaces and text; hue names for state, since the hue is fixed across themes and is the meaning.

**Decision.** C, taken by Damian at planning.

**Consequences.** Reading a component's stylesheet says what a surface is for, not what colour it once was. A state token's name tells the reviewer which state it may mean, which is the check the design system asks for. The rename touched every rule in the stylesheet once and is not expected to recur.
