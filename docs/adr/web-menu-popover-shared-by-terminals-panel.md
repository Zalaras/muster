---
id: web-menu-popover-shared-by-terminals-panel
type: decision
status: accepted
date: 2026-11-20
summary: The menu builder's popover part is shared; the Terminals panel is its second user as a dialog, since role=menu cannot hold row buttons and a field.
features: [surfaces, groups]
tags: [ux]
files: [web/src/render/menu.ts, web/src/style.css]
tests: []
refs: [plan:better-terminal, kb:adr/web-menu-component-single-builder]
supersedes: []
---
**Context.** The Terminals panel lists terminals with a rename ✎ and a close × on each row and an inline text field for renaming. kb:adr/web-menu-component-single-builder made one builder serve every menu so they never diverge, but that builder produces a `role="menu"` of `role="menuitem"` buttons, a pattern that allows no nested controls and whose arrow-key and type-ahead handling would fight a text field.

**Options.** (A) Extend the menu into a superset that also takes rows with inner controls. (B) A separate hand-rolled popover. (C) Split the builder: share its popover part, let the menu and the Terminals panel each build their own content on it.

**Decision.** C. The anchoring below the opener, closing on outside pointerdown, Escape or a choice, repositioning on resize and scroll, focus return to the opener and the Menu tokens become one shared part. The existing menus use it unchanged. The Terminals panel uses it as a non-modal `role="dialog"` named `Terminals`, with native buttons and an input in its rows. A would make one component carry two ARIA patterns with menu rules switched off; B is the divergence the earlier decision exists to prevent.

**Consequences.** Refines kb:adr/web-menu-component-single-builder: one builder still owns how every popover opens, closes and looks. The design system's Menu entry gains the Terminals panel as a second content kind.
