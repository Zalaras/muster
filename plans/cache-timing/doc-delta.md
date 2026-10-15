# Doc delta: cache-timing

Seeded from plan.md § Doc Delta, then amended by the orchestrator with every `doc-delta:` line from the implementation logs and the review cycles.

## From the plan

**usage** — stops being true (`docs/protocol.md` § The Session object, the `cache` comment and the `cache:` bullet; `docs/features/usage/spec.md` § Prompt-cache warmth):
- `expiresAt` is "the status line's prompt-cache expiry (Unix seconds) converted"; `ttlSeconds` is
  "the cache lifetime parsed from its ttl".
- "both fields replace together" on every post with a usable prompt cache; "Kept by Stop, liveness death, …".
- The spec's "when it expires and its lifetime" read from the status line.

**usage** — becomes true:
- `cache` is the cache's predicted lifetime (kb:adr/usage-cache-warmth-follows-keepalive-horizon):
  with a ttl under an hour and a `requests` count, a new request (a changed count, at
  `expires_at − ttl`) sets `expiresAt` to that request plus an hour plus the ttl and `ttlSeconds`
  to an hour plus the ttl; a keep-alive post (same count) changes nothing; `warm: false` makes
  `expiresAt` that post's `expires_at` until the next request. A one-hour ttl, or no count, is
  carried as reported. When the session ends, `expiresAt` drops to the last reported expiry if
  earlier. A resume, or adopting the pane of an ended row, forgets the held count, so the new
  process's first post always re-anchors, even when its count equals the old one. Kept by Stop,
  Resume, compaction and a daemon restart; cleared by `/clear`.

**canary** — becomes true (`docs/features/canary/spec.md`, the guarded facts):
- Run O's status post at the `/compact` submission, a minute after the turn's Stop, guards the
  5m keep-alive (kb:fact/prompt-cache-5m-keepalive): same `requests`, `warm: true`, `expires_at`
  moved on (TestPromptCacheKeepAliveMovesExpiry).

**store** — `kb:diagram/store-schema`: migration 0015 adds `cache_requests` and
`cache_reported_expires_at` to `session` (the orchestrator updates the diagram).

## From the logs

- daemon-implementation.md § Fix Attempt 1 — doc-delta: plan edge case 2 holds as written; the resume forgets the held request count, so the resumed process's first post always anchors (including a held count of 1). (Already folded into the usage "becomes true" bullet above.)

## Not for doc-reconcile

- The **store** line (kb:diagram/store-schema) was applied by the orchestrator in commit "docs(cache-timing): store schema gains migration 0015's cache columns".
