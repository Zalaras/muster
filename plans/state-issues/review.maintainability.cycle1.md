# Maintainability review: State Issues

**Plan**: state-issues
**Verdict**: needs-changes
**Cycle**: 1
**Pack**: kb pack (role review-maintainability, plan state-issues) — conventions § Go/§ Design, daemon-components diagram, lessons
**Scope**: 8 files from `git diff main...HEAD -- cmd internal web/src ':!*_test.go' ':!*.test.ts'` (6 Go, 2 generated CLAUDE.md trailers)

## Files

| File | Siblings opened | design: line | Size warnings | Result |
|------|-----------------|--------------|---------------|--------|
| internal/session/machine.go | apply.go, session.go, interrupt.go, writeorder.go | yes (bindIdentity, latchPermissionMode, turnEnded) | funlen `applyInput` 51>40, reason holds (identical at main, new arms are helpers) | Major 1, Minor 1 |
| internal/session/apply.go | machine.go, interrupt.go, manager.go | yes (turnEnded replaces closesTurn) | none | Major 1 (bind-kind list) |
| internal/session/session.go | machine.go, writeorder.go, row.go | yes (compactionPromptID, permissionWaitOwnedByOther) | none | pass |
| internal/session/writeorder.go | session.go, apply.go | covered by compactionPromptID line | none | pass |
| internal/claudecode/interpret.go | interpretStop / interpretSessionStart / interpretNotification in same file, ingest | yes (kind renames) | none | pass |
| internal/claudecode/claudecodetest/claudecodetest.go | RawStop / RawPermissionRequest / RawPreToolUse in same file | n/a (fixture field) | filelen 629>500, pre-existing (630 at main) | note |
| internal/claudecode/CLAUDE.md | — (generated trailer) | n/a | none | pass |
| internal/session/CLAUDE.md | — (generated trailer) | n/a | none | pass |

## Issues

### Critical

### Major

1. **[daemon-impl]** A second home for the rebind decision, without the original's monotonic guard — `internal/session/machine.go:279-282` (`applyCompactionEnded`: `if sess.ClaudeSessionID != "" && sess.ClaudeSessionID != claudeSessionID { applyBind(... KindClearRebind ...) }`) beside `internal/session/apply.go:31-45` (Apply's enveloped branch, which rebinds only when `byClaude[claudeSessionID]` does not already point at this session — kb:adr/ingest-monotonic-rebind). Adding `KindCompactionEnded` to `isBindKind` (`apply.go:87`) takes the compact SessionStart out of Apply's guarded path, and `applyCompactionEnded` re-decides "different id → clear-rebind" on its own. Cites `docs/conventions.md` § Design "One owner per concept … Two places that must agree will not." Concrete interleaving the two homes disagree on: session bound to A; `/clear` lands, binding B (`byClaude[A]` and `byClaude[B]` both → this session); a reordered `SessionStart(source:"compact")` for A then arrives — Apply's guard would treat it as a straggler, but `applyCompactionEnded` clear-rebinds backwards to A, resets context/compactions, and `apply.go:52` writes `byClaude[A]`. The `design:` line for `bindIdentity` names REQ-9 for the clear-rebind but not why the monotonic check does not apply. A fix must make true: the decision "this event's id differs from the bound one — forward rebind or straggler?" is made in one place for every enveloped kind including the compact SessionStart, and a compact SessionStart naming an id this session already left does not rebind backwards (or Decisions states, with a source, why compact is exempt and that exemption is visible at the one place the decision lives).

### Minor

1. **[daemon-impl]** The leave-a-turn-for-idle step now has four copies — `internal/session/machine.go:232-234` (`applyTurnClosed`), `:246-249` (`applyTurnInterrupted`), `:264-267` (`applyIdleNotice`), `:294-297` (`applyCompactionEnded`): each is `clearAttention(); Failure = nil; setState(StateIdle, now)` (three of them preceded by the same `closePrompt(*promptID)`). Main had two (`git show main:internal/session/machine.go`, lines 237-239 and 251-253); the branch added two. This sequence is how the attention-iff-needs_input and failure-iff-failed invariants are kept on the way to idle; a fifth arm that forgets `Failure = nil` breaks one silently. Cites § Design "Reuse before add" and "One owner per concept"; the `design:` line ("Sibling shape matched: the helpers beside applyTurnClosed/applyTurnInterrupted") explains where the helpers sit, not the repeated tail. A fix must make true: ending a turn into idle (close prompt, clear attention, clear failure, set idle) has one home that the four helpers call, and the return-`true` they share stays with it or beside it.

### Notes

1. **[note]** The comment pass removed pre-existing `main` comments, contrary to kb:adr/process-comment-pass-owns-code-comments ("legacy comments on `main` are out of scope"). When the branch edited one word inside an existing block, `tools/commentpass strip` took the whole block as branch-added and the judge dropped it (`plans/state-issues/comment-pass.json` cycle 1). Removed blocks that were on main nearly verbatim: `internal/session/apply.go:11` Apply's 33-line doc (the monotonic-rebind straggler rules, the one-persist-one-broadcast contract); `internal/session/writeorder.go:165` restoreChangedFields' 44-line restore-target policy; `internal/claudecode/interpret.go:60` FromSubagent's boundary doc ("internal/session sees only this neutral bool"); `internal/session/session.go:243` the wait-ownership doc; `internal/session/machine.go:191` the resume-claim graduation note and `:199` "never resets the latch"; `internal/session/session.go:62` Attention.Reason's enumeration; `internal/claudecode/claudecodetest/claudecodetest.go:89,394`. A newcomer to `apply.go` and `writeorder.go` now meets the least obvious code in the package with no doc at all. Also gone: `compactionPromptID`'s declaration (`session.go:203`) no longer names its writers or its guard (§ Design "Shared state names its writers and its guard"). For the orchestrator: restore the main-text blocks, or bring the tool into line with its ADR (`/retro` material).
2. **[note]** `internal/session/apply.go:52` and `isBindKind` (`apply.go:87`) are two hand-kept lists of bind kinds that intentionally differ (ResumeBind is in one, not the other), and the branch extended both. They predate the branch; the new entry makes them harder to read. Folding them falls under Major 1's single home if the fix touches it.
3. **[note]** `Attention.Reason` stays an untyped `string` with untyped consts `attentionPermission`/`attentionIdle` (`session.go:55-58`), while its siblings `State` and `PermissionMode` are typed string enums in the same file. Replacing the literal with consts is an improvement; a typed `AttentionReason` would match the siblings. No change requested.
4. **[note]** Size: `applyInput` funlen 51>40 has a reason in Decisions that holds (same count at main; the new arms go to helpers). `claudecodetest.go` filelen 629>500 has no reason given, but the file was already 630 lines at main and the branch made it a line shorter. Nothing to fix.
5. **[note]** Race: every write to `compactionPromptID` (`machine.go:278`, `session.go:281`) runs inside `Apply` under `Manager.mu` (`apply.go:14`), and the field is in both `restoreChangedFields` and `restoredSessionFields`, so `mustCoverEverySessionField` stays honest. I found no interleaving to report.
6. **[note]** Diagram: the new kinds `idle_notice` / `compaction_began` / `compaction_ended` change the lifecycle machine's inputs; review-work checks whether the lifecycle diagram and spec name them (the daemon log's `doc-delta:` line).
