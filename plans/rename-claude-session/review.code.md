# Correctness review: rename-claude-session

**Plan**: rename-claude-session
**Verdict**: approved
**Cycle**: 2
**Pack**: kb: pack 43588 words (budget 30000)

This is a full cycle, not a delta: cycle 1 left a Critical and Majors open. Every cycle-1 item was checked against `git diff f6be7f8c..HEAD`:
- Critical 1 is fixed: the reply-key spellings now sit behind `claudecodetest.PromptReplyTitle`.
- Major 1 is fixed: the `internal/server/CLAUDE.md` invariant is restated.
- Major 2 is fixed: the Doc Delta gained the protocol `sessions.title` clause, the lifecycle `titleOverride` comment, and the ingest Transport sentence and diagram.
- Major 3 is fixed: the ADR consequence is aligned.
- Minor 1 is fixed: lifecycle moved to **Features**.

## Requirements

| Req | Implemented | Tested | Status |
|-----|-------------|--------|--------|
| REQ-1 | Yes: `ingest.go` `replyFor` → `Manager.TakeTitleToSend` → `claudecode.PromptTitleReply`. Body is `{"hookSpecificOutput":{"hookEventName":"UserPromptSubmit","sessionTitle":…}}` | Yes: `TestIngestRename_PromptHookReplyCarriesOverrideOnce`, `TestPromptTitleReply`, `TestWrapperReply_RenameRoundTripThroughTheRealIngest` | pass |
| REQ-2 | Yes: `titledelivery.go` `takeTitle` marks the value delivered. `SetTitle` re-arms only when the value changed (`title.go`) | Yes: `TestIngestRename_EachRenameSendsOnce` (A→B→A, suffix, `/clear`, two sessions), `TestTitleToSend` (×7 states) | pass |
| REQ-3 | Yes: `replyFor` returns nil for a status kind, a parse error, a non-prompt event, an unroutable envelope, and when nothing is pending. `takeTitle` returns `send=false` when the override equals Claude's name | Yes: `TestIngestRename_OnlyARoutedPromptSubmitCarriesTheReply` (8 events, status ×2, unknown session, pane mismatch, no pane, unbound raw, malformed, `{}`; each also proves the send is not spent), `TestIngestRename_NothingToSendAnswersEmpty` | pass |
| REQ-4 | Yes: see RV1 | Reviewer-verified | pass |
| REQ-5 | Yes: `settings.go` `postAndEchoReply` prints only in the `2??)` arm. `status-line.sh` keeps `postAndDiscardReply` | Yes: `TestWrapperReply_PrintsTheBodyOnlyOnA2xx`, `TestWrapperReply_AnAnswerThatNeverComesPrintsNothing`, the existing `TestWrapperScriptsShellRoundTrip_DaemonUnreachableExitsSilentlyAndFast`, `TestWriteEnvelopeScript_StdoutOnlyOnA2xxHookReply` | pass |
| REQ-6 | Yes: `launcher.go` `Resume` reads `PendingTitle` → `Title`, then calls `MarkTitleSent` only after a successful spawn. `BuildArgv` emits `--resume` then `--name`. `launcherpast.go` (resume-from-list) passes no Title | Yes: `TestLauncher_Resume_CarriesTheUnsentTitleAsName`, `…_AFailedSpawnDoesNotSpendTheSend`, `…_OnlyTheResumedSessionSpendsItsSend`, `TestBuildArgv`, and the existing `TestLauncher_LaunchResume_SpawnsResumeArgvAndSeedsFromListing` (edge 12) | pass |
| REQ-7 | Yes: `apply.go` `ApplyStatus` → `observeClaudeTitle(prevTitle)`. A clear goes through `persistWholeRowLocked`, and `DisplayTitle()` changing triggers the one broadcast | Yes: `TestApplyStatus_TitleOverrideDelivery` (15 scenarios ×7 states: exactly one upsert, restart reload sees it cleared), `TestApplyStatus_ClearedOverrideStaysClearedForTheSameNameAgain`, `TestIngestRename_StatusPostsThroughTheWireFollowDelivery` | pass |
| REQ-8 | Yes: before delivery, `observeClaudeTitle` only records a matching name as delivered and never clears. `applyStatusUpdate` still never touches `TitleOverride` | Yes: same tests (REQ-8 rows), `TestApplyStatus_PostWithoutANameNeverClears`, `TestApplyStatusUpdate_NeverTouchesTitleOverride` | pass |
| DIAG | `kb:diagram/daemon-components` (no new import edge: `claudecodetest/promptreply.go` imports only `encoding/json`, and server→claudecode and server→session already existed). `kb:diagram/one-launch-end-to-end` (create path unchanged). The ingest spec's inline "One post, end to end" sequence is now staged in the Doc Delta | — | pass |

## Build & Tests

All results read from `$GATES_LOG_DIR`. The 7 `WARN size` hits belong to review-maintainability.
- E2E tests: skipped (E2E Scope `none`, no `make e2e` in the run)
- Daemon tests (race): pass (`go test -race -count=1 ./...`, 25 packages `ok`)
- Web tests: pass (2622)
- Daemon build: pass
- Web build: pass
- Lint: pass (golangci-lint 0 issues, biome clean)

## Acceptance Checks

| ID | Command | Result |
|----|---------|--------|
| build | `make build` | pass (01) |
| test | `go test -race -count=1 ./...` | pass (02) |
| lint | `make lint` | pass (03, 0 issues) |
| web-build | `make web-build` | pass (04) |
| web-test | `make web-test` | pass (05, 2622) |
| web-lint | `make web-lint` | pass (06) |
| contrast | `make contrast` | pass (07, 0 failures × 3 themes) |
| features-inventory | — | pass (08, empty) |
| versions | `go run ./tools/versions check` | pass (09) |
| e2e-honest | no `test.skip/fixme/only` | pass (10) |
| kb-check | `go tool kb check` | pass (11, 581 records, 0 problems) |
| e2e-lint | `make e2e-lint` | pass (12) |
| features | features-scope | pass (13: rename ingest launch lifecycle, Touches empty) |
| comments | comment-checks | pass (14) |
| comment-ledger | ledger verify | pass (15) |
| size | size-warn | WARN, 7 hits (review-maintainability's) |
| D1 | `go test -count=1 -run 'TestIngest' ./internal/server/` | pass (17) |
| D2 | `go test -count=1 ./internal/server/ ./internal/session/` | pass (18) |
| D3 | `go test -count=1 ./internal/claudecode/ -run 'TestBuildArgv\|TestLaunch'` | pass (19) |
| D4 | `go test -count=1 ./internal/claudecode/` | pass (20) |
| D5 | `make lint` | pass (deduped to `lint`) |
| DOC | doc upkeep + Doc Delta vs what shipped | pass. The `TODO.md` tick is done (`docs/history/todo-done.md:1727`). There are no `deviation:` lines. Both `doc-delta:` lines are reflected in the delta. Both proposed ADRs carry `refs: plan:rename-claude-session` and now describe what shipped. Every delta line matches the code: argv order `--model --resume --name --permission-mode` per `BuildArgv` and `TestBuildArgv`; reply shape per `PromptTitleReply`; `hook.sh` only. The delta now covers every now-false sentence: protocol `sessions.title`, `sessions.resume`, `ingest`, and the Session object `titleOverride` comment; rename and ingest spec prose and the ingest diagram |

## Reviewer-Verified Criteria

| ID | Criterion | Result | Evidence |
|----|-----------|--------|----------|
| RV1 | Building the reply touches no DB, queue or file, only in-memory session state (REQ-4) | pass | `replyFor` calls `claudecode.ParseIngestBody` (two `json.Unmarshal`s), then `q.route` (`Manager.PaneOf`/`Resolve`, which are `m.sessions`/`m.byClaude` map reads under `mu`, `manager.go:551,590`), then `Manager.TakeTitleToSend` (an in-memory read-and-mark under `mu`). None of these touches `q.ch`, the store or the filesystem. The enqueue happens before `replyFor` and does not depend on it |
| RV2 | The `sessionTitle` / `hookSpecificOutput` strings appear only under `internal/claudecode/` | pass | `rg 'hookSpecificOutput\|sessionTitle\|hookEventName'` outside `internal/claudecode/`, `docs/` and `plans/` hits only the historical `spikes/*.md`. No Go file elsewhere, test or production, spells them. The server tests decode through `claudecodetest.PromptReplyTitle` |
| RV3 | No hook payload or reply body is logged | pass | `replyFor` discards `route`'s `logMiss`. `handleIngest` writes the reply without logging it. The `route` log lines carry only kind, ids and panes |

## Hard-Rule Checklist

| # | Rule | Result |
|---|------|--------|
| 1 | Adapter boundary | pass. The reply format is built in `internal/claudecode/promptreply.go` and decoded in `claudecodetest`. Event-name arguments to `claudecodetest` builders in server tests follow the existing practice (`ingest_test.go`, `settings_shell_test.go` on main) |
| 2 | No terminal-output state parsing | pass |
| 3 | Non-blocking hook handler | pass. The only request-path work is bounded in-memory work, as REQ-4 allows. The hook timeout is still 2 s (`settings.go:18`) and curl uses `--max-time 2` |
| 4 | tmux on `-L muster` / sizing | pass (no tmux code changed; the resume tests use `fakeTmux`) |
| 5 | No payload logging | pass |
| 6 | Empty-gauge honesty | n/a |
| 7 | Identity on tmux target | pass. The reply routes on the envelope through the shared `route`, and delivery state is held per Muster session |
| 8 | No settings trespass | pass |
| 9 | No real `claude` outside canary/probes | pass. `claudeBin: "claude"` is only a string handed to `fakeTmux`. The shell tests run `sh` and `curl` against `httptest` |

## Issues

### Critical
None.

### Major
None.

### Minor
None.

### Notes
1. **[note]** A stale code comment at `internal/session/session.go:145-148` says `TitleOverride` is "never read by the state machine or the status path; mutated only by Manager.SetTitle". `ApplyStatus` → `observeClaudeTitle` (`titledelivery.go`) now reads it and clears it after delivery.
2. **[note]** The hand-written **Features** line in `internal/claudecode/CLAUDE.md:3` lists "ingest, canary, launch, reader, theme, usage". `promptreply*.go` is now claimed by `rename` (its generated trailer lists rename). The feature list is stale, though no behaviour claim is false.
3. **[note]** Wording for doc-reconcile to tighten in the ingest delta line: the request path does an "in-memory parse and session-state read". Two details:
   - `TakeTitleToSend` also marks the in-memory delivery record, so it is a read-and-mark.
   - The parse runs on every hook body, not only `UserPromptSubmit`.

   Both stay within REQ-4 (no DB, queue or file).
4. **[note]** Carried from cycle 1: the shipped route has not been measured end to end. kb:fact/hook-output-sets-session-title (2.1.289, `guard: none`) was measured with an **http** hook. Muster replies through a **command** hook's stdout. It is also unmeasured whether Claude Code's auto-generated title can land after a hook-set name; that would let REQ-7 clear the rename. An `/interface-probe` and a canary guard would settle both.
5. **[note]** kb:adr/rename-claude-change-after-delivery-clears-override lists `features: [rename]` only. It now also changes lifecycle's contract (the Session object's `titleOverride` comment, which the Doc Delta cites). Adding `lifecycle` would surface it in lifecycle's INDEX. This is optional and does not block.
