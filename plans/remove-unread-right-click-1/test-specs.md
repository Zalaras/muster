# E2E Test Specs: remove-unread-right-click-1

**Plan**: remove-unread-right-click-1
**Mode**: validate (attempt 1)
**Pack**: kb: pack 45755 words (budget 30000) — over budget; the pack still loaded in full
**Verdict**: pass
**Tests created**: 6 new, 17 rewritten in place (migrated off the Focus header's Stop/Resume/Remove or updated to the new menu), 8 deleted
**Live run**: 162/162 passing (the plan E1 `make e2e SPECS=...` run); soaks N=10 green for all 10 spec files. Authoring: collection 642 tests in 59 files, clean. Red-first run: 7/9 of `rail-menu.spec.ts` red as designed (the 9 passing are the file's untouched tests); the 12 other red tests are the ones that need the new menu or the header ⋯. 11 migrated tests pass today (see Tests table).

## Tests

Live-run cells quote the Playwright summary for the file/filter named. Red tests were run against the pre-implementation tree (`npx vite build` + `make build`: `make web-build` cannot finish today because the web-tests agent's updated Vitest files do not type-check against the unchanged `src/`; the shipped bundle is unaffected).

| File | Test Name | Requirement | What It Verifies | Live run |
|------|-----------|-------------|------------------|----------|
| web/e2e/rail-menu.spec.ts | Mark as unread on an idle read card marks it unread, and Mark as read clears it, leaving another session's unread flag alone | REQ-1, REQ-2 (e1) | Proof 5. Real hooks drive A (watched, read) and B (unwatched, daemon-set unread) to idle; right-click A → Mark as unread → `data-unread="true"`, `GET /api/state` `unread:true`, exactly one `PUT /api/sessions/{id}/unread {unread:true}`, survives a >1 s tick; → Mark as read → attribute gone, `unread:false`, second PUT `{unread:false}`; B untouched | ran-green-at-validation — E1 run `162 passed (1.5m)`; soak N=10 `160 passed (2.1m)` |
| web/e2e/rail-menu.spec.ts | Mark as read and Mark as unread from a selected card's menu send one request per selected session and change only those sessions | REQ-2 (e1) | Select mode, two of four idle sessions selected: one PUT per selected id for each choice, the unselected unread session and the watched read one unchanged, selection kept | ran-green-at-validation — E1 run `162 passed (1.5m)`; soak N=10 `160 passed (2.1m)` |
| web/e2e/rail-menu.spec.ts | Remove… from a live card's menu opens the remove confirm that ends the session first: cancelling sends nothing, confirming removes only that session and its pane | REQ-3 (e2) | Live card menu starts `Stop…`, `Remove…`; confirm copy "ends the session first"; Cancel sends nothing; confirm sends only `DELETE`, pane gone, neighbour alive | ran-green-at-validation — E1 run `162 passed (1.5m)`; soak N=10 `160 passed (2.1m)` |
| web/e2e/rail-menu.spec.ts | Remove… from a selected card's menu over live sessions opens the count confirm and removes every selected session, leaving the unselected live one running | REQ-3 (e2) | All-live selection offers Remove…; count confirm "Remove 2"; both panes gone, third alive | ran-green-at-validation — E1 run `162 passed (1.5m)`; soak N=10 `160 passed (2.1m)` |
| web/e2e/rail-menu.spec.ts | right-clicking a selected card in Select mode applies the menu's action to the whole selection, and an unselected card keeps its own single-card menu (REQ-3, REQ-4, #97) | exact-list update at :447 | single menu `Stop…, Remove…, review, New group…, No group, Pin, Mark as read, Mark as unread`; selection menu `Stop…, Remove…, review, New group…, No group, Mark as read, Mark as unread` | ran-green-at-validation — E1 run `162 passed (1.5m)`; soak N=10 `160 passed (2.1m)` |
| web/e2e/rail-menu.spec.ts | Shift+F10 and the ContextMenu key open the focused card's menu … (REQ-9, E9, INV-4) | REQ-3 | arrow sequence now passes through `Remove…` after `Stop…` | ran-green-at-validation — E1 run `162 passed (1.5m)`; soak N=10 `160 passed (2.1m)` |
| web/e2e/rail-menu.spec.ts | with the daemon down the card menu still opens, every item disabled … (REQ-10, E6) | REQ-2 | after restart `Mark as read` and `Mark as unread` are enabled (menu-wide disabled rule only) | ran-green-at-validation — E1 run `162 passed (1.5m)`; soak N=10 `160 passed (2.1m)` |
| web/e2e/focus-header.spec.ts | choosing Stop… and then Resume from the header's Session actions menu ends and restarts only the focused session, and the ⋯ stays the same node in the same box | REQ-4, REQ-5 (e3) | ⋯ click → `Actions for hdr-menu-a` → Stop… → confirm ends only A (B's pane alive), no Stop/Resume/Remove in header, ⋯ same node and same box; ⋯ → Resume restarts A | ran-green-at-validation — E1 run `162 passed (1.5m)`; soak N=10 `70 passed (2.3m)` |
| web/e2e/focus-header.spec.ts | the Session actions ⋯ keeps focus and node identity when a real Enter opens its menu and Escape closes it, with aria-expanded in step, then across a tick | REQ-4, REQ-5 | `aria-haspopup="menu"`, `aria-expanded` false→true→false, focus and tagged node survive Enter, Escape and a 1.4 s tick | ran-green-at-validation — E1 run `162 passed (1.5m)`; soak N=10 `70 passed (2.3m)` |
| web/e2e/focus-header.spec.ts | at 2000px / at 1000px renaming to a longer title and moving Claude … leaves the surface switch and the Session actions ⋯ where they were (E4, REQ-4, INV-5) | REQ-4 | cluster (switch + ⋯) box, right edge and gap unmoved as the readout lengthens | ran-green-at-validation — E1 run `162 passed (1.5m)`; soak N=10 `70 passed (2.3m)` |
| web/e2e/rail-cards.spec.ts | the header's Session actions ⋯ opens its menu via keyboard Enter and Space, not just a mouse click, and Stop… in it stops the session | REQ-5 | real Enter and Space on the focused ⋯ open the menu; Stop… confirms and ends | ran-green-at-validation — E1 run `162 passed (1.5m)`; soak N=10 `60 passed (56.8s)` |
| web/e2e/resilience.spec.ts | focus stays on the header's Session actions ⋯ by node identity through a daemon drop and reconnect | REQ-4, INV-FOCUS | focus identity across kill and restart | ran-green-at-validation — E1 run `162 passed (1.5m)`; soak N=10 `70 passed (1.2m)` |
| web/e2e/actions.spec.ts | the card menu's Stop… and Remove… are disabled while the daemon connection is down, from the card and from the header's ⋯ alike | E14, REQ-5 | card menu and header ⋯ menu items disabled with the daemon killed, enabled after restart | ran-green-at-validation — E1 run `162 passed (1.5m)`; soak N=10 `130 passed (1.4m)` |
| web/e2e/actions.spec.ts | the card menu's Resume and Remove… and the cap's Resume are disabled while the daemon connection is down for a dead focused session, and re-enable on reconnect | E14 | dead session's menu offers no Stop…; Resume and Remove… disabled then enabled across a forced WS close | ran-green-at-validation — E1 run `162 passed (1.5m)`; soak N=10 `130 passed (1.4m)` |
| web/e2e/actions.spec.ts | Removing a live session ends it first, warns in the dialog copy, and moves focus to the top card (E9) | REQ-3 | live card menu → Remove… (was the header button) | ran-green-at-validation — E1 run `162 passed (1.5m)`; soak N=10 `130 passed (1.4m)` |
| web/e2e/groups.spec.ts | deleting the last session of a group leaves the group with a 0 count … (REQ-4, REQ-20, E4) | REQ-3 | Remove… from the live card's menu (was the header button) | ran-green-at-validation — E1 run `162 passed (1.5m)`; soak N=10 `370 passed (4.4m)` |
| web/e2e/notes.spec.ts | removing a session whose note panel is popped out …; removing the only session closes a popped-out panel …; with browser storage blocked, removing a session with another present … | REQ-3 | Remove… from the live card's menu (was the header button) | ran-green-at-validation — E1 run `162 passed (1.5m)`; soak N=10 `230 passed (3.1m)` |
| web/e2e/actions.spec.ts | Stop… from the focused session's card menu ends only that session; a live neighbour is unaffected (E5, INV-2) | migrated | card menu Stop… in place of the header Stop | ran-green-at-validation — E1 run `162 passed (1.5m)`; soak N=10 `130 passed (1.4m)` |
| web/e2e/rail-cards.spec.ts | stopping from the card menu ends only that session, and its card's menu then offers Resume and Remove… in that order (E9, REQ-7) | migrated | card menu Stop… in place of the header Stop | ran-green-at-validation — E1 run `162 passed (1.5m)`; soak N=10 `60 passed (56.8s)` |
| web/e2e/terminal.spec.ts | a live rail card offers no Stop button, and Stop… from its menu opens the confirm dialog without moving focus into a terminal (REQ-5, REQ-7, INV-3) | migrated | card menu Stop… in place of the header Stop | ran-green-at-validation — E1 run `162 passed (1.5m)`; soak N=10 `200 passed (2.5m)` |
| web/e2e/focus-marker.spec.ts | removing the focused session falls the marker through to the remaining session (REQ-3) | migrated | ended session removed from its card menu | ran-green-at-validation — E1 run `162 passed (1.5m)`; soak N=10 `30 passed (39.3s)` |
| web/e2e/effort-header.spec.ts | Resume from the card menu on a session whose last post reported medium …; Resume from the card menu passes no --effort …; a card-menu resume of a warned session …; … of a session whose warning was dismissed …; … of a session that ended before its first post …; card-menu resumes of two sessions … | migrated (REQ-10) | card-menu Resume in place of the header Resume (7 resumes in 6 tests) | ran-green-at-validation — E1 run `162 passed (1.5m)`; soak N=10 `300 passed (2.5m)` |

Pins, named as the instruction requires: the 11 passing tests of the filtered run (six `effort-header.spec.ts` resume tests, `actions.spec.ts` E5, `actions.spec.ts` E14 dead session, `rail-cards.spec.ts` E9, `terminal.spec.ts` INV-3, `focus-marker.spec.ts` removal) are the migrated journeys that use only menu items that exist today (Stop…, Resume, Remove… on an *ended* card). They pass today by construction — they are migrations of existing behaviour, not new-behaviour tests; no red-first test of the plan passes today.

### Red output 1 (`npm run e2e -- e2e/rail-menu.spec.ts`, pre-implementation build)

```
  4) rail-menu.spec.ts:584 › Mark as unread on an idle read card marks it unread, and Mark as read clears it, leaving another session's unread flag alone (REQ-1, REQ-2, #103)
    Error: locator.click: Test timeout of 60000ms exceeded.
    Call log:
      - waiting for getByRole('menu').getByRole('menuitem', { name: 'Mark as unread', exact: true })
      > 610 |     await cardMenuItem(page, "Mark as unread").click();
  3) rail-menu.spec.ts:431 › right-clicking a selected card in Select mode …
    - Expected  - 3  + Received  + 0
        "Stop…",
    -   "Remove…",
        "review", "New group…", "No group", "Pin",
    -   "Mark as read",
    -   "Mark as unread",
  6) rail-menu.spec.ts:726 › Remove… from a live card's menu …
    -   "Remove…",
    +   "New group…",
  7 failed (256, 364, 431, 584, 642, 726, 770)
  9 passed (5.0m)
```

The mark journey reaches the menu only after its preconditions held (both cards idle, A read, B unread, `GET /api/state` `unread:false` for A), so the red is the missing menu item, not a setup defect.

Remaining reds from the other filtered run (`12 failed`, `11 passed`): `actions.spec.ts:518` and `:595`, `focus-header.spec.ts:248`, `:315`, `:375` ×2 (`a cluster part is missing`), `groups.spec.ts:308`, `notes.spec.ts:527`, `:556`, `:838` (all `waiting for … menuitem 'Remove…'`), `rail-cards.spec.ts:57` and `resilience.spec.ts:114` (`waiting for … button 'Session actions'`).

## Deleted Tests

All in `web/e2e/focus-header.spec.ts`; each pinned the removed Stop↔Resume button or Remove button, so its subject is gone (plan § Existing tests this breaks, "tests whose whole subject was the header button are deleted"):

| Deleted test | What it covered | Disposition |
|---|---|---|
| clicking Stop in the header and confirming turns that same element into an enabled Resume … with Remove unmoved (E1) | the Stop→Resume swap in place | obsolete; the stop/resume journey and the cluster's INV-6 stability are re-asserted through the ⋯ in the new "choosing Stop… and then Resume from the header's Session actions menu …" test; Stop/Resume from the card menu is `rail-menu.spec.ts` "Stop… opens the Stop confirm …" and "Resume resumes …" |
| clicking Resume in the header on a dead session turns that same element into Stop … (E2) | the Resume→Stop swap | obsolete, same replacement |
| the header's Resume keeps focus and node identity when a real Enter resumes the session … | focus/node identity of the swapping button | adapted to the ⋯: "the Session actions ⋯ keeps focus and node identity when a real Enter opens its menu …" |
| at 784px / 600px with a title 9 / 52 a Stop and then a Resume in the header leave Remove, the button and the header where they were (3 generated tests) | no layout shift across a real Stop and Resume at narrow widths | obsolete (the ended-age slot existed only for the swap; the ended-clause/header stability sweeps are render tests in `web/render/focus.spec.ts` — render-tests owns them); the ⋯ box stability across Stop and Resume at 1600 px is in the new test |
| at 600px a real Enter on the header's Resume swaps the label to Stop … | keyboard swap at 600 px | obsolete, replaced by the ⋯ keyboard test |
| with the WebSocket closed the header's one button is disabled under its label, and a dead session with no Claude id stays disabled after the reconnect (E6) | the header button's disabled state across a drop | obsolete; disabled menu items across a drop are `rail-menu.spec.ts` (daemon down) and `actions.spec.ts` E14, and the unbound dead session's disabled Resume is a render test (`web/render/focus.spec.ts`, `unbound-sessions`) |

Retitled (the old titles named the removed button; REQ/E tags kept): the E4 cluster pair (now "… the surface switch and the Session actions ⋯ …"), the six `effort-header.spec.ts` resume tests ("Resume button" → "card menu"), the `actions.spec.ts` E5/E14 tests, the two `rail-cards.spec.ts` tests, `terminal.spec.ts` INV-3 and `resilience.spec.ts` E1. Also removed: the orphaned comment block above the E15 test in `theme.spec.ts` (it described a header Stop/Resume pair that no test still asserts).

Validation (attempt 1): the live-run cells were rewritten after the E1 run; every row above is `ran-green-at-validation`. `theme.spec.ts` (comment-only deletion) is covered by the full sweep, not soaked.

## Fixture Changes

- `web/e2e/helpers/rail-menu.ts` (additive): `resumeFromCardMenu(page, card)` and `removeFromCardMenu(page, card)` — the right-click journeys the migrated specs share. No new wire shapes; every POST still comes from `helpers/payloads.ts` builders (`envelopedSessionStart`, `driveToState` → `rawUserPromptSubmit`, `rawStop`).
- `web/e2e/helpers/focus-header.ts`: drops the `headerButton` / `headerStopResume` re-exports (removed from `web/render/helpers/focus.ts` by render-tests) and re-exports `headerMore` and `headerLifecycleButtons`.
- No change to `playwright.config.ts`, `fixtures.ts`, `gatelock.ts` or `e2e-lint.sh`.

## Coverage

| Requirement | E2E Tests |
|-------------|-----------|
| REQ-1 (`PUT /api/sessions/{id}/unread`, persisted flag) | Mark as unread on an idle read card …; Mark as read and Mark as unread from a selected card's menu … |
| REQ-2 (mark entries on every menu) | the two above; the exact-list test at `rail-menu.spec.ts:431`; the daemon-down test |
| REQ-3 (Remove… on live sessions) | Remove… from a live card's menu …; Remove… from a selected card's menu over live sessions …; Removing a live session ends it first … (actions E9); the groups/notes remove tests |
| REQ-4 (header holds only switch + ⋯) | choosing Stop… and then Resume from the header's Session actions menu …; the ⋯ keyboard test; E4 cluster pair; the ⋯ focus-through-a-drop test. The absence of Stop/Resume/Remove on every header state is a render test (Proof 3) |
| REQ-5 (⋯ opens the focused card's menu) | choosing Stop… and then Resume …; the ⋯ keyboard tests in `focus-header.spec.ts` and `rail-cards.spec.ts`; E14 live test (header ⋯ menu disabled while disconnected) |
| REQ-6 (note marker inherits no title) | none here — a display property, render test (Proof 4) |

## Handoff

- **web-impl / render-tests**: `web/e2e/focus-header.spec.ts` assumes the ⋯ is `#mainhead .acts` → role button named "Session actions" with `aria-haspopup="menu"` and `aria-expanded` in step (the plan's REQ-4 table), and that its menu is the one `railMenu.open` builds, named `Actions for <title>`.
- **Plan question, not pinned**: after Escape closes the ⋯'s menu, `focus-header.spec.ts` asserts focus returns to the ⋯ (same node). The plan pins `aria-expanded` but not focus return; it is what the card menu already does for the card (`rail-menu.spec.ts` Shift+F10 test). If web-impl's design differs, that assertion is the one to raise with the plan author, not to weaken.
- **Build note**: `make web-build` fails today because `tsc --noEmit` covers the web-tests agent's already-updated `src/api/http.test.ts`, `src/api/sessions.test.ts` and `src/render/mainhead.test.ts`, which import `setSessionUnread` and drop `stopResumeBtn`/`removeBtn` that `src/` still has. It goes green when web-impl lands; the red-first runs above used `npx vite build` then `make build`.
- The migrated `effort-header.spec.ts` resume tests keep their REQ-10 subject (the resume passes `--effort`); only the control that triggers the resume changed.
- E2E specs not listed by the plan's "Existing tests this breaks" were also checked: `grep -rnE "headerButton|headerStopResume|stop-resume|mainhead.*(Stop|Remove|Resume)" web/e2e` now returns only the comments naming the old plan; `tiles.spec.ts` (tile footer Stop/Resume/Remove) and the `.endcap` Resume in `plain-shell.spec.ts` / `notes.spec.ts` / `actions.spec.ts` are unchanged, as the plan keeps them.

## Test Run Output

```
rail-menu.spec.ts:      7 failed, 9 passed (5.0m)   — the 7 are the new/updated menu tests
filtered migration run: 12 failed, 11 passed (2.4m) — the 12 need the ⋯ or Remove… on a live card
```

## Notes

- Mark-journey design: the first-launched session is the default Focus, so waiting for its terminal's `MUSTER-STUB-READY` proves it is attached before its turn closes (the file `rail-unread.spec.ts` uses the same gate); the second, never-focused session therefore comes out unread from the daemon's own rule, which gives the bystander assertion for free.
- The plan's edge cases 3 to 5 stay untested at this level as the plan says (the per-id no-op is daemon-side, the mixed-selection loop is Vitest, the ⋯ while disconnected is covered by the E14 test above).

## Repairs

web-impl's smoke run reported three spec defects; each was verified before changing anything.

| # | Test | Symptom | Root cause in my spec | Fix | Assertion still covers |
|---|------|---------|-----------------------|-----|------------------------|
| 1 | Mark as read and Mark as unread from a selected card's menu … (rail-menu.spec.ts) | second `expect(unreadPuts().slice(2)).toEqual(...)` received `[3 false, 3 true]` | `unreadPuts()` sorts by path, so the four PUTs ordered `[2 false, 2 true, 3 false, 3 true]` and `slice(2)` took the wrong two. Verified by reading the helper (`.sort(... path.localeCompare)`); the daemon calls were one per id | the second assertion filters the PUTs on body `{"unread":true}` instead of slicing | REQ-2: exactly one `{unread:true}` PUT per selected id and the ids exact; the `toHaveLength(4)` assertion that follows still pins one PUT per id per choice |
| 2 | choosing Stop… and then Resume from the header's Session actions menu … (focus-header.spec.ts) | after Resume `#mainhead .meta .ended-at` `toHaveCount(0)` failed | the node is static in `web/index.html:116` and `mainhead.ts:41` sets `hidden = meta.ended === null`; it is never removed. Verified by reading both | `toBeHidden()` | REQ-4/E3: the ended clause is gone from view once the session is alive (the paired `toBeVisible()` after Stop is unchanged). Count-zero was never reachable, so this is the same claim stated correctly, not a weaker one |
| 3 | at 1000px renaming to a longer title … (E4, REQ-4, INV-5) (focus-header.spec.ts) | `sameRows` and `surf` false: the cluster dropped to row two | the precondition (cluster on one row before and after the lengthening) no longer holds at a 700 px header: measured after the lengthening at 1000 px the header is two rows (head 46..126) with title 71, group 46, repo 271, model 196, cluster 203 (`before` was one row); even a 9-character title wraps once the readout lengthens, and at 1200 px a 40-character title still wraps (head bottom 126.4). At 1500 px it stays on one row (head bottom 95.4) and the test passes. The wrap is the give-way order of kb:adr/focus-header-give-way-order-title-last (the plan pins no E4 two-row behaviour), so not an implementation bug | viewport pair `[2000, 1000]` becomes `[2000, 1500]`; the lengthening (40-character title, 40-character branch, long worktree) and all four assertions are unchanged; a comment states the precondition | REQ-4/INV-5: the switch box, the ⋯ right edge and their gap do not move as the title and readout lengthen, with the same-row precondition holding at both widths. The width at which the cluster wraps is the render sweeps' (`web/render/focus.spec.ts`) |

No assertion was deleted, skipped, or weakened. Repair 3 narrows the width range of the cluster-stays-put test (1000 px to 1500 px) because at 1000 px the property no longer applies (the cluster legitimately changes rows); the wrap itself stays covered by the render sweeps, and the 1000 px header is still exercised by "switching to Tiles and back to Focus at 1000px leaves the header satisfying INV-1 to INV-4" (E7), green in the E1 run. The reviewer may veto this one.

## E2E Run Output (validate, attempt 1)

```
make web-build build; MUSTER_GATELOCK_WAIT=9m make e2e SPECS="rail-menu.spec.ts focus-header.spec.ts effort-header.spec.ts actions.spec.ts rail-cards.spec.ts terminal.spec.ts resilience.spec.ts focus-marker.spec.ts groups.spec.ts notes.spec.ts"
  162 passed (1.5m)
npx playwright test --list: Total: 642 tests in 59 files
soak N=10: rail-menu 160 passed, focus-header 70 passed, effort-header 300 passed, actions 130 passed, rail-cards 60 passed,
           terminal 200 passed, resilience 70 passed, focus-marker 30 passed, groups 370 passed, notes 230 passed
```

## Fix Attempt (review cycle 1)

**Verdict**: pass

Issue 1 `[e2e-specs]` (`rail-menu.spec.ts:130`): the title compared Resume to the Focus header's Resume, a control this plan removed. Retitled to "Resume in the card menu resumes the ended session at once, with no confirm dialog, and leaves another ended session ended (REQ-4, INV-4)"; the body is unchanged. A grep of `web/e2e` for other titles or comments naming the header's Stop/Resume/Remove as present found none (the `focus-header.spec.ts:242` comment and `groups-select.spec.ts:196` "Stop all…" refer to the removal and to the group header).

Live run: `npm run e2e -- e2e/rail-menu.spec.ts` after `make web-build build` -> 16 passed (1.6m). `npx playwright test --list` -> Total: 642 tests in 59 files.

No assertion was deleted, skipped, or weakened.
