# Daemon Tests: issue-capture

**Plan**: issue-capture
**Verdict**: pass

## Summary

Tests created: 94 top-level `Test*` functions (28 additional table-driven subtests) | Passing: 94/94 (122/122 including subtests) | Failing: 0

Two new files:
- `internal/ghissue/ghissue_test.go` — 21 tests for the GitHub client package (D5/D9).
- `internal/server/issue_test.go` — 73 tests for the capture store, markdown renderer,
  allowlisted snapshot builder, and the two new HTTP handlers (D4/D10/D11/D12).

No implementation code was changed. `go build ./...`, `go vet ./...`, `gofmt -l .`,
`make lint` and `make test` (whole tree, `-count=1`) all pass; `go test -race` on both
new packages passes with no data races.

## Tests

### `internal/ghissue/ghissue_test.go`

| Test Name | What It Tests | Status |
|---|---|---|
| `TestGhCLITokenReader_Success_ParsesTrimmedStdoutAndPassesExpectedArgs` | happy path parses/trims stdout, calls `gh auth token` via the injected seam only | pass |
| `TestGhCLITokenReader_GhNotOnPath_ReturnsErrAuthFailed` | `exec.LookPath` failure → `*ErrAuthFailed`, `run` never called | pass |
| `TestGhCLITokenReader_NonZeroExit_ReturnsErrAuthFailedWithTrimmedStderr` | non-zero exit surfaces trimmed stderr | pass |
| `TestGhCLITokenReader_NonZeroExitEmptyStderr_UsesGenericMessage` | empty stderr falls back to a generic message | pass |
| `TestGhCLITokenReader_EmptyToken_ReturnsErrAuthFailed` | whitespace-only stdout → empty-token error | pass |
| `TestGhCLITokenReader_AppliesFiveSecondTimeout` | exec ctx carries a 5s deadline (Implementation Notes) | pass |
| `TestGhCLITokenReader_RespectsParentContextCancellation` | caller cancellation propagates into the exec seam | pass |
| `TestGhCLITokenReader_StdoutNeverEchoedIntoTheErrorEvenOnFailure` | D9: stdout (where the token lives) never lands in the error even on a non-zero exit | pass |
| `TestFileTokenReader_Success` | trims file contents | pass |
| `TestFileTokenReader_MissingFile_ReturnsErrAuthFailed` | missing file → `*ErrAuthFailed` | pass |
| `TestFileTokenReader_EmptyFile_ReturnsErrAuthFailed` | whitespace-only file → `*ErrAuthFailed` | pass |
| `TestFileTokenReader_ReReadsOnEveryCall` | no caching across calls | pass |
| `TestClient_CreateIssue_Success_PostsExpectedHeadersPathAndBody` | POST path, `Authorization: Bearer`, `Accept`, `X-GitHub-Api-Version`, JSON body | pass |
| `TestClient_CreateIssue_TokenReaderFailure_NeverHitsNetworkAndReturnsErrUnwrapped` | auth failure short-circuits before any request; error returned unwrapped | pass |
| `TestClient_CreateIssue_GitHubNon2xxWithMessage_ReturnsErrPostFailedWithStatusAndMessage` | 403 + JSON `message` → `*ErrPostFailed` with status+message | pass |
| `TestClient_CreateIssue_GitHubNon2xxNonJSONBody_ReturnsErrPostFailedWithStatusOnly` | 500 + non-JSON body → status-only message | pass |
| `TestClient_CreateIssue_TransportError_ReturnsErrPostFailed` | closed server → transport-level `*ErrPostFailed` | pass |
| `TestClient_CreateIssue_2xxUnparseableBody_ReturnsErrPostFailedMaybeCreatedTrue` | 2xx + unparseable body → `MaybeCreated: true` (Edge Case 9) | pass |
| `TestClient_CreateIssue_DerivesRequestTimeoutFromCallerContext` | a pre-cancelled caller ctx aborts the request | pass |
| `TestCreateIssue_ErrorMessagesNeverContainTheToken` (9 subtests) | D9 across every INV-3 failure path: GitHub 401/403/404/500, unparseable 2xx, transport error, `gh` missing, non-zero exit with token-shaped stdout, empty token | pass |
| `TestRunCommand_HarmlessSmokeTestNeverUsedByGhCLITokenReaderTests` | documents no test above executes the real `gh` binary | pass |

### `internal/server/issue_test.go`

**captureStore (REQ-15, D10, Edge Case 12)**

| Test Name | What It Tests | Status |
|---|---|---|
| `TestCaptureStore_PutAndReserve_RoundTrip` | basic put/reserve | pass |
| `TestCaptureStore_Reserve_UnknownIDReturnsNil` | unknown id | pass |
| `TestCaptureStore_Reserve_ConsumedReturnsNil` | consumed capture can't be reused | pass |
| `TestCaptureStore_Reserve_InFlightReturnsNil` | a second concurrent reservation fails | pass |
| `TestCaptureStore_Reserve_ExpiredReturnsNil` | TTL boundary, expired side | pass |
| `TestCaptureStore_Reserve_JustUnderTTLStillUsable` | TTL boundary, just-inside side | pass |
| `TestCaptureStore_Release_AllowsReReserveAfterFailure` | REQ-10: release re-enables reservation | pass |
| `TestCaptureStore_Consume_ClearsInFlightAndPermanentlyBlocksReuse` | consume is permanent | pass |
| `TestCaptureStore_Put_EvictsOldestByCapturedAtWhenOverCapacity` | 9th capture evicts the oldest by `capturedAt`, not insertion order | pass |
| `TestRandomCaptureID_Produces32HexCharsAndIsNotConstant` | id shape/uniqueness | pass |

**noteSection / composeIssueBody**

| Test Name | What It Tests | Status |
|---|---|---|
| `TestNoteSection_EmptyAndWhitespaceOnlyReturnEmptyString` | empty/whitespace → `""` | pass |
| `TestNoteSection_TrimsAndWrapsInHeading` | trim + `## What happened` wrap | pass |
| `TestNoteSection_NormalizesCRLFToLF` | CRLF → LF | pass |
| `TestComposeIssueBody_EmptyNoteOmitsHeadingEntirely` | empty note omits the heading | pass |
| `TestComposeIssueBody_NoteThenSnapshotMarkdown_NoTrailingNewline` | composition order, no trailing `\n` | pass |

**renderSnapshotMarkdown (plan "## The issue body")**

| Test Name | What It Tests | Status |
|---|---|---|
| `TestRenderSnapshotMarkdown_DashboardScope_OnlyFirstFourRowsNoSessionKey` | dashboard scope emits only the first 4 rows, no `session` JSON key | pass |
| `TestRenderSnapshotMarkdown_FooterIsConstantString` | `<sub>` footer byte-for-byte | pass |
| `TestRenderSnapshotMarkdown_JSONFenceIsFourBackticks` | 4-backtick fence (Edge Case 10) | pass |
| `TestRenderSnapshotMarkdown_SessionScope_RowOrderAndAllConditionalRowsPresent` | exact row order with every conditional row present | pass |
| `TestRenderSnapshotMarkdown_AttentionRowAbsentWhenNil` | conditional row | pass |
| `TestRenderSnapshotMarkdown_FailureRowAbsentWhenNil` | conditional row | pass |
| `TestRenderSnapshotMarkdown_EndedRowAbsentWhenEndedAtNil` | conditional row | pass |
| `TestRenderSnapshotMarkdown_EndedRowPresentAfterAliveRowWhenEndedAtSet` | ended row position (between alive and attention) | pass |
| `TestRenderSnapshotMarkdown_UnknownRendering` (4 subtests) | REQ-12: `context`/`model`/`claudeCode.installed`/`events` all render literal `unknown`/`none`, never 0 or blank | pass |
| `TestRenderSnapshotMarkdown_ClaudeCodeDriftFalse_NeverGuessesNoDrift` | `drift:false` → no suffix, never "no drift" | pass |
| `TestRenderSnapshotMarkdown_ClaudeCodeDriftTrue_SuffixPresent` | `drift:true` → ` · drift` suffix | pass |
| `TestRenderSnapshotMarkdown_EscapesPipeAndNewlineInValueCells` | Edge Case 11: `\|` and newline escaping | pass |
| `TestRenderSnapshotMarkdown_EscapesCRLFInValueCells` | CRLF collapses to a space in a value cell | pass |
| `TestRenderSnapshotMarkdown_JSONBlockIsTwoSpaceIndentedStructOrder` | JSON block matches `json.MarshalIndent(snap, "", "  ")` | pass |
| `TestRenderSnapshotMarkdown_SessionScope_FullyPopulated_MatchesExpectedFormat` | byte-exact full render (self-consistent scenario; see Decisions) | pass |

**buildIssueSnapshot — D4, INV-1, REQ-12, Edge Cases 16/17**

| Test Name | What It Tests | Status |
|---|---|---|
| `TestBuildIssueSnapshot_HardExclusionsNeverLeak_AcrossEveryReachableState` (6 subtests) | INV-1 across all six states (`started`/`planning`/`working`/`needs_input`/`failed`/`idle`), Attention/Failure only where the state machine would set them | pass |
| `TestBuildIssueSnapshot_HardExclusionsNeverLeak_AliveWithNoEndedAt` | INV-1, alive:true/endedAt:nil | pass |
| `TestBuildIssueSnapshot_HardExclusionsNeverLeak_DeadSessionWithEndedAt` | INV-1, alive:false/endedAt:set | pass |
| `TestBuildIssueSnapshot_HardExclusionsNeverLeak_ClaudeSessionUnbound` | INV-1, unbound claude session | pass |
| `TestBuildIssueSnapshot_HardExclusionsNeverLeak_ContextNil` | INV-1, nil context + REQ-12 `unknown` | pass |
| `TestBuildIssueSnapshot_HardExclusionsNeverLeak_TitleAndLastActivityNil` | INV-1, nil Title/LastActivity | pass |
| `TestBuildIssueSnapshot_UnboundSession_EventsAllZeroNullEmpty` | Edge Case 17: `firstSeq`/`lastSeq` null, `count:0`, `recentTypes:[]` (never null) | pass |
| `TestBuildIssueSnapshot_EventsSummaryReflectsLast10RoutedEvents` | 14 routed events → last 10, oldest-first | pass |
| `TestBuildIssueSnapshot_LastReceivedAtIsPlainRFC3339NoFraction` | daemon-impl's reformat decision (`RFC3339Nano` stored → plain `RFC3339` in the snapshot) | pass |
| `TestBuildIssueSnapshot_DashboardScope_KeySetExactly` | exact 13-key set, scope `dashboard` | pass |
| `TestBuildIssueSnapshot_SessionScope_KeySetMatchesAllowlistExactly` | **D4**: fully-populated session marshals to exactly the 35 allowlisted keys, no more/less, plus a negative check that no hard-excluded field name (`title`, `directory`, `lastActivity`, `claudeSessionId`, `usageModel`, …) appears as a key anywhere | pass |

**HTTP: POST /api/issue/captures**

| Test Name | What It Tests | Status |
|---|---|---|
| `TestHandleCreateCapture_RequiresCookie` | 401 without cookie | pass |
| `TestHandleCreateCapture_DisabledWhenIssueAPIURLEmpty` | REQ-14/Edge Case 14: empty `-issue-api-url` → 404 `not_found` | pass |
| `TestHandleCreateCapture_InvalidJSONBodyIs400` | malformed body | pass |
| `TestHandleCreateCapture_AbsentBodyDefaultsToDashboardScope` | no body → dashboard scope, not a decode error | pass |
| `TestHandleCreateCapture_UnknownSessionIdIs404` | unknown `sessionId` → 404 `unknown_session` | pass |
| `TestHandleCreateCapture_DashboardScope_Returns201WithSnapshotAndMarkdown` | 201 shape | pass |
| `TestHandleCreateCapture_SessionScope_Returns201WithSnapshotAndMarkdown` | 201 shape with a real session | pass |
| `TestHandleCreateCapture_EachCallReturnsDistinctCaptureId` | id uniqueness at the HTTP layer | pass |
| `TestHandleCreateCapture_D12_WithThreeSessionsPresent_ScopedCaptureLeaksNoBystanderData` | **D12**: 3 sessions present, scoped capture leaks no bystander `tmuxTarget`/`state`/`context`; dashboard counts are the only trace | pass |

**HTTP: POST /api/issues**

| Test Name | What It Tests | Status |
|---|---|---|
| `TestHandleCreateIssue_RequiresCookie` | 401 without cookie | pass |
| `TestHandleCreateIssue_DisabledWhenIssueAPIURLEmpty` | disabled feature | pass |
| `TestHandleCreateIssue_InvalidJSONBodyIs400` | malformed body | pass |
| `TestHandleCreateIssue_MissingCaptureIdIs400` | missing `captureId` | pass |
| `TestHandleCreateIssue_TitleValidation` (4 subtests) | missing/empty/whitespace-only/201-char title, and that none of these ever reach GitHub | pass |
| `TestHandleCreateIssue_TitleExactly200CharsIsAccepted` | boundary | pass |
| `TestHandleCreateIssue_NoteOver8000CharsIs400` | note length limit | pass |
| `TestHandleCreateIssue_UnknownCaptureIdIs409CaptureExpired` | unknown id | pass |
| `TestHandleCreateIssue_ExpiredCaptureIs409CaptureExpired` | Edge Case 2, white-box TTL manipulation | pass |
| `TestHandleCreateIssue_D10_ConsumedCaptureIsRejectedOnSecondPost` | **D10**: second POST with a consumed `captureId` → 409, 0 additional upstream requests | pass |
| `TestHandleCreateIssue_ConcurrentDoublePost_SecondIsRejected` | Edge Case 12: a genuine concurrent double POST (fake GitHub blocks the first in flight) — exactly one request reaches GitHub, race-clean under `-race` | pass |
| `TestHandleCreateIssue_CaptureNotConsumedOnFailure_RetryWorksWithoutRecapture` | REQ-10: failed post doesn't consume; retry with the same id succeeds | pass |
| `TestHandleCreateIssue_Success_PostsComposedBodyAndReturnsNumberUrlRepo` | full success path; posted body equals `composeIssueBody(note, snapshotMarkdown)`; response echoes repo | pass |
| `TestHandleCreateIssue_NoteCRLFIsNormalizedInPostedBody` | CRLF normalization at post time | pass |
| `TestHandleCreateIssue_Success_LogsNumberUrlScopeAndLengthsNeverTitleOrNoteText` | REQ-16: log carries number/url/scope/lengths, never title/note text | pass |
| `TestHandleCreateIssue_AuthFailure_Returns502IssueAuthFailed` | empty token file → 502 `issue_auth_failed`, 0 requests to GitHub | pass |
| `TestHandleCreateIssue_AuthFailure_CaptureIsNotConsumed` | REQ-10 for the auth-failure path specifically | pass |
| `TestHandleCreateIssue_PostFailure_403WithMessage_Returns502WithGitHubMessage` | Edge Case 6 | pass |
| `TestHandleCreateIssue_PostFailure_404NamesConfiguredRepo` | Edge Case 7: repo name visible in the request path | pass |
| `TestHandleCreateIssue_PostFailure_2xxUnparseableBody_Returns502MentioningMayHaveBeenCreated` | Edge Case 9 | pass |
| `TestHandleCreateIssue_TransportFailure_Returns502` | Edge Case 8 | pass |
| `TestHandleCreateIssue_TokenNeverAppearsInResponseOrLogOnAnyFailurePath` (5 subtests) | INV-3 at the full HTTP-handler level (401/403/404/500/unparseable 2xx): neither response body nor log line ever contains the token | pass |
| `TestHandleCreateIssue_D11_CaptureIsImmutable_FiledBodyReflectsPreTransitionState` | **D11**/INV-4: capture then a state transition (`working`→`failed`) then file — posted body still shows `working`, never the failure row | pass |

## Decisions

- **The plan's pinned "## The issue body" session-scope example is internally
  inconsistent** (`events` shows `count: 47` but `recentTypes` lists only 4 entries,
  which the real algorithm — last `min(count, 10)` types — could never produce) and is
  illustrative documentation, not a literal fixture. `TestRenderSnapshotMarkdown_SessionScope_FullyPopulated_MatchesExpectedFormat`
  reproduces the same row labels/order/formatting with a self-consistent scenario (4
  routed events, matching `recentTypes`) instead of trying to force the doc's numbers.
  The row text is hardcoded in the test; only the JSON `<details>` block and the
  non-deterministic `lastReceivedAt` timestamp are pulled from the actual computed
  snapshot, so the test still exercises row order/formatting/escaping precisely.
- **`assertNoHardExclusionLeak`'s ClaudeSessionID check is skipped when the id is
  empty** — `assert.NotContains(s, "")` is always false (every string "contains" the
  empty string), so asserting it for the deliberately-unbound-session test case would
  have been a vacuous/broken check, not a real assertion. Caught and fixed during this
  run (see Test Run Output below for the original failure).
- **The `TestRenderSnapshotMarkdown_UnknownRendering/claudeCode...` subtest asserts the
  exact row text, not a blanket "the word 'drift' appears nowhere"** — the `<details>`
  JSON block legitimately serializes the struct field `"drift": true` regardless of
  what the table row displays, so a whole-document substring check for "drift" is wrong
  when `ClaudeCode.Installed` is nil but `Drift` is still non-nil. Also caught and fixed
  during this run.
- **`TestHandleCreateIssue_ConcurrentDoublePost_SecondIsRejected` avoids `time.Sleep`
  synchronization**: it fires the first POST in a goroutine, uses `require.Eventually`
  to wait until the fake GitHub has actually recorded the request (proving the first
  request's `reserve()` succeeded and it is now blocked in the upstream call), then
  fires the second POST *synchronously* on the test goroutine — since the second
  request's `reserve()` call is a fast in-memory mutex operation that must return 409
  before ever reaching GitHub, no further synchronization is needed. Verified race-clean
  under `go test -race`.
- **No `cmd/musterd` flag-default tests were added** for `-issue-repo`/`-issue-api-url`/
  `-issue-token-file`, matching the existing convention: `-usage-api-url`/
  `-usage-token-file` (the precedent this plan explicitly mirrors) have no analogous
  `main_test.go` coverage either — flag wiring is covered by the D7 automated grep check
  and code review, not a unit test.
- **No migration round-trip test was added** for `EventSummary` — CLAUDE.md/conventions
  rule out testing what SQLite guarantees; `EventSummary` is exercised indirectly by
  every `buildIssueSnapshot` test that calls `insertEvents` (bounds, count, last-10,
  oldest-first ordering, zero-events case) and directly informs the D4/Edge-Case-17/
  events-ordering tests above.

## Test Run Output

Two test bugs were found and fixed during this run (both self-corrected, no
implementation changes):

```
=== RUN   TestRenderSnapshotMarkdown_UnknownRendering/claudeCode_installed_nil,_no_drift_suffix_even_when_drift_is_non-nil
    issue_test.go:481:
        Error:  "...\"claudeCode\":{\"pinned\":\"2.1.246\",\"installed\":null,\"drift\":true}...` should not contain "drift"
--- FAIL: TestRenderSnapshotMarkdown_UnknownRendering (0.00s)
```
Fixed by asserting the exact row text instead of a whole-document substring check (the
`<details>` JSON block legitimately contains the field name "drift").

```
=== RUN   TestBuildIssueSnapshot_HardExclusionsNeverLeak_ClaudeSessionUnbound
    issue_test.go:661: ...should not contain ""
--- FAIL: TestBuildIssueSnapshot_HardExclusionsNeverLeak_ClaudeSessionUnbound (0.01s)
```
Fixed by skipping the ClaudeSessionID-value check when the id is empty (unbound case).

Final full-tree run:

```
$ go build ./... && echo BUILD_OK
BUILD_OK
$ go vet ./... && echo VET_OK
VET_OK
$ gofmt -l . && echo FMT_CLEAN
FMT_CLEAN
$ make lint
golangci-lint run
0 issues.
$ make test
go test -count=1 ./...
ok  	github.com/Zalaras/muster/cmd/musterd	9.121s
ok  	github.com/Zalaras/muster/internal/claudecode	2.842s
?   	github.com/Zalaras/muster/internal/claudecode/claudecodetest	[no test files]
ok  	github.com/Zalaras/muster/internal/ghissue	0.676s
ok  	github.com/Zalaras/muster/internal/gitutil	2.238s
ok  	github.com/Zalaras/muster/internal/server	15.674s
ok  	github.com/Zalaras/muster/internal/session	6.017s
ok  	github.com/Zalaras/muster/internal/store	7.846s
ok  	github.com/Zalaras/muster/internal/termbridge	7.771s
ok  	github.com/Zalaras/muster/internal/tmux	6.874s
ok  	github.com/Zalaras/muster/internal/usage	5.751s
ok  	github.com/Zalaras/muster/internal/webui	6.161s
?   	github.com/Zalaras/muster/test/rig/capture	[no test files]
?   	github.com/Zalaras/muster/test/rig/failproxy	[no test files]
$ go test -race ./internal/ghissue/... ./internal/server/...
ok  	github.com/Zalaras/muster/internal/ghissue	1.739s
ok  	github.com/Zalaras/muster/internal/server	30.205s
```

Automated Checks re-verified after adding the test files (unaffected, since no
implementation file changed):

```
$ go list -deps ./internal/ghissue > /dev/null && ! go list -deps ./internal/ghissue | rg -q "Zalaras/muster/internal/(session|store|claudecode|usage)" && echo "D5 PASS"
D5 PASS
$ ! rg -n 'sess\.(Title|Directory|Branch|IsWorktree|LastActivity|LastSnapshot)|Failure\.Message' internal/server/issue.go && echo "D6 PASS"
D6 PASS
$ ! rg -n "api\.github\.com" internal/ && echo "D7 PASS"
D7 PASS
$ ! rg -n "hook_event_name" cmd/ internal/ --glob '!internal/claudecode/**' && echo "D8 PASS"
D8 PASS
```

## Fix Attempt 1 (review cycle 1)

**Failures addressed**: review cycle 1 Minor 2 (`[daemon-tests]`), plus wave 1's
(daemon-impl, commit `891d392`) suggested new coverage points for its behaviour changes
(Major 1, Minors 1/3/4). No implementation code was touched.

**Minor 2 — the negative half of D4's key-set test was near-vacuous**
(`internal/server/issue_test.go`,
`TestBuildIssueSnapshot_SessionScope_KeySetMatchesAllowlistExactly`). The loop was
`assert.NotContains(t, got, excludedKey)` against `got` — a slice of dotted leaf *paths*
(e.g. `"session.title"`) — so it was really testing slice-element equality of a bare word
like `"title"` against those paths, which a leaked `session.title` key would never trip.
Only the `assert.Equal(want, got)` exact-set-equality assertion above it was actually
proving no leak occurs. Fixed by comparing each excluded name against the *last* dotted
component of every path in `got` instead of against the whole path list — now a leaked
`session.title` key genuinely fails the assertion (verified by hand: temporarily adding
`"title"` to `want`/injecting a `Title` field into `issueSnapshotSession` and confirming
the loop — not just the `Equal` above it — flags it, then reverting). Comment above the
loop rewritten to state plainly what it does and does not add over the exact-equality
check.

**Wave-1 handoff — new coverage for daemon-impl's behaviour changes**:

- **Minor 1 (rune vs. byte counting)**: added
  `TestHandleCreateIssue_TitleExactly200MultibyteRunesIsAccepted` and its negative sibling
  `TestHandleCreateIssue_TitleOver200MultibyteRunesIsRejected` (`strings.Repeat("é", 200)`
  — 200 runes, 400 bytes; a fixture sanity `require` confirms the byte/rune split so the
  test provably exercises the fix rather than passing by coincidence), plus the note-field
  equivalent `TestHandleCreateIssue_NoteExactly8000MultibyteRunesIsAccepted`.
- **Minor 3 (`capture_expired` remedy sentence)**: added
  `TestHandleCreateIssue_CaptureExpired_MessageNamesTheRemedy`, asserting
  `error.message` contains "reopen the dialog to take a fresh one" while the pinned UI
  summary contract (`error.code == "capture_expired"`) is unchanged.
- **Minor 4 (`{}`/zero-number 2xx → `MaybeCreated:true`)**: added at the `ghissue` package
  level (mirroring the existing unparseable-body test's shape)
  `TestClient_CreateIssue_2xxEmptyObjectBody_ReturnsErrPostFailedMaybeCreatedTrue` (body
  `{}`, which — unlike the sibling unparseable-body case — unmarshals cleanly, so this
  exercises the new `Number==0 || HTMLURL==""` guard specifically) and
  `TestClient_CreateIssue_2xxZeroNumberNonEmptyURL_ReturnsErrPostFailedMaybeCreatedTrue`
  (number 0 with a non-empty URL, covering the other half of the `||`). Added at the
  handler level `TestHandleCreateIssue_PostFailure_2xxEmptyObjectBody_Returns502AndCaptureNotConsumed`,
  confirming the daemon never renders `Filed <repo>#0` and that the capture stays usable
  for a retry (REQ-10), not just that `ghissue.CreateIssue` returns the right error type.
- **Major 1 (warn log now carries `message`)**: added
  `TestHandleCreateIssue_AuthFailure_WarnLogCarriesStageAndMessage` (asserts
  `"stage":"token"` and `"message":"issue token file is empty"` both appear in
  `srv.logs.String()`) and `TestHandleCreateIssue_PostFailure_WarnLogCarriesStageAndMessage`
  (asserts `"stage":"post"`, `"message":"github returned 403: token lacks repo scope"`,
  and `"maybe_created":false`) — both new assertions on the pre-existing
  `newIssueTestServer`/`srv.logs` seam, exercising exactly the two branches Major 1's fix
  touched.

**Test bugs found while writing these**: none — every new assertion passed against the
fixed implementation on first run; no implementation-bug was found.

**Verification**:
```
$ go build ./... && echo BUILD_OK
BUILD_OK
$ go vet ./internal/server/... ./internal/ghissue/... && echo VET_OK
VET_OK
$ gofmt -l internal/server/issue_test.go internal/ghissue/ghissue_test.go && echo FMT_CLEAN
FMT_CLEAN
$ go test ./internal/server/... ./internal/ghissue/... -run "Issue|BuildIssueSnapshot|CreateIssue" -v
ok  	github.com/Zalaras/muster/internal/server	1.399s
ok  	github.com/Zalaras/muster/internal/ghissue	1.554s
$ go test ./internal/server/... ./internal/ghissue/... -race -run "Issue|CreateIssue"
ok  	github.com/Zalaras/muster/internal/server	7.053s
ok  	github.com/Zalaras/muster/internal/ghissue	1.753s
$ make test
go test -count=1 ./...
ok  	github.com/Zalaras/muster/cmd/musterd	8.883s
ok  	github.com/Zalaras/muster/internal/claudecode	4.597s
?   	github.com/Zalaras/muster/internal/claudecode/claudecodetest	[no test files]
ok  	github.com/Zalaras/muster/internal/ghissue	3.210s
ok  	github.com/Zalaras/muster/internal/gitutil	7.004s
ok  	github.com/Zalaras/muster/internal/server	18.773s
ok  	github.com/Zalaras/muster/internal/session	2.557s
ok  	github.com/Zalaras/muster/internal/store	5.640s
ok  	github.com/Zalaras/muster/internal/termbridge	7.677s
ok  	github.com/Zalaras/muster/internal/tmux	6.699s
ok  	github.com/Zalaras/muster/internal/usage	0.919s
ok  	github.com/Zalaras/muster/internal/webui	2.086s
?   	github.com/Zalaras/muster/test/rig/capture	[no test files]
?   	github.com/Zalaras/muster/test/rig/failproxy	[no test files]
```

**Verdict**: pass. 10 new `Test*` functions added (2 modified assertions in the existing
D4 test, no test deleted). `make test` exits 0. No implementation code changed.

## Fix Attempt 2 (review cycle 2)

**Failures addressed**: review cycle 2 Major 1 (`[daemon-tests]`), plus the 3 tests
daemon-impl's Fix Attempt 2 (commit `302745d`) named as broken by its own required
changes (renamed `message` → `upstream` log field closing the zerolog `MessageFieldName`
collision; `capture_expired` message text). No implementation code was touched.

**Major 1 — the two warn-log tests asserted on the raw JSON byte stream, which is
exactly where the field collision they were meant to catch hides.**
`TestHandleCreateIssue_AuthFailure_WarnLogCarriesStageAndMessage` and
`TestHandleCreateIssue_PostFailure_WarnLogCarriesStageAndMessage` used
`assert.Contains(srv.logs.String(), "\"message\":\"…\"")` against a
`zerolog.New(logBuf)` raw-JSON logger. Under cycle 1's fix (`.Str("message", …)`),
`zerolog.MessageFieldName` is also `"message"`, so the emitted line carried the field
twice — the upstream detail first, `Msg()`'s own text second — and `Contains` matched
the first occurrence in the byte stream while any actual JSON parser (and the daemon's
only production writer, `zerolog.ConsoleWriter`) sees only the second. Confirmed the
mechanism directly rather than just taking the review's word for it:

```
$ go run /tmp/dupe_check.go   # decodes {"stage":"token","message":"issue token file is empty","message":"filing issue: obtaining github token failed"}
decoded message = "filing issue: obtaining github token failed"
```

— `encoding/json` keeps the *last* duplicate key, discarding the upstream detail the
test was supposed to be pinning. Fixed per the review's prescription: added a helper
`decodeLastLogEvent(t, srv) map[string]any` (splits `srv.logs.String()` on newlines,
decodes the last non-empty line with `json.Unmarshal` into `map[string]any`) and
rewrote both tests to assert on the decoded value —
`assert.Equal(t, "issue token file is empty", event["upstream"])` and
`assert.Equal(t, "github returned 403: token lacks repo scope", event["upstream"])`
(plus `event["stage"]` and, for the post-failure test, `event["maybe_created"]`) — using
the renamed `upstream` field daemon-impl's Fix Attempt 2 shipped. This formulation fails
against the old colliding `"message"` field name (there is no `upstream` key to decode)
and passes only once the field is actually addressable, which is the property Major 1
asked for.

**`TestHandleCreateIssue_CaptureExpired_MessageNamesTheRemedy`** — not itself a review
finding, but named in daemon-impl's Fix Attempt 2 handoff as an unavoidable casualty of
Minor 1 (the `capture_expired` message dropped the false "this snapshot expired"
diagnosis). Updated the pinned substring from `"reopen the dialog to take a fresh one"`
to `"reopen the dialog to take a fresh snapshot"`, matching the new copy in
`internal/server/issue.go`'s `capture == nil` branch exactly. No other change to this
test — its docstring already described the underlying remedy correctly.

**Test bugs found while writing these**: none — the review's prescribed formulation
(decode + assert on `upstream`) failed under the pre-fix-attempt-2 field name and passed
against the renamed field on first run; no implementation-bug was found in this wave.

**Verification**:
```
$ go build ./... && echo BUILD_OK
BUILD_OK
$ go vet ./... && echo VET_OK
VET_OK
$ gofmt -l internal/server/issue_test.go && echo FMT_CLEAN
FMT_CLEAN
$ go test ./internal/server/... -run 'TestHandleCreateIssue' -v
--- PASS: TestHandleCreateIssue_CaptureExpired_MessageNamesTheRemedy (0.01s)
--- PASS: TestHandleCreateIssue_AuthFailure_WarnLogCarriesStageAndMessage (0.01s)
--- PASS: TestHandleCreateIssue_PostFailure_WarnLogCarriesStageAndMessage (0.01s)
... (all other TestHandleCreateIssue* also PASS)
PASS
ok  	github.com/Zalaras/muster/internal/server	1.205s
$ make test
go test -count=1 ./...
ok  	github.com/Zalaras/muster/cmd/musterd	6.418s
ok  	github.com/Zalaras/muster/internal/claudecode	0.919s
?   	github.com/Zalaras/muster/internal/claudecode/claudecodetest	[no test files]
ok  	github.com/Zalaras/muster/internal/ghissue	1.339s
ok  	github.com/Zalaras/muster/internal/gitutil	2.603s
ok  	github.com/Zalaras/muster/internal/server	13.982s
ok  	github.com/Zalaras/muster/internal/session	4.408s
ok  	github.com/Zalaras/muster/internal/store	3.848s
ok  	github.com/Zalaras/muster/internal/termbridge	5.342s
ok  	github.com/Zalaras/muster/internal/tmux	5.625s
ok  	github.com/Zalaras/muster/internal/usage	5.079s
ok  	github.com/Zalaras/muster/internal/webui	3.898s
?   	github.com/Zalaras/muster/test/rig/capture	[no test files]
?   	github.com/Zalaras/muster/test/rig/failproxy	[no test files]
```

**Verdict**: pass. 1 new helper (`decodeLastLogEvent`) + 3 tests updated (2 to decode
and assert on `event["upstream"]`, 1 to pin the new `capture_expired` copy); no test
added or deleted. `make test` exits 0 (full tree). No implementation code changed.
