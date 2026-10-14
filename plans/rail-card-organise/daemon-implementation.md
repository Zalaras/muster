# Daemon Implementation: Rail card menu, drag into groups, and cache warmth

**Plan**: rail-card-organise
**Mode**: initial
**Pack**: kb: pack 34050 words (budget 30000)

## Changes

| File | Action | What and Why |
|------|--------|--------------|
| `internal/claudecode/status.go` | modified | `prompt_cache` read into neutral `StatusUpdate.Cache` (`StatusCache{ExpiresAt, TTLSeconds}`); `expires_at` must be a JSON integer, `ttl` `<digits><s\|m\|h>` > 0, else nil (REQ-21, D1) |
| `internal/claudecode/claudecodetest/claudecodetest.go` | modified | `StatusLineFullOpts.PromptCache` (`PromptCacheOpts`) puts a `prompt_cache` in the status body so other packages' tests need no literal (D9) |
| `internal/session/session.go` | modified | `Session.Cache *Cache` (nil = unknown) |
| `internal/session/status.go` | modified | `adoptCache`: replaces on change only, nil update leaves the value (REQ-21, REQ-23, D2, D3, D4) |
| `internal/session/apply.go` | modified | `ApplyStatus` broadcasts when the cache pointer changed |
| `internal/session/machine.go` | modified | `/clear` rebind (`KindClearRebind`) sets `Cache = nil`; nothing else writes it (REQ-22, D5, D6) |
| `internal/session/writeorder.go` | modified | `Cache` joins `restoreChangedFields` and `restoredSessionFields` (pointer identity, like `Context`) so a failed persist rolls it back and `CheckSessionFieldCoverage` stays true |
| `internal/session/row.go` | modified | `cacheFromRow` / `cacheToRow` (both columns or nil) |
| `internal/store/session.go` | modified | `CacheExpiresAt`/`CacheTTLSeconds` on `SessionRow`, written by `UpdateSession`, read by `sessionColumns`/`scanSession`; a corrupt `cache_expires_at` leaves both nil so INV-1 never breaks |
| `internal/store/migrations/0014_prompt_cache.sql` | created | the two columns, forward-only |
| `internal/server/sessionwire.go` | modified | `cache` key on every Session object: `null` or `{expiresAt (RFC3339 UTC), ttlSeconds}` (D8) |

## Decisions

REQ coverage (daemon side): REQ-21, REQ-22, REQ-23, REQ-32 (restart: persisted columns) are in Changes. REQ-33 (canary assertion) is `test/canary/`, a test file: daemon-tests'. REQ-1..20 and REQ-24..31 are web.

- Verified by throwaway tests, deleted afterwards (not committed; tests are daemon-tests'):
  - `InterpretStatus` on 14 bodies: `{"expires_at":1790840879,"ttl":"1h"}` -> `{2026-10-01 07:47:59 UTC, 3600}`; `"5m"` -> 300; `"90s"` -> 90; `"0m"`, `"x"`, `ttl` number `3600`, `expires_at` as string `"1790840879"`, `expires_at` `1790840879.5`, either field missing, `prompt_cache` a string / null / absent, and `"99999999999999999h"` all -> `<nil>`. A non-object `prompt_cache` beside `"session_name":"a"` does not stop the rest of the payload decoding (json.Unmarshal still fills the other fields; the RawMessage fields never type-error).
  - Store round trip: fresh row `<nil> <nil>`; after `UpdateSession` with `{1790840879, 300}` read back `2026-10-01 07:47:59 +0000 UTC 300`; after clearing, `<nil> <nil>`.
  - Wire: unset cache -> key present, value null; set -> `map[expiresAt:2026-10-01T07:47:59Z ttlSeconds:3600]`.
- D9: `! rg -n '"(prompt_cache|expires_at)"' cmd/ internal/ --glob '!internal/claudecode/**'` exits 0 (no output).
- No new broadcast logic needed for Stop, liveness death, Resume, compaction, restart (REQ-22): none of them touch `Cache`; they clone and persist the whole row, and the row carries both columns. Not separately measured at manager level — that is the daemon-tests' D6 invariant walk.
- Edge 3 (straggler status post after `/clear` re-adopting the old cache) is accepted by the plan; no code.
- `expires_at` is accepted for any integer (including 0 or negative); the plan's rule is "integer" and the client renders a past expiry as cold.

design: `Cache` / `StatusCache` / `sessionWireCache` — three small structs, one per layer, matching `Context` / `StatusContext` / `sessionWireContext` (the sibling that is also adopted whole from a status post, nil = unknown). Grep before adding: `rg -n "type .*Cache|prompt_cache" internal --glob '!*_test.go'` found no prior prompt-cache type before this change (the only `Cache` hits afterwards are the ones added here). Reused as-is: `wireTime`, `encodeTime`/`decodeRowTimePtr`, `restoreIfUnchanged`.
design: `adoptCache` is its own function beside `applyStatusUpdate`, shaped like `adoptClaudeDir` (`internal/session/location.go`): takes the session and the optional reading, returns whether it changed. Inlining it pushed `applyStatusUpdate` to gocyclo 16 (`make lint`: "cyclomatic complexity 16 of func `applyStatusUpdate` is high (> 15)"), so the split is the lint's, and it reads the same as the sibling.
design: time equality in `adoptCache` uses `time.Time.Equal`, not `==` as `Context` does with plain numbers: a value read back from SQLite and one from `time.Unix(...).UTC()` can differ in location pointer yet be the same instant, and a spurious unequal would broadcast an upsert for an unchanged cache (REQ-23).
design: the cache lives on the `session` table as two nullable columns (migration 0014), like the three `context_*` columns; both-or-neither is enforced in `cacheFromRow` and `scanSession`, not by a SQL CHECK, matching 0003.
design: `claudecodetest.PromptCacheOpts` hangs off `StatusLineFullOpts` (an optional pointer, default omitted) rather than a new body builder, so the existing fixed-default bodies stay byte-identical (their dedup tests depend on it).
size: `internal/claudecode/claudecodetest/claudecodetest.go` is 641 lines (500 threshold); it was already over (about 620) and this adds about 20 lines of fixture options that belong beside `StatusLineFullOpts`. Splitting the fixture package is out of this plan's scope.

doc-delta: none — what shipped matches the plan's Doc Delta. One detail the delta does not say: a corrupt stored `cache_expires_at` reads back as unknown (both columns nil) rather than failing the load.

## Handoff

**Build status**: `go build ./...` exits 0; `go vet ./...` clean; `gofmt -l .` empty; `make lint` -> `0 issues.`; `golangci-lint run --tests=false ./...` -> `0 issues.`; `go test -race -count=1` on `internal/claudecode`, `internal/session`, `internal/server` passes; `internal/store` fails only the migration-count assertions below. `make size-warn` shows 90 repo-wide hits, none new from this work other than the line count noted above.

Test files that need changes (sanctioned breakage, Schema Changes: migration 0014 makes the max version 14):
- `internal/store/migrate_test.go:39,43` (named in the plan) and also `:60` (`TestMigrate_SecondCallIsANoOp`): count and max version 13 -> 14.
- `internal/store/store_test.go:51` (`TestOpen_SecondOpenOnSamePathDoesNotReapplyMigrations`): 13 -> 14. Not in the plan's list.

```
--- FAIL: TestMigrate_AppliesInitSchema   migrate_test.go:39,43  expected: 13 actual: 14
--- FAIL: TestMigrate_SecondCallIsANoOp   migrate_test.go:60      expected: 13 actual: 14
--- FAIL: TestOpen_SecondOpenOnSamePathDoesNotReapplyMigrations  store_test.go:51  expected: 13 actual: 14
```

`internal/server/sessionwire_test.go:216` (plan: key list gains `cache`) does not fail — the list there is a subset check — but should gain `"cache"` and a null/set assertion (D8). New tests owed by daemon-tests: D1 table for `InterpretStatus`, D2–D4 `ApplyStatus` broadcasts, D5/D6 `applyInput` cross-state invariant for `Cache`, D7 store/manager round trip, REQ-33 canary.

## Fix Attempt 1 (review cycle 1)

**Failures addressed**: maintainability Minor 1 — `parseCacheTTL` hand-parses an `s`/`m`/`h` string; no `design:` line for it or `interpretPromptCache`.

**Changes made**: `internal/claudecode/status.go` — `parseCacheTTL` drops its digit loop and parses the digits with `strconv.ParseUint(digits, 10, 63)`, keeping the one-letter unit lookup, the zero check and the scale-overflow guard. The accepted set is unchanged, so no D1 row in `internal/claudecode/status_test.go` needs to change.

**Decisions**:
- Reuse check: `rg -n "ParseDuration" internal cmd --glob '!*_test.go'` finds nothing (exit 1). `parseCacheTTL` and `interpretPromptCache` are called only from `status.go` (`rg -n "parseCacheTTL|cacheTTLUnits|interpretPromptCache" --glob '*.go' .`: `status.go:144,175,187,194,196,200`), so no other consumer reads the shape.
- design: `time.ParseDuration` is not used for the TTL because it accepts inputs the wire must reject, and the status test table pins each as unset: `"+5m"` (explicit sign), `"1.5h"` (fraction), and it would also take `"1h30m"` (compound), `"500ms"`/`"1us"`/`"1µs"`/`"1ns"` (sub-second units), `"-5m"` and `"0"`. Reaching the single-unit, whole-seconds shape from `ParseDuration` needs a string check for each, which is the hand parser again. `strconv.ParseUint` does the digit work (rejects sign, fraction, space, empty, `_`), so the loop went; the unit map stays because the units are exactly `s`/`m`/`h`. Matches `parseResetsAt` (`usageapi.go`) in leaning on `strconv`/stdlib for the digits.
- design: `interpretPromptCache` is the one place `prompt_cache` is read: it takes the decoded `statusPromptCache` (both fields `json.RawMessage`, so a wrong type on either never fails the whole payload decode) and returns `*StatusCache` or nil. Nil means unknown, the same convention as the `StatusContext` it sits beside. It rejects the whole cache when either field is malformed, so the rail card never shows a half-valid expiry.
- Paths reaching the defect: only `interpretPromptCache` → `parseCacheTTL`. The edit changes no input verdicts: re-ran the pinned table.

**Evidence**: `go test -race -count=1 ./internal/claudecode/...` → `ok github.com/Zalaras/muster/internal/claudecode 5.781s` (the existing TTL table, including `+5m`, `1.5h`, `05m`, `0m`, `99999999999999999h`, passes); `go build ./...` exit 0; `gofmt -l internal cmd` empty; `make lint` → `0 issues.`; `make size-warn` has no `status.go` entry; `rg ParseDuration` still returns nothing.
