---
id: reader-scratch-badge-neutral-not-teal
type: decision
status: accepted
date: 2026-11-12
summary: The tmp badge on a scratch row and in the docbar uses the neutral badge colours with a dashed border, not the mockup's teal.
features: [reader]
tags: [ux]
files: []
tests: []
refs: [plan:claude-tmp-files, kb:adr/reader-scratchpad-in-folded-claude-section, docs/design/design-system.md]
supersedes: []
---
**Context.** The approved mockup for #121 drew the `tmp` badge in teal. The design system reserves `--teal` for the Working state and says a state colour may only mean that state (design-system.md §3).

**Decision.** The `tmp` badge uses the neutral badge colours with a dashed border, which sets it apart from the solid `plan` badge without borrowing a state hue.

**Consequences.** The plan's Docbar line carries an *Amended* note; a scratch file still reads differently from the plan at a glance, by border and word rather than colour.
