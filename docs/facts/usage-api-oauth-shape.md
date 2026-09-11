---
id: usage-api-oauth-shape
type: fact
status: active
date: 2026-09-11
summary: GET https://api.anthropic.com/api/oauth/usage with the OAuth bearer and anthropic-beta: oauth-2025-04-20 returns five_hour, seven_day and limits[].
features: [usage]
tags: [claude-code-format, auth]
files: [internal/claudecode/usageapi.go]
tests: [TestInstalledBinaryCarriesInterfaceStrings, TestFetchUsage_Success_SendsMeasuredHeadersAndPath, TestInterpretUsageReport_MeasuredLiveShape]
refs: [spikes/FINDINGS.md, plan:usage-model-bar]
verified: 2.1.251..canary
guard: TestUsageAPIResponseShape
---
`GET https://api.anthropic.com/api/oauth/usage` with headers `Authorization: Bearer
<claudeAiOauth.accessToken>` and `anthropic-beta: oauth-2025-04-20` returns HTTP 200 and:

- `five_hour` / `seven_day`: `{utilization: 7.0, resets_at: "2026-08-30T13:39:59.522275+00:00", …}`
  — percent scale, RFC3339 string with microseconds and a `+00:00` offset, not epoch.
- `seven_day_opus`, `seven_day_sonnet`, `seven_day_oauth_apps`: null on this account; `extra_usage` present.
- `limits[]`: `{kind: "session" | "weekly_all" | "weekly_scoped", group, percent (int), severity:
  "normal", resets_at (same string form), scope: null | {model: {id: null, display_name: "Fable"},
  surface: null}, is_active}`. The Fable row was `weekly_scoped` at 61%.
- Many feature-flag top-level keys (`amber_ladder`, `cinder_cove`, …) — ignore unknown keys.

The endpoint is undocumented. Evidence: one live call 2026-08-30 against 2.1.251; HTTP 200
again on 2026-09-10. The guard calls the production `FetchUsage` and one raw GET, asserting
`five_hour`, `seven_day`, `limits[]{kind, percent, resets_at}`, RFC3339Nano `resets_at` and a
`weekly_scoped` row with `scope.model.display_name`; the static tier asserts the path and the
beta header value as byte strings in the bundle.
