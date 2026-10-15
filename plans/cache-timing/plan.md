# Plan: cache-timing

**Status**: completed
**Shape**: fix
**Work Type**: daemon
**E2E Scope**: none
**Fixture plan**: none
**Features**: usage, lifecycle, canary
**Description**: A card's cache warmth follows the cache's real lifetime — an hour of Claude Code keep-alives after the last request plus the 5-minute ttl — goes cold on `warm: false`, and drops to the last reported expiry when the session ends (#92).

## Symptom

From `TODO.md` § Issues, "On their own":

- **Missing underline from mock ups for GitHub cache expiring soon** ([#92](https://github.com/Zalaras/muster/issues/92)) —
  a rail card's cache-warmth timer read "expiring" (under 5 minutes) and still read the same more
  than 30 minutes later, and the dotted underline the mockups show for the last stretch of the
  cache lifetime never appeared. The timer should track the real cache lifetime, and the underline
  should appear in its last 15% as the `rail-card-organise` mockups show.

The issue's screenshot: a card idle 33:36 hovering `cache warm · cold in 1m`, no underline.

## Findings

The claim held, with a different cause than the issue guessed (nothing in Muster is keyed to an
hour; the timer reads each session's own `ttl`).

- Every live session in the developer's store (Fable 5.1 and Opus 5.5, 2.1.300) reports
  `ttl: "5m"`. While idle, Claude Code keeps that cache warm with a keep-alive every 30 s and
  `expires_at` follows the last keep-alive plus 300 s; `requests` does not count them. Production
  writes no `refreshInterval`, so the status line re-renders only about every 5 minutes, a second
  after each `expires_at` — so the card always read "cold in < 5m" (kb:fact/prompt-cache-5m-keepalive).
- The keep-alives are real: session 16's first request after 39 minutes idle read its whole
  context from cache (137 185 tokens, `misses` 0).
- They stop an hour after the **last** main-thread request (probe 2026-10-15, capture-2.jsonl:
  sessions whose last requests were 10:54:18 and 11:06:23 went cold at 11:58:49 and 12:11:23);
  then a post says `warm: false`, and the next request misses.
- An outage or frozen process shorter than ~4.5 min loses nothing; a longer one reads
  `warm: false` within a second of the expiry and nothing re-warms it
  (kb:fact/prompt-cache-outage-goes-cold-after-ttl).
- The underline works (`web/e2e/cache-warmth.spec.ts -g underline`: 3 passed); with a 300 s
  lifetime its last 15% is 45 s, a flicker before each keep-alive post re-brightens the timer.
- Today `adoptCache` (`internal/session/status.go:56`) copies `expires_at`/`ttl` verbatim and
  `interpretPromptCache` (`internal/claudecode/status.go:175`) drops `warm` and `requests`.

Decision (the developer, 2026-10-15): the wire carries the predicted lifetime;
kb:adr/usage-cache-warmth-follows-keepalive-horizon (supersedes
kb:adr/usage-cache-warmth-kept-until-clear-read-against-client-clock). An ended session's
warmth drops to its last reported expiry, since the keep-alives die with the process.

## Requirements
### Must Have
- **REQ-1**: For a status post whose `prompt_cache.ttl` is under one hour and which carries an
  integer `requests`: when `requests` differs from the last one adopted for the session (or none
  was), the request time is `expires_at − ttl`, and the session's `cache` becomes
  `expiresAt = max(expires_at, request + 3600 s + ttl)`, `ttlSeconds = 3600 + ttl`
  (a `5m` post: `expires_at + 3600 s`, `3900`).
- **REQ-2**: A post in REQ-1's regime with the same `requests` as the last adopted one and
  `warm` not false (a keep-alive) leaves `cache` unchanged: no persist-worthy change, no
  `sessionUpsert`, whatever its `expires_at`.
- **REQ-3**: A post whose `prompt_cache.warm` is `false` sets `cache.expiresAt` to that post's
  `expires_at` (keeping `ttlSeconds`); later posts with the same `requests` keep it there. The next
  post with a different `requests` re-anchors per REQ-1.
- **REQ-4**: A `ttl` of one hour or more, or a post without an integer `requests`, is adopted as
  today: `expiresAt = expires_at`, `ttlSeconds = ttl` (REQ-3 still applies).
- **REQ-5**: When a session ends (liveness death, `End`, or reconcile), `cache.expiresAt` becomes
  the earlier of itself and the last reported `expires_at`, persisted with the ended row and sent in
  its `sessionUpsert`; `ttlSeconds` unchanged. A null `cache` stays null.
- **REQ-6**: The last adopted `requests` and the last reported `expires_at` persist on the session
  row (migration `0015`), written with the session's next whole-row write (a keep-alive alone
  writes nothing, REQ-2), so after a daemon restart a keep-alive post still changes nothing and
  REQ-5 has the last persisted reported expiry. `/clear` clears them with `cache`; a resume, or
  adopting the pane of an ended row, forgets the held count so the new process's first post
  re-anchors.
- **REQ-7**: Every rule above that encodes Claude Code behaviour (the keep-alive regime, its hour,
  reading `warm`/`requests`) lives in `internal/claudecode`; `internal/session` only stores and
  applies what it returns.
- **REQ-8**: The canary guards the keep-alive: in run O (direct API, production settings), the
  status post at the `/compact` submission — over 30 s after the turn's Stop — carries the same
  `requests` as the post after Stop, `warm: true` and an `expires_at` at least 25 s later; the
  test fails, naming the regime, if the turn's `ttl` is not `5m`.

## Affected Files
### Daemon (daemon-impl)
- `internal/claudecode/status.go` — REQ-1–4, REQ-7: read `warm` and `requests`; export the
  lifetime prediction (request anchor, horizon, warm-false) and the exit cap for REQ-5.
- `internal/session/status.go` — REQ-1–4: `adoptCache` applies the prediction, keeping the last
  `requests` and reported expiry on the session.
- `internal/session/session.go` — REQ-6: the Cache's held-but-not-wired fields.
- `internal/session/liveness.go` — REQ-5: `markEnded` caps the expiry.
- `internal/session/row.go`, `internal/store/session.go`, `internal/store/migrations/0015_cache_keepalive.sql`
  — REQ-6: two columns, read and written with the cache.
- `internal/session/machine.go` — REQ-6: `/clear` clears the new fields with `cache` (if not
  already one pointer).
### Existing tests this breaks
- daemon-tests: `internal/store/migrate_test.go:38-60` — the migration count 14 becomes 15.
- e2e-specs: `web/e2e/cache-warmth.spec.ts:148` — its `ttl: "5m"` post carries `requests`, so the
  wire becomes `{expiresIn(3600), 3900}`, not `{expiresIn(300), 300}`.
### Canary (daemon-tests)
- `test/canary/harness_state_test.go` / `canary_test.go` — REQ-8: the guard test; run O records
  what it needs (Stop time, the posts up to `/compact`).

## Proof
daemon-tests writes `TestCacheKeepAlive*` in `internal/session/cache_test.go`: a session takes a
`5m` post with `requests: 3` and `expires_at` T+300 → `cache` is `{T+3900, 3900}`; then a post
with `requests: 3`, `expires_at` T+330 → unchanged and `applyStatusUpdate` returns false; then
`warm: false` → `expiresAt` T+330. Red today on the first assertion (`{T+300, 300}`).

## Edge Cases
1. Daemon restarts between a request and a keep-alive → the keep-alive changes nothing → D2
2. Resume of an ended session: the counter restarts at 1 → re-anchors on the first post → D2 (shared with edge case 1)
3. `/clear` → `cache` and the held fields null; the new conversation anchors fresh → D2 (shared with edge case 1)
4. Ended session whose last reported expiry is later than the horizon (1h regime) → unchanged → D2 (shared with edge case 1)
5. Post with `prompt_cache` but no `requests` (older versions, the E2E fixture before update) → REQ-4 → D2 (shared with edge case 1)
6. Two status posts per render (kb:fact/status-posts-arrive-in-pairs) → the second is a same-`requests` post → no change → D2 (shared with edge case 1)
7. A keep-alive post arrives before the post showing a new request (reordered) → still same `requests`, no change; the request's post re-anchors → D2 (shared with edge case 1)
8. Real sleep of the Mac rather than a frozen process → untested: not measurable in a test, the frozen-process probe stands in

## Acceptance Criteria
### Automated Checks
```checks
D1 go test -count=1 -run 'TestCacheKeepAlive' ./internal/session/
D2 go test -count=1 ./internal/session/ ./internal/claudecode/ ./internal/store/ ./internal/server/
D3 go vet -tags=canary ./test/canary/
D4 make lint
```
### Reviewer-Verified
- No Claude Code format knowledge (the `requests`/`warm` keys, the one-hour keep-alive, the 5m regime) outside `internal/claudecode` (REQ-7).
- No hook or status payload is logged.
- `make canary` was run once on 2.1.300 and the REQ-8 guard passed (the orchestrator pastes it).

## Doc Delta
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

## Out of scope
Nothing.
