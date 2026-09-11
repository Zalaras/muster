---
id: usage-history-persisted-not-rendered
type: decision
status: accepted
date: 2026-08-23
summary: Usage samples are persisted as history in v1 but no history UI is built; any timeline joins the post-v1 attention-ribbon family.
features: [usage]
tags: [store, revisit]
files: [internal/store/usage.go]
tests: [TestInsertUsageSample_EachCallInsertsARow, TestInsertUsageSample_PersistsConvertedValues]
refs: [docs/history/spec-changelog.md, plan:m3-gauges, kb:adr/nongoal-attention-ribbon-post-v1]
supersedes: []
---
**Context.** The spec wanted the weekly picture to be real history rather than a live number. Rendering history means a timeline component, which the design session had already deferred in another guise.

**Options.** (A) Do not persist; show live values only. (B) Persist every deduplicated sample and render a timeline. (C) Persist now, render nothing until a timeline surface exists.

**Decision.** C.

**Consequences.** The sample table accumulates from the first milestone that writes it, so a future graph has data from day one. The write path deduplicates by value so the table grows with change, not with post cadence. A polled second source keeps only its last-good list and writes no history.
