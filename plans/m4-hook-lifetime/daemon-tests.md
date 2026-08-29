# Daemon Tests: M4 — Hook lifetime

**Plan**: m4-hook-lifetime
**Verdict**: pass

## Summary

Files touched: `internal/claudecode/settings_test.go` (rewritten for the new
`SettingsConfig`/`WriteWrapperScripts` shapes), `internal/server/settings_shell_test.go`
(extended for D11–D13), `internal/server/sessions_test.go` (mechanical field-rename fix),
`internal/session/manager_test.go` (mechanical `Apply(..., enveloped)` signature fix on
10 call sites + new REQ-9/10/11 invariant tests). `internal/session/machine_test.go`
needed no changes (confirmed clean by the daemon-impl handoff and independently by
`go vet`).

Tests created/rewritten: 30 (`settings_test.go`) + 3 new (`settings_shell_test.go`) + 8
new top-level invariant tests, several table-driven with 4–28 subtests each
(`manager_test.go`) | Passing: all (245 `--- PASS` lines across the three touched
packages, `go test ./...` green) | Failing: 0

`go build ./...` → exit 0. `gofmt -l` on every touched file → empty. `go vet ./...` →
silent. `make lint` → "0 issues". `make test` → all packages `ok`.

## Tests

| File | Test Name | What It Tests | Status |
|------|-----------|---------------|--------|
| `internal/claudecode/settings_test.go` | `TestMergeSettings_FreshFileRegistersCommandEntryOnAllElevenEvents` | D1: fresh file gets one `type:"command"` entry per event, all 11 events, timeout 2; D5 (no `allowedHttpHookUrls` key) | pass |
| same | `TestMergeSettings_FreshFileHasNoHTTPEntry` | D2 fresh-file half | pass |
| same | `TestMergeSettings_OutputContainsNoTokenOrURL` | D8/INV-6: no token, no `http://`/`https://`/`/ingest/` substring, space+quote-bearing paths | pass |
| same | `TestMergeSettings_MigrationFixture_ExactlyOneMusterEntryPerEventNoLegacySurvives` | D2/D3/Edge Case 1: verbatim pre-plan fixture (10 http entries, bare+quoted legacy `hook-sessionstart.sh`, foreign http+command, `allowedHttpHookUrls`) → exactly one Muster command entry/event, no legacy survives | pass |
| same | `TestMergeSettings_MigrationFixture_ForeignHTTPEntryOnARemoteHostSurvives` | D6/Edge Case 2: foreign http hook on a remote host survives the migration | pass |
| same | `TestMergeSettings_StripsMustersURLFromAllowedListPreservingForeign` | D4/Edge Case 3 variant 1 | pass |
| same | `TestMergeSettings_DeletesAllowedHttpHookUrlsKeyWhenOnlyMustersURLRemains` | D4/Edge Case 3 variant 2 | pass |
| same | `TestMergeSettings_NeverAddsAllowedHttpHookUrlsKey` (2 subtests) | D5 general form | pass |
| same | `TestMergeSettings_CalledTwiceProducesByteIdenticalOutput` | D7 fresh-file idempotency | pass |
| same | `TestMergeSettings_MigrationFixtureIsIdempotentAfterFirstMerge` | D7 migration-fixture idempotency | pass |
| same | `TestMergeSettings_PreservesKeysMusterDoesNotOwn` | REQ-4/Edge Case 9 + REQ-2 (no URL added) | pass |
| same | `TestMergeSettings_ForeignCommandHookOnAMusterOwnedEventSurvives` | review Critical 2/Edge Case 9 | pass |
| same | `TestMergeSettings_ForeignHTTPEntryOnNonLoopbackHostWithMusterPathShapeSurvives` | review cycle 2 Major 2 | pass |
| same | `TestMergeSettings_RejectsInvalidJSON` / `RejectsInvalidHooksShape` / `RejectsInvalidAllowedHttpHookUrlsShape` / `EmptyExistingBehavesLikeNilExisting` | error/edge paths | pass |
| same | `TestShellQuote` (5 subtests) | quoting unit | pass |
| same | `TestMergeSettings_CommandFieldIsShellQuotedForSpaceBearingPath` | D1/REQ-1 across all 11 events + statusLine | pass |
| same | `TestMergeSettings_ShellQuoteEscapesSingleQuoteAndStaysIdempotent` | embedded-quote escaping + idempotency | pass |
| same | `TestIsMusterEntry_RecognizesHookStatusLineAndLegacyCommandsBothForms` (6 subtests) | HookCommand/StatusLineCommand/LegacyCommands, bare+quoted | pass |
| same | `TestIsMusterEntry_LegacyRecognitionIsExactPathNotBasename` | Implementation Notes guard: exact path only, never basename | pass |
| same | `TestMergeSettings_ForeignCommandMatchingStatusLinePathIsTreatedAsMusters` | Edge Case 4 | pass |
| same | `TestIsMusterEntry_EmptyConfiguredPathsNeverMatchAnEmptyForeignCommand` | empty-path guard | pass |
| same | `TestMergeSettings_ForeignCommandHookOnSessionStartSurvives` | REQ-3/D6 guard (name preserved verbatim per plan's own text) | pass |
| same | `TestWriteWrapperScripts` | D9/REQ-5/6/7/15: paths, mode 0700, timeout, envelope fields | pass |
| same | `TestWriteWrapperScripts_RemovesPreExistingLegacyScript` | D9 removal half | pass |
| same | `TestWriteWrapperScripts_MissingLegacyScriptIsNotAnError` | Edge Case 14 converse | pass |
| same | `TestWriteEnvelopeScript_EarlyExitIsTheFirstNonCommentLine` | D10 | pass |
| same | `TestWriteEnvelopeScript_NeverWritesToStdoutOrStderr` | D29 static check | pass |
| `internal/server/settings_shell_test.go` | `TestWrapperScriptsShellRoundTrip` | D6/D6a/D6b/D6c/REQ-5/REQ-9 real `sh -c`→curl→ingest round trip, now asserting REQ-9 binding too | pass |
| same | `TestWrapperScriptsShellRoundTrip_UnmanagedSessionProducesZeroRequests` | D12/REQ-6: no `MUSTER_SESSION` → zero HTTP requests (counted), zero new event rows, silent exit 0 | pass |
| same | `TestWrapperScriptsShellRoundTrip_DaemonUnreachableExitsSilentlyAndFast` | D13/REQ-7: closed loopback port → exit 0, empty stdout/stderr, fails fast (< 3s, curl `--max-time 2`) | pass |
| `internal/server/sessions_test.go` | (2 literals fixed) `TestLauncher_CorruptSettingsFileRefusesAndRollsBackTheSessionRow`, `TestLauncher_SuccessfulLaunchEndToEnd` | mechanical: `sessionLauncher{hookURL,statusURL,sessionStartScript}` → `{hookScript,legacyScripts}` | pass |
| `internal/session/manager_test.go` | (10 call sites) mechanical `Apply(..., enveloped)` fix | pre-existing behavior preserved (all pass unchanged) | pass |
| same | `TestApply_INV1_BindingMapConsistencyAcrossStatesAndInputClasses` (28 subtests: 7 source rows × 4 input classes) | D14/INV-1 from every displayed state + the ended row, crossed against same-id/diff-id/never-bound/raw | pass |
| same | `TestApply_NeverBoundSessionBindsWithNoTransitionThenAppliesItsOwnEvent` | REQ-9's precise "bind causes no transition" clause (via `KindCompaction`, a no-transition kind) | pass |
| same | `TestApply_EnvelopedSameBoundIDNeverRebindsEvenForClearDeathHint` | Edge Case 6 | pass |
| same | `TestApply_INV2_RebindResetsContextAndCompactionsBeforeItsOwnRowApplies` (12 subtests: 6 states × 2 triggers) | D15/INV-2 | pass |
| same | `TestApply_INV3_RawEventNeverBindsFromAnyState` (6 subtests) | D16/INV-3 | pass |
| same | `TestApplyStatus_INV4_NeverTouchesBindingOrStateFromAnyState` (6 subtests) | D16/INV-4 | pass |
| same | `TestApply_INV7_RebindOnOneSessionLeavesABystanderUntouched` | D17/INV-7 (multi-session substrate lesson) | pass |
| same | `TestApply_RebindThenApplyPersistsAndBroadcastsExactlyOnce` | D18 (broadcast count directly; persist count inferred — see note below) | pass |

## Notes on scope / judgment calls

- **D18's "single persist" half is inferred, not counted.** `internal/session.Manager`
  takes a concrete `*store.Store`, not an interface, so there is no seam to install a
  call-counting fake without editing production code (out of scope for this agent). The
  test asserts the observable proxy the codebase already uses elsewhere for this kind of
  claim (`upsertsRecorder` broadcast-count deltas, e.g. the pre-existing
  `TestApply_RoutesByClaudeSessionIDAndBroadcasts`): broadcast count increases by exactly
  1, and the persisted row already carries both the rebind reset and the triggering
  event's own transition — consistent with, but not a direct proof of, exactly one
  `UpdateSession` call. Reading `internal/session/manager.go`'s `Apply` (single `row :=
  sessionToRow(sess)` / `m.store.UpdateSession(ctx, row)` / `m.broadcast(snapshot)` after
  the branch, not inside it) confirms there is exactly one call site on this path.
- **`test/canary/canary_test.go`** (D25's `TestCommandHooksCarryEnvelopeOnEveryEvent`
  stub) is daemon-impl/track-owned per the plan's own Affected Files note ("test agents
  never edit it here because it is a harness stub, not a unit test of plan logic") — left
  untouched, verified present via the D25 grep above.
- **`internal/session/machine_test.go`** needed no changes: `applyBind`'s
  `KindClearRebind` handling (which `Manager.Apply`'s new rebind branch reuses) was
  already exhaustively tested pre-plan (rebind from every state, resume-bind from every
  state, id-change escalation) — the new coverage this plan needed lives at the
  `Manager.Apply` level (the `enveloped bool` branch itself), not inside the state
  machine's own transition table, so it went into `manager_test.go`.
- **`make e2e` (E1)** was not run — that gate belongs to the `e2e-validate` pipeline
  step, not daemon-tests; `internal/server`'s own test suite (which exercises the real
  ingest→manager→store chain via `httptest`) is green.

## Test Run Output

```
$ go build ./...
(exit 0)

$ gofmt -l internal/claudecode/settings_test.go internal/server/settings_shell_test.go \
    internal/server/sessions_test.go internal/session/manager_test.go
(empty)

$ go vet ./...
(silent)

$ make lint
golangci-lint run
0 issues.

$ make test
go test ./...
ok  	github.com/Zalaras/muster/cmd/musterd	3.113s
ok  	github.com/Zalaras/muster/internal/claudecode	1.062s
?   	github.com/Zalaras/muster/internal/claudecode/claudecodetest	[no test files]
ok  	github.com/Zalaras/muster/internal/gitutil	(cached)
ok  	github.com/Zalaras/muster/internal/server	(cached)
ok  	github.com/Zalaras/muster/internal/session	(cached)
ok  	github.com/Zalaras/muster/internal/store	(cached)
ok  	github.com/Zalaras/muster/internal/termbridge	(cached)
ok  	github.com/Zalaras/muster/internal/tmux	(cached)
ok  	github.com/Zalaras/muster/internal/usage	(cached)
?   	github.com/Zalaras/muster/test/rig/capture	[no test files]
?   	github.com/Zalaras/muster/test/rig/failproxy	[no test files]

$ (plan's D22/D23/D24/D25/D30 one-liners, from the project root)
D22 ! rg -n "hook_event_name" cmd/ internal/ --glob '!internal/claudecode/**'   → exit 0 (pass)
D23 ! rg -n "shellQuote|'\\''" cmd/ internal/server/ internal/session/          → exit 0 (pass)
D24 ! rg -n "hookURL|statusURL" internal/server/sessions.go                    → exit 0 (pass)
D25 rg -q "func TestCommandHooksCarryEnvelopeOnEveryEvent" test/canary/canary_test.go → exit 0 (pass)
D30 ! go list -deps ./internal/claudecode | rg -q "internal/(usage|store)"     → exit 0 (pass)
```

## Fix History

One test bug found and fixed during self-correction (not an implementation bug):
`TestApply_INV2_RebindResetsContextAndCompactionsBeforeItsOwnRowApplies`'s
"planning"/"UserPromptSubmit-like" subtest initially failed —
`assert.Equal(t, StateWorking, final.State)` got `planning` instead. Root cause: the
trigger's `StateInput{Kind: KindTurnActivity}` carried no `PermissionMode`, so
`latchPermissionMode`'s "never resets the latch" rule (REQ-9 of an earlier plan,
correctly implemented) left the session's permission mode at whatever the "planning"
source-state setup had latched (`"plan"`), and `activeState()` correctly returned
`planning` again — `applyBind`/`KindClearRebind` never resets the permission-mode latch
(by design: it's a CLI launch setting, not conversation state, so `/clear` doesn't touch
it). Fixed by making the trigger explicit — `PermissionMode: strPtr("default")` — so the
expected end state is deterministic regardless of what the source-state setup latched.

## Fix Attempt 1

**Verdict**: pass

**Scope**: review.md cycle 1, Task A (regression test for Critical 1 / Edge Case 6a,
decided as Option B — monotonic rebind, `decisions/monotonic-rebind/decision.md`) and
Minor 2 (D18's "single persist" half). Both are `[daemon-tests]`-tagged; no
implementation file touched.

### Task A — permanent regression test for the monotonic-rebind guard

Added `TestApply_MonotonicRebindGuard_ReorderedStragglerNeverRebindsBackwards` to
`internal/session/manager_test.go`, placed directly after
`TestApply_INV2_RebindResetsContextAndCompactionsBeforeItsOwnRowApplies` (its mirror
case) per daemon-implementation.md's `## Fix Attempt 1` handoff. A shared
`setUpLiveNewConversation` closure drives the reviewer's exact repro once: bind
`claude-old` → one `PreCompact` on `claude-old` → `SessionStart(clear)` to `claude-new`
(`KindClearRebind`) → `claude-new` goes `working` (`KindTurnActivity`,
`PermissionMode:"default"`) → a status post supplies a context gauge → `claude-new`
compacts once more (sanity checkpoint: `State==working`, `Compactions==1`,
`Context!=nil`). Two subtests then each apply one reordered straggler naming
`claude-old`, which by this point `byClaude` maps back to *this* session (not the
current `ClaudeSessionID`):

1. **`SessionEnd(reason:"clear")` (`KindClearDeathHint`)** — the reviewer's exact
   trigger. Asserts `ClaudeSessionID` stays `"claude-new"`, `State` stays `working`
   (not reset to `started`), `Compactions` stays `1` (not zeroed), `Context.UsedPct`
   unchanged (not reset to `nil`), `Alive` stays `true` (confirms it's still read as a
   non-death-hint), `assertBindingConsistent` holds, and `Resolve("claude-old")` still
   resolves to this session (proving the guard's precondition — `byClaude` retaining the
   stale id — actually holds).
2. **A non-death-hint straggler (`KindTurnActivity`, the `PostToolUse` shape, carrying
   `PermissionMode:"acceptEdits"`)** — covers the review's broader "any late event
   naming the previous conversation" language, not just the `SessionEnd(clear)` example.
   Asserts the straggler's *own* row still applies (`PermissionMode` actually moves to
   `"acceptEdits"` — a plain no-op could not produce that) while `ClaudeSessionID`,
   `State`, `Compactions` and `Context` are all left exactly as the guard requires.

Both subtests also assert **exactly one broadcast** (via the existing `upsertsRecorder`
helper, counted immediately before/after the straggler's own `Apply` call) and read the
row back with `st.GetSession` to confirm the **persisted** content already reflects the
non-rebind — not just the in-memory snapshot `Apply` returns. This extends D18's
single-persist/broadcast guarantee onto the new backward-guard path (see Minor 2 below).

**Forward cases re-confirmed still green** (no changes needed — they already existed
and already cover what the task asked me to re-verify):
- Edge Case 4 (forward rebind onto a genuinely new id) —
  `TestApply_INV1_.../enveloped_different_id` (all 7 source rows) and
  `TestApply_INV2_RebindResetsContextAndCompactionsBeforeItsOwnRowApplies` (12
  subtests, forward rebind *does* reset).
- Edge Case 5 (lost initial `SessionStart`, never-bound bind with no transition) —
  `TestApply_NeverBoundSessionBindsWithNoTransitionThenAppliesItsOwnEvent` and
  `TestApply_INV1_.../enveloped_never_bound`.
- Edge Case 7 (two-session bystander) —
  `TestApply_INV7_RebindOnOneSessionLeavesABystanderUntouched`.
- Edge Case 6 (same-id `SessionEnd(reason:"clear")`, not a death hint, no rebind because
  the id matches) — `TestApply_EnvelopedSameBoundIDNeverRebindsEvenForClearDeathHint`,
  unaffected since it never reaches the different-id branch at all.
- **Edge Case 6a** (this fix wave's addition, plan.md line 151) is now covered by the
  new test above.

**Regression check — proved the new test actually catches the bug it's named for.**
Temporarily reverted the guard in `internal/session/manager.go` (replaced the
conditional `if owner, known := m.byClaude[...]; !known || owner != musterSessionID { ... }`
back to the old unconditional `applyBind` call), ran the new test, restored the file from
a backup, and confirmed `go build` / `go vet` / `gofmt -l` were clean afterward (i.e. the
revert-and-restore left no diff beyond the original implementation). Failure output with
the guard reverted:

```
$ go test ./internal/session/... -run TestApply_MonotonicRebindGuard -v
...
    --- FAIL: .../reordered_SessionEnd(reason=clear)_death_hint_for_the_old_id
        Error: Not equal: expected: "working" actual: "started"
        Messages: no rebind means no reset-to-started
        Error: Not equal: expected: 1 actual: 0
        Messages: no rebind means the compaction counter is not zeroed
        Error: Expected value not to be nil.  [Context]
    --- FAIL: .../reordered_non-death-hint_PostToolUse_straggler...
        Error: Not equal: expected: "claude-new" actual: "claude-old"
        Messages: the reordered straggler for a left-behind id must not rebind backwards
        Error: Not equal: expected: 1 actual: 0
        Error: Expected value not to be nil.  [Context]
FAIL
```

This is the same shape as the review's reported trace (`claude-new -> claude-old`,
`working -> started`, `1 -> 0`). With the guard restored, both subtests pass (see Test
Run Output below).

### Minor 2 — D18's single-persist assertion

Per the fix-mode instructions, no production seam was added (the reviewer explicitly
said not to, and `Manager` still takes a concrete `*store.Store`). Instead, tightened
coverage the way the instructions suggested: both new Task A subtests above assert the
**persisted row's content** after the straggler case (`st.GetSession` →
`State`/`Compactions`/`ClaudeSessionID`/`PermissionMode`), plus a broadcast-count check
scoped to just the straggler's own `Apply` call (`before := len(rec.all())` immediately
before it, `assert.Len(t, rec.all(), before+1, ...)` immediately after) — the same
pattern `TestApply_RebindThenApplyPersistsAndBroadcastsExactlyOnce` already used for the
forward-rebind path, now also applied to the backward-guard path. The pre-existing
`TestApply_RebindThenApplyPersistsAndBroadcastsExactlyOnce` itself was left unchanged —
it already does this correctly for the case it covers, and the reviewer's own text says
a fix wave isn't warranted for the underlying seam gap. Nothing here required an
implementation change.

### Verification commands run

```
$ go build ./...          → exit 0
$ go vet ./...             → exit 0 (silent)
$ gofmt -l .               → (empty)
$ go test ./internal/session/... -run TestApply_MonotonicRebindGuard -v
--- PASS: TestApply_MonotonicRebindGuard_ReorderedStragglerNeverRebindsBackwards (0.02s)
    --- PASS: .../reordered_SessionEnd(reason=clear)_death_hint_for_the_old_id (0.01s)
    --- PASS: .../reordered_non-death-hint_PostToolUse_straggler... (0.01s)
PASS

$ go test -count=1 ./...
ok  	github.com/Zalaras/muster/cmd/musterd	6.177s
ok  	github.com/Zalaras/muster/internal/claudecode	0.805s
?   	github.com/Zalaras/muster/internal/claudecode/claudecodetest	[no test files]
ok  	github.com/Zalaras/muster/internal/gitutil	2.335s
ok  	github.com/Zalaras/muster/internal/server	11.641s
ok  	github.com/Zalaras/muster/internal/session	3.161s
ok  	github.com/Zalaras/muster/internal/store	3.177s
ok  	github.com/Zalaras/muster/internal/termbridge	5.730s
ok  	github.com/Zalaras/muster/internal/tmux	6.287s
ok  	github.com/Zalaras/muster/internal/usage	4.290s
?   	github.com/Zalaras/muster/test/rig/capture	[no test files]
?   	github.com/Zalaras/muster/test/rig/failproxy	[no test files]

$ make lint
golangci-lint run
0 issues.
```

### Files touched this wave

- `internal/session/manager_test.go` — added
  `TestApply_MonotonicRebindGuard_ReorderedStragglerNeverRebindsBackwards` (2 subtests).
  No other test file needed changes (this fix wave's implementation change,
  `internal/session/manager.go`'s guard, required no signature/field changes).
