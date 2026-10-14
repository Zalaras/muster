---
id: haiku-main-cache-ttl-5m-on-2-1-299
type: fact
status: active
date: 2026-10-14
summary: On 2.1.299–2.1.300 a Haiku session's main thread writes 5-minute cache and prompt_cache reports ttl "5m", where 2.1.259–2.1.296 reported "1h".
features: [usage]
tags: [claude-code-format]
files: []
tests: []
refs: [test/rig/captures/capture-4.jsonl, kb:fact/prompt-cache-status-shape, kb:fact/subagent-cache-ttl-5m, "#84"]
verified: 2.1.299..2.1.300
guard: none
---
Both main-thread requests of a Haiku session wrote `ephemeral_5m_input_tokens` with
`ephemeral_1h_input_tokens: 0`, and every `prompt_cache` post carried `ttl: "5m"` with
`expires_at` exactly 300 s after the request. kb:fact/prompt-cache-status-shape measured
`"1h"` on every post of 24 Haiku sessions on 2.1.259–2.1.296 with the same subscription, so
the main thread's TTL is not fixed: it changed between versions, or depends on something not
yet identified (model, account, a server-side flag). Warmth must be read from each
session's own `ttl` and `expires_at`, never from an assumed hour.

Not measured: Opus, Sonnet or Fable on 2.1.299+, and what decides the TTL.

Evidence: one session, capture-4.jsonl from 2026-10-14T15:43Z, versions 2.1.299 and 2.1.300.
