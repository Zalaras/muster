# Review: cache-timing

**Plan**: cache-timing
**Verdict**: approved
**Cycle**: 1
**Gates**: 0 failed
**Parts**: code | skipped: browser, maintainability
**Part verdicts**: code approved

_Merged by orch-state.py merge-review; the verdict is computed from the parts and the gate run, never edited by hand._

## Correctness review

# Correctness review: cache-timing

**Plan**: cache-timing
**Part verdict**: approved
**Cycle**: 1
**Pack**: kb: pack 37690 words (budget 30000)

## Requirements

| Req | Implemented | Tested | Status |
|-----|-------------|--------|--------|
| REQ-1 | Yes: `StatusCache.Lifetime` (`internal/claudecode/status.go`): `expires_at − ttl + 1h + ttl`, `ttlSeconds = ttl + 3600`, when `requests` differs or none is held | Yes: `TestCacheKeepAlive`, `TestCacheKeepAlive_Sequences` (anchor, re-anchor, 59m inside the regime), `TestStatusCacheLifetime` | pass |
| REQ-2 | Yes: `Lifetime` returns ok=false for a same-count warm post; `adoptCache` keeps the pointer and returns false | Yes: `_Sequences` (pointer kept), `_BroadcastsOnlyAnAnchor` (no upsert, no row write) | pass |
| REQ-3 | Yes: `Cold` comes before the count check; the cold post's `expires_at` is used with the regime ttl | Yes: `_Sequences` (first cold post, repeated cold post, the next count re-anchors). In capture-2.jsonl the post after a miss carries a new count with `warm: true` (c1450d32: false/2, then true/3/misses 1), so taking the cold post's count is safe | pass |
| REQ-4 | Yes: `Requests == nil` or ttl ≥ 3600 s is carried as reported | Yes: `_Sequences` (1h, 60m, 2h, no `requests`, 1h with `warm: false`) | pass |
| REQ-5 | Yes: `capCacheAtExit` in `markEnded`, which is the one end path for liveness, `End` and reconcile (`liveness.go:186`, `reconcile.go:81`) | Yes: `TestCapCacheAtExit`, `_EndedSessionDropsToTheLastReportedExpiry` (2 paths × 6 states, memory, row and upsert), `_ReconcileEndsAtTheLastPersistedReportedExpiry` | pass (see decision 1) |
| REQ-6 | Yes: migration 0015 adds `cache_requests` and `cache_reported_expires_at`, read and written with the cache; `/clear` nulls `Cache` | Yes: `_SurvivesARestartAndClearsOnClear`, `TestSession_CacheKeepAliveColumnsRoundTrip`, `TestCacheHeldRowMapping` | pass. A keep-alive's reported expiry reaches the row only with the next whole-row write (decision 1) |
| REQ-7 | Yes: the regime, the hour, and reading `warm` and `requests` all live in `internal/claudecode` (`Lifetime`, `CacheAtExit`); `internal/session` stores the opaque count and applies the result | n/a (Reviewer-Verified 1) | pass |
| REQ-8 | Yes: `TestPromptCacheKeepAliveMovesExpiry` (`test/canary/state_test.go`); run O records `stopAt` | Canary green on 2.1.300 (orchestrator log, line 179: "requests 1 at both posts, expires_at moved 1m1s over 1m5s idle (Stop to /compact 1m6s)") | pass |
| Edge 1–7 | 1, 2, 3, 6 and 7 in `_Sequences`, `_SurvivesARestart…` and `_ResumeReanchorsOnTheFirstPost`; 4 in `TestCapCacheAtExit`; 5 in `_Sequences`. Fix Attempt 1's adoption paths are pinned by `_AdoptingAPaneForgetsTheCountOnlyForAnEndedRow` | Yes | pass |
| Edge 8 | Declared untested (real sleep) | — | accepted |
| DIAG | `kb:diagram/store-schema` (0015's two columns added, summary bumped to 0001-0015: true); `kb:diagram/daemon-components` (session → claudecode import already existed, no package change) | — | pass |

## Build & Tests

E2E tests: pass (847 passed, `17-e2e.log`) · Daemon tests (race): pass (25 packages ok, `02-test.log`) · Web tests: pass (2622 tests in 93 files, `05-web-test.log`) · Daemon build: pass (`01-build.log`) · Web build: pass (`04-web-build.log`) · Lint: pass (`03-lint.log` 0 issues, `06-web-lint.log` clean). Also contrast, versions, kb check, e2e-lint, features scope, comments and comment ledger all pass. `16-size.log` WARN (8 funlen hits) belongs to review-maintainability. Everything was read from $GATES_LOG_DIR; nothing was re-run.

## Acceptance Checks

| ID | Command | Result |
|----|---------|--------|
| D1 | `go test -count=1 -run 'TestCacheKeepAlive' ./internal/session/` | pass (`18-D1.log`) |
| D2 | `go test -count=1 ./internal/session/ ./internal/claudecode/ ./internal/store/ ./internal/server/` | pass (`19-D2.log`, 4 packages ok) |
| D3 | `go vet -tags=canary ./test/canary/` | pass (`20-D3.log`, exit 0, no output) |
| D4 | `make lint` | pass (deduped to the baseline lint gate, `03-lint.log` 0 issues) |
| DOC | doc upkeep + Doc Delta vs what shipped | FAIL: the plan's ADR is `accepted`, not `proposed` (Major 1), and the impl log has a `doc-delta:` line the Doc Delta does not carry (Major 2). The TODO tick (#92 moved to `todo-done.md`) and the fact records (`prompt-cache-5m-keepalive` with `guard: TestPromptCacheKeepAliveMovesExpiry`, `prompt-cache-outage-goes-cold-after-ttl`, `custom-base-url-selects-1h-cache`) are present. No `deviation:` lines. Every Doc Delta "becomes true" claim checks against the code, except that "drops to the last reported expiry" can read a lagging expiry after a restart (decision 1) |

## Reviewer-Verified Criteria

| ID | Criterion | Result | Evidence |
|----|-----------|--------|----------|
| RV1 | No Claude Code format knowledge (the `requests`/`warm` keys, the one-hour keep-alive, the 5m regime) outside `internal/claudecode` | pass | `git diff main...HEAD -- internal cmd ':!internal/claudecode' ':!*_test.go'` adds no wire key, no hour constant and no ttl rule. `internal/session` holds `Cache.Requests` as an opaque count and calls `reading.Lifetime` and `claudecode.CacheAtExit`. `rg 'prompt_cache\|expires_at\|"warm"'` outside the adapter (non-test, excluding webui) finds no match. Session tests building raw status JSON through `claudecode.InterpretStatus` follow the existing precedent (`manager_cardstate_test.go:90`) |
| RV2 | No hook or status payload is logged | pass | The diff adds no daemon log call. The canary's only `t.Logf` (`state_test.go:114`) prints a count and durations |
| RV3 | `make canary` was run once on 2.1.300 and the REQ-8 guard passed | pass | `/var/folders/8t/36s1xtwj1xjfn1pg_jrwztjw0000gn/T/canary-cache-timing-2.log`: line 4 pins 2.1.300; lines 178–180 show `TestPromptCacheKeepAliveMovesExpiry` PASS; line 231 is `ok test/canary 580.371s` |

## Hard-Rule Checklist

| # | Rule | Result |
|---|------|--------|
| 1 | Adapter boundary | pass |
| 2 | Terminal-output state parsing | pass. No pane text is read |
| 3 | Blocking hook handler | pass. Ingest is untouched |
| 4 | Bare tmux / resize-pane | pass. No tmux change; tests use fake tmux sessions |
| 5 | Payload logging | pass |
| 6 | Empty-gauge dishonesty | pass. A null `cache` stays null through `capCacheAtExit` and `forgetHeldRequests` (both are nil-safe); a missing `requests` falls back to the reported value |
| 7 | Session identity on `session_id` | pass |
| 8 | Settings trespass | pass |
| 9 | Real `claude` outside canary/probes | pass. Only the canary's run O (haiku model) |

## Issues

### Critical

None.

### Major

1. **[orchestrator]** `docs/adr/usage-cache-warmth-follows-keepalive-horizon.md` is `status: accepted` on the plan branch, and the ADR it supersedes has already been flipped to `superseded`. Plan-work step 4 says each plan decision is written as `status: proposed` with `refs: [plan:<plan>]`, and /orchestrate flips it at Completion. As it stands, `kb ls --status proposed` lists nothing for this plan, so /land's proposed-ADR check cannot see it. Fix: set the ADR to `proposed` and the predecessor back to `accepted` until Completion. While editing it, its `files:` list could also name `internal/session/actions.go` and `internal/session/reconcile.go`, where `forgetHeldRequests` runs.
2. **[orchestrator]** `daemon-implementation.md` § Fix Attempt 1 has a `doc-delta:` line: "the resume forgets the held request count, so the resumed process's first post always anchors (including a held count of 1)". The plan's `## Doc Delta` does not carry it. Read with "Kept by Stop, Resume …", the delta's "a new request (a changed count …)" implies that a resumed process's first post with the same count as the held one is a keep-alive. That is false as shipped (`RecordResume`, `RepairOwnedSession` and `reviveOwnedSession` on an ended row all forget the count). Add a clause to the usage "becomes true" bullet: a resume, or adopting the pane of an ended row, forgets the count, so the new process's first post anchors.

### Minor

1. **[orchestrator]** `canary` is in **Features** and REQ-8 adds a harness-tier assertion, but the Doc Delta has no canary line. `docs/features/canary/spec.md`'s "After the first turn the harness tier asserts …" stays true but no longer lists all of the tier's prompt-cache assertions. Add one line: the harness tier also asserts that an idle 5m session's keep-alives move `expires_at` without counting in `requests` (kb:fact/prompt-cache-5m-keepalive).

### Decisions

1. **[orchestrator:decision]** REQ-6 conflicts with REQ-2 for the reported expiry. REQ-6 says "the last reported `expires_at` persist[s] on the session row … so after a daemon restart … REQ-5 still has its reported expiry". REQ-2 forbids any persist-worthy change on a keep-alive. The implementation chose REQ-2: the keep-alive's reported expiry is updated in memory only (`internal/session/status.go:79-81`) and reaches the row with the next whole-row write. `TestCacheKeepAlive_ReconcileEndsAtTheLastPersistedReportedExpiry` pins the result (T+300, not the in-memory T+630). The impl log records this as `decision:`, not `deviation:`, so it has no ADR. What it costs: only a session that ends while the daemon is down, or after a restart but before its next post, is affected. Its card reads cold up to roughly one keep-alive window (≤ 5 min) earlier than the real expiry, or for a long-idle session, from the last request's expiry. The error is conservative and never overstates warmth.
   - **Option A — keep as built:** amend REQ-6's wording, record a `proposed` ADR, and note the lag in the Doc Delta's "drops to the last reported expiry". No extra writes.
   - **Option B — persist the reported expiry without a broadcast on a keep-alive post:** a row write per keep-alive post (about one per 5 min per idle 5m session in production), which relaxes REQ-2's "no persist-worthy change" to "no `sessionUpsert`". The exit cap is then exact across a restart.

### Notes

1. **[note]** Stale comment at `internal/session/status.go:19-22`: it says Cache, like Attention, Failure, Model and Context, "is always replaced with a fresh pointer, never mutated in place". A keep-alive post now mutates `Cache.Requests` and `Cache.ReportedExpiresAt` in place (`status.go:79-81`). `Session.Clone`'s doc at `internal/session/session.go:224` ("safe to hand outside the manager's lock") also needs revisiting in that light.
2. **[note]** For review-maintainability (guards on shared state): snapshots and `lastPersisted` clones share the `*Cache` that keep-alives now mutate in place. I found no race today. The only reader outside the lock (`internal/server/sessionwire.go:185`) reads `ExpiresAt` and `TTLSeconds`, which are never written in place, and `sessionToRow` runs under `m.mu` (`writeorder.go:139`).
3. **[note]** A row from before 0015 has no held count. So a live 5m session's first post after the upgrade anchors under REQ-1's "or none was", even if that post is a keep-alive, and overstates warmth once, by up to about an hour. This matches the plan; no change requested.
4. **[note]** capture-2.jsonl confirms the prediction end to end. c1450d32's last request posted `expires_at` 1792062682; −300 + 3900 gives 1792066282, and the session posted `warm: false` at 12:11:23.800Z (1792066283).
