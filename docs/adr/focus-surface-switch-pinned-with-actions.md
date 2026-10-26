---
id: focus-surface-switch-pinned-with-actions
type: decision
status: superseded
date: 2026-10-13
summary: The Focus header's surface switch sits with the actions in one right-aligned cluster, placed by the header's width alone; the model moves with the readout.
features: [focus, surfaces]
tags: [ux, user-decision]
files: [web/src/style.css, web/src/features/focus.ts, web/index.html]
tests: []
refs: [plan:title-crop-stop-resume-button, kb:adr/focus-header-give-way-order-title-last, kb:adr/surfaces-shell-is-attach-target-not-session]
supersedes: []
---
**Context.** The `claude | shell | docs` switch sits between the readout and the action buttons, after the title, group control and readout. Any change to those texts — a rename, Claude moving to a worktree, a resume with a longer model name — moves the switch and the model sideways. The developer asked whether to place or pin it somewhere.

**Options.** (A) Leave it after the readout. (B) Pin the switch with the action buttons in one right-aligned cluster, as the tile footer already does (`.tfoot .acts` holds the switch as its first child). (C) Pin the switch to a fixed column left of the actions.

**Decision.** B (the developer, 2026-10-13). The switch is the first child of the header's action cluster, before the Stop/Resume button and Remove; the cluster hugs the header's right edge and drops to the second row whole (kb:adr/focus-header-give-way-order-title-last). Its position depends on the header's width only. The model stays with the readout and moves with it — after the readout's `·` on one line, or stacked under the readout in the narrowest headers (kb:adr/focus-header-give-way-order-title-last): pinning it would need a fixed title column, which the title's own floor-and-grow rule rules out.

**Consequences.** The header and the tile footer place the switch the same way. A longer title or readout moves the group control, the readout and the model, never the controls. The `#mainhead .surfseg` and `.acts` hooks keep their names.
