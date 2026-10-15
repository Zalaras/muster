# Daemon Implementation: claude-version-watch

**Plan**: claude-version-watch
**Mode**: initial
**Pack**: kb: pack 12347 words (budget 30000)

## Changes

| File | Action | What and Why |
|------|--------|--------------|
| `internal/server/claudeversion.go` | created | `claudeVersionFeature`: holds the latest `ClaudeCodeInfo` under a mutex, looks at `claudecode.ResolveBinaryIdentity` every 30 s, runs one `claude --version` (30 s bound) per new identity, broadcasts `claudeCode` on a changed result, logs each result (the `checkClaudeCode` log moved here). REQ-1, REQ-2, REQ-3 |
| `internal/server/server.go` | modified | `ClaudeCodeInfo` and `Config.ClaudeCode` removed from the root; `Config.ClaudeVersion`; feature constructed before the issue feature, registered last |
| `internal/server/ws.go` | modified | `hello.claudeCode` reads `claudeVersion.Current()` (REQ-1/2) |
| `internal/server/issue.go`, `internal/server/issuesnapshot.go` | modified | Issue feature takes `func() ClaudeCodeInfo`; the snapshot reads it at capture time (REQ-4) |
| `cmd/musterd/main.go` | modified | Version check leaves `prepareServing` (nothing runs before `Listen`); wires `ClaudeVersionConfig{Poll: 30s}` |
| `cmd/musterd/claudeversion.go` | deleted | `checkClaudeCode` / `versionCheckTimeout` moved into the server feature |
| `docs/features/connection/spec.md`, `docs/adr/connection-claude-version-watched-and-pushed.md` | modified | `internal/server/claudeversion*.go` added to connection's go globs; file added to the ADR's `files`; `make gen-kb` regenerated `connection/INDEX.md`, `.claude/rules/connection.md` |
| `cmd/musterd/main_test.go`, `internal/server/helpers_test.go` | modified (compile-only) | see Handoff |

## Decisions

- REQ-1: nothing runs before `Listen` — `prepareServing` no longer touches `claude`; the first check runs on the feature's goroutine at `Start`.
- REQ-3: `tick` records the new identity before running the check, so a binary that changes mid-check is seen again by the next look; an identity that cannot be resolved runs nothing and keeps the held value. A check that returns `unknown` replaces a held value (the contract says `hello.claudeCode` is the latest result) and is broadcast if it differs; the identity is still recorded, so a failing `claude` is not re-run every 30 s (a look stays a stat).
- Zero-value safety: `ClaudeVersionConfig.Poll <= 0` never runs a check (like `ThemeConfig.Poll`), so `Config{}` in tests never execs `claude`. The binary comes from the existing `Launch.ClaudeBin` via `defaultClaudeBin`, the same value `modelsFeature` uses — no second flag. The 30 s interval is a constant in `cmd/musterd/main.go`, not a flag (the plan names none).
- Wire: `claudeCodeWire(info)` is a plain struct conversion (staticcheck S1016); `hello` and `claudeCode` share one wire struct, so the two shapes cannot drift.
- The new feature is registered after `repoRefresh` (constructed earlier because the issue feature takes its `Current`); this keeps the existing Start order of the other six lifecycle features untouched.
- Anchor: comments cite `kb:anchor/ws.claude-code`, matching web-impl's `hello.ts`; `docs/protocol.md` has no such anchor yet (see doc-delta).

design: `claudeVersionFeature` is one type, not a feature plus a poller. Sibling matched: `themeFeature`/`themePoller` (themepoll.go), whose split exists only for its nil-poller case; here `Start` returns early on `Poll <= 0` instead, so a single type embedding `bgLoop` and `runTicked` is enough. Identity and check seams are struct fields (`identify`, `check`, `interval`, `broadcast`) like `modelsFeature.identify`, so unit tests build the feature directly. `rg "ResolveBinaryIdentity|CheckVersion\("` found only `modelsFeature` (a verdict cache, not a watcher) — nothing to reuse beyond the `claudecode` functions themselves.
design: shared state `current` — writer: the single bgLoop goroutine (`tick`); readers: `/ws` hello and the issue snapshot via `Current()`; guard: `mu` (RWMutex), declared on the struct. `seen`/`haveSeen` belong to the loop goroutine alone and are unguarded on purpose.
design: `ClaudeCodeInfo` moved from `server.go` to `claudeversion.go` (it is this feature's value now); `ClaudeCodeInfo.equal` is a method because `Installed` is a pointer and `==` would compare addresses.
design: `logClaudeCodeReport` is a free function carrying `checkClaudeCode`'s switch verbatim (messages unchanged); the only size warning on a touched file is `cmd/musterd/main.go` (was 525 lines, now 522 per `make size-warn`; not made worse).

doc-delta: `docs/protocol.md` needs an anchor `ws.claude-code` for the new `claudeCode` message (cited by `internal/server/claudeversion.go` and `web/src/protocol/hello.ts`); `make check-kb` reports those three citations until doc-reconcile adds it.
doc-delta: `connection-installed-claude-classified-never-refused` and `canary-claude-auto-updater-left-on` list `TestCheckClaudeCode_MapsEachStatusAndLogsAtTheRightLevel` / `_UnknownOutcomeNeverFailsStartup` in `tests:`; those tests were removed from `cmd/musterd/main_test.go` (see Handoff) and `check-kb` flags the entries until daemon-tests re-adds them in `internal/server` under the same names or the ADRs are repointed.

## Handoff

**Build status**: `go build ./...` exits 0; `make lint` 0 issues; `go vet ./cmd/... ./internal/...` clean; `make e2e-soak SPEC=claude-version.spec.ts N=1` (builds web + daemon) 7 passed, including the claude-version-watch test (7 s `--version`, serving within 3 s, readout flips with no reload).

`go test -race ./cmd/musterd/` ok. `go test -race ./internal/server/` has exactly one failure, sanctioned:
- `internal/server/server_test.go` `TestNew_RegistersLifecycleFeaturesInStartOrder`: `require.Len(t, lifecycles, 6, …)` now sees 7 — `claudeVersionFeature` is a lifecycle feature, registered last (`lifecycles[6]`; indices 0–5 unchanged). daemon-tests moves the count to 7 and asserts `srv.claudeVersion` last.

Compile-only test edits I made (the tree would not compile otherwise; daemon-tests owns the real change):
- `internal/server/helpers_test.go`: `newTestServer` no longer sets `Config.ClaudeCode`; it assigns `srv.claudeVersion.current = cc` after `New` so the existing `hello` / issue-snapshot tests keep their values. daemon-tests may replace this with a proper seam.
- `cmd/musterd/main_test.go`: deleted `writeCheckClaudeCodeStub`, `TestCheckClaudeCode_MapsEachStatusAndLogsAtTheRightLevel`, `TestCheckClaudeCode_UnknownOutcomeNeverFailsStartup` (their subject moved; originals via `git show HEAD:cmd/musterd/main_test.go`, lines ~164–253), the `serving.claudeCodeInfo` field/`installed` variable and the `cfg.ClaudeCode` assertion in `TestBuildServerConfig_MapsEveryFlagOntoTheServerConfig` (daemon-tests should add `cfg.ClaudeVersion.Poll == claudeVersionLookInterval` there), and the five imports that became unused. daemon-tests moves the two `checkClaudeCode` cases to `internal/server` against `logClaudeCodeReport` / the feature's tick.

New tests daemon-tests owes (plan § Proof): an identity change runs one check and broadcasts once; an unchanged identity runs none; an unchanged result broadcasts nothing; the issue snapshot reads the latest value.

## Fix Attempt 1 (review cycle 2)

**Failures addressed**: review.cycle1.md issue 1 — a daemon with no resolvable `claude` never logged the version outcome (regressed `checkClaudeCode`'s warn and kb:adr/connection-installed-claude-classified-never-refused's "one line per outcome").

**Changes made**: `internal/server/claudeversion.go`. `tick` now logs the existing "could not determine claude code version" warn (same fields, `error` carries the resolution error) when `identify` fails, once per unresolved stretch: `unresolved` (loop-goroutine-only, beside `seen`/`haveSeen`) is set on the first failed look and cleared on the next successful resolve, so a later failure after a resolve logs again and a run of failures logs once. The report is built by `unresolvedClaudeCodeReport` and written by the existing `logClaudeCodeReport`, so level and message stay in one place.

Paths that reach the defect: (1) `claude` missing from `$PATH`, (2) bad `-claude-bin`, (3) dangling symlink — all surface as an `identify` error, one branch in `tick`, closed by the same log. (4) Resolves later then fails (mid-swap): logs again after the intervening resolve. Held value and broadcasts are unchanged (an unresolved look still runs nothing).

Consumers of `tick`/`logClaudeCodeReport`: `rg` shows only `claudeVersionFeature.tick` calls `logClaudeCodeReport`; `tick` is called by `Start`'s `runTicked` only.

Repro re-run (the review's scratch `-overlay` test, deleted after): `newClaudeVersionFeature(… "/nonexistent/claude" …)` ticked twice gave `status=unknown installed=<nil> logs="{\"level\":\"warn\",\"floor\":\"2.1.246\",\"verified\":\"2.1.300\",\"status\":\"unknown\",\"error\":\"resolving /nonexistent/claude on PATH: exec: ... no such file or directory\",\"message\":\"could not determine claude code version\"}\n"` — one warn across two ticks.

Gates: `go build ./...` 0; `make lint` 0 issues; `go test -race -count=1 ./internal/server/` ok; `make size-warn` nothing on `claudeversion.go`.

**Decisions**: design: `unresolved` flag matches `seen`/`haveSeen` (loop goroutine only, unguarded); no new type. `rg "could not determine claude code version"` finds only `logClaudeCodeReport`, reused. Test debt for daemon-tests: an unresolvable identity logs one warn across two ticks and again after a resolve in between.

## Fix Attempt 2 (review cycle 3)

**Failures addressed**: REQ-6 (review.md cycle 2 code Note 1) — the unresolved-identity warn said "could not determine claude code version" with `status: unknown` while the daemon held a different result.

**Changes made**: `internal/server/claudeversion.go`. `tick`'s `identify`-failure branch now calls `logUnresolvedClaudeCode(f.log, f.Current(), err)`, which warns "could not resolve the claude binary; keeping the last claude code version result" with `floor`, `verified`, the held `status`, `installed` only when the held value has one, and `error` carrying the resolution error. `unresolvedClaudeCodeReport` is deleted (its only caller was this branch). The once-per-unresolved-stretch flag, the held value and broadcasts are untouched.

Paths reaching the defect: PATH miss, bad `-claude-bin`, dangling symlink, mid-swap failure after a resolve — all are the one `identify`-error branch in `tick`, so one change closes them. The "could not determine claude code version" message stays in `logClaudeCodeReport` for the `--version` failure path (`rg` consumers: `logClaudeCodeReport` called only from `tick`'s post-check line).

**Decisions**: design: a separate small function rather than routing through `logClaudeCodeReport`, because that function picks level and message from `status`, and a held `verified` would then log at info with the within-range message; the unresolved line is always warn with its own message. Matches `logClaudeCodeReport`'s field set. `rg "func log.*ClaudeCode"` found only `logClaudeCodeReport`, which does not fit for that reason.
doc-delta: `docs/features/connection/spec.md:75` says the daemon "logs 'could not determine claude code version' once per unresolved stretch"; it now logs "could not resolve the claude binary; keeping the last claude code version result" carrying the held result's status.

**Gates**: `go build ./...` 0; `gofmt -l .` empty; `go vet ./internal/server/` clean; `make lint` 0 issues; `make size-warn` nothing on `claudeversion.go`.

**Handoff (sanctioned failures, REQ-6)** — `go test -race -count=1 ./internal/server/` fails exactly these claude-version assertions:
- `TestClaudeVersion_UnresolvableIdentityLogsOncePerUnresolvedStretch` (`claudeversion_test.go`): `warns()` (line 672) counts the old message so lines 678 (`1 == warns()`, got 0) and 690 fail; line 681 `"status":"unknown"` now holds only while nothing is held (it still passes in the first stretch, where the held value is unknown); line 682 `NotContains "installed"` still passes in the first stretch. Needs: `warns` counting the new message, and a second-stretch assertion that the line carries `"status":"verified"` and `"installed"`.
- `TestClaudeVersion_UnknownOutcomeNeverFailsStartup/missing_binary` (line 622): `Contains "could not determine claude code version"` fails for the missing-binary subtest (identify fails, new message logged); the `non-zero exit` and `unparseable --version` subtests still log the old message.

Unrelated, not mine: `TestWrapperReply_PrintsTheBodyOnlyOnA2xx` failed with `signal: killed` (shell-wrapper subprocess, under load); it does not touch this code.
