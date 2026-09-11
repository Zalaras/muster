---
id: usage-sample-dedup-by-value
type: decision
status: accepted
date: 2026-08-23
summary: A usage sample is recorded and broadcast only when its bucket values or model changed; duplicates are dropped by value, not by timestamp.
features: [usage]
tags: [store, claude-code-format]
files: [internal/usage/**]
tests: [TestAggregator_Record_IdenticalBackToBackSamplesDedupToOneRowAndOneBroadcast, TestIngestStatusLine_IdenticalPairPostDedupsThenAThirdChangedPostAddsASecondRow]
refs: [docs/history/spec-changelog.md, plan:m3-gauges, kb:fact/status-posts-arrive-in-pairs]
supersedes: []
---
**Context.** Status-line posts are event-driven and arrive in close pairs, and every post carries the same rate-limit buckets until the account's usage actually moves. Writing a row per post would fill the history table with identical rows.

**Options.** (A) Drop a post that arrives within a short window of the previous one. (B) Compare the new sample's bucket values and model with the last recorded sample and record only on change.

**Decision.** B. A time window would still let slow duplicates through and could drop a genuine change that happened to arrive quickly.

**Consequences.** The last recorded sample lives in the aggregator's memory and is the only comparison point, so a restart records the first post after start. A change in any bucket percentage, reset time or model is enough to record. The event table still receives every post; deduplication applies to samples only.
