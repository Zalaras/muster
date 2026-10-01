---
id: rail-repo-line-wraps-at-slash
type: decision
status: accepted
date: 2026-10-01
summary: The repo readout wraps at the slash, folder over branch, each line truncated with a hover; compact and tile headers stay one line; the model never truncates.
features: [rail, focus, tiles]
tags: [user-decision, ux]
files: []
tests: []
refs: [plan:stale-dirs-models-branches, docs/design/mockups/claude-location/c-long-names.html]
supersedes: []
---
**Context.** Long folder and branch names took the whole repo line and were cut off. In the
Focus header there was no hover, and the model was the first thing pushed out.

**Options.** (A) Truncate the one line, as today. (B) Give each name its own cap on one line.
(C) Wrap at the `/`, with the folder (and its trailing slash) on one line and the branch on
the next.

**Decision.** C, the developer's call on the `c-long-names.html` mockup. Each line truncates
at the end on its own. In the Focus header the folder is capped at 30ch and the branch at
44ch, the model never truncates, and hovering the readout shows the full launch path and
branch, plus where Claude is when it has moved. The header's session name also gets a hover.
Compact density and the tile header keep one line. The tile header gets the same hover.

**Consequences.** A card's repo block is two lines in comfortable and expanded density, so a
locator reads the folder and branch lines separately, never the block's concatenated text.
