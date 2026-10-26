# Web Implementation: remove-unread-right-click-1

**Plan**: remove-unread-right-click-1
**Mode**: initial
**Pack**: kb: pack 45433 words (budget 30000)

## Changes

| File | Action | What and Why |
|------|--------|--------------|
| `web/src/api/sessions.ts` | edited | `setSessionUnread(id, unread)` beside `pinSession`: `PUT /api/sessions/{id}/unread`, 204 (REQ-2) |
| `web/src/sessions/card.ts` | edited | `SessionAction` gains `markRead`, `markUnread` |
| `web/src/features/actions.ts` | edited | `dispatch` routes the two mark actions to `setSessionUnread` (`markUnread` sends `true`) |
| `web/src/features/railmenuitems.ts` | edited | `CARD_MENU_LABELS` gains `Mark as read` / `Mark as unread`; `cardMenuItems` and `selectionMenuItems` return `marks` (non-danger, disabled only by connected/busy); Remove is pushed for every card and for any non-empty selection (REQ-2, REQ-3) |
| `web/src/features/railmenu.ts` | edited | single menu: separator then the marks after Pin/Unpin; selection menu: separator then the marks after Move to, each applied per selected id through `dispatch` (REQ-2) |
| `web/src/render/sessions.ts` | edited | `CardMenuRequest.at` optional (REQ-5) |
| `web/src/render/menu.ts` | edited | `MenuOpenOptions.at` accepts `undefined` (exactOptionalPropertyTypes) so `open` passes a request's absent point straight through |
| `web/index.html` | edited | `#mainhead .acts` drops Stop/Resume and Remove, holds `button.btn.icon.more` `aria-label="Session actions"` `aria-haspopup="menu"` `aria-expanded="false"` (REQ-4); the rail card template's `.mk` carries `title=""` (REQ-6) |
| `web/src/features/focus.ts` | edited | drops the Stop/Resume and Remove capture and listeners; `.more` click calls `deps.railMenu.open({ id: focusedId, card: moreBtn })` (REQ-5); `FocusDeps.railMenu` added |
| `web/src/main.ts` | edited | passes `railMenu` into `initFocus` |
| `web/src/render/mainhead.ts` | edited | drops `stopResumeBtn`/`removeBtn`, `renderStopResume`, their writes and doc lines (REQ-4) |
| `web/src/style.css` | edited | drops `.mainhead .acts .stop-resume` and the swap comments |
| `web/src/render/rename.ts` | edited | comment no longer names the removed siblings |

## Decisions

- REQ-1 is the daemon's (daemon-impl); this side calls it. REQ-2..REQ-6 are in Changes. No Testable UI Elements table in the plan; the ⋯ is named `Session actions`, the marks `Mark as read` / `Mark as unread`, as the render and E2E specs locate them.
- The mark entries are a `marks: CardMenuAction[]` field (Mark as read, then Mark as unread), the shape web-tests assumed; no test re-pointing needed.
- Single-card marks sit behind a separator after Pin/Unpin (the plan says "after Pin/Unpin" and "behind a separator" only for the selection menu; a separator on both keeps one group of marks on both menus).
- The selection menu's marks loop `dispatch` per id (the plan: no batch route), so each id sends one `PUT`; the daemon's per-id no-op covers non-idle sessions.
- `design:` the header ⋯ reuses `railMenu.open` with `card` set to the button and no `at`; `createMenu` already anchors below the opener, sets `aria-haspopup`/`aria-expanded` and toggles closed on a second click when `at` is absent (the Rail actions ⋯ path). `CardMenuRequest.card` is therefore "the opener". Precedent: `rg -n "openMoveMenu\(" web/src` and `features/groups.ts`'s `#rail-actions-button` use the same menu. No second menu list exists.
- `design:` the ⋯ is not disabled while disconnected (plan edge case 5: the menu opens, items disabled), so `renderMainhead` writes nothing for it and no per-tick node write exists for the button; its node is the static `index.html` one, so focus and identity survive the tick (observed: `render/rail.spec.ts` header-⋯ focus-and-tick test green).
- deviation: the REQ-6 `title=""` is on the rail card template's `.mk` in `index.html` instead of a write in `applyRepoBlocks` (the plan's Affected Files line). A once-cloned static attribute never touches the DOM on the 1 s tick; `applyRepoBlocks` writing `marker.title = ""` every pass would. Only the rail card's `.mk` is a child of a titled `.r2`; the tile header's `.mk` has no titled ancestor. Observed: `render/notes.spec.ts` "…marker inherits no repo-line title (#106)" green. → kb:adr/rail-note-marker-blanks-inherited-title
- The ended-age slot (`.ended-at`, `--ended-w`) is kept: the plan allows reclaiming it, but the render specs' `endedAgeProblems` and the INV-6 sweeps still read it.
- No `display` rule added on a conditionally hidden element; nothing new is hidden via `[hidden]`.
- Size warnings: `web/src/sessions/card.ts` 501 lines is unchanged from `main` (501); no new warning on a touched file.
- doc-delta: `docs/design/design-system.md:278-282` Focus mainhead sentence and the `actions`/`focus` doc-delta lines stand as the plan has them. `CardMenuRequest.at` is now optional (the header ⋯ anchors to its button): `docs/features/rail` text about the menu opening "at the pointer" is true for right-click and keyboard, not for the header ⋯.

## Handoff

**Build status**: `npx tsc --noEmit` and `npm run build` exit 0; `npm run -s lint` clean; `npx vitest run` 106 files / 3041 tests passed. `make check-kb` reports 4 stale generated `contract.md` (card-location, connection, lifecycle, reader) — they follow daemon-impl's uncommitted `docs/protocol.md` edit and need `make gen-kb` once that lands; not web files.
**E2E smoke**: `npx playwright test e2e/rail-menu.spec.ts e2e/focus-header.spec.ts e2e/effort-header.spec.ts e2e/actions.spec.ts` → 63 passed, 3 failed; `e2e/rail-cards.spec.ts e2e/terminal.spec.ts e2e/resilience.spec.ts e2e/focus-marker.spec.ts e2e/groups.spec.ts e2e/notes.spec.ts` → 88 passed. Render: `render/focus.spec.ts notes rail actions theme card-location rename` → 190 passed, 1 failed.

Spec defects (spec files left untouched, for validate mode):
- `web/render/rail.spec.ts:347` ("right-clicking an ended resumable rail card offers Resume, Remove……"): `expect((await menuItemLabels(page)).at(-1)).toBe("Unpin")`. REQ-2 puts the marks after Pin/Unpin, so the last label is `Mark as unread`; the same file's :284 and :318 lists already expect `…Pin, Mark as read, Mark as unread`. Needs `.at(-3)`.
- `web/e2e/rail-menu.spec.ts:710` ("Mark as read and Mark as unread from a selected card's menu…"): `unreadPuts()` sorts by path only and the test slices `(2)`; the stable sort gives `[2 false, 2 true, 3 false, 3 true]`, so `slice(2)` is `[3 false, 3 true]` against an expected `[2 true, 3 true]` (received `{path:/api/sessions/3/unread, unread:false}` first). The calls themselves are one per id, correct.
- `web/e2e/focus-header.spec.ts:300`: `expect(page.locator("#mainhead .meta .ended-at")).toHaveCount(0)` after Resume. `.ended-at` is a static `index.html` node that `renderMainhead` hides with the `hidden` attribute (`endedAt.hidden = meta.ended === null`, unchanged by this plan), so the count is always 1; `toBeHidden()` is the assertion (the render helper `endedAgeAbsentProblems` reads it as a hidden slot).
- `web/e2e/focus-header.spec.ts:375` (1000px row): the cluster is now ~196px (switch + ⋯) instead of ~300px, so at 1000px with the 9-character title it fits row one (`twoRows:false`, surf top 59) and wraps below once the title grows to 40 characters (`twoRows:true`, surf top 93; measured with a scratch copy of the test, since deleted). The header's give-way order is unchanged; the test's preconditions (cluster already on row two at 1000px) no longer hold. The 2000px case passes.

## Fix Attempt 1 (review cycle 1, maintainability)

**Failures addressed**: (1) `stopResumeButton` kept `action`/`disabled`/`reason` that only a test read; (2) `CardMenuRequest.card` held an opener, not a card.

**Changes made**:
- `web/src/sessions/card.ts`: deleted `StopResumeButton` and `stopResumeButton`; `resumeDisabledReason` and `actionEnabled` stay (`render/dead.ts:81` and `railmenuitems.ts` entry read them). Doc comments on `resumeDisabledReason`, `canResume`, `actionEnabled` no longer name the removed mainhead button. Sweep: `rg -n 'StopResumeButton|stopResumeButton' web/src` leaves only `sessions/card.test.ts` (import line 24, describe at 1125).
- `web/src/features/railmenuitems.ts`: `cardMenuItems` picks the label inline (`session.alive ? "Stop" : "Resume"`), the only value its one caller read; enablement still goes through `entry()` -> `actionEnabled`, so the menu is unchanged (the Resume-disabled-when-unbound and connected rules are the same two calls the removed function made).
- `CardMenuRequest.card` -> `opener` in all six consumers: `render/sessions.ts` (type + the contextmenu and menu-key `onMenu` calls), `features/railmenu.ts` (`openCard`, `openSelection` destructure `opener`, pass to `menu.open`), `features/focus.ts` (`{ id, opener: moreBtn }`); `render/tiles.ts`, `features/rail.ts`, `features/tiles.ts` only forward the type or `deps.railMenu.open` and name no field (`rg -n '\bcard:' web/src/render/tiles.ts web/src/features/rail.ts web/src/features/tiles.ts` -> none). No test constructs or reads the field (`rg -n 'onMenu|CardMenuRequest' web/src --glob '*test*'` shows only `render/tiles.test.ts:441` `onMenu: () => {}`).

**Decisions**: design: the earlier line "`CardMenuRequest.card` is therefore 'the opener'" now holds by name: the field is `opener`, matching `createMenu().open(opener, …)`. No new module, type or deviation. No doc-delta change.

**Verification**: `npx tsc --noEmit` and `npm run build` fail on exactly one error, `src/sessions/card.test.ts(24,3): TS2305 no exported member 'stopResumeButton'` (sanctioned breakage); `npx vite build` alone is green; `npm run -s lint` clean; `make check-kb` pass; `make size-warn` shows no new warning (card.ts is now under 500 lines); `npx vitest run src/features src/render/sessions.test.ts src/render/tiles.test.ts` green apart from the above.

**Handoff (web-tests)**: `web/src/sessions/card.test.ts` — remove `stopResumeButton` from the import (line 24) and delete the `describe("stopResumeButton — label, action, enablement and hover reason for all eight cells")` table (about lines 1122-1200). `railmenuitems.test.ts` already covers the Stop/Resume label and enablement through `cardMenuItems`; no other test file needs a change for the rename.
