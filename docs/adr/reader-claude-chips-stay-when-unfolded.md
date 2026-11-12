---
id: reader-claude-chips-stay-when-unfolded
type: decision
status: accepted
date: 2026-11-12
summary: The claude section's summary row keeps its plan and tmp chips while unfolded, so the chips always agree with the rows below.
features: [reader]
tags: [ux]
files: []
tests: []
refs: [plan:claude-tmp-files, kb:adr/reader-scratchpad-in-folded-claude-section]
supersedes: []
---
**Context.** Mockup B drew the summary row without chips once unfolded. The plan's element table puts the chips inside the summary row without a fold condition, and its INV-3 requires the chips to agree with what unfolding shows.

**Decision.** The chips stay on the summary row in both fold states.

**Consequences.** One rendering of the summary row whatever the fold; the row is a little busier unfolded than the mockup drew it.
