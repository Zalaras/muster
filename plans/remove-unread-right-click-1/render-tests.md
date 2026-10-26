# Render Tests: remove-unread-right-click-1

**Plan**: remove-unread-right-click-1
**Verdict**: pass
**Pack**: kb: pack 22838 words (budget 30000)

## Summary

Tests created or changed: 8 spec files (authored at bdd3dd73, one title fix c9d6f23f, one assertion fix now) | Passing: 191 (R1 specs) | Failing: 0

## Tests

| File | Test Name | Criterion | What It Verifies | Status |
|------|-----------|-----------|------------------|--------|
| `rail.spec.ts` | right-clicking a live rail card opens a menu ... Stop…, Remove…, groups, Pin, two Mark entries (REQ-1) | R1 | exact label order of the live menu | pass |
| `rail.spec.ts` | ended session menu (menu-plain / menu-pinned) | R1 | Resume, Remove…, groups, Pin, Mark entries; pinned shows Unpin ahead of Mark as read | pass |
| `rail.spec.ts` | Focus header Session actions keeps focus and identity across a render tick, opens the card menu on Enter (REQ-4, REQ-5, REQ-7, REQ-11) | R3 | real-key journey | pass |
| `focus.spec.ts` | header ⋯ opens the focused card's own menu (R3, REQ-5) | R3 | same items as right-click | pass |
| `focus.spec.ts` | dead session with no bound id has no Stop/Resume/Remove in the header (E5, REQ-4) | R4 | header buttons gone | pass |
| `notes.spec.ts` | note marker hover shows only the note tip (R5, REQ-6) | R5 | no inherited repo-line title | pass |
| `actions.spec.ts`, `theme.spec.ts`, `card-location.spec.ts`, `rename.spec.ts` | retargeted to the `.acts` cluster / menu | R1 | former header Stop/Resume/Remove assertions moved | pass |

## Fixtures used

- `rail-menu-cards`: live, ended-bound, ended-unbound and pinned cards for the menu lists.
- `stop-resume-pair`: live and dead pair for the header.
- `notes`: card with a note marker.

## Implementation Bugs

None.

## Handoff

None

## Notes

At authoring the tests were red against the old bundle (header still carried Stop/Resume/Remove, menu lacked Mark entries); that run was not logged then. After web-impl landed, 190 passed and one failed: `rail.spec.ts:347` asserted `.at(-1) === "Unpin"`, but REQ-2 places Mark as read/unread after Pin/Unpin. This was a test defect; the assertion now requires Unpin present, Pin absent, and Unpin before Mark as read.

## Test Run Output

```
make web-build, then (R1) cd web && npx playwright test -c playwright.render.config.ts render/focus.spec.ts render/notes.spec.ts render/rail.spec.ts render/actions.spec.ts render/theme.spec.ts render/card-location.spec.ts render/rename.spec.ts
  191 passed (4.8m)
```
