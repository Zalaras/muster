---
id: reader-scratch-row-age-bare
type: decision
status: accepted
date: 2026-11-12
summary: A scratch row shows its age as a bare formatAge bucket (now, 2m, 1h, 2d), like every list-row age column; ageAgo stays for readouts led by a verb.
features: [reader]
tags: [ux, consensus]
files: []
tests: []
refs: [plan:claude-tmp-files, plans/claude-tmp-files/decisions/row-age-text/decision.md, kb:adr/reader-scratchpad-in-folded-claude-section]
supersedes: []
---
**Context.** The approved table and mockup for #121 drew scratch-row ages as bare buckets (`2m`); REQ-9 named `ageAgo` (`2m ago`) and the first implementation followed it. Review cycle 1 raised the contradiction as a decision item.

**Decision.** Bare `formatAge`. Across the dashboard a verbless age in a list row's column is bare (launch recents, past sessions, the tile's ended timer, the canonical row in ux-flows.md), and `ageAgo` belongs to readouts led by a verb (`changed`, `ended`, `captured`, `checked`). Reached by consensus in a two-agent debate.

**Consequences.** About 30 px more of the path shows in a compact tile's 190 px nav. The sub-minute bucket reads `now`, not the mockup's `just now`.
