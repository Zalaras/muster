---
id: rail-launch-leaves-rail-scroll-untouched
type: decision
status: accepted
date: 2026-09-23
summary: A launch leaves the rail's scroll alone, as the number chords do, so the current marker may sit on an off-screen card in an overflowing rail.
features: [launch, rail, focus]
tags: [ux, consensus]
files: [web/src/features/launch.ts]
tests: []
refs: [plan:new-session-improvement, plans/new-session-improvement/decisions/launched-card-scroll/decision.md, kb:adr/launch-opens-launched-session, kb:adr/rail-current-marker-means-shown-in-focus]
supersedes: []
---
**Context.** A launch in Focus now focuses the launched session (kb:adr/launch-opens-launched-session).
In manual order its card is appended at the bottom of the rail. When the rail overflows, the card,
and with it the current marker, stays scrolled out of view (review cycle 1, browser Minor 1). No
selection path in the dashboard scrolls a card into view: the number chords ⌥⌘5–9 and ⌥⌘0 already
mark off-screen cards.

**Options.** (A) `onLaunched` scrolls the launched card into view. (B) Leave rail scroll untouched.

**Decision.** B, by consensus in a decide debate. A launch-only scroll would make the rail's
viewport depend on which path selected the card. The launch record's pointer-versus-chord split
governs keyboard focus, not scroll. The mainhead, the live pane and keyboard focus moving to the
new session already meet #41.

**Consequences.** In an overflowing rail, the launched card may sit off-screen with the marker
on it. A visible marker on every selection path would be a new rail rule, proposed as backlog and
not decided here.
