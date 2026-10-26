---
id: actions-mainhead-one-stop-resume-button
type: decision
status: superseded
date: 2026-10-13
summary: The Focus header has one Stop/Resume button, labelled by whether the session is alive, the same box under both labels; tile footers keep separate buttons.
features: [actions, focus]
tags: [ux, user-decision]
files: [web/index.html, web/src/render/mainhead.ts, web/src/features/focus.ts, web/src/style.css]
tests: []
refs: [plan:title-crop-stop-resume-button, kb:adr/rail-live-card-offers-no-actions, kb:adr/actions-remove-allowed-on-live-session]
supersedes: []
---
**Context.** The header shows Stop, Resume and Remove at once and only toggles their disabled state, so one of Stop and Resume is always greyed out taking room (#83). Swapping them must not move Remove when Stop is clicked.

**Options.** (A) Keep two buttons. (B) One button that reads `Stop` while the session is alive and `Resume` while it is dead, sized to the wider label so the swap shifts nothing. (C) Hide whichever does not apply, letting Remove move.

**Decision.** B (the developer, #83, 2026-10-13). Enablement follows the rules the two buttons had: `Stop` iff connected; `Resume` iff connected and a Claude session id is bound, with the existing reason as its hover while disabled. A click does what the matching button did — the confirm dialog for Stop, the resume request for Resume — through the one actions dispatcher. The button's box is the same under both labels and Remove's box is unchanged across a Stop or a Resume. Tile footers are untouched: their live and ended row shapes belong to the tiles rework (`TODO.md`, Tiles per group).

**Consequences.** `#mainhead` holds exactly one of a `Stop` and a `Resume` button at any time; locators scope to the header, since the dead surface's cap keeps its own Resume. Tests that asserted both buttons at once are rewritten. So that a Stop grows nothing, the dead session's ended age sits under the model in a slot the header reserves whether or not it shows; it no longer follows the model after a `·`.
