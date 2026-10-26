# Maintainability review: Remove, unread and right-click (1)

**Plan**: remove-unread-right-click-1
**Verdict**: needs-changes
**Cycle**: 1
**Pack**: kb: pack 26100 words (budget 30000)
**Scope**: 18 files from `git diff main...HEAD -- cmd internal web/src ':!*_test.go' ':!*.test.ts'` (4 of them generated `CLAUDE.md` trailers); `web/index.html` (outside the scope glob) was opened for the header ⋯ markup only

## Files

| File | Siblings opened | design: line | Size warnings | Result |
|------|-----------------|--------------|---------------|--------|
| internal/server/rail.go | groups.go (`handleSetAllCollapsed`), actions.go (`decodeBatchRequest`), respond.go | yes (daemon Decisions 2, 3) | dupl ×2 (41-65 / 71-95), reason given, mostly holds (Note 1) | pass |
| internal/session/manager_rail.go | apply.go, session.go (`setState`), writeorder.go (`persistWholeRowLocked`), title.go, note.go | yes ("shaped like `MarkSeen`") | none | Major 1 |
| internal/server/CLAUDE.md | — | n/a (generated kb trailer) | none | pass |
| internal/session/CLAUDE.md | — | n/a (generated kb trailer) | none | pass |
| web/src/api/sessions.ts | same file's `pinSession`, `resumeSession` | covered by web Decisions | none | pass |
| web/src/features/actions.ts | railmenu.ts, focus.ts, tiles.ts | no new type | none | pass (Note 3) |
| web/src/features/focus.ts | rail.ts, tiles.ts (`railMenu` dep), groups.ts (`#rail-actions-button`) | yes (header ⋯ reuses `railMenu.open`) | none | pass |
| web/src/features/railmenu.ts | railmenuitems.ts, groups.ts | yes (marks field, separators, per-id loop) | none | pass |
| web/src/features/railmenuitems.ts | sessions/card.ts, batchplan.ts | yes (`marks: CardMenuAction[]`) | none | pass |
| web/src/features/CLAUDE.md | — | n/a (generated kb trailer) | none | pass |
| web/src/main.ts | — (composition root) | n/a | none | pass — one-line `railMenu` dep, already constructed above `initFocus` |
| web/src/render/mainhead.ts | focusview.ts, dead.ts, effortstrip.ts | n/a (removal) | none | pass |
| web/src/render/menu.ts | sessions.ts (`CardMenuRequest`) | covered by the header ⋯ design line | none | pass |
| web/src/render/rename.ts | — (comment-only change) | n/a | none | pass |
| web/src/render/sessions.ts | tiles.ts, rail.ts, railmenu.ts (every `CardMenuRequest` consumer) | yes ("`card` is therefore the opener") | none | Minor 2 |
| web/src/render/CLAUDE.md | — | n/a (generated kb trailer) | none | pass |
| web/src/sessions/card.ts | render/dead.ts, render/tiles.ts, railmenuitems.ts | no new type | filelen 501, unchanged from `main` (501), reason given and holds | Minor 1 |
| web/src/style.css | — (removal of `.stop-resume` and two comments) | n/a | none | pass |

## Issues

### Critical

### Major

1. **[daemon-impl]** `SetUnread` copies `MarkSeen`'s body instead of generalising it — `internal/session/manager_rail.go:189-210` against `:169-187`. This breaks `docs/conventions.md` § Design "Reuse before add": "What it finds is reused or generalised, never copied, whatever Decisions says." `SetUnread(ctx, id, false)` and `MarkSeen(ctx, id)` do the same thing on every input. Both lock `m.mu`, return `ErrUnknownSession` on a miss, return nil without writing when `Unread` is already false, and otherwise clone, clear, clone and call `persistWholeRowLocked(..., true)`. Only the wrapped error text differs. The daemon Decisions line says it "is a setter shaped like `MarkSeen` … rather than a new write path", so the two were meant to share one path, but they are two copies. The Unread lock, no-op check and persist tail now live in two places that must stay in step. Evidence:
   ```
   $ rg -n "\.Unread\s*=|Unread =" internal --type go -g '!*_test.go'
   internal/session/apply.go:94:     sess.Unread = m.watcher == nil || !m.watcher.Watched(musterSessionID)
   internal/session/manager_rail.go:181:     sess.Unread = false        // MarkSeen
   internal/session/manager_rail.go:204:     sess.Unread = unread       // SetUnread
   internal/session/session.go:321:  s.Unread = false               // setState
   ```
   `func (m *Manager) MarkSeen(ctx context.Context, id int64) error` beside `func (m *Manager) SetUnread(ctx context.Context, id int64, unread bool) error`. A fix must leave exactly one locked body that writes `Unread` from outside the state machine. `MarkSeen`'s callers (`internal/server/terminal.go:382`, `renderfix_scenarios_rail.go:214`) must keep their behaviour: no write and no broadcast when the session is already read. The existing `TestSetUnread_*` and `MarkSeen` tests in `internal/session/rail_unread_test.go` must stay green unchanged.

### Minor

1. **[web-impl]** `stopResumeButton` keeps three fields that no production code reads — `web/src/sessions/card.ts:146-166`. The function existed for the Focus header's Stop/Resume button, which this branch deletes (`render/mainhead.ts` `renderStopResume`, `features/focus.ts` click listener). Its one remaining caller, `features/railmenuitems.ts:72`, reads only `primary.label`. `action`, `disabled` and `reason` (and the `resumeDisabledReason` call in it) are now computed for nobody but `sessions/card.test.ts:1125`. Evidence:
   ```
   $ rg -n "stopResumeButton|StopResumeButton" web/src -g '!*.test.ts'
   web/src/features/railmenuitems.ts:8:  stopResumeButton,
   web/src/features/railmenuitems.ts:72:  const primary = stopResumeButton(session, state.connected);
   web/src/sessions/card.ts:146:export interface StopResumeButton {
   web/src/sessions/card.ts:153:export function stopResumeButton(
   ```
   A newcomer reading the type will look for the consumer of `reason`, and the file it sits in is already over the 500-line threshold. A fix must leave no exported field or computation in `sessions/card.ts` that only a test reads. The dead surface keeps its own `resumeDisabledReason`/`actionEnabled` path (`render/dead.ts:79-81`). The matching W3 table in `sessions/card.test.ts:1122-1200` follows in `[web-tests]`'s wave.

2. **[web-impl]** `CardMenuRequest.card` no longer names what it holds — `web/src/render/sessions.ts:20-24`, `web/src/features/focus.ts:160`. The header ⋯ passes `{ id, card: moreBtn }`, a button and not a card. The web Decisions line states the new meaning ("`CardMenuRequest.card` is therefore 'the opener'"), but the field name still says the old one. Every sibling consumer destructures it as `card` (`features/railmenu.ts:68`, `:80`) and passes it to `createMenu().open(opener, …)` (`render/menu.ts`), whose own parameter is already called the opener. This breaks § Design "Match the siblings … naming": the request type and the menu it feeds now use different names for the same value. A fix must make the field name match what every caller passes (the element the menu anchors to and toggles from) across `render/sessions.ts`, `render/tiles.ts`, `features/rail.ts`, `features/tiles.ts`, `features/railmenu.ts` and `features/focus.ts`.

### Notes

1. **[note]** The `dupl` warning on `internal/server/rail.go:41-65 / 71-95` (pin handler vs unread handler) has a two-part reason in daemon Decisions. The first part holds: a shared helper would take the field name, the 400 message and the setter as parameters, which is more indirection than the 25 lines it saves. The groups `collapsed` handler (`groups.go:268`) is the same shape and is also not shared. The second part, "the two handlers are expected to diverge (pin renumbers, unread does not)", describes the managers (`SetPinned` vs `SetUnread`), not the handlers, which stay identical. One small divergence came along with the copy. `handleUnreadSession` writes its 400 with `writeJSONError(w, http.StatusBadRequest, "invalid_request", …)` (`rail.go:79`), copied from the older pin handler. Its neighbour `handleSetAllCollapsed` uses `respond.go:53`'s `writeInvalidRequest`, which that file calls "the rejection every request-body validator answers with". A fix to Major 1 or a later cleanup could align both rail handlers.
2. **[note]** `SetUnread` checks `unread && sess.State != StateIdle` itself (`manager_rail.go:196`), so the `unread ⇒ idle` rule now has two homes: `setState` (`session.go:318-321`) for transitions, and this setter for a request that causes none. The guard is needed because no transition runs on this path. Shared state is fine: the check and the mutation sit under one `m.mu` section, the persist goes through the per-id write turnstile, and `go test -race ./...` (gates `02-test.log`, `internal/session ok`) covers `TestSetUnread_FromEveryReachableState`. I found no interleaving that leaves `Unread` true on a non-idle session.
3. **[note]** In `features/actions.ts:229-230` the marks call `setSessionUnread` inline, while the pin branch beside them calls the one-line wrapper `doPin` (`:161`). Both work the same way (fire and forget, no optimistic state). The difference is cosmetic, and `doPin` arguably earns nothing either.
4. **[note]** The selection menu's marks loop `dispatch` once per id (`features/railmenu.ts:90`, `else for (const id of ids) …`). The web Decisions line gives the reason (the plan has no batch route). Because the `else` branch catches every action that is not `end`/`remove`, any action added to `items.marks` later will loop by default. That is fine today. kb:adr/actions-bulk-stop-remove-are-daemon-batches ("the dashboard never loops") covers Stop/Remove only.
5. **[note]** The header ⋯ uses `railMenu.open`, so in Select mode, with the focused session among the selected cards, it opens the selection menu ("Actions for N sessions") rather than the focused card's own menu (`features/railmenu.ts:110-114`). Whether that is the intended header behaviour belongs to review-work/review-browser.
