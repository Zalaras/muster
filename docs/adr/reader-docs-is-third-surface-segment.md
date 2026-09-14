---
id: reader-docs-is-third-surface-segment
type: decision
status: accepted
date: 2026-09-14
summary: The reader is a third docs kind in the claude | shell segment, replacing the pane, with a right-hand file nav; drawer, split and window-only were rejected.
features: [reader, surfaces]
tags: [ux]
files: [web/src/terminal/surfaceswitch.ts]
tests: []
refs: [plan:markdown-viewing, kb:adr/surfaces-shell-control-in-tile-footer, kb:adr/surfaces-shell-is-attach-target-not-session, docs/design/design-system.md]
supersedes: []
---
**Context.** Reading markdown needed a home in a dashboard whose pane is a live terminal and whose rail already carries attention state. Four placements were mocked in both views (`docs/design/mockups/markdown-viewing/`).

**Options.** (A) A third segment in the existing surface switch: the document replaces the terminal in that pane, one click away, keyboard-addressable like the other two. (B) A drawer over the right side with a file list. (C) A split beside the terminal, or a reading column beside the grid. (D) A pop-out window only.

**Decision.** A, for both views, with a right-hand nav in the docs-site pattern: the plan pinned on top, a filterable tree of files, an outline of the open document. The pop-out survives as a reader feature, not as the placement. Files-only versus files-plus-outline was debated and the outline is in.

**Consequences.** The reader follows every rule the shell surface established: built once and mutated, selectable on a dead session, disposed when hidden, never a terminal socket. The reader's bar leaves room for the plan-approval controls a later feature adds. A tile shows a compact reader with the nav collapsed at the dense grid.
