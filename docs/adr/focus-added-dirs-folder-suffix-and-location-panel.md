---
id: focus-added-dirs-folder-suffix-and-location-panel
type: decision
status: accepted
date: 2026-10-19
summary: The Focus header folder line ends in a muted +N while directories are added; a mouse-hover panel lists the location and the added directories.
features: [focus]
tags: [ux]
files: []
tests: []
refs: [plan:see-added-dirs, plans/see-added-dirs/mockups/final.html, kb:adr/focus-header-readout-sized-by-text, "#93", "#101"]
supersedes: []
---
**Context.** Added directories need a cue and a place to read them. Mockups
(`plans/see-added-dirs/mockups/options.html`) offered a count chip (A), a folder-line suffix (B) and a
third readout block (C).

**Decision.** B's cue with A's panel (the developer, 2026-10-19). The folder line ends in `+N`
while any directory is added, in `--fg-muted` (the mockup's teal is a state colour), and is never
ellipsized. Hovering the readout with the mouse opens a `.pop` panel that replaces the readout's
`title` on every session: Location (the launch checkout, then where Claude is while elsewhere),
then `Added directories · N`, each row the folder and branch over the full path. Mouse only, no
keyboard path. The rail card and tile header are unchanged.

**Consequences.** The suffix costs about three characters and needs no give-way step of its own.
The tile header's `.wh` hover keeps its plain text.
