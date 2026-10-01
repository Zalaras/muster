# Maintainability review: Status Inconsistencies

**Plan**: status-inconsistencies
**Verdict**: needs-changes
**Cycle**: 1
**Pack**: kb: pack 33917 words (budget 20000)
**Scope**: 25 files from `git diff main...HEAD -- cmd internal web/src ':!*_test.go' ':!*.test.ts'` (four are generated CLAUDE.md trailers)

## Files

| File | Siblings opened | design: line | Size warnings | Result |
|------|-----------------|--------------|---------------|--------|
| cmd/musterd/main.go | (composition root) server.go wiring | n/a (one registration line) | filelen 513→515, parseFlags/run unchanged (45/44 on main); no reason given | Minor 1 |
| internal/claudecode/CLAUDE.md | (generated trailer) | n/a | none | pass |
| internal/claudecode/claudecodetest/claudecodetest.go | same file's builders (RawPostToolUseFile, RawPreToolUseTool, RawNotification, PlanAttachmentLine, SlugLine) | size reason only | filelen 536→621; reason holds | Minor 4 |
| internal/claudecode/interpret.go | files.go, status.go | yes (AgentUnknown) | none | pass |
| internal/claudecode/interpret_transcript.go | launchtranscripts.go, plan.go | no line for the file (sweep line covers the session side) | none | Minor 3 |
| internal/claudecode/settings.go | — (comment/list edit) | n/a | none | pass |
| internal/server/server.go | shellactivity.go, sessionwire.go | yes (via sweep line) | New 43 (unchanged from main) | Minor 2 |
| internal/server/sessionwire.go | server.go | n/a (field add) | none | pass |
| internal/session/CLAUDE.md | (generated trailer) | n/a | none | pass |
| internal/session/apply.go | machine.go, writeorder.go | n/a (helper beside isBindKind) | none | pass |
| internal/session/interrupt.go | liveness.go (checkLiveness, collectSessions) | yes | none | pass |
| internal/session/liveness.go | interrupt.go | yes | none | pass |
| internal/session/machine.go | session.go, apply.go, interpret.go | yes (clearAttention, idle guard) | applyInput 52→68; no reason given | Minor 1 |
| internal/session/manager.go | liveness.go, server.go | yes (via sweep line) | filelen 551→559; reason holds | Minor 2 |
| internal/session/row.go | store/session.go | n/a (field add) | none | pass |
| internal/session/session.go | machine.go | yes (clearAttention; guard named on fields) | none | pass |
| internal/session/writeorder.go | row.go | yes (doc-delta line) | none | pass |
| internal/store/migrations/0011_turn_state.sql | 0010_pending_resume.sql | n/a | none | pass |
| internal/store/session.go | migrations/0011 | n/a (field add) | none | pass |
| web/src/protocol/session.ts | decode.ts, hello.ts, same file's parseContext | no | none | Minor 5 |
| web/src/render/CLAUDE.md | (generated trailer) | n/a | none | pass |
| web/src/render/sessions.ts | tiles.ts, mainhead.ts | yes | none | pass |
| web/src/sessions/CLAUDE.md | (generated trailer) | n/a | none | pass |
| web/src/sessions/card.ts | permission.ts, render/update.ts | yes | none | pass |
| web/src/style.css | neighbouring `.card` rules | n/a | none | pass |

## Issues

### Critical

### Major

### Minor
1. **[daemon-impl]** `internal/session/machine.go:23` `applyInput` grew from 52 statements on `main` (measured: `golangci-lint run --enable-only funlen` on a `main` worktree, `'applyInput' has too many statements (52 > 40)`) to 68 on this branch (gates `15-size.log`), and `daemon-implementation.md` § Decisions gives no reason for it (its only size line covers `claudecodetest.go` and `manager.go`). `cmd/musterd/main.go` is in the same position: filelen 513 → 515, no reason given. Cites review question 6 / kb:adr/process-size-linters-warn-never-fail. The sibling `internal/claudecode/interpret.go` pulls its larger arms into named functions (`interpretStop`, `interpretNotification`, `interpretSessionStart`). A fix must leave either a reason in Decisions that the code bears out, or an `applyInput` whose switch arms can be read without scrolling through the new KindTurnClosed/KindTurnInterrupted owner logic. A split that only silences the warning does not count. For main.go, one line of reason is enough.
2. **[daemon-impl]** The interrupt-checker seam is written as an inline func type three times, with two different parameter names: `internal/server/server.go:66` `InterruptChecker func(transcriptPath, promptID string) (bool, error)`, `internal/session/manager.go:96` `InterruptChecker func(path, promptID string) (bool, error)`, `internal/session/manager.go:113` `interruptChecker func(path, promptID string) (bool, error)`. The sibling seams have names: `internal/server/server.go` `Attach attachFunc`, and `internal/server/shellactivity.go:36` `type ttyCanonicalChecker func(ttyPath string) (bool, error)`. `internal/session/manager.go:20` declares `PaneChecker` as a named interface. A fix must give the seam one name, declared once in `internal/session` and referenced by both Configs and the Manager field, so a signature change happens in one place.
3. **[daemon-impl]** `internal/claudecode/interpret_transcript.go:303` `scanInterrupt` is a second way to walk a transcript tail's JSONL lines in this package. It uses `bufio.NewReader(r).ReadBytes('\n')`. The sibling `internal/claudecode/launchtranscripts.go:215` `transcriptScan.scanChunk` uses `bufio.NewScanner` with an explicit `scanner.Buffer(..., 1024*1024)` and says the same thing about a mid-line first line being skipped. The design line's search (`rg "PromptInterrupted|interrupt" internal/`) could not find the existing loop, and no `design:` line covers the new file. Cites conventions § Design "reuse before add" and review question 2. A fix must leave either one line-iteration path shared by both readers, or a `design:` line that says why the interrupt scan needs a different reader. If the reason is that there is no 1 MiB line cap, a tail with one huge tool_result line before the interrupt line would make Scanner stop early, and the line should say so.
4. **[daemon-impl]** `internal/claudecode/claudecodetest/claudecodetest.go:255` `RawSubagentPermissionRequest` adds the subagent marker by decoding `RawPermissionRequest`'s JSON output and encoding it again. The sibling builders do it another way: `RawPostToolUseFile` (`:158`), `RawPreToolUseTool` (`:181`) and the new `RawPostToolBatch` (`:276`) each take `ToolFileOpts.AgentID` and set `agent_id`/`agent_type` inline. The marker is now written in four places, in two shapes, and the builder that decodes its own output is the one a newcomer would not expect. The file's rows for the other builders show the pattern. A fix must leave one way for a builder in this file to add the subagent marker. That can be a shared helper or opts on `RawPermissionRequest`. Either way, `agent_type`'s value should live in one place.
5. **[web-impl]** `web/src/protocol/session.ts:292-297` validates `backgroundTasks` as `typeof === "number" && Number.isInteger && >= 0`. The sibling count fields in the same parser check only the type: `compactions` (`:214`, `typeof compactions !== "number"`) and `railPos` (`:303`, `typeof railPos !== "number"`). A negative or fractional count therefore rejects the whole session on this field alone, with no `design:` line saying why (review question 2). A fix must make the parser treat its integer counts one way: either match the siblings, or state in `web-implementation.md` § Decisions why this count alone is range-checked.

### Notes
1. **[note]** Shared state: `AttentionAgent`/`BackgroundTasks` are declared with their guard (`session.go:156-166`, "under Manager.mu"). Every writer (`rg "\.BackgroundTasks =|\.AttentionAgent =|clearAttention\(\)"`: machine.go 59/73/89/107/115/126/134/195/200/231) runs inside `applyInput`/`applyBind` under `m.mu`, and both fields are in `restoredSessionFields`. `sweepInterrupts` takes value copies through `collectSessions` under the lock, calls the checker outside it, and `KindTurnInterrupted` checks `currentPromptID`/`inOpenTurn` again under the lock. I checked the interleaving checker(P)=true → Stop(P) → UserPromptSubmit(P2) → Apply(P): it is a no-op. I found no unguarded path.
2. **[note]** Reuse is good in several places. `PromptInterrupted` reuses `readTail`/`transcriptTailBytes` (launchtranscripts.go:285/40). `sweepInterrupts` mirrors `checkLiveness`'s `collectSessions` shape. `interpretStop` follows the sibling `interpret*` helpers. `backgroundLine` sits beside `repoLine`/`activityLines` as a pure view-model function. Hiding an empty `.acts-row` reuses `reconcileActsRow`.
3. **[note]** `interpret_transcript.go`'s `interpret_` prefix reads as part of the hook `Interpret` family, but the function is a transcript reader wired through cmd/musterd and is never called by `Interpret`. The sibling transcript readers are `launchtranscripts.go` and `plan.go`. The name is a matter of taste; no change requested.
4. **[note]** The new injected edge (cmd/musterd → `claudecode.PromptInterrupted` → `session.Manager` sweep) belongs to review-work's DIAG row: check that `kb:diagram/daemon-components` shows it.
5. **[note]** The singular/plural handling in `sessions/card.ts:321` (`n === 1 ? "1 background task" : ...`) sits beside a similar one at `render/update.ts:101` (`shells.length === 1 ? "shell" : "shells"`). Two uses do not yet justify a helper.
6. **[note]** The size warnings that already existed and did not grow, `server.go` `New` (43) and `cmd/musterd/main.go` `parseFlags`/`run` (45/44), measure the same on `main`. The `claudecodetest.go` (621) and `manager.go` (559) filelen hits have a reason in Decisions that holds.
