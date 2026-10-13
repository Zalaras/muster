# Plan: Title crop and Stop/Resume button

**Created**: 2026-10-13
**Status**: completed
**Work Type**: web
**E2E Scope**: new-specs
**Fixture plan**: focus-header.spec.ts daemon (every test launches the only session and relies on auto-focus)
**Features**: focus, actions
**Touches**: card-location, groups, rename, rail, theme
**Description**: Focus view header — the repo readout is sized by its text and gives way last, the surface switch sits with the actions so nothing drifts, and Stop and Resume are one button that swaps without a layout shift (#73, #83).

## Overview

Two Focus-header complaints, one header. #73 "Title squashed for no reason": the repo readout
(`economic-game… / main`) ellipsizes while the header has hundreds of pixels free. Measured on
`main` (Chromium, 2026-10-13, see Carried-over measurements): the folder line is capped at 30ch
whatever the room, and in the two-row band the surface switch stays on row one and squeezes the
folder to its 8-character floor while row two holds only the three buttons. #83: Stop and Resume
are two buttons, one of them always greyed out, and the row shifts when Stop is clicked.

This plan changes what the header does with its room, not its parts. The readout lines have no
cap; the header gives way in a fixed order as it narrows — the `↳` block hides whole, then the
surface switch and the actions move to a second row together, then the readout ellipsizes to its
floor, and only then the title shortens to its 6rem floor (the developer, 2026-10-13: the title
keeps a decent length; anything goes as long as nothing overlaps or leaves the screen). The
surface switch joins the action buttons in one right-aligned cluster, as the tile footer already
places it, so a longer title or readout never moves it. Stop and Resume become one button whose
label follows `alive`, holding the wider label's width so Remove never moves.

No daemon change, no protocol change. The tile footer is deliberately untouched (Out of scope).

## Requirements

### Must Have
- [ ] REQ-1: In the Focus header the folder line and the branch line of the repo readout are as wide as their text; neither is capped at a fixed character count. A line is ellipsized only for want of room per REQ-2, never while the row it sits on has free space.
- [ ] REQ-2: As the header narrows it gives way in this order and no other: (a) the `↳` block hides whole; (b) the surface switch and the action buttons move together onto a second row; (c) the folder and branch lines ellipsize, never below the 8-character floor; (d) the title shortens, never below its 6rem floor. A later step never happens while an earlier one still has room to give. Widening reverses the order.
- [ ] REQ-3: At every width no two header items overlap, every header item is inside the viewport, and the model never truncates.
- [ ] REQ-4: The surface switch (`claude | shell | docs`) sits immediately before the action buttons in one right-aligned cluster at the header's right edge. The cluster's position depends on the header's width only: changing the title's or the readout's text never moves it while the header stays on the same number of rows.
- [ ] REQ-5: The header has one button for Stop and Resume. It reads `Stop` while the session is alive and `Resume` while it is dead. Enabled: `Stop` iff connected; `Resume` iff connected and a Claude session id is bound. A disabled `Resume` carries the existing reason as its hover `title`. Clicking it does what today's Stop or Resume button does in that state (confirm dialog for Stop, the resume request for Resume).
- [ ] REQ-6: Swapping the label never shifts the layout: the button's box has the same width and height under both labels, and Remove's box is identical before and after a Stop or a Resume.

### Should Have
- [ ] REQ-7: Moving onto two rows (REQ-2 b) never squeezes row one: at the width where the cluster drops, the readout and title keep the widths they had just before.

### Nice to Have
- (none)

## Protocol Contract

No protocol changes.

## Schema Changes

No schema changes required.

## UI Specifications

### Views
- Focus mainhead (`#mainhead`, static markup in `web/index.html`) — the only surface this plan changes. Rail cards, tile headers and footers, the dead surface's cap are untouched.

Design authority: `docs/design/design-system.md` § "Focus mainhead" (its give-way paragraph is replaced per Doc Delta) and § "Tile", whose footer already places the surface switch as the first child of its action cluster — the header matches it (REQ-4).

### DOM structure the tests rely on
The existing class hooks stay, since `web/e2e/helpers/card-location.ts` and `mainhead.test.ts` locate by them: `#mainhead .name button.rename`, `.chip-danger`, `.ingroup .ig-name`, `.meta .loc .repo .rf`/`.rb`, `.meta .loc .claude-at`, `.meta .loc .sep`, `.meta .model`, `.meta .ended-at .ended`, `.surfseg`, `.acts` with its `button.btn` children. The `.acts` container holds the surface switch followed by the Stop/Resume button and Remove (REQ-4); how the switch gets there (markup or `features/focus.ts` inserting it, as today) is the implementer's.

### User Flows
1. **Stop from the header.** Live session focused → header shows `Stop` and `Remove` → click `Stop` → the existing confirm dialog → confirm → the `alive:false` upsert lands → the same button reads `Resume`, enabled (session id bound), at the same box; Remove's box unchanged.
2. **Resume from the header.** Dead session focused → `Resume` enabled → click → the resume request → upsert `alive:true` → the button reads `Stop`, enabled, same box.
3. **Narrowing.** Wide window, session moved to a worktree (`↳` shown) → narrow: the `↳` block hides whole; narrower: the switch and buttons drop to row two together, the readout untouched; narrower: the folder and branch lines ellipsize down to 8ch; narrower: the title ellipsizes to 6rem. Widening retraces the steps.
4. **Rename while wide.** One-row header with room → rename to a longer title → the title grows, the group control and readout move right with it, the right cluster does not move (REQ-4).

### States
- No data yet: the model slot reads `unknown` for a null model, as today (kb:adr/launch-resume-null-model-reads-unknown); the Stop/Resume button reads `Stop` or `Resume` from `alive` and needs no other data.
- Data: as above.
- Daemon down: the Stop/Resume button, Remove, the group control and the rename trigger are disabled; the label stays whichever `alive` last said.

### Testable UI Elements

| Element | Role | Name / Text Pattern | Notes |
|---------|------|---------------------|-------|
| Stop/Resume button in the header | `button` | `Stop` while alive, `Resume` while dead | One element; scope locators to `#mainhead` — the dead surface's cap has its own `Resume`. `exact: true` recommended: the batch dialogs have `Stop session`. |
| Remove button in the header | `button` | `Remove` | unchanged |
| Surface switch buttons | `button` | `claude`, `shell`, `docs` | unchanged; now inside `#mainhead .acts` |
| Folder line | — | `#mainhead .meta .loc .repo .rf` | `<folder> /` |
| Branch line | — | `#mainhead .meta .loc .repo .rb` | |
| Model | — | `#mainhead .meta .model` | never clipped |
| Rename trigger | `button` | the session title | unchanged; its `title` attribute is the full title |

### Invariants

Each holds at every viewport width from 600 px to 2000 px, in every state below, and is asserted by a sweep in 16 px steps, not at chosen widths (kb:lesson/layout-invariant-needs-its-width-range).

States to sweep from: title length {9, 52, 300} × folder length {6, 35, 60} × branch length {4, 80} × {unmoved, moved} × {alive, dead}. The spec picks a covering subset and names the combinations it skips; the Chromium baseline rows in Carried-over measurements are the minimum.

- **INV-1** (REQ-3): no two of {name, chip, group control, readout, model, ended clause, surface switch, Stop/Resume, Remove} overlap, and each is inside the viewport.
- **INV-2** (REQ-3): the model's `scrollWidth ≤ clientWidth`.
- **INV-3** (REQ-1, REQ-2): a folder or branch line is ellipsized ⇒ the header is on two rows and, if moved, the `↳` block is hidden.
- **INV-4** (REQ-2): the title is ellipsized ⇒ the folder line is at its 8ch floor (or its text is shorter than the floor).
- **INV-5** (REQ-4): the right edge of Remove is at the header's content right edge, and the distance from the surface switch's right edge to the Stop/Resume button's left edge is constant — across every title and readout length at one width.
- **INV-6** (REQ-6): the Stop/Resume button's box is identical under both labels, and Remove's box is identical before and after a Stop and after a Resume.
- **INV-7** (REQ-5): `#mainhead` holds exactly one of a `Stop` button and a `Resume` button; which one is `alive`.
- **INV-8** (REQ-2, kb:adr/focus-mainhead-wraps-to-second-row-when-narrow's surviving half): the repo block is present on `.loc`'s first line at every width; narrowing never hides it and never brings it back.

### Carried-over measurements

Measured on `main` at `8c43a5ee`, Chromium (Playwright 1.x headless), rail 300 px, folder `economic-game-theory-simulation-lab` (35 chars), branch `main`, model `claude-haiku-4-5-20251001`, grouped (`Game`), 2026-10-13. These are the pre-fix numbers the new spec's assertions must fail against (the folder line's `scrollWidth` is 251 px throughout):

| Viewport | Header | Rows | Title | Folder line shown | Free room |
|---|---|---|---|---|---|
| 2000 | 1700 px | 1 | `Game Play` | 203 px (30ch cap) | ~750 px on the row |
| 1200 | 900 px | 1 | `Game Play` | 140 px | none |
| 1100 | 800 px | 2 | `Game Play` | 203 px | row 2 holds the buttons only |
| 1000 | 700 px | 2 | `Game Play` | 147 px | row 2 holds the buttons only |
| 900 | 600 px | 2 | `Game Play` | 105 px | row 2 holds the buttons only |
| 800 | 500 px | 2 | `Game Play` | 182 px | switch on row 2 |
| 1400 | 1100 px | 1 | 52 chars, 376 of 381 px | 54 px (the 8ch floor) | none |

So on `main` the readout gives way before the title (CSS: the title grows 1000 against the meta's 1), the opposite of REQ-2; and the switch wraps only after the buttons, which REQ-2 (b) changes.

Re-checked and still valid: the 6rem title floor (kb:adr/focus-mainhead-title-keeps-a-floor) and the 8ch readout floor stay as measured; the group control's 640 px container breakpoint (kb:adr/focus-group-control-hides-below-640px-container-width) is untouched by this plan and stays a container query on the header's own width. The developer's screenshot (#73 and the 2026-10-13 one) was taken in Waterfox; the one-row case it shows (folder cut to ~15 characters with most of the row free) was not reproduced in Chromium. REQ-1 and INV-3 rule it out in any engine; the developer verifies in Waterfox before `/land` (Implementation Notes).

## Affected Files

The planner's impact read, not a fence: existing files by path, new code by feature glob; REQs and behaviour, never shape.

### Web (web-impl)
- `web/index.html` — REQ-5: the header's action row holds one Stop/Resume button instead of two.
- `web/src/style.css` — REQ-1, REQ-2, REQ-3, REQ-4, REQ-6, REQ-7: the header's give-way order, the uncapped readout lines, the right-aligned cluster, the fixed-width Stop/Resume button.
- `web/src/render/mainhead.ts` — REQ-5, REQ-6: the one button's label, enablement and hover; whatever of the measured `--loc-cap` fit survives the new layout (it may go entirely).
- `web/src/features/focus.ts` — REQ-4, REQ-5: where the surface switch is inserted; one click listener dispatching Stop or Resume by `alive`; the pane resize refit if the fit survives.
- `web/src/sessions/card.ts` — REQ-5: only if the implementer derives the button's label/enablement/reason as a pure view-model beside `resumeDisabledReason` (recommended, so web-tests can pin it without a DOM).
- `web/src/render/CLAUDE.md` / `web/src/features/CLAUDE.md` — hand-written part only, if a gotcha they state stops being true (the `--loc-cap` fit).

### Existing tests this breaks
- web-tests: `web/src/render/mainhead.test.ts:203-204` (`endBtn`/`resumeBtn` fakes) and `:284-306` ("Resume disabled reason" asserts a separate disabled Resume beside a live session's Stop).
- e2e-specs: `web/e2e/actions.spec.ts:678-679`, `:744-745`, `:765-766`, `:775` — assert both a `Stop` and a `Resume` button in the header at once.
- e2e-specs: `web/e2e/theme.spec.ts:395-397` — a live session's header has an enabled `Stop` and a disabled `Resume`.
- e2e-specs: `web/e2e/card-location.spec.ts:914` — asserts the 30ch/44ch caps (REQ-1 removes them); `:1172` loops over `Stop`, `Resume`, `Remove` in the header; `:1244` requires the title ellipsized over a quarter of the sweep with short names (REQ-2 makes the title give way last).
- e2e-specs: `web/e2e/helpers/card-location.ts` `readFitSnapshot`/`chromeProblems` — if `s.buttons` reads the header's buttons by the three labels, one is now absent; `blankProblems` (`.loc` no wider than its visible blocks) is expected to keep holding and is kept.
- e2e-specs: `web/e2e/groups-focus.spec.ts:342-451` (E27) — asserts the title and repo floors beside the group control; expected to keep holding, but its comment at `:293` assumes the title-first layout — e2e-specs confirms against the new build.
- e2e-specs: `web/e2e/rename.spec.ts:766` — a 300-character title ellipsizes and keeps the buttons in view; expected to keep holding (the title still has a floor).

## Edge Cases

1. Dead session with no bound Claude session id: the one button reads `Resume`, disabled, hover `title` = the existing reason text → E5.
2. WebSocket down while alive: the button reads `Stop`, disabled; on reconnect, enabled → E6.
3. WebSocket down while dead: reads `Resume`, disabled; on reconnect, enabled iff a session id is bound → E6 (shared with edge case 2).
4. Stop confirmed, then the `alive:false` upsert is lost (hook loss does not apply — `alive` rides the session upsert, which is whole-object and re-sent on the next snapshot): the label follows whatever the client's session object says, so a reconnect's snapshot corrects it → untested: the client has no path that changes `alive` without an upsert; INV-7 covers the derivation.
5. `/clear` mints a new Claude `session_id` in the same pane: `alive` is unchanged, the button is unchanged → untested: nothing in this plan keys on `session_id`.
6. Daemon restart mid-session: the session comes back alive (re-adopted) or ended; the label follows `alive` on the new snapshot → E6 (shared with edge case 2).
7. tmux pane dies without `SessionEnd`: liveness flips `alive:false` within ~5 s; the button becomes `Resume` → W3 (pure derivation), E1 for the swap shape.
8. Claude moves to another checkout at a width where the `↳` block does not fit on `.loc`'s first line: the block hides whole, the readout keeps its width → E3.
9. A rename to a 300-character title on a wide window: the title grows to the room left after the readout and the cluster, then ellipsizes; the cluster does not move → E4, rename.spec.ts:766 (kept).
10. The group control hides under the 640 px container breakpoint: unchanged behaviour; the sweep crosses it → E3 (shared with edge case 8).
11. A session with no repo (one folder line, the basename): the readout is one line; INV-3 applies to that line (the folder length 6 row) → E3 (shared with edge case 8).
12. Dead session with the ended clause (`· ended 3m ago`) added to the meta row: INV-1/INV-2 hold with it present (the dead rows) → E3 (shared with edge case 8).
13. Bypass chip present after the name: INV-1 holds with it (one sweep with the chip, `permissionMode: bypassPermissions` at launch) → E3 (shared with edge case 8).
14. The surface switch's `shell` or `docs` segment selected while the header wraps: the cluster drops as a whole, the selected segment unchanged (one moved row with `shell` selected) → E3 (shared with edge case 8).
15. The header hidden (no sessions): no fit, no error; the next focus renders fresh → W5 (unchanged no-session branch).
16. Tiles view then back to Focus (the header's pane goes 0 → size): the layout settles with no stale measurement → E7.

## Acceptance Criteria

IDs are unique across the whole section — `W*` web, `E*` e2e. One clause per criterion; never mix a runnable command with a judgement call in one item.

### Web
- **W1**: `make web-build` passes.
- **W2**: `make web-test` passes.
- **W3**: a unit test pins the Stop/Resume button's label, enablement and hover reason from `{alive, claudeSessionId, connected}` from every combination (table-driven), including the no-session pass leaving the button attached.
- **W4**: `make web-lint` passes.
- **W5**: `mainhead.test.ts`'s existing no-session regression pins (`:247-281`) still pass against the single button.
- **W6**: no `any` in new web code.
- **W7**: no string in `web/src/style.css` caps `.mainhead .meta .rf` or `.rb` at a `ch` width (the 30ch/44ch rules are gone).

### E2E
- **E1**: in the header, clicking `Stop` on a live session and confirming turns that same element into an enabled `Resume` whose bounding box equals the `Stop` box, with Remove's box unchanged (INV-6, INV-7).
- **E2**: clicking `Resume` on a dead session turns the same element into `Stop` once the session is alive, boxes unchanged (INV-6, INV-7).
- **E3**: a sweep from 2000 px down to 600 px and back in 16 px steps, over the covering subset of the state table, asserts INV-1, INV-2, INV-3, INV-4, INV-8 at every step; at least one row fails against the pre-fix build (the 35-character folder at a 1700 px header shows its full folder line — 251 px, not 203).
- **E4**: at one width with room, lengthening the title by rename and lengthening the readout by moving Claude leaves the surface switch and Remove at the same boxes (INV-5).
- **E5**: a dead session with no bound Claude session id shows one disabled `Resume` whose `title` is the existing reason.
- **E6**: with the WebSocket closed, the one button is disabled under either label and re-enables per its rule on reconnect; `actions.spec.ts`'s down/reconnect tests are rewritten to the single button.
- **E7**: switching to Tiles and back to Focus at 1000 px leaves the header satisfying INV-1..INV-4 (no stale measurement).
- **E8**: `make e2e` passes, the whole suite, with the broken tests listed under Affected Files rewritten to the new surface.

### Automated Checks

```checks
W1 make web-build
W2 make web-test
W4 make web-lint
W7 ! rg -lU "\.mainhead \.meta \.r[fb]\s*\{[^}]*max-width:\s*[0-9]+ch" web/src/style.css
E8 make e2e
```

W7's grep covers `web/src/style.css` only; no test file is in scope.

### Reviewer-Verified

- **W3**: the table-driven derivation test exists and covers all eight `{alive, claudeSessionId, connected}` cells.
- **W5**: the no-session pins still run against the single button.
- **W6**: no `any` in new web code.
- **E1**–**E7**: each exists in `web/e2e/focus-header.spec.ts` (or the rewritten `actions.spec.ts` for E6) and asserts the named invariant, and E3's pre-fix failure is shown in the e2e log (the folder-line width on `main`).
- review-browser: INV-1..INV-8 measured in the real dashboard at 2000, 1400, 1100, 1000, 900, 800, 700 and 600 px for the long-name, short-name and dead rows; the pre-fix row "1000 px, two rows, folder 147 of 251 px" now shows the folder whole.

## Doc Delta

**focus** — becomes true:
- `docs/features/focus/spec.md`: "a meta line of the repo readout (folder over branch, each line as wide as its text, kb:adr/focus-header-readout-sized-by-text)".
- `docs/features/focus/spec.md`: "As the row narrows the header gives way in a fixed order: the `↳` block hides whole, then the surface switch and the actions move together to a second row, then the folder and branch lines ellipsize to their 8-character floor, and only then the title shortens to its 6rem floor (kb:adr/focus-header-give-way-order-title-last). The model never truncates at any width."
- `docs/features/focus/spec.md`: "The `claude | shell | docs` surface switch sits with the action buttons in one right-aligned cluster, so a longer title or readout never moves it (kb:adr/focus-surface-switch-pinned-with-actions)."
- `docs/features/focus/spec.md`: "The action cluster holds one Stop/Resume button — `Stop` while alive, `Resume` while dead, the same box under both — and Remove (kb:adr/actions-mainhead-one-stop-resume-button)."

**focus** — stops being true:
- "capped at 30ch and 44ch, kb:adr/rail-repo-line-wraps-at-slash" in the meta-line sentence.
- "as the row narrows the `↳` block hides whole first, then the title shortens, never below its 6rem floor, and the repo block never hides, though a long folder may ellipsize above its 8-character floor (kb:adr/focus-repo-block-keeps-floor-beside-group-control)".
- "The mainhead wraps the surface switch and actions onto a second row (a third in the narrowest windows with the ended age or bypass chip) before the repo block would drop below its floor (kb:adr/focus-mainhead-wraps-to-second-row-when-narrow)".
- "the Stop, Resume and Remove action row (kb:adr/actions-placement-mainhead-and-card-rows)".
- "the title shortening beside it (… kb:adr/focus-group-control-stays-while-title-shortens)" — the control's hide rule stays; the "title shortening beside it" clause goes.

**actions** — becomes true:
- `docs/features/actions/spec.md`: "In the Focus mainhead Stop and Resume are one button, labelled by whether the session is alive, that keeps its box across the swap (kb:adr/actions-mainhead-one-stop-resume-button); tile footers keep their separate buttons."

**actions** — stops being true:
- nothing (the first paragraph's "They live in the Focus mainhead above the terminal" stays true).

**card-location**, **groups** — No doc change (touched for their tests only).

## Out of scope

- The tile footer keeps separate Stop and Resume buttons and its live/dead row shapes; that surface changes with the tiles rework. At approval, the developer's own wording is added to the existing open entry **Tiles per group** in `TODO.md` § Issues "On their own": "The tile footer's live (Stop) versus ended (age, Resume, Remove) row shapes, and the layout shift between them, are reworked here too, matching the Focus header's single Stop/Resume button." (approved by the developer 2026-10-13; an amendment to an existing entry, not a new item).
- The rail card's two-line readout and its own line widths — unchanged (kb:adr/rail-repo-line-wraps-at-slash's rail half survives in the superseding record).
- The dead surface's cap Resume button — unchanged.
- Reproducing the Waterfox one-row case: not attempted beyond Chromium. The developer checks the shipped build in Waterfox before `/land`.

## Implementation Notes

**Hints (non-binding):**
- The `--loc-cap` fit (`render/mainhead.ts` `fitMainheadMeta`, the `ResizeObserver` in `features/focus.ts`, `.mainhead .meta`'s grid column `minmax(min(floor+sep, --loc-cap), max-content)`) exists only to trim `.loc` when the `↳` block gave way or a folder sat under the floor; with the readout sized by text and giving way after the cluster, it may have nothing left to do. If it goes, `blankProblems` in `web/e2e/helpers/card-location.ts` still has to hold (`.loc` no wider than what it shows).
- The give-way order is a flex question: today the title grows 1000 against the meta's 1 and the meta's basis is `min-content`; REQ-2 (c) before (d) inverts who shrinks first, and REQ-2 (b) wants the switch and the buttons to wrap as one item (one flex child holding both, as `.tfoot .acts` already does for the tile footer).
- `canResume` and `resumeDisabledReason` in `sessions/card.ts` are the rule; a pure `{label, enabled, reason}` derivation beside them is the cheapest W3.
- `render/tiles.ts`'s `buildActionButton` and `kb:anchor/sessions.end` naming: the header's one button still dispatches `end` and `resume` through `features/actions.ts`'s dispatcher; only the trigger merges.

**Doc upkeep (orchestrator, at Completion):**
- `docs/design/design-system.md` § "Focus mainhead": replace the give-way sentence ("as the row narrows the `↳` block hides whole first (never half-drawn), then the title shortens, and the mainhead wraps its surface switch and actions to a second row as soon as the repo block would drop below its floor, so the repo block never hides") with the REQ-2 order, drop "with the folder line capped at 30ch and the branch line at 44ch", and say the switch sits in the right cluster before the Stop/Resume button and Remove.
- `TODO.md`: tick #73 and #83's entries (§ "Together — Focus view header") and move the block to `docs/history/todo-done.md`; `/land` carries `closes #73` and `closes #83`.
- ADRs flip from `proposed` to `accepted` at Completion: kb:adr/focus-header-readout-sized-by-text (supersedes kb:adr/rail-repo-line-wraps-at-slash, restating its rail and tile halves), kb:adr/focus-header-give-way-order-title-last (supersedes kb:adr/focus-mainhead-wraps-to-second-row-when-narrow and kb:adr/focus-repo-block-keeps-floor-beside-group-control), kb:adr/focus-surface-switch-pinned-with-actions, kb:adr/actions-mainhead-one-stop-resume-button.

**Decisions this plan makes** (written as `proposed` ADRs at approval):
- kb:adr/focus-header-readout-sized-by-text — the developer, 2026-10-13: uncapped, "it would be a responsive design", as long as nothing is pushed over another element or off screen.
- kb:adr/focus-header-give-way-order-title-last — the developer, 2026-10-13: "I still need to keep the title at a decent length so no you can't change the title"; the readout gives way before it.
- kb:adr/focus-surface-switch-pinned-with-actions — the developer's question "should we place that somewhere else or pin it somewhere?"; pinned with the actions, matching the tile footer. The model stays in the readout and moves with it.
- kb:adr/actions-mainhead-one-stop-resume-button — #83, with the fixed box.

**Facts handled:** none new; `alive` is a daemon-derived field, not a Claude Code shape.
