# Maintainability review: Rail Card Organise

**Plan**: rail-card-organise
**Verdict**: approved
**Cycle**: 2
**Pack**: kb: pack 21319 words (budget 30000)
**Scope**: 38 files from `git diff main...HEAD -- cmd internal web/src ':!*_test.go' ':!*.test.ts'` (32 code, 1 migration, 5 CLAUDE.md docs). This is a full cycle, because cycle 1 had a Major. Since cycle 1's review commit (`ba934267`), the only non-test code that changed is `internal/claudecode/status.go`, `web/src/features/rail.ts`, `web/src/features/railmenuitems.ts`, `web/src/render/sessions.ts`, `web/src/render/tiles.ts`, `web/src/sessions/cache.ts` and `web/src/sessions/format.ts` (the last one new to the diff). I checked each of these again with its siblings open. Every other file is byte-identical to what cycle 1 reviewed (`git diff --stat ba934267..HEAD` lists no other code file), so cycle 1's result stands for them.

## Cycle 1 issues

| Cycle 1 issue | Fix commit | Verified how |
|---------------|------------|--------------|
| Major 1: `cardMenuItems` re-derived the enable rule and the action vocabulary | aa58c364 | `railmenuitems.ts:2-9` imports `ACTION_BY_LABEL`, `actionEnabled`, `CardAction`, `SessionAction` and `stopResumeButton` from `sessions/card.ts`. `CardMenuAction.action` is typed `SessionAction` (`:21`). Each entry's `action` is `ACTION_BY_LABEL[label]`, and its `disabled` is `state.busy \|\| !actionEnabled(label, …)` (`:53-58`). A change to `actionEnabled` now reaches the menu with no edit to this file. Pin and Move keep `!connected \|\| busy` (`:52`) because they are not `CardAction`s, and the `design:` row says so. |
| Minor 1: `parseCacheTTL` digit loop, with no `design:` line | 1b59d50c | `status.go:196-209`: the loop is gone, and the digits go through `strconv.ParseUint(…, 10, 63)`, which rejects a sign, a fraction and an empty string. A `design:` line in daemon Decisions (Fix Attempt 1) lists what `time.ParseDuration` accepts that the wire must reject (`+5m`, `1.5h`, `1h30m`, `ms`/`us`/`ns`, `0`). A second `design:` line covers `interpretPromptCache`. Both hold. |
| Minor 2: `remainingText` sat outside `format.ts` | aa58c364 | `remainingSeconds`/`remainingText` are now at `sessions/format.ts:20-27`, beside `elapsedSeconds`/`formatTimer`/`formatAge`. `cache.ts:2` imports them. `rg -n "remainingSeconds\|remainingText" web/src --glob '!*.test.ts'` finds one definition each (format.ts) and callers only in cache.ts. |
| Minor 3: draggability was decided in both the controller and render | aa58c364 | `CardOptions.draggable` is now `(id: number) => boolean` (`render/sessions.ts:39`), and render writes `options.draggable(session.id)` without amending it (`:229`). The select-mode policy is only in the controller (`features/rail.ts:192`), and the strip passes `() => false` (`render/tiles.ts:241`). `rg -n "draggable" web/src --glob '!*.test.ts'` shows no other writer of the card attribute. |

## Files

| File | Siblings opened | design: line | Size warnings | Result |
|------|-----------------|--------------|---------------|--------|
| internal/claudecode/status.go | usageapi.go (`parseResetsAt`), interpret.go | yes (Fix Attempt 1: `parseCacheTTL`, `interpretPromptCache`) | none | pass (Minor 1 fixed) |
| internal/claudecode/claudecodetest/claudecodetest.go | same file's `StatusLineFullOpts` | yes | filelen 641, reason holds | pass (unchanged since c1; Note 4) |
| internal/claudecode/CLAUDE.md | — | doc | — | review-work's |
| internal/server/sessionwire.go | `sessionWireContext` in same file | yes | none | pass (unchanged since c1) |
| internal/session/apply.go | status.go, location.go | yes | none | pass (unchanged since c1) |
| internal/session/machine.go | apply.go | n/a (one line in `applyBind`) | funlen `applyInput` 51, pre-existing, untouched | pass (unchanged since c1; Note 4) |
| internal/session/row.go | `contextFromRow`/`contextToRow` same file | yes | none | pass (unchanged since c1) |
| internal/session/session.go | `Context` same file | yes | none | pass (unchanged since c1) |
| internal/session/status.go | location.go (`adoptClaudeDir`) | yes | none | pass (unchanged since c1) |
| internal/session/writeorder.go | — | n/a (field-list rows) | none | pass (unchanged since c1) |
| internal/session/CLAUDE.md | — | doc | — | review-work's |
| internal/store/migrations/0014_prompt_cache.sql | 0003 | yes | none | pass (unchanged since c1) |
| internal/store/session.go | `last_snapshot_at` decode same file | yes | none | pass (unchanged since c1) |
| web/src/features/actions.ts | groups.ts, rename.ts | Decisions bullet (`actions.inFlight`) | none | pass (unchanged since c1) |
| web/src/features/groups.ts | groupsdialogs.ts, groupsselect.ts, rail.ts | yes | filelen 507, reason partly holds | pass (unchanged since c1; Note 3) |
| web/src/features/rail.ts | groups.ts, tiles.ts, ../sessions/railorder.ts | yes (`planDrop`; Fix Attempt 1 `draggable` predicate) | none | pass (Note 2) |
| web/src/features/railmenu.ts | groups.ts, groupsdialogs.ts, actions.ts | yes | none | pass (unchanged since c1) |
| web/src/features/railmenuitems.ts | ../sessions/card.ts, actionscopy.ts | yes | none | pass (Major 1 fixed; Note 1) |
| web/src/features/tiles.ts | rail.ts | yes (railmenu line) | none | pass (unchanged since c1) |
| web/src/features/CLAUDE.md | — | doc | — | review-work's |
| web/src/main.ts | — | n/a (one-line registration) | none | pass (unchanged since c1) |
| web/src/protocol/session.ts | `parseContext`, `parseSessionPlan` same file | yes (wire) | none | pass (unchanged since c1) |
| web/src/render/anchored.ts | menu.ts, grouppopover.ts | n/a | none | pass (unchanged since c1) |
| web/src/render/grouppopover.ts | railsections.ts | yes | none | pass (unchanged since c1) |
| web/src/render/menu.ts | anchored.ts, grouppopover.ts | Decisions bullet (point-open) | none | pass (unchanged since c1; Note 6) |
| web/src/render/railsections.ts | sessions.ts, grouppopover.ts | yes (header `.gt`) | none | pass (unchanged since c1; c1 Note 6 stands) |
| web/src/render/sessions.ts | tiles.ts, railsections.ts | yes (Fix Attempt 1) | none | pass (Minor 3 fixed) |
| web/src/render/tiles.ts | sessions.ts | n/a (option pass-through) | none | pass |
| web/src/render/warmth.ts | context.ts, actionbutton.ts | yes | none | pass (unchanged since c1) |
| web/src/render/CLAUDE.md | — | doc | — | review-work's |
| web/src/sessions/cache.ts | format.ts, sections.ts, card.ts | yes | none | pass (Minor 2 fixed; c1 Note 4 stands) |
| web/src/sessions/card.ts | format.ts, sections.ts | yes (moved `cardTimerText`) | none | pass (unchanged since c1) |
| web/src/sessions/format.ts | card.ts (`elapsedSeconds` caller), cache.ts | yes (Fix Attempt 1) | none | pass (Note 5) |
| web/src/sessions/railorder.ts | reorder.ts, sections.ts | yes | none | pass (unchanged since c1) |
| web/src/sessions/sections.ts | cache.ts, card.ts | yes | none | pass (unchanged since c1) |
| web/src/sessions/testfixtures.ts | — | n/a | none | pass (unchanged since c1) |
| web/src/sessions/CLAUDE.md | — | doc | — | review-work's |
| web/src/style.css | — (the contrast gate's: 46 pairs, 0 failures) | Decisions bullet (tint) | none | pass (unchanged since c1) |

## Issues

### Critical

### Major

### Minor

### Notes
1. **[note]** `cardMenuItems` calls `stopResumeButton(session, state.connected)` (`web/src/features/railmenuitems.ts:59`) only for its `.label`. The `disabled` and `reason` it computes are thrown away, and `entry` recomputes `disabled` through `actionEnabled`. The result is correct and reads the owner. `session.alive ? "Stop" : "Resume"` would say the same thing with less indirection, but both are acceptable.
2. **[note]** `features/rail.ts` now states the select-mode drag rule twice, both in the controller: `carriedBy` (`:119-121`, "selecting and selected → the whole selection") and the `draggable` predicate (`:192`, "selecting → only selected cards"). They agree. Because of the predicate, `carriedBy`'s single-card fallback while selecting can no longer be reached from the UI. One owner is kept, so nothing is requested.
3. **[note]** `web/src/features/groups.ts` is 507 lines (filelen), unchanged since cycle 1. The Decisions reason holds for `moveToEntries`/`moveSessions`, and less well for `reorderSection` (cycle 1 Note 1 stands).
4. **[note]** The size log's other hits fall to others or are carried forward. `claudecodetest.go` is 641 lines, and its reason holds (it was about 620 before this branch). `machine.go:23` `applyInput` is pre-existing and untouched. The test-file funlen hits (`status_test.go:148` 62 > 60, `session/cache_test.go:291` 80, `store/session_test.go:181` 99, `canary_test.go:369` 44) are the test agents'. There are no `dupl` hits.
5. **[note]** `remainingSeconds` (`web/src/sessions/format.ts:20`) sits beside `elapsedSeconds`, which guards `NaN` and clamps to zero. `remainingSeconds` does neither. Not clamping is deliberate, because a negative remainder is how `cacheWarmth` reads cold. The `NaN` case is shut out upstream: `parseCache` (`protocol/session.ts:255`) rejects an unparseable `expiresAt`. A future caller that passes an unvalidated string would get `NaN`, so a doc comment saying "may be negative; caller passes a validated ISO" would help the next reader. That belongs to the comment pass.
6. **[note]** Comments the point-open path made stale, for the comment pass. `render/menu.ts:8-9`'s header ("the opener … only has its `aria-expanded` written") and the `Menu.open` doc (`:34`, "Opens `entries` under `opener`, or closes the menu if `opener` already has it open") both describe only the anchored path. With `at`, the menu opens at a point, writes nothing on the opener and never toggles. `render/sessions.ts:201` ("never set to 'false', matching the pattern `draggable` below uses") is wrong too: `draggable` is written as an explicit `"false"` (`:229`). That line is pre-existing.
7. **[note]** `features/railmenu.ts:24` `openFor` is never cleared when the menu closes some other way. A later `sessionRemoved` for that id calls `menu.close()` on a closed menu, which is a no-op. Harmless.
8. **[note]** For review-work, outside my scope: the gates' one red line is `11-kb-check.log`. `docs/facts/haiku-main-cache-ttl-5m-on-2-1-299.md` and `docs/facts/resume-reads-prior-prompt-cache.md` have a verified upper bound of 2.1.300, above the version record ceiling of 2.1.296 (`internal/claudecode/observed_versions.txt`).
