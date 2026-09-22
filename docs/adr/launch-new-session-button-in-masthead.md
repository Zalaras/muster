---
id: launch-new-session-button-in-masthead
type: decision
status: accepted
date: 2026-09-22
summary: One New session button sits in the masthead beside the view switcher, visible in both views; the rail head and the Tiles toolbar lose theirs.
features: [launch, views, tiles, rail]
tags: [ux, user-decision]
files: [web/index.html, web/src/features/launch.ts]
tests: []
refs: [plan:rail-card-improvements, "#38", kb:adr/tiles-new-session-button-in-toolbar, kb:adr/views-focus-and-tiles-peers]
supersedes: [tiles-new-session-button-in-toolbar]
---
**Context.** Each view carried its own New session button — the rail head in Focus, the density toolbar in Tiles — and each hid the other's. The rail-card layout review wanted the rail head for the sort select, the session count and a new density control, and launching a session is the same act from either view.

**Options.** (A) Keep a button per view. (B) One button in the masthead, immediately right of the Focus/Tiles switcher, present in both views.

**Decision.** B, the developer's decision at planning. The launch dialog, the launch chord and the launched session's promotion into the Tiles grid are unchanged.

**Consequences.** The launch controller binds one element. The views spec no longer needs the rule that each view hides the other's button. The rail head and the Tiles toolbar each lose a control, which is what makes room for the density control.
