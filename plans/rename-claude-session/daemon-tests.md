# Daemon Tests: rename-claude-session

**Plan**: rename-claude-session
**Verdict**: pass
**Pack**: kb: pack 23526 words (budget 30000)

## Summary

Tests created: 21 top-level tests (plus the earlier red-first proof, now green) | Passing: all | Failing: 0

`go build ./...` exits 0; `make test` all packages `ok`; `make lint` 0 issues; `-race` over the new
tests in `internal/server` and `internal/session` ok.

## Tests

| File | Test Name | What It Tests | Status |
|------|-----------|---------------|--------|
| `internal/server/ingest_rename_test.go` | TestIngestRename_PromptHookReplyCarriesOverrideOnce | The plan's Proof: REQ-1/REQ-2 first prompt carries the override, the second is empty (red-first test, unchanged) | pass |
| `internal/server/ingest_rename_reply_test.go` | TestIngestRename_OnlyARoutedPromptSubmitCarriesTheReply | REQ-3, edge 5/6/9: 8 non-prompt hook events, the status endpoint (2 bodies), unknown muster session, pane mismatch, absent pane, unbound raw prompt, malformed body, `{}` all answer 200 empty with a rename waiting — and none spends it (the routed prompt after still carries it) | pass |
| `internal/server/ingest_rename_reply_test.go` | TestIngestRename_NothingToSendAnswersEmpty | REQ-3, edge 3/4: no override, cleared override, override equal to Claude's name (before and after) → empty | pass |
| `internal/server/ingest_rename_reply_test.go` | TestIngestRename_EachRenameSendsOnce | REQ-2, edge 2/9: A→B→A sends each once; latest-wins before a prompt; suffixed name reported back does not re-send; `/clear` id change; two sessions, one's send does not spend the other's | pass |
| `internal/server/ingest_rename_reply_test.go` | TestIngestRename_StatusPostsThroughTheWireFollowDelivery | REQ-7/REQ-8, edge 1/14 over HTTP: straggler keeps, suffix clears and dashboard shows it, pre-send name never touches | pass |
| `internal/server/launcher_resume_title_test.go` | TestLauncher_Resume_CarriesTheUnsentTitleAsName | REQ-6, edge 10: `--resume <id> --name <override>` contiguous when unsent and differing; no `--name` with no override / equal to Claude's name / already sent; the next prompt then sends nothing | pass |
| `internal/server/launcher_resume_title_test.go` | TestLauncher_Resume_AFailedSpawnDoesNotSpendTheSend | REQ-6: a failed spawn leaves the override pending | pass |
| `internal/server/launcher_resume_title_test.go` | TestLauncher_Resume_OnlyTheResumedSessionSpendsItsSend | REQ-6 multi-instance: resuming one dead session leaves another's pending rename owed | pass |
| `internal/server/settings_shell_reply_test.go` | TestWrapperReply_PrintsTheBodyOnlyOnA2xx | REQ-5: hook.sh prints the body byte for byte on 200/201/202/204/299 (incl. embedded/trailing newline, a body ending in a status-looking line), nothing on 301/400/404/500/503 (incl. a 500 body ending in `200`); status-line.sh never prints; exit 0, stderr empty | pass |
| `internal/server/settings_shell_reply_test.go` | TestWrapperReply_AnAnswerThatNeverComesPrintsNothing | REQ-5: no answer within curl's 2 s prints nothing, exits 0 | pass |
| `internal/server/settings_shell_reply_test.go` | TestWrapperReply_RenameRoundTripThroughTheRealIngest | REQ-1/2/5 chain: real hook.sh → real ingest handler; PreToolUse prints nothing, first prompt prints the reply JSON, second prints nothing | pass |
| `internal/session/titledelivery_test.go` | TestApplyStatus_TitleOverrideDelivery | REQ-7/REQ-8 through `Manager.ApplyStatus`, 15 scenarios × 7 source states (six displayed states + ended): before delivery untouched; delivered by send / resume `MarkTitleSent` / Claude-name match; suffix and `/rename` clear (persisted, exactly one upsert whose title is Claude's name, restart loads it cleared); straggler of the pre-delivery name keeps (edge 14), override-equal-at-once then `/rename` clears (edge 15); state/alive/attention/failure unmoved | pass |
| `internal/session/titledelivery_test.go` | TestApplyStatus_PostWithoutANameNeverClears | a delivered override survives a status post carrying no name, from every state | pass |
| `internal/session/titledelivery_test.go` | TestApplyStatus_ClearedOverrideStaysClearedForTheSameNameAgain | no second upsert after a clear | pass |
| `internal/session/titlesend_test.go` | TestTitleToSend | REQ-1/2/6 at the session layer, 16 scenarios × 7 states: once per value, A→B→A, latest wins, cleared (null), same value again does not re-arm, re-arm after a clear, `PendingTitle` does not spend, `MarkTitleSent` spends / stale value ignored / no-op without override | pass |
| `internal/session/titlesend_test.go` | TestTitleToSend_UnknownSession | unknown id: nothing, no panic | pass |
| `internal/session/titlesend_test.go` | TestTitleToSend_SurvivesDaemonRestartOnlyAsTheRowDoes | edge 7/17: undelivered pending after restart; reported-equal not pending; cleared not pending; delivered-but-forgotten pending once more (accepted loss) | pass |
| `internal/claudecode/promptreply_test.go` | TestIsPromptSubmit | event-name predicate, 10 rows | pass |
| `internal/claudecode/promptreply_test.go` | TestPromptTitleReply | REQ-1 body shape: valid JSON, one top-level key, exactly `hookEventName` + `sessionTitle`, titles with quotes/newline/unicode/HTML escape correctly | pass |
| `internal/claudecode/claudecodetest/promptreply_test.go` | TestPromptReplyTitle | review cycle 2: the decoder tests call (8 rows: the daemon's own reply, quotes/unicode, empty title, empty/non-JSON/`{}`, another event's output, missing event name) | pass |
| `internal/claudecode/launch_test.go` | TestBuildArgv (4 rows: resume+Title, resume+empty Title, resume+Title+no model, space-bearing Title) | REQ-6 argv order `--resume <id> --name <title> --permission-mode` | pass |
| `internal/claudecode/settings_test.go` | TestWriteEnvelopeScript_StdoutOnlyOnA2xxHookReply | static template check: no `echo`; hook.sh has one `printf` inside a `2??)` arm and no `--output /dev/null`; status-line.sh has no `printf` and keeps discarding; both end `exit 0` | pass |

## Handoff Received

- `internal/claudecode/launch_test.go` — `TestBuildArgv/ResumeSessionID_emits_--resume_and_omits_--name_even_when_Title_is_also_set` asserted the old contract. Replaced by "ResumeSessionID with a Title emits --resume then --name" (`claude --model sonnet --resume abc-123 --name "Renamed In Muster" --permission-mode default`), plus three neighbouring rows (empty Title, no model, space in Title).
- `internal/claudecode/settings_test.go` — `TestWriteEnvelopeScript_NeverWritesToStdoutOrStderr` renamed `TestWriteEnvelopeScript_StdoutOnlyOnA2xxHookReply` and rewritten as a per-script table: hook.sh may `printf` only inside the `2??)` arm (REQ-5), status-line.sh never prints and still discards curl's output; the shared invariants (`--silent`, no `echo`, ends `exit 0`) are asserted on both.
- `internal/session/title_test.go` `TestApplyStatusUpdate_NeverTouchesTitleOverride` still passes unchanged (the clear lives in `ApplyStatus`); only its doc comment now points at `TestApplyStatus_TitleOverrideDelivery`.

## Notes

- `funlen` WARN names two of my files: `TestApplyStatus_TitleOverrideDelivery` (164 lines) and `TestTitleToSend` (118). Both are single tables crossed with the seven source states (kb:lesson/invariant-missed-by-per-transition-tests); the length is the table rows, there is no repeated body to collapse. No `dupl` line names a file of mine.
- The shell tests share one script set and one server per test function: a freshly written script costs ~1.2 s on first exec (kb:lesson/first-exec-of-fresh-script-costs-270ms); per-row scripts took 1.3 s a row.
- Declined, covered elsewhere (read first):
  - Daemon down (REQ-5, edge 11): `internal/server/settings_shell_test.go` `TestWrapperScriptsShellRoundTrip_DaemonUnreachableExitsSilentlyAndFast` runs the generated hook command against a closed port and asserts `assert.Empty(t, stdout.String(), ...)`, `require.NoError(t, err, "REQ-7: the wrapper must always exit 0")` inside `runWrapperCommandExpectingSilence`; it passes against the new hook.sh.
  - Resume-from-list has no override (edge 12): `internal/server/launcherpast_test.go` `TestLauncher_LaunchResume_SpawnsResumeArgvAndSeedsFromListing` asserts `assert.NotContains(t, argv, "--name", ...)` on the spawned argv.
  - REQ-4 (reply reads only in-memory state): reviewer-verified per the plan; no test seam observes DB or queue reads from the handler.
  - Edge 8, 16: untested by plan (accepted loss).
  - Real tmux, real `claude`: not used.
- `internal/server/ingest_rename_test.go` (the red-first proof) keeps its assertions; the new server tests live in `ingest_rename_reply_test.go` beside it.
- Review cycle 2 (Critical 1, hard rule 1): the reply-format key spellings no longer appear in `internal/server`. New `claudecodetest.PromptReplyTitle(body) (title, ok)` (`internal/claudecode/claudecodetest/promptreply.go`) checks the reply is a UserPromptSubmit reply and returns its title; the four decode sites (`ingest_rename_test.go`, `wantReply` and the wrapper round trip in `ingest_rename_reply_test.go`/`settings_shell_reply_test.go`) call it, every assertion kept (`require.True(ok)` carries the old unmarshal's message, then the title equality). The 2xx pass-through test's canned body is `string(claudecode.PromptTitleReply("Mine"))`. Blast radius: `grep -rn 'hookSpecificOutput\|sessionTitle\|hookEventName' internal cmd test --include='*.go'` outside `internal/claudecode/` returns nothing.

## Test Run Output

```
$ go build ./... && make test
ok  	github.com/Zalaras/muster/cmd/musterd	60.693s
ok  	github.com/Zalaras/muster/internal/claudecode	11.943s
ok  	github.com/Zalaras/muster/internal/server	86.969s
ok  	github.com/Zalaras/muster/internal/session	26.314s
... every other package ok

$ make lint
0 issues.
```
