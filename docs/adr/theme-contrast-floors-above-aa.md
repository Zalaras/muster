---
id: theme-contrast-floors-above-aa
type: decision
status: accepted
date: 2026-09-03
summary: Contrast floors rise above AA on every theme, one higher floor for muted and dim text, state hues as text and note tokens; Light moves with the dark themes.
features: [theme]
tags: [ux, user-decision]
files: [web/scripts/contrast-pairs.json, web/src/style.css, docs/design/design-system.md]
tests: []
refs: [docs/history/spec-changelog.md, plan:ui-text-and-focus, docs/design/design-system.md, kb:adr/theme-aa-contrast-gated-in-check, "#18"]
supersedes: []
---
**Context.** The AA gate passed while the metadata layer sat at the floor on both dark themes, and the dashboard read as dim in daily use. Passing a gate and being comfortable to read turned out to be different things.

**Options.** (A) One higher floor for every theme, so the Light theme moves too and the themes stay uniform. (B) Raise the dark themes only, leaving Light at AA.

**Decision.** A, Damian's decision from a side-by-side mock at planning.

**Consequences.** The mockups remain the authority and the stylesheet transcribes them; the pairs file now gates the higher minimums rather than AA alone, so a palette regression fails the build at the new floor. The gate mechanism is unchanged. Every future theme inherits the higher floors.
