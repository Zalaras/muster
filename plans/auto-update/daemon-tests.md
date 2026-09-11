# Daemon Tests: auto-update

**Plan**: auto-update
**Verdict**: pass

## Summary

Tests created: 61 top-level `Test*` functions (138 cases counting subtests) | Passing: 138 | Failing: 0

Also fixed the four pre-existing pinned-JSON tests daemon-impl flagged as sanctioned
breakage of the Protocol Contract (`prefs` gaining `updateCheck`, `snapshot` gaining
`update`).

## Tests

| File | Test Name | What It Tests | Status |
|------|-----------|---------------|--------|
| `internal/selfupdate/semver_test.go` | `TestParseRelease_Table` | D7: strict `v?MAJOR.MINOR.PATCH`, rejects dev/git-describe/dirty/short forms | pass |
| `internal/selfupdate/semver_test.go` | `TestVersion_Compare` | D9: numeric ordering field-by-field, not lexicographic | pass |
| `internal/selfupdate/semver_test.go` | `TestVersion_String` | bare `MAJOR.MINOR.PATCH` rendering | pass |
| `internal/selfupdate/semver_test.go` | `TestVersion_CompareOnlyStrictlyGreaterIsAvailable` | D9: only strictly-greater reports available | pass |
| `internal/selfupdate/release_test.go` | `TestLatestTag_ResolvesAbsoluteAndRelativeRedirect` | D8: absolute and path-relative `Location` both resolve | pass |
| `internal/selfupdate/release_test.go` | `TestLatestTag_Errors` | D8: 200-instead-of-redirect, no `Location`, non-semver tag, transport error all refuse | pass |
| `internal/selfupdate/release_test.go` | `TestLatestTag_NeverFollowsTheRedirectItself` | REQ-5: HEAD, no redirect following | pass |
| `internal/selfupdate/release_test.go` | `TestLatestTag_RequestCarriesTenSecondDeadline` | D26 (check half): request context deadline ≈10s, via deadline-inspecting transport, no real wait | pass |
| `internal/selfupdate/release_test.go` | `TestAssetName` / `TestDownloadURL` | asset/URL naming | pass |
| `internal/selfupdate/verify_test.go` | `TestVerifyChecksums_AcceptsBothSignatureModes` | D10/REQ-15: legacy `Ed` and prehashed `ED` both verify | pass |
| `internal/selfupdate/verify_test.go` | `TestVerifyChecksums_Refusals` | D10: tampered file, foreign key, truncated sig, malformed pubkey all refuse | pass |
| `internal/selfupdate/verify_test.go` | `TestChecksumFor_*` (4 funcs) | D10: extraction, one/two-space lines, missing line (`ErrNoChecksumLine`), malformed hex | pass |
| `internal/selfupdate/verify_test.go` | `TestSHA256Of` | pinned to stdlib `sha256.Sum256` | pass |
| `internal/selfupdate/apply_test.go` | `TestApply_SuccessfulInstall` | D11/D19(Apply half): phases downloading→verifying→installing in order, content+mode 0755, no leftover temp file | pass |
| `internal/selfupdate/apply_test.go` | `TestApply_AcceptsPrehashedSignature` | REQ-15 at the `Apply` call site | pass |
| `internal/selfupdate/apply_test.go` | `TestApply_SymlinkAtInvokedPathIsLeftAlone` | REQ-17: symlink elsewhere is untouched, still points at the resolved real path | pass |
| `internal/selfupdate/apply_test.go` | `TestApply_RefusalsLeaveTheBinaryByteIdentical` | D10/D11/INV-3 table: missing `.minisig`, tampered checksums, foreign key, truncated sig, SHA mismatch, missing checksum line, missing `musterd` member — binary byte-identical + no leftover temp file after each | pass |
| `internal/selfupdate/apply_test.go` | `TestApply_WriteFailureDuringInstallLeavesBinaryUnchanged` | edge case 19: unwritable exe dir, binary untouched | pass |
| `internal/selfupdate/apply_test.go` | `TestApply_RequestsCarryA120SecondDeadline` | D26 (apply half): ~120s deadline via deadline-inspecting transport, no real wait | pass |
| `internal/selfupdate/lock_test.go` | `TestAcquireLock_*` (3 funcs) | D12: `ErrInProgress` fast-fail, release+reacquire, per-directory scope | pass |
| `internal/selfupdate/install_test.go` | `TestClassify_Table` | D13: dev / opt-homebrew / Cellar / `$HOMEBREW_PREFIX` / unwritable dir / git-tree-below-home / git-at-home-itself / plain writable dir | pass |
| `internal/selfupdate/install_test.go` | `TestClassify_HomebrewChecksBeforeWritability`, `TestClassify_NilAccessFuncIsTreatedAsWritable` | REQ-21 precedence + defensive default | pass |
| `internal/selfupdate/install_test.go` | `TestWritableDir` | production access func, writable vs 0500 dir | pass |
| `internal/selfupdate/exeversion_test.go` | `TestProbeVersion_ParsesRecognisedFormats`, `TestProbeVersion_RejectsDevAndUnparseableOutput`, `TestProbeVersion_RunFailurePropagates` | D25: parses `musterd 0.11.0 (...)` / `musterd v0.11.0`, rejects `musterd dev` | pass |
| `internal/selfupdate/exeversion_test.go` | `TestRunVersionProbe_*` (2 funcs) | production run func against a real subprocess (`/bin/echo`, `/usr/bin/false`) | pass |
| `internal/server/update_test.go` | `TestUpdateManager_DisabledCheckingMakesNoRequests` | D14: construction+Start+3 ticks+Refresh with checking off make 0 requests | pass |
| `internal/server/update_test.go` | `TestUpdateManager_SetCheckEnabledFalseClearsAndBroadcastsOnce` / `...TrueTriggersImmediateCheck` | D15 | pass |
| `internal/server/update_test.go` | `TestUpdateManager_LateResponseAfterDisableIsDiscarded` | D16: in-flight check discarded when pref turned off mid-request | pass |
| `internal/server/update_test.go` | `TestUpdateManager_FailedCheckKeepsPreviousResultAndBroadcastsNothing` | D17 | pass |
| `internal/server/update_test.go` | `TestUpdateManager_CheckSwap_DetectsAnExternalSwap` / `...ProbeFailureOrTimeoutLeavesInstalledNull` | D24: stat-diff+successful probe sets `installed`; failing/timing-out probe leaves it null | pass |
| `internal/server/update_test.go` | `TestHandleApplyUpdate_ErrorTable` (8 subtests) | D18: 400 bad JSON, empty-body-defaults-false, 404 no-manager, 404 dev, 409 update_unsupported×2 (homebrew/unmanaged, message==remedy), 409 nothing_to_apply, 409 shutting_down, cookie required | pass |
| `internal/server/update_test.go` | `TestHandleApplyUpdate_SecondRequestWhileInFlightReturns202WithoutASecondDownload` | D18/D20 (REQ-20): joined request 202s, no second download, first request's `restart` value wins | pass |
| `internal/server/update_test.go` | `TestHandleApplyUpdate_SuccessfulApplyBroadcastsPhasesInOrder` | D19: downloading→verifying→installing→done in order over WS, INV-4 after every broadcast | pass |
| `internal/server/update_test.go` | `TestHandleApplyUpdate_RestartTrueBroadcastsRestartingAndSignalsExactlyOnce` | D20 | pass |
| `internal/server/update_test.go` | `TestHandleRestartImpact_*` (4 funcs) | D23: real per-test tmux socket, alive `muster-<n>-shell` sessions listed with title (null for unknown session id), `[]` when none, works with updates disabled, cookie required | pass |
| `cmd/musterd/update_test.go` | `TestRunUpdate_*` (7 funcs) | D21: dev/homebrew/unmanaged remedy, already-up-to-date (incl. rollback), successful install+stdout message, bad-signature refusal+byte-identical binary, `LatestTag` failure | pass |
| `cmd/musterd/update_test.go` | `TestRun_UpdateFlag_SafeSubset` (3 subtests) | D21 literally through `run([]string{"-update",...}})` for the 3 scenarios that never touch any file (dev, homebrew-via-`HOMEBREW_PREFIX`, already-up-to-date) — see Decisions for why the full success/bad-signature paths are driven through `runUpdate` directly instead | pass |
| `cmd/musterd/update_test.go` | `TestReexec_PassesArgvAndEnvVerbatim` (+ `TestReexecHelperProcess` subprocess body) | D22/INV-7: re-exec'd process gets exactly the harness's own argv plus `os.Environ()`+`MUSTER_RESTARTED=1`, via a real `syscall.Exec` in a disposable subprocess | pass |
| `cmd/musterd/open_test.go` | `TestOpen_MusterRestartedSuppressesAutoOpenEvenWithATerminalStdin` | D22: `MUSTER_RESTARTED=1` suppresses auto-open even with `-open` defaulted and a real pty stdin | pass |

## Pre-existing tests fixed (sanctioned breakage)

| File | Test Name | Fix |
|------|-----------|-----|
| `internal/server/state_test.go` | `TestBuildSnapshot_M0Shape` | pinned literal gained `"updateCheck":true` under `prefs` and the full `update` object (`running`/`install` empty strings — the M0 baseline has no server context) |
| `internal/server/prefs_test.go` | `TestHandlePutPrefs_PersistsToKVUnderOneJSONKey` | pinned literal gained `"updateCheck":true` |
| `internal/server/prefs_test.go` | `TestHandlePutPrefs_UsageModelPersistsToKVAlongsideViewAndDensity` | pinned literal gained `"updateCheck":true` |
| `internal/server/prefs_test.go` | `TestHandlePutPrefs_ThemePersistsToKV` | pinned literal gained `"updateCheck":true` |

## Decisions

- **D19/D20's phase-ordering claim is split across two levels.** `internal/selfupdate`'s
  `TestApply_SuccessfulInstall` asserts `Apply`'s own three progress calls
  (downloading/verifying/installing, in order) directly against the function under test.
  `internal/server`'s `TestHandleApplyUpdate_SuccessfulApplyBroadcastsPhasesInOrder` and
  `...RestartTrueBroadcastsRestartingAndSignalsExactlyOnce` add the manager-level `done`/
  `restarting` phases (which `runApply` sets itself, not via `Apply`'s `Progress` callback)
  over the real WS wire. Together they cover D19/D20's full claim; neither alone would.
- **D21: `runUpdate` is the unit under test, not `run()`, for the file-touching
  scenarios.** `run()` resolves `exePath` via the real `os.Executable()`, which inside
  `go test` is the compiled test binary currently executing these tests. Driving a full
  successful install (or a bad-signature refusal, which still writes/removes a temp file
  beside `exePath` before failing) through `run()` would install a new file over — or
  create stray files beside — that binary while it is running. `runUpdate` takes `exePath`
  as an explicit parameter for exactly this reason (its own doc comment: a testable seam),
  so `TestRunUpdate_*` drives it directly against scratch paths. `TestRun_UpdateFlag_SafeSubset`
  additionally drives the literal `run([]string{"-update", ...})` call named in D21 for the
  three scenarios that provably never reach `AcquireLock`/`Apply` at all (dev build; a
  Homebrew classification obtained by pointing `$HOMEBREW_PREFIX` at the running test
  binary's own directory, which only ever *reads* the path; and an equal/older "latest"
  tag, which returns before touching any file) — each asserts the running test binary's
  own bytes are unchanged as a belt-and-braces check. This was a live hazard I identified
  and worked around rather than something the plan called out; flagging it here since it
  affects how D21 is verified against the acceptance-criteria text.
- **D22's "never calls `resolveOnExit`" clause is covered by design, not a runtime
  assertion.** `cmd/musterd/main.go`'s shutdown `select` returns `&errRestart{...}`
  directly from the `case <-srv.RestartRequests():` arm, before the `resolveOnExit`
  call point that follows the `select` block — the two are mutually exclusive by
  control flow, not by a flag any test could toggle. I did not add implementation code
  (e.g. a call counter) to make this independently observable, since that would be an
  implementation change outside this agent's remit. `TestReexec_PassesArgvAndEnvVerbatim`
  and `TestOpen_MusterRestartedSuppressesAutoOpenEvenWithATerminalStdin` cover the two
  clauses of D22 that *are* independently testable (argv/env passthrough via a real
  `syscall.Exec` in a disposable helper-process subprocess; auto-open suppression via the
  existing real-subprocess+pty pattern in `open_test.go`).
- **D22's "unsets the variable" clause is covered only indirectly.** The read
  (`os.Getenv("MUSTER_RESTARTED")`) and the unset (`os.Unsetenv(...)`) are two adjacent
  lines inline in `run()`, not a separately callable unit, and `run()` only reaches them
  once it commits to actually starting the server (both `-version` and `-update` return
  earlier) — so observing them requires a real subprocess spawn, which
  `TestOpen_MusterRestartedSuppressesAutoOpenEvenWithATerminalStdin` already does to prove
  the *read* took effect (auto-open was suppressed). I did not find a way to observe the
  subsequent `Unsetenv` from outside that subprocess without either modifying
  implementation code or reading `/proc/<pid>/environ` (unavailable on macOS). Flagging
  this as the one sub-clause of D22 this suite does not directly exercise, rather than
  silently calling D22 fully covered.
- **Disposable minisign keypairs only.** Every fixture signs with a keypair generated
  in-process via `minisign.GenerateKey(nil)` (`aead.dev/minisign`, the real import path
  per daemon-implementation.md's Decisions). This agent never looked for or touched
  Damian's real private key; the committed `internal/selfupdate/minisign.pub` is untouched
  and used only by production code, never by these tests.
- **`internal/server/update_test.go`'s D23 tests use a real per-test tmux socket**
  (`tmuxtest.Socket`), per `docs/conventions.md`'s rule that real tmux is for
  tmux-observable effects: `GET /api/update/restart-impact` literally reads live tmux
  session state, so faking it would test nothing.

## Test Run Output

```
$ go build ./...
(exit 0, no output)

$ make test
go test -count=1 ./...
ok  	github.com/Zalaras/muster/cmd/musterd	23.685s
ok  	github.com/Zalaras/muster/internal/claudecode	22.028s
?   	github.com/Zalaras/muster/internal/claudecode/claudecodetest	[no test files]
ok  	github.com/Zalaras/muster/internal/ghissue	0.699s
ok  	github.com/Zalaras/muster/internal/gitutil	2.252s
ok  	github.com/Zalaras/muster/internal/locate	2.678s
ok  	github.com/Zalaras/muster/internal/selfupdate	2.100s
ok  	github.com/Zalaras/muster/internal/server	28.915s
ok  	github.com/Zalaras/muster/internal/session	6.747s
ok  	github.com/Zalaras/muster/internal/store	7.682s
ok  	github.com/Zalaras/muster/internal/termbridge	6.884s
ok  	github.com/Zalaras/muster/internal/tmux	16.470s
ok  	github.com/Zalaras/muster/internal/tmux/tmuxtest	7.967s
ok  	github.com/Zalaras/muster/internal/usage	8.289s
ok  	github.com/Zalaras/muster/internal/webui	7.358s
?   	github.com/Zalaras/muster/test/rig/capture	[no test files]
?   	github.com/Zalaras/muster/test/rig/failproxy	[no test files]
ok  	github.com/Zalaras/muster/tools/versions	17.305s

$ make lint
golangci-lint run
0 issues.
```
