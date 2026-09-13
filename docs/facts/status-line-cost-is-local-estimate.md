---
id: status-line-cost-is-local-estimate
type: fact
status: active
date: 2026-09-13
summary: Status-line cost.total_cost_usd is built unconditionally on every auth mode and matches the summed OTel cost, but is a list-price estimate, not an invoice.
features: [usage]
tags: [claude-code-format]
files: [internal/claudecode/status.go]
tests: []
refs: [docs/history/design/api-key-usage.md, "#9"]
verified: 2.1.269..2.1.269
guard: none
---
The status-line builder emits `cost: {total_cost_usd, total_duration_ms,
total_api_duration_ms, total_lines_added, total_lines_removed}` **unconditionally** — unlike
`rate_limits`, which is spread only when a window exists and so vanishes under API-key auth
(`docs/features/usage/spec.md` § Honesty). There is no auth gate on the cost block, so it is
the one spend figure available on every auth mode. Muster reads none of it today.

`total_cost_usd` is **cumulative for the session and resets**: a resumed session starts
fresh and a mid-session `/clear` zeroes it, so an account roll-up needs its own accumulator,
not a last-value read. It is `0` (serialised as a bare `0`) before the first API response.

It agrees exactly with the OTel cost counter (kb:fact/otel-usage-metrics-shape): in the
2026-09-13 probe the four `claude_code.cost.usage` delta points summed to
`0.0266904 + 0.0009480 + 0.0046666 + 0.0063821 = 0.0386871`, and the status line reported
`total_cost_usd: 0.0386871` in the same session. The two are one ledger read two ways and
can be mixed without double-counting.

The figure is **an estimate, not an invoice**: Claude Code computes it locally from a
list-price table. Per the bundle's own `modelPricing` description, that setting prices usage
at contracted rates and "affects every spend figure Claude Code reports — /cost, the status
line, the SDK `total_cost_usd`, `--max-budget-usd`, and the OpenTelemetry cost metric and
events — which remain USD estimates, not an invoice". For a standard account list price is
the billed rate; under a contracted rate the figure is wrong until `modelPricing` is set.

Evidence: the `cost:{total_cost_usd:_u(), …}` builder is byte-identical in the 2.1.269 and
2.1.270 bundles. Values come from the 2026-09-13 probe (rig instance 7,
`claude-haiku-4-5-20251001`, two turns) captured alongside the OTel export, which ran on
**2.1.270**, above the canary-ratified ceiling — so the range is pinned to 2.1.269, code path
confirmed there, no live run. Zero-before-first-response from the A0 rig findings.
