---
id: canary-refresh-interval-key-canary-only
type: decision
status: accepted
date: 2026-09-12
summary: The canary writes statusLine.refreshInterval, a settings key production never writes, so the idle-tick fact has a guard.
features: [canary, usage, ingest]
tags: [claude-code-format, testing]
files: [test/canary/harness_test.go, internal/claudecode/settings.go]
tests: [TestRefreshIntervalIsSeconds]
refs: [kb:fact/refresh-interval-seconds, kb:adr/canary-drives-installed-claude-through-production-chain, kb:adr/canary-run-d-holds-two-claude-sessions]
supersedes: []
---
**Context.** `kb:fact/refresh-interval-seconds` says `statusLine.refreshInterval` is in seconds and ticks while a session sits idle — a measured correction to an earlier reading of it as milliseconds, and the reason Muster's usage gauges go stale between turns. `MergeSettings` writes `statusLine` with `type` and `command` only, so a managed session never sets the key. The canary's standing invariant is that it drives the *production* chain verbatim, which means the fact cannot be observed inside a canary run at all: an idle managed session posts nothing.

**Options.** (A) Leave the fact unguarded and keep re-checking it with `/interface-probe`. (B) Have the canary write the key itself, after `MergeSettings`, on the bytes it writes to the scratch repo. (C) Make production write the key, so the canary observes it for free.

**Decision.** B. C is a product change smuggled in as a test change — whether Muster should poll an idle session is a separate question with its own cost, and nothing here settles it. A leaves a measured fact with no gate, which is the gap this whole pass exists to close. The key is written *after* the merge, so every other assertion still reads exactly what production produces, and the departure is one line in one place.

**Consequences.** The canary's settings are production-plus-one-key, stated as a gotcha in `test/CLAUDE.md`. Run D's status line now ticks every 5 s, which is what `TestRefreshIntervalIsSeconds` counts (2.1.269: 13 posts, mean gap 4.63 s over a 60 s window). Those ticks interleave with the event-driven posts, so `kb:fact/status-posts-arrive-in-pairs` gets harder to automate later — a 5 s cadence is still separable from a 435 ms pair, but a future guard has to do that separation. If production ever adopts the key, this ADR is superseded rather than edited.
