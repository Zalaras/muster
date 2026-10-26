# Maintainability review: Remove, unread and right-click (1)

**Plan**: remove-unread-right-click-1
**Verdict**: needs-changes
**Cycle**: 2
**Pack**: kb: pack 26100 words (budget 30000)
**Scope**: 18 files from `git diff main...HEAD -- cmd internal web/src ':!*_test.go' ':!*.test.ts'` (4 of them generated `CLAUDE.md` trailers). Full re-review: the spawn prompt did not mark this cycle as a delta. I also opened `internal/session/session.go` and `internal/session/writeorder.go`, which are outside the diff, because they declare and describe the state that `SetUnread` writes.

## Cycle 1 findings, re-checked

| Cycle 1 finding | Fix commit | Verified how |
|-----------------|------------|--------------|
| Major 1: `SetUnread` copied `MarkSeen` | 5013a95d | `manager_rail.go:169-171`: `MarkSeen` is now `return m.SetUnread(ctx, id, false)`. `rg -n "\.Unread\s*=" internal --type go -g '!*_test.go'` finds one write outside the state machine (`manager_rail.go:188`), plus `apply.go:94` and `session.go:321`. The idle guard applies only to `unread=true`, so `MarkSeen` still returns before any write when the session is already read. `02-test.log`: `internal/session ok` under `-race`. Resolved |
| Minor 1: `stopResumeButton` had dead fields | 8c72b894 | `StopResumeButton`/`stopResumeButton` are deleted. `rg -n "stopResumeButton\|StopResumeButton" web/src web/render web/e2e` finds nothing. `cardMenuItems` picks `primary` inline (`railmenuitems.ts:71`) and gets enablement from `actionEnabled` through `entry()`. `card.ts` went from 501 to 477 lines, so its file-length warning is gone. Resolved |
| Minor 2: `CardMenuRequest.card` named the wrong thing | 8c72b894 | The field is now `opener` (`render/sessions.ts:22`), and every producer and consumer uses the new name: `sessions.ts:302`, `:313`, `railmenu.ts:68`, `:80`, `focus.ts:160`. It matches `createMenu().open(opener, …)`. Resolved |

## Files

| File | Siblings opened | design: line | Size warnings | Result |
|------|-----------------|--------------|---------------|--------|
| internal/server/rail.go | groups.go, actions.go, note.go, respond.go (`writeInvalidRequest` vs `writeJSONError` usage) | yes (daemon Decisions 2, 3) | dupl ×2 (41-65 / 71-95), reason given, mostly holds (Note 1) | pass |
| internal/session/manager_rail.go | session.go (`Unread` declaration, `setState`), writeorder.go (`persistWholeRowLocked`), apply.go | yes (Fix Attempt 1: "`MarkSeen` delegates to `SetUnread`") | none | Minor 1 |
| internal/server/CLAUDE.md | n/a | n/a (generated kb trailer) | none | pass |
| internal/session/CLAUDE.md | n/a | n/a (generated kb trailer) | none | pass |
| web/src/api/sessions.ts | same file's `pinSession`, `putTitle` | covered by web Decisions | none | pass (Note 2) |
| web/src/features/actions.ts | railmenu.ts, focus.ts | no new type | none | pass (Note 3) |
| web/src/features/focus.ts | rail.ts:38, tiles.ts:66 (`railMenu` dep shape identical), groups.ts | yes (header ⋯ reuses `railMenu.open`; not in `MainheadElements` because `renderMainhead` never writes it) | none | pass |
| web/src/features/railmenu.ts | railmenuitems.ts, groups.ts | yes (marks field, separators, per-id loop) | none | pass |
| web/src/features/railmenuitems.ts | sessions/card.ts, batchplan.ts | yes (`marks: CardMenuAction[]`) | none | pass |
| web/src/features/CLAUDE.md | n/a | n/a (generated kb trailer) | none | pass |
| web/src/main.ts | n/a (composition root) | n/a | none | pass: one-line `railMenu` dep; `railMenu` is already built at `:53`, before `initFocus` |
| web/src/render/mainhead.ts | focusview.ts, dead.ts, effortstrip.ts | n/a (removal) | none | pass |
| web/src/render/menu.ts | sessions.ts (`CardMenuRequest.at?`) | covered by the header ⋯ design line | none | pass |
| web/src/render/rename.ts | n/a (comment-only change) | n/a | none | pass |
| web/src/render/sessions.ts | tiles.ts, rail.ts, railmenu.ts (every `CardMenuRequest` consumer) | yes | none | pass |
| web/src/render/CLAUDE.md | n/a | n/a (generated kb trailer) | none | pass |
| web/src/sessions/card.ts | render/dead.ts, railmenuitems.ts | no new type | none (477 lines, was 501) | pass (Note 4) |
| web/src/style.css | n/a (removal of `.stop-resume` and two comments) | n/a | none | pass (Note 5) |

## Issues

### Critical

### Major

### Minor

1. **[daemon-impl]** The `Unread` field's declaration still lists its writers as they were before this branch. Two places describe them:
   - `internal/session/session.go:168-173` reads: "The invariant Unread implies State == idle is enforced by setState — the one place every applyInput arm routes through. Set by Manager.Apply after a turn_closed input per the watcher's answer; cleared by Manager.MarkSeen (attach on either surface)."
   - `MarkSeen`'s own doc comment (`manager_rail.go:162-168`) adds: "set by Apply's turn_closed handling (apply.go), cleared here".

   On this branch, `SetUnread` (`manager_rail.go:173`), called from `PUT /api/sessions/{id}/unread` (`rail.go:83`), both sets and clears the flag. It also enforces the `unread ⇒ idle` half itself (`manager_rail.go:180-182`, `if unread && sess.State != StateIdle { unread = false }`) without going through `setState`. `MarkSeen` now holds no body; it delegates. `writeorder.go:72` still lists `MarkSeen` as the whole-row setter that calls `persistWholeRowLocked`, but `SetUnread` is the one that calls it now.

   This breaks `docs/conventions.md` § Design, "Shared state names its writers and its guard", and the "One owner per concept" line: the invariant now has two homes, and the declaration names one of them. A newcomer asking "why is this card unread" reads the field, sees only Apply and attach, and never finds the route. The comment pass judges only comments the diff touched, so it never saw these three. `rg -n "cleared by|MarkSeen" internal/session -g '!*_test.go'` shows them:
   ```
   internal/session/session.go:172:	// input per the watcher's answer; cleared by Manager.MarkSeen (attach on either
   internal/session/writeorder.go:72:// persistWholeRowLocked is the shared tail every whole-row setter (SetTitle, MarkSeen,
   internal/session/manager_rail.go:162:// MarkSeen clears id's Unread flag (kb:adr/rail-unread-inferred-from-live-terminal-client):
   ```
   What a fix must make true:
   - The `Unread` declaration names every writer: Apply, `SetUnread` (the developer's request) and `MarkSeen` (attach, through `SetUnread`).
   - The declaration names both places that keep `Unread ⇒ idle` (`setState` for transitions, `SetUnread` for a request that causes none), or the enforcement moves so that one place is true.
   - `writeorder.go`'s setter list and `MarkSeen`'s comment no longer say the clear happens in `MarkSeen`'s own body.
   - No behaviour changes.

### Notes

1. **[note]** The `dupl` warning (`rail.go:41-65` / `71-95`, pin vs unread handler) is unchanged from cycle 1, and so is my reading of it. The reason's first half holds: a shared helper would take a field name, a message and a setter, which is more indirection than the 25 lines it saves, and `groups.go`'s collapsed handler is the same shape and is not shared either. The second half ("pin renumbers, unread does not") describes the managers, not the handlers. The handler's `writeJSONError(w, http.StatusBadRequest, "invalid_request", …)` matches its own file (`rail.go:49`, `:110`) and most packages (`note.go:47`, `issue.go:197`, `prefs.go:293`). Only `groups.go` and `actions.go` use `respond.go`'s `writeInvalidRequest`, so this is not a divergence from its siblings.
2. **[note]** `handleUnreadSession`/`unreadSessionRequest` (`rail.go:67-71`) and `setSessionUnread` (`api/sessions.ts:103`) have no comment. Their siblings `handlePinSession` (`rail.go:40`) and `pinSession` (`api/sessions.ts:94-98`) cite `kb:anchor/sessions.pin`. `internal/server/CLAUDE.md`'s invariant "a route comment cites its anchor as `kb:anchor/<area>.<name>`" is a stated rule, so it belongs to review-work. Under conventions § Comments ("Default to none"), it is not a maintainability finding.
3. **[note]** The mark actions call `setSessionUnread` inline and outside `track` (`actions.ts:229-230`), as `doPin` does. So `inFlight`/`busy` never cover a mark, the same as for pin. The shape is consistent; I am not asking for a change.
4. **[note]** The cycle 2 comment pass dropped `actionEnabled`'s doc comment (`sessions/card.ts:124`, "The one rule every rail, tile, mainhead and dead-surface button reads, so no surface re-derives it"), which exists on `main`. That was the judge's call under kb:adr/process-comment-pass-owns-code-comments. It means the only text that marked `actionEnabled` as the single source of the enablement rule is gone. `canResume`'s kept comment still says "the one place that rule is written".
5. **[note]** `style.css:901-903`: removing the ADR citation left one comment line well over 100 characters ("…changes neither the meta's size nor the row the cluster wraps on, at any width. While it is hidden its slot stays"). Biome does not format `style.css`, so nothing will reflow it. This is cosmetic.
6. **[note]** The cycle 1 notes on the selection marks' per-id `dispatch` loop (`railmenu.ts:90`), and on the header ⋯ opening the selection menu in Select mode, still apply unchanged. Neither is a maintainability finding.
