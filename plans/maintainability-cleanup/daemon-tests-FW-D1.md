# Daemon Tests: Maintainability Cleanup — FW-D1 (session/store/keyedlock fix wave)

**Plan**: maintainability-cleanup
**Verdict**: pass
**Pack**: `kb: pack 67323 words (budget 8000)` — WARN over budget (rules 885 · features 26181 · decisions 27308 · facts 9486 · lessons 2813 · runbooks 644); read `plans/maintainability-cleanup/daemon-implementation-FW-D1.md`, `review.work.md` and `review.maintainability.a-session.cycle2.md` directly instead.

## Summary

Tests created: 8 (one has 2 subtests) | Passing: 8 | Failing: 0

Scope: `internal/session`, `internal/store`, `internal/keyedlock`, `internal/server/ingest*_test.go` only. No implementation file was edited — the three "swap in HEAD, run, restore" probes below used the scratchpad, never the working tree, and every restored file was byte-diffed clean against my pre-probe copy before moving on.

Also did the requested Minor 8 sweep in this scope: removed this run's finding-tag/history-narration comments from `manager_writeorder_test.go`, `manager_test.go`, `manager_rail_test.go`, `machine_test.go`, `store/migrate_test.go`, `store/session_watermark_test.go`; renamed `fakeKiller`/`newFakeKiller`/`fakeResolvingKiller` to `fakeTmuxSessions`/`newFakeTmuxSessions`/`fakeResolvingTmuxSessions` (the port it fakes) everywhere in `internal/session/*_test.go`, including the two files with stray uses outside the three lines the review pinpointed (`manager_rail_test.go`, `reconcile_shell_test.go`). While drafting the new tests' own doc comments I caught myself repeating the same finding-ID-citation habit (`review Major 1 (a-M1)`, `review.work.md Major 1-2`, etc.) — reworded all of them to state the current invariant instead before finalizing.

## Tests

| File | Test Name | What It Tests | Status |
|------|-----------|---------------|--------|
| `internal/session/manager_writeturnstile_interleave_test.go` | `TestPersistFailure_LaterQueuedWriteSurvivesAnEarlierFailedRestore/earlier_write_fails,_later_write_succeeds` | Item 1: a failed write (SetTitle, canceled ctx) queued ahead of a later write (MarkSeen) on the same id never erases the later write's in-memory change, and the persisted row carries only the later write's own field | pass |
| `internal/session/manager_writeturnstile_interleave_test.go` | `TestPersistFailure_LaterQueuedWriteSurvivesAnEarlierFailedRestore/both_writes_fail` | Item 1's both-fail case: memory (and the DB) keep neither failed write's change — the second write's restore must not re-apply the first write's already-reverted value | pass |
| `internal/session/manager_writeturnstile_interleave_test.go` | `TestPersistFailure_RailWriteSurvivesAnUnrelatedSetterFailedRestore` | Item 1's rail-batch variant: a plain setter's failed restore must leave a *different*, already-queued rail write's own field alone | pass |
| `internal/session/manager_writeturnstile_interleave_test.go` | `TestRemoveSessionRecord_QueuedWriteBehindARemovalNeverPersistsOrBroadcasts` | Item 2: a write ticketed behind a `removeSessionRecord` call never persists or broadcasts after `sessionRemoved` — no ghost upsert, row stays deleted | pass |
| `internal/session/manager_writeturnstile_interleave_test.go` | `TestDeleteSession_StoreFailureStillDropsMemory` | Item 3: launch-rollback (`DeleteSession`, announced=false) drops the in-memory row even when the store delete itself fails — never-announced session never becomes visible in `List()`/`Exists()` | pass |
| `internal/session/manager_writeturnstile_interleave_test.go` | `TestReconcile_SweptRowStoreFailureStillDropsMemory` | Item 3's swept-row sibling: `Reconcile`'s sweep drops memory even when its own delete fails | pass |
| `internal/store/store_test.go` | `TestScanSession_CorruptStoredTimeReadsAsZeroAndLogsWarning` (new, replaces the old `scanSession: state_since` subtest) | Item 4: a corrupt `state_since` reads back as zero, `GetSession` returns no error, a warning names table/row/column, and a sibling row (plus the corrupt row itself) still loads via `ListSessions` | pass |
| `internal/server/ingest_sessionid_logging_test.go` | `TestProcess_ApplyPersistFailureLogsSessionID` | Item 5: the ingest worker's "applying ingest event to session state failed" warn line carries `session_id` explicitly, since `Apply`'s own error text doesn't | pass |
| `internal/server/ingest_sessionid_logging_test.go` | `TestProcessStatus_ApplyStatusPersistFailureLogsSessionID` | Item 5's status-line sibling: "applying status update to session failed" also carries `session_id` explicitly | pass |

### Proof each test fails on the old (pre-FW-D1) code

Per file, swapped in `git show HEAD:<path>` inside the scratchpad workflow (saved my copy first, restored it after, byte-diffed clean both times — confirmed for every file below):

- `internal/store/session.go`, `internal/store/store.go` reverted → `TestScanSession_CorruptStoredTimeReadsAsZeroAndLogsWarning` **fails to compile**: `st.SetLogger undefined (type *Store has no field or method SetLogger)`. `SetLogger` is new in this fix wave.
- `internal/server/ingest.go` reverted → both `TestProcess_ApplyPersistFailureLogsSessionID` and `TestProcessStatus_ApplyStatusPersistFailureLogsSessionID` **fail**: the logged line lacks `"session_id":1` (`does not contain "\"session_id\":1"`).
- `internal/session/{writeorder,manager,manager_rail,apply,reconcile,actions,liveness,reader,title,row}.go` reverted → all 6 tests in `manager_writeturnstile_interleave_test.go` **fail**:
  - `TestPersistFailure_LaterQueuedWriteSurvivesAnEarlierFailedRestore/earlier_write_fails,_later_write_succeeds`: `Unread` regressed to `true` (should stay `false`) and the persisted row carried the failed write's `TitleOverride`.
  - `.../both_writes_fail`: memory ended up claiming the first write's `TitleOverride` (`cloneRestore`'s whole-struct restore re-applied it via the second write's own `prev`) — exactly review.work.md's "memory now claims t1, which the DB never recorded."
  - `TestPersistFailure_RailWriteSurvivesAnUnrelatedSetterFailedRestore`: the rail write's `Pinned=true` was wiped by the unrelated setter's whole-struct restore.
  - `TestRemoveSessionRecord_QueuedWriteBehindARemovalNeverPersistsOrBroadcasts`: `require.Eventually` times out — old `removeSessionRecord` never drew a write ticket at all, so it isn't sequenced with the turnstile (exactly review's Major 2: "Removal is not sequenced with the write turnstile").
  - `TestDeleteSession_StoreFailureStillDropsMemory` and `TestReconcile_SweptRowStoreFailureStillDropsMemory`: the row stayed visible in `Exists()`/`List()` after the failed store delete (old code dropped memory only inside the success path).

## Implementation Bugs

None. All 6 review findings (a-M1/Major 1, a-M2/Major 2, the rail variant, a-Minor 7, item (b), item (c)) hold as fixed against the tests above.

## Test Run Output

```
$ go vet ./internal/session/... ./internal/store/... ./internal/keyedlock/...
(clean, no output)

$ make lint
golangci-lint run
0 issues.

$ go test -race -count=1 ./internal/session/... ./internal/store/... ./internal/keyedlock/... ./internal/server/...
ok  	github.com/Zalaras/muster/internal/session	32.605s
ok  	github.com/Zalaras/muster/internal/store	9.898s
ok  	github.com/Zalaras/muster/internal/keyedlock	3.119s
ok  	github.com/Zalaras/muster/internal/server	106.369s
```

`go build ./...` exits 0. `gofmt -l` on every touched/added test file: clean. `size-warn.sh`: one new `WARN funlen` on `TestPersistFailure_LaterQueuedWriteSurvivesAnEarlierFailedRestore` (100 > 60) — its two subtests (fail-then-succeed, fail-then-fail) share setup/gating shape but diverge enough in final assertions (specific-field survival vs. full byte-identity plus a re-application check) that collapsing them into a table would obscure the interleaving each one walks through; left as two `t.Run` bodies rather than forced into a shared helper that would hide the sequencing. `dead-refs.py`: no hits in any touched file.
