# Review: claude-version-watch

**Plan**: claude-version-watch
**Verdict**: needs-changes
**Cycle**: 1
**Gates**: 1 failed
**Parts**: code, browser | skipped: maintainability
**Part verdicts**: code needs-changes, browser approved

_Merged by orch-state.py merge-review; the verdict is computed from the parts and the gate run, never edited by hand._

## Correctness review

# Correctness review: claude-version-watch

**Plan**: claude-version-watch
**Part verdict**: needs-changes
**Cycle**: 1
**Pack**: kb: pack 18478 words (budget 30000)

## Requirements

| Req | Implemented | Tested | Status |
|-----|-------------|--------|--------|
| REQ-1 | Yes. `prepareServing` no longer runs `claude` (`cmd/musterd/main.go`); the first check runs on the feature's goroutine from `Start` (`internal/server/claudeversion.go:91-96`, `runTicked` ticks at once). Bound is `claudeVersionTimeout` 30 s. `hello` starts as `notCheckedClaudeCode()`, which is `unknown` with `installed: null` | Yes. E1's 7 s stub spec (`startupMs < 3000`, readout `unknown` and then the version); unit tests `StartDoesNotBlockOnTheFirstCheckAndRunsIt`, `CheckRunsUnderADeadline`, `StartsNotChecked…` | pass |
| REQ-2 | Yes. `broadcast` runs only when `!current.equal(info)`. Web side: `parseMessage` case `claudeCode` → `WsClient.onClaudeCode` → `connection.claudeCodeChanged` → `renderClaudeVersion`. `hello` reads `Current()` *after* `hub.add`, so a change cannot fall between the two (`ws.go:190-202`) | Yes. E1 (same page, no reload); `WireSendsOneClaudeCodeMessagePerChangedResult` (exact key sets, explicit-null `installed`, nothing for an unchanged result); `HelloOfALateClient…` | pass |
| REQ-3 | Yes. `claudeVersionLookInterval` 30 s; a look is `ResolveBinaryIdentity` (LookPath, EvalSymlinks, Stat); one check per new identity; the identity is recorded before the check runs | Mostly. `IdentityChange…`, `UnchangedIdentityRunsNoCheck`, `IdentityFieldsEachTriggerACheck`, `UnresolvableIdentity…`, `LoopPicksUpABinaryReplacedBetweenLooks`. Edge Case 2 (binary changes *while* a check runs) has no test (correctness Major 3) | pass (coverage gap: Major 3) |
| REQ-4 | Yes. The issue feature takes `claudeVersion.Current` and calls it at capture (`issuesnapshot.go:128`) | Yes. `IssueSnapshotReadsTheLatestValueNotTheStartupOne` (verified, above and unknown); existing E5 spec | pass |
| DIAG | Checked `kb:diagram/daemon-components` (updated, true), `kb:diagram/web-components` (no claim affected) and `kb:diagram/containers`. **`containers` is stale**: `docs/diagrams/containers.md:63` still says "a version probe at startup" | — | fail (Major 4) |

## Build & Tests

E2E tests: **fail** (1 failed, 847 passed: `embedded.spec.ts:76`) · Daemon tests (race): pass (`go test -race -count=1 ./...`, every package ok) · Web tests: pass (2622) · Daemon build: pass · Web build: pass · Lint: pass (golangci-lint 0 issues, Biome clean). All read from `$GATES_LOG_DIR` (`/var/folders/8t/36s1xtwj1xjfn1pg_jrwztjw0000gn/T/gates-claude-version-watch-c1`); nothing re-run.

## Acceptance Checks

| ID | Command | Result |
|----|---------|--------|
| build | `make build` | pass |
| test | `make test` (race) | pass |
| lint | `make lint` | pass |
| web-build | `make web-build` | pass |
| web-test | `make web-test` | pass (2622) |
| web-lint | `make web-lint` | pass |
| contrast | `make contrast` | pass (46 pairs × 3 themes, 0 failures) |
| features-inventory | inventory | pass |
| versions | `go run ./tools/versions check` | pass |
| e2e-honest | e2e honesty | pass |
| kb-check | `go tool kb check` | pass (591 records, 0 problems) |
| e2e-lint | `make e2e-lint` | pass |
| features | features-scope | pass (connection, issue) |
| comments | comment-checks | pass |
| comment-ledger | comment-pass verify | pass (3 blocks, all kept) |
| size | `size-warn` | WARN, 6 hits. These belong to review-maintainability, which was not spawned this cycle (Shape: fix). See Note 4 |
| e2e | `make e2e` | **FAIL**: `embedded.spec.ts:76` "scratch musterd never became healthy … output: (empty)". See Critical 1 |
| E1 | `cd web && npx playwright test e2e/claude-version.spec.ts` | pass (7/7, the new 7 s test in 7.9 s) |
| D1 | `go test -count=1 ./cmd/musterd/ ./internal/server/` | pass |
| D2 | `go test -count=1 -run 'ClaudeVersion' ./internal/server/` | pass |
| D3 | `make lint` | pass (deduped to lint) |
| W1 | `make web-lint` | pass (deduped to web-lint) |
| W2 | `make web-test` | pass (deduped to web-test) |
| DOC | doc upkeep + Doc Delta vs what shipped | pass. #81 and #89 moved to `todo-done.md`. The fact record and both ADRs exist, `accepted` per the `/fix` skill, and supersede correctly. The logs carry no `deviation:` lines. Both `doc-delta:` lines are honoured: the `ws.claude-code` anchor is in `docs/protocol.md` (0ea22cd4) and both ADRs' `tests:` are repointed. The Doc Delta assertions hold against the code |

## Reviewer-Verified Criteria

| ID | Criterion | Result | Evidence |
|----|-----------|--------|----------|
| RV1 | No `claude` subprocess runs on the request path or before `Listen`; the identity look is a stat | pass | `prepareServing` has no version call. `New` only constructs. `Start` → `bg.start` goroutine. `hello` (`ws.go:200`) and the issue snapshot read `Current()` under an RWMutex. `tick` runs `identify` (LookPath + EvalSymlinks + Stat) and calls `check` only for a new identity |
| RV2 | The new feature follows `themepoll.go`: registered in `New`, no logic in `server.go` | pass | `server.go` holds one construction, one field assignment and one `register(s, claudeVersion)`. All logic is in `internal/server/claudeversion.go`. `Poll <= 0` never starts, like `ThemeConfig.Poll` |

## Hard-Rule Checklist

| # | Rule | Result |
|---|------|--------|
| 1 | Adapter boundary | pass. `--version` and identity resolution stay in `internal/claudecode` (`CheckVersion`, `ResolveBinaryIdentity`); the server only maps `VersionReport` |
| 2 | No terminal-output state parsing | pass |
| 3 | Non-blocking hook handler / ≤ 2 s timeouts | pass (untouched) |
| 4 | tmux on `-L muster` / sizing | pass (no tmux in the diff) |
| 5 | No payload logging | pass (logs version fields only) |
| 6 | Empty-gauge honesty | pass. Not-checked is `unknown`/`installed: null` → "Claude installation unknown"; no `0`/empty path |
| 7 | Identity on tmux target | pass (n/a) |
| 8 | No settings trespass | pass |
| 9 | No real `claude` in tests | pass. Unit tests swap the seams or exec `cachedStub` scripts by path. `newTestServer` uses `Config{}` (Poll 0, never starts). E2E uses the shared stub |

## Issues

### Critical

1. **[orchestrator]** The `make e2e` gate line is red: `[chromium] › e2e/embedded.spec.ts:76` failed in fixture startup ("scratch musterd never became healthy at http://127.0.0.1:63334: TypeError: fetch failed", daemon output empty, `17-e2e.log:982-1004`). I attribute it to no pipeline agent, and no agent should be woken for it:
   - this plan did not author the spec and changes nothing in the embedded serving path;
   - the spec is one of the four listed in `TODO.md` ("Four E2E specs go red when a second Playwright suite shares the machine") and `kb:lesson/concurrent-e2e-across-worktrees-goes-red`;
   - the orchestrator re-ran it alone 20/20 green, and `web/test-results/.last-run.json` (13:46, after the 13:43 sweep) reads `passed`.

   Whoever re-runs the next gate should confirm it comes back green; the cycle 2 sweep does that anyway. Note 1 has a mechanism worth proposing for the backlog.

### Major

1. **[daemon-impl]** A daemon started with no resolvable `claude` now never logs the version outcome. This regresses the plan's "Logs each result as `checkClaudeCode` does today" and the accepted ADR's "log one line per outcome at the matching level" (`kb:adr/connection-installed-claude-classified-never-refused`). Causes include `claude` missing from `$PATH`, a bad `-claude-bin`, or a dangling symlink.
   - **Where**: `internal/server/claudeversion.go:112-115`. `tick` returns on an `identify` error before any check or log. Before this plan, `checkClaudeCode` logged warn "could not determine claude code version" with the error.
   - **Measured** with a scratch `-overlay` test in `internal/server`, nothing written to the tree: `newClaudeVersionFeature(… missing path …)` ticked twice gave `status=unknown installed=<nil> logs=""`.
   - **Fix**: when the identity cannot be resolved, log that warn once with the resolution error: on the first look, and again only after the identity resolved in between. A look must not log every 30 s.
2. **[daemon-tests]** `TestClaudeVersion_UnknownOutcomeNeverFailsStartup` claims coverage it no longer gives. Its "missing binary" subtest (`internal/server/claudeversion_test.go:594`) asserts a warn line for a missing `claude`, but `watchVersionOf` (`:535-541`) forces `identify` to succeed, so the case calls `CheckVersion` on the missing path. Production never does that: production's `identify` fails first and logs nothing (Major 1). The test stays green against the regression. The ADRs `connection-installed-claude-classified-never-refused` and `canary-claude-auto-updater-left-on` both cite this test in `tests:`. The "empty path" subtest (`:597`) has the same problem: production maps `""` to `"claude"` through `defaultClaudeBin` and never calls `CheckVersion("")`.
   - **Fix**: once Major 1 is in, drive the missing-binary case through the constructor's real `identify` (no override), asserting `unknown` and the warn line. Drop "empty path" or route it through `New`/`defaultClaudeBin`.
3. **[daemon-tests]** Plan Edge Case 2 is mapped to D2 but no test covers it. In that case the binary changes while a check is running, and the next look must see the new identity and check once more. Every test changes the identity between ticks, never during `check`. A version of `tick` that re-identified *after* the check would pass the whole suite while missing the mid-check swap. Add a test whose `onCheck` hook sets a new identity: the next `tick` must run a second check (2 checks total), and a further tick must run none.
4. **[orchestrator]** Doc drift on behaviour this plan shipped. Both places describe the check as startup-only and omit the re-check on a binary change, which is what warms a new binary for #81:
   - `docs/diagrams/containers.md:63` (`kb:diagram/containers`, governs `cmd/musterd/main.go`): "plus a version probe at startup". It should read "plus a version probe after startup and whenever the binary file changes" or similar. 1bc6299b updated `daemon-components` but missed this one.
   - `docs/claude-code-versions.md:58`: "`musterd` calls `claudecode.CheckVersion()` at startup and classifies…". It now checks in the background once serving and again on each binary change.

### Minor

None.

### Notes

1. **[note]** A plausible mechanism for Critical 1, offered to the backlog and not as a finding against this plan. The embedded fixture `copyFile`s the freshly built `musterd` into a new data dir for every start (`web/e2e/helpers/daemon.ts:686-689`), then waits 10 s for `/healthz` (`waitForHealthy`, `:430`). This plan's own `kb:fact/new-claude-binary-first-run-slow-on-macos` measured the first exec of a newly written binary held ~11 s with no CPU and no output. That matches "never became healthy … output: (empty)" exactly. If it holds, the flake is not about load, and the fact's `guard: none` has a cheap guard nearby.
2. **[note]** No `web-implementation.md` or `web-tests.md` exists for the web half (c894edda: `hello.ts`, `messages.ts`, `ws.ts`, `wsapp.ts`, `connection.ts`). I read the diff directly. It parses `claudeCode` through the shared, already tested `parseClaudeCode`, uses no `innerHTML`, opens no second socket, and reuses the existing `renderClaudeVersion`. No Vitest case exercises `parseMessage({type:"claudeCode",…})` or its rejection of a malformed object. The plan's Proof scopes tests to E1 plus daemon units, so I am not filing it.
3. **[note]** For doc-reconcile: `docs/features/connection/spec.md` `refs:` does not yet list `kb:adr/connection-claude-version-watched-and-pushed`, and its `protocol:` list does not name `ws.claude-code`. The generated `contract.md` already includes the `claudeCode` section.
4. **[note]** For whoever owns shape next time: `size-warn` names `TestBuildServerConfig_MapsEveryFlagOntoTheServerConfig` at 67 > 60 (one assertion added here). `cmd/musterd/main.go` went from 525 to 518 lines, still over the 500 threshold.

## Browser review

# Browser review: claude-version-watch

**Plan**: claude-version-watch
**Part verdict**: approved
**Cycle**: 1
**Pack**: kb: pack 6689 words (budget 30000)
**Rig**: `bin/musterd` built by `make web-build build` at b5e7688e (embedded dashboard); data dir `$TMPDIR/bv rig.g1ka/data dir` (space-bearing), tmux socket `$TMPDIR/bv rig.g1ka/tmux.sock`, a private copy of the e2e stub `claude` (helpers/daemon.ts STUB_CLAUDE_SCRIPT) at `$TMPDIR/bv rig.g1ka/claude`, first run with `MUSTER_E2E_STUB_VERSION_DELAY_SECONDS=7`; headless Chromium 1280x800 through a throwaway Playwright spec (deleted); daemon SIGTERMed, rig dir removed, `git status` shows nothing of mine.

Gates log: `17-e2e` is red on one test, `embedded.spec.ts:76` (serves /healthz from the
embedded-serving daemon: "never became healthy" within 10 s). That failure belongs to the gate
reviewer (review-work). The binary I drove is this tree's own build. See Note 1 for a
measurement that may explain it.

## Matrix

Hosts: the readout `#claude-version` sits in the masthead (`web/index.html:46`), which is shared by
the Focus and Tiles views. The pop-out `/doc.html` has no masthead and no readout (grep finds no
`claude-version` in `doc.html`), so every pop-out cell is N/A.

States: **no data yet** means the version check is still running (stub sleeping 7 s). **data**
means a check result is held. **daemon-down** means the scratch daemon was SIGTERMed.

| Req | Host | State | Claim | Result | Evidence |
|-----|------|-------|-------|--------|----------|
| REQ-1 | — (daemon) | no data yet | serves without waiting for `--version` | pass | fresh data dir with the stub sleeping 7 s: `/healthz` 200 after 0.252 s and 0.202 s (two runs, curl loop). The first spec run took 3.04 s, but that was macOS's first exec of the newly built `bin/musterd`; a restart of the same binary took 59 ms. Startup log line `musterd starting` appeared 8.2 s before the version log line (3016 ms vs 11211 ms in that run) |
| REQ-1 | focus | no data yet | `hello.claudeCode` = unknown/null until the check ends; readout honest | pass | hello frame `{"installed":null,…,"status":"unknown"}` at +3479 ms. Readout text "Claude installation unknown", box 1042,16–1242,30 inside masthead 0,0–1280,46 and clear of `#connection-status` 1250–1264; opacity 1, display block, visibility visible |
| REQ-1 | tiles | no data yet | same | pass | after a pointer click on Tiles (`aria-pressed=true`): same text and box, opacity 1, display block, visibility visible |
| REQ-1 | pop-out | any | — | N/A — `/doc.html` has no readout | |
| REQ-2 | focus | no data yet → data | readout re-renders from a pushed `claudeCode` with no reload | pass | one `claudeCode` frame at +11212 ms (`installed 2.0.0, status below`). MutationObserver saw "Claude installation unknown" → "claude 2.0.0 ⚠" at 7.9 s after page load. Main-frame navigations stayed at 1, and the `window` marker set at init was unchanged |
| REQ-2 | focus | data | glyph present, visible, inside the readout | pass | glyph aria-label/title "…please update Claude Code", box 1235–1242 inside the readout 1134–1242, opacity 1, display inline |
| REQ-2 | tiles | data | same readout after switching view | pass | text "claude 2.0.0 ⚠", same box, glyph visible |
| REQ-2 | focus | data (a later client) | a dashboard that connects later gets the value in hello | pass | second page: hello carried `installed 2.0.0, status below`, no `claudeCode` frame; readout "claude 2.0.0 ⚠" |
| REQ-2 | focus | data | no broadcast for an unchanged result | pass | stub `touch`ed (new mtime, same output): one new check log line, 0 `claudeCode` frames over 33 s, readout unchanged |
| REQ-3 | focus | data | binary replaced → re-checked and pushed live | pass | stub replaced by atomic rename, now answering 2.1.300: readout became "claude 2.1.300" (no glyph, status verified) 34.1 s after the swap. One `claudeCode` frame; navigations 1; the 30 s look plus the check fit the plan's bound |
| REQ-3 | tiles | data | same | pass | "claude 2.1.300", box 1138–1242 inside masthead, no glyph |
| REQ-3 / Edge 3 | focus | data | binary missing → held value stays, nothing pushed | pass | stub removed for 33 s: 0 frames, readout still "claude 2.1.300", visible |
| REQ-3 / Edge 3 | focus, tiles | data | binary reappears newer → pushed | pass | restored as 2.1.301: "claude 2.1.301 ⚠" 22.4 s later, glyph "…has not been tested with Muster" (no "update"), visible in both views, navigations 1 |
| REQ-4 | focus | data | issue capture carries the latest result | pass | after the 2.1.300 swap, a pointer click on "File an issue" sent POST `/api/issue/captures` whose `snapshot.claudeCode` was `{"installed":"2.1.300",…,"status":"verified"}`, not the startup 2.0.0 |
| Edge 4 | focus | data (normal startup) | version on first paint, no visible unknown | pass | fresh page against a daemon answering at once: readout sequence "" → "claude unknown" (the pre-hello placeholder, which already existed) → "claude 2.1.301 ⚠" at 81 ms. "Claude installation unknown" never rendered |
| Edge 4 | focus | daemon-down → restart | the reconnecting page shows no flash of unknown | pass | after a restart (healthy at 59 ms), the reconnect hello carried `installed 2.1.301`. The only mutation recorded was a re-render to the same "claude 2.1.301 ⚠"; navigations 1 |
| §6 daemon-down | focus | daemon-down | daemon-down surfaced prominently | pass | `#banner` display block, box 0,46–1280,78, text "musterd unreachable — …". `#connection-status` data-health=down, "reconnecting…" |
| §6 daemon-down | tiles | daemon-down | same | pass | same banner box and text in Tiles |
| §6 daemon-down | focus, tiles | daemon-down | readout while down | pass (as before) | keeps the last value "claude 2.1.301 ⚠" under the banner; this behaviour existed before this plan (Note 3) |
| Keeps focus | focus, tiles | data | re-render does not take focus | N/A — the readout holds nothing focusable (the glyph is `role="img"`, not tabbable), and `claudeCodeChanged` only replaces `#claude-version`'s children | |
| §6 cost / Done / permission | — | — | no cost, Done or authoritative permission display added | pass | the plan adds no such surface; the readout shows only the version and the status glyph |
| §7 terminal rules | — | — | — | N/A — the plan touches no terminal surface | |

## Issues

### Critical

None.

### Major

None.

### Minor

None.

### Notes

1. **[note]** The first exec of a newly built `bin/musterd` took ~3 s to reach `/healthz`
   (`musterd starting` logged at 3016 ms). A restart of the same file took 59 ms, and fresh
   data dirs took 0.2–0.25 s. This is the plan's own fact
   (kb:fact/new-claude-binary-first-run-slow-on-macos) applied to musterd itself. The red
   `embedded.spec.ts:76` gate line runs a freshly placed binary under a 10 s health wait, so it
   may be this cost plus a loaded machine rather than a regression. It is review-work's to judge.
2. **[note]** When the readout changes width, the masthead items to its left move. They are
   right-aligned. With "Claude installation unknown" (200 px) → "claude 2.0.0 ⚠" (108 px),
   Settings moved from x 956–1034 to 1048–1126, and Issue and the usage refresh button moved
   with it. Before this plan that happened only at page load. Now it can happen live, in the
   first seconds after a slow-start daemon or after a Claude Code update, so a click aimed at
   Settings can land on Issue. It is rare. If the developer wants it gone, that is a decision
   between reserving a fixed width for the readout and leaving it as it is.
3. **[note]** At a 900 px wide window the masthead overflows. `.masthead-right` needs 594 px but
   gets 547 px. The readout's right edge is at 909 and `#connection-status` at 917–931, both
   past the 900 px viewport. Layout is unchanged by this plan (the masthead CSS is untouched),
   and the longer "Claude installation unknown" text, which already existed, makes it worse.
   During daemon-down the readout keeps its last value without an age. That existed before this
   plan, and the banner states the outage.
