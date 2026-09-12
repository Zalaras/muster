---
id: usage
type: spec
status: active
date: 2026-09-12
summary: Masthead usage bars, per-model weekly bar, per-session context gauge, usage poll and Keychain read.
features: [usage]
tags: [claude-code-format]
go: [internal/server/usage*.go, internal/server/gauges_test.go, internal/usage/**, internal/claudecode/status*.go, internal/claudecode/usageapi*.go, internal/claudecode/credentials*.go, internal/store/usage*.go]
web: [web/src/features/usage.ts, web/src/render/masthead*.ts, web/src/render/context*.ts, web/src/sessions/context*.ts]
e2e: [web/e2e/gauges.spec.ts, web/e2e/usage-model.spec.ts, web/e2e/helpers/gauges.ts, web/e2e/helpers/usageapi.ts]
protocol: [usage.refresh, ws.usage]
refs: [kb:adr/usage-context-gauge-shows-tokens-and-compactions, kb:adr/usage-unknown-renders-word-not-track, kb:adr/usage-masthead-model-from-freshest-sample, kb:adr/usage-masthead-one-selectable-model-window, kb:adr/usage-model-window-polled-from-oauth-api, kb:adr/usage-keychain-token-read-only, kb:adr/usage-sample-dedup-by-value, kb:adr/usage-no-hydration-across-restart, kb:adr/usage-history-persisted-not-rendered, kb:adr/usage-no-source-interface, kb:fact/context-window-shape, kb:fact/rate-limits-wire-shape, kb:fact/unknown-before-first-response, kb:fact/status-line-has-no-model-bucket, kb:fact/usage-api-oauth-shape, kb:fact/oauth-token-in-keychain, kb:fact/status-posts-arrive-in-pairs, kb:fact/refresh-interval-seconds, kb:ref/data-model, docs/design/design-system.md]
---
Usage answers two of the success criteria: how much of the account's limits are used, and
how much context each session has consumed.

## Per-session context gauge

Each session carries a context block: used percentage, absolute input tokens, window size
and a compaction counter (`kb:anchor/ws.session`). The first three come from the status
line's context object (kb:fact/context-window-shape) and are adopted only once the payload's
percentage is non-null; before a session's first API response they are unknown
(kb:fact/unknown-before-first-response), and they reset to unknown after `/clear`. The
compaction counter comes from `PreCompact`. The gauge always shows the percentage with the
absolute tokens and the compaction count, because window sizes differ by model and a
compaction returns the percentage to near zero
(kb:adr/usage-context-gauge-shows-tokens-and-compactions). The gauge turns to a warning
treatment past a threshold. Context lives on the session row and survives a daemon restart.

## Account-level bars

The masthead shows the current model, a five-hour bar and a seven-day bar, each with a used
percentage and a reset time, from the status line's rate-limit buckets
(kb:fact/rate-limits-wire-shape). The model shown is the freshest sample's
(kb:adr/usage-masthead-model-from-freshest-sample). A sample is recorded and broadcast only
when bucket values or the model changed, so the paired posts the status line emits produce
one row (kb:adr/usage-sample-dedup-by-value, kb:fact/status-posts-arrive-in-pairs); samples
are persisted as history but no history view is built
(kb:adr/usage-history-persisted-not-rendered, kb:ref/data-model). After a daemon restart the
buckets are unknown until the next status post (kb:adr/usage-no-hydration-across-restart).
A session that is idle posts nothing unless the status line's refresh interval is set
(kb:fact/refresh-interval-seconds).

A third bar shows one per-model weekly window, which the status line does not carry
(kb:fact/status-line-has-no-model-bucket). The daemon polls Claude Code's OAuth usage
endpoint on the `-usage-poll` interval, where zero disables it, and a masthead refresh
control wakes it early through `kb:anchor/usage.refresh`, coalesced to one in-flight fetch
(kb:adr/usage-model-window-polled-from-oauth-api, kb:fact/usage-api-oauth-shape). The wire
carries every window; the masthead shows the one selected by `prefs.usageModel`
(kb:adr/usage-masthead-one-selectable-model-window). A failed poll keeps the last-good list
and marks it stale with an error kind; the readout says so.

## Keychain

The poll authenticates with the Claude Code OAuth token read from the macOS Keychain item
(kb:fact/oauth-token-in-keychain) through `security find-generic-password`, re-read on every
poll and never cached. The daemon never writes, refreshes, logs, persists or forwards the
token (kb:adr/usage-keychain-token-read-only); tests use the `-usage-token-file` seam. The
threat model is unchanged: a same-user attacker already had the Keychain item.

## Honesty

Unknown renders as the word unknown with no track drawn, never as an empty or zero gauge
(kb:adr/usage-unknown-renders-word-not-track, docs/design/design-system.md "Honesty
rules"). Rate limits are unknown before a session's first response and absent entirely under
API-key authentication. Both halves of the Usage object (`kb:anchor/ws.usage`) have their
own change detection and always travel merged.

## Does not

No cost or spend is shown. There is no usage-source interface; a neutral sample type and one
aggregator carry both sources (kb:adr/usage-no-source-interface).
