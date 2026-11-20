# Browser review: diff-viewer

**Plan**: diff-viewer
**Verdict**: approved
**Cycle**: 3
**Pack**: kb: pack 14172 words (budget 30000)
**Rig**: `make web-build build` at 91f69fe1 (`bin/musterd` v0.30.4-65-g91f69fe1); per-test scratch daemons from `web/e2e/helpers/fixtures.ts` (data dir `$TMPDIR/muster e2e-*`, which has a space; tmux socket `<data dir>/tmux.sock`, killed by the fixture teardown; the shared E2E stub `claude`); headless Chromium 1280×720, driven by a throwaway spec `web/e2e/zz-browser-review.spec.ts` (now deleted) using the committed helpers (`tickRepo`, `launchBoundDiff`, `helpers/terminals.ts`). Gates log `gates-diff-viewer-c3`: 0 failed lines, so the app I drove is the one that will ship.

## Delta

| Prior issue | Fix commit | Verified how | Result |
|---|---|---|---|
| Major 1 (cycle 2): change map unpainted and partly outside its box above ~530 changes | none: below the confidence threshold, not routed; it is in `proposed-backlog.md` | `git diff febf5415..HEAD -- web/src/style.css` touches no `.dv-map`/`.dv-mark` rule (only `.dv-resolved-detail` context from the merge), so the cycle-2 measurement still holds | not fixed, by routing decision; not re-filed |

The delta since `febf5415` is the merge of `main` (8f4ae1c9: the Terminals menu ▾ in the Focus surface segment, `surfaceSwitched` now closes the viewer) plus 9b5a1b9d (a tick made during a load is kept; every viewer button built through `diffrows.button`). The cells below cover those surfaces only.

## Matrix

Hosts: **focus** (the viewer's only host), **tiles**, pop-out. States: **data**, **daemon-down**. No-data cells: the delta touches no loading or empty path.

| Req | Host | State | Claim | Result | Evidence |
|-----|------|-------|-------|--------|----------|
| merge: menu over viewer | focus | data | ▾ menu placed on top of the open viewer, inside the viewport | pass | panel 1012–1272 × 84–182, `position: fixed`, `z-index: 50`, display block, opacity 1; viewer 300–1280 × 95–694. `elementFromPoint` at the panel centre and at all four inset corners lands inside the `Terminals` dialog, not the viewer |
| merge: menu Escape | focus | data | Escape with focus in the menu closes the menu and keeps the viewer | pass | after a pointer click on ▾ the focus is in the panel; one Escape: panel count 0, viewer still 300–1280 × 95–694, button `1 file +3 −3 · Close diff ×` `aria-pressed=true`, focus back on `Terminals`. A second Escape then closes the viewer (`View diff ›`, `aria-pressed=false`), as designed |
| merge: rename | focus | data | ✎ rename through the menu keeps the viewer | pass | `shell 1` → `renamed` by keys: panel still open, viewer unchanged, button `Close diff ×`; after Escape the viewer is still open |
| merge: New terminal | focus | data | New terminal closes the viewer and shows the new terminal | pass | after 1.5 s: viewer absent, button `View diff ›` `aria-pressed=false`, `shell` pressed with title `shell 2`, region `Shell: bv` 300–1280 × 95–694 display flex. tmux clients `[muster-1-shell-2]` |
| merge: pick a row | focus | data | picking another terminal closes the viewer | pass | viewer open over `shell 2`, pick `renamed`: viewer absent, button `View diff ›`, title `renamed`, panel closed; tmux clients `[muster-1-shell]` |
| merge: pick the shown row | focus | data | picking the terminal already shown closes the viewer | pass | viewer absent, button `View diff ›`, title `renamed` |
| merge: close a terminal | focus | data | × on the shown (idle) terminal keeps the viewer | pass | no confirm (idle); viewer still open, button `Close diff ×`, panel still open listing `shell 1` |
| merge: close, then Escape | focus | data | Escape dismisses the still-open menu, not the viewer | **FAIL** | after the ×, focus is on `BODY`. Escape closes the viewer (button `View diff ›`) and the panel stays open; a second Escape leaves the panel open (browser Minor 1) |
| merge: viewer closed after a terminal close | focus | data | the surface under the viewer is a live terminal | pass | `shell` pressed, title `shell 1`, region `Shell: bv` 980 × 599 display flex; tmux clients `[muster-1-shell]` |
| §7 one live client | focus | data | one tmux client per session across New / pick / close with the viewer open | pass | `list-clients` after each step: `[muster-1-shell]`, `[muster-1-shell-2]`, `[muster-1-shell]`, `[muster-1-shell]`; one `.xterm` with an offset parent |
| REQ-15 + 9b5a1b9d | focus | data | a key tick (`j` `x`) made while Refresh's diff read is in flight is kept | pass | diff GET held 1.5 s by `page.route`; `x` pressed 200 ms after the Refresh click: `1 / 3`, folded 1; 2.5 s later `1 / 3`, folded 1, oracle `/diff/review` 1 tick |
| REQ-15 + 9b5a1b9d | focus | data | a pointer tick made during Refresh is kept, settled and reloaded | pass | a second held Refresh plus a click on `Mark change reviewed`: 2.8 s later `2 / 3`, folded 2, oracle 2. After a reload: `2 / 3`, folded 2, oracle 2; each folded row display block, opacity 1, 670 × 21 |
| 9b5a1b9d: one builder | focus | data | rebuilt buttons keep their own class and `type="button"` | pass | `dv-fold` flex, `dv-changetick` block, `dv-plus` block, `dv-fjump` flex, `dv-mark` block, `dv-folded` block, each with no added `dv-btn`; 0 buttons in the viewer without `type="button"` |
| REQ-28 / §6 | focus | daemon-down | daemon-down shown with the viewer open; menu not operable | pass | `SIGTERM` on the scratch daemon: `#banner` 0–1280 × 46–78 display block, `musterd unreachable — …`; the viewer moves down to 127–694 and stays open; ▾ `disabled` |
| REQ-23 | tiles | data | no diff button; the tile's own ▾ exists | pass | 0 diff buttons; the tile footer has 1 `Terminals` opener |
| viewer + menu | tiles | — | — | N/A: plan § Views, Tiles has no way into the diff | |
| all | pop-out | — | — | N/A: there is no `/doc.html` host for the viewer (plan § Views) | |
| §6/§7 | focus/tiles | all | honesty and terminal rules | pass | no cost and no "Done"; daemon-down banner shown; one live client per session (row above) |

## Issues

### Critical

### Major

### Minor
1. **[web-impl]** With the viewer open, closing a terminal from the Terminals menu (× on a row) leaves the menu open with focus on `<body>`. The next Escape then goes to the viewer's document-level handler (`web/src/features/diff.ts`, `keydown`), which closes the viewer and leaves the menu showing. A second Escape does nothing. The handler's guard skips only `dialog[open]`, and the Terminals panel is a `role="dialog"` popover, not a `<dialog>`. A fix must make Escape dismiss the open Terminals menu first (and keep the viewer) wherever focus is. One way is to treat an open Terminals panel like an open dialog, another is to keep focus inside the panel after a row is removed.
   id: web/src/features/diff.ts:keydown Escape:closes the viewer under an open Terminals menu | confidence: 80

### Notes
1. **[note]** The menu still standing after a close with focus lost, and not answering Escape, is main's Terminals panel behaviour on any surface, not only with the viewer open. That part is outside this plan. Minor 1 asks only that the viewer not take an Escape the user aimed at the menu.
2. **[note]** Outside the delta: cycle 2's Major 1 (change map above ~530 changes) and the cycle 1/2 notes were not re-measured. No rule they depend on changed.
3. **[note]** Not measured: picking a terminal from a Tiles footer while that session's viewer was left open in Focus, then returning to Focus. Tiles cannot show the viewer, and the plan names no expected state for that path.
