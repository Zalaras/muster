# Daemon Implementation: Maintainability Cleanup — Unit D5 (terminal-socket lifecycle)

**Plan**: maintainability-cleanup
**Mode**: initial
**Pack**: not run for this unit — briefed directly by the team lead with the exact finding
(b-M5, seed V4, plus b-m9) and its cited line ranges from `review.maintainability.b-server.md`,
read in full, along with `daemon-implementation-D4.md` for the transport helpers it already
landed (`respond.go`: `writeJSONError`, `writeJSON`, `sessionOr404`, `writeDirectoryMissing`,
`msgInternalError`), which this unit reuses unchanged.

## Changes

| File | Action | What and Why |
|------|--------|--------------|
| `internal/server/terminal.go` | modified | Added `terminalPump` (per-surface target/key/nudge/socketToPTY) and `attachAndPump` (the one attach-and-pump lifecycle: Accept, takeover, MarkSeen, PTY->socket pump goroutine, caller's socket->PTY pump, teardown). `handleTerminal` now builds a `terminalPump` and calls it. Added `applyResize` (the one resize-clamp-and-apply, shared by the Claude and shell "resize" cases). Removed `shellScroller`, `minScrollLines`/`maxScrollLines`, `shellTextFrame`, `clampScrollLines`, `pumpShellSocketToPTY`, `applyShellTextFrame` (moved to shells.go, b-M5's "each surface's frame handling sits next to its handler"). File: 515 → 440 lines (resolves the file-length warning the review said had no reason). |
| `internal/server/shells.go` | modified | Added the shell-surface frame types/functions moved from terminal.go (`shellScroller`, `minScrollLines`/`maxScrollLines`, `shellTextFrame`, `clampScrollLines`, `pumpShellSocketToPTY`, `applyShellTextFrame` — the last now calls the shared `applyResize` for its "resize" case). Added `shellRegistry.PaneExists` (bounded by `shellTmuxTimeout`) and switched `Ensure`'s two direct `r.tmux.PaneExists` calls to it. `handleShellTerminal` now calls `f.registry.PaneExists` (was `f.registry.tmux.PaneExists` directly, unbounded — b-m9) and, after its unchanged 404/409 validation, calls `attachAndPump` with a `terminalPump{nudge: nil, socketToPTY: pumpShellSocketToPTY(...)}`. |

## Decisions

- Every REQ this unit owns (b-M5, seed V4, b-m9) is covered above; nothing deliberately
  skipped.
- design: `attachAndPump(w, r, log, registry, manager, sessionID, attach, terminalPump)` is
  the one attach-and-pump lifecycle, in `terminal.go` beside `terminalRegistry` (the type it
  drives) rather than in either feature file, since both `terminalFeature` and `shellFeature`
  call it. `terminalPump` carries exactly what varies per surface: `target` (tmux attach
  target), `key` (registry slot), `nudge` (nil for the shell surface — a shell's death is not
  its session's death), and `socketToPTY` (the surface's own frame-reading loop, passed as a
  closure so the shell surface can still thread its `scroller`/`shellTarget` through
  `pumpShellSocketToPTY` without `attachAndPump` needing to know shell exists). Reuse check —
  no prior shared lifecycle existed: `git show HEAD:internal/server/terminal.go | grep -n
  "^func.*attach\|^func.*Pump\|^type.*[Pp]ump"` before this change showed only `takeover`
  (the registry's own eviction step, one layer below this) and `pumpPTYToSocket`/
  `pumpSocketToPTY` (the per-direction byte pumps, already shared and left untouched) — no
  helper covering Accept-through-teardown.
- design: `pumpPTYToSocket`'s existing `(sessionID, nudgeOnEOF bool, nudge func(...))`
  signature is unchanged — `attachAndPump` passes `p.nudge != nil, p.nudge` rather than
  collapsing the two into one parameter, since `pumpPTYToSocket` is a separate, older seam
  this unit wasn't asked to touch and both call sites (Claude: `true`+`f.manager.Nudge`,
  shell: `false`+`nil`) were already the redundant pair pre-change — no test asserts the two
  params independently (`grep -n "pumpPTYToSocket(" internal/server/*_test.go` returns
  nothing; it's only called from `attachAndPump` now).
- design: `applyResize(ctx, log, bridge, cols, rows, logMsg)` is the one resize-clamp-and-Resize
  implementation; `logMsg` is the only per-surface variance (warn wording), matching the two
  pre-change call sites' only difference (`"terminal resize failed"` vs `"shell terminal
  resize failed"`). Verified one definition, two call sites post-change: `grep -n
  "applyResize(" internal/server/terminal.go internal/server/shells.go` →
  `terminal.go:427` (call), `terminal.go:434` (def), `shells.go:374` (call). Pre-change the
  clamp+Resize triple was written twice: `git show HEAD:internal/server/terminal.go | grep -n
  "clampInt(frame.Cols\|clampInt(frame.Rows\|bridge.Resize(ctx, cols, rows)"` → lines
  420-422 and 496-498.
- design: `shellRegistry.PaneExists(ctx, name)` wraps `r.tmux.PaneExists` in
  `context.WithTimeout(ctx, shellTmuxTimeout)` — the same bound `Ensure`'s two inline
  `context.WithTimeout(ctx, shellTmuxTimeout)` blocks already applied, so `Ensure`'s check
  and recheck now call `r.PaneExists(ctx, name)` too (reuse, not just a new caller for
  `handleShellTerminal`). No prior bounded-PaneExists helper existed on the registry: `git
  show HEAD:internal/server/shells.go | grep -n "func (r \*shellRegistry)"` before this
  change listed only `lockID`, `Ensure`, `markActive`, `HasAny`, `Kill` — none wrapped
  `PaneExists`.
- The four moved symbols (`shellScroller`, `shellTextFrame`, `clampScrollLines`,
  `pumpShellSocketToPTY`, `applyShellTextFrame` — b-M5 names these last four explicitly)
  moved together with `minScrollLines`/`maxScrollLines` and the `shellScroller` interface,
  which b-M5 doesn't name individually but are exclusively shell-surface (used only by the
  functions it does name): `grep -rn "shellScroller\|minScrollLines\|maxScrollLines"
  internal/server/*.go | grep -v _test.go` before this change showed every use inside
  `terminal.go`'s shell-only block or `shells.go`'s `shellFeature`/`server.go`'s
  `ShellScroll` config field — none from `terminalFeature` or any Claude-surface code —
  so leaving them behind in `terminal.go` while their only callers moved would have split
  one surface's frame handling across two files again.
- `handleShellTerminal`'s own two-step 404 (`strconv.ParseInt` fail → `not_found`;
  `manager.Exists` fail → `not_found`) is untouched — per the team lead's brief, "shells
  keep their `not_found` contract code" — and deliberately not routed through D4's
  `sessionOr404` (which calls `manager.Get`, not `Exists`, and this path's contract answers
  `no_shell` for a dead session with a lingering shell pane, not `not_found`).
- Behaviour unchanged: same close codes (4000/4001, unmoved in `terminalRegistry`), same
  frame handling (`applyResize`'s clamp bounds and `Resize` call are byte-identical to the
  two prior inline blocks; `applyShellTextFrame`'s `scroll` case is untouched), same order
  of effects (Accept → takeover → MarkSeen → pump goroutine → socket pump → cancel → close
  bridge → wait, identical to both prior handler bodies, now expressed once in
  `attachAndPump`). Did not touch `terminalRegistry`'s locking (F2's scope, per the brief).
- No doc-delta: `docs/protocol.md`'s terminal/shell-ws sections describe wire behaviour,
  none of which changed.

## Handoff

**Build status**: `go build ./...` exits 0.

```
$ gofmt -l internal/server/
(no output)

$ go build ./...
(exit 0)

$ go vet ./internal/server/...
(no output)

$ golangci-lint run ./internal/server/...
0 issues.

$ golangci-lint run --tests=false ./internal/server/...
internal/server/issue.go:535:18: func (*Server).buildIssueSnapshot is unused (unused)
internal/server/prefs.go:195:18: func (*Server).loadPrefs is unused (unused)
2 issues:
* unused: 2
```
Both `unused` findings are pre-existing (D4's Minor 5/`b-m5`, not this unit's scope, not
introduced or touched by this change — confirmed via `git diff -- internal/server/issue.go
internal/server/prefs.go` showing no changes from this unit to either function).

```
$ go test -race -count=1 ./internal/server/...
ok  	github.com/Zalaras/muster/internal/server	101.584s
```

**Test files needing changes**: none. No handler signature changed (`handleTerminal(w, r)`
and `handleShellTerminal(w, r)` are unchanged), no exported/test-visible symbol renamed —
moving `shellScroller`/`shellTextFrame`/`clampScrollLines`/`pumpShellSocketToPTY`/
`applyShellTextFrame` between files in the same package needed no test edits, confirmed by
the full package test run above passing unmodified.
