# Daemon Tests: remove-unread-right-click-1

**Plan**: remove-unread-right-click-1
**Verdict**: authored
**Pack**: kb: pack 34787 words (budget 30000)

Red-first: no implementation log; Handoff Received: None.

## Summary

Tests created: 6 session tests (one 14-row matrix) + 5 server tests (one 7-row table) | Red on assertion/compile: all but one | Passing today: 1 (`TestHandleUnreadSession_RequiresCookie`)

## Tests

| File | Test Name | What It Tests | Status |
|------|-----------|---------------|--------|
| `internal/session/rail_unread_test.go` | TestSetUnread_FromEveryReachableState | both values x six states x reachable Unread seeds: result, one upsert on change / none on no-op, persisted row, unread implies idle | red (compile: `SetUnread` undefined) |
| same | TestSetUnread_UnknownSessionReturnsErrUnknownSession | unknown id, no broadcast | red (compile) |
| same | TestSetUnread_EndedIdleSessionCanBeMarked | ended idle row sets | red (compile) |
| same | TestSetUnread_PersistsAcrossAStoreReload | new Manager on same store sees flag | red (compile) |
| same | TestSetUnread_LeavesOtherSessionsAlone | two sessions; other keeps flag, one upsert for target | red (compile) |
| same | TestSetUnread_AttachStillClearsAHandSetFlag | MarkSeen clears a hand-set flag | red (compile) |
| `internal/server/rail_test.go` | TestHandleUnreadSession_RequiresCookie | 401 without cookie, nothing written | passes today (see Notes) |
| same | TestHandleUnreadSession_InvalidBodyIs400 | not JSON / missing / string / null | red (404 vs 400) |
| same | TestHandleUnreadSession_UnknownSessionIs404 | `unknown_session` | red (404 from mux, body not the error envelope) |
| same | TestHandleUnreadSession_Is204AndBroadcastsOnlyAChange | 7 rows over idle/working/needs_input: 204 empty body, one upsert with new flag on change, none on no-op, persisted, bystander untouched | red (404 vs 204) |

## Handoff Received

None.

## Notes

- `TestHandleUnreadSession_RequiresCookie` passes today: the auth guard answers 401 for the not-yet-registered path before routing. It guards that the new route is registered behind the cookie check; the plan's red claim (route missing) is carried by the other four tests, which fail with 404.
- `TestSetUnread_*` cannot run red on an assertion: `Manager.SetUnread` does not exist, so the `internal/session` test package fails to compile (the plan's stated red). `make lint` fails only on those `typecheck` errors.

## Test Run Output

```
$ go test -run TestSetUnread ./internal/session/
internal/session/rail_unread_test.go:242:16: mgr.SetUnread undefined (type *Manager has no field or method SetUnread)
FAIL	github.com/Zalaras/muster/internal/session [build failed]

$ go test -run TestHandleUnreadSession ./internal/server/
--- FAIL: TestHandleUnreadSession_InvalidBodyIs400/not_JSON
    expected: 400
    actual  : 404
--- FAIL: TestHandleUnreadSession_Is204AndBroadcastsOnlyAChange/idle_read_marked_unread
    expected: 204
    actual  : 404
FAIL	github.com/Zalaras/muster/internal/server
```
