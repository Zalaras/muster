---
id: rail-note-marker-blanks-inherited-title
type: decision
status: accepted
date: 2026-10-26
summary: A rail card's note marker carries an empty title in the card template, so hovering it never shows the repo block's native tooltip over the note.
features: [rail, notes]
tags: [ux]
files: [web/index.html]
tests: [web/render/notes.spec.ts]
refs: [plan:remove-unread-right-click-1, "#106", plans/remove-unread-right-click/research/e4.md, plans/remove-unread-right-click-1/web-implementation.md]
supersedes: []
---
**Context.** The note marker sits inside the card's repo block, whose `title` is `<repo> / <branch>`.
An element with no title inherits its ancestor's, so about a second after the note tip opened Chrome
laid the repo tooltip over it (#106).

**Options.** (A) Give the marker an empty `title` and keep the repo block's. (B) Move the title onto
the folder and branch lines only.

**Decision.** A (the developer, 2026-10-26), written as a static `title=""` on the marker in the rail
card template rather than on each render pass, so the one-second tick never touches it.

**Consequences.** Hovering the marker shows only the note tip; the folder, branch and the gaps between
them keep the repo tooltip. The tile header's marker has no titled ancestor and needs nothing.
