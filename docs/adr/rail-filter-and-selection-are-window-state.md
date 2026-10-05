---
id: rail-filter-and-selection-are-window-state
type: decision
status: accepted
date: 2026-10-05
summary: The rail's All · Groups · Ungrouped filter and the select-mode selection are per-window client state, never a preference; the filter resets to All on reload.
features: [rail, groups]
tags: [ux]
files: [web/src/features/rail.ts, web/src/app.ts]
tests: []
refs: [plan:groups, kb:spec/groups]
supersedes: []
---
**Context.** The filter hides sections; the selection is a transient set of ids. Prefs are shared across windows and persisted (kb:anchor/prefs.put).

**Options.** (A) A `railFilter` pref, shared and persisted. (B) Window-local state held by the rail controller, reset on reload (the spec's pick).

**Decision.** B. A filter that followed a window around would hide a session the developer had just launched elsewhere; the invariant that the focused session is never in a filtered-out section is cheaper to hold per window. Collapsed state, by contrast, is shared because it is the group's.

**Consequences.** No protocol change for either. The filter flips to All whenever focus would land in a hidden section (launch, ⌥⌘0, default focus). Switching to Tiles clears the selection.
