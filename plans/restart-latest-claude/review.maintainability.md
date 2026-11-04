# Maintainability review: Restart Latest Claude

**Plan**: restart-latest-claude
**Verdict**: approved
**Cycle**: 2
**Pack**: kb: pack 27338 words (budget 30000)
**Scope**: 41 files from `git diff main...HEAD -- cmd internal web/src ':!*_test.go' ':!*.test.ts'` (full review: cycle 1 carried Majors). 17 of them changed since `review_commits[1]` (047ee06a), and I re-read those against their siblings. The other 24 are unchanged since cycle 1, so their cycle-1 rows still hold.

## Cycle-1 findings

| Cycle-1 issue | Fix commit | Verified how |
|---|---|---|
| Major 1: second batch runner in `internal/server/restart.go` | 236b1df5 | `internal/session/actions.go:155` `RunBatch` is now the one loop. It owns `hasRepeat` (`:157`), the per-id `LockSession` (`:163`) and the bucketing (`:168-175`, plus `BatchResult.file` `:115` for the new `Queued`). `EndMany`/`RemoveMany` reach it through the 1-line `runBatch` adapter (`:146`). The restart handler (`internal/server/restart.go:119-133`) decodes the body, calls `RunBatch` and encodes the result. It no longer sorts and compacts, locks or buckets for itself, and it maps the error through the shared `writeBatchError` (`actions.go:143`, now a function that takes the logger). `restartBatchWire` embeds `batchWire` and adds only `Queued` (`sessionwire.go:259-266`). The comment on `decodeBatchRequest` (`actions.go:131-132`, "a repeated id is the manager's to refuse") is true again. `rg -n 'hasRepeat\|BatchResult' internal -g '!*_test.go'` finds one refusal site and one bucket owner. The Fix Attempt 2 `design:` line gives the reason it stays in `session`: the lock and `hasRepeat` live there, and the op comes in as a closure. The code bears that out. |
| Major 2: private `setText` in `render/restartpanel.ts` | 62d72cb9 | `restartpanel.ts:1` `import { setText } from "../dom"`. `rg 'function setText' web/src` finds only `dom.ts:42`. |
| Major 3: background-task wording spelled out twice | 62d72cb9 | `sessions/card.ts:413` `backgroundTaskCount` is the one owner. `backgroundLine` (`:422`) and `features/restartplan.ts:37` both call it. `backgroundTaskReason` is gone. |
| Minor 1: `followInstalled` post-construction setter | 236b1df5 | `newClaudeVersionFeature(…, onInstalled, log)` (`claudeversion.go:79`) takes it the way `newGroupsFeature`/`newIssueFeature` take theirs. `server.go:228` passes `s.restart.installedKnown`, and `s.restart` is registered first at `:216`. The setter is deleted. |
| Minor 2: `statusLineFullPayload` funlen with no reason | 236b1df5 (Decisions) | The Fix Attempt 2 Size line gives the reason and it holds: `claudecodetest/statusline.go:89-150` is a flat default-then-assign run, one block per option. Splitting it would separate defaults from the one list of them. |
| Minor 3: no `design:` line for `RestartClass`/`ClassifyRestart`, `LeadingVersion`/`OlderVersion` | 236b1df5 (Decisions) | Two `design:` lines in Fix Attempt 2 name the shape, the reason (one call under `Manager.mu` rather than two questions at different instants; the format stays in `claudecode`) and the reuse (`parseSemver`/`compareSemver`, `restartFree`). |

## Files

| File | Siblings opened | design: line | Size warnings | Result |
|------|-----------------|--------------|---------------|--------|
| internal/claudecode/CLAUDE.md | (generated trailer only) | n/a | none | pass (unchanged) |
| internal/claudecode/claudecodetest/statusline.go | statusline.go builders | Size reason (Fix Attempt 2) | funlen `statusLineFullPayload` 42 > 40, reason holds | pass, Note 5 |
| internal/claudecode/status.go | version.go, status.go `interpret*` | n/a | none | pass (unchanged) |
| internal/claudecode/version.go | version.go `parseSemver`/`compareSemver` | yes (Fix Attempt 2) | none | pass |
| internal/server/CLAUDE.md | (generated trailer; Owns now names `restart.go`) | n/a | none | pass |
| internal/server/actions.go | sessionwire.go `toWireBatch`, restart.go | yes (`writeBatchError` as a function) | none | pass |
| internal/server/claudeversion.go | groups.go/issue.go constructors via server.go:221,230 | yes (constructor arg) | none | pass |
| internal/server/launcher.go | actions.go | yes | funlen `ResumeLocked` 62 > 60 (extraction from a 92-line `Resume`) | pass, Note 5 |
| internal/server/renderfix_scenarios_restart.go | renderfix_scenarios_notes.go, renderfix_scenarios_misc.go | yes | none | pass (unchanged) |
| internal/server/restart.go | actions.go, reporefresh.go, bgloop.go, sessionwire.go, session/actions.go | yes (`RunBatch`, `installedKnown`) | none | pass, Notes 2, 3 |
| internal/server/server.go | (root) | yes | funlen `New` 54 > 40, pre-existing (53 on main) | pass, Note 5 |
| internal/server/sessionwire.go | sessionwire.go `batchWire`/`toWireBatch`/`nonNil` | yes (embeds `batchWire`) | funlen `toWireSession` 66 > 60, pre-existing | pass, Note 5 |
| internal/session/CLAUDE.md | (generated trailer only) | n/a | none | pass (unchanged) |
| internal/session/actions.go | railorder.go `hasRepeat`, groupops.go:204, groups.go:59 | yes (`RunBatch`, `BatchOutcome`) | none | pass, Note 3 |
| internal/session/apply.go | status.go | yes | none | pass (unchanged) |
| internal/session/liveness.go | actions.go | n/a | none | pass (unchanged) |
| internal/session/manager.go | effort.go, repo.go | yes (`restartHeld` set in `LoadAll`) | file 645 lines, pre-existing, reason given | pass |
| internal/session/restart.go | effort.go, note.go, railorder.go, writeorder.go | yes (held-mark release in settle) | none | pass, Note 4 |
| internal/session/row.go | row.go mapping | yes (`RestartPending \|\| restartHeld`) | none | pass |
| internal/session/session.go | session.go fields (`ClaudeDir`, `AddedDirs`, `repoEpoch`) | yes (`restartHeld`, writers named in Decisions) | none | pass |
| internal/session/status.go | status.go `adopt*` | yes | none | pass (unchanged) |
| internal/session/writeorder.go | writeorder.go restore list and coverage list | yes | none | pass |
| internal/store/migrations/0019_restart.sql | 0017, 0018 | n/a | none | pass (unchanged) |
| internal/store/session.go | store/session.go | n/a | funlen `UpdateSession`/`scanSession` pre-existing; file 558, reason given | pass, Note 5 |
| web/src/api/sessions.ts | api/sessions.ts batch calls | n/a | none | pass (unchanged) |
| web/src/app.ts | wsapp.ts | yes | none | pass (unchanged) |
| web/src/features/CLAUDE.md | — | n/a | none | pass (unchanged) |
| web/src/features/connection.ts | updaterestart.ts, connectionversion.ts, wsapp.ts | yes | none | pass (unchanged), Note 6 |
| web/src/features/restart.ts | settings.ts:16, update.ts:21 (`#settings-button` lookups), notes.ts, render/menu.ts | yes (Ignore focus target) | none | pass, Note 7 |
| web/src/features/restartnotice.ts | connectionversion.ts, batchplan.ts | yes | none | pass (unchanged), Note 1 |
| web/src/features/restartplan.ts | batchplan.ts, sessions/card.ts | yes | none | pass, Note 1 |
| web/src/main.ts | (root) | yes | none | pass (unchanged) |
| web/src/protocol/batch.ts | protocol/batch.ts | n/a | none | pass (unchanged) |
| web/src/protocol/session.ts | protocol/session.ts | n/a | none | pass (unchanged) |
| web/src/render/CLAUDE.md | — | n/a | none | pass (unchanged) |
| web/src/render/masthead.ts | masthead.ts, effortstrip.ts | yes | none | pass (unchanged), Note 8 |
| web/src/render/restartdialog.ts | confirm.ts, groupdialogs.ts | yes | none | pass (unchanged) |
| web/src/render/restartpanel.ts | dom.ts, render/context.ts, render/notes.ts | yes | none | pass |
| web/src/sessions/card.ts | card.ts string helpers (`unreadLabel`, `backgroundLine`) | yes (`backgroundTaskCount` owner) | none | pass |
| web/src/sessions/testfixtures.ts | — | n/a | none | pass (unchanged) |
| web/src/style.css | `.claude-notice ~ .version-warn` and the masthead rules | n/a | none | pass |

Shared state (question 3): this cycle adds the held mark `Session.restartHeld`. Its writers are `LoadAll` (set), `settleClaudeBehindLocked` (reached from the ingest worker's status post and from the claude version loop's `SetInstalledClaude`) and `clearClaudeVersion`, all under `Manager.mu`, as the Fix Attempt 2 `design:` line states. It is in `restoredSessionFields`, so a failed write rolls it back with its neighbours. `installedKnown` runs on the claude version loop goroutine. Its `enqueue` is under `restartFeature.mu`, and the duplicate enqueue it can race with (the upsert callback on the release, then the sweep) is collapsed by `slices.Contains` or turned into a no-op by `fire`'s `IsRestartDue` re-check under the session lock. This cycle's gate `test` line is `go test -race -count=1 ./...` with every package `ok` (`internal/session 131.9s`, `internal/server 178.0s`), unlike cycle 1's timeouts.

## Issues

### Critical

### Major

### Minor

### Notes

1. **[note]** Carried from cycle 1, unchanged. "Free" and semver ordering are each spelled out in both tiers: daemon `restartFree`/`compareSemver`, dashboard `isFree`/`compareVersions`. Moving either to one side is a protocol question for a later plan, not a fix here.
2. **[note]** The same restart failure is logged at two levels. The batch path now logs through `RunBatch` at error ("restarting session in a batch failed", `session/actions.go:172`), and the queue path logs at warn in `fire` ("queued restart failed", `server/restart.go:100`). Fix Attempt 2 Decisions records the batch-side change from warn to error, so this is a known choice. A reader searching the log for one message will find only half of the failures.
3. **[note]** `RunBatch` has two ways to skip: an op returns `BatchSkipped` with a nil error, or it returns `ErrUnknownSession`/`ErrSessionNotAlive`. Restart uses both (`restartOne` default and `queueOne`'s `ErrNotBehind` versus `restartLocked`'s sentinels). `RunBatch`'s doc states both routes, so a future op author has the rule in one place.
4. **[note]** Carried from cycle 1 Notes 3 and 4. The eligibility rule is stated twice (`ClassifyRestart` and `SetRestartPending`), and `ClaudeBehind` is stored derived state. The restart mark now has three spellings: `RestartPending` in memory and on the wire, `restartHeld` in memory only, and the `restart_pending` column written as their OR (`row.go:260`). The design line explains why (no migration, no second store), and the one resolver is `settleClaudeBehindLocked`, which keeps it readable today.
5. **[note]** Size warnings on touched files: `statusLineFullPayload` now has a reason that holds. `ResumeLocked`, `New`, `toWireSession`, `UpdateSession`/`scanSession` and the three over-500 files are pre-existing or explained, as in cycle 1. The remaining funlen hits are on test files and are funlen, not `dupl`, so they are outside this part.
6. **[note]** Carried from cycle 1 Note 2. `claudeCode` is still the one WS-message-to-`app` event emitted from a controller (`features/connection.ts`) rather than `wsapp.ts`. The reason is given in Decisions.
7. **[note]** `features/restart.ts:67` is the third controller to `requireElement("#settings-button")`, after `features/settings.ts:16` and `features/update.ts:21`. It uses it only as Ignore's focus fallback, and the `design:` line names that. It matches its siblings. If a fourth reader appears, a shared masthead lookup would be worth considering. Cycle 1 Note 7 (the third inline outside-pointerdown/Escape dismiss) also still stands.
8. **[note]** Carried from cycle 1 Note 8. `render/masthead.ts` `renderNotice` wires `onActivate` only on first build. This is harmless while `connection.ts` passes the stable `toggleRestartPanel`.
9. **[note]** The original `## Decisions` block of `daemon-implementation.md` still carries three `design:` lines that Fix Attempt 2 superseded: "duplicate-id check … is a sort-and-compact … no export", "`LoadAll` seeds `ClaudeBehind = RestartPending`" and "`Start`'s sweep". A reader of that block meets two contradictory designs for the batch runner before reaching Fix Attempt 2. The code matches the Fix Attempt 2 lines.
