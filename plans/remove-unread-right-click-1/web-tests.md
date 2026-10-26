# Web Tests: remove-unread-right-click-1

**Plan**: remove-unread-right-click-1
**Verdict**: authored
**Pack**: kb: pack 23984 words (budget 30000)

## Summary

Red-first. Written against the plan with no implementation: every new assertion fails today.

## Tests

| File | Test | Red today because |
|------|------|-------------------|
| `src/features/railmenuitems.test.ts` | live card offers Stop… then Remove…; mark entries on every card, disabled with connection/busy; all-live selection `["Stop…","Remove…"]`; mark entries on every selection | received `[["Stop…","end",false]]`, no mark entries |
| `src/api/sessions.test.ts` | `setSessionUnread` sends `PUT /api/sessions/7/unread {unread}`, 204 ok, 404 `unknown_session` | `setSessionUnread is not a function` |
| `src/api/http.test.ts` | `setSessionUnread` network_error row beside `pinSession` | same |
| `src/render/mainhead.test.ts` | Stop/Resume describe and `stopResumeBtn`/`removeBtn` fake fields removed | renderMainhead still writes the buttons: `TypeError: Cannot read properties of undefined (reading 'textContent')` |

## Handoff Received

None (red-first).

## Notes

- The plan names no shape for the mark entries. Tests assume `marks: CardMenuAction[]` (Mark as read, then Mark as unread; non-danger) on both `cardMenuItems` and `selectionMenuItems` results, read through a cast. web-impl may pick another shape; if so these rows are re-pointed, the labels and enabled rules stay.
- `tsc --noEmit` fails on src/ by design until web-impl lands: `setSessionUnread` has no export, and the mainhead fake no longer supplies `stopResumeBtn`/`removeBtn`, which `MainheadElements` still requires. The e2e/ and render/ errors (`headerButton`, `headerStopResume`) belong to other agents' uncommitted work.
- mainhead.test.ts goes red wholesale (30 of 33) on a TypeError, not an assertion, because the fake no longer has the buttons the current renderer writes; it is green again once the buttons leave `renderMainhead`.

## Test Run Output

```
src/api/sessions.test.ts       4 failed  (setSessionUnread is not a function)
src/features/railmenuitems.test.ts 11 failed (expected [["Stop…","end",false],["Remove…","remove",true]], received [["Stop…","end",false]])
src/render/mainhead.test.ts    30 failed (TypeError: Cannot read properties of undefined (reading 'textContent'))
src/api/http.test.ts           1 failed  (setSessionUnread is not a function)
```
