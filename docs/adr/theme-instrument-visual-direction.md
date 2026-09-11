---
id: theme-instrument-visual-direction
type: decision
status: accepted
date: 2026-08-16
summary: Visual direction A, instrument: dark, dense, mono metadata, session state as a coloured rail stripe; the design system is the review checklist.
features: [theme]
tags: [ux, user-decision]
files: [web/src/style.css, docs/design/design-system.md]
tests: []
refs: [docs/history/spec-changelog.md, docs/design/ux-flows.md]
supersedes: []
---
**Context.** Three visual directions were mocked up for the dashboard so that the UI milestones would inherit one look rather than invent it per feature.

**Options.** (A) Instrument: dark, dense, monospaced metadata, state shown as a coloured stripe on each rail card. (B) and (C) the two lighter, roomier directions in the mockup set.

**Decision.** A. Its rules are written down as the design system, and that document doubles as the review agent's design checklist.

**Consequences.** Every later UI change is judged against the design system, and colour roles are named tokens with fixed meanings. Additions to the palette are made by adding a token family, never by reusing a token whose meaning is already reserved. A second theme family may be added later as a token swap, not a redesign.
