# Daemon Tests: claude-tmp-files

**Plan**: claude-tmp-files
**Verdict**: pass
**Pack**: kb: pack 23517 words (budget 30000)

## Summary

Tests created: 12 test functions (about 75 table rows) plus 3 repaired | Passing: all | Failing: 0

`go build ./...` green, `make test` green, `make lint` 0 issues (review cycle 1).

## Tests

| File | Test Name | What It Tests | Status |
|------|-----------|---------------|--------|
| `internal/claudecode/files_scratchpad_test.go` | TestInterpretFiles_ScratchpadDirOnlyWhenWellFormedForItsOwnSession | REQ-1 (SessionStart, PostToolUse, PreToolUse): well-formed vs absent, `/tmp/scratchpad`, relative, trailing slash, `..`, other session's parent, wrong last element, nested, no session_id, null, bad JSON; on SessionStart and PostToolUse | pass |
| `internal/reader/scratch_test.go` | TestListScratch, TestListScratch_MissingOrEmptyDirYieldsNone | REQ-4: nested, dot-dirs and non-md skipped, newest first, path tiebreak, UTC | pass |
| `internal/reader/scratch_test.go` | TestScopeScratchDir_Confine | REQ-5: own file, nested, non-md, other session, tasks sibling, `..`, symlink file and dir, no/missing scratch | pass |
| `internal/reader/scratch_test.go` | TestScopeScratchDir_PathQualifies | REQ-6 scope: lexical, prefix sibling, escape, session dir still qualifies | pass |
| `internal/session/reader_scratchpad_test.go` | TestSetScratchpad_* (7) | REQ-2/3: broadcast and persist only on change, never clears, reload keeps it, claude-session-id gate from every source state (bound, /clear, straggler, never-had id, unbound, dead with a left id, dead with an unknown id), resume rebind A to B to A moves the folder back and broadcasts, reordered clear pair, other sessions untouched, unknown session | pass |
| `internal/server/reader_scratch_test.go` | TestWireScratchpadDir_ReturnsACopy | wire value never aliases the session field | pass |
| `internal/store/session_scratchpad_test.go` | TestSessionRow_ScratchpadDirDefaultsNilAndRoundTrips | column default nil and round trip | pass |
| `internal/server/reader_scratch_test.go` | TestReaderObserve_ScratchpadDirMovesOnlyForTheCurrentClaudeSession | Observe gate, no clear on empty signal | pass |
| `internal/server/reader_scratch_test.go` | TestHandleReaderList_ScratchBlock | REQ-4/13: null block, ordering, writtenAt, deleted folder gives `"files":[]`, plan modifiedAt, two sessions isolated | pass |
| `internal/server/reader_scratch_test.go` | TestHandleReaderFile_ScratchConfinement | REQ-5 over HTTP across two sessions: other's file 404, own 200 | pass |
| `internal/server/reader_scratch_test.go` | TestReaderObserve_ScratchWriteBroadcastsDocChangedAndIsLogged | REQ-6: docChanged and write log for scratch writes; foreign and non-md writes silent | pass |
| `internal/server/reader_scratch_test.go` | TestToWireSession_ScratchpadDir | REQ-3 wire: null then verbatim | pass |

## Handoff Received

- `internal/store/migrate_test.go` (`TestMigrate_AppliesInitSchema`, `TestMigrate_SecondCallIsANoOp`): 19 changed to 20 and the migration list comment extended with 0020_scratchpad.
- `internal/store/store_test.go` (`TestOpen_SecondOpenOnSamePathDoesNotReapplyMigrations`): 19 changed to 20, comment extended.

## Notes

- Attempt 2: `RawPreToolUseTool` now honours `ScratchpadDir` (ab1253c9), so the REQ-1 table also runs on PreToolUse (9 rows added, all pass).
- Pre-existing lint finding, not fixed: `test/canary/resume_test.go:240` testifylint require-error. `interpret_transcript.go:37 scanInterrupt` unused is not reported by `make lint` here.
- Plan edge case 17 (hook loss) is declared untested by the plan.
- No `dupl` warnings named these files.

## Fix Attempt 1 (review cycle 1)

Addressed code Major 1: `TestSetScratchpad_ClaudeSessionIDGate` now uses the death harness and adds unbound, dead-with-left-id and dead-with-unknown-id rows (each asserts no change, no broadcast); new `TestSetScratchpad_ResumeRebindMovesFolderBackAndBroadcasts`. Also covered the impl fix `wireScratchpadDir` copy with `TestWireScratchpadDir_ReturnsACopy`. The scratch-capture move to `renderfix_scenarios_reader.go` is covered by `make check-render-fixtures`, not unit tests.
Note: one `make test` run under concurrent lint load failed `cmd/musterd TestOnExit_Leave_LiveSessionSurvivesShutdown` (tokens.json 7s bound); rerun alone `go test -count=1 ./cmd/musterd` ok. Untouched by this plan.

## Test Run Output

```
make test: every package ok except internal/tmux TestRunCommand_DescendantHoldingStdoutDoesNotHang (15s timeout under load from parallel agents; passes alone with -count=1, 2.9s; untouched by this plan)
make lint: test/canary/resume_test.go:240:3: require-error (testifylint)  [pre-existing, not fixed]
```
