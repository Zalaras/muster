---
id: usage-cache-warmth-follows-keepalive-horizon
type: decision
status: accepted
date: 2026-10-15
summary: Warmth's expiry is the predicted cold time — an hour of keep-alives after the last request plus the ttl — cut short by warm false or an ended session.
features: [usage, lifecycle]
tags: [claude-code-format, user-decision]
files: [internal/claudecode/status.go, internal/session/status.go, internal/session/liveness.go, internal/session/actions.go, internal/session/reconcile.go]
tests: []
refs: [plan:cache-timing, "#92", kb:fact/prompt-cache-5m-keepalive, kb:fact/prompt-cache-outage-goes-cold-after-ttl, kb:fact/custom-base-url-selects-1h-cache, kb:fact/resume-reads-prior-prompt-cache]
supersedes: [usage-cache-warmth-kept-until-clear-read-against-client-clock]
---
**Context.** kb:adr/usage-cache-warmth-kept-until-clear-read-against-client-clock put the status
line's `expires_at` and `ttl` on the wire as they came. On 2.1.300 the main thread's cache is a
5-minute one kept warm by a keep-alive every 30 s for an hour after the last request
(kb:fact/prompt-cache-5m-keepalive), so cards read "expiring" for the whole hour and the 15%
underline was a 45-second flicker (#92).

**Decision.** The wire keeps `cache: {expiresAt, ttlSeconds} | null`, now the predicted lifetime.
With a `ttl` under an hour and a `requests` count, a changed count marks a request at
`expires_at − ttl`; `expiresAt` becomes that request plus an hour plus the ttl, `ttlSeconds` an
hour plus the ttl. A keep-alive (same count) changes nothing. `warm: false` makes `expiresAt` that
post's `expires_at` until the next request. A one-hour ttl, or no count, is carried as reported.
An ended session's `expiresAt` drops to the last reported expiry if earlier, since the
keep-alives die with the process (the developer, 2026-10-15); a resume, or adopting an ended
row's pane, forgets the held count, since the new process counts from 1 again. Persisted, kept by
Stop, Resume, compaction and a restart, cleared by `/clear`; the dashboard reads it against its
own clock.

**Consequences.** The timer fades over about 65 minutes, underlined in its last ten. A lost
network or long sleep reads cold within a second of the real expiry. The hour is known to the
30-second keep-alive step. A keep-alive moves the held reported expiry only in memory, so a
session that ends across a daemon restart can read cold up to 5 minutes early, never warmer.
