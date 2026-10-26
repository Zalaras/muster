---
id: main-cache-ttl-selected-per-model-off-binary
type: fact
status: active
date: 2026-10-26
summary: The main thread's cache TTL (5m or 1h) is switched per model on dates, not by Claude Code releases; one binary wrote 5m on 2026-10-22 and 1h on 2026-10-26.
features: [usage, canary]
tags: [claude-code-format]
files: []
tests: []
refs: [test/rig/captures/capture-5.jsonl, kb:fact/haiku-main-cache-ttl-5m-on-2-1-299, kb:fact/prompt-cache-5m-keepalive, kb:fact/prompt-cache-1h-no-keepalive-warm-flips-at-expiry, kb:fact/custom-base-url-selects-1h-cache, kb:fact/subagent-cache-ttl-5m]
verified: 2.1.296..2.1.308
guard: none
---
Which regime a session's main thread gets, `ttl: "5m"` with keep-alives
(kb:fact/prompt-cache-5m-keepalive) or `ttl: "1h"` without them
(kb:fact/prompt-cache-1h-no-keepalive-warm-flips-at-expiry), is not decided by the Claude Code
version. Claude Code asks for it (the request's `cache_creation` is all
`ephemeral_5m_input_tokens` or all `ephemeral_1h_input_tokens`), but what it asks for has
switched on dates, separately for each model, with the version unchanged:

- Opus 5.5, 1h → 5m: between 2026-10-13 17:30Z and 19:31Z, on 2.1.296 both sides.
- Fable 5.1, 1h → 5m: between 2026-10-13 14:14Z and 2026-10-15 07:03Z.
- Fable 5.1, 5m → 1h: between 2026-10-22 15:31Z and 15:38Z, on 2.1.308 both sides.
- Opus 5.5, 5m → 1h: between 2026-10-23 13:41Z and 2026-10-26 10:28Z. Opus sessions started
  after Fable's switch (five, 2026-10-22 15:32Z to 2026-10-23 13:36Z) stayed 5m.
- Haiku 4.5: the 2.1.308 binary, green with `ttl: "5m"` on 2026-10-22, reported `"1h"` on
  2026-10-26, beside 2.1.310 started the same second.

So kb:fact/haiku-main-cache-ttl-5m-on-2-1-299 saw the 5m regime, not a 2.1.299 change. A
session keeps one regime for its whole life: none of 81 main-thread sessions (Opus, Fable,
Sonnet, 2026-10-08 to 2026-10-26) wrote both. Subagents stayed 5m throughout (38 of 39
sessions; the other wrote three 1h requests on 2026-10-13), including a Haiku subagent under a
1h main thread on 2026-10-26. A custom `ANTHROPIC_BASE_URL` still means 1h
(kb:fact/custom-base-url-selects-1h-cache).

Not measured: what the switch keys on (a server-delivered flag, the account or plan —
the TUI shows "Claude Team"), whether it is read at process start, and whether it will flip
back. Read each session's own `ttl`; never assume one.

Evidence: capture-5.jsonl from 2026-10-26T12:00Z, sessions fad93f27 (2.1.310) and 667a14e4
(2.1.308), Haiku (2.1.310 is unverified: its canary went red on this); the `cache_creation` split and model of every assistant line in the
developer's own transcripts, 2026-10-08 to 2026-10-26 (counts only, no content read).
