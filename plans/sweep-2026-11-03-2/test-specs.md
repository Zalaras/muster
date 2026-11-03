# E2E Test Specs: sweep-2026-11-03-2

**Plan**: sweep-2026-11-03-2
**Mode**: authoring (red-first)
**Pack**: kb: pack 17682 words (budget 30000)
**Verdict**: authored
**Tests created**: 3 new, 7 updated
**Live run**: 0/10 passing by design (red-first; each red below is the plan's diagnosis, not a locator defect)

## Tests

| File | Test Name | Requirement | What It Verifies | Live run |
|------|-----------|-------------|------------------|----------|
| web/e2e/effort-header.spec.ts | a keyboard Dismiss puts focus in the session's terminal (REQ-1, E4) | REQ-1 | Enter on focused Dismiss hides the strip and focus lands inside `Terminal: <title>` | ran-red-at-authoring: `Expected: true Received: false` polling `activeElementInsideTerminal` |
| web/e2e/effort-header.spec.ts | a keyboard Dismiss with Docs selected puts focus on the header's Session actions ⋯, never on the page (REQ-1, E4) | REQ-1 | with Docs selected, strip hides and `#mainhead .acts` Session actions is focused | ran-red-at-authoring: `toBeFocused` on Session actions, `Received: inactive` |
| web/e2e/rail-menu.spec.ts | a selection mixing an unread and a read session offers Mark as read, and choosing it sends one request per selected session (REQ-5, #103) | REQ-5 | new: mixed selection leads with "Mark as read", no "Mark as unread", one PUT unread:false per id | ran-red-at-authoring: first label `Expected: "Mark as read" Received: "Stop…"` |
| web/e2e/rail-menu.spec.ts | right-clicking a selected card in Select mode ... (REQ-3, REQ-4, #97) | REQ-3, REQ-5 | single-card menu `[Mark as unread, Stop…, Remove…, Pin, review, New group…, No group]`; selection menu `[Mark as unread, Stop…, Remove…, review, New group…, No group]` | ran-red-at-authoring: array diff |
| web/e2e/rail-menu.spec.ts | Shift+F10 and the ContextMenu key ... (REQ-9, E9, INV-4) | REQ-3 | first item focused is the toggle; Move to reached after the new walk | ran-red-at-authoring: toggle `toBeFocused` inactive |
| web/e2e/rail-menu.spec.ts | with the daemon down the card menu still opens ... (REQ-10, E6) | REQ-4 | one toggle item enabled after restart, its opposite absent | ran-red-at-authoring: `Mark as read` count 1, expected 0 |
| web/e2e/rail-menu.spec.ts | Mark as unread on an idle read card ... (REQ-1, REQ-2, #103) | REQ-4 | toggle first, opposite absent, label flips with state | ran-red-at-authoring: `Expected "Mark as unread" Received "Stop…"` |
| web/e2e/rail-menu.spec.ts | Mark as read and Mark as unread from a selected card's menu ... (REQ-2, #103) | REQ-4, REQ-5 | selection toggle first, opposite absent, flips after the batch | ran-red-at-authoring: first label `Stop…` |
| web/e2e/rail-menu.spec.ts | Remove… from a live card's menu ... (REQ-3, #104) | REQ-3 | first three labels `[Mark as unread, Stop…, Remove…]` | ran-red-at-authoring: array diff |
| web/e2e/actions.spec.ts | Removing a live session ends it first ... (E9) | REQ-3 | same first-three-labels check (outside the plan's list; same order change) | ran-red-at-authoring: array diff |
| web/e2e/rail-cards.spec.ts | stopping from the card menu ends only that session ... (E9, REQ-7) | REQ-3 | ended card menu `[Mark as unread, Resume, Remove…]` | ran-red-at-authoring: `Expected "Mark as unread" Received "Resume"` |

Unchanged rail-menu tests ran green at authoring (10 passed of 17; the 7 reds are the rows above), as expected.

## Deleted Tests

None.

## Fixture Changes

No changes needed. effort-header: `warnedSession` (launch opus at max, post high). The Docs case selects Docs through `mainheadSurfaceButton` (helpers/shell re-export) before focusing Dismiss.

## Coverage

| Requirement | E2E Tests |
|-------------|-----------|
| REQ-1 | both keyboard Dismiss tests |
| REQ-3 | the Select-mode, keyboard-walk, Remove-live, actions and rail-cards tests |
| REQ-4 | the daemon-down and Mark-as-unread single-card tests |
| REQ-5 | Select-mode, selected-card Mark, and the mixed-selection test |

## E2E Implementation Bugs

None for E2E. See Handoff for a defect in another agent's file.

## Handoff

- `web/render/helpers/style.ts` (render-tests, commit f4c19ce8) fails `tsc --noEmit` (`TS2532` at lines 90-91, `data[i]` possibly undefined). That breaks `make web-build`, hence `make e2e`. I built with `cd web && npx vite build` then `make build` instead, which is the same bundle. render-tests must fix the helper before the gate.
- Edge 2 and 3 (failed Dismiss, strip hiding while focus is elsewhere) are not covered here, per the plan.
- `web/e2e/actions.spec.ts:549` and `web/e2e/rail-cards.spec.ts:320` assert the old menu order; the plan's breakage list omitted them. Both are updated.
- Every "Mark as unread" expectation assumes a session with no closed turn is read.

## Test Run Output

```
effort-header (-g "keyboard Dismiss"): 2 failed (both red on the assertions above)
rail-menu.spec.ts: 7 failed, 10 passed
actions "Removing a live session ends it first": 1 failed
rail-cards "stopping from the card menu": 1 failed
npx playwright test --list: Total: 650 tests in 60 files
npx biome check (4 files): clean
```
