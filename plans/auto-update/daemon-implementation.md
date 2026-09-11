# Daemon Implementation: auto-update

**Plan**: auto-update
**Mode**: initial

## Changes

| File | Action | What and Why |
|------|--------|--------------|
| `internal/selfupdate/doc.go` | created | Package doc: the one home of GitHub-release/minisign knowledge (D4). |
| `internal/selfupdate/semver.go` | created | `Version`, `ParseRelease` (strict `v?MAJOR.MINOR.PATCH`), `Compare`, `String()`. |
| `internal/selfupdate/release.go` | created | `LatestTag` (HEAD `{base}/latest`, no-redirect client, 10s timeout), `AssetName`, `DownloadURL`. |
| `internal/selfupdate/verify.go` | created | `VerifyChecksums` (via `aead.dev/minisign`, both signature modes transparently), `ChecksumFor`, `SHA256Of`, sentinel errors. |
| `internal/selfupdate/apply.go` | created | `Phase` enum, `Apply` (download 3 files, verify, extract `musterd`, atomic rename), 120s timeout. |
| `internal/selfupdate/lock.go` | created | `AcquireLock`/`ErrInProgress`: non-blocking flock on `.musterd-update.lock`. |
| `internal/selfupdate/install.go` | created | `Classify` (dev/homebrew/unmanaged/installer), `WritableDir`, remedy constants. |
| `internal/selfupdate/exeversion.go` | created | `ProbeVersion` (parses `musterd v?X.Y.Z`), `RunVersionProbe` (production exec seam). |
| `internal/selfupdate/pubkey.go` | created | `//go:embed minisign.pub`, `PublicKey()`. |
| `internal/server/update.go` | created | `updateManager` (check loop, REQ-26 swap detection, apply serialisation), wire types (`UpdateInfo`, `UpdateApplyInfo`), `handleApplyUpdate`, `handleRestartImpact`. |
| `internal/server/state.go` | modified | `Snapshot.Update`, `PrefsInfo.UpdateCheck`, `currentUpdate()` (live manager or static install-only shape). |
| `internal/server/prefs.go` | modified | `updateCheck` in `prefsRequest`/`storedPrefs`, default-true fallback for a pre-plan blob, `SetCheckEnabled` side effect on an actual value change. |
| `internal/server/server.go` | modified | `Config` fields (`UpdateBaseURL`, `UpdateCheckInterval`, `UpdatePublicKey`, `Install`, `ExePath`, `ExeRun`), manager construction, `tmuxLister` field, routes, `Start`/`Shutdown`/`RestartRequests`. |
| `cmd/musterd/main.go` | modified | Flags `-update`/`-update-base-url`/`-update-check-interval`/`-update-public-key-file`; startup `Classify` (shared by `-update` and the server path); `MUSTER_RESTARTED` read+unset; `RestartRequests()` shutdown-select case (graceful stop, no `-on-exit`, returns `errRestart`); `main()` performs the actual `syscall.Exec`. |
| `cmd/musterd/update.go` | created | `runUpdate` (the `-update` CLI flow, REQ-22), `reexec`, `errRestart`, `errUpdateFailed`. |
| `.goreleaser.yaml` | modified | `signs:` block (checksum artifact, `minisign -S`, no `ignore_errors`). |
| `.github/workflows/release.yml` | modified | Install `minisign`, materialise `MINISIGN_SECRET_KEY` to `$RUNNER_TEMP`, export `MINISIGN_KEY_FILE`/`MINISIGN_PASSWORD` to the GoReleaser step. |
| `Makefile` | modified | `release-check` passes `--skip=sign` (no secret in a local snapshot). |
| `docs/release-signing.md` | created | Key generation, secrets, fingerprint, rotation, the M1/M2 ritual. |
| `docs/conventions.md` | modified | Corrected the self-update stack row's import path (see Decisions). |
| `go.mod`/`go.sum` | modified | `aead.dev/minisign` (see Decisions for the exact import path). |

## Decisions

- **Import path correction (evidence-backed).** The plan/`docs/conventions.md` named
  `github.com/aead/minisign`. Measured: `go get github.com/aead/minisign@v0.3.0` fails —
  ```
  go: github.com/aead/minisign@v0.3.0 requires github.com/aead/minisign@v0.3.0: parsing go.mod:
          module declares its path as: aead.dev/minisign
                  but was required as: github.com/aead/minisign
  ```
  Confirmed against every published tag (v0.1.0..v0.3.0): each `go.mod` declares `module
  aead.dev/minisign`. `go get aead.dev/minisign@v0.3.0` succeeds and pulls the identical
  code (same repo, GitHub-mirrored vanity import). This is a Go-import-path fact, not a
  library substitution or a wire-format decision — I used the real path and corrected
  `docs/conventions.md`'s row to match, with the measurement inline. **`SPEC.md`'s §5
  stack row (committed by an earlier `docs(auto-update)` doc-upkeep commit) still says
  `github.com/aead/minisign`** — left as-is since `SPEC.md` upkeep is the orchestrator's
  job per the plan's Implementation Notes, not an impl agent's; flagging it here so it
  gets the same one-line fix.
- **`GET /api/update/restart-impact` never 404s, even when updates are disabled.** The
  plan's Edge Case 33 prose says "apply/impact endpoints 404 not_found" when
  `-update-base-url ""`, but §3.17/§3.18's own Protocol Contract text says restart-impact
  has "Errors: none beyond auth", and D18 (the tied acceptance criterion) only lists 404
  for the apply endpoint. I checked the **merged** `docs/protocol.md` (already updated by
  the plan-approval step) directly rather than guessing: §3.18 there reads "No errors
  beyond auth" verbatim, settling it — restart-impact always answers from live tmux state
  regardless of whether updates are configured. Implemented accordingly; only the plan's
  own edge-case prose was imprecise, not the contract itself, so no orchestrator
  escalation needed.
- **`goreleaser` binary**: none was preinstalled; installed `github.com/goreleaser/goreleaser/v2@latest` (resolved v2.18.1) to run D6/`make release-check` locally — matches the `.goreleaser.yaml` header comment ("verified against the v2.18 schema"). An older v2.5.1 I tried first rejected the pre-existing `archives.formats` key (`field formats not found in type config.Archive`), confirming v2.18 is the intended floor, not a fact I introduced.
- **`RequestApply`/`runApply` take a `context.Context`** (via `context.WithoutCancel(r.Context())` from the handler) rather than `context.Background()` internally — `golangci-lint`'s `contextcheck` flagged the bare-Background() version; threading the request's (detached) context is also more correct, mirroring `handleCreateIssue`'s identical pattern for a POST whose work must outlive the response.
- **`REQ-25`'s "installed already equals available" skip case**: the Protocol Contract's §3.17 semantics list *two* skip conditions (`installed == available`, and `available == nil && installed != nil`); my first pass implemented only the second. Caught by re-reading the merged protocol text against my own code before finishing — fixed to check both.
- **`checkSwap`'s reference stat can be nil** if `os.Stat` fails at manager construction (exePath somehow unresolvable) — every subsequent tick then treats the file as "changed" and re-probes (bounded by the 5s `ProbeVersionTimeout`) until `installed` is ever set once. Accepted as a rare, self-limiting degradation rather than added complexity; documented in the source comment.

## Handoff

**Build status**: `go build ./...` exits 0.

**Verification run (this session, evidence pasted, not asserted):**
- `go build ./...` → exit 0.
- `go vet ./...` → clean.
- `gofmt -l .` → empty (nothing to format).
- `golangci-lint run ./...` → `0 issues.`
- `golangci-lint run --tests=false ./...` → `0 issues.` (run separately per the gate note; no test file was left broken, so this is redundant with the above but confirms it).
- `go test ./... -run '^$' -count=1` → every package's test binary compiles (`ok … [no tests to run]` for every package, including `cmd/musterd` and `internal/server`) — no test file anywhere in the repo was left non-compiling by this change.
- `go test ./... -count=1` (`make test`'s exact command) → **4 failures, all in `internal/server`, all sanctioned** (see below); every other package passes, including `cmd/musterd` (21.6s, all green) and the newly-added `internal/selfupdate` (no tests yet — `daemon-tests`' job).
- `goreleaser check` → validates (D6).
- `make release-check` → full local snapshot build succeeds with `--skip=sign` (builds both darwin archs, archives, checksums).
- `test -s internal/selfupdate/minisign.pub` → non-empty (D5, pre-existing from the plan's prerequisite commit).
- `! rg -n "/download/[v]" cmd/ internal/ web/src --glob '!internal/selfupdate/**' --glob '!**/*_test.go'` → no matches (D4).

**Sanctioned test breakage (Protocol Contract §3.3/§5.2/§5.5 — additive fields required
verbatim, per this agent's Constraints; the test agent updates these next step):**
- `internal/server/state_test.go:TestBuildSnapshot_M0Shape` — its pinned `assert.JSONEq`
  literal needs `"updateCheck":true` added under `prefs` and a new top-level
  `"update": {"running":"","install":"","remedy":null,"available":null,"checkedAt":null,"installed":null,"apply":{"phase":"idle","version":null,"error":null}}` key. `buildSnapshot()` (the M0/no-receiver baseline this test exercises directly) has no server context to derive `running`/`install` from, so both render as empty strings — production always renders these from `currentSnapshot()`/`currentUpdate()` instead, which this test doesn't reach.
- `internal/server/prefs_test.go:TestHandlePutPrefs_PersistsToKVUnderOneJSONKey` (line
  135), `TestHandlePutPrefs_UsageModelPersistsToKVAlongsideViewAndDensity` (line 396),
  `TestHandlePutPrefs_ThemePersistsToKV` (line 675) — each pinned `assert.JSONEq` literal
  against the persisted kv blob needs `"updateCheck":true` added (Schema Changes:
  "`updateCheck` joins the existing prefs JSON blob").

No other test file needed changes I wasn't allowed to make; no test file's assertions,
mocks or bodies were touched by me.

## Fix Attempt 1 (review cycle 1)

**Failures addressed**: Minor 1 — REQ-28 ("startup log line names install kind") was not
implemented. Reviewer grepped `install.Kind` against every log statement and found none.

**Changes made**: `cmd/musterd/main.go` — the existing `musterd starting` `log.Info()`
call (was lines 300-306) now also carries `.Str("install", string(install.Kind))`.
Immediately after it, a second `log.Info()` fires naming `install.Remedy` (with the same
`install` field) whenever `Remedy` is non-empty — i.e. for `homebrew` and `unmanaged`
kinds only; `dev` and `installer` have `Remedy == ""` (see `internal/selfupdate/install.go`
`Classify`) and log nothing extra.

**Blast radius of the changed log line** — `rg -n 'musterd starting'` across the repo
before editing found exactly one call site (`cmd/musterd/main.go:300`); no test or other
file asserts on this line's exact field set (`rg -n '"musterd starting"'` in `*_test.go`
returns no matches), so adding fields could not break an existing assertion. `install` is
a pre-existing local `selfupdate.Install` variable already in scope at that point (built
at `cmd/musterd/main.go:162` via `selfupdate.Classify(...)`, and already passed into
`server.Config{Install: install}` two lines above the log call) — no new plumbing needed.

**Repro (reviewer's exact ask — grep, then a staged binary under a scratch
`HOMEBREW_PREFIX`, log pasted once):**

```
$ rg -n 'install.Kind' --glob '*.go' | grep -i log
cmd/musterd/main.go:305:       Str("install", string(install.Kind)).
```
(Only match — confirms REQ-28 is now the sole log statement reading `install.Kind`.)

Staged a `v0.1.0`-tagged build (`go build -ldflags "-X main.version=v0.1.0" -o
<prefix>/bin/musterd ./cmd/musterd`) into a scratch `<prefix>/bin/` under `/private/tmp`
(short path — AF_UNIX's 103-byte `sun_path` limit rejected the default
session-scratchpad path), ran it with `HOMEBREW_PREFIX=<prefix>` and a dedicated
`-tmux-socket` inside the same scratch dir, then sent SIGTERM after 1.5s. Startup log
(full stdout/stderr, unedited):

```
INF claude code version is newer than any version Muster has been tested with; ...
INF wrote hook wrapper scripts hook_script=.../data/hook.sh status_line_script=.../data/status-line.sh
INF reconciled sessions kept_alive=0 marked_ended=0 shells_killed=0 swept=0
INF musterd starting dashboard_url=http://127.0.0.1:18766/auth?token=... data_dir=.../data install=homebrew port=18766 tmux=3.7b version=v0.1.0
INF installed by Homebrew — run brew upgrade musterd install=homebrew
INF shutting down signal=terminated
```

Confirms both halves of the fix: `install=homebrew` on the `musterd starting` line, and
the follow-up remedy line firing only because `Remedy` was non-empty for this kind.
Cleanup verified: `tmux -S <sock> kill-server` run before deleting the scratch dir; a
following `ls /tmp/mus-hb-*` (glob) reported "no matches found" — no socket file or
scratch directory left behind.

**Gate (this session, evidence pasted, not asserted):**
- `go build ./...` → exit 0, no output.
- `make test` (`go test -count=1 ./...`) → all 15 test packages `ok`, none skipped,
  `cmd/musterd` and `internal/server` both green (the packages nearest this change).
- `make lint` (`golangci-lint run`) → `0 issues.`

**Build status**: `go build ./...` exits 0. No test file needed changes for this fix.
