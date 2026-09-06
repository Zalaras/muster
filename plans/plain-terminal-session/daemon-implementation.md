# Daemon Implementation: Plain terminal session

**Plan**: plain-terminal-session
**Mode**: initial

## Changes

| File | Action | What and Why |
|------|--------|--------------|
| `internal/tmux/tmux.go` | modified | Added `NewNamedSession` (arbitrary session name); `NewSession` now delegates to it with the `"muster-<id>"` name. Added package-level `ShellSessionName(id) string` and `IsShellSessionName(name) (id int64, ok bool)` as the one definition of the `muster-<id>-shell` convention. |
| `internal/server/shells.go` | created | New `shellRegistry`: `Ensure(ctx, id, dir)` (check `PaneExists`, spawn via `NewNamedSession` if absent — makes REQ-8's respawn-after-`exit` work) and `Kill(ctx, id)`. No `MUSTER_SESSION` in the pane env, no `settings.local.json` write (REQ-2) — deliberately bypasses `sessionLauncher` entirely. Whole `Ensure`/`Kill` calls are mutex-guarded to avoid a racy double-spawn on concurrent POSTs. |
| `internal/server/terminal.go` | modified | `terminalRegistry` now keyed by `terminalKey{sessionID, surface}` (`surfaceClaude`/`surfaceShell`) instead of session id alone (INV-3). `closeSession` (End) now closes only the Claude surface; new `closeSessionAndShell` (Remove) closes both. Added `handleShellTerminal` (`GET /ws/shell/{id}`): 404/409 `no_shell` pre-upgrade checks (via `tmux.ShellSessionName` + `PaneExists`), takeover keyed on `surfaceShell`, attach-only (never spawns). `pumpPTYToSocket` gained a `nudgeOnEOF bool` parameter — the shell surface passes `false` so its PTY EOF never nudges the parent session's liveness poll, per §6.1. |
| `internal/server/sessions.go` | modified | Added `handleCreateShell` (`POST /api/sessions/{id}/shell`, §3.16): 404 `unknown_session`, 409 `directory_missing` (checked via `os.Stat` before spawn, mirroring Launch/Resume), 500 `shell_spawn_failed`; not gated on `alive` (REQ-7). `handleRemoveSession` now calls `s.terminals.closeSessionAndShell` and `s.shells.Kill` before delegating to `manager.Remove` (REQ-9) — `handleEndSession` is untouched, so End still leaves the shell running. |
| `internal/server/server.go` | modified | Constructs `s.shells = newShellRegistry(tmuxClient, cfg.Logger)`; wires `POST /api/sessions/{id}/shell` and `GET /ws/shell/{id}` routes. |
| `internal/session/manager.go` | modified | `Reconcile`'s unknown-tmux-session sweep now checks `tmux.IsShellSessionName` first: a shell session is killed unconditionally via the existing `sessionKiller` and counted in a new `ReconcileReport.ShellsKilled` field, never appended to `UnknownSessions` (REQ-10). Added `shells_killed` to the startup reconcile log line. |

## Decisions

- `interactiveShellArgv` (the plan's "shellCommand" concept) is named that, not `shellCommand`, because `internal/server/terminal_test.go` already defines a package-level `shellCommand()` test helper (an unrelated pre-existing fake-Claude-process command for m2-terminal tests) — `go vet` failed with `shellCommand redeclared in this block` until renamed. No test file was edited; this is purely my own production-code naming choice avoiding the existing test symbol.
- `Ensure`/`Kill` hold `shellRegistry.mu` across the whole tmux round trip (not just the in-memory map), not only "mutex-guarded record" as the plan's Affected Files phrasing suggests literally — needed so two concurrent `POST .../shell` calls for the same session can't both observe "no pane" and both attempt `tmux new-session -s <name>`, where the loser would get a tmux "duplicate session" error instead of a clean `created:false`. Shell spawns are rare (one per session, lazily), so serializing them has no meaningful cost.
- `Ensure`'s returned `target` is the bare tmux session name (`muster-<id>-shell`), not a `session:window` target — matches §3.16's `{"target": "muster-7-shell", ...}` wire shape exactly, and works because the shell topology is one window per session (same reasoning `AttachArgv`/`attach-session -t <target>` already relies on for the Claude case, where the stored `TmuxTarget` happens to include the window suffix but attaching by session name alone is equally valid tmux syntax).
- `internal/session` now imports `internal/tmux` (previously it only depended on locally-defined `PaneChecker`/`PaneSnapshotter`/`Killer` interfaces, satisfied structurally). This is a deliberate, plan-directed exception: the naming convention has "exactly one definition" (`tmux.ShellSessionName`/`tmux.IsShellSessionName`) and `internal/tmux` has no reverse dependency on `internal/session`, so there is no import cycle (verified: `go build ./...` exits 0).

## Handoff

**Build status**: `go build ./...` exits 0.
`gofmt -l .` — no output (clean). `go vet ./...` — clean. `golangci-lint run` — 0 issues. `golangci-lint run --tests=false ./...` — 0 issues (paste of both below).

No test files needed changes — no existing test file references `terminalRegistry`'s internals (`takeover`/`release`/`closeSession` keyed by raw `int64`) directly; every existing terminal test drives the change through HTTP/WS, and `go test ./internal/... ./cmd/...` passes unmodified (see below).

### Gate evidence

```
$ go build ./...
(exit 0, no output)

$ gofmt -l .
(no output)

$ go vet ./...
(exit 0, no output)

$ golangci-lint run
0 issues.

$ golangci-lint run --tests=false ./...
0 issues.

$ go test ./internal/... ./cmd/...
ok  	github.com/Zalaras/muster/internal/claudecode	(cached)
ok  	github.com/Zalaras/muster/internal/ghissue	(cached)
ok  	github.com/Zalaras/muster/internal/gitutil	(cached)
ok  	github.com/Zalaras/muster/internal/locate	(cached)
ok  	github.com/Zalaras/muster/internal/server	19.070s
ok  	github.com/Zalaras/muster/internal/session	2.295s
ok  	github.com/Zalaras/muster/internal/store	(cached)
ok  	github.com/Zalaras/muster/internal/termbridge	3.379s
ok  	github.com/Zalaras/muster/internal/tmux	16.777s
ok  	github.com/Zalaras/muster/internal/usage	(cached)
ok  	github.com/Zalaras/muster/internal/webui	3.875s
ok  	github.com/Zalaras/muster/cmd/musterd	14.959s
```

No new daemon-tests are included in this step (that is daemon-tests' job); the above is the
pre-existing suite passing unmodified against the new code, plus the two lint gates.
