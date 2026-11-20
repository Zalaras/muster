---
id: diff-comments-anchor-by-quote-ticks-by-content
type: decision
status: accepted
date: 2026-11-20
summary: Diff comments re-locate by their quoted lines and are kept as outdated when lost; review ticks key on the change's content.
features: [diff]
tags: [ux]
files: []
tests: []
refs: [plan:diff-viewer, plan:diff-viewer]
supersedes: []
---
**Context.** Comments and ticks outlive the diff they were made on; the code moves between refreshes.

**Options.** (A) Anchor on line numbers. (B) Anchor on quoted line text, matched nearest the recorded numbers.

**Decision.** B: a comment stores its range's ends and quoted rows; the dashboard places it where both ends match, attaches it to one surviving end as partly outdated, or lists it as outdated. A tick key is derived from the path and the change's lines.

**Consequences.** Placement and keys are web logic; the daemon stores both opaquely shaped. A change whose lines changed reads unticked.
