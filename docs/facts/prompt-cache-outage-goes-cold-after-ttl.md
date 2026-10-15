---
id: prompt-cache-outage-goes-cold-after-ttl
type: fact
status: active
date: 2026-10-15
summary: An outage or frozen process shorter than the 5m ttl loses nothing; a longer one reads warm false at expires_at and nothing re-warms it.
features: [usage]
tags: [claude-code-format]
files: []
tests: []
refs: [test/rig/captures/capture-2.jsonl, kb:fact/prompt-cache-5m-keepalive, "#92"]
verified: 2.1.300..2.1.300
guard: none
---
Measured on idle Haiku sessions in the 5m regime (kb:fact/prompt-cache-5m-keepalive):

- **Network cut, 2 min** (the session's CONNECT proxy killed): `expires_at` stopped moving;
  3 s after the network returned a keep-alive moved it on. The next turn read the whole
  conversation from cache (38 530 tokens, `misses` 0).
- **Network cut, 7 min:** one second past the last `expires_at`, a status post reported
  `warm: false` with `expires_at` unchanged. No keep-alive followed the restore; the next
  turn read only the shared system prefix (30 465 tokens), rewrote the conversation (10 065)
  and counted `misses: 1`.
- **Process frozen (SIGSTOP), 3 min:** a keep-alive fired within 3 s of the thaw and
  `expires_at` moved on as before.
- **Process frozen, 7 min:** at the thaw a post reported `warm: false` with the old
  `expires_at`, and no keep-alive followed.

So `warm` and `expires_at` stay truthful through an outage: a cache the session lost reads
cold within a second of the expiry, and only a new request warms it again. A frozen process
stands in for a sleeping Mac; a real sleep was not measured. Claude Code also runs
`caffeinate -i -t 300` (seen once, right after a turn), which holds off idle system sleep
but not a closed lid.

Not measured: a turn after the 3-minute freeze (the TUI stopped submitting after
SIGSTOP/`fg`), real sleep, and an outage that hangs connections rather than refusing them.

Evidence: capture-2.jsonl, 2026-10-15, sessions c1450d32 (network) and d2f32321 (freeze),
Haiku, 2.1.300.
