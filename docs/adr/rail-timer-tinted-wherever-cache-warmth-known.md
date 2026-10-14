---
id: rail-timer-tinted-wherever-cache-warmth-known
type: decision
status: accepted
date: 2026-10-14
summary: Where cache warmth is known, in any state, the card timer fades from foreground to grey over the lifetime, underlined in its last 15%; group headers show one.
features: [rail, groups, usage]
tags: [ux]
files: [web/src/sessions/card.ts, web/src/render/sessions.ts, web/src/render/railsections.ts, web/src/render/grouppopover.ts]
tests: []
refs: [plan:rail-card-organise, "#84", plans/cache-warmth/mockups/timer-tint.html, kb:adr/usage-cache-warmth-kept-until-clear-read-against-client-clock]
---
**Context.** The spec tinted only idle and needs-input timers. Planning found that a working
session's cache can go cold while the main thread waits on a long tool or subagent, that a failed
session is waiting on the developer too, and that an ended one can resume warm.

**Decision.** One rule: a rail or strip card whose session's warmth is known shows its timer fading
in a straight line from the theme's foreground to the timer's usual grey over the lifetime, with a
dotted underline while 0–15% remains, plain grey once cold; unknown warmth is today's plain timer.
The hover is one line — `cache warm · cold in <n>m`, `cache cold`, `cache unknown`. A group header
adds the timer of the live member in idle, needs input or failed that started waiting last, with a
hover counting the warm ones among those with known warmth; the popover shows every row's timer.
No state colour is used (design-system §3).

**Consequences.** A busy working session's timer reads near-foreground rather than grey. Tiles
grid tiles and the Focus header carry no warmth.
