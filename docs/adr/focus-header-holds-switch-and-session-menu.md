---
id: focus-header-holds-switch-and-session-menu
type: decision
status: accepted
date: 2026-10-26
summary: The Focus header holds no Stop, Resume or Remove; its right cluster is the surface switch and one Session actions ⋯ opening the focused card's menu.
features: [focus, actions, surfaces]
tags: [ux, user-decision]
files: [web/index.html, web/src/features/focus.ts, web/src/render/mainhead.ts, web/src/style.css]
tests: [web/render/focus.spec.ts, web/e2e/focus-header.spec.ts]
refs: [plan:remove-unread-right-click-1, plans/remove-unread-right-click/research/e3.md, kb:adr/focus-header-give-way-order-title-last, kb:adr/web-menu-component-single-builder, kb:adr/rail-card-menu-offers-remove-and-marks-whatever-the-state]
supersedes: [actions-mainhead-one-stop-resume-button, focus-surface-switch-pinned-with-actions]
---
**Context.** The header's right cluster held the surface switch, one Stop/Resume button and Remove.
The developer asked for the Stop and Remove buttons to go from the top right (2026-10-26); the card
menu already holds Stop…, Resume and Remove….

**Options.** (A) Keep a Resume-only button on ended sessions. (B) Remove all three and put nothing in
their place. (C) Remove all three and add one ⋯ that opens the same menu as right-clicking the
focused session's rail card.

**Decision.** C (the developer, 2026-10-26). `.acts` holds the `claude | shell | docs` switch, then
one always-visible icon button `⋯` named "Session actions" (`aria-haspopup="menu"`, `aria-expanded`
kept in step). A click or keyboard activation opens the rail card menu through the same code, for
the focused session, anchored below the button. The cluster still hugs the header's right edge, is
placed by the header's width alone and drops to the second row whole
(kb:adr/focus-header-give-way-order-title-last); the model still moves with the readout. No
shortcut is bound.

**Consequences.** Stop, Resume and Remove for the focused session are reached from its ⋯ or its rail
card's menu, and Resume also from the dead surface's cap. The header no longer swaps labels, so the
cluster's width is fixed. The ended-age slot under the model stays. Tile footers are untouched.
