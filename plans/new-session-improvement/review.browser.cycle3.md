# Browser review: New Session Improvement

**Plan**: new-session-improvement
**Verdict**: approved
**Cycle**: 3
**Pack**: kb: pack 26792 words (budget 8000) — WARN exceeds; sections rules 1340 · features 10176 · diagrams 0 · decisions 11693 · proposed 0 · facts 2462 · lessons 1113 · runbooks 2
**Rig**: `make web-build build` at 2e67e89 (clean tree), producing `bin/musterd` v0.17.0-55-g2e67e89. Each probe test got its own scratch daemon from `helpers/fixtures.ts`: data dir `$TMPDIR/muster e2e-XXXXXX` (the path contains a space), tmux on `-S <datadir>/tmux.sock`, and the stub `claude` at `$TMPDIR/muster e2e-stub-635d9c3a50837164/claude`. Browser was headless Chromium at 1280×720. The one throwaway spec (`web/e2e/zz-rbc3-probe.spec.ts`) is deleted. No musterd or tmux server is left running, and `git status --porcelain` shows nothing of mine.

I read the cycle-3 gates log and did not re-run it. `web-build` is green, and `e2e` is green (443 passed). The one red line is `10-kb-check`: 7 problems, including `web/src/render/launchrestore.ts: owned by no feature`. That is a docs matter, not a runtime one, so the app I drove is the one that will ship.

**Scope.** The orchestrator scoped this pass. Since cycle 2, `git diff 5d474a0..HEAD -- web/src` touches three files. `features/focus.ts` has a comment rewrite only. `render/launchrestore.ts` loses the `NavigateOutcome` type export and has comments rewritten. `features/launch.ts` narrows its import, declares the same `"ok" | "failed" | "superseded"` union locally beside `navigate()`, and has comments rewritten. None of this emits runtime code. I re-measured the cells that exercise those files:

- the open/restore race (E9, E10, E12);
- a launch in Focus and a launch in Tiles;
- the number chords going through `bringForward`, in both views.

Everything else carries forward from cycle 2's matrix (`review.browser.cycle2.md`).

## Matrix

| Req | Host | State | Claim | Result | Evidence |
|-----|------|-------|-------|--------|----------|
| REQ-6a / E9 / Edge 14 | dialog from Focus (button) | data (recent: haiku / acceptEdits); first `GET /api/browse` held; `opus` label clicked by pointer | opus is kept and the untouched mode is restored | pass | mid-race `opus`/`auto`; settled after 1.2 s `opus`/`acceptEdits`; crumb = the recent's dir; dialog 280,97–1000,623 inside the 1280×720 viewport |
| REQ-6a | dialog from Focus (⌥⌘N) | same seed; browse held; mode changed by keyboard (focus on auto, ArrowLeft) | the mode is kept and the untouched model is restored | pass | mid-race `sonnet`/`plan`; settled `haiku`/`plan`; `activeElement` stays the radio INPUT |
| REQ-6b / E10 / Edge 15 | dialog from Focus | two recents (older haiku/plan, newer opus/acceptEdits); the first browse (newer) is held; older Recent clicked | the older Recent is listed and pressed with its values applied, and the page never falls back to browse-root | pass | after 1.5 s: crumb and footer = older's path; older `aria-pressed=true`, newer `false`; `haiku`/`plan`; `#launch-error` computed `display: none`, empty |
| REQ-6c / E12 / Edge 16 | dialog from Focus | first recent's dir deleted before opening | falls back to browse-root, error cleared, reset values | pass | crumb `browse-root`, footer = `daemon.browseRoot`; `sonnet`/`auto`; Recent `aria-pressed=false`; `#launch-error` `display: none`, empty |
| REQ-7 / E5 / E6 / INV-4 | Focus | 3 seeds, fc3 focused by pointer (keyboard in fc3's terminal); launch via ⌥⌘N → crumb → child → title typed → Enter | the new session is current, its title is in the mainhead, keyboard focus is in its terminal, and input reaches it only | pass | current `[fnew]` (1 card); mainhead `fnew`; `activeElement` in `Terminal: fnew` at close, at READY and after 1.2 s; `tmux capture-pane` shows `stub-echo:rbc3-typed` in fnew's pane and not in fc3's |
| REQ-7 | Focus | same | terminal placed in its host; geometry real; one client | pass | region 300,90–1280,694 = `#main-terminal-slot` 300,90–1280,694, inside `#view-focus` 0,46–1280,720; sizenote `130×25` = tmux `130x25`; 1 region, 1 live `/ws/terminal`, 1 attached tmux client |
| REQ-8 / E7 / Edge 13 | Tiles | full grid (tc1–tc4); launch via ⌥⌘N, Enter in Title | the new session is promoted and holds keyboard focus; input arrives; geometry is settled; one client per tile | pass | live `[tc1, tc2, tc3, tnew]`, tc4 demoted to the strip; focus in `Terminal: tnew` at close and after 1.2 s; echo in tnew's tmux pane; `expectAllTileGeometrySettled` over all 4 = match; tnew tile 641,328–1279,570 inside grid 0,84–1280,571; 4 tiles, 4 regions, 4 attached clients |
| chords via `bringForward` | Focus | right after the dialog launch (focus in fnew's terminal) | ⌥⌘1 / ⌥⌘2 select only | pass | ⌥⌘1 → current `[fc1]`, mainhead `fc1`, `activeElement` BODY, 1 region / 1 socket / 1 attached client; ⌥⌘2 → `[fc2]`, BODY, 1 region / 1 socket |
| chords via `bringForward` | Focus | fc3 driven to needs-input by hook POSTs | ⌥⌘0 selects the neediest, select only | pass | current `[fc3 needs input]`, BODY, 1 region / 1 socket / 1 attached client |
| chords via `bringForward` | Tiles | after the launch: grid `[tc1, tc2, tc3, tnew]`, tc4 in the strip | ⌥⌘5 on a session already live changes nothing | pass | live and positions unchanged; strip `[tc4]`; focus stays in `Terminal: tnew` (before = after) |
| chords via `bringForward` | Tiles | same | ⌥⌘4 promotes tc4 from the strip; geometry settled | pass | live `[tc1, tc2, tc3, tc4]`, tnew demoted to the strip; tc4 tile 641,328–1279,570 inside grid 0,84–1280,571; `expectAllTileGeometrySettled` = match; 4 tiles, 4 regions, 4 attached clients; `activeElement` BODY (the focused tile was the one demoted) |
| REQ-7 / REQ-8 / chords | pop-out | any | — | N/A — `/doc.html` hosts only the reader | |
| E9 / E10 / E12 | dialog | daemon down | — | N/A for this pass — the race needs a browse to land. The dialog's daemon-down cells did not change and carry forward from cycle 2 (Note 1) | |
| §7.1 | Focus / Tiles | data | one live client per session | pass | Focus: 1/1/1 in every Focus cell. Tiles: 4 attached clients for 4 live tiles; the demoted session is shown only as a static strip card |

## Issues

### Critical

None.

### Major

None.

### Minor

None.

### Notes

1. **[note]** Scoped pass, as the orchestrator directed. Every cycle-2 cell outside the rows above carries forward unchanged and was not re-measured this cycle. That covers REQ-3 refusals, REQ-4 argv, REQ-5 defaults, the daemon-down banner, the `[hidden]` computed checks and `scrollback: 0`. The web/src diff since cycle 2 is a type relocation plus comment text, which emits no runtime code, so nothing re-measured here could have moved and nothing did.
2. **[note]** Cycle-2 Notes 1–3 still stand as they were: the 184-character model name overflows sideways; the failure of the superseding navigation in REQ-6b is not measured; and switching Focus after a Tiles launch shows the old `focusedId`. This pass did not re-measure them.
3. **[note]** In Tiles, promoting tc4 with ⌥⌘4 demoted the launched `tnew`, the lowest-priority live tile in manual order. `tnew`'s terminal held keyboard focus, so focus fell to BODY. That fits chords being select-only (kb:adr/launch-opens-launched-session). I note it and ask for no change.
4. **[note]** Setup, not a claim. Seed sessions were launched through `POST /api/sessions`, and needs-input was driven with hook POSTs. Every claim cell used real pointer or keyboard input: label and Recent clicks, focus plus ArrowLeft, typing, Enter, ⌥⌘N, ⌥⌘0/1/2/4/5.
