---
id: prompt-cache-1h-no-keepalive-warm-flips-at-expiry
type: fact
status: active
date: 2026-10-26
summary: In the 1h regime an idle session sends no keep-alive; expires_at holds at last request + 3600 s and warm turns false on the first post at that second.
features: [usage]
tags: [claude-code-format]
files: []
tests: []
refs: [kb:fact/prompt-cache-status-shape, kb:fact/main-cache-ttl-selected-per-model-off-binary, kb:fact/prompt-cache-5m-keepalive]
verified: 2.1.308..canary
guard: TestPromptCacheIdleFollowsRegime
---
With `ttl: "1h"`, each main-thread request sets `expires_at` to that request plus 3600 s
(within a second). Between requests nothing moves it: two Haiku sessions idled a full hour
(721 and 719 status posts at a 5 s `refreshInterval`) with `expires_at` unchanged, `requests`
unchanged and `warm: true`. Unlike the 5m regime (kb:fact/prompt-cache-5m-keepalive) there is
no keep-alive, and the hour is real at the API: a turn after 7.5 minutes idle read the whole
41 880-token prefix from cache.

At expiry the first status post at or after `expires_at` reports `warm: false`, with
`expires_at` unchanged (2 of 2: posts 0.2 s and 0.4 s after the expiry second). This settles the
flip kb:fact/prompt-cache-status-shape could not observe. The guard covers only the held
`expires_at`; the flip needs an hour and stays unguarded.

The next turn after expiry read nothing from cache (`cache_read_input_tokens: 0`), rewrote the
whole prefix at 1h (42 095 tokens) and posted `misses: 1`, `miss_recache_tokens: 42095`,
`last_miss_at` the request's own second and `warm: true` with a new `expires_at`. But
`last_miss_cause` stayed `null` and `miss_causes` `{}`; a missing cause does not mean no miss.

Not measured: Opus, Fable or Sonnet main threads in this regime beyond the transcripts' write
split, and a post-expiry miss with another session sharing the prefix.

Evidence: capture-5.jsonl from 2026-10-26T12:00Z, sessions fad93f27 (2.1.310, idle 12:00:53Z
to 13:02:05Z) and 667a14e4 (2.1.308, last request 12:08:53Z, idle to 13:09Z), Haiku; usage from
their transcripts. Both sessions behaved identically; 2.1.310 stays out of `verified` until its
canary is green.
