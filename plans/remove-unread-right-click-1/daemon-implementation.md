# Daemon Implementation: remove-unread-right-click-1

**Plan**: remove-unread-right-click-1
**Mode**: initial
**Pack**: kb: pack 45432 words (budget 30000)

## Changes

| File | Action | What and Why |
|------|--------|--------------|
| `internal/session/manager_rail.go` | modified | `Manager.SetUnread(ctx, id, unread)` beside `MarkSeen` (REQ-1): `ErrUnknownSession`; `true` on a non-idle session degrades to a no-op; unchanged flag is a no-op with no write or broadcast; a change is one `persistWholeRowLocked` |
| `internal/server/rail.go` | modified | `PUT /api/sessions/{id}/unread` registered beside pin; `unreadSessionRequest{Unread *bool}`; `handleUnreadSession` errors shaped as `handlePinSession` (REQ-1) |
| `docs/protocol.md` | modified | Route table row, new `kb:anchor sessions.unread` section after `sessions.pin`, and "or by `kb:anchor/sessions.unread`" in the session-row `unread` comment and the ingest `unread` bullet; no `protocolVersion` bump |

## Decisions

- REQ-1 implemented as the Protocol delta states; no contract change or conflict.
- design: `SetUnread` is a setter shaped like `MarkSeen` (same file, same lock and `persistWholeRowLocked` tail) rather than a new write path; `rg -n "\*bool" internal/server/*.go` found no shared boolean-body handler to reuse (only `handlePinSession`, groups' collapsed handler and prefs), so `handleUnreadSession` copies `handlePinSession`'s shape.
- design: `make size-warn` reports `internal/server/rail.go:41-65 / 71-95` as dupl (pin vs unread handler); kept on purpose: a shared helper would need the field name, message and setter as parameters, more indirection than the 25 lines, and the two handlers are expected to diverge (pin renumbers, unread does not).
- Stale-`unread` note: `unread:true` on a non-idle session is a no-op (not an error), per the plan, so INV `unread ⇒ state == "idle"` holds without a second check elsewhere.
- Verification: `go test -count=1 -run 'TestSetUnread|TestHandleUnreadSession' ./internal/session/ ./internal/server/` ok; `go test -race ./internal/session/` ok (515s under load average ~8-30, the machine was shared); `go test -count=1 ./internal/server/` ok (112s); `go test -race -run 'Unread|Pin|Order|Rail' ./internal/server/` ok. A full `-race` run of `internal/server` timed out in `buildOversizeLocateRequest` (locate_test.go, untouched) under that load; not re-run to completion.

doc-delta: none beyond the plan's Doc Delta; protocol.md is already changed per the delta.

## Handoff

**Build status**: `go build ./...` exits 0; `golangci-lint run --tests=false ./...` → `0 issues.`

`make lint` reports one finding in a test file I may not edit: `internal/session/rail_unread_test.go:272:2: require-error: for error assertions use require (testifylint)` on `assert.ErrorIs(t, err, ErrUnknownSession)`. Test agent: change it to `require.ErrorIs`.

## Fix Attempt 1 (review cycle 1)

**Failures addressed**: maintainability Major 1 (`SetUnread` copied `MarkSeen`'s body); correctness Minor 2 (`internal/server/CLAUDE.md` Owns line).

**Changes made**:
- `internal/session/manager_rail.go`: `MarkSeen` now returns `m.SetUnread(ctx, id, false)`; `SetUnread` is the one locked body that writes `Unread` outside the state machine.
- `internal/server/CLAUDE.md`: Owns line reads `rail.go` (pin, unread, order); `make gen-kb` reported all generated files fresh.

**Paths reaching the defect**: every `Unread` write outside `setState`/`Apply` was `MarkSeen` or `SetUnread`; after the change `rg -n "\.Unread\s*=" internal --type go -g '!*_test.go'` finds only apply.go, session.go (`setState`) and the one in `SetUnread`.

**Blast radius** (`rg "MarkSeen" --glob '*.go'`, non-test): `internal/server/terminal.go:382` (attach; logs the error, unchanged semantics: no write or broadcast when already read, `ErrUnknownSession` on a miss) and `renderfix_scenarios_rail.go:214` (same). `MarkSeen`'s `false` on a non-idle session still clears, because the idle guard only applies to `unread=true`. Only the wrapped error text changed ("marking session %d seen" to "setting session %d unread=false"); no test or caller matches it.

**Verification**: `go test -race -count=1 -run 'SetUnread|MarkSeen|Unread|WriteOrder|Writeturnstile|Rail' ./internal/session/` ok; `go test -race -count=1 -run 'HandleUnreadSession|Terminal|Seen' ./internal/server/` ok; `make lint` 0 issues; `go build ./...`, `go vet`, `gofmt -l` clean; `make size-warn` shows no warning on touched production files.

**Decisions**:
- design: `MarkSeen` delegates to `SetUnread` rather than both delegating to a private helper, since `MarkSeen` is exactly `SetUnread(false)`; `rg "persistWholeRowLocked"` shows the other whole-row setters (SetTitle, SetNote) write different fields, so none share this body.

## Fix Attempt (review cycle 2)

**Failures addressed**: maintainability Minor 1 (stale Unread writer docs) and the undocumented unread handler.
**Changes made**: comment-only. `Session.Unread` declaration (`session.go`) now names Apply, SetUnread and MarkSeen-through-SetUnread as writers and setState plus SetUnread as the two keepers of Unread implies idle; `MarkSeen` comment (`manager_rail.go`) says the clear is SetUnread(false); `SetUnread` gained a doc comment; `writeorder.go` setter list names SetUnread in place of MarkSeen; `unreadSessionRequest` and `handleUnreadSession` (`rail.go`) cite `kb:anchor/sessions.unread`.
**Decisions**: none; no behaviour change. Verified: `go build ./...` ok, `make lint` 0 issues, `go test -count=1 -run 'SetUnread|MarkSeen|HandleUnreadSession' ./internal/session/ ./internal/server/` ok.
