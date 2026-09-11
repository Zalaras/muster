---
id: usage-no-source-interface
type: decision
status: accepted
date: 2026-08-23
summary: Usage sources share a neutral Sample type and one aggregator, with no Go interface type until a second source forces one.
features: [usage]
tags: [user-decision]
files: [internal/usage/**]
tests: [TestAggregator_Record_FirstSamplePersistsAndBroadcasts]
refs: [docs/history/spec-changelog.md, plan:m3-gauges, kb:anchor/ws.usage, kb:fact/rate-limits-wire-shape]
supersedes: []
---
**Context.** The spec asked for a small usage-source interface so API-key and telemetry sources could be added later. Only the subscription status line existed, and an interface designed against one implementation tends to describe that implementation.

**Options.** (A) Define a Go interface now with the status line as its sole implementation. (B) Define a neutral sample shape and one aggregator; let the seam be the sample plus the wire's source field.

**Decision.** B, settled with Damian in planning.

**Consequences.** A new source is a new producer of samples and nothing else changes on the wire or in the UI. When a second source did arrive it became a second concrete holder merged at the wire layer, and two concrete types were still judged too few to justify an interface. The question reopens only when a third source appears.
