# Daemon Implementation: terminal-ended-rule-1

**Plan**: terminal-ended-rule-1
**Mode**: initial
**Pack**: not recorded (small track; pack output not read)

## Changes

| File | Action | What and Why |
|------|--------|--------------|
| `internal/server/shellactivity.go` | modified | `poll` reports listing success; `sync(ctx, sessionID)` on failure takes a fresh `p.rev++` into `revs[id]` and marks the session forced (REQ-2); `reconcile` broadcasts forced sessions even if unchanged, empty list if none, then clears the mark (REQ-3) |
| `internal/server/shells.go` | modified | `changed` is `func(context.Context, int64)`; spawn, rename, close pass the session id; attach nudge is `f.changed` |

## Decisions

design: no new type; `forced map[int64]bool` beside `revs` under `mu`, written by `sync` (under `tickMu`) and cleared by `reconcile` (also under `tickMu`). `tick` and `sync` share a new `poll` helper rather than duplicating the list-and-reconcile body.
REQ-1 is web-side (web-impl).

## Handoff

**Build status**: `go build ./...` exits 0; `golangci-lint run --tests=false ./...` clean.
Test files no longer compiling (old `sync(ctx)` signature; daemon-tests to adapt): `internal/server/shellactivity_test.go` (~384-390), `internal/server/terminals_sockets_test.go` (~75, 130, 140, 163); any `newShellFeature` caller passing `func(context.Context)` for `changed`.
