---
id: resume-reads-prior-prompt-cache
type: fact
status: active
date: 2026-10-14
summary: A resume inside the cache TTL reads the previous process's prompt cache on its first request; prompt_cache stays absent until that request.
features: [usage, actions]
tags: [claude-code-format]
files: []
tests: []
refs: [kb:fact/prompt-cache-status-shape, kb:fact/resume-keeps-session-identity, "#84"]
verified: 2.1.299..2.1.300
guard: none
---
A session ended with `/exit` and resumed with `claude --resume <id>` 103 s later, inside its
TTL, read the earlier cache on the resumed process's first request: the transcript's
`message.usage` shows `cache_read_input_tokens: 36001`, which is the whole of the first
process's context (its last `recache_tokens_if_cold` was 36011), and only the new turn's
3559 tokens written. The resumed process's first `prompt_cache` reported `hit_ratio` 0.91,
`misses: 0`, `requests: 1` (the counter restarts per process) and a fresh `expires_at` a TTL
after that request.

Between the resume `SessionStart` and that first request the status line carried no
`prompt_cache` key (3 of 3 posts), as at a fresh launch (kb:fact/prompt-cache-status-shape).
So the last `expires_at` the ended process reported still predicts whether a resume starts
warm; nothing on the wire reports it until the first reply.

Not measured: a resume after the TTL (expected cold), a resume whose system prompt changed
in between (a new branch, a new day), and models other than Haiku.

Evidence: one Haiku session, interactive, capture-4.jsonl from 2026-10-14T15:43Z; the first
process reported 2.1.299 and the resumed one 2.1.300 (the auto-updater ran between them).
