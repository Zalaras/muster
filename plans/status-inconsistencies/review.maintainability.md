# Maintainability review: Status Inconsistencies

**Plan**: status-inconsistencies
**Verdict**: approved
**Cycle**: 2
**Pack**: kb: pack 33934 words (budget 20000)
**Scope**: 25 files from `git diff main...HEAD -- cmd internal web/src ':!*_test.go' ':!*.test.ts'` (four are generated CLAUDE.md trailers). Since cycle 1 (`b82e324..HEAD`), six non-test files changed: claudecodetest.go, interpret_transcript.go, server.go, machine.go, manager.go, protocol/session.ts. The other 19 files have not changed since cycle 1, and their cycle-1 rows are carried below.

## Delta

| Prior Minor | Fix commit | Verified how |
|-------------|------------|--------------|
| 1: `applyInput` grew with no reason given; main.go filelen had no reason | 69adef7 | The KindTurnClosed and KindTurnInterrupted arms are now `applyTurnClosed` (`machine.go:222`) and `applyTurnInterrupted` (`machine.go:249`). Each arm is now one call, the same shape as `interpret*` in claudecode. Gates `15-size.log`: `applyInput` is 51 statements, below main's 52. The split pulls out two whole owner-logic arms, so it is a real restructure and does more than silence the warning. Decisions gives a reason for main.go 513→515: the two lines are the wiring in the composition root. That reason holds (`main.go:422`). |
| 2: interrupt-checker seam declared inline three times | 69adef7 | `type InterruptChecker func(path, promptID string) (bool, error)` is declared once at `internal/session/manager.go:102`. `session.Config` (`:96`), the Manager field (`:118`) and `server.Config` (`server.go:66`) all use it. `rg 'func\(path, promptID\|func\(transcriptPath' internal cmd` finds no inline copies left. |
| 3: `scanInterrupt` uses a second line reader with no design line | 69adef7 | The comment at `interpret_transcript.go:38-42` and a `design:` line in the cycle-1 Decisions both say why it reads with `bufio.Reader`: Scanner has a 1 MiB cap and ends the whole scan on an over-long line, which would hide an interrupt that comes after a large tool_result line. This is the reason the Minor asked for, and it holds. |
| 4: subagent marker written four times in two shapes | 69adef7 | `markSubagent` (`claudecodetest.go:231`) is the only place `agent_type` is set. `rg 'agent_type' internal --glob '!*_test.go'` finds one assignment, at `:236`. All four builders call it. `RawPermissionRequest` delegates with `""`, and the decode/re-encode is gone. |
| 5: only `backgroundTasks` is range-checked, with no reason given | 838e02f, c4fe5d5 | A comment at `web/src/protocol/session.ts:292` and a `design:` line in the web Decisions give the reason: the contract types this field "integer >= 0", and W4 pins that range. The reason holds. |

## Files

| File | Siblings opened | design: line | Size warnings | Result |
|------|-----------------|--------------|---------------|--------|
| cmd/musterd/main.go | server.go wiring | size line (cycle-1 fix) | filelen 515, reason holds; parseFlags/run 45/44, same as main | pass |
| internal/claudecode/CLAUDE.md | (generated trailer) | n/a | none | pass |
| internal/claudecode/claudecodetest/claudecodetest.go | RawPostToolUseFile, RawPreToolUseTool, RawPostToolBatch, marshal/orDefault helpers | size line; markSubagent is explained at the helper | filelen 619, reason holds | pass |
| internal/claudecode/interpret.go | files.go, status.go | yes (AgentUnknown) | none | pass |
| internal/claudecode/interpret_transcript.go | launchtranscripts.go (`transcriptScan.scanChunk`), plan.go | yes (cycle-1 fix) | none | pass |
| internal/claudecode/settings.go | (comment/list edit) | n/a | none | pass |
| internal/server/server.go | shellactivity.go (`ttyCanonicalChecker`), sessionwire.go | yes | New 43, same as main | pass |
| internal/server/sessionwire.go | server.go | n/a (field add) | none | pass |
| internal/session/CLAUDE.md | (generated trailer) | n/a | none | pass |
| internal/session/apply.go | machine.go, writeorder.go | n/a | none | pass |
| internal/session/interrupt.go | liveness.go (checkLiveness, collectSessions) | yes | none | pass |
| internal/session/liveness.go | interrupt.go | yes | none | pass |
| internal/session/machine.go | session.go, apply.go, claudecode/interpret.go | yes | applyInput 51 (main 52), restructured | pass |
| internal/session/manager.go | liveness.go, server.go; PaneChecker/PaneSnapshotter/TmuxSessions/Watcher port types | yes (InterruptChecker) | filelen 564 (559 at cycle 1; the +5 is the named seam asked for); reason holds | pass |
| internal/session/row.go | store/session.go | n/a (field add) | none | pass |
| internal/session/session.go | machine.go | yes (clearAttention; guard named on fields) | none | pass |
| internal/session/writeorder.go | row.go | yes (doc-delta line) | none | pass |
| internal/store/migrations/0011_turn_state.sql | 0010_pending_resume.sql | n/a | none | pass |
| internal/store/session.go | migrations/0011 | n/a (field add) | none | pass |
| web/src/protocol/session.ts | same file's compactions/railPos checks, decode.ts | yes (cycle-1 fix) | none | pass |
| web/src/render/CLAUDE.md | (generated trailer) | n/a | none | pass |
| web/src/render/sessions.ts | tiles.ts, mainhead.ts | yes | none | pass |
| web/src/sessions/CLAUDE.md | (generated trailer) | n/a | none | pass |
| web/src/sessions/card.ts | permission.ts, render/update.ts | yes | none | pass |
| web/src/style.css | neighbouring `.card` rules | n/a | none | pass |

## Issues

### Critical

### Major

### Minor

### Notes
1. **[note]** `internal/session/manager.go:102`: the other injected ports in this file (`PaneChecker` `:20`, `PaneSnapshotter` `:27`, `TmuxSessions` `:38`, `Watcher` `:49`) are grouped in one block ahead of `Config`. `InterruptChecker` is declared after `Config`. The `Config.InterruptChecker` field comment (`:93-95`) also repeats the type's first sentence. Both are placement and taste, so no change is requested.
2. **[note]** The shared-state analysis from cycle 1 still holds. `applyTurnClosed` and `applyTurnInterrupted` are called only from `applyInput`, under `Manager.mu`, and each says "Callers hold the manager's lock". `applyTurnInterrupted` keeps the recheck under the lock (`currentPromptID`/`inOpenTurn`).
3. **[note]** The size warnings that remain are unchanged from main or have a reason in Decisions that holds: `server.go` `New` 43, `main.go` `parseFlags`/`run` 45/44, filelen on `claudecodetest.go`/`manager.go`/`main.go`. The test-file funlen hits are test bodies and not `dupl` duplicates, so none is filed.
4. **[note]** The new injected edge (cmd/musterd → `claudecode.PromptInterrupted` → session sweep) belongs to review-work's DIAG row. Commit 21971eb says the diagrams now name the interrupt read.
