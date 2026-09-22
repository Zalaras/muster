# Daemon Tests: Rail Card Improvements

**Plan**: rail-card-improvements
**Verdict**: pass
**Pack**: `kb:pack plan=rail-card-improvements role=daemon-tests` — 22712 words (WARN exceeds 8000-word budget); sections: rules 841, features 7327, decisions 8343, facts 4111, lessons 2082, runbooks 2

## Summary

Tests created: 8 new files, ~45 top-level test functions (many table-driven, several
hundred subtests in total via `t.Run`). Fixed 4 pre-existing test files whose literal
fixtures (a migration count, three `PUT /api/prefs` KV blobs, one snapshot shape) went
stale because of the already-committed daemon implementation (migration `0009`, the two
new `railDensity`/`railActivity` pref fields) — test bugs (stale assertion literals), not
implementation bugs. Passing: all. Failing: none.

`go build ./...`, `make test`, `make lint` and the D4 adapter-boundary grep all pass.
`python3 .claude/skills/orchestrate/scripts/dead-refs.py` reports the same 8 pre-existing
`.claude/settings.local.json` misses daemon-implementation.md already flagged as
unrelated; none of my new files appear in that list.

## Tests

| File | Test Name | What It Tests | Status |
|------|-----------|---------------|--------|
| `internal/session/rail_unread_test.go` | `TestApplyInput_Unread_INV1` | INV-1 (unread ⇒ idle) at the `applyInput`/`setState` layer: every `InputKind`, crossed against all 6 source states × 2 seeded `Unread` values — `setState` clears `Unread` unconditionally whenever the target state is non-idle; `turn_closed`, `compaction`, `death_hint`, `clear_death_hint`, `inert` and every closed-prompt straggler leave it untouched | pass |
| `internal/session/rail_unread_test.go` | `TestApplyInput_TurnActivity_PromptHandling` | D5/D12/Edge Case 10: `LastPrompt` truncated to 200 chars, stored verbatim when short, left unchanged with no `Prompt` on the input, and left unchanged by a closed-prompt unmarked straggler even when the input carries a `Prompt` | pass |
| `internal/session/rail_unread_test.go` | `TestApplyBind_LastPrompt` | D12: explicit clear-rebind and an id-change escalation to clear-rebind both nil `LastPrompt`; a same-id resume-bind and a same-id plain bind both leave it untouched | pass |
| `internal/session/manager_rail_test.go` | `TestApply_TurnClosed_SetsUnreadFromWatcher` | D5/D6/D7/INV-1 at `Manager.Apply`: `turn_closed` sets `Unread` from the `Watcher`'s answer, crossed against all 6 source states × {watched, unwatched, nil watcher}; nil watcher counts as unwatched; persisted and returned value agree | pass |
| `internal/session/manager_rail_test.go` | `TestApply_TurnClosed_WatcherIsPerSessionIndependence` | Edge Case 4/D9: two sessions on one shared watcher, one watched one not — each gets its own answer, never the other's | pass |
| `internal/session/manager_rail_test.go` | `TestApply_MonotonicRebindGuard_StragglerTurnClosedBehavesLikeAnyOther` | Edge Case 9: a Stop straggler from a left-behind claude id after a `/clear` reorder is applied like any other `turn_closed` (idle + watcher-driven `Unread`) without rebinding backwards | pass |
| `internal/session/manager_rail_test.go` | `TestManager_MarkSeen` | D8: clears `Unread`, persists and broadcasts exactly once when it was true; no broadcast when already read; `ErrUnknownSession` for an unknown id | pass |
| `internal/session/manager_rail_test.go` | `TestReconcile_LeavesUnreadAndLastPromptUntouchedAcrossRowClasses` | D10: `Unread`/`LastPrompt` untouched by Reconcile for a kept-alive (revived) row and a marked-ended row | pass |
| `internal/store/session_rail_test.go` | `TestInsertSession_UnreadDefaultsFalseLastPromptDefaultsNil` | Schema Changes: fresh row defaults | pass |
| `internal/store/session_rail_test.go` | `TestUpdateSession_UnreadAndLastPromptRoundTrip` | D10: both columns round-trip through `UpdateSession`/`GetSession` in both directions | pass |
| `internal/claudecode/interpret_rail_test.go` | `TestInterpret_UserPromptSubmit_Prompt` | D11: a genuine prompt carries through verbatim; absent prompt → nil; a background-completion-tagged prompt → nil; the tag mid-string does not suppress; `FromSubagent` is independent of `Prompt` | pass |
| `internal/claudecode/interpret_rail_test.go` | `TestInterpret_ToolUseEvents_NeverSetPrompt` | D11: `PreToolUse`/`PostToolUse` never populate `Prompt` even when the payload carries one | pass |
| `internal/server/prefs_rail_test.go` | `TestLoadPrefs_DefaultRailDensityAndRailActivity` | D13 defaults | pass |
| `internal/server/prefs_rail_test.go` | `TestHandlePutPrefs_RailDensityValidationErrors` / `..._RailActivityValidationErrors` | D13: 400 with the plan's exact error message per invalid value | pass |
| `internal/server/prefs_rail_test.go` | `TestHandlePutPrefs_RailDensityAcceptsAllThreeEnumValues` / `..._RailActivityAcceptsAllFourEnumValues` | D13 accepted enums | pass |
| `internal/server/prefs_rail_test.go` | `..._PresentAloneSatisfiesAtLeastOneFieldRequired`, `..._SetsXOnlyLeavesOtherFieldsUntouched` (×2) | D13 per-field independence, mirroring the existing `railSort`/`theme` suites | pass |
| `internal/server/prefs_rail_test.go` | `TestLoadPrefs_InvalidRailDensityInKVFallsBackToComfortableIndependently` / `..._RailActivity...Turn...` | D13: an out-of-enum stored value falls back to its own default without touching a sibling field's valid value | pass |
| `internal/server/prefs_rail_test.go` | `TestHandlePutPrefs_PersistsRailDensityAndRailActivityToKV` | D13 persistence, exact KV blob | pass |
| `internal/server/prefs_rail_test.go` | `TestHandlePutPrefs_BroadcastsRailDensityAndRailActivityInPrefsMessage` | INV-4 echo over a live WS connection, plus "exactly one" | pass |
| `internal/server/prefs_rail_test.go` | `TestPrefs_RailDensityAndRailActivityPersistAcrossADaemonRestart` | D13 persists across a fresh `Server` over the same on-disk store | pass |
| `internal/server/sessionwire_rail_test.go` | `TestToWireSession_UnreadAndLastPromptAreNeverNullExceptLastPrompt` | D14: `unread` never null (verbatim boolean), `lastPrompt` null until set | pass |
| `internal/server/sessionwire_rail_test.go` | `TestSessionWire_JSONShapeHasUnreadAndLastPromptFields` | D14: both keys present in the marshaled JSON | pass |
| `internal/server/terminal_rail_test.go` | `TestTerminalRegistry_Watched` | D9: true iff a connection is registered on either surface | pass |
| `internal/server/terminal_rail_test.go` | `TestTerminalRegistry_Watched_MultiSessionIndependence` | D9/Edge Case 4: two sessions on the shared registry, mutually unaffected | pass |
| `internal/server/terminal_rail_test.go` | `TestHandleTerminal_SuccessfulAttachMarksSessionSeen` | D8 end to end (real tmux): an unwatched-unread session's takeover clears `Unread`, persisted, before/by the time the first PTY byte is observed | pass |
| `internal/server/terminal_rail_test.go` | `TestHandleTerminal_AttachOnAnAlreadyReadSessionDoesNotBroadcast` | D8 no-op half: no `sessionUpsert` reaches a connected UI socket | pass |
| `internal/server/shells_rail_test.go` | `TestHandleShellTerminal_SuccessfulAttachMarksSessionSeen` | D8/Edge Case 31: the shell surface's attach also calls `MarkSeen` | pass |

## Fixed Pre-Existing Tests (stale fixtures, not covered under "Implementation Bugs")

| File | What Changed | Why |
|------|--------------|-----|
| `internal/store/migrate_test.go` | Migration count `8` → `9` (two spots) | Migration `0009_rail_cards.sql` is new and additive; the literal predates it |
| `internal/store/store_test.go` | Migration count `8` → `9` | Same |
| `internal/server/prefs_test.go` | Three `JSONEq` KV-blob literals gained `"railDensity":"comfortable","railActivity":"turn"` | `defaultPrefs()` now includes both fields; the literals predate them |
| `internal/server/state_test.go` | `TestBuildSnapshot_M0Shape`'s `prefs` object gained the same two keys | Same |

## Implementation Bugs

None — verdict is `pass`.

## Test Run Output

```
$ go build ./...
(clean)

$ make test
ok  	github.com/Zalaras/muster/cmd/musterd	20.271s
ok  	github.com/Zalaras/muster/internal/claudecode	14.654s
ok  	github.com/Zalaras/muster/internal/ghissue	1.063s
ok  	github.com/Zalaras/muster/internal/gitutil	3.209s
ok  	github.com/Zalaras/muster/internal/kb	4.154s
ok  	github.com/Zalaras/muster/internal/locate	2.595s
ok  	github.com/Zalaras/muster/internal/selfupdate	3.058s
ok  	github.com/Zalaras/muster/internal/server	35.362s
ok  	github.com/Zalaras/muster/internal/session	5.958s
ok  	github.com/Zalaras/muster/internal/store	5.928s
ok  	github.com/Zalaras/muster/internal/termbridge	5.708s
ok  	github.com/Zalaras/muster/internal/tmux	14.951s
ok  	github.com/Zalaras/muster/internal/tmux/tmuxtest	5.812s
ok  	github.com/Zalaras/muster/internal/triage	4.854s
ok  	github.com/Zalaras/muster/internal/tty	5.385s
ok  	github.com/Zalaras/muster/internal/usage	5.306s
ok  	github.com/Zalaras/muster/internal/webui	4.758s
ok  	github.com/Zalaras/muster/tools/kb	3.033s
ok  	github.com/Zalaras/muster/tools/triage	3.196s
ok  	github.com/Zalaras/muster/tools/versions	8.168s

$ make lint
golangci-lint run
0 issues.

$ ! rg -n "UserPromptSubmit|last_assistant_message|task-notification" internal/session internal/server internal/store --glob '!*_test.go'
D4 OK (exit 1, no matches)
```

## Notes for the orchestrator / review-work

- The web-impl agent's uncommitted files under `web/` and its `web/src/*.test.ts` files
  (web-tests agent's work) were left untouched, as instructed.
- `plans/rail-card-improvements/orchestration-state.json` and `plan.md` were left
  untouched, as instructed.
- Every new/changed comment cites real files and real `kb:fact`/`kb:lesson`/`kb:adr`/
  `kb:anchor` tokens; `dead-refs.py` confirms no new dead reference.
