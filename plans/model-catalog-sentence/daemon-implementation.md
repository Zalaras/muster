# Daemon Implementation: model-catalog-sentence

**Plan**: model-catalog-sentence
**Mode**: initial
**Pack**: kb: pack 15313 words (budget 30000)

## Changes

| File | Action | What and Why |
|------|--------|--------------|
| `internal/claudecode/modelcheck.go` | modified | REQ-1: `unknownModelWindowSentence` (2.1.299+) matched beside `modelCatalogSentence` in `stderrSaysUnrecognised`; installed version not consulted |

## Decisions

REQ-2 is the test agent's (`test/canary/static_test.go`, already authored); nothing for daemon-impl.

design: no new type or helper — a second unexported const and an `||` in the existing `stderrSaysUnrecognised`, the only reader of the first const (`rg "modelCatalogSentence|stderrSaysUnrecognised"` -> only modelcheck.go, its test and a canary comment). Both consts stay unexported inside `internal/claudecode`.

## Handoff

**Build status**: `go build ./...` exits 0; `go vet ./...`, `gofmt -l .` and `make lint` (0 issues) clean; `go vet -tags canary ./test/canary/` clean; `go test -race -count=1 ./internal/claudecode/...` ok; plan check D1 green; no size warning on modelcheck.go.
Test files needing changes: None
