# Daemon Implementation: masthead-indicators

**Plan**: masthead-indicators
**Mode**: initial
**Pack**: kb: pack 16274 words (budget 30000)

## Changes

| File | Action | What and Why |
|------|--------|--------------|
| `internal/server/usagewire.go` | modified | REQ-2: `UsageInfo.Model` field and its mapping in `toWireUsage` removed; the wire `usage` object no longer carries a `model` key. Doc comment on `UsageInfo` reworded so it no longer describes the removed field. |

## Decisions

- REQ-3 / D2 / D3 / D7: deliberately not changed. `internal/usage` (Aggregator, dedup on bucket values and model), `internal/server/ingest.go:207` (model still passed into the sample) and the store keep reading and persisting the model; only the wire mapping dropped it. `go test -race -count=1 ./internal/usage/...` passes.
- REQ-1, REQ-4 to REQ-12 are web-side; not daemon work.
- Edge case 2 holds without code: a model-only change still fires the aggregator's change callback and the `usage` broadcast, now identical on the wire.
- design: no new type, helper or package; the change is a field removal in `UsageInfo`/`toWireUsage`. `rg "usage\.Model|snap\.Model|\.Usage\.Model" internal cmd --glob '!*_test.go'` found only the one mapping line, now gone; `sessionWireModel` stays (still used by `sessionwire.go:168`).
- doc-delta: none beyond the plan's Doc Delta.

## Handoff

**Build status**: `go build ./...` exits 0. `golangci-lint run --tests=false ./...` prints `0 issues.`; `gofmt -l .` is empty.

Test files that no longer compile (sanctioned breakage, Protocol Contract delta `usage` object drops `model`; `go vet ./internal/server/` reports `state_test.go:63:27: snap.Usage.Model undefined`). `make lint` is therefore blind; the `--tests=false` run above is the evidence.
- `internal/server/state_test.go:32` expects `"model": null` in the empty snapshot JSON; `:63` asserts `snap.Usage.Model`. Drop both.
- `internal/server/usagewire_test.go:21` (`got.Model` nil), `:36-41` (a `usage.Model` mapped onto the wire usage) and `:49` (`got.Model`) reference the removed field. Replace with a no-`model`-key assertion on the marshalled JSON, keeping the model in the `usage.Snapshot` input if wanted.
