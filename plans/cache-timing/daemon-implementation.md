# Daemon Implementation: cache-timing

**Plan**: cache-timing
**Mode**: initial
**Pack**: kb: pack 32213 words (budget 30000)

## Changes

| File | Action | What and Why |
|------|--------|--------------|
| `internal/claudecode/status.go` | modified | `StatusCache` reads `requests` and `warm`; `StatusCache.Lifetime(lastRequests)` is the REQ-1..4 prediction; `CacheAtExit` is the REQ-5 cap (REQ-7) |
| `internal/session/status.go` | modified | `adoptCache` applies `Lifetime`, holds requests and reported expiry; `capCacheAtExit` for REQ-5 |
| `internal/session/session.go` | modified | `Cache` gains held `Requests`, `ReportedExpiresAt` (REQ-6) |
| `internal/session/liveness.go` | modified | `markEnded` calls `capCacheAtExit` (REQ-5; liveness, End and reconcile all end through it) |
| `internal/session/row.go` | modified | `cacheFromRow`/`cacheHeldToRow` read and write the two new columns (REQ-6) |
| `internal/store/session.go` | modified | `SessionRow` fields, UPDATE, `sessionColumns`, scan |
| `internal/store/migrations/0015_cache_keepalive.sql` | created | `cache_requests`, `cache_reported_expires_at` |

REQ-8 (canary guard) is the test agent's; `/clear` needed no change: `sess.Cache = nil` (machine.go) already clears the held fields because they live on `Cache`.

## Decisions

- design: held fields live on `Cache` (plan: "the Cache's held-but-not-wired fields"), so `/clear`, the pointer-identity rollback in `restoreChangedFields` and `restoredSessionFields` needed no change, and the frozen `TestApplyStatusUpdate_CacheDoesNotDisturbStateFromEverySource` (`sess.Cache = nil` then whole-struct equality) holds. Writers: `ApplyStatus` only, under `Manager.mu`; a keep-alive updates `Requests`/`ReportedExpiresAt` in place (the test requires the pointer unchanged, and the pointer equality is the broadcast check), a lifetime change replaces the pointer. `markEnded` replaces it too.
- design: prediction is a method on `StatusCache` returning `(CacheLifetime, ok)`: ok false means keep-alive. Matched `parseCacheTTL`/`interpretPromptCache` in the same file (pure functions of the payload, no clock). `rg -n "keep-alive|Lifetime|requests" internal/claudecode --glob '!*_test.go'` found nothing to reuse. `CacheAtExit` is a plain function so session holds no Claude Code rule.
- design: `StatusCache` keeps `ExpiresAt`/`TTLSeconds` as reported and adds `Requests *int64` and `Cold bool` (not `Warm bool`), so existing tests that build `StatusCache{ExpiresAt, TTLSeconds}` mean "no requests, not cold" and compile unchanged. `cacheToRow` keeps its two-value signature (a frozen test calls it), so a sibling `cacheHeldToRow` carries the held fields.
- decision: the held reported expiry is updated in memory on every post but persisted only with the next whole-row write (REQ-2 forbids a persist on a keep-alive), so after a restart it can lag by the time since the last persisting write; REQ-5 then caps to the older expiry.
- decision: a `requests` that changes while the predicted lifetime is unchanged (a >= 1h ttl, or a `warm: false` re-post) updates the held count in place and does not upsert or persist by itself.
- decision: `warm: false` in the regime sets `expiresAt = expires_at` with `ttlSeconds = ttl + 3600` (the regime's ttl, equal to the held one); outside the regime it is carried as reported (REQ-4).
- No size warning on a touched file.

## Handoff

**Build status**: `go build ./...` exits 0; `make lint` 0 issues; `golangci-lint run --tests=false ./...` 0 issues. `go test -race` passes for `internal/session` and `internal/claudecode`; `TestCacheKeepAlive` and `TestMigrate_*` are green.

Test files the test agent must update (frozen assertions the plan's contract changes, not accommodated on the wire):
- `internal/store/store_test.go:52` (`TestOpen_SecondOpenOnSamePathDoesNotReapplyMigrations`): migration count 14 becomes 15. Not in the plan's list.
- `internal/server/gauges_test.go:264-265,278` (`TestIngestStatusLine_PromptCacheIsAdoptedAndKeptThroughIngest`): `claudecodetest.EnvelopedStatusLineFull` emits `requests: 3` with a `5m` ttl, so the cache is now `{expires_at + 3600 s, 3900}` (REQ-1), not `{expires_at, 300}`. Not in the plan's list. Also the first `internal/server` run showed `TestWrapperReply_PrintsTheBodyOnlyOnA2xx` "signal: killed" under a load-heavy parallel run; unrelated to this change.

## Fix Attempt 1

**Failures addressed**: `TestCacheKeepAlive_ResumeReanchorsOnTheFirstPost/held_count_1` (a resumed process's `requests` restarts at 1 and was read as a keep-alive against a held count of 1); the duplicated `capCacheAtExit(sess)` in `markEnded`.

**Changes made**:
- `internal/session/status.go`: new `forgetHeldRequests(sess)` replaces `sess.Cache` with a copy whose `Requests` is nil (`ExpiresAt`, `TTLSeconds`, `ReportedExpiresAt` kept, so an ended card's prediction still shows until the first post). It copies rather than mutates because `Clone` is shallow and the write-order guard compares `Cache` by pointer identity.
- Every path that gives an existing row a new process calls it: `RecordResume` (`actions.go`), `RepairOwnedSession` and `reviveOwnedSession` (`reconcile.go`, both only when the row was not alive: they adopt a pane a resume spawn left unrecorded). `/clear` already nulls the whole cache (`machine.go`); launch creates a fresh row; a plain `Alive` row on Reconcile is the same process and keeps its count.
- `internal/session/liveness.go`: removed the second `capCacheAtExit(sess)` call.

**Decisions**:
- design: `forgetHeldRequests` sits next to `capCacheAtExit` in `status.go`, the same copy-then-replace shape (`rg -n "sess.Cache = &" internal/session` finds only adoptCache and capCacheAtExit, both replacing the pointer); one helper for three call sites rather than inline field writes.
- doc-delta: plan edge case 2 holds as written; the resume forgets the held request count, so the resumed process's first post always anchors (including a held count of 1).

**Evidence**: `go test ./internal/session/ ./internal/claudecode/ ./internal/store/ ./internal/server/` all ok; `go test -race` on the cache/resume/reconcile tests ok; `make lint` 0 issues; no size warning on the touched files.
