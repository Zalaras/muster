---
id: usage-model-window-polled-from-oauth-api
type: decision
status: accepted
date: 2026-08-30
summary: The per-model weekly window comes from the daemon polling Claude Code's OAuth usage endpoint on a timer plus a coalesced manual refresh, not the status line.
features: [usage]
tags: [claude-code-format, user-decision]
files: [internal/server/usagepoll.go, internal/claudecode/usageapi.go, internal/usage/modelscoped.go]
tests: [TestUsagePoller_Tick_SuccessRecordsWindows, TestUsagePoller_Refresh_ChannelCoalescesToOneBufferedSignal, web/e2e/usage-model.spec.ts]
refs: [docs/history/spec-changelog.md, docs/history/protocol-changelog.md, plan:usage-model-bar, kb:fact/status-line-has-no-model-bucket, kb:fact/usage-api-oauth-shape, kb:anchor/ws.usage, kb:anchor/usage.refresh, kb:adr/usage-no-source-interface]
supersedes: []
---
**Context.** Claude Code's own usage screen shows a third bar, the per-model weekly limit, which the masthead lacked. The status line carries the five-hour and seven-day buckets but deliberately omits this window, so the existing source could never supply it.

**Options.** (A) Wait for the status line to grow the field. (B) Have the daemon call the same endpoint the usage screen calls, with the same credential, on a timer and on demand.

**Decision.** B, Damian's choice. The poller fetches at start and on a slow interval, and a refresh endpoint wakes it, coalescing concurrent requests into one fetch.

**Consequences.** Muster gains a second usage source, the seam the spec had reserved; it became a second concrete holder beside the aggregator rather than an interface. A failed fetch keeps the last good values and labels them stale. The endpoint's shape is a measured fact, guarded by the canary, because nothing about it is promised.
