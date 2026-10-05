---
id: rail-select-mode-persists-across-bar-actions
type: decision
status: accepted
date: 2026-10-05
summary: Move to, Ungroup, Stop and Remove from the selection bar leave select mode and the selection on; only Done, Escape, Tiles or an empty rail end it.
features: [rail, actions, groups]
tags: [ux]
files: [web/src/features/groups.ts, web/src/render/selectbar.ts]
tests: []
refs: [plan:groups, plans/groups/web-implementation.md, kb:spec/groups, kb:adr/rail-select-mode-disables-card-drag]
supersedes: []
---
**Context.** The mockup cleared the selection and left select mode after every bar action. The spec's REQ-12 names only Escape, Done and switching to Tiles as the exits.

**Options.** (A) Every bar action ends the mode, as the mockup. (B) Bar actions keep the mode and the surviving selection; the mode ends on Done, Escape, a switch to Tiles, or when no session is left.

**Decision.** B. A developer who moves a selection often acts on it again (move, then stop; stop, then remove), and the authored specs keep using the checkboxes after Ungroup and after a partial Remove. The REQ's exit list is unchanged.

**Consequences.** After a bulk Remove that empties the rail the mode ends on its own. A removed session leaves the selection; the count reads the survivors.
