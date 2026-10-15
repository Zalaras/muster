---
id: custom-base-url-selects-1h-cache
type: fact
status: active
date: 2026-10-15
summary: A session with ANTHROPIC_BASE_URL set reports prompt_cache ttl "1h"; the same model reached directly or through HTTPS_PROXY reports "5m".
features: [usage]
tags: [claude-code-format]
files: []
tests: []
refs: [test/rig/captures/capture-2.jsonl, kb:fact/prompt-cache-5m-keepalive, kb:fact/haiku-main-cache-ttl-5m-on-2-1-299]
verified: 2.1.300..2.1.300
guard: none
---
Three Haiku sessions pointed at a pass-through reverse proxy with `ANTHROPIC_BASE_URL`
reported `ttl: "1h"` and `expires_at` an hour after the request. Four Haiku sessions started
the same minute without it reported `ttl: "5m"`; one of them reached the API through a CONNECT
proxy set with `HTTPS_PROXY`, so the proxy itself is not what decides.

A probe that must see the 5m keep-alive regime (kb:fact/prompt-cache-5m-keepalive) cannot
route through `test/rig/failproxy`; cut a session's network with an `HTTPS_PROXY` it can lose
instead.

Evidence: capture-2.jsonl, 2026-10-15, sessions 37bb9971, fd61760a, 65fa6c1c (base URL) against
d8cf390d, c1450d32, 1ae7afa6 (direct or HTTPS_PROXY), Haiku, 2.1.300.
