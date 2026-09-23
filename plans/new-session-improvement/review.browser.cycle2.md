# Browser review: New Session Improvement

**Plan**: new-session-improvement
**Verdict**: approved
**Cycle**: 2
**Pack**: kb: pack 26792 words (budget 8000) — WARN exceeds; sections rules 1340 · features 10176 · diagrams 0 · decisions 11693 · proposed 0 · facts 2462 · lessons 1113 · runbooks 2 (features=launch,focus,tiles,surfaces,connection,actions,rail,rename)
**Rig**: `make web-build build` at 49bcd3b (clean tree), producing `bin/musterd` v0.17.0-48-g49bcd3b. Each probe test got its own scratch daemon from `helpers/fixtures.ts`: data dir `$TMPDIR/muster e2e-XXXXXX` (the path contains a space), tmux on `-S <datadir>/tmux.sock`, and the stub `claude` at `$TMPDIR/muster e2e-stub-635d9c3a50837164/claude`. Browser was headless Chromium at 1280×720. The three throwaway specs (`web/e2e/zz-rbc2-{dialog,views,scroll}.spec.ts`) are deleted. No musterd or tmux server is left running, and `git status --porcelain` shows nothing of mine.

I read the gates log for cycle 2 and did not re-run it. `web-build` is green, and `e2e` is green (443 passed). The only red line is `10-kb-check` (7 unowned globs), which is doc-reconcile's to fix. So the app I drove is the one that will ship.

What changed since cycle 1 is the code path, not the plan. `onLaunched` now goes through `focus.bringForward`, the same path the number chords use, and the restore logic now lives in `render/launchrestore.ts`. So I re-measured every cycle-1 cell on this build, and added rows for the number chords going through `bringForward` in both views.

## Matrix

**Hosts.** The launch dialog is a modal `<dialog>`, so I measured it opened from Focus (by button and by ⌥⌘N) and opened from Tiles (⌥⌘N). I measured the launched surface in the Focus main slot and in the Tiles grid. The pop-out (`/doc.html`) hosts only the reader: it has no launch dialog and no terminal, so every row is N/A there.

| Req | Host | State | Claim | Result | Evidence |
|-----|------|-------|-------|--------|----------|
| REQ-5 | served `index.html` | no data yet | the static `checked` is on auto, not manual | pass | `GET /` → 200; `value="auto" checked` present, `value="default" checked` absent |
| REQ-5 | dialog from Focus | no data yet (`GET /api/repos` held by `page.route`) | the form shows its reset values | pass | while held: checked `sonnet` / `auto`, 0 Recent buttons |
| REQ-5 / E1 / E2 | dialog from Focus | fresh daemon, no history | sonnet + auto, settled | pass | after a 1.2 s hold: `sonnet`/`auto`, crumb `browse-root`; dialog box 280,97–1000,623 inside the 1280×720 viewport |
| REQ-5 | dialog from Tiles (⌥⌘N) | fresh | sonnet + auto | pass | `sonnet`/`auto`; dialog 280,97–1000,623 |
| REQ-5 | dialog from Focus | first recent has `lastPermissionMode: null` (set via sqlite; `/api/repos` confirms `null`) | mode falls back to auto; model still restored | pass | `opus`/`auto` |
| REQ-5 | dialog | stored `bypassPermissions` (no radio for it) | auto on the initial restore and on a Recent click | pass | initial `opus`/`auto`; after checking manual by pointer and then clicking the Recent: `opus`/`auto` |
| REQ-5 | dialog | daemon down (SIGTERM) | reset values | pass | reopened while down: `sonnet`/`auto`, `#launch-error` "Could not reach musterd." |
| E11 / Edge 17 | dialog from Focus | data (recent: haiku / acceptEdits) | restored on open | pass | `haiku`/`acceptEdits` |
| REQ-3 / E3 | dialog from Focus | data: a directory launched before (INV-1 state 2) | refusal message exact, visible and contained; dialog open; fields untouched | pass | text = `Claude Code doesn't recognise the model "muster-e2e-unrecognized-zeta" — update Claude Code, or pick another model`; computed display block, visibility visible, opacity 1; alert 281,575–999,611 inside dialog 280,60–1000,661; `open=true`; `other` + `muster-e2e-unrecognized-zeta` + `plan` + title `a4-refused` intact |
| INV-1 / Edge 8 | same | same | a refusal writes nothing | pass | `/api/repos` byte-identical; `settings.local.json` bytes and mtime identical; tmux `[muster-1]` → `[muster-1]`; `/api/state` sessions 1 → 1; **0** `/ws` frames during the refusal, and still 0 after a 1.2 s tick (listener attached before `goto`) |
| REQ-3 | same | settled | the alert survives a render tick; keyboard focus stays in the form | pass | after 1.2 s: display block, opacity 1; `activeElement` = `#launch-button` (the button clicked with the pointer) |
| REQ-3 / INV-1 / Edge 7 | dialog from Focus | never-launched directory | refusal, and nothing written | pass | exact message; no `<dir>/.claude`; `/api/repos` byte-identical (holds only the seed dir); 1 Recent button; tmux `[muster-1]` unchanged; sessions 1 → 1; `open=true` |
| REQ-3 | dialog from Tiles (⌥⌘N) | data (2 live tiles) | alert visible and contained; grid untouched | pass | alert 281,575–999,611 inside 280,60–1000,661, opacity 1; 2 tiles; tmux `[muster-1, muster-2]` |
| REQ-3 | dialog | refusal with a 184-character model | message contained horizontally | note | alert and dialog `scrollWidth 1208` vs `clientWidth 718`, `overflow-wrap: normal` (Note 1) |
| E4 / Edge 9 | dialog → Focus | retry with `sonnet` (pointer), submitted with Enter in Title | dialog closes, one new session, and it is opened | pass | sessions `[a4-seed opus, a4-refused sonnet]`; the current card is `a4-refused` (card reads `ctx unknown`); mainhead `a4-refused`; `activeElement` in `Terminal: a4-refused`; argv `--model sonnet --name a4-refused --permission-mode plan` |
| REQ-3 | dialog from Focus | daemon down | network error shown; dialog open; fields untouched | pass | "Could not reach musterd." (display block, opacity 1); `open=true`; `opus`/`plan` intact |
| REQ-4 / INV-3 | tmux oracle | launch via the dialog, every mode (label clicked by pointer) | `--permission-mode <m>` explicit, exactly once | pass | `pane_start_command`: `--permission-mode default` / `acceptEdits` / `plan` / `auto`, each 1× |
| REQ-4 / Edge 19 | tmux oracle | resume of a `default` session | explicit on resume | pass | `POST …/end` 200, `POST …/resume` 200; argv `--model claude-haiku-4-5-20251001 --resume claude-b8 --permission-mode default` |
| REQ-7 / INV-4 | Focus | no sessions; opened with ⌥⌘N, child picked, title typed, Enter | marker, mainhead, keyboard focus, typed input reaches the new session | pass | 1 current card (`b1-lone`); mainhead `b1-lone`; `activeElement` = `xterm-helper-textarea` in `Terminal: b1-lone` at dialog close, at READY and after 1.2 s; `tmux capture-pane` shows `stub-echo:b1-typed` |
| REQ-7 | Focus | no sessions | terminal placed in its host; geometry real | pass | region 300,90–1280,694 = `#main-terminal-slot` 300,90–1280,694, inside `#view-focus` 0,46–1280,720; sizenote `130×25` = tmux `130x25`; 1 terminal socket, 1 attached tmux client |
| REQ-7 / E5 / E6 / INV-4 | Focus | A focused by pointer (3 seeds) | B focused; bystander A untouched; input goes to B only | pass | current `[b2-b]`, A's `aria-current` null; mainhead `b2-b`; focus in `Terminal: b2-b` at close and after 1.2 s; B's pane has `stub-echo:b2-typed`, A's pane does not; 1 region, 1 live `/ws/terminal`, 1 attached client; A's `/api/state` row: 0 keys changed; A's card visible |
| REQ-7 / E8 / Edge 11 | Focus (attention sort) | another session in needs-input | launched C stays focused across render ticks; input reaches C | pass | rail order `[b3-needy, b3-a, b3-c]`; current `[b3-c]`, mainhead `b3-c` after 2.2 s; focus in `Terminal: b3-c`; echo in C's tmux pane |
| REQ-7 | Focus | A focused, rail overflows | marker visible in the rail | N/A — settled as Option B (kb:adr/rail-launch-leaves-rail-scroll-untouched); not re-filed | |
| REQ-8 / INV-4 | Tiles | free slot (1 seed), opened with ⌥⌘N | keyboard focus in the new tile; input reaches it; tile inside the grid | pass | focus in `Terminal: b4-free` at close and after 1.2 s; echo in tmux; tile 640,85–1279,402 inside grid 0,84–1280,720; 2 tiles |
| REQ-8 / E7 / Edge 13 | Tiles | full grid (4) | promoted, focused, typed input arrives, geometry real, one client each | pass | live `[seed0, seed1, seed2, b5-full]`, `seed3` demoted to the strip; focus in `Terminal: b5-full` at close and after 1.2 s; echo in tmux; `expectAllTileGeometrySettled` over all 4 = match; tile 640,328–1279,570 inside grid 0,84–1280,571; 4 regions, 4 sockets, 4 attached clients |
| REQ-8 | Tiles → Focus | after a Tiles launch, switch view | (no plan requirement) | note | Focus shows `b5-seed0`, not the launched `b5-full` (Note 3, unchanged from cycle 1) |
| chords via `bringForward` | Focus | 3 sessions, c3 focused by pointer (keyboard focus in c3's terminal) | ⌥⌘1 / ⌥⌘2 / ⌥⌘0 select, and stay select-only | pass | ⌥⌘1 → current `[b6-c1]`, mainhead `b6-c1`, 1 region, 1 socket, `activeElement` BODY; ⌥⌘2 → `[b6-c2]`, BODY; ⌥⌘0 with c3 needs-input → `[b6-c3]`, BODY. Per kb:adr/launch-opens-launched-session, chords are select-only and launch moves keyboard focus into the terminal, so the shared owner kept that split |
| chords via `bringForward` | Focus | right after a dialog launch | the launch focuses the terminal; a later chord moves selection away | pass | after launch: `[b6-new]`, focus in `Terminal: b6-new`; ⌥⌘1 → `[b6-c1]`, BODY, 1 region, 1 socket, 1 attached client |
| chords via `bringForward` | Tiles | 5 sessions, grid full, t5 in the strip | ⌥⌘5 promotes t5 into the grid, geometry settled, select-only | pass | live `[t1..t4]` → `[t1, t2, t3, t5]`; `expectAllTileGeometrySettled` = match; t5 tile 640,328–1279,570 inside grid 0,84–1280,571; 4 tiles, 4 attached clients; `activeElement` BODY before and after |
| REQ-7 / REQ-8 | pop-out | any | — | N/A — `/doc.html` hosts only the reader | |
| REQ-7 / REQ-8 | Focus / Tiles | daemon down | — | N/A — a launch cannot succeed with the daemon down; the refusal-path daemon-down row is under REQ-3 | |
| REQ-6a / E9 / Edge 14 | dialog | first `GET /api/browse` held; `opus` picked by pointer | opus kept; the untouched mode restored | pass | mid-race `opus`/`auto` → settled `opus`/`acceptEdits`; crumb = the recent's dir |
| REQ-6a | dialog | same, but mode changed by keyboard (focus auto, ArrowLeft) | mode kept; the untouched model restored | pass | mid-race `sonnet`/`plan` → settled `haiku`/`plan` |
| REQ-6a | dialog | same, but `other…` picked and a custom model typed | custom kept; mode restored | pass | `other`/`my-custom`, `acceptEdits` |
| REQ-6a | dialog | `GET /api/repos` held; `fable` picked | kept | pass | `fable`/`acceptEdits` |
| REQ-6 | dialog | reopen after a touch + Escape | touched state resets; the restore applies again | pass | `haiku`/`acceptEdits` |
| REQ-6b / E10 / Edge 15 | dialog | second Recent clicked while the first browse is held | the second is listed and pressed, its values applied, no browse-root fallback | pass | after 1.5 s: crumb and footer = older dir; older `aria-pressed=true`, newer `false`; `haiku`/`plan`; `#launch-error` display none |
| REQ-6c / E12 / Edge 16 | dialog | first recent's directory deleted | browse-root fallback; error cleared once settled | pass | crumb `browse-root`, footer = `daemon.browseRoot`; `sonnet`/`auto`; `#launch-error` display none, empty |
| REQ-6b | dialog | the superseding Recent's own directory deleted | — | note — not re-measured (Note 2): `navigate`'s failure path is unchanged since cycle 1 | |
| Hidden | dialog | fresh | `[hidden]` elements computed `display: none` | pass | `#custom-model-row`, `#custom-model-input`, `#launch-error`, `.branch` all `none` |
| §6.7 | page | daemon down | banner shown prominently | pass | `#banner` 0,46–1280,78, display block, opacity 1, "musterd unreachable — hook output in open panes is Muster's absence, not session failure." |
| §6.1 / §6.3 | rail card | launched session | unknown shown as a word; permission mode never shown as authoritative | pass | the launched card reads `ctx unknown`; no permission-mode text on the card |
| §7.1 | Focus / Tiles | data | one live client per session | pass | Focus: 1 region / 1 socket / 1 attached client in every Focus cell; Tiles: 4 / 4 / 4 for 4 live tiles, demoted session shown only as a static strip card |
| §7.4 | Focus | launched session, 60 typed lines (>120 output lines) | xterm `scrollback: 0` | pass | `.xterm-viewport` scrollHeight 600 = clientHeight 600, scrollTop 0, 25 row divs; the first visible row is `l48` (older lines are gone, not scrollable) |

## Issues

### Critical

None.

### Major

None.

### Minor

None.

### Notes

1. **[note]** Re-measured and unchanged from cycle 1 Note 1. A refusal for a very long unbroken model name (184 characters) makes the dialog scroll sideways: `.launch-error` has `overflow-wrap: normal`, and the alert and dialog measure `scrollWidth 1208` against `clientWidth 718`. Realistic model ids wrap at the message's spaces and fit (718/718 in every other refusal cell). If a fix is wanted, it is one CSS line: `overflow-wrap: anywhere` on `.launch-error`.
2. **[note]** Not re-measured: the case where REQ-6b's superseding navigation itself fails and leaves the dialog empty (cycle 1 Note 2). The cycle-1 fix wave did not touch `navigate`'s failure path, only `initOpen`'s dispatch, and E10/E12, which bracket that path, pass above.
3. **[note]** Still true from cycle 1 Note 3. After a launch from Tiles, switching to Focus shows the old `focusedId` (`b5-seed0`), not the launched session. The plan only focuses in Focus, so this matches the plan.
4. **[note]** Cycle 1 Notes 4 and 5 predate this plan. I re-observed Note 5: with the daemon down, the Recent sidebar reads "No recent directories" beside "Could not reach musterd.". This is not filed.
5. **[note]** Setup, not a claim. I switched the rail to attention sort with `selectOption` as a precondition for the E8 row, drove needs-input with hook POSTs, and set the null and `bypassPermissions` stored modes with `sqlite3` against the scratch DB. Every claim cell used real pointer or keyboard input: radio and label clicks, typing, Enter, ArrowLeft, ⌥⌘N, ⌥⌘0–5.
6. **[note]** The refusal is instant against the stub. The real binary's ~1 s is D13's to measure (the forced canary), because this rig never runs the real `claude`.
