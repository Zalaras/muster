# Correctness review: rename-claude-session

**Plan**: rename-claude-session
**Verdict**: needs-changes
**Cycle**: 1
**Pack**: kb: pack 43593 words (budget 30000)

## Requirements

| Req | Implemented | Tested | Status |
|-----|-------------|--------|--------|
| REQ-1 | Yes: `internal/server/ingest.go` `replyFor` → `Manager.TakeTitleToSend` → `claudecode.PromptTitleReply` | Yes: `TestIngestRename_PromptHookReplyCarriesOverrideOnce`, `TestPromptTitleReply`, `TestWrapperReply_RenameRoundTripThroughTheRealIngest` | pass |
| REQ-2 | Yes: `titledelivery.go` `takeTitle`, `SetTitle` re-arms only on a changed value | Yes: `TestIngestRename_EachRenameSendsOnce`, `TestTitleToSend` | pass |
| REQ-3 | Yes: `replyFor` returns nil for a non-hook kind, a parse error, a non-prompt event, an unroutable envelope, and when nothing is pending | Yes: `TestIngestRename_OnlyARoutedPromptSubmitCarriesTheReply`, `TestIngestRename_NothingToSendAnswersEmpty` | pass |
| REQ-4 | Yes: `replyFor` uses `ParseIngestBody` (in-memory JSON), `PaneOf`/`Resolve`/`TakeTitleToSend` (map reads under `Manager.mu`) | Reviewer-verified (below) | pass |
| REQ-5 | Yes: `postAndEchoReply` prints only inside the `2??)` arm; `status-line.sh` keeps `--output /dev/null` | Yes: `TestWrapperReply_PrintsTheBodyOnlyOnA2xx`, `TestWrapperReply_AnAnswerThatNeverComesPrintsNothing`, existing `TestWrapperScriptsShellRoundTrip_DaemonUnreachableExitsSilentlyAndFast`, `TestWriteEnvelopeScript_StdoutOnlyOnA2xxHookReply` | pass |
| REQ-6 | Yes: `launcher.go` `Resume` passes `PendingTitle` as `Title`, then `MarkTitleSent` after a successful spawn; `BuildArgv` emits `--name` beside `--resume` | Yes: `TestLauncher_Resume_CarriesTheUnsentTitleAsName`, `..._AFailedSpawnDoesNotSpendTheSend`, `..._OnlyTheResumedSessionSpendsItsSend`, `TestBuildArgv` | pass |
| REQ-7 | Yes: `ApplyStatus` → `observeClaudeTitle`; a clear persists through `persistWholeRowLocked` and broadcasts because `DisplayTitle()` changed | Yes: `TestApplyStatus_TitleOverrideDelivery` (×7 source states, restart reload), `TestApplyStatus_ClearedOverrideStaysClearedForTheSameNameAgain`, `TestIngestRename_StatusPostsThroughTheWireFollowDelivery` | pass |
| REQ-8 | Yes: before delivery, `observeClaudeTitle` only records a delivery when the names match and never clears | Yes: same tests, plus `TestApplyStatusUpdate_NeverTouchesTitleOverride` (unchanged) | pass |
| DIAG | `kb:diagram/daemon-components` (no new import edges: server→claudecode and server→session already existed), `kb:diagram/one-launch-end-to-end` (the create path is unchanged), and the inline "One post, end to end" sequence in `docs/features/ingest/spec.md` | — | fail: the ingest inline diagram is stale (Major 2) |

## Build & Tests

E2E tests: skipped (E2E Scope `none`; no `make e2e` line in the run) · Daemon tests (race): pass (`go test -race -count=1 ./...`, every package `ok`) · Web tests: pass (2622) · Daemon build: pass · Web build: pass · Lint: pass (`golangci-lint` 0 issues, web lint clean). All read from `$GATES_LOG_DIR`. The `WARN size` lines (7) belong to review-maintainability.

## Acceptance Checks

| ID | Command | Result |
|----|---------|--------|
| build | `make build` | pass (01-build.log) |
| test | `go test -race -count=1 ./...` | pass (02-test.log) |
| lint | `make lint` | pass (03-lint.log, 0 issues) |
| web-build | `make web-build` | pass (04) |
| web-test | `make web-test` | pass (05, 2622 tests) |
| web-lint | `make web-lint` | pass (06) |
| contrast | `make contrast` | pass (07, 0 failures in all 3 themes) |
| features-inventory | — | pass (08, no output) |
| versions | `go run ./tools/versions check` | pass (09) |
| e2e-honest | `! rg -n 'test\.(skip\|fixme\|only)\(' web/e2e` | pass (10) |
| kb-check | `go tool kb check` | pass (11, 0 problems) |
| e2e-lint | `make e2e-lint` | pass (12) |
| features | `go tool kb scope --plan rename-claude-session --touch` | pass (13) |
| comments | comment-checks | pass (14) |
| comment-ledger | comment ledger verify | pass (15, 1 block kept) |
| size | size-warn | WARN, 7 hits (review-maintainability's) |
| D1 | `go test -count=1 -run 'TestIngest' ./internal/server/` | pass (17) |
| D2 | `go test -count=1 ./internal/server/ ./internal/session/` | pass (18) |
| D3 | `go test -count=1 ./internal/claudecode/ -run 'TestBuildArgv\|TestLaunch'` | pass (19) |
| D4 | `go test -count=1 ./internal/claudecode/` | pass (20) |
| D5 | `make lint` | pass (deduped to `lint`) |
| DOC | doc upkeep + Doc Delta vs what shipped | FAIL: the Doc Delta leaves three shipped behaviour changes out (Major 2), and one ADR consequence is false (Major 3). The `TODO.md` tick is done (`df8629d6`), the log has no `deviation:` lines, and both `doc-delta:` lines are reflected in the corrected delta (`a3f44803`) |

## Reviewer-Verified Criteria

| ID | Criterion | Result | Evidence |
|----|-----------|--------|----------|
| RV1 | Building the reply touches no DB, queue or file, only in-memory session state (REQ-4) | pass | `ingest.go` `replyFor` calls `claudecode.ParseIngestBody` (pure JSON), `q.route` (`Manager.PaneOf`/`Resolve`, map reads under `mu`), and `Manager.TakeTitleToSend` (`titledelivery.go:61`, map read under `mu`). None of these touches `q.ch`, `store` or the filesystem. `Manager.mu` is released before persistence (`writeorder.go:97-99`), so the handler does not wait on DB I/O. |
| RV2 | The `sessionTitle` / `hookSpecificOutput` strings appear only under `internal/claudecode/` | **FAIL** | Production code passes: only `internal/claudecode/promptreply.go` has them. Tests do not: `internal/server/ingest_rename_test.go:36-38`, `internal/server/ingest_rename_reply_test.go:70-72`, `internal/server/settings_shell_reply_test.go:75` and `:184-186` (Critical 1). |
| RV3 | No hook payload or reply body is logged | pass | `replyFor` drops `route`'s `logMiss` without calling it. The handler logs nothing new. The `route` log lines carry only kind, ids and panes, never the body. |

## Hard-Rule Checklist

| # | Rule | Result |
|---|------|--------|
| 1 | Adapter boundary | **FAIL**: tests in `internal/server` spell out Claude Code reply keys (`hookSpecificOutput`, `hookEventName`, `sessionTitle`). See Critical 1. Production code is clean. |
| 2 | No terminal-output state parsing | pass |
| 3 | Non-blocking hook handler | pass. The handler now does bounded in-memory work before writing `200` (one JSON parse and up to three short `Manager.mu` sections), as REQ-4 allows. Hook timeouts are unchanged (curl `--max-time 2`). |
| 4 | tmux on `-L muster` / sizing | pass (no tmux code changed; the resume tests use `fakeTmux`) |
| 5 | No payload logging | pass |
| 6 | Empty-gauge honesty | n/a (no gauge path touched) |
| 7 | Identity on tmux target | pass (the reply routes on the envelope through the shared `route`; delivery state is per Muster session) |
| 8 | No settings trespass | pass |
| 9 | No real `claude` outside canary/probes | pass (`claudeBin: "claude"` is only a string in the fake-tmux launcher; the shell tests run `sh` + `curl` against `httptest`) |

## Issues

### Critical
1. **[daemon-tests]** Claude Code reply-format keys are spelled out in `internal/server` tests. That breaks hard rule 1 as bound by kb:adr/ingest-wire-shaped-fixtures-via-claudecodetest and `internal/claudecode/CLAUDE.md` ("A Claude Code payload key or event name appears in this package and nowhere else; other packages' tests build wire bodies through `claudecodetest`"). It also fails the plan's Reviewer-Verified item RV2. The offending lines:
   - `internal/server/ingest_rename_test.go:36-38`: an anonymous struct with `json:"hookSpecificOutput"`, `json:"hookEventName"` and `json:"sessionTitle"`.
   - `internal/server/ingest_rename_reply_test.go:70-72`: the same struct.
   - `internal/server/settings_shell_reply_test.go:75`: a literal `{"hookSpecificOutput":{"hookEventName":"UserPromptSubmit","sessionTitle":"Mine"}}`.
   - `internal/server/settings_shell_reply_test.go:184-186`: the same decode struct.

   Fix: add a decoder to `internal/claudecode/claudecodetest`, for example `PromptReplyTitle(body []byte) (title string, ok bool)`, which checks `hookEventName == "UserPromptSubmit"` and returns `sessionTitle`. The three decode sites call it. The 2xx test's canned body can be `string(claudecode.PromptTitleReply("Mine"))`, or any opaque JSON, because that test is about byte-for-byte pass-through. Every assertion keeps its strength; only the key spellings move behind the boundary.

### Major
1. **[daemon-impl]** `internal/server/CLAUDE.md` (the hand-written Invariants block) still says "Ingest enqueues and returns 200 immediately; parsing and state happen in the single worker (kb:adr/ingest-seq-assigned-at-ingest)." That is now false: `replyFor` parses every hook body and reads session state on the request path before the `200` is written (`ingest.go` `handleIngest` → `replyFor`). The daemon-impl log acknowledges this ("the queue doc says parsing is the worker's … the second parse is kept"), but the package invariant, which the file marks as review-Critical, was not updated. Fix: restate the invariant as what is now true. Ingest enqueues and answers at once; the only request-path work is an in-memory parse plus a session-state read to build a `UserPromptSubmit` rename reply (REQ-4, kb:adr/rename-pushed-to-claude-once); persistence and state transitions stay in the single worker.
2. **[orchestrator]** The Doc Delta leaves out three shipped behaviour changes. `doc-reconcile` promotes the delta verbatim, so these statements would stay false after reconcile:
   - `docs/protocol.md` § `PUT /api/sessions/{id}/title` (lines 808-810, `kb:anchor/sessions.title`): "Status posts … never read or write the override; while an override is set, a post that changes only Claude's name persists and broadcasts nothing." After delivery, a different name clears the override, persists it and broadcasts one `sessionUpsert` (REQ-7). The delta retracts only the matching sentence in `docs/features/rename/spec.md`, and only its first clause there. The second clause ("while an override is set, a post that changes only Claude's name broadcasts nothing") is false after delivery in both files.
   - `docs/protocol.md` § The Session object, `titleOverride` comment (lines 1186-1187, lifecycle's contract): "Never touched by status posts, rebinds, resume or reconcile." Status posts now clear it after delivery.
   - `docs/features/ingest/spec.md` § Transport: "The handler returns `200` with an empty body at once and enqueues the raw body; a single worker parses it". Also its inline "One post, end to end" sequence diagram: `H-->>W: 200, empty body`, and the Note "no parsing, no DB work on the request path". The handler now parses on the request path and can answer with a body (this is the DIAG fail). The ingest delta covers only `docs/protocol.md`'s "Return `200` with empty body immediately".

   Fix: add delta lines (and a `## Diagrams` delta for the sequence) so doc-reconcile carries all three.
3. **[orchestrator]** kb:adr/rename-pushed-to-claude-once § Consequences says "a suffixed name stays suffixed in Claude Code's prompt box and resume picker while the dashboard shows Muster's title." That is not what shipped. kb:adr/rename-claude-change-after-delivery-clears-override (also proposed by this plan) clears the override on a suffixed name, so the dashboard shows the suffixed name (REQ-7, edge case 1, `TestApplyStatus_TitleOverrideDelivery`). The plan's Doc Delta was corrected for the same sentence (`a3f44803`); the ADR was not. It is still `proposed` on this branch, so it can be amended before the Completion flip.

### Minor
1. **[orchestrator]** Promote `lifecycle` from `**Touches**` to `**Features**`. This plan changed lifecycle's contract: the Session object's `titleOverride` is now written by a status post (Major 2, second bullet), and `internal/session/apply.go` `ApplyStatus` (lifecycle territory per `kb for`) now clears it.

### Notes
1. **[note]** The shipped route has not been measured end to end. kb:fact/hook-output-sets-session-title (verified 2.1.289, `guard: none`) was measured with an **http** hook returning the body. Muster sends the reply through a **command** hook printing JSON to stdout, and that route is described in the fact but was not exercised. It is also unmeasured whether Claude Code later auto-generates a title (kb:fact/status-session-name-source) over a hook-set name on a session launched without `--name`. If it does, REQ-7 would read that title as a "later different name" and clear the user's rename. An `/interface-probe` of both before relying on this in daily use would settle it. A canary guard would keep it settled.
2. **[note]** REQ-7 as written means a `/rename` back to the exact name Claude Code held before delivery never clears the override, however much later it happens. The `titleDelivery.before` value lives until the next dashboard rename. The plan's wording and the ADR accept this; it is recorded so doc-reconcile's "a later different name … clears the override" is read with that exception.
3. **[note]** Doc Delta wording that doc-reconcile should tighten when promoting:
   - The ingest line "The wrapper prints a 2xx body to stdout" holds for `hook.sh` only. `status-line.sh` never prints (`settings.go` `postAndDiscardReply`).
   - The launch line's "`--name` present only when the override is set and not yet sent" also omits `--name` when the override equals Claude Code's last-known name (`titledelivery.go` `pendingTitle`, matching REQ-6).
4. **[note]** `replyFor` parses every hook body on the request path, not only `UserPromptSubmit`, because the event type is inside the payload. The cost is one extra `json.Unmarshal` per hook. It is bounded and in-memory, but it is per-event overhead on large `PostToolUse` bodies. This is review-maintainability's area if worth a look.
