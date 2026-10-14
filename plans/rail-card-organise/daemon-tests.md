# Daemon Tests: Rail card menu, drag into groups, and cache warmth

**Plan**: rail-card-organise
**Verdict**: pass
**Pack**: kb: pack 27351 words (budget 30000)

## Summary

Tests created: 17 new top-level tests (plus 3 repaired) | Passing: 16 of the 17 plus the 3 repaired; `make test` green | Failing: 0 | Not run: 1 (REQ-33's canary test, see Notes)

`go build ./...` exits 0, `make lint` prints `0 issues.`, `make test` is green on every package.

## Tests

| File | Test Name | What It Tests | Status |
|------|-----------|---------------|--------|
| `internal/claudecode/status_test.go` | TestInterpretStatus_PromptCache | D1: 30 rows. Accepts the measured full object, `1h`/`5m`/`90s`/`30m`/`2h`/`05m`; rejects `0m`, `0s`, `00h`, unit-only, digits-only, empty, `x`, `1d`, `5M`, `-5m`, `+5m`, `1.5h`, `5 m`, an overflowing `99999999999999999h`, ttl number/null/missing, `expires_at` string/fractional/null/missing, `{}`, null, string, array, and an absent key | pass |
| `internal/claudecode/status_test.go` | TestInterpretStatus_PromptCacheNeverDisturbsTheRestOfThePayload | A valid cache beside title/model/context/account leaves those identical to a post without it; an unusable or non-object `prompt_cache` does not stop the rest decoding | pass |
| `internal/session/cache_test.go` | TestApplyStatusUpdate_CacheAdoption | D2-D4 pure: first adoption, nil post keeps the value, equal is no change (including the same instant in another zone), changed expiry or lifetime replaces with a fresh pointer, unchanged keeps its pointer | pass |
| `internal/session/cache_test.go` | TestApplyStatusUpdate_CacheDoesNotDisturbStateFromEverySource | adopting a cache changes nothing else, from all 8 card sources x alive/dead | pass |
| `internal/session/cache_test.go` | TestApplyStatus_CacheBroadcasts | D2/D3/D4 through the Manager: changed cache = exactly one upsert carrying it; equal = none; post without cache = none and the value kept; expiry moving alone = one upsert; cache + title together = one upsert | pass |
| `internal/session/cache_test.go` | TestApplyStatus_CacheIsPerSession | a post for one session leaves a second session's cache and broadcast count alone | pass |
| `internal/session/cache_test.go` | TestApplyInput_ClearRebindClearsCacheFromEverySource | D5/INV-5: explicit clear-rebind (new and same id), plain bind and resume bind escalated by a new id, each from 8 sources x alive/dead, all clear the cache; the next status post refills it | pass |
| `internal/session/cache_test.go` | TestApplyInput_NonClearInputsKeepCacheFromEverySource | D6/INV-5: 21 other input shapes (every other `InputKind`, with open/closed/new prompt, main/subagent, own/other compaction prompt) x 8 sources x alive/dead leave the cache pointer identical; first bind of a never-bound session also keeps it | pass |
| `internal/session/cache_test.go` | TestManager_CacheLifecycleWithABystander | D6/D7 at Manager level with two sessions: Stop, liveness death, Resume, resume SessionStart and a compaction keep the target's cache in memory and in the row and never touch the bystander's; a restart reads both back; `/clear` clears only the target's; the next post refills it | pass |
| `internal/session/cache_test.go` | TestApply_EnvelopedEventWithANewClaudeSessionIDClearsCache | an enveloped non-bind event naming a new claude id is a rebind and clears the cache; one on the held id keeps it | pass |
| `internal/session/cache_test.go` | TestCacheRowMapping | INV-1 at the row boundary: both columns = cache, either missing = unknown; `cacheToRow` writes both or neither | pass |
| `internal/session/cache_test.go` | TestPersistFailure_RollsBackCacheChanges | a failed persist rolls back a moved cache and a cleared cache, and broadcasts nothing | pass |
| `internal/store/session_test.go` | TestSession_CacheColumnsRoundTripBothOrNeither | D7 storage: fresh row nil/nil, fill, list path, clear back to nil/nil | pass |
| `internal/store/session_test.go` | TestScanSession_CorruptCacheReadsUnknownNotHalf | a corrupt expiry, or a lifetime with no expiry, reads both nil and fails neither the row nor a sibling whose cache survives | pass |
| `internal/server/sessionwire_test.go` | TestToWireSession_CacheKeyIsAlwaysPresent | D8: key present on every Session object; null when unknown (alive or dead); `{expiresAt RFC3339 UTC, ttlSeconds integer}` with exactly two keys; a non-UTC stored time renders in UTC | pass |
| `internal/server/gauges_test.go` | TestIngestStatusLine_PromptCacheIsAdoptedAndKeptThroughIngest | REQ-21/D2 through the real ingest route (`claudecodetest` body, no literal): a routed post lands the cache, a later post without it keeps it | pass |
| `test/canary/canary_test.go` | TestPromptCacheExpiryIsStopPlusTTL | REQ-33/D10: after run D's first turn a pre-`/clear` status post carries a `prompt_cache` accepted by `claudecode.InterpretStatus`, with `expires_at` within 15 s of the turn's Stop plus the interpreted ttl | not run (build tag `canary`; compiles and vets, skips cleanly offline) |

## Handoff Received

- `internal/store/migrate_test.go` `TestMigrate_AppliesInitSchema` (:39, :43): count and max version 13 to 14, comment names 0014.
- `internal/store/migrate_test.go` `TestMigrate_SecondCallIsANoOp` (:60): 13 to 14, migration list comment gains `0014_prompt_cache (rail-card-organise)`.
- `internal/store/store_test.go` `TestOpen_SecondOpenOnSamePathDoesNotReapplyMigrations` (:51): 13 to 14, comment gains 0014.
- `internal/server/sessionwire_test.go:216` (`TestSessionWire_JSONShapeHasNoUnexpectedNulls`): key list gains `"cache"`; the null/set assertions (D8) are the new `TestToWireSession_CacheKeyIsAlwaysPresent`.

## Notes

- **REQ-33 canary test name for the fact guard**: `TestPromptCacheExpiryIsStopPlusTTL` in `test/canary/canary_test.go`. It was not run against a real `claude`: it needs the whole harness (runs A to P, several haiku turns), and the installed 2.1.300 equals the verified ceiling, so it skips without `MUSTER_CANARY_FORCE=1`. Verified instead: `go vet -tags canary ./test/canary/` clean, and `MUSTER_CANARY_OFFLINE=1 go test -tags canary -run TestPromptCacheExpiryIsStopPlusTTL -v ./test/canary/` prints `SKIP`. The 15 s tolerance and the "first post carrying the key at or after Stop" choice were checked against the 21 sessions in `test/rig/captures/*.jsonl` that have a Stop followed by a `prompt_cache`: `expires_at - (Stop + ttl)` for the first such post ranged -9.0 s to -0.8 s (the later-in-segment posts reach +56.9 s because a following turn's request moves the expiry, which is why the test reads only the first). To run it for real: `MUSTER_CANARY_FORCE=1 go test -tags canary -count=1 -run TestPromptCacheExpiryIsStopPlusTTL ./test/canary/` (haiku only, harness kills its panes).
- **Mutation checks**, run in a `git archive HEAD` scratch copy with the new test files copied in (the working tree was not touched). Each mutation failed at least one new test: removing the `/clear` `sess.Cache = nil` (3 tests), `Equal` to `==` (`TestApplyStatusUpdate_CacheAdoption`), dropping `beforeCache` from the broadcast condition (`TestApplyStatus_CacheBroadcasts`), `cacheFromRow` accepting a half cache (`TestCacheRowMapping`), a nil reading clearing the cache (2 tests), dropping `Cache` from `restoreChangedFields` (`TestPersistFailure_RollsBackCacheChanges`), dropping `n <= 0` and the length and digit checks of `parseCacheTTL` (`TestInterpretStatus_PromptCache`), dropping the store's half-cache guard (`TestScanSession_CorruptCacheReadsUnknownNotHalf`), and the wire time formatting (`TestToWireSession_CacheKeyIsAlwaysPresent`). Two initial survivors (the digit check, the persist rollback) each got a row or test that kills them.
- **Declined coverage**: Edge Case 3 (a straggler status post from the old conversation re-adopting the old cache after `/clear`) is accepted untested by the plan ("untested: status posts carry no conversation marker"). `expires_at` of 0 or negative is accepted by the interpreter and the daemon never compares the cache with the clock (the client does), so no unit asserts on it. REQ-1 to REQ-20 and REQ-24 to REQ-31 are web and E2E.
- **funlen warnings naming my files** (`make size-warn`), kept on purpose: `TestInterpretStatus_PromptCache` (62 lines, a 30-row table where each row is one line, so the length is the row count); `TestManager_CacheLifecycleWithABystander` (80 statements, one ordered scenario, Stop then death then Resume then compaction then restart then `/clear`, each step re-asserting both sessions through one `assertCaches` closure; splitting it would repeat the two-session setup). The other two warnings in the output (`TestUpdateSession_RoundTripsEveryField`, `TestStatusLineFields`) are existing functions; the canary one is 44 statements and I did not touch it. No `dupl` line names a file of mine.
- Not touched, other agents' uncommitted work: everything under `web/`, `plans/rail-card-organise/orchestration-state.json`.

## Test Run Output

```
$ go build ./...                       # exit 0
$ make lint
golangci-lint run
0 issues.
$ make test
ok  	github.com/Zalaras/muster/cmd/musterd	72.820s
ok  	github.com/Zalaras/muster/internal/claudecode	17.297s
ok  	github.com/Zalaras/muster/internal/server	98.130s
ok  	github.com/Zalaras/muster/internal/session	35.145s
ok  	github.com/Zalaras/muster/internal/store	15.961s
(every other package ok; no FAIL line)
```
