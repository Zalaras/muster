# Daemon Implementation: v1 Cleanup

**Plan**: v1-cleanup
**Mode**: initial

## Changes

| File | Action | What and Why |
|------|--------|--------------|
| `internal/server/server.go` | modified | REQ-1/REQ-2: `paneSpawner`, `paneConn`, `attachFunc` declared (consumer-side, `*tmux.Client`/`*termbridge.Bridge` satisfy them without knowing); `Config.TmuxClient paneSpawner` and `Config.Attach attachFunc` added, both nil-defaulting to real construction (D1/D2); `Server.tmuxClient` is now `paneSpawner`, new `Server.attach attachFunc` field; `New()` always builds the concrete `tmux.New(cfg.TmuxSocket)` (cheap, no process spawn) so the default `attach` closure has a concrete client for `termbridge.Attach`, then picks `spawner = cfg.TmuxClient` if set. |
| `internal/server/sessions.go` | modified | REQ-1: `sessionLauncher.tmux` is now `paneSpawner`; dropped now-unused `internal/tmux` import. REQ-8: `handlePinSession`/`handleSetOrder`'s 500 bodies are fixed strings (`"pinning session"` / `"setting rail order"`) instead of `err.Error()`. |
| `internal/server/shells.go` | modified | REQ-1: `shellRegistry.tmux` is now `paneSpawner`; `newShellRegistry` takes `paneSpawner`. REQ-5: deleted the `spawned` map — `Ensure`/`Kill` no longer write to it; `PaneExists` is the sole source of truth. |
| `internal/server/terminal.go` | modified | REQ-2: `terminalConn.bridge`, `pumpPTYToSocket`, `pumpSocketToPTY`, `applyResizeFrame` take `paneConn`; both `termbridge.Attach` call sites (`handleTerminal`, `handleShellTerminal`) now call `s.attach(ctx, target)`; dropped the now-unused `internal/termbridge` import. |
| `internal/server/locate.go` | modified | REQ-6: nil-`Locator` guard in `handleLocateFile` returns `500 internal_error` ("locating file") before ever touching the request body, instead of panicking on `s.locator.Locate`. |
| `internal/locate/locate.go` | modified | REQ-7: deleted `Locator.walkCap`/`spotlightTimeout` fields (confirmed unread via `rg '\.walkCap|\.spotlightTimeout' internal/locate/` — no hits) and their assignments in `New`/`NewWithFinders`. |
| `internal/session/manager.go` | modified | REQ-10: `maxRailPosLocked`'s doc comment now says what it actually returns (the largest `RailPos`, or `-1` when there are none) instead of describing `+1`, which the function never adds itself. |
| `cmd/musterd/main.go` | modified | REQ-9: `checkWebDist` takes `dashboard fs.FS` as a parameter (added `io/fs` import); `run()` passes `webui.FS()`. Precedence unchanged (D7): the on-disk branch still returns before the embedded check ever runs. |
| `internal/tmux/tmuxtest/tmuxtest.go` | created | REQ-4: shared per-test tmux socket helper (`tmuxtest.Socket(t)`), modeled byte-for-byte on `internal/tmux/tmux_test.go`'s `newTestSocket` (same `os.MkdirTemp` + two `t.Cleanup`s, same sun_path rationale in the doc comment). A separate package (not `internal/tmux`'s own `_test.go`) because `internal/server`, `internal/termbridge` and `cmd/musterd` all need to import it and Go test files aren't importable. Adoption at the eight existing call sites is daemon-tests' job (see Handoff). |
| `Makefile` | modified | REQ-11: `clean`'s recipe carries the same `# Historic: …` note `.gitignore:16` already has, explaining why `web/dist` is still swept. |

## Decisions

- REQ-9's fatal-branch test migration and the D9-shaped `checkWebDist` compile break in `cmd/musterd/webdist_test.go` are the plan's own explicit contract (Affected Files → Daemon tests: "cmd/musterd/webdist_test.go — the fatal branch REQ-9 makes testable... replacing the comment block"), not an accommodation on my part — implemented the signature the plan specifies, byte for byte.
- `New()` always constructs the concrete `tmux.New(cfg.TmuxSocket)` regardless of whether `Config.TmuxClient` is set, because `termbridge.Attach` needs a concrete `*tmux.Client` and the plan's own Implementation Notes say `attachFunc` is a *second*, independent seam from `paneSpawner` precisely because `termbridge.Attach` "takes `*tmux.Client` concretely." `tmux.New` itself does no I/O (verified by reading `internal/tmux/tmux.go:26-29`: it just stores the socket string), so constructing it unconditionally costs nothing and keeps D1/D2 independent as the Edge Cases list them separately (1 and 2, not a combined case).
- Did not touch `handleSetTitle`'s `err.Error()` 500 body (`internal/server/sessions.go:576`) — REQ-8 names only `handlePinSession` and `handleSetOrder`; YAGNI.

## Handoff

**Build status**: `go build ./...` exits 0.

`go vet ./...` and `golangci-lint run ./...` both surface exactly two compile breaks, both in test files explicitly assigned to daemon-tests by the plan's own Affected Files list — not defects in the production code above:

1. `cmd/musterd/webdist_test.go:24,41,58` — calls `checkWebDist(dir, log)` (2 args); the plan's REQ-9 changes the signature to `checkWebDist(webDist string, dashboard fs.FS, log zerolog.Logger)`. Plan: "`cmd/musterd/webdist_test.go` — the fatal branch REQ-9 makes testable, replacing the comment block at `:64-79`." Sanctioned breakage.
2. `internal/server/plainshell_test.go:694`, `internal/server/terminal_test.go:304,307,327,330` — call `srv.tmuxClient.DisplayVar(...)` directly; `paneSpawner` (REQ-1/REQ-2's consumer-side interface, covering only `NewSession`/`NewNamedSession`/`PaneExists`/`KillWindow`/`KillSession`) has no `DisplayVar` method, since `DisplayVar` is not one of the calls `internal/server`'s own code makes (only these keep-real geometry tests reach it, for introspection). These are all on REQ-3's keep-real list (`ResizeFrameAppliesRealGeometry`, `ResizeFrameIsClampedToTheProtocolBounds`, and the plainshell equivalent), which the plan already assigns to daemon-tests for migration. Fix is straightforward — the test already has a live tmux socket, so it can build its own `tmux.New(socket)` (or just keep a `*tmux.Client` local var alongside the interface-typed field) to call `DisplayVar` on directly, rather than reaching through `srv.tmuxClient`.

Ran `golangci-lint run --tests=false ./...` (excludes test files) → **0 issues** — confirms the production code above is clean and these two breaks are the only reason the full-repo lint/vet doesn't pass yet.

No test files were edited (no import-only fixes were needed — both breaks above are argument/method-shape changes, not import paths).

## Fix Attempt 1 (pre-review fix)

**Failures addressed**: daemon-tests' repro, `go test -count=1 ./internal/server/ -run TestHandleLocateFile`, failed 5:
`TestHandleLocateFile_MissingFilePart` (expected 400, got 500), `TestHandleLocateFile_NotMultipartBody`
(400 vs 500), `TestHandleLocateFile_BadFilename` (400 vs 500), `TestHandleLocateFile_TooLarge` (413 vs
500), `TestHandleLocateFile_NeverWritesUploadToDisk` (400 vs 500).

**Root cause**: `handleLocateFile` placed the REQ-6 nil-`Locator` guard immediately after the
`unknown_session` check, i.e. before `r.MultipartReader()`/`readFilePart` ever ran. With
`Config.Locator` nil (every `newTestServer` in the package leaves it unset), the guard fired for
*every* request, short-circuiting the pre-existing 400/413 body-validation branches that used to
return before ever reaching `s.locator`.

**Changes made**: `internal/server/locate.go` — moved the `if s.locator == nil { ... 500 ... }`
block down to immediately before `s.locator.Locate(r.Context(), sess.Directory, name, upload)`,
after `readFilePart` has already succeeded. Only one call site reads `s.locator` in the package
(confirmed: `rg 's\.locator' internal/server/*.go` → the guard itself at what is now line ~74, and
the `Locate` call two lines below it — no other caller exists), so moving the guard to sit directly
above its one call fully closes the defect; there is no second code path to fix. Added a doc comment
on the relocated guard explaining why it sits there (guards only the `Locate` call, keeps the 400/413
branches above it reachable regardless of Locator configuration).

**Verification**:
- Reporter's exact repro re-run: `go test -count=1 ./internal/server/ -run TestHandleLocateFile` →
  `ok  	github.com/Zalaras/muster/internal/server	0.841s` (all pass, including the five previously-
  failing tests and `TestHandleLocateFile_NilLocatorIs500NotAPanic`, which still passes unchanged
  since its request has a valid file part and therefore reaches the relocated guard exactly as
  before).
- Full suite: `go test -count=1 ./...` → all packages `ok`, no failures.
- `go build ./...` exits 0, `go vet ./...` clean, `gofmt -l internal/server/locate.go` empty,
  `golangci-lint run ./...` → `0 issues.`

**Build status**: `go build ./...` exits 0. No test files needed changes.
