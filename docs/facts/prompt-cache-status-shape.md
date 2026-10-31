---
id: prompt-cache-status-shape
type: fact
status: active
date: 2026-10-14
summary: Status-line prompt_cache gives the main thread's cache — warm, ttl "1h", expires_at in epoch seconds a TTL after the last request; absent until a request.
features: [usage]
tags: [claude-code-format]
files: []
tests: []
refs: [kb:fact/status-line-keys, kb:fact/subagent-cache-ttl-5m, "#84"]
verified: 2.1.259..2.1.296
guard: TestPromptCacheExpiryIsStopPlusTTL
---
```json
"prompt_cache": {
  "warm": true, "ttl": "1h", "expires_at": 1790840879,
  "caching_observed": true, "requests": 10, "hit_ratio": 0.966,
  "cache_write_tokens": 13797, "recache_tokens_if_cold": 43899,
  "misses": 0, "miss_recache_tokens": 0, "expected_rebuilds": 0,
  "last_miss_at": null, "last_miss_cause": null, "miss_causes": {}
}
```

`expires_at` is Unix **seconds**. It moves to last request + 3600 s on each main-thread
request and holds still between requests: right after a turn, `expires_at` minus the post's
receive time is 3598–3599 s, and it then counts down across idle posts (24 of 24 sessions).
Every post in 24 sessions (1239 posts, Haiku, subscription OAuth) carried `ttl: "1h"`,
`warm: true` and `caching_observed: true`. `recache_tokens_if_cold` can be null.
`last_miss_cause` and `miss_causes` appear from 2.1.280 on; 2.1.259 lacks them.

The key is absent, not null, until this process makes its first request, the same way as
`rate_limits` (kb:fact/unknown-before-first-response). It is also missing from 25 posts that
did carry `current_usage`, and in 2 sessions it went missing again after it had appeared.
So a missing key means unknown, not cold.

`requests` counts main-thread requests only: 15 against 15 main-transcript messages, while
that session's two subagents made 6 more that were not counted (a second session: 7 against
6 main and 5 subagent). Subagent caches have their own, shorter TTL
(kb:fact/subagent-cache-ttl-5m).

Not observed: `warm` going false, since the longest idle stretch captured was 1137 s. So
whether Claude Code flips `warm` at expiry is unmeasured. `expires_at` compared with the
clock does not depend on it, and production writes no `refreshInterval`, so an idle session
sends no posts that could carry a flip anyway (kb:fact/refresh-interval-seconds). A `"5m"`
`ttl` (API-key auth, or other models) has not been observed either.

Evidence: existing probe captures re-read 2026-10-13, no new tokens spent; versions 2.1.259,
2.1.270, 2.1.280–2.1.296.

Raw probe captures (local only, not in git): `capture-3.jsonl`, `capture-9.jsonl`,
`capture-6.jsonl`.
