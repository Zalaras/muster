---
id: rail-attention-order-your-turn-before-active
type: decision
status: accepted
date: 2026-09-22
summary: Attention order puts every state that waits on the user first — needs input, failed, unread idle, started — then planning and working, then read idle last.
features: [rail, shortcuts, tiles]
tags: [ux, user-decision]
files: [web/src/sessions/sort.ts, web/src/sessions/live.ts]
tests: []
refs: [plan:rail-card-improvements, "#30", kb:adr/rail-attention-sort-order, kb:adr/rail-user-owned-manual-order-default, kb:adr/shortcuts-jump-to-neediest-option-command-zero, kb:adr/tiles-live-top-n-snapshot-rest]
supersedes: []
---
**Context.** The attention sort placed idle below working, so a finished reply waited under sessions that needed nothing. The order also drives the jump-to-neediest chord and the initial Tiles live pick, so it is one definition of neediest.

**Options.** (A) Move idle directly after failed, above the active states. (B) Move idle directly after needs input, above failed. (C) Split idle on the new unread flag: unread idle rises above the active states and read idle sinks below them, so reading a card is what moves it.

**Decision.** C, the developer's choice, with started placed after unread idle: a launched session is waiting for its first prompt, and the state machine moves it out the moment it is used, so no time decay is needed. The table is needs input longest-blocked first, failed most recent first, unread idle longest-idle first, started, planning, working, then read idle longest-idle first. Failed stays above idle because it is loud but static.

**Consequences.** Attention mode reads as an inbox. Option-Command-0 lands on an unread reply before a working session. Tiles' initial live pick follows the same table; its sticky membership is unchanged. The manual mode, the pinned block and the dead-last rule are untouched.
