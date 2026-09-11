---
id: nongoal-attention-ribbon-post-v1
type: decision
status: rejected
date: 2026-08-16
summary: The attention ribbon, a timeline of session events, is not built in v1; the event table already carries what it would need.
features: [rail]
tags: [revisit, ux]
files: []
tests: []
refs: [docs/history/spec-changelog.md, docs/design/ux-flows.md]
supersedes: []
---
**Context.** The design session sketched an attention ribbon: a horizontal timeline of when sessions needed input, failed and finished, sitting above or beside the rail. It would be the first history-rendering surface in the dashboard.

**Options.** (A) Build the ribbon in v1 alongside the rail. (B) Defer it past v1 and make sure nothing in the schema forecloses it.

**Decision.** B. The rail's sort already answers the question the ribbon answers most of the time, and the event table records every hook with a daemon-assigned sequence, so the ribbon costs no schema change whenever it is built.

**Consequences.** Any other timeline rendering, such as a usage history graph, joins the same post-v1 family rather than being built ahead of it. The event table stays append-only and keeps its correlation columns so that the deferral stays cheap.
