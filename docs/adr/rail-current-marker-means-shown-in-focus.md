---
id: rail-current-marker-means-shown-in-focus
type: decision
status: accepted
date: 2026-09-03
summary: The rail marks the session the Focus pane shows with a neutral treatment and aria-current; it never means live in this view, so Tiles renders none.
features: [rail, focus]
tags: [ux, user-decision]
files: [web/src/render/sessions.ts, web/src/sessions/card.ts, web/src/style.css]
tests: [web/e2e/focus-marker.spec.ts]
refs: [docs/history/spec-changelog.md, plan:ui-text-and-focus, docs/design/design-system.md, kb:adr/focus-rail-plus-one-live-pane, kb:adr/theme-contrast-exemptions-button-borders-state-tints, "#16"]
supersedes: []
---
**Context.** The only cue on the focused session's card was the browser's focus-within style, which vanished the moment the user clicked into the terminal. The focused id never reached the card reconciler. In Tiles the strip shows only sessions that are not live, so a marker meaning live in this view would never appear there.

**Options.** (A) A marker meaning live in this view, rendered in both the rail and the Tiles strip. (B) A marker meaning shown in the Focus pane, rendered on the rail only. (C) Leave the focus-within cue.

**Decision.** B, Damian's decision at planning. The treatment is neutral, the hover ground plus a thin inset ring on the edge token and an aria-current attribute, because state colours are spoken for.

**Consequences.** The card reconciler takes the focused id as input. No word tag is added; assistive technology gets the attribute. The marker carries no state meaning, so a reviewer checking colour finds nothing to exempt.
