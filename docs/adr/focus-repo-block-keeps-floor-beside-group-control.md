---
id: focus-repo-block-keeps-floor-beside-group-control
type: decision
status: accepted
date: 2026-10-05
summary: Beside the group control the Focus header's repo block keeps its 8-character floor and never hides; the title gives way first, so a long folder may ellipsize.
features: [focus, rail]
tags: [ux, user-decision]
files: [web/src/style.css, web/src/render/mainhead.ts, web/e2e/groups-focus.spec.ts]
tests: []
refs: [plan:groups, plans/groups/decisions/focus-header-floor-rule/decision.md, kb:adr/focus-model-never-truncates-name-blocks-give-way, kb:adr/focus-mainhead-wraps-to-second-row-when-narrow, kb:adr/focus-group-control-hides-below-640px-container-width]
supersedes: []
---
**Context.** The groups plan's REQ-10 said the repo and branch text never truncate beside the new group control. Validate measured on the base commit that a folder over 8 characters beside a long title already truncates at 900, 724, 600 and 500 px with no control present: the accepted give-way order shortens the title before the repo block drops below its floor. At 1140 px the control costs the folder 26 px that the title would otherwise have left it.

**Options.** (A) Keep the accepted order: the control is one more item taking free space; the repo block keeps its 8-character floor and never hides; a long folder may ellipsize above the floor. (B) Reverse the order while the control shows, so the title shortens before the folder loses text.

**Decision.** A (the developer, 2026-10-05). The requirement is amended to the floor rule; the control's hide-before-the-title-shortens step and the 6rem title floor stand.

**Consequences.** The E27 tests assert the floor, not whole text, with a long folder; a folder that fits the floor reads whole at every width. The accepted give-way order is unchanged.
