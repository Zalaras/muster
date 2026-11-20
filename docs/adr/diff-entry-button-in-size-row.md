---
id: diff-entry-button-in-size-row
type: decision
status: accepted
date: 2026-11-20
summary: The way into the diff is a button at the right end of the pane's size row, present only while there is something to open.
features: [diff]
tags: [ux, user-decision]
files: []
tests: []
refs: [plan:diff-viewer, kb:adr/focus-header-give-way-order-title-last, kb:adr/reader-docs-is-third-surface-segment]
supersedes: []
---
**Context.** The Focus header already gives way as it narrows (kb:adr/focus-header-give-way-order-title-last); a permanent tab offers a view that is usually empty.

**Options.** (A) A fourth segment in the surface switch. (B) A header chip. (C) A line on the rail card. (D) A strip under the pane. (E) A tab on the pane's edge with a side panel. (F) A button in the existing size row.

**Decision.** F, chosen in the prototype after trying A, B and D and mocking C and E: flush right in the size row, which grows no taller; the row shows with only the button where there is no size note.

**Consequences.** The viewer replaces the pane like docs but is not a segment; while it is open no segment is selected. Tiles has no way in.
