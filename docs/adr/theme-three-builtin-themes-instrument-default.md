---
id: theme-three-builtin-themes-instrument-default
type: decision
status: accepted
date: 2026-09-02
summary: Three built-in themes ship: Instrument, the contrast-fixed default, a conventional dark and a standard light, a palette on the accepted direction.
features: [theme]
tags: [ux, user-decision]
files: [web/src/style.css, web/src/theme.ts]
tests: [web/e2e/theme.spec.ts]
refs: [docs/history/spec-changelog.md, plan:new-ui-design-colors, docs/design/design-system.md, kb:adr/theme-instrument-visual-direction, kb:adr/theme-two-layer-tokens-not-white-label]
supersedes: []
---
**Context.** With a token architecture in place, the question became which palettes to ship. The original direction was chosen over a lighter, roomier layout, and a light palette risked looking like that rejected direction returning by the back door.

**Options.** (A) Instrument alone, contrast-fixed. (B) Instrument plus one conventional dark. (C) Instrument, a conventional dark and a standard light, all on the same layout and token set.

**Decision.** C, settled with Damian. The rejected direction was a layout; a light palette on the accepted structure does not reopen it. Instrument stays the default.

**Consequences.** Mockups are re-rendered under all three palettes before a plan is approved, so approval means having seen every palette on both views. Each theme must pass the same contrast gate and keep the same state hue families. A fourth theme is a block and a run of the gate.
