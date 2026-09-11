---
id: theme-aa-contrast-gated-in-check
type: decision
status: accepted
date: 2026-09-02
summary: Every theme meets WCAG AA for text and non-text UI, hairlines exempt, gated by a contrast script under make check; the one bounded accessibility exception.
features: [theme]
tags: [ux, testing, user-decision]
files: [web/scripts/contrast.mjs, web/scripts/contrast-pairs.json, Makefile]
tests: []
refs: [docs/history/spec-changelog.md, plan:new-ui-design-colors, docs/design/design-system.md, kb:adr/theme-contrast-floors-above-aa, kb:adr/theme-contrast-exemptions-button-borders-state-tints]
supersedes: []
---
**Context.** Accessibility is a stated non-goal for a single-user tool, yet the existing palette had dim metadata text and an idle badge that failed the AA text ratio on their own ground. Adding two more palettes by eye would have multiplied the problem.

**Options.** (A) Fix the failing pairs by hand and rely on review to catch regressions. (B) Adopt AA for text and for non-text UI in every theme, decorative hairlines exempt, and gate it with a script over the stylesheet that runs under the check target.

**Decision.** B, settled with Damian, recorded as the one bounded exception to the accessibility non-goal. Contrast is the part of accessibility that a script can hold and that a dark dense UI most easily loses.

**Consequences.** A palette change that fails a pair fails the build, so the reviewer asks which pair rather than squinting. The pairs file is the list of what is checked and what is exempt, each exemption with its reason. The floors were later raised above AA on every theme; the gate mechanism is the same.
