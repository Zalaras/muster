---
id: otel-usage-metrics-shape
type: fact
status: active
date: 2026-09-13
summary: Claude Code's OTel export carries cost in USD and tokens by type as DELTA sums keyed on Claude's session_id, with identity attributes on every point.
features: [usage]
tags: [claude-code-format]
files: []
tests: []
refs: [docs/history/design/api-key-usage.md, "#9"]
verified: 2.1.269..2.1.269
guard: none
---
With `CLAUDE_CODE_ENABLE_TELEMETRY=1`, `OTEL_METRICS_EXPORTER=otlp` and
`OTEL_EXPORTER_OTLP_PROTOCOL=http/json`, Claude Code POSTs OTLP JSON to
`<endpoint>/v1/metrics` (and `/v1/logs` when `OTEL_LOGS_EXPORTER=otlp`). The two usage
metrics are incremented after every API response, at a call site with **no auth gate** —
the same code runs on a subscription and under an API key:

- `claude_code.cost.usage` (USD, `asDouble`), attributes `model`, `query_source`.
- `claude_code.token.usage` (unit tokens, `asInt`), the same attributes plus
  `type` = `input` | `output` | `cacheRead` | `cacheCreation` — four points per export.

Three traps, all measured rather than inferred:

1. **`aggregationTemporality: 1` — DELTA, not cumulative.** Each export carries only the
   increment since the last, with `startTimeUnixNano` advancing to the previous export's
   end. A receiver must accumulate; reading a point as a running total reports seconds of
   spend as the session total.
2. **`session.id` is Claude Code's `session_id`**, which `/clear` re-mints in the same pane
   (kb:fact/clear-mints-new-session-id). Muster keys on the tmux target, so a roll-up joined
   on `session.id` splits one session's totals across a `/clear`.
3. **Every point carries identity**: `user.email`, `organization.id`, `user.account_uuid`,
   `user.account_id`, `user.id`. Drop these at ingest.

`query_source` splits each series (`main`, `auxiliary`, `subagent`), so summing one value
undercounts. The `/v1/logs` stream carries an `api_request` event per request with
`cost_usd`, `cost_usd_micros`, all four token counts, `model`, `duration_ms`, `ttft_ms`,
`request_id` and **`prompt.id`** — the same correlation key hooks deliver as `prompt_id`. It
also carries `user_prompt` and `assistant_response` events (bodies gated by
`OTEL_LOG_USER_PROMPTS` / `OTEL_LOG_ASSISTANT_RESPONSES`, default off).

Evidence: live probe 2026-09-13, rig instance 7, one `claude-haiku-4-5-20251001` session of
two turns at `OTEL_METRIC_EXPORT_INTERVAL=5000`. Metric names and the call site are
byte-identical in the 2.1.269 and 2.1.270 bundles; the live run was on **2.1.270**, above the
canary-ratified ceiling, so the range is pinned to 2.1.269 — code path confirmed there, no
live run. Measured on a subscription: auth-independence is from the code path, not an
API-key run.
