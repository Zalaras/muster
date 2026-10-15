# Doc Reconcile: cache-timing

**Verdict**: reconciled
**Pack**: kb: pack 11243 words (budget 30000)
**Features derived**: usage, lifecycle, canary (plan header: usage, lifecycle, canary)

## Claims

| Feature | Claim | Verified against | Action |
|---------|-------|------------------|--------|
| usage | cache is the predicted lifetime; new request (changed count) -> request + 1h + ttl, ttlSeconds 1h + ttl | `internal/claudecode/status.go:StatusCache.Lifetime`, `internal/session/status.go:adoptCache` | rewritten (spec, protocol) |
| usage | keep-alive (same count) changes nothing; warm:false -> post's expires_at; 1h ttl / no count as reported | `status.go:Lifetime` | added |
| usage | session end drops expiry to last reported if earlier | `internal/session/liveness.go:markEnded`, `session/status.go:capCacheAtExit` | added |
| usage | resume / adopting an ended row's pane forgets held count | `actions.go:RecordResume`, `reconcile.go:RepairOwnedSession`, `reviveOwnedSession`, `status.go:forgetHeldRequests` | added |
| usage | "converted status-line expiry", "both fields replace together", "Kept by ... liveness death" | superseded by above | deleted |
| canary | run O's /compact-time post guards the 5m keep-alive | `test/canary/state_test.go:TestPromptCacheKeepAliveMovesExpiry` | added |
| store | migration 0015 columns | orchestrator-applied | not mine |

## Contradictions
None. Note: delta says "a minute after Stop"; the test asserts over 30 s, so the spec says "over 30 s".

## For the orchestrator
- lifecycle spec.md unchanged (its code changes are the same cache behaviour, documented under usage); its generated contract.md was regenerated.
- No touched-feature widening.

## Checks
`make gen-kb && make check-kb`: 592 records, 27 features, 0 problem(s); all checks pass.
Word counts (whole file): usage 843, canary 565 (check-kb budget passes).
Commits: 528b9c3e (canary), fed4c4cc (usage, protocol.md, regenerated contracts).
