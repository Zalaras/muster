# Daemon Tests: cache-timing

**Plan**: cache-timing
**Verdict**: pass
**Pack**: kb: pack 25111 words (budget 30000)

## Summary

Tests created: 18 new test functions plus the red-first proof and the two frozen files updated | Passing: all | Failing: 0. After Fix Attempt 1 the earlier failure (`TestCacheKeepAlive_ResumeReanchorsOnTheFirstPost/held_count_1`) is green, and `TestCacheKeepAlive_AdoptingAPaneForgetsTheCountOnlyForAnEndedRow` pins the repair paths Fix Attempt 1 added. `go build ./...`, `make test`, `make lint` (0 issues) are green. The canary was not run (it launches real claude); the orchestrator runs `make canary`.

## Tests

| File | Test Name | What It Tests | Status |
|------|-----------|---------------|--------|
| `internal/session/cache_test.go` | TestCacheKeepAlive | the Proof (red-first pass): 5m post anchors `{T+3900, 3900}`, keep-alive unchanged, `warm: false` gives T+330 | pass |
| `internal/session/cache_keepalive_test.go` | TestCacheKeepAlive_Sequences | REQ-1..4 and edge cases 2, 5, 6, 7 as 18 step sequences through real status JSON: anchor, keep-alive (pointer kept), new count re-anchors, reordered keep-alive, warm false (first, repeated, then next count), 1h/2h/60m as reported, 59m in the regime, no `requests` as reported, 1h with `warm: false` | pass |
| `internal/session/cache_keepalive_test.go` | TestCacheKeepAlive_HeldFieldsFollowEveryPost | a keep-alive updates `Requests`/`ReportedExpiresAt` in place; count change under an unchanged lifetime; no-`requests` post keeps the held count; post without `prompt_cache` | pass |
| `internal/session/cache_keepalive_test.go` | TestCacheKeepAlive_BroadcastsOnlyAnAnchor | REQ-2 via Manager: anchor is one upsert; keep-alives, render pair repeat and reordered keep-alive send nothing and write no row; the next request's post is one upsert | pass |
| `internal/session/cache_keepalive_test.go` | TestCacheKeepAlive_IsPerSession | two sessions: a keep-alive on one and a re-anchor on the other move nothing across | pass |
| `internal/session/cache_keepalive_test.go` | TestCacheKeepAlive_SurvivesARestartAndClearsOnClear | REQ-6: row carries count and reported expiry; restarted Manager takes a keep-alive as no change (no upsert); a request still anchors; `/clear` nulls the row's four cache columns and the identical count anchors fresh | pass |
| `internal/session/cache_keepalive_test.go` | TestCapCacheAtExit | REQ-5 rule: 5m drops to reported, 1h unchanged, reported later than predicted unchanged, cold unchanged, pre-0015 (no reported) unchanged, null stays null; ttl never capped; cap replaces the pointer, no cap keeps it | pass |
| `internal/session/cache_keepalive_test.go` | TestCacheKeepAlive_EndedSessionDropsToTheLastReportedExpiry | REQ-5 through the Manager, 2 end paths (liveness death, End) x 6 cache states, a live bystander beside each: memory, row and ended upsert all capped; bystander alive with its cache untouched | pass |
| `internal/session/cache_keepalive_test.go` | TestCacheKeepAlive_ReconcileEndsAtTheLastPersistedReportedExpiry | REQ-5 third path with REQ-6: restarted Manager's Reconcile marks the gone row ended at the persisted reported expiry; the kept-alive row keeps `T+3900` | pass |
| `internal/session/cache_keepalive_test.go` | TestCacheKeepAlive_ResumeReanchorsOnTheFirstPost | edge case 2: ended session resumed keeps its capped cache; the resumed process's first post (`requests: 1`) re-anchors, for held counts 7, 2 and 1 | held 7, 2 pass; held 1 FAIL |
| `internal/session/cache_keepalive_test.go` | TestCacheKeepAlive_AdoptingAPaneForgetsTheCountOnlyForAnEndedRow | Fix Attempt 1: `RepairOwnedSession` and Reconcile's `reviveOwnedSession` x (ended row, alive row), a bystander beside: an ended row forgets the held count (prediction kept) so the same-count first post re-anchors with one upsert; an alive row keeps it and the same-count post is a keep-alive with no upsert; bystander's count and cache untouched. Mutation-checked: removing `forgetHeldRequests` from reconcile.go fails both ended-row cases | pass |
| `internal/session/cache_keepalive_test.go` | TestCacheHeldRowMapping | `cacheFromRow`, `cacheHeldToRow`, `sessionToRow` for the held columns: pre-0015 row, held columns without a pair are no cache, zero reported expiry stored as null | pass |
| `internal/claudecode/status_cache_test.go` | TestInterpretStatus_PromptCacheRequestsAndWarm | reading `requests` (integer only; absent/null/string/fractional/overflow/bool unset; 0 is a count) and `warm` (only JSON `false` is cold) from the measured 1h and cold-5m objects | pass |
| `internal/claudecode/status_cache_test.go` | TestStatusCacheLifetime | `StatusCache.Lifetime` as a pure function: 17 rows over regime, keep-alive, warm false, 59m/60m/1h/2h boundaries, no requests | pass |
| `internal/claudecode/status_cache_test.go` | TestStatusCacheLifetime_IsAPureReading | same answer twice; inputs not mutated | pass |
| `internal/claudecode/status_cache_test.go` | TestCacheAtExit | earlier of predicted and reported | pass |
| `internal/store/session_test.go` | TestSession_CacheKeepAliveColumnsRoundTrip | `cache_requests` and `cache_reported_expires_at` unknown on a fresh row, round trip through Update/Get/List, independent, cleared | pass |
| `internal/store/session_test.go` | TestScanSession_CorruptReportedExpiryReadsUnsetAndKeepsTheRow | a corrupt reported expiry reads unset without failing the row, list, cache pair or count | pass |
| `test/canary/state_test.go` | TestPromptCacheKeepAliveMovesExpiry | REQ-8 guard over run O (compiles under `-tags=canary`; not run) | vet only |

## Handoff Received

- `internal/store/store_test.go:52` (`TestOpen_SecondOpenOnSamePathDoesNotReapplyMigrations`): migration count 14 to 15, comment extended with `0015_cache_keepalive (cache-timing)`.
- `internal/server/gauges_test.go` (`TestIngestStatusLine_PromptCacheIsAdoptedAndKeptThroughIngest`): the fixture's `5m` post with `requests: 3` now asserts `{expires_at + 3600 s, 3900}`, and the kept value after a post without `prompt_cache` asserts 3900.

Both pass.

## REQ-8 guard (TestPromptCacheKeepAliveMovesExpiry)

Run O records `compactRun.stopAt` (the Stop hook's arrival, one added statement in `runO`). The test reads the production interpreter over run O's captured status posts: the first post at or after Stop with an accepted `prompt_cache`, and the last such post before `PreCompact` (the status line's state at the `/compact` submission; the first post after the submission may already follow the compaction's first request, which would change `requests`, so the hook is the bound). It fails, naming the regime, when the turn's ttl is not 300 s; requires more than 30 s between Stop and that post; then asserts equal `requests`, `warm` literally `true` in the payload, and `expires_at` at least 25 s later. `guard: TestPromptCacheKeepAliveMovesExpiry` is set in `docs/facts/prompt-cache-5m-keepalive.md`; `make gen-kb && make check-kb` pass (592 records, 0 problems). The orchestrator's `docs/diagrams/store-schema.md` edit also regenerated `docs/INDEX.md`; I left both uncommitted as the orchestrator's.

## Implementation Bugs

None. The earlier `held_count_1` failure (`RecordResume` kept the held count) was fixed by Fix Attempt 1 (`forgetHeldRequests` in `status.go`); the duplicate `capCacheAtExit` in `markEnded` was removed.

## Notes

- `funlen` warns (`make size-warn`) on `TestCacheKeepAlive_Sequences` (86 lines), `TestCacheKeepAlive_SurvivesARestartAndClearsOnClear` (46 statements) and `TestCacheKeepAlive_EndedSessionDropsToTheLastReportedExpiry` (67 lines): the first and third are the case tables themselves, the second is one chronological scenario (anchor, restart, keep-alive, request, `/clear`) whose steps share state. `runO` is now 42 statements (was 41): one assignment for `stopAt`. No `dupl` warning names my files.
- Edge case 4 (ended session whose last reported expiry is later than the horizon, 1h regime) is covered by `TestCapCacheAtExit` "reported later than predicted is unchanged" and "one-hour regime is unchanged", and through the Manager by the "one-hour regime is unchanged" row of `TestCacheKeepAlive_EndedSessionDropsToTheLastReportedExpiry`. Edge case 8 (real sleep) is the plan's declared untested item.
- Design note, tested as built: a keep-alive updates the reported expiry in memory but writes no row (REQ-2), so after a restart the cap reads the expiry of the last write (`TestCacheKeepAlive_ReconcileEndsAtTheLastPersistedReportedExpiry` asserts T+300, not the in-memory T+630). This is the impl log's stated decision.
- Not committed because they are not mine: `docs/diagrams/store-schema.md`, `docs/INDEX.md`.

## Test Run Output

```
$ go build ./...    ok
$ make lint         0 issues.
$ make test         every package ok (internal/session 33.687s)
```
