> Parked post-v1 on 2026-09-13. **Nothing here is decided** —
> `kb:adr/nongoal-cost-tracking` (rejected) still binds, and a superseding ADR is the
> gate before any of this can be planned. Read this before planning the API-key usage
> item in `TODO.md` § M5+; the measured wire facts are `kb:fact/otel-usage-metrics-shape`
> and `kb:fact/status-line-cost-is-local-estimate`, which win over the narrative here.

# Usage under API-key auth — spike findings

Spike 2026-09-13 for [#9](https://github.com/Zalaras/muster/issues/9) ("support API usage
billing as well"). The question asked: can Muster show **token usage** and a **dollar
amount** for a session authenticated with an API key rather than a subscription?

Measured against **2.1.270** by two methods: reading the status-line payload builder and
the telemetry call sites straight out of the installed bundle, and one live probe session
(rig instance 7, `claude-haiku-4-5-20251001`, prompt "say hi", killed after) with an OTLP
receiver on `127.0.0.1:8797`. Damian has no API account, so everything below is measured
on a **subscription**; the auth-independence claims come from the code path, which is the
one link not verified live (see § Limitations).

## Verdict

**Tokens and dollars: yes, both, from two independent sources.**
**A gauge: no — and that is not a bug to fix.**

Those are separate answers and the entry in `TODO.md` conflated them. The issue title
says the gauges are "dead"; the honest reading is that under API-key auth there is no
quantity a gauge could show, so the fix is a different surface, not a repaired gauge.

## 1. Why the gauge cannot be saved

The status-line payload builder in 2.1.270 emits `rate_limits` only when at least one
window exists:

```js
let De = pF();                       // windows parsed from anthropic-ratelimit-unified-* headers
let He = {
  ...De.five_hour && {five_hour:{used_percentage: De.five_hour.utilization*100, resets_at: …}},
  ...De.seven_day && {seven_day:{…}},
  ...xe()==="gateway" && De.overage && {spend_limit:{…}},
};
…
...(He.five_hour || He.seven_day || He.spend_limit) && {rate_limits: He},
```

Both windows are derived from the `anthropic-ratelimit-unified-*` **response headers**,
which only the subscription channel returns. Under an API key no headers arrive, `De` is
empty, and the whole `rate_limits` key is absent — which is exactly what
`docs/features/usage/spec.md` § Honesty already records, now with the mechanism behind it.

Anthropic's own embedded SDK schema states it directly:

> `rate_limits_available` — "False when plan rate limits do not apply (**API key**,
> Bedrock, Vertex, or missing profile scope) — `rate_limits` will be null."
> `subscription_type` — "'pro', 'max', 'team', 'enterprise' **or null for API key / 3P
> provider sessions**."

`spend_limit` is the one spend-shaped window in the payload, and it is gated on
`xe()==="gateway"` — Claude Code **Gateway** deployments only, not plain API-key auth
(consistent with `kb:fact/status-line-has-no-model-bucket`).

There is also no *quota* to gauge. API-key accounts have per-minute throughput limits
(RPM / ITPM / OTPM), not a budget window that fills and resets. The Rate Limits API
returns the **configured** limits, never utilization, and is Admin-only. So a percentage
bar has no numerator and no denominator.

## 2. What is available

| Source | Carries | Scope | New infrastructure |
|---|---|---|---|
| Status line `cost.total_cost_usd` | session USD | per session, cumulative | **none** — already in every post Muster ingests |
| OTel `claude_code.cost.usage` | USD | per model × `query_source` | OTLP receiver |
| OTel `claude_code.token.usage` | tokens, `type` = input / output / cacheRead / cacheCreation | per model × `query_source` | OTLP receiver |
| OTel `api_request` log event | per-request `cost_usd`, `cost_usd_micros`, all four token counts, `prompt.id`, `request_id`, `duration_ms`, `ttft_ms` | per request | OTLP receiver |

Neither path has an auth gate: `cost:{total_cost_usd:_u(), …}` is built unconditionally,
and the telemetry call site increments both counters after every API response regardless
of how the client authenticated.

**Cross-validation (the probe's main result).** The four OTel cost deltas summed to
`0.0266904 + 0.0009480 + 0.0046666 + 0.0063821 = 0.0386871`, matching the status line's
`cost.total_cost_usd` of **0.0386871** exactly. The two sources are the same ledger read
two ways, so they can be mixed without double-counting or reconciliation.

Note what the status line does **not** carry: cumulative tokens consumed.
`context_window.total_input_tokens` is window *occupancy*, not consumption. Tokens
therefore require the OTel path; dollars do not.

## 3. Traps — the difference between solid and approximate

1. **Delta temporality.** Measured `aggregationTemporality: 1` (DELTA), not cumulative.
   Each export carries only the increment since the previous one, and `startTimeUnixNano`
   advances each time. A receiver that treats a point as a running total reports the last
   few seconds of spend as the session total. Muster must accumulate.
2. **`session.id` is Claude's, not Muster's.** Every OTel point keys on Claude Code's
   `session_id`, which `/clear` re-mints in the same pane
   (`kb:fact/clear-mints-new-session-id`). Muster keys session identity on the tmux target
   (CLAUDE.md hard rule), so a roll-up joined on `session.id` silently splits one session's
   totals in two across a `/clear`.
3. **Identity attributes on every point.** Measured: `user.email`, `organization.id`,
   `user.account_uuid`, `user.account_id`, `user.id`. These must be dropped at ingest, in
   the spirit of `kb:adr/issue-payload-allowlist-never-dump`. Keep
   `OTEL_LOGS_EXPORTER=none` unless the `api_request` event is actually wanted — the log
   stream also carries `user_prompt` and `assistant_response` events, which is prompt text
   near the daemon (`OTEL_LOG_USER_PROMPTS` / `OTEL_LOG_ASSISTANT_RESPONSES` gate the
   bodies, both default off, but the events themselves ship).
4. **Session cost resets.** `total_cost_usd` starts fresh on a resumed session and is
   zeroed by a mid-session `/clear`, so an account-level roll-up needs its own accumulator
   and cannot be a `max()` or a last-value read.
5. `query_source` splits the series (`main`, `auxiliary`, `subagent`; the `api_request`
   event spells it `repl_main_thread`). Summing one value only undercounts.

## 4. Limitations

- **The dollars are an estimate, not an invoice.** Claude Code computes them locally from
  a list-price table. Anthropic's own setting description: `modelPricing` "affects every
  spend figure Claude Code reports — /cost, the status line, the SDK `total_cost_usd`,
  `--max-budget-usd`, and the OpenTelemetry cost metric and events — which remain **USD
  estimates, not an invoice**". For a standard account list price *is* the billed rate, so
  the estimate is close; for a contracted rate it is wrong until `modelPricing` is set.
- **No authoritative billed figure is reachable.** The Usage & Cost Admin API
  (`/v1/organizations/usage_report/messages`, `/v1/organizations/cost_report`) is the only
  source of truly billed dollars, and it requires an Admin API key — the docs state "The Admin
  API is unavailable for individual accounts." The likely reporter of #9, an individual on
  an API key, cannot use it at all. It is also org-wide rather than per-session, lags ~5
  minutes, and is daily-granularity for cost.
- **OTel covers only sessions Muster launches** with the env set. A session started
  outside Muster reports nothing. The status-line cost has no such limit — it arrives for
  any session whose status line Muster configured.
- **Bedrock / Vertex**: the cost metric exists, but there is no first-party usage or cost
  API behind it.
- **Unverified link**: everything was measured on a subscription. That `cost` and the OTel
  counters behave identically under an API key rests on there being no auth gate in the
  code path, not on a live API-key run. A borrowed key for one probe session would close
  this.

## 5. Shape if it is ever built

Two tiers, independently shippable, in this order:

- **Tier 1 — dollars, near-free.** Render the figure already on the wire:
  `usage.source: "api"` carrying per-session spend from `cost.total_cost_usd`, plus an
  account roll-up accumulated across sessions. No new process, no new env var, no new
  dependency, and it works for subscription users too, since it is the same field. Must be
  labelled *estimated spend* and must not be drawn as a gauge
  (`kb:adr/usage-unknown-renders-word-not-track` — a track that cannot fill is exactly the
  dishonest render that ADR forbids).
- **Tier 2 — tokens.** An OTLP/HTTP-JSON receiver in musterd (`POST /v1/metrics`), enabled
  through `claudecode.LaunchEnv()`. `http/json` avoids a protobuf dependency. This is what
  buys token totals by type and model, and per-turn attribution via `prompt.id`, which
  correlates with the `prompt_id` Muster already uses as a hook correlation key. All
  OTel-format parsing belongs in `internal/claudecode/` per the hard rule.

## 6. Gate before planning

`kb:adr/nongoal-cost-tracking` is `rejected` and covers exactly this. Its reasoning —
"Cost is not what Damian cares about; the usage limits are what actually stop work" —
remains true for Damian on a subscription, and is precisely what fails for an API-key
user, for whom dollars *are* the binding constraint. That asymmetry is the superseding
argument, and it is a superseding ADR, not a plan. Note the existing scope line in
`docs/features/usage/spec.md` § Does not ("No cost or spend is shown") moves with it.

## Evidence

- Bundle read: `/Users/damian/.local/share/claude/versions/2.1.270` — status-line builder
  `eRs(…)`, telemetry call site incrementing both counters, the embedded SDK schema for
  `rate_limits_available` / `subscription_type`, and the `modelPricing` setting text.
- Live probe: rig instance 7, one `claude-haiku-4-5-20251001` session, two turns, OTLP/HTTP-JSON
  to a local receiver at `OTEL_METRIC_EXPORT_INTERVAL=5000`; status-line posts captured in
  parallel on `127.0.0.1:8787`. Session killed and both receivers stopped at the end.
- Docs consulted: Claude Code OpenTelemetry metrics reference; Usage and Cost API; Rate
  Limits API.
