---
id: nongoal-cost-tracking
type: decision
status: rejected
date: 2026-08-16
summary: No cost or spend tracking; on a subscription the usage windows are the real constraint, so the gauges show limits, not money.
features: [usage]
tags: [user-decision]
files: []
tests: []
refs: [SPEC.md, docs/history/interview-notes.md, kb:adr/usage-history-persisted-not-rendered, kb:adr/usage-no-source-interface]
supersedes: []
---
**Context.** The mockup's usage view carried spend estimates, tokens by day from telemetry, tool-call counts and a bottleneck analysis. Damian runs Claude Code on a subscription.

**Options.** (A) Track cost per session and per day, which needs token counts from telemetry and a price table kept current. (B) Show only the subscription's rate-limit windows and per-session context, which the status line already delivers.

**Decision.** B. Cost is not what Damian cares about; the usage limits are what actually stop work.

**Consequences.** No telemetry exporter, no price table and no token-by-day storage. The usage data model keeps a source field so an API-key or telemetry source could be added, but neither is built. Tool-call counts and the bottleneck view were cut with it.
