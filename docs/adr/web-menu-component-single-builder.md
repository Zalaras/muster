---
id: web-menu-component-single-builder
type: decision
status: accepted
date: 2026-10-05
summary: One menu builder serves every dashboard menu — rail ⋯, header ⋯, Move to and the Focus-header control — and the design system gains a Menu component.
features: [rail, focus, actions, groups]
tags: [ux]
files: [web/src/render/confirm.ts, web/src/style.css]
tests: []
refs: [plan:groups, kb:spec/groups]
supersedes: []
---
**Context.** The dashboard had no menu: every control was a button, a select or a dialog. Groups need four menus with the same shape (items, separators, a header row, a danger item, a chord hint).

**Options.** (A) Native `<select>` elements everywhere. (B) One per call site. (C) One builder producing a `role="menu"` panel of `role="menuitem"` buttons anchored below its opener, closing on Escape, outside pointerdown or choice, with arrow-key focus movement.

**Decision.** C. A select cannot hold Rename/Delete group actions; four hand-rolled copies would diverge. Tokens: `--bg-raised` ground, 1px `--line-control` border, `--bg-hover` on hover, `--danger` for a danger item, `--line` separators, mono `--fs-2xs` header row.

**Consequences.** The design system's Components section gains Menu, and Section header, Popover and Selection bar beside it. The launch dialog's Group row stays a native select because its options are values, not actions.
