---
id: shortcuts-jump-to-neediest-option-command-zero
type: decision
status: accepted
date: 2026-09-04
summary: Option-Command-0 selects the neediest session by attention priority, ignoring the rail's sort mode and pinned block; no live session is a silent no-op.
features: [shortcuts, rail]
tags: [ux, user-decision]
files: [web/src/shortcuts.ts, web/src/features/shortcuts.ts, web/src/sessions/sort.ts]
tests: [web/e2e/shortcuts.spec.ts]
refs: [docs/history/spec-changelog.md, plan:shortcut-fixes, docs/design/ux-flows.md, kb:adr/shortcuts-cmd-n-follows-rail-order, kb:adr/rail-user-owned-manual-order-default, kb:adr/shortcuts-option-command-family-off-reserved-chords]
supersedes: []
---
**Context.** When the number chords were made to follow the rail's displayed order, the recorded dissent was that a user-owned order leaves no keyboard path to the most-blocked session. A follow-up chord was filed rather than reopening that choice.

**Options.** (A) Accept the dissent as a residual of user-owned order. (B) Add one chord that ignores both the sort mode and the pinned block and selects on the attention priority order.

**Decision.** B, alongside the family move. With no live session the chord does nothing and says nothing, a user decision taken at approval rather than an implementation default.

**Consequences.** The dissent against the digits-follow-rail decision is discharged without changing it. The chord reads the same priority order the attention sort uses, so there is one definition of neediest. It is the zero in a family whose digits are positional, which is deliberate: zero is not a position.
