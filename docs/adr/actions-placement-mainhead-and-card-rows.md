---
id: actions-placement-mainhead-and-card-rows
type: decision
status: accepted
date: 2026-08-27
summary: End, Resume and Remove live in a mainhead above the focused terminal and in hover-revealed action rows on rail cards and tile footers, behind confirm dialogs.
features: [actions, focus, rail, tiles]
tags: [ux, user-decision]
files: [web/src/render/mainhead.ts, web/src/sessions/card.ts, web/src/render/tiles.ts, web/src/render/confirm.ts]
tests: [web/e2e/actions.spec.ts, web/e2e/tiles.spec.ts]
refs: [docs/history/spec-changelog.md, plan:m4-reconcile]
supersedes: []
---
**Context.** Three session actions needed a home in both views without cluttering the dense card layout or hiding the action for the focused session behind a menu.

**Options.** (A) Actions only in a mainhead above the focused terminal. (B) Actions only as rows on cards and tile footers. (C) Both: the mainhead for the focused session and rows on every card and tile footer.

**Decision.** C, chosen from mockups. Rows on rail cards are revealed on hover or focus-within so the rail stays quiet, a call Damian made during the run. End and Remove open a confirm dialog; Escape and Cancel send nothing.

**Consequences.** A keyboard user reaches every action through focus-within. Tile footers already served as the tile's header bar and gain the same row. Buttons disable while the daemon connection is down.
