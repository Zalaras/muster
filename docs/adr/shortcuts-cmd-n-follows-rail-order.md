---
id: shortcuts-cmd-n-follows-rail-order
type: decision
status: accepted
date: 2026-08-30
summary: The number chords select the nth card in the order the rail currently displays, manual or attention, rather than staying attention-ranked.
features: [shortcuts, rail]
tags: [ux, consensus]
files: [web/src/features/shortcuts.ts, web/src/features/focus.ts, web/src/sessions/sort.ts]
tests: [web/e2e/shortcuts.spec.ts, web/e2e/views.spec.ts]
refs: [docs/history/spec-changelog.md, plan:order-sidebar, plans/order-sidebar/decisions/cmd-n-ordering/decision.md, kb:adr/rail-user-owned-manual-order-default, docs/design/ux-flows.md, plan:shortcut-fixes, kb:adr/shortcuts-jump-to-neediest-option-command-zero]
supersedes: []
---
**Context.** Before manual order existed, the number chords indexed the attention sort and the rail showed the same thing, so the two could not disagree. Once the rail displayed a user-owned order, the chords had to pick a side.

**Options.** (A) Follow the rail's displayed order, whichever mode is active. (B) Stay attention-ranked, keeping a one-key jump to the most-blocked session.

**Decision.** A, by consensus in a two-advocate debate. The only evidence that the attention reading had been chosen rather than inherited was a test written when no user order existed, which discriminated only against insertion order. Nothing then stood against one order across both views.

**Consequences.** The dissent is honoured in the record: A leaves no keyboard path to the neediest session, and in Tiles the chords index an order whose controlling toggle is hidden with the rail. A dedicated jump-to-neediest chord was filed as the follow-up and later added without reopening this choice.
