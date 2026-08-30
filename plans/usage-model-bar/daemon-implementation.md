# Daemon Implementation: usage-model-bar

**Plan**: usage-model-bar
**Mode**: initial

## Changes

| File | Action | What and Why |
|------|--------|--------------|
| `internal/claudecode/credentials.go` | created | `TokenReader` func type; `KeychainTokenReader(user, run execFunc)` shelling out to `security` (2s exec timeout, injected exec seam for D8); `FileTokenReader(path)`; `RunCommand` (production execFunc, exported so `internal/server` can wire the real reader); `ErrNoCredentials`; `decodeOAuthToken` parses `{"claudeAiOauth":{"accessToken":"…"}}`. No log calls anywhere in this file (D9). |
| `internal/claudecode/usageapi.go` | created | `FetchUsage(ctx, *http.Client, baseURL, token)` (5s timeout, `Authorization: Bearer`, `anthropic-beta: oauth-2025-04-20`); `ErrUnauthorized`; pure `InterpretUsageReport([]byte)`; `UsageReport{ModelScoped []UsageWindow}`; `UsageWindow{DisplayName, UsedPct, ResetsAt}`; `parseResetsAt` accepts RFC3339Nano-with-offset string or epoch-seconds int. No log calls (D9). |
| `internal/usage/usage.go` | modified | Added `ModelWindow` and `ModelSnapshot` types (Status-line `Snapshot`/`Bucket`/`Model` untouched). |
| `internal/usage/modelscoped.go` | created | `ModelScopedConfig`, `ModelScoped` holder: `Record(ctx, []ModelWindow) error` (dedup by sorted-DisplayName list, persist-before-commit mirroring `Aggregator.Record`, always clears a standing error), `SetError(kind string)` (Warn once per distinct kind transition, Debug on repeats, broadcasts only on the Warn transition), `Current() ModelSnapshot`. `windowsEqual` treats nil vs non-nil-empty as unequal (REQ-14/INV-1). |
| `internal/store/migrations/0005_usage_model.sql` | created | `usage_model_sample` table exactly as specified in the plan's Schema Changes. |
| `internal/store/usage.go` | modified | `UsageModelSampleRow{DisplayName, Pct, ResetsAt, Source}`; `InsertUsageModelSamples(ctx, []UsageModelSampleRow)` — one tx, one shared `at` timestamp stamped by the store itself (mirrors `InsertUsageSample`), no-op on an empty slice. |
| `internal/server/usagepoll.go` | created | `usagePoller`: `Start`/`Stop(ctx)` (pattern copied from `session.Manager`'s liveness poll / the ingest queue's Stop), immediate fetch on `Start` (REQ-1), `refresh chan struct{}` (cap 1) for coalesced `Refresh()`, `tick` maps token-read/fetch errors to `no-credentials`/`unauthorized`/`unreachable` via `usageErrorKind`. |
| `internal/server/usage.go` | created | `handleUsageRefresh`: 404 `not_found` when `s.usagePoller == nil` (poll disabled), else `Refresh()` + `202`. |
| `internal/server/usagewire.go` | modified | `toWireUsage(snap usage.Snapshot, model usage.ModelSnapshot) UsageInfo` — signature changed to merge both holders at the single mapping point (Edge Case 10); maps `ModelScoped`/`ModelScopedAt`/`ModelScopedError`/`ModelScopedSource`, preserving the nil-vs-empty-slice distinction. |
| `internal/server/state.go` | modified | `UsageInfo` gains `ModelScoped []UsageModelWindow`, `ModelScopedAt *string`, `ModelScopedError *string`, `ModelScopedSource string` (new `UsageModelWindow` type); `PrefsInfo` gains `UsageModel string`; `buildSnapshot()` sets `ModelScopedSource: "subscription-api"`; `currentSnapshot` calls `toWireUsage(s.usage.Current(), s.modelScoped.Current())`. |
| `internal/server/prefs.go` | modified | `prefsRequest.UsageModel *string`; `validUsageModel` (1–32 chars after trim); `defaultPrefs()` includes `UsageModel: "Fable"`; `loadPrefs` falls back per-field; `handlePutPrefs` accepts/validates/persists/trims `usageModel`, updated "at least one field" check. |
| `internal/server/server.go` | modified | `Config` gains `UsagePoll time.Duration`, `UsageAPIURL string`, `UsageTokenFile string`, `KeychainUser string`, `HTTPClient *http.Client`; `Server` gains `modelScoped *usage.ModelScoped` (always constructed) and `usagePoller *usagePoller` (nil iff `UsagePoll <= 0`, Edge Case 14); both `usage.Aggregator`'s and `usage.ModelScoped`'s `OnChange` now build the merged `usage` broadcast from both holders' `Current()`; `Start`/`Shutdown` start/stop the poller when present; new route `POST /api/usage/refresh`. |
| `cmd/musterd/main.go` | modified | New flags `-usage-poll` (default 5m), `-usage-api-url` (default `https://api.anthropic.com`), `-usage-token-file` (default "", meaning Keychain); `keychainUser()` helper (`os/user.Current()`, empty on failure) wired into `Config.KeychainUser`. |

## Decisions

- **`Config.KeychainUser string` added, not listed verbatim in the plan's Affected Files bullet for `server.go`.** The plan's Implementation Notes explicitly says "`user` from `os/user.Current()` in `main`, passed in" — this field is the necessary plumbing for that sentence; `KeychainTokenReader(user, run)` needs a user string from somewhere outside `internal/server`. Minimal, mechanical, non-conflicting with the Protocol Contract.
- **`claudecode.RunCommand` exported** (was going to be unexported `runCommand`) so `internal/server.New` can wire the real exec function into `KeychainTokenReader` without `internal/server` needing to know the unexported `execFunc` type name — a function literal/named-function value of matching (unnamed) signature is assignable to an unexported parameter type in Go, so this required no other API change. Verified: `go build ./...` exits 0 with this wiring in `server.go`.
- **Comment wording in `cmd/musterd/main.go`, `internal/server/server.go`, `internal/server/usagepoll.go`, `internal/store/migrations/0005_usage_model.sql` avoids the literal strings `"Claude Code-credentials"` and `"oauth/usage"`** even though these are plain doc comments, not vocabulary leaks in the CLAUDE.md sense — D3's grep is textual and scopes to `cmd/`+`internal/` outside `internal/claudecode/` with no comment/code distinction. Confirmed via the plan's own Automated Check:
  ```
  $ rg -n "claudeAiOauth|Claude Code-credentials|weekly_scoped|oauth/usage" cmd/ internal/ --glob '!internal/claudecode/**'
  (no output)
  ```

## Handoff

**Build status**: `go build ./...` exits 0 (verified). `go vet ./...` and `make lint` fail on exactly one pre-existing test file, listed below — both sanctioned breakage from the plan's approved Protocol Contract, not something within my edit permissions to fix (test bodies, not import lines).

**Test files needing changes I was not allowed to make:**

1. **`internal/server/usagewire_test.go`** (3 call sites: lines 17, 35, 59) — all call `toWireUsage(usage.Snapshot{...})` with one argument; the plan's Affected Files line for `usagewire.go` explicitly changes the signature to `toWireUsage(snap, model)` (§5.4's two-source merge, Edge Case 10 requires it). Fix: add a second `usage.ModelSnapshot{Source: "subscription-api"}` argument to each of the three calls (or whatever `ModelSnapshot` value each test wants to assert against — none of the three currently exercise the model-scoped half). Verified via `go vet`:
   ```
   internal/server/usagewire_test.go:17:59: not enough arguments in call to toWireUsage
   	have (usage.Snapshot)
   	want (usage.Snapshot, usage.ModelSnapshot)
   ```
   (same for lines 35 and 59).

2. **`internal/server/state_test.go`** (`TestBuildSnapshot_M0Shape`) — its `assert.JSONEq` literal for `buildSnapshot()`'s usage object doesn't include the four new `modelScoped*` keys, and its prefs literal doesn't include `usageModel`. Both are additive fields the plan's Protocol Contract §5.2/§5.4/§3.3 delta mandates; the literal needs `"modelScoped": null, "modelScopedAt": null, "modelScopedError": null, "modelScopedSource": "subscription-api"` added to the usage object and `"usageModel": "Fable"` added to the prefs object. Not run through `go vet` (it's a value-comparison failure, not a compile error) — inspect the file directly at `internal/server/state_test.go:21-25`.

3. **`internal/server/prefs_test.go`** (`TestHandlePutPrefs_PersistsToKVUnderOneJSONKey`) — asserts `assert.JSONEq('{"view":"tiles","density":"3x2"}', raw)` against the persisted kv blob; since `PrefsInfo` now always carries `UsageModel` (no `omitempty`), the persisted JSON will include `"usageModel":"Fable"` too. Needs the literal updated to include it.

4. **`internal/store/migrate_test.go`** (`TestMigrate_AppliesInitSchema`, `TestMigrate_SecondCallIsANoOp`) and **`internal/store/store_test.go`** (`TestOpen_SecondOpenOnSamePathDoesNotReapplyMigrations`) — all three hardcode an expected migration count of `4`; adding `0005_usage_model.sql` makes it `5`. Verified via `go test ./internal/store/...`:
   ```
   --- FAIL: TestMigrate_AppliesInitSchema (0.01s)
       Error: Not equal: expected: 4, actual: 5
   ```
   Fix: bump the literal `4` to `5` in each (or better, make the assertion count embedded `.sql` files dynamically — reviewer's call).

**A safety concern outside test-file mechanics — please read before running `make test` on a real dev machine:**

`cmd/musterd/onexit_test.go`'s `spawnDaemon` (lines ~137–144) spawns a **real** `musterd` binary for the D19–D21 on-exit tests, with neither `-usage-poll 0` nor `-usage-token-file` in its args. Per REQ-1 this plan requires `-usage-poll`'s CLI default to be `5m` (non-zero) and an **immediate** fetch on `Start()` — so every real `musterd` process this test spawns will, by default, shell out to `security find-generic-password -a $USER -w -s "Claude Code-credentials"` (the real macOS Keychain) and, if that lookup succeeds, make a real authenticated HTTP call to `https://api.anthropic.com/api/oauth/usage` using whatever real Claude Code OAuth token is present on the machine running the test — every time `go test ./cmd/musterd/...` (or `make test`) runs. In this sandboxed environment the Keychain item doesn't exist, so the lookup fails fast (`no-credentials`) and the test suite passed in 5.7s with no hang or real network call (verified: `go test ./cmd/musterd/...` → `ok`). But on Damian's actual development Mac — where a real "Claude Code-credentials" Keychain item is expected to exist — running this test suite would read his real usage data over the network as an unannounced side effect of `make test`, and could also trigger a one-time macOS Keychain access-permission dialog for the newly-built test binary (Edge Case 2). This is not something I'm permitted to fix myself (it requires editing the args slice in an existing test file, not an import line), so it needs one of:
- daemon-tests adds `"-usage-poll", "0"` to the `args` slice in `spawnDaemon` (`cmd/musterd/onexit_test.go`), since D19–D21 have nothing to do with usage polling; or
- the orchestrator/reviewer decides this is acceptable and documents it.

I flag this because it's a real (not hypothetical) consequence of implementing REQ-1's literal default exactly as specified, on a repo whose CLAUDE.md is emphatic about never letting automated test runs touch a real account/subscription unannounced.

## Verification run

```
$ gofmt -l .                     # clean
$ go build ./...                 # exit 0
$ go vet ./internal/usage/... ./internal/claudecode/... ./internal/store/... ./cmd/...   # clean
$ golangci-lint run --tests=false   # 0 issues
$ go test ./internal/usage/... ./internal/claudecode/... ./cmd/musterd/...   # ok (all pass)
$ go test ./internal/store/...   # 3 pre-existing failures, all "hardcoded migration count 4→5" (see Handoff #4)
$ rg -n "claudeAiOauth|Claude Code-credentials|weekly_scoped|oauth/usage" cmd/ internal/ --glob '!internal/claudecode/**'   # no output (D3 clean)
$ go list -deps ./internal/usage ./internal/store | rg 'muster/internal/claudecode'   # no output (D4 clean)
```

## Fix Attempt 1

**Failures addressed**: review.md Minor 1 and Minor 2 (both `[daemon-impl]`).

**Changes made**:

1. **Minor 1** — `internal/server/server.go`: removed the `defaultUsageAPIURL` constant
   (was a second source of truth for the flag default in `cmd/musterd/main.go:78`, and
   unreachable in production since `main` always passes `*usageAPIURL`). The poller
   construction in `New` (`server.go:~178`) is now a `switch`:
   - `cfg.UsagePoll > 0 && cfg.UsageAPIURL != ""` — construct the poller as before, using
     `cfg.UsageAPIURL` directly (no fallback).
   - `cfg.UsagePoll > 0` alone (i.e. `UsageAPIURL == ""`) — log a `Warn` ("usage polling
     requested (-usage-poll > 0) but UsageAPIURL is empty; usage polling disabled") and
     leave `s.usagePoller` nil.

   This flips the zero-value-config failure direction: a `server.Config{UsagePoll: >0}`
   built without `UsageAPIURL` set (no test currently does this — confirmed by grep, all
   poller tests call `newUsagePoller` directly) now disables polling instead of silently
   defaulting to the real `https://api.anthropic.com`. Production is provably unaffected:
   `cmd/musterd/main.go:174-176` always passes `UsagePoll`/`UsageAPIURL`/`UsageTokenFile`
   from the flags, whose `-usage-api-url` default is non-empty (`main.go:78`).

   Updated the `Config.UsageAPIURL` doc comment to state there is deliberately no
   fallback constant and that empty disables the poller, matching `UsagePoll <= 0`'s
   existing fail-safe shape.

2. **Minor 2** — `internal/server/usagepoll.go`, `tick()`: added a `Debug`-level log call
   in both existing error branches (`tokenReader` failure and `claudecode.FetchUsage`
   failure), each before the existing `SetError(usageErrorKind(err))` call. Kept at
   Debug (not Warn) since `usage.ModelScoped.SetError` already does the operator-facing
   Warn-once-per-kind-transition; this just exposes the underlying cause (DNS vs. 500 vs.
   decode error) to anyone who raises the log level.

   Safety of logging `err` verbatim:
   - Token-read branch: the token hasn't been read yet when this error occurs, so it
     cannot appear in `err`.
   - Fetch branch: `internal/claudecode/usageapi.go` sends the token only in the
     `Authorization` header (`FetchUsage`, line ~70s) and every returned error is a
     `fmt.Errorf` wrap of build/transport/status/decode failures — never a re-encoding of
     the request. `TestFetchUsage_ErrorMessagesNeverContainTheToken`
     (`internal/claudecode/usageapi_test.go:248`) already pins this and passed after the
     change (see verification below), and no additional log call touches the raw HTTP
     request/response.

**Verification**:

```
$ gofmt -l internal/server/server.go internal/server/usagepoll.go
(clean)
$ go vet ./...
(clean)
$ go build ./...
(exit 0)
$ make lint
golangci-lint run
0 issues.
$ make test
ok  	github.com/Zalaras/muster/cmd/musterd	8.662s
ok  	github.com/Zalaras/muster/internal/claudecode	1.831s
ok  	github.com/Zalaras/muster/internal/gitutil	2.246s
ok  	github.com/Zalaras/muster/internal/server	14.478s
ok  	github.com/Zalaras/muster/internal/session	4.481s
ok  	github.com/Zalaras/muster/internal/store	5.139s
ok  	github.com/Zalaras/muster/internal/termbridge	6.491s
ok  	github.com/Zalaras/muster/internal/tmux	9.102s
ok  	github.com/Zalaras/muster/internal/usage	7.101s
$ rg -n "claudeAiOauth|Claude Code-credentials|weekly_scoped|oauth/usage" cmd/ internal/ --glob '!internal/claudecode/**'
(no output — D3 clean)
$ go list -deps ./internal/usage ./internal/store | rg 'muster/internal/claudecode'
(no output — D4 clean)
```

No test files touched (none needed changes for these two Minors — confirmed by the
passing `make test` run above, and by grep showing no existing test constructs
`server.Config` with `UsagePoll > 0` and empty `UsageAPIURL`).
