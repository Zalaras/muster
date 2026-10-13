# Maintainability review: State Issues

**Plan**: state-issues
**Verdict**: approved
**Cycle**: 2
**Pack**: kb: pack 13227 words (budget 30000)
**Scope**: 8 files from `git diff main...HEAD -- cmd internal web/src ':!*_test.go' ':!*.test.ts'` (6 Go, 2 generated CLAUDE.md trailers). This is a full review, not a delta: cycle 1 had a Major. Cycle-1 fixes were checked against `git diff 5d454de3..HEAD`.

## Cycle 1 follow-up

| Cycle-1 issue | Fix commit | Verified how |
|---------------|-----------|--------------|
| Major 1: a second home for the rebind decision in `applyCompactionEnded` | e8b239fc | `isBindKind` (`apply.go:128-135`) is main's three kinds again, so a compact SessionStart goes through `Apply`'s one monotonic guard (`apply.go:59-79`). The post-`applyInput` `byClaude` write (`apply.go:85`) is `KindBind \|\| KindClearRebind` again. `applyCompactionEnded` (`machine.go:283`) only gates `bindIdentity` on `sess.ClaudeSessionID == claudeSessionID` and no longer chooses between rebind and straggler. Recorded in a `design:` line in Fix Attempt 1 and in kb:adr/lifecycle-compaction-end-monotonic. Fixed. |
| Minor 1: the idle-landing tail had four copies | e8b239fc | `endTurnIntoIdle` (`machine.go:211`) is the only home of clear attention, clear failure, set idle and return `true`. `applyTurnClosed`, `applyTurnInterrupted`, `applyIdleNotice` and `applyCompactionEnded` each call it once (`machine.go:239, 251, 266, 291`). The `design:` line explains why `closePrompt` stays at the call sites (the order and condition differ), and the code agrees. Fixed. |
| Note 1: the comment pass dropped doc blocks that were on main | 660dff46, then 35a18a87 | Apply's doc, restoreChangedFields' policy and the wait-ownership doc are back. Cycle 2's pass dropped 3 blocks (`comment-pass.json` cycle 2). The orchestrator has made this the comment pass's call. See Note 1 below. |

## Files

| File | Siblings opened | design: line | Size warnings | Result |
|------|-----------------|--------------|---------------|--------|
| internal/session/machine.go | apply.go, session.go, writeorder.go, interrupt.go | yes (bindIdentity, endTurnIntoIdle, turnEnded, latchPermissionMode, kind renames) | funlen `applyInput` 51>40. The reason holds: the count is the same as main because the new arms are helpers. | pass |
| internal/session/apply.go | machine.go, writeorder.go, manager.go | yes (turnEnded replaces closesTurn; forward-or-straggler lives only in Apply) | none | pass |
| internal/session/session.go | machine.go, writeorder.go | yes (compactionPromptID, permissionWaitOwnedByOther via Attention.Reason) | none | pass, Note 2 |
| internal/session/writeorder.go | session.go, apply.go | covered by the compactionPromptID line | none | pass |
| internal/claudecode/interpret.go | interpretSessionStart / interpretNotification / the PermissionRequest arm in the same file | yes (kind renames). The StopFailure `agent_id` read matches the `agentOf` use in the sibling arms. | none | pass |
| internal/claudecode/claudecodetest/claudecodetest.go | RawStop / RawPermissionRequest / RawPreToolUse in the same file | n/a (fixture field) | filelen 629>500. This predates the branch (630 at main). | note (cycle 1 Note 4) |
| internal/claudecode/CLAUDE.md | generated trailer | n/a | none | pass |
| internal/session/CLAUDE.md | generated trailer | n/a | none | pass |

## Issues

### Critical

### Major

### Minor

### Notes

1. **[note]** The cycle-2 comment pass dropped three blocks. One is the pending-resume graduation rationale that sat above `sess.pendingResumeClaudeSessionID = ""` (now `machine.go:191`, `bindIdentity`). It was the only place that said why a bind of any kind clears the pending claim (kb:adr/launch-resume-pending-hold-persisted). `bindIdentity` now runs for compaction-end too, so a newcomer who meets that line cannot tell why it is there. The second is `StateInput.FromSubagent`'s doc (`interpret.go:60`), which included the boundary sentence "internal/session sees only this neutral bool". The third is a one-line straggler comment on `machine.go:35`. The orchestrator has made this the comment pass's authority. I recorded it for `/retro`; no change is requested here.
2. **[note]** Neither `compactionPromptID` (`session.go:203`) nor `Session`'s type doc (`session.go:91-93`) names `compactionPromptID` among the in-memory guard fields. The type doc still names only `currentPromptID/closedPromptIDs`. Under conventions § Design "Shared state names its writers and its guard", the field's writers are `applyCompactionBegan` and `closePrompt`, and its guard is `Manager.mu` through `Apply`. The `design:` line in Decisions names them, and the rollback comment in writeorder.go lists the field, but the declaration does not. This is comment territory (comment pass), so I am not filing it.
3. **[note]** Race check: every write to `compactionPromptID` (`machine.go:276`, `session.go:281-282`) runs inside `Apply` under `Manager.mu`. The field appears in both `restoreChangedFields` (`writeorder.go:254`) and `restoredSessionFields`. The gates' `test` line ran `go test -race ./...`. I found no interleaving to report.
4. **[note]** For review-work, not filed here: `applyCompactionBegan` (`machine.go:269-281`) adopts `*promptID` as `currentPromptID` without the `promptClosed` check that the turn-activity arm applies before it adopts (`machine.go:42-44`). Whether a PreCompact that names an already-closed prompt can leave the card `working` with nothing able to end it (`compactionOpen` and `applyIdleNotice` both refuse a closed id) is a correctness question.
5. **[note]** `Attention.Reason` is still an untyped `string` beside the typed `State`/`PermissionMode` enums (cycle 1 Note 3). No change is requested.
