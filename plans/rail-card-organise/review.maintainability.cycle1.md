# Maintainability review: Rail Card Organise

**Plan**: rail-card-organise
**Verdict**: needs-changes
**Cycle**: 1
**Pack**: kb: pack 21303 words (budget 30000)
**Scope**: 37 files from `git diff main...HEAD -- cmd internal web/src ':!*_test.go' ':!*.test.ts'` (31 code, 1 migration, 5 CLAUDE.md docs)

## Files

| File | Siblings opened | design: line | Size warnings | Result |
|------|-----------------|--------------|---------------|--------|
| internal/claudecode/status.go | usageapi.go (`parseResetsAt`), interpret.go | partial: types yes; `interpretPromptCache`/`parseCacheTTL` none | none | Minor 1 |
| internal/claudecode/claudecodetest/claudecodetest.go | (same file's `StatusLineFullOpts`) | yes | filelen 641, reason holds | pass (Note 2) |
| internal/claudecode/CLAUDE.md | — | doc | — | review-work's |
| internal/server/sessionwire.go | sessionWireContext in same file | yes | none | pass |
| internal/session/apply.go | status.go, location.go | yes | none | pass |
| internal/session/machine.go | apply.go | n/a (one line in `applyBind`) | funlen `applyInput` 51, pre-existing, untouched | pass (Note 3) |
| internal/session/row.go | `contextFromRow`/`contextToRow` same file | yes | none | pass (Note 9) |
| internal/session/session.go | `Context` same file | yes | none | pass (Note 8) |
| internal/session/status.go | location.go (`adoptClaudeDir`) | yes | none | pass |
| internal/session/writeorder.go | — | n/a (field-list rows) | none | pass |
| internal/session/CLAUDE.md | — | doc | — | review-work's |
| internal/store/migrations/0014_prompt_cache.sql | 0003 | yes | none | pass |
| internal/store/session.go | `last_snapshot_at` decode same file | yes | none | pass (Note 9) |
| web/src/features/actions.ts | groups.ts, rename.ts | bullet in Decisions (`actions.inFlight`) | none | pass (Note 5) |
| web/src/features/groups.ts | groupsdialogs.ts, groupsselect.ts, rail.ts | yes | filelen 507, reason partly holds | pass (Note 1) |
| web/src/features/rail.ts | groups.ts, tiles.ts | yes (`planDrop`) | none | pass |
| web/src/features/railmenu.ts | groups.ts, groupsdialogs.ts, actions.ts, usage.ts | yes | none | pass (Note 7) |
| web/src/features/railmenuitems.ts | actionscopy.ts, groupscopy.ts, ../sessions/card.ts | yes | none | Major 1 |
| web/src/features/tiles.ts | rail.ts | yes (railmenu line) | none | pass |
| web/src/features/CLAUDE.md | — | doc | — | review-work's |
| web/src/main.ts | — | n/a (one-line registration) | none | pass |
| web/src/protocol/session.ts | `parseContext`, `parseSessionPlan` same file | yes (wire) | none | pass |
| web/src/render/anchored.ts | menu.ts, grouppopover.ts | n/a | none | pass (Note 8) |
| web/src/render/grouppopover.ts | railsections.ts | yes | none | pass |
| web/src/render/menu.ts | anchored.ts, grouppopover.ts | Decisions bullet (point-open) | none | pass |
| web/src/render/railsections.ts | sessions.ts, grouppopover.ts | yes (header `.gt`) | none | pass (Note 6) |
| web/src/render/sessions.ts | tiles.ts, railsections.ts, focuskeep.ts | partial | none | Minor 3 |
| web/src/render/tiles.ts | sessions.ts | n/a (option pass-through) | none | pass |
| web/src/render/warmth.ts | context.ts, actionbutton.ts | yes | none | pass |
| web/src/render/CLAUDE.md | — | doc | — | review-work's |
| web/src/sessions/cache.ts | format.ts, sections.ts, sort.ts, card.ts | yes | none | Minor 2 (Note 4) |
| web/src/sessions/card.ts | format.ts, sections.ts | yes (moved `cardTimerText`) | none (495 lines) | pass |
| web/src/sessions/railorder.ts | reorder.ts, sections.ts | yes | none | pass |
| web/src/sessions/sections.ts | cache.ts, card.ts | yes | none | pass |
| web/src/sessions/testfixtures.ts | — | n/a | none | pass |
| web/src/sessions/CLAUDE.md | — | doc | — | review-work's |
| web/src/style.css | — (contrast gate's) | Decisions bullet (tint) | none | pass |

## Issues

### Critical

### Major
1. **[web-impl]** `cardMenuItems` re-derives the action-enablement rule and the action vocabulary rather than asking their owner. See `web/src/features/railmenuitems.ts:39` (`const disabled = !state.connected || state.busy;`), `:13-18` (`CardMenuAction.action: "end" | "resume" | "remove"`) and `:47-54` (alive → Stop, else Resume when `canResume`, then Remove). Cites § Design "Reuse before add" and "One owner per concept". `web/src/sessions/card.ts` already holds each piece:
   ```
   sessions/card.ts:21   export type SessionAction = "end" | "resume" | "remove" | "pin";
   sessions/card.ts:23   export const ACTION_BY_LABEL = { Stop: "end", Resume: "resume", Remove: "remove" } …
   sessions/card.ts:126  export function actionEnabled(label: CardAction, claudeSessionId: string | null, connected: boolean): boolean
   sessions/card.ts:150  export function stopResumeButton(session: Pick<Session, "alive" | "claudeSessionId">, connected: boolean): StopResumeButton
   ```
   The doc comment on `actionEnabled` (card.ts:123-125) reads: "The one rule every rail, tile, mainhead and dead-surface button reads, so no surface re-derives it." The card menu is a new surface for Stop, Resume and Remove, and it does not read `actionEnabled`. `rg -n "actionEnabled|canResume" web/src --glob '!*.test.ts'` shows `render/dead.ts:79`, `render/tiles.ts:293` and `card.ts:161` calling `actionEnabled`. `railmenuitems.ts` imports only `canResume`. A fix must make two things true. First, the menu's enabled state for each action comes from `actionEnabled`, with in-flight (`busy`) layered on top. Second, its action type comes from `SessionAction`/`ACTION_BY_LABEL`, not a third spelling. A later change to the enable rule then reaches the menu without anyone editing `railmenuitems.ts`.

### Minor
1. **[daemon-impl]** `parseCacheTTL` hand-parses an `s`/`m`/`h` duration string even though the standard library already has a parser for it, and Decisions has no `design:` line for it or for `interpretPromptCache`. See `internal/claudecode/status.go:194-215` (`cacheTTLUnits` map, a digit loop, overflow check). Cites § Design "Reuse before add" and question 7 (every new seam explained). `rg -n "ParseDuration" internal cmd --glob '!*_test.go'` returns nothing (exit 1). `time.ParseDuration` parses `"1h"`, `"5m"` and `"90s"`. The sibling `parseResetsAt` (`internal/claudecode/usageapi.go:138`) leans on stdlib parsing (`time.Parse`, `json.Unmarshal`) rather than a digit loop. A fix must make one of two things true. Either the TTL goes through `time.ParseDuration` with only the extra constraints the wire needs (positive, whole seconds, a single unit), or a `design:` line names what `ParseDuration` accepts that must be rejected here (fractions like `1.5h`, compounds like `1h30m`, `ms`/`us`), so the next reader does not "simplify" it back.
2. **[web-impl]** `remainingText` is a time formatter in `sessions/cache.ts`, outside the module that owns formatters. See `web/src/sessions/cache.ts:19` (`whole >= 60 ? \`${Math.ceil(whole / 60)}m\` : \`${whole}s\``). Cites § Design "One owner per concept". `web/src/sessions/format.ts:1` introduces that module as "Pure time/number formatters" and holds the neighbours `formatTimer`, `formatAge` (`now`/`Nm`/`Nh`) and `elapsedSeconds`. This new countdown formatter, and its `remainingSeconds` mirror of `elapsedSeconds` (cache.ts:15 against format.ts:14), live elsewhere. A fix must make one of two things true. Either the countdown formatter sits in `format.ts` beside `formatAge`, where the next person looking for "how is a duration shown" finds every variant, or a `design:` line says why it belongs to `cache.ts` alone.
3. **[web-impl]** Whether a card can be dragged is now decided in two places: the controller passes a flag and the renderer overrides it. See `web/src/render/sessions.ts:229` (`options.draggable || isSelected`) against `web/src/features/rail.ts:191` (`draggable: !selecting`). The doc comment that said "the caller decides which, per its own context" was removed from `CardOptions.draggable` (render/sessions.ts:39), and the select-mode policy ("a selected card stays draggable while selecting") now sits in `render/`. Cites conventions § Composition roots: "`render/` holds the DOM half only, taking the already-computed value as a parameter". A fix must make one place, the controller, the whole answer for a given card's draggability, with render applying the value it is handed. For example, a per-id predicate or a per-card value instead of a single boolean that render then amends.

### Notes
1. **[note]** `web/src/features/groups.ts` is 507 lines (filelen). The Decisions reason ("`moveToEntries`/`moveSessions`/`reorderSection` use this module's `settle` and dialogs") holds for `moveToEntries`. It holds less well for `reorderSection` (groups.ts:382), a card-order `PUT /api/sessions/order` that `rail.ts` called directly on `main`. It moved here only to share `settle` (groups.ts:163, three lines over `deps.actions.showError`, which `RailDeps.actions` could reach as well). This is not a request, just context for the next person who wants `groups.ts` under 500.
2. **[note]** `internal/claudecode/claudecodetest/claudecodetest.go` is 641 lines (filelen). The reason holds: the file was already about 620 lines, and the 20 added lines are options that belong beside `StatusLineFullOpts`.
3. **[note]** `internal/session/machine.go:23` `applyInput` funlen 51 > 40 is pre-existing. This branch changes only `applyBind` (one line, machine.go:164), and `applyInput` holds the ADR'd complexity exemption. The test-file funlen hits (`status_test.go`, `cache_test.go` 80, `store/session_test.go` 99, `canary_test.go` 44) belong to the test agents. There are no `dupl` hits.
4. **[note]** `waitingMembers` and `latestEntered` (`web/src/sessions/cache.ts:36,40`) pick which section members a header timer reads. They are not about cache warmth, and their one caller is `headerTimer` in `sessions/sections.ts:326`. They would read more naturally beside it.
5. **[note]** `actions.ts:86` `inFlight` is a `Set`, so two overlapping requests for one id lose track of each other. Example: a single Stop on 5, then a batch Remove of [5, 6] confirmed before the Stop answers. The first `finally` deletes 5 while the second request is still pending, and a card menu opened in that window shows 5's items enabled. A count per id would hold. This is single-threaded JS, so it is not a race, and the daemon serialises per session (kb:adr/actions-serialized-per-session).
6. **[note]** Two writers share `header.summary`'s children. `writeSummary` (`render/railsections.ts:118-133`) `replaceChildren`s on a signature change and so drops the `.gt` node owned by `writeHeaderTimer` (`:135`). It works only because `updateHeader` calls them in that order (`:237-238`), and nothing at either function says so.
7. **[note]** Naming: the module and its handle are `railmenu.ts`/`RailMenuHandle`/the `railMenu` dep, yet `features/tiles.ts` hands it to strip cards too, and everything it carries is named `CardMenu*` (`CardMenuRequest`, `cardMenuItems`, `CARD_MENU_LABELS`). `features/CLAUDE.md` does describe it as "the rail and strip cards' right-click menu".
8. **[note]** Comments (the comment pass owns these):
   - New exported types and methods have no doc comment, unlike their documented siblings: `StatusCache` (status.go:73), `Cache` (session.go:91), `PromptCacheOpts`, `sessionWireCache`, `GroupsHandle.moveToEntries`/`moveSessions`/`reorderSection` (groups.ts:77-79), `ActionsHandle.inFlight` (actions.ts:67).
   - The new modules `railmenu.ts`, `railmenuitems.ts`, `render/warmth.ts` and `sessions/cache.ts` have no header comment; their siblings `groupsdialogs.ts` and `format.ts` do.
   - `Session.Clone`'s doc (session.go:224) lists only Attention, Failure and Model as shared immutable pointers, and Cache (like Context) is one too.
   - `render/anchored.ts:1` still says "The one placement routine" beside the new `placeAtPoint`.
9. **[note]** Both-or-neither for the two cache columns is enforced twice: `scanSession` nils the TTL when the expiry fails to decode (`internal/store/session.go:459`), and `cacheFromRow` checks both (`internal/session/row.go:75`). The sibling `last_snapshot_at` decode does not normalise its partner in `scanSession`. The `design:` line names both places, so this stands as stated.
10. **[note]** For review-work's DIAG row: `docs/diagrams/web-components.md:50` still says `features/` is "34 modules … 12 DOM-free helpers" (now 36, with `railmenu.ts` and `railmenuitems.ts`). `docs/diagrams/store-schema.md` describes migrations 0001-0013, and 0014 adds two `session` columns. Neither diagram is in this branch's diff.
