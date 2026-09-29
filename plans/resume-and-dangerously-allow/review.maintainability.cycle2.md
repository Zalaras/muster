# Maintainability review: Resume and Dangerously Allow

**Plan**: resume-and-dangerously-allow
**Verdict**: needs-changes
**Cycle**: 2
**Pack**: kb: pack 31121 words (budget 20000) (WARN pack exceeds budget of 20000 words)
**Scope**: 32 files from `git diff main...HEAD -- cmd internal web/src ':!*_test.go' ':!*.test.ts'`. This is a full re-review, not a delta, because cycle 1 had open Majors. The fix diff `3735df2..HEAD` (21 non-test files) was read against every cycle-1 issue.

## Prior cycle (cycle 1) issues

| Prior issue | Fix commit | Verified how | Result |
|---|---|---|---|
| Major 1: directory validation copied three times | 86ed7af | `rg validateLaunchDirectory\|errLaunchDir` finds one owner at `launcher.go:150-170`. Its three callers are `launcher.go:178`, `launcherpast.go:19` and `launcherpastlist.go:68`. No copied `filepath.IsAbs(req.Directory)` lines remain. | fixed |
| Major 2: `handleListPastSessions` did business logic | 86ed7af | The handler (`launcherpastlist.go:66-87`) now decodes, validates, calls `listPastSessions` and encodes. `listPastSessions(projectsDir, dir, manager)` takes no `http.Request`, the same shape as `browseDirectory`. | fixed (a new Minor 2 below covers the error switch) |
| Major 3: one-alive-row guard was an unguarded check-then-act | 86ed7af | See the interleaving analysis below. `claudeLocks keyedlock.Locks[string]` (`manager.go:126-136`) is named, and its writers are named. `launchResume` holds it from its check through `createAndSpawn` (`launcherpast.go:73-127`). `Resume` holds it from its check through `RecordResume` (`launcher.go:460-510`). `CreateSession` sets `pendingResumeClaudeSessionID` before the row enters `m.sessions`. `AliveByClaudeSessionID` matches that pending id too, and `applyBind` clears it. The race is covered by `TestLockClaudeSession_SerializesTheCheckThenClaimRaceForOneClaudeID` (`manager_test.go:3523`), and the gates' `02-test.log` shows `go test -race` ok for `internal/session` and `internal/server`. | fixed |
| Minor 1: missing daemon `design:` lines | 86ed7af (log) | `daemon-implementation.md` Fix Attempt 3 § Decisions has lines for `launcherpast.go` and its functions, `TouchRepo`, `AliveByClaudeSessionID` and `claudecodetest/transcripts.go`. The `TouchRepo` reason holds against `UpsertRepoParams`' plain-string fields. | fixed |
| Minor 2: `pastSessionsFeature` file naming | 86ed7af (log) | Decisions now says why the feature is in the `launcher*` family: it only serves the Resume tab, and the plan globs `launcherpast*.go`. That is the "or state why" branch the finding offered. | fixed |
| Minor 3: no web `design:` lines | 14b3aee (log) | `web-implementation.md` Fix Attempt 3 § Decisions has one line for each of the six items. | fixed (the `PastRow` line's reason is contested in Minor 4 below) |
| Minor 4: view decisions in `render/` | 14b3aee | `pastRowView` (`features/launchpastlist.ts:37-43`) owns the title fallback and the chip flag. `render/launchpast.ts` reads `row.title` and `row.bypassChip`. `renderResumeFooter` no longer has its own fallback. | fixed |
| Minor 5: five bypass literals | 14b3aee | `rg '"bypassPermissions"' web/src -g '!*.test.ts'` now finds only `isBypassMode` (`sessions/permission.ts:15`) and the protocol's mode list. `features/launch.ts:357` reads `face.danger`. | fixed |

**Major 3 interleaving check (the cycle-1 sequence, replayed on the fix).** Dead row 3 is bound to X, and `POST {resumeSessionId: X}` holds `claude(X)`. `CreateSession` then puts row 7 into `m.sessions` with `Alive=true` and `pending=X` under `mu`. The user's Resume on row 3 takes `session(3)`, then blocks on `claude(X)`. Once it gets the lock, `AliveByClaudeSessionID(X)` returns 7, so the Resume is refused. Two resume-from-list POSTs for X are serialized the same way.

Lock order is inverted between the two paths. `launchResume` takes `claude(X)` and then `session(new)` in `spawnAndRecordLaunch`. `Resume` takes `session(id)` and then `claude(X)`. I could not build a cycle from this. A `Resume(N)` aimed at the row that `launchResume` has just created sees `Alive == true` and returns before it asks for `claude(X)`, and fresh ids are never reused. See Note 3.

## Files

| File | Siblings opened | design: line | Size warnings | Result |
|------|-----------------|--------------|---------------|--------|
| cmd/musterd/main.go | (composition root) | size: line | filelen 513, funlen parseFlags/run; reason holds | pass |
| internal/claudecode/launch.go | launchtranscripts.go | n/a (edit; decision record cited) | none | pass |
| internal/claudecode/launchtranscripts.go | status.go, ingest.go | yes | none | pass |
| internal/claudecode/claudecodetest/transcripts.go | claudecodetest.go | yes (cycle-1 fix) | none | pass |
| internal/server/launcher.go | browse.go, launcherpast.go | yes (`validateLaunchDirectory`) | filelen 553, reason given for 525 still holds | note |
| internal/server/launcherpast.go | launcher.go | yes | **funlen `launchResume` 61, no reason** | Minor 3 |
| internal/server/launcherpastlist.go | browse.go, repos.go | yes (`listPastSessions`) | none | Minor 2 |
| internal/server/launcherrors.go, respond.go, sessions.go, server.go | each other | yes / n/a | funlen `New` 43 (one line) | pass |
| internal/session/manager.go | apply.go, writeorder.go, session.go | yes (Fix Attempt 3) | **filelen 542 (469 on main), no reason** | Minor 1, Minor 3 |
| internal/session/machine.go | apply.go | n/a (one-field clear) | funlen `applyInput` 52, already present on main and not touched | note |
| internal/session/session.go, writeorder.go | manager.go | n/a | none | pass |
| internal/store/repo.go | repo.go's `UpsertRepo` | yes (cycle-1 fix) | none | pass |
| web/src/api/launch.ts | http.ts | yes | none | pass |
| web/src/features/launch.ts | launchmodels.ts, launchresume.ts | size reason | filelen 731; reason holds | pass |
| web/src/features/launchpastlist.ts | launchmodels.ts, launchrestore.ts | yes | none | Minor 4 |
| web/src/features/launchresume.ts | updaterestart.ts, launch.ts | yes | none | pass |
| web/src/render/launchpast.ts | render/launch.ts, reader.ts, focuskeep.ts, render/CLAUDE.md | yes, contested | none | Minor 4 |
| web/src/render/launch.ts | render/launchpast.ts | yes | none | pass |
| web/src/render/mainhead.ts, tiles.ts, sessions.ts, masthead.ts | each other | Decisions bullet | none | pass |
| web/src/sessions/card.ts, permission.ts | each other | yes | none | pass |
| web/src/protocol/session.ts | usage.ts | reverted to main's shape | none | pass |
| web/src/style.css | own `.recents`/`.chip-danger` blocks | n/a (scoped `.past-list` rules) | none | pass |

## Issues

### Critical

### Major

### Minor
1. **[daemon-impl]** `internal/session/manager.go:126-136`: a new guard's key invariant is kept in a plan log instead of beside the guard. The `claudeLocks` declaration ends with "Unlike locks, no caller ever calls Forget on an entry here — daemon-implementation.md's Decisions has the trade-off." That Decisions entry holds the load-bearing rule: calling `Forget` here "would silently reopen Maintainability Major 3's race". Right above it, `locks`, the sibling field of the same `keyedlock.Locks` type, does reclaim its entries, and the Decisions log says this map grows without bound. A newcomer who sees that growth next to a sibling that reclaims would add the `Forget` and bring the double-claim back.
   - Cites § Design "Shared state names its writers and its guard". The guard's rules belong where it is declared.
   - Cites § Comments "a subtle invariant … cite `kb:adr/<slug>`". The comment points at an unnamed plan file, not a kb record.
   - A fix must put at the declaration both the rule (entries are never forgotten) and the reason (a forgotten entry lets a second claimant get a fresh mutex while the first still holds the old one). It must not point into `plans/`.

2. **[daemon-impl]** `internal/server/launcherpastlist.go:68-75`: the error switch has no `default` arm. Any error from `validateLaunchDirectory` other than the two sentinels hits `return` with nothing written, so the client gets an empty 200 instead of a JSON error. Its sibling, `internal/server/browse.go:62-72` (`handleBrowse`, the shape this handler's own doc cites), ends its sentinel switch with a `default:` that logs and writes `500 internal_error`. Today `validateLaunchDirectory` returns only the two sentinels, so nothing fails yet. But the one-owner function was written so that a later rule lands in one place, and a new failure added there would reach this handler as a silent empty 200. Cites § Design "Match the siblings … error path". A fix must make every non-nil error from the validator produce an error response here, as `handleBrowse`'s does.

3. **[daemon-impl]** Two size warnings are new in this cycle's fix wave, and neither has a reason in `daemon-implementation.md` § Decisions:
   - `internal/session/manager.go` filelen 542: 469 on main, 497 at `3735df2`, now 542.
   - `internal/server/launcherpast.go:50` `launchResume` funlen 61 > 60. This follows the lock and comment block the wave added.

   The only size line in Decisions (`size:`) covers `launcher.go` at 525 and `main.go`. This is kb:adr/process-size-linters-warn-never-fail plus the reviewer's question 6: a hit with no reason is a Minor. A fix must add a reason for each warning or change the shape. A split is not being asked for.

4. **[web-impl]** One row-view shape is declared twice. `web/src/render/launchpast.ts:21-25` declares `interface PastRow`, and `web/src/features/launchpastlist.ts:31-35` declares `interface PastRowView`, with identical fields. The `design:` line explains the copy by dependency direction ("render/ must take `pastRowView`'s output structurally rather than import its type"). That rules out only render/ importing from features/. It misses the direction this feature's own sibling already uses: `web/src/features/launchmodels.ts:7`, `import type { ModelRowState, ModelSelection } from "../render/launch";`. There, the view type is declared once in `render/`, and the pure `features/` derivation (`deriveModelRowState`) returns it. `rg 'from "\.\./render/' web/src/features` shows the same pattern in `rename.ts`, `connectionversion.ts`, `tiles.ts` and `surfaces.ts`. Cites § Design "One owner per concept" and "Match the siblings". A fix must leave the past-row view shape declared in one place, with the dependency still running features/ → render/.

### Notes
1. **[note]** `internal/server/launcher.go` filelen 553. The stated reason (525, `sessionLauncher`'s home file, and `createAndSpawn`/`repoContext` are shared) still holds for the 28 lines this wave added: `validateLaunchDirectory` and the claim lock in `Resume`. The number in the reason is out of date.
2. **[note]** `internal/session/machine.go` `applyInput` funlen 52 is already present on main. This branch touches only `applyBind`, at +6 lines.
3. **[note]** The two resume paths take the two locks in opposite orders. `launchResume` takes `claudeLocks(X)` and then `locks(newID)` inside `spawnAndRecordLaunch`. `Resume` takes `locks(id)` and then `claudeLocks(X)`. No deadlock is reachable: a Resume aimed at the row `launchResume` just created returns on `sess.Alive` before it asks for the Claude lock, and ids are never reused. Still, the ordering and why it is safe are written nowhere. No change is requested. If a third caller of `LockClaudeSession` is ever added, this is the thing to write down first.
4. **[note]** `render/launchpast.ts`'s `renderPastList` rebuilds its rows with `replaceChildren` and restores focus through `focuskeep.ts`. `render/CLAUDE.md` says "Focusable controls inside the render tick are reused, never rebuilt". This list is not on the 1-second tick: it renders on fetch, filter and select. The rebuild-and-restore follows `reader.ts`'s tree/outline precedent, which the doc comment cites. It is consistent as it stands.
5. **[note]** For `review-work`, comment truth: `internal/session/session.go:47` still says `ValidPermissionMode` covers "the four permission modes". Also, `manager.go:135` names a plan file in production code (see Minor 1).
6. **[note]** For `review-work`'s DIAG row (carried from cycle 1, not re-checked here): the `pastSessionsFeature` → `claudecode.PastSessions` edge and the `features/launch.ts` → `features/launchresume.ts` sub-controller edge.
7. **[note]** The `"(untitled)"` wording (in parentheses) still differs from `"untitled"` elsewhere, as noted in cycle 1 Note 6. It now has one owner (`pastRowView`), so any change is a one-line edit.
