---
id: focus-header-readout-sized-by-text
type: decision
status: accepted
date: 2026-10-13
summary: The Focus header's repo readout wraps at the slash with each line as wide as its text, no character cap; rail card and tile header keep their shapes.
features: [focus, rail, tiles]
tags: [ux, user-decision]
files: [web/src/style.css, web/src/render/mainhead.ts, web/src/render/repolines.ts]
tests: []
refs: [plan:title-crop-stop-resume-button, kb:adr/focus-header-give-way-order-title-last]
supersedes: [rail-repo-line-wraps-at-slash]
---
**Context.** The superseded record capped the Focus header's folder line at 30ch and its branch line at 44ch. Measured on `main` (2026-10-13, Chromium): a 35-character folder is cut to 30 characters at a 1700 px header with about 750 px of the row free, which #73 reports as the title squashed for no reason. The hover already carries the full text.

**Options.** (A) Keep the caps. (B) No cap in the header: each line is as wide as its text and ellipsizes only for want of room, in the order kb:adr/focus-header-give-way-order-title-last fixes. (C) A larger cap.

**Decision.** B (the developer, 2026-10-13: "uncapped should be fine, it would be a responsive design", as long as nothing is pushed over another element or off screen). Everything else the superseded record decided stands: the readout wraps at the `/`, folder (with its trailing slash) over branch, each line ellipsized at its end on its own; the rail card keeps that shape in comfortable and expanded density and one line in compact; the tile header keeps one line; the header's location group, the rail's readout and the tile's where carry the full launch path and branch, plus where Claude is when it has moved, as their hover; the header's session name has a hover; the model never truncates.

**Consequences.** A long branch widens the readout and brings the two-row header on at a wider window than before. The 8-character floor is the only lower bound. A locator still reads the folder and branch lines separately.
