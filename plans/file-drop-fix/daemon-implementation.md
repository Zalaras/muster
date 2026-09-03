# Daemon Implementation: file-drop-fix

**Plan**: file-drop-fix
**Mode**: initial

## Changes

| File | Action | What and Why |
|------|--------|--------------|
| `internal/locate/locate.go` | created | `Finder` interface, `Locator` type with `Locate(ctx, dir, name, upload) (string, error)`, sentinel `ErrNotLocated` / `*ErrAmbiguous{Paths}`. Byte-compares every candidate a `Finder` returns, dedupes via `EvalSymlinks`, sorts. Pure stdlib, no server/session/claudecode imports (D17). |
| `internal/locate/spotlight.go` | created | `SpotlightFinder`: runs `mdfind` with `BuildQuery` (exact `kMDItemFSName`+`kMDItemFSSize`), 2s timeout, degrades to `(nil, nil)` on missing binary or timeout (D11). `BuildQuery` exported for D10. |
| `internal/locate/walk.go` | created | `WalkFinder`: `filepath.WalkDir` filtered by basename+size via `DirEntry.Info()`, skips `.git`, stops at `entryCap` entries or `ctx.Done()` (treated as exhausted, not an error — Edge Case 11), surfaces a real error only when the walk root itself is unreadable (protocol §3.14's 500 case). |
| `internal/server/locate.go` | created | `handleLocateFile` (`POST /api/sessions/{id}/locate`): reads the single `file` multipart part directly via `multipart.Reader` (never `ParseMultipartForm`, so nothing can spill to a temp file — INV-2), wrapped in `http.MaxBytesReader` for the 50 MiB + 64 KiB cap, delegates to `Locator.Locate`, maps outcomes to the Protocol Contract's `200`/`400`/`404`/`409`/`413`/`500` codes. `409 ambiguous` responses carry `paths` inside the standard `{"error":{...}}` envelope (matches `web/src/api.ts`'s existing `parseApiError`, which reads `value["error"]`). |
| `internal/server/server.go` | modified | `Config.Locator *locate.Locator` field, `Server.locator` field, route registered: `POST /api/sessions/{id}/locate` behind `requireCookie`, next to the other `/api/sessions/{id}/...` routes. |
| `cmd/musterd/main.go` | modified | Constructs `locate.New()` (Spotlight + walk finders, default timeout/cap) and passes it as `Config.Locator`. No new flags (plan explicitly says none). |

## Decisions

- **409 `ambiguous` body wraps `paths` inside the standard `{"error":{...}}` envelope**, not flat at the top level as the plan's/protocol's illustrative JSON literally shows (`{ "code": "ambiguous", "message": "...", "paths": [...] }`). Verified `web/src/api.ts:66-74`'s `parseApiError` reads `value["error"]["code"]`/`["message"]` — the wrapped envelope is muster's one settled error shape (`docs/protocol.md:53`, and every existing handler via `writeJSONError` in `internal/server/auth.go:45`). The plan's own §3.14 body examples for `404 not_located`/`409 ambiguous` are the only two error bodies in the whole doc shown with example JSON at all (every other code — `400`, `413`, `500`, and every other endpoint's errors — is named with no body shown), so I read these as illustrating the `code`/`message`/`paths` *content*, not a wire-format override of the one settled envelope. Not treated as a plan-vs-fixture conflict to escalate: no test fixture in `test-specs.md` or the web-impl log asserts the raw un-wrapped shape — the E2E specs only assert rendered notice text, and `web-implementation.md`'s own `ApiErrorBody` extension is additive to the existing wrapped-parse function.
- **Multipart body read via `r.MultipartReader()` + `multipart.Reader.NextPart()`, not `r.ParseMultipartForm`.** `ParseMultipartForm(maxMemory)` can still spill to an on-disk temp file if its accounting differs from the exact 50 MiB + 64 KiB cap; reading the single `file` part directly off the wire is unconditionally memory-only, which is what INV-2 actually requires — not just "small enough in practice."
- **`WalkFinder`'s cap field renamed `entryCap`** (not `cap`, the plan's literal wording) — `cap` is a Go builtin; `golangci-lint`'s `revive` flagged the redefinition (`internal/locate/walk.go:19:20: redefines-builtin-id`). Purely a naming fix, no behavior change.
- **`Locator.walkCap`/`spotlightTimeout` fields are set by `New()` but not read again by `Locate`** — they exist per the plan's literal `Locator` struct shape; the values that matter operationally are baked into the constructed `SpotlightFinder`/`WalkFinder` at construction time (spotlight.go's own `timeout` field, walk.go's own `entryCap` field), which is what `Locate`'s per-call behavior actually uses.

## Handoff

**Build status**: `go build ./...` exits 0.

`gofmt -l`, `go vet ./...`, and `make lint` (both `make lint` and `golangci-lint run --tests=false ./...`) are all clean — 0 issues.

`go test ./...` needed `-p 1` to run clean: with default parallelism I hit three *different* flaky failures across three unrelated packages/tests on separate runs (`cmd/musterd`'s `TestRunTmuxPreflight_*`, `internal/server`'s `TestWrapperScriptsShellRoundTrip_DaemonUnreachableExitsSilentlyAndFast`, `internal/server`'s `TestLauncher_SuccessfulLaunchEndToEnd`, then `internal/tmux`'s `TestPreflight_UppercaseProgramNamePrefixIsNotTrimmed`), each of which passed cleanly when re-run in isolation — pre-existing subprocess/tmux resource contention under parallel `go test`, not caused by this plan's changes (none of those files were touched here). `go test ./... -p 1 -count=1` passed every package.

No test files needed changes. Nothing to hand off — package is new, nothing else touches it yet.
