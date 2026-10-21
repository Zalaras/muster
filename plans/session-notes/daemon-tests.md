# Daemon Tests: Session notes

**Plan**: session-notes
**Verdict**: pass
**Pack**: kb: pack 25877 words (budget 30000)

## Summary

Tests created: 651 (counting every subtest of the note tests plus the migration tests) | Passing: 651 | Failing: 0

New top-level tests: 13 in `internal/session/note_test.go` and `internal/server/note_test.go`, 1 in `internal/store/session_test.go`; 4 existing files extended or brought up to contract (see Handoff Received).

## Tests

| File | Test Name | What It Tests | Status |
|------|-----------|---------------|--------|
| `internal/session/note_test.go` | TestSetNote_StoresTextVerbatimAndBlankAsNull | D1, D2, edge 6/7: 16 steps on one session, changed flag, upsert count and payload, store equals memory (verbatim padding, CRLF, frontmatter, 100 KB text, blank and null clear, repeat is no-op) | pass |
| `internal/session/note_test.go` | TestSetNote_UnknownSession | `ErrUnknownSession`, no broadcast | pass |
| `internal/session/note_test.go` | TestSetNote_DoesNotMutateAnEarlierClone | a changed note is a fresh pointer, a clone from `Get` keeps the old text | pass |
| `internal/session/note_test.go` | TestSetNote_NoteSurvivesTheSessionsLifeAndRemoveDeletesIt | D5, D6, REQ-4: set while dead, restart, resume, End keep it; Remove deletes it with the row while a second session's note stays (memory and store) | pass |
| `internal/session/note_test.go` | TestSetNote_ConcurrentWritesLeaveMemoryAndStoreAgreeing | 12 concurrent writers, memory and store agree on the winner (also run under `-race`) | pass |
| `internal/session/note_test.go` | TestNote_INV1_EveryInputFromEveryState | D4 / INV-1: 9 source states (started, working, needs_input, failed, idle, dead, after /clear rebind, after resume, after daemon restart) x 36 inputs (all 14 `InputKind`s as enveloped hooks, implicit and explicit rebind to a new id, straggler from the previous id, status posts, liveness death and tick, End, RecordResume, RepairOwnedSession, Reconcile with every pane present and with the socket empty, daemon restart, SetTranscript, ApplyPlanScan, SetTitle, SetPinned, ClearEffortWarning, MarkSeen); target and bystander note unchanged in memory and in the store | pass |
| `internal/session/note_test.go` | TestNote_INV1_ASessionWithNoNoteGainsNoneFromAnyInput | the null half: same cross, a null note stays null | pass |
| `internal/server/note_test.go` | TestHandleSetNote_RequiresCookie | 401 without the UI cookie, nothing stored | pass |
| `internal/server/note_test.go` | TestHandleSetNote_204StoresPerTheContract | D2 via the handler: 10 rows (verbatim padding, CRLF, unicode, empty/whitespace/null clear, replace, extra keys), 204 empty body, store and live session agree | pass |
| `internal/server/note_test.go` | TestHandleSetNote_400LeavesTheNoteAndNeverBroadcasts | D3: 9 bad bodies (no body, not JSON, truncated, missing key, other key, number, bool, array, object), envelope `invalid_request` / `note must be a string or null`, note kept, no upsert | pass |
| `internal/server/note_test.go` | TestHandleSetNote_404ForAnUnknownSession | D3: unknown id and non-numeric id give `unknown_session` / `unknown session id`; a bystander's note untouched | pass |
| `internal/server/note_test.go` | TestHandleSetNote_413OverTheBodyBound | D3: 21 MiB gives 413 `request_too_large` / `note is too large to save`, nothing stored, no upsert; a 3.4 MB note under the bound is stored whole | pass |
| `internal/server/note_test.go` | TestHandleSetNote_BroadcastsExactlyOncePerChange | D1: one upsert per change carrying the whole note (`null` when cleared), repeats and repeated clears broadcast nothing, a second session never broadcast | pass |
| `internal/server/note_test.go` | TestHandleSetNote_DeadSessionsNoteCanBeSet | D6: alive=false session, 204, stored, upsert with `alive:false` and the note | pass |
| `internal/server/note_test.go` | TestSessionWire_EverySessionCarriesTheNoteKey | D8: the `note` key is present on every snapshot session (null, padded text, ended-session text) and on `toWireSession` | pass |
| `internal/store/session_test.go` | TestSession_NoteColumnDefaultsNilAndRoundTripsTextByteForByte | REQ-1/D5 at the store: NULL default, six texts byte for byte, clear persists NULL not "", another row untouched, `ListSessions` scans it | pass |
| `internal/server/issue_test.go` | TestBuildIssueSnapshot_HardExclusionsNeverLeak_* (existing, extended) | D7: `fullyPopulatedSession` now carries a note and `hardExclusionSentinels` gains it, so snapshot JSON, markdown and composed body are checked for the note's text from all six states | pass |
| `internal/session/manager_writeorder_test.go` | TestPersistFailure_RollsBackEveryMutationUniformly/SetNote (new row) | a failed persist rolls the note back and broadcasts nothing | pass |
| `internal/session/manager_writeorder_test.go` | TestCheckSessionFieldCoverage_* (existing, unchanged) | `Note` is in the restored-field partition; it still passes | pass |

## Handoff Received

- `internal/store/migrate_test.go` (`TestMigrate_AppliesInitSchema`, `TestMigrate_SecondCallIsANoOp`): expected migration count and max version 17 changed to 18; comments name `0018_note.sql`.
- `internal/store/store_test.go` (`TestOpen_SecondOpenOnSamePathDoesNotReapplyMigrations`): expected count 17 changed to 18, comment extended.
- D1-D8 tests: written as listed above. REQ-5/D7 changes no production code (allowlist), so the test is the sentinel extension.

## Implementation Bugs (if verdict = implementation-bug)

None.

## Notes

- Mutation proof (throwaway `git archive` copy under the scratchpad, shared tree untouched): (1) `applyBind` clearing `sess.Note` made 54 `TestNote_INV1_EveryInputFromEveryState` subtests fail; (2) `SetNote` storing `strings.TrimSpace(*note)` failed `TestSetNote_StoresTextVerbatimAndBlankAsNull`; (3) removing the unchanged-compare in `SetNote` failed `TestHandleSetNote_BroadcastsExactlyOncePerChange`.
- Reconcile with the socket empty deletes an already-dead row (documented sweep). From the `dead` state that input asserts the row and its note are gone and the bystander is intact, instead of the note-unchanged check. This is the `sweepsDead` field on `noteInput`.
- `assertNoSessionUpsertArrives` closes the socket on its timed-out read (coder/websocket), so in the broadcast test a no-op PUT is proven silent by the next real change's upsert being the next message, and the quiet read is used once at the end of each socket.
- `size-warn`: `noteDaemonInputs` is 70 lines against the 60 funlen warning. It is a flat table of one-line-per-input rows; splitting it further would only separate related rows. No `dupl` line names a note file.
- Declined: edge case 5 (hook loss) has no input path, per the plan's own "untested" line. E2E-level journeys (E6 daemon restart in a live browser) are the e2e suite's.
- `make test` run 1 had two failures outside this plan's files, both load-sensitive (machine load average 15 while web-impl ran): `cmd/musterd` `TestOnExit_Leave_LiveSessionSurvivesShutdown` (tokens.json bound) and `internal/tmux` `TestRunCommand_DescendantHoldingStdoutDoesNotHang` (15 s bound). Both passed on an isolated re-run (`go test -count=1 ./internal/tmux/ ./cmd/musterd/` ok). Every other package passed, and `internal/session`, `internal/server`, `internal/store` passed again after the lint fixes. The note tests also pass under `-race`.
- Web files modified in the tree belong to web-impl and were not touched.

## Test Run Output

```
go build ./...                         ok
make lint                              golangci-lint run -> 0 issues
make test (run 1)                      FAIL: cmd/musterd, internal/tmux (load-sensitive, unrelated; pass in isolation)
go test -count=1 ./internal/tmux/ ./cmd/musterd/
ok  	github.com/Zalaras/muster/internal/tmux	10.798s
ok  	github.com/Zalaras/muster/cmd/musterd	52.366s
go test -count=1 ./internal/session/ ./internal/server/ ./internal/store/
ok  	github.com/Zalaras/muster/internal/session	51.302s
ok  	github.com/Zalaras/muster/internal/server	119.551s
ok  	github.com/Zalaras/muster/internal/store	13.341s
go test -race -count=1 (Note|PersistFailure|Snapshot subsets of session and server)   ok
```
