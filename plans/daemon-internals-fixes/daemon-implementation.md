# Daemon Implementation: daemon-internals-fixes

**Plan**: daemon-internals-fixes
**Mode**: initial
**Pack**: kb: pack 26766 words (budget 30000)

## Changes

| File | Action | What and Why |
|------|--------|--------------|
| `internal/atomicfile/atomicfile.go` | created | `Write`, moved verbatim from `claudecode.AtomicWriteFile` (REQ-3); doc comment's caller list updated |
| `internal/claudecode/settings.go` | modified | `AtomicWriteFile` removed; `writeScriptAtomically` calls `atomicfile.Write` (REQ-3) |
| `internal/server/launcher.go` | modified | settings write calls `atomicfile.Write` (REQ-3) |
| `internal/selfupdate/apply.go` | modified | `installBinary(exePath, data)` is `atomicfile.Write(exePath, data, 0o755)`; `tag` parameter dropped; doc comments updated (REQ-2) |
| `internal/server/ingest.go` | modified | `maxIngestBodyBytes = 20 << 20`; `http.MaxBytesReader` before `io.ReadAll`; on `*http.MaxBytesError` one warn line (`kind`, `limitBytes`), still 200, nothing enqueued (REQ-1) |

## Decisions

- design: `atomicfile` is a leaf package (stdlib only), matching `internal/boundedwait`/`keyedlock` as the plan says. `rg 'func AtomicWriteFile|os.WriteFile\(tmpPath' internal cmd` now finds nothing: one atomic-replace implementation.
- design: ingest cap matches `locate.go`'s `http.MaxBytesReader` + `errors.As(*http.MaxBytesError)` shape and its named-constant style (`maxLocateUploadBytes`); no new helper. Log field is `limitBytes` (20971520), never the body.
- design: `installBinary` kept as a thin named wrapper (not inlined into `Apply`) to keep the error wrapping text "installing new binary" and the existing doc anchor; the `tag` parameter went as the plan allowed.
- doc-delta: `Apply`/`installBinary` no longer use the `.musterd-<tag>.tmp` name; the temp name is `.musterd.tmp-*` (from `os.CreateTemp`). Any doc naming the fixed temp file is now wrong.
- Not a deviation: the full `./internal/server` suite under `-race` was killed once ("signal: killed", `TestWrapperReply_AnAnswerThatNeverComesPrintsNothing`) when I ran two copies concurrently; re-run alone, whole package `ok` (597s) and the wrapper/ingest/launch subset `ok`.
- Size warnings: `internal/server/launcher.go` (625 lines) was already over 500 before this change; I added one import line only.

## Handoff

**Build status**: `go build ./...` exits 0; `make lint` 0 issues; `gofmt -l .` empty; `go vet ./...` clean.
None — no test file is broken. `internal/atomicfile` has no tests yet (the plan's ordinary-mode daemon-tests step adds `atomicfile_test.go`). `internal/atomicfile/**` needs adding to `docs/features/ingest/spec.md` `go:` globs by the orchestrator.
Target tests: `go test -count=1 -run 'TestHandleIngest_|TestInstallBinary_' ./internal/server/ ./internal/selfupdate/` → both `ok`.
