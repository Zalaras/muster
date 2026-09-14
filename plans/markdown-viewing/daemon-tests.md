# Daemon Tests: Markdown viewing

**Plan**: markdown-viewing
**Verdict**: pass
**Pack**: `kb: pack 23220 words` / `kb: WARN pack exceeds budget of 8000 words` (features: reader, surfaces, lifecycle, ingest)

## Summary

Tests created: 55 (across 4 new files + 3 appended test functions in existing files) | Passing: all | Failing: 0

Also applied the sanctioned test breakage fix handed off by daemon-impl: bumped the
hardcoded migration count from 7 to 8 in `internal/store/migrate_test.go` (two spots)
and `internal/store/store_test.go` (0008_reader.sql was added).

## Tests

| File | Test | What It Tests | Status |
|------|------|----------------|--------|
| `internal/claudecode/plan_test.go` | `TestLocatePlanFile` (+8 subtests) | D5/guard: plan_mode/plan_mode_exit/plan_mode_reentry attachment lines, slug fallback, planFilePath precedence over slug, most-recent-line-wins, no-marker and missing-transcript are the empty answer (never an error) | pass |
| `internal/claudecode/plan_test.go` | `TestDefaultPlansDir` | pure `<home>/.claude/plans` join | pass |
| `internal/claudecode/plan_test.go` | `TestIsUnderDefaultPlansDir` | REQ-16 trigger; a sibling dir sharing the "plans" string prefix must not count as under it | pass |
| `internal/claudecode/files_test.go` | `TestInterpretFiles` (11 subtests) | D6: written path only for PostToolUse Write/Edit/MultiEdit, PlanMaybeReady exactly for SessionStart / PreToolUse+PostToolUse ExitPlanMode, transcript path on every event type | pass |
| `internal/claudecode/files_test.go` | `TestInterpretFiles_WrittenPathUnderDefaultPlansDirIsAScanTrigger` / `..NotAScanTrigger` | D6's third PlanMaybeReady trigger and its negative | pass |
| `internal/store/session_test.go` | `TestInsertSession_ReaderFieldsDefaultNilAndFalse` | new columns default NULL/0 | pass |
| `internal/store/session_test.go` | `TestUpdateSession_ReaderFieldsRoundTrip` | D14 (store half): transcript_file/plan_path/plan_exists round-trip, clearing plan_path back to NULL doesn't touch transcript_file | pass |
| `internal/session/reader_test.go` | `TestSetTranscript_PersistsOnlyOnChangeAndNeverBroadcasts` | D15 | pass |
| `internal/session/reader_test.go` | `TestSetTranscript_RefusesWhenClaudeSessionIDDoesNotMatchCurrentBinding` | REQ-26/INV-8 (transcript half) | pass |
| `internal/session/reader_test.go` | `TestSetTranscript_UnknownSessionReturnsErrUnknownSession` | error path | pass |
| `internal/session/reader_test.go` | `TestSetPlan_BroadcastsOnlyOnARealChange` (3 subtests) | persist+broadcast only on real change | pass |
| `internal/session/reader_test.go` | `TestSetPlan_RefusesWhenClaudeSessionIDDoesNotMatchCurrentBinding` | REQ-26/INV-8 (plan half) | pass |
| `internal/session/reader_test.go` | `TestSetPlan_UnknownSessionReturnsErrUnknownSession` | error path | pass |
| `internal/session/reader_test.go` | `TestReaderFields_RoundTripThroughLoadAll` | D14 (manager half): survives a fresh `Manager.LoadAll` over the same store | pass |
| `internal/server/reader_test.go` | `TestConfine` (10 subtests) | D11/INV-2 from every listed entry point: plain file, `..`, symlink-to-outside-file, symlinked directory, plan path (allowed outside dir), non-.md, `-agent-`/`.workshop.md` siblings, empty planPath | pass |
| `internal/server/reader_test.go` | `TestReaderPathQualifies` (7 subtests) | REQ-18's lexical (non-symlink) docChanged scope test | pass |
| `internal/server/reader_test.go` | `TestWalkMarkdown` / `..CapsAt20000AndReportsTruncated` | D8/REQ-10/REQ-25: dot-dir skip, case-insensitive `.md`, sort, 20,000 cap + truncated | pass |
| `internal/server/reader_test.go` | `TestListMarkdown_GitSuccessFiltersToMarkdownAndSorts` / `..GitFailureFallsBackToWalk` | D7, via the injectable `readerExecFunc` (no real git binary executed) | pass |
| `internal/server/reader_test.go` | `TestWriteLog` (3 subtests) | record/get/forget, 512-entry cap drops exactly the oldest | pass |
| `internal/server/reader_test.go` | `TestHandleReaderList_*` (7 tests) | cookie auth, unknown session 404, D18 directory_missing 409, D9 (both halves, including broadcast-before-response), D19 writtenAt | pass |
| `internal/server/reader_test.go` | `TestHandleReaderFile_*` (6 tests, several subtests) | cookie auth, unknown session 404, D10 exact bytes + headers, 400 invalid_request, D11 404s + the plan-outside-dir 200, D12 size cap at exactly/over 10 MiB | pass |
| `internal/server/reader_test.go` | `TestReaderObserve_*` (3 tests) | D13: plan-exists-before-docChanged ordering, ordinary write broadcasts docChanged only, non-qualifying write broadcasts nothing | pass |
| `internal/server/reader_test.go` | `TestIngestRouting_SubagentMarkedWriteBroadcastsDocChanged` | D16, full ingest pipeline | pass |
| `internal/server/reader_test.go` | `TestIngestRouting_UnroutedWriteBroadcastsNothing` | D13's unrouted clause, full ingest pipeline | pass |
| `internal/server/reader_test.go` | `TestIngestRouting_StragglerFromBeforeAClearNeverMovesTranscriptOrPlan` | D20/INV-8, full ingest pipeline: SessionEnd, PostToolUse Write, PreToolUse ExitPlanMode all naming the pre-`/clear` id | pass |
| `internal/server/sessionwire_test.go` | `TestToWireSessionPlan` (+ one added assertion in the existing minimal-shape test) | `toWireSessionPlan`: null unresolved, path+exists verbatim otherwise | pass |

## Implementation Bugs

None found. Every daemon-side REQ/D/INV item this agent owns matched the plan and protocol contract as implemented.

## Test Run Output

```
$ go build ./...
(clean)

$ go vet ./...
(clean)

$ gofmt -l internal/claudecode/plan_test.go internal/claudecode/files_test.go internal/session/reader_test.go internal/server/reader_test.go internal/server/sessionwire_test.go internal/store/session_test.go internal/store/migrate_test.go internal/store/store_test.go
(clean)

$ make lint
golangci-lint run
0 issues.

$ python3 .claude/skills/orchestrate/scripts/dead-refs.py
dead-refs: 795 references checked, 0 missing

$ make test
go test -count=1 ./...
ok  	github.com/Zalaras/muster/cmd/musterd	23.842s
ok  	github.com/Zalaras/muster/internal/claudecode	20.925s
?   	github.com/Zalaras/muster/internal/claudecode/claudecodetest	[no test files]
ok  	github.com/Zalaras/muster/internal/ghissue	3.146s
ok  	github.com/Zalaras/muster/internal/gitutil	1.935s
ok  	github.com/Zalaras/muster/internal/kb	4.312s
ok  	github.com/Zalaras/muster/internal/locate	2.465s
ok  	github.com/Zalaras/muster/internal/selfupdate	4.401s
ok  	github.com/Zalaras/muster/internal/server	30.386s
ok  	github.com/Zalaras/muster/internal/session	6.687s
ok  	github.com/Zalaras/muster/internal/store	6.755s
ok  	github.com/Zalaras/muster/internal/termbridge	8.019s
ok  	github.com/Zalaras/muster/internal/tmux	18.822s
ok  	github.com/Zalaras/muster/internal/tmux/tmuxtest	6.860s
ok  	github.com/Zalaras/muster/internal/triage	6.912s
ok  	github.com/Zalaras/muster/internal/usage	7.530s
ok  	github.com/Zalaras/muster/internal/webui	6.721s
?   	github.com/Zalaras/muster/test/rig/capture	[no test files]
?   	github.com/Zalaras/muster/test/rig/failproxy	[no test files]
ok  	github.com/Zalaras/muster/tools/kb	7.331s
ok  	github.com/Zalaras/muster/tools/triage	5.443s
ok  	github.com/Zalaras/muster/tools/versions	14.271s
```

## Notes for review

- `writeLog` and `confine`/`readerPathQualifies`/`walkMarkdown`/`listMarkdown` are tested as pure/near-pure functions directly (white-box, same package) rather than only through HTTP, per conventions ("the logic the whole tool rests on gets exhaustive unit tests").
- No test executes the real `git` binary through `readerExecFunc` (reader.go's own doc comment) — `TestListMarkdown_Git*` inject a fake. Full-server HTTP tests do incidentally run the *real* production `readerRunGit` against non-git temp directories (an unavoidable side effect of using the real server wiring for D9/D18/D19/D13/D16/D20), but none of those tests assert anything about git's behavior — the fallback to `"walk"` is asserted as a side observation, not the point of the test.
- D20 (INV-8's full scenario) is exercised through the real ingest HTTP pipeline rather than a direct `Observe` call, since it is specifically about `ingest.go`'s wiring (`ev.SessionID` passed as `Observe`'s `claudeSessionID`) interacting with `Manager.Apply`'s monotonic-rebind guard — a call built by hand into `Observe` would not prove the two are wired together correctly.
- D4 (the boundary grep), D17 (no mutating reader route) and W-numbered items are Automated Checks / web-tests' responsibility per the plan's own Automated Checks block and are not duplicated here.
- Left `plans/markdown-viewing/plan.md` and everything under `web/**` untouched — web-impl was still running in parallel per the orchestrator's instructions.
