---
id: unmentioned-req-costs-a-review-minor
type: lesson
status: active
date: 2026-09-11
summary: An implementation log said nothing about one requirement it had deferred; the reviewer reconstructed the intent from the diff. About 25 minutes and a wave.
features: []
tags: [pipeline]
roles: [daemon-impl, web-impl]
files: []
tests: []
refs: [plan:auto-update, .claude/agents/daemon-impl.md, .claude/agents/web-impl.md]
---
**What happened.** A daemon log listed Changes and Decisions but said nothing about one requirement that had deliberately been left out. The reviewer could not tell a miss from a deferral, worked it out from the diff, and filed it.

**Cost.** About 25 minutes of review and a fix wave for a sentence that belonged in the log.

**What changed.** Every REQ the plan lists for a side appears in the log, in Changes or in Decisions as deliberately not done with the reason. An unmentioned requirement is a review Minor at best.
