---
id: subagent-cache-ttl-5m
type: fact
status: active
date: 2026-10-13
summary: Subagents write their prompt cache with the 5-minute TTL while the main thread writes 1-hour; the status line reports only the main thread's cache.
features: [usage]
tags: [claude-code-format]
files: []
tests: []
refs: [test/rig/captures/capture-3-state-2026-10-12.jsonl, test/rig/captures/capture-3-state-2026-10-12c.jsonl, kb:fact/prompt-cache-status-shape]
verified: 2.1.296..2.1.296
guard: none
---
In the transcripts' `message.usage.cache_creation`, every main-thread assistant message
wrote `ephemeral_1h_input_tokens` with `ephemeral_5m_input_tokens: 0`. Every subagent message
(`<session>/subagents/agent-*.jsonl`) did the reverse: all of its cache writes were 5-minute
writes (2 sessions, 3 subagents — Explore, general-purpose and claude-code-guide — 11
requests).

So a subagent's cache goes cold 5 minutes after its last request, and nothing on the status
line shows it: `prompt_cache` counts and dates main-thread requests only
(kb:fact/prompt-cache-status-shape). Subagent cache warmth can only be worked out from the
subagent transcripts' timestamps and usage. Subagent transcripts list each assistant message
twice, with the same `message.id`, so count by unique id.

Evidence: Haiku sessions 23d8f590 and c283d44d from the 2026-10-12 state probes, re-read
2026-10-13 against the status-line captures.
