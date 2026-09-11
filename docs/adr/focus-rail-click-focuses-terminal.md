---
id: focus-rail-click-focuses-terminal
type: decision
status: accepted
date: 2026-09-02
summary: A pointer click on a rail card puts keyboard focus in that session's terminal; keyboard activation, number chords and the Tiles strip only select.
features: [focus, rail, surfaces]
tags: [ux, user-decision]
files: [web/src/terminal/pane.ts, web/src/main.ts, web/src/features/rail.ts]
tests: [web/e2e/terminal.spec.ts, web/e2e/sessions.spec.ts]
refs: [docs/history/spec-changelog.md, plan:terminal-focus, docs/design/ux-flows.md, kb:adr/focus-rail-plus-one-live-pane, "#11"]
supersedes: []
---
**Context.** Clicking a rail card swapped the live pane to that session but left keyboard focus on the card, so typing needed a second click on the pane. The terminal surface exposed no way to request DOM focus; only a direct click on the pane ever reached xterm's hidden textarea.

**Options.** (A) Every selection path moves focus into the terminal: pointer click, Enter or Space on a card, the number chords, a Tiles strip click. (B) Pointer click on a rail card only, with a single call after render, guarded on the click source. (C) Leave focus alone and accept the second click.

**Decision.** B, settled with Damian at planning. A pointer click means "go there"; a keyboard user who pressed Enter on a card may want to keep navigating cards, and the chords have their own contract.

**Consequences.** The surface gains a focus method that is a no-op for a dead or disposed surface, so clicking an ended session's card leaves focus on the card. Nothing on the render tick, reconcile, view switch or drag-reorder path touches focus, which the plan pinned as an invariant. Review measured that after one click the active element was xterm's textarea inside the clicked session's container and typed input reached that pane.
