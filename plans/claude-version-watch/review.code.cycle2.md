# Correctness review: claude-version-watch

**Plan**: claude-version-watch
**Verdict**: approved
**Cycle**: 2
**Pack**: kb: pack 18484 words (budget 30000)

Scope: a full cycle, not a delta re-review, because cycle 1 had open Majors. The fix wave since
`b8e7b881` touches only `internal/server/claudeversion.go`, `internal/server/claudeversion_test.go`,
`docs/diagrams/containers.md`, `docs/claude-code-versions.md` and plan bookkeeping. No web source
changed (`git diff --name-only b8e7b881..HEAD -- web/src` is empty), so the web findings from
cycle 1 still stand. I re-read the daemon feature file in full and every changed test.

## Requirements

| Req | Implemented | Tested | Status |
|-----|-------------|--------|--------|
| REQ-1 | Yes, unchanged since cycle 1. `prepareServing` runs no `claude`. The first check runs on the feature's goroutine from `Start` with a 30 s `claudeVersionTimeout` (`internal/server/claudeversion.go:91-96,128`), and `current` starts as `notCheckedClaudeCode()` (unknown, `installed` nil) | Yes. E1's 7 s stub test (`18-E1.log`: 7/7, the slow test in 7.3 s) and the unit tests `StartDoesNotBlock…`, `CheckRunsUnderADeadline`, `StartsNotChecked…` | pass |
| REQ-2 | Yes. `broadcast` fires only on `!current.equal(info)` (`:137-145`). The web path is unchanged from cycle 1 | Yes. E1 (same page, no reload); `WireSendsOneClaudeCodeMessagePerChangedResult`; `HelloOfALateClient…` | pass |
| REQ-3 | Yes. A look is `ResolveBinaryIdentity` (LookPath + EvalSymlinks + Stat). There is one check per new identity, and the identity is recorded before the check (`:126`). New: an unresolvable identity logs the unknown warn once per unresolved stretch (`:115-122`) | Yes. Edge Case 2 is now covered by `TestClaudeVersion_BinaryChangedWhileACheckRunsIsCheckedAgainOnTheNextLook`. The unresolved logging is covered by `TestClaudeVersion_UnresolvableIdentityLogsOncePerUnresolvedStretch` | pass |
| REQ-4 | Yes. The issue snapshot calls `claudeVersion.Current` at capture | Yes. `IssueSnapshotReadsTheLatestValueNotTheStartupOne`; E5 in E1 | pass |
| DIAG | Checked `kb:diagram/containers` (fixed in 9698fab0: "a version probe once serving and whenever the binary file changes", which is true), `kb:diagram/daemon-components` (`server → claudecode` "checks the version" is true; `cmd → claudecode` "version" still holds through `-version`'s `FormatRange(Floor, Verified)` at `cmd/musterd/main.go:223`) and `kb:diagram/web-components` (no claim affected) | — | pass |

## Build & Tests

E2E tests: pass (848 passed, 0 failed; `embedded.spec.ts:76` did not recur) · Daemon tests (race): pass (`go test -race -count=1 ./...`, 25 packages ok, no FAIL) · Web tests: pass (2622 tests in 93 files) · Daemon build: pass · Web build: pass · Lint: pass (golangci-lint 0 issues, Biome clean on 323 files). All of these are read from `$GATES_LOG_DIR` (`/var/folders/8t/36s1xtwj1xjfn1pg_jrwztjw0000gn/T/gates-claude-version-watch-c2`, run 14:17–14:31). That run comes after HEAD `16964cf2` (14:17), so it covers this exact tree. Nothing was re-run.

## Acceptance Checks

| ID | Command | Result |
|----|---------|--------|
| build | `make build` | pass |
| test | `make test` (race) | pass |
| lint | `make lint` | pass (0 issues) |
| web-build | `make web-build` | pass |
| web-test | `make web-test` | pass (2622) |
| web-lint | `make web-lint` | pass |
| contrast | `make contrast` | pass (46 pairs × 3 themes, 0 failures) |
| features-inventory | inventory | pass |
| versions | `go run ./tools/versions check` | pass (all fragments fresh) |
| e2e-honest | e2e honesty | pass |
| kb-check | `go tool kb check` | pass (591 records, 0 problems) |
| e2e-lint | `make e2e-lint` | pass |
| features | features-scope | pass (connection, issue) |
| comments | comment-checks | pass |
| comment-ledger | comment-pass verify | pass (3 blocks, all kept; cycle 2 kept the reworded `tick` comment) |
| size | `size-warn` | WARN, 6 hits. These belong to review-maintainability, which was not spawned (Shape: fix). Neither cycle-2 file is named |
| e2e | `make e2e` | pass (848) |
| E1 | `cd web && npx playwright test e2e/claude-version.spec.ts` | pass (7/7) |
| D1 | `go test -count=1 ./cmd/musterd/ ./internal/server/` | pass |
| D2 | `go test -count=1 -run 'ClaudeVersion' ./internal/server/` | pass |
| D3 | `make lint` | pass (deduped to lint) |
| W1 | `make web-lint` | pass (deduped to web-lint) |
| W2 | `make web-test` | pass (deduped to web-test) |
| DOC | doc upkeep + Doc Delta vs what shipped | pass. Nothing has regressed since cycle 1: #81/#89 are ticked, and the fact record and both ADRs exist and supersede correctly. The logs carry no `deviation:` line, and the cycle-2 log adds no `doc-delta:` line. The ADRs that cite `TestClaudeVersion_UnknownOutcomeNeverFailsStartup` in `tests:` (`connection-installed-claude-classified-never-refused`, `canary-claude-auto-updater-left-on`) now point at a test that guards what they say (Major 2 fix). The Doc Delta assertions hold against the code. `docs/protocol.md` `ws.hello` / `ws.claude-code` match what shipped |

## Reviewer-Verified Criteria

| ID | Criterion | Result | Evidence |
|----|-----------|--------|----------|
| RV1 | No `claude` subprocess runs on the request path or before `Listen`; the identity look is a stat | pass | Unchanged from cycle 1. The new unresolved branch (`:115-121`) only logs and runs nothing. `hello` and the issue snapshot read `Current()` under the RWMutex |
| RV2 | The new feature follows `themepoll.go`: registered in `New`, no logic in `server.go` | pass | `server.go:222` constructs the feature and registers it. All logic, including the new `unresolved` flag, stays in `claudeversion.go` |

## Hard-Rule Checklist

| # | Rule | Result |
|---|------|--------|
| 1 | Adapter boundary | pass. Resolution and `--version` stay in `internal/claudecode`. The server builds a `VersionReport` from `RangeOf(ObservedVersions())`, as `notCheckedClaudeCode` already did |
| 2 | No terminal-output state parsing | pass |
| 3 | Non-blocking hook handler / ≤ 2 s timeouts | pass (untouched) |
| 4 | tmux on `-L muster` / sizing | pass (no tmux in the diff) |
| 5 | No payload logging | pass. The new warn carries floor, verified, status and the resolution error (a path) only |
| 6 | Empty-gauge honesty | pass. An unresolved look keeps the held value or `unknown`/`installed: null`. The log omits `installed` and never writes an empty string (asserted) |
| 7 | Identity on tmux target | pass (n/a) |
| 8 | No settings trespass | pass |
| 9 | No real `claude` in tests | pass. `watchVersionOf` now uses the constructor's real seams, but over `cachedStub` scripts and a non-existent temp path, never `claude` on PATH. `newVersionFeature` passes `"claude-never-run"` and then swaps the seams |

## Cycle-1 issues

| Prior issue | Fix commit | Verified how |
|-------------|------------|--------------|
| cycle 1 correctness Critical 1 `[orchestrator]` `make e2e` red on `embedded.spec.ts:76` | — (no code change) | `17-e2e.log`: 848 passed, 0 failed |
| cycle 1 correctness Major 1 `[daemon-impl]` no version log when `claude` cannot be resolved | `4089623e` | Diff read. `tick` logs `logClaudeCodeReport(unresolvedClaudeCodeReport(err))` once while `unresolved` is false, and clears the flag on the next successful resolve. It reuses the existing warn message and fields, the held value is untouched, and nothing beyond the ask changed |
| cycle 1 correctness Major 2 `[daemon-tests]` `UnknownOutcomeNeverFailsStartup` missing-binary case bypassed `identify`; "empty path" untestable in production | `51c67d28` | `watchVersionOf` now builds through `newClaudeVersionFeature` with no seam override, so the missing temp path fails `ResolveBinaryIdentity`, as it does in production. Against the pre-`4089623e` `tick` it would see no warn line and go red. "empty path" is dropped and replaced by `TestClaudeVersion_EmptyClaudeBinNamesClaudeBeforeTheFeatureSeesIt` on `defaultClaudeBin`, which `server.go:222` feeds the feature |
| cycle 1 correctness Major 3 `[daemon-tests]` Edge Case 2 untested | `51c67d28` | `onCheck` swaps the identity during the first check. The test asserts 1 → 2 → 2 checks. A `tick` that recorded the identity after the check would stop at 1, so the test discriminates. The rig releases its mutex before the hook, so the hook does not deadlock |
| cycle 1 correctness Major 4 `[orchestrator]` stale `containers.md:63` and `claude-code-versions.md:58` | `9698fab0` | Both now say the check runs once serving and again whenever the binary file changes. Both are true against `Start`/`tick` |

## Issues

### Critical

None.

### Major

None.

### Minor

None.

### Notes

1. **[note]** During an update mid-swap (Edge Case 3), the new unresolved warn logs `"status":"unknown"` while the daemon still holds and serves the previous result, for example `verified`. This is what cycle 1 Major 1 asked for, and it happens once per stretch, so I request no change. A reader of `musterd.log` may still take that line as the dashboard's state. Wording the message as "could not resolve claude; keeping the last result" when a value is already held would make that unambiguous, if anyone touches it again.
2. **[note]** `TestClaudeVersion_EmptyClaudeBinNamesClaudeBeforeTheFeatureSeesIt` unit-tests `defaultClaudeBin` alone. That `New` routes `-claude-bin` through it before the feature sees it rests on `server.go:222`, not on the test. The plan asks no more than this, so I am not filing it.
3. **[note]** This repeats cycle 1 Note 3 for doc-reconcile, which is still open. `docs/features/connection/spec.md` `refs:` does not list `kb:adr/connection-claude-version-watched-and-pushed`, and its `protocol:` list does not name `ws.claude-code`.
