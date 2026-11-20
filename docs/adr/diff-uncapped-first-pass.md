---
id: diff-uncapped-first-pass
type: decision
status: accepted
date: 2026-11-20
summary: The diff is sent and drawn whole, with no size cap, no folding and no on-screen-only rendering; only large or NUL-holding untracked files read as binary.
features: [diff]
tags: [ux, user-decision, revisit]
files: []
tests: []
refs: [plan:diff-viewer, plan:diff-viewer]
supersedes: []
---
**Context.** The prototype capped files and lines; very large diffs cost the browser, not the daemon.

**Options.** (A) Caps that cut off and say so. (B) Fold large files behind Load. (C) Render only what is on screen. (D) No cap, handled if a real diff proves slow.

**Decision.** D, the developer's choice (2026-11-19). An untracked file over 256 KiB or holding a NUL byte reads as binary, and so does an image.

**Consequences.** Revisit with B or C when a real diff is slow; images stay `Binary file not shown` for now.
