---
id: usage-all-windows-polled-and-refetched-at-reset
type: decision
status: accepted
date: 2026-10-26
summary: The OAuth usage fetch feeds the 5h, 7d and per-model bars and runs at each known reset; status line and fetch both feed 5h/7d, newest arrival wins.
features: [usage]
tags: [claude-code-format, user-decision]
files: [internal/server/usagepoll.go, internal/claudecode/usageapi.go, internal/usage/aggregator.go]
tests: []
refs: [plan:usage-bar-consistency, plans/bugs-one-batch/research/e3.md, kb:fact/usage-api-oauth-shape, kb:fact/status-line-around-failed-turns, kb:anchor/ws.usage, kb:anchor/usage.refresh, kb:adr/usage-sample-dedup-by-value]
supersedes: [usage-model-window-polled-from-oauth-api]
---
**Context.** The 5h and 7d bars came only from status posts, and a failed or idle session posts nothing more, so a bar could show 100% long after its window reset (#105). The usage fetch already returned `five_hour` and `seven_day` but the daemon read only the per-model rows, so the refresh button could not reach those bars.

**Options.** (A) Keep the fetch per-model only and fix the display alone. (B) Have every fetch feed all three bars, fetch at each reset, and let both sources feed 5h/7d.

**Decision.** B, the developer's choice (2026-10-22). The fetch runs at start, on the `-usage-poll` timer, on refresh and at the instant any known 5h, 7d or per-model reset passes, coalesced to one in flight. For each of 5h and 7d the most recently arrived value wins, whichever source sent it.

**Consequences.** The aggregator gains a second writer, the poller, beside the ingest worker. After a restart the bars fill from the start-up fetch instead of waiting for a status post. History rows from the fetch carry `source` `subscription-api` and the last known model.
