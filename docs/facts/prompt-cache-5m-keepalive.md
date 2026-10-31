---
id: prompt-cache-5m-keepalive
type: fact
status: active
date: 2026-10-15
summary: A 5m-ttl session idles with a keep-alive every 30 s for an hour after its last request; expires_at is the last keep-alive plus 300 s.
features: [usage]
tags: [claude-code-format]
files: []
tests: []
refs: [kb:fact/prompt-cache-status-shape, kb:fact/haiku-main-cache-ttl-5m-on-2-1-299, kb:fact/prompt-cache-outage-goes-cold-after-ttl, "#92"]
verified: 2.1.300..2.1.300
guard: TestPromptCacheIdleFollowsRegime
---
While a session with `ttl: "5m"` sits idle, Claude Code sends a keep-alive about every 30 s
and `prompt_cache.expires_at` moves to that keep-alive plus 300 s. The keep-alives add no
transcript line and do not count in `requests`, but they really hold the cache: a turn after
39 minutes idle read the whole prior context from cache (137 185 tokens, `misses` unchanged).

They stop an hour after the last **main-thread request**, not the first: a session whose
requests were at 10:44:15 and 10:54:18 sent its last keep-alive at 11:53:49 and went cold at
11:58:49; one whose last request was 11:06:23 (first 10:45:02) sent its last at 12:06:23 and
went cold at 12:11:23. So the cache's real lifetime after a request is about 65 minutes:
the hour of keep-alives plus the last 5-minute TTL. At that expiry a status post reports
`warm: false` with `expires_at` unchanged, and the next request misses
(`last_miss_cause` `ttl_expired_1h` in production).

A status line without `refreshInterval` renders only on events, so production sees these
moves only about every 5 minutes, each post landing about a second after the previous
`expires_at` (kb:fact/prompt-cache-status-shape describes the 1h regime, where `expires_at`
holds still between requests).

The 5m regime was every main-thread `prompt_cache` post of Fable 5.1 and Opus 5.5 sessions
the developer ran on 2.1.300 (Muster's own store, 2026-10-15), and of a direct Haiku session.

Not measured: what picks 5m over 1h besides a custom base URL
(kb:fact/custom-base-url-selects-1h-cache), and whether the hour is counted from the
request's start or its response.

Evidence: capture-2.jsonl, 2026-10-15, sessions d8cf390d and c1450d32 (Haiku, 2.1.300), with
keep-alive timing from a CONNECT proxy's log; production sessions from Muster's store,
2026-10-13 to 2026-10-15.
