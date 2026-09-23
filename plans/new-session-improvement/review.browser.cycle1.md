# Browser review: New Session Improvement

**Plan**: new-session-improvement
**Verdict**: needs-changes
**Cycle**: 1
**Pack**: kb: pack 26789 words (budget 8000) — WARN exceeds; sections rules 1340 · features 10176 · diagrams 0 · decisions 11693 · proposed 0 · facts 2459 · lessons 1113 · runbooks 2 (features=launch,focus,tiles,surfaces,connection,actions,rail,rename)
**Rig**: `make web-build build` at b3e7963 (tree dirty only by `orchestration-state.json`); one scratch daemon per probe test from `helpers/fixtures.ts` — data dir `$TMPDIR/muster e2e-XXXXXX` (space-bearing), tmux `-S <datadir>/tmux.sock`, stub `claude` at `$TMPDIR/muster e2e-stub-635d9c3a50837164/claude`; headless Chromium 1280×720; throwaway `web/e2e/zz-review-browser-probe.spec.ts` deleted, no musterd/tmux server left, `git status --porcelain` shows nothing of mine.

Gates log read, not re-run: `web-build` and `e2e` are green (441 passed). The only red line is `10-kb-check` (7 "owned by no feature" globs), which is doc-reconcile's to fix. So the app I drove is the one that will ship.

## Matrix

Hosts: the launch dialog is a modal `<dialog>` opened from the masthead, so it is measured opened from **Focus** and opened from **Tiles**. The launched surface is measured in **focus** (main slot) and **tiles** (grid). **pop-out** (`/doc.html`) hosts only the reader, with no launch dialog and no terminal, so it is N/A for every row.

| Req | Host | State | Claim | Result | Evidence |
|-----|------|-------|-------|--------|----------|
| REQ-5 | served `index.html` | no data yet | static `checked` is on auto, not manual | pass | `GET /` → 200; `value="auto" checked` present, `value="default" checked` absent |
| REQ-5 | dialog from Focus | no data yet (`GET /api/repos` held by `page.route`) | form shows its reset values | pass | checked model `sonnet`, mode `auto` while repos held |
| REQ-5 / E1 / E2 | dialog from Focus | fresh daemon, no history | sonnet + auto, settled | pass | after 1.2 s hold: `sonnet`/`auto`, crumb `browse-root`; dialog box 280,97–1000,623 inside 1280×720 viewport |
| REQ-5 | dialog from Tiles (opened by ⌥⌘N) | fresh | sonnet + auto | pass | `sonnet`/`auto`; dialog 280,97–1000,623 |
| REQ-5 | dialog from Focus | first recent `lastPermissionMode: null` (set via sqlite; `/api/repos` confirmed `null`) | mode falls back to auto, model still restored | pass | `opus`/`auto` |
| REQ-5 | dialog | stored `bypassPermissions` (no radio) | auto on initial restore and on Recent click | pass | `opus`/`auto` on both paths |
| REQ-5 | dialog | daemon-down (SIGTERM) | reset values | pass | `sonnet`/`auto`, `#launch-error` "Could not reach musterd." |
| E11 / Edge 17 | dialog from Focus | data (recent: haiku / acceptEdits) | restored on open | pass | `haiku`/`acceptEdits` |
| REQ-3 / E3 | dialog from Focus | data: previously launched dir (INV-1 state 2) | refusal message exact, visible, contained; dialog open; fields untouched | pass | text = `Claude Code doesn't recognise the model "muster-e2e-unrecognized-zeta" — update Claude Code, or pick another model`; computed display block / visibility visible / opacity 1; alert 281,575–999,611 inside dialog 280,60–1000,661; `open=true`; `other…` + custom text + `plan` + title intact |
| INV-1 / Edge 8 | same | same | refusal writes nothing | pass | `/api/repos` byte-identical; `settings.local.json` bytes and mtime identical; tmux sessions `[muster-1]` unchanged; `/api/state` 1→1 sessions; **0** `/ws` frames received during the refusal (listener attached before `goto`) |
| REQ-3 | same | settled | alert survives a render tick; keyboard focus stays in the form | pass | still visible after 1.2 s; `activeElement` = `#title-input` |
| REQ-3 / INV-1 / Edge 7 | dialog from Focus | never-launched dir | refusal + nothing written | pass | exact message; no `<dir>/.claude`; `/api/repos` holds only the prior dir; Recent buttons 1; tmux unchanged |
| REQ-3 | dialog from Tiles | data (2 live tiles) | alert visible and contained; grid untouched | pass | alert 281,575–999,611 inside 280,60–1000,661, opacity 1; tiles 2; tmux `[muster-1, muster-2]` |
| REQ-3 | dialog | refusal with a 184-char model | message contained horizontally | note | alert and dialog `scrollWidth 1208` vs `clientWidth 718` (Note 1) |
| E4 / Edge 9 | dialog → focus | retry with `sonnet` (pointer), submit with Enter | dialog closes, exactly one session, launched session opened | pass | 1 session `model.id=sonnet`; current card `p2-refused`; `activeElement` in `Terminal: p2-refused`; argv `--model sonnet … --permission-mode plan` |
| REQ-3 | dialog from Focus | daemon-down | network error shown, dialog open, fields untouched | pass | "Could not reach musterd." visible; `open=true`; `opus`/`plan` intact |
| REQ-4 | tmux oracle | launch via dialog, every mode | `--permission-mode <m>` explicit | pass | `pane_start_command` carries `--permission-mode default` / `acceptEdits` / `plan` / `auto`, each exactly once |
| REQ-4 / Edge 19 | tmux oracle | resume of a `default` session | explicit on resume | pass | `POST …/resume` 200; argv `--resume claude-p12 --permission-mode default` |
| REQ-7 | focus | no sessions; ⌥⌘N, pick, type title, Enter (keyboard only) | marker, mainhead, keyboard focus, typed input reaches B | pass | 1 `aria-current` card (`p4-b`); mainhead `p4-b`; `activeElement` = `xterm-helper-textarea` in `Terminal: p4-b` at dialog close, at READY and after 1.2 s; `tmux capture-pane` of B holds `stub-echo:p4-typed` |
| REQ-7 | focus | no sessions | terminal placed in its host, geometry real | pass | terminal 300,90–1280,694 = `#main-terminal-slot`, inside `#view-focus` 0,46–1280,720; sizenote `130×25` = tmux `130x25` |
| REQ-7 / E5 / E6 / INV-4 | focus | A focused by pointer, 10 seeds | B focused, A bystander untouched, input to B only | pass | B `aria-current=true`, A none, 1 current; mainhead `p5-b`; focus in `Terminal: p5-b` after 1.2 s; capture of B has `stub-echo:p5-typed`, capture of A does not; 1 terminal region, 1 live `/ws/terminal`; A's `/api/state` row: 0 keys changed |
| REQ-7 | focus | A focused, rail overflows | B's current marker can be seen in the rail | FAIL (Minor 1) | card B 0,1740–299,1906 vs rail viewport 0,85–299,720; `#sessions` scrollHeight 1821 / clientHeight 635, `overflow-y: auto`, scrollTop 0 |
| REQ-7 / E8 / Edge 11 | focus (attention sort) | another session in needs-input | launched C stays focused past render ticks; input reaches C | pass | rail order `[needy, a, c]`; C `aria-current`, count 1, mainhead `p6-c` after 2.2 s; focus in `Terminal: p6-c`; echo in C's tmux pane |
| REQ-8 / INV-4 | tiles | free slot | keyboard focus in the new tile; input reaches it; tile inside grid | pass | focus in `Terminal: p7-free` after 1.2 s; echo in tmux; tile 641,403–1279,719 inside grid 0,84–1280,720 |
| REQ-8 / E7 / Edge 13 | tiles | full grid (4) | promoted, focused, typed input arrives, geometry real, one client | pass | 4 tiles, `p7-free` demoted to strip (static card); focus in `Terminal: p7-full` at close and after 1.2 s; echo in tmux; `expectAllTileGeometrySettled` on all 4 live tiles = match; tile 641,328–1279,570 inside grid 0,84–1280,571; 4 terminal regions for 4 live tiles |
| REQ-8 | tiles → focus | after a Tiles launch, switch view | (no plan requirement) | note | Focus shows `p7-seed-0`, not the launched `p7-full` (Note 3) |
| REQ-7 / REQ-8 | pop-out | any | — | N/A — `/doc.html` hosts the reader only | |
| REQ-7 / REQ-8 | focus / tiles | daemon-down | — | N/A — a launch cannot succeed with the daemon down; the refusal path is the REQ-3 daemon-down row | |
| REQ-6a / E9 / Edge 14 | dialog | first `GET /api/browse` held; `opus` picked by pointer | opus kept, untouched mode restored | pass | mid-race `opus`/`auto` → settled `opus`/`acceptEdits`, crumb = recent's dir |
| REQ-6a | dialog | same; mode changed by keyboard (ArrowLeft) | mode kept, untouched model restored | pass | mid `sonnet`/`plan` → settled `haiku`/`plan` |
| REQ-6a | dialog | same; `other…` + typed custom model | custom kept, mode restored | pass | `other`/`my-custom`, `acceptEdits` |
| REQ-6a | dialog | `GET /api/repos` held; `fable` picked | kept | pass | `fable`/`acceptEdits` |
| REQ-6 | dialog | reopen after touch + Escape | touched state resets, restore applies again | pass | `haiku`/`acceptEdits` |
| REQ-6b / E10 / Edge 15 | dialog | second Recent clicked while first browse held | second listed and pressed, its values applied, no browse-root fallback | pass | after 1.5 s: crumb and footer = older dir; older `aria-pressed=true`, newer `false`; `haiku`/`plan` |
| REQ-6b | dialog | superseding Recent's directory deleted | — | note | no crumbs, empty listing, footer `—`, error shown (Note 2) |
| REQ-6c / Edge 16 | dialog | first recent's directory deleted | browse-root fallback; error cleared once settled | pass | footer `…/browse-root`, `#launch-error` hidden, `sonnet`/`auto` |
| Hidden | dialog | all | `[hidden]` elements computed `display: none` | pass | `#custom-model-row`, `#custom-model-input`, `#launch-error`, `.branch` all `none` |
| §6.7 | page | daemon-down | banner shown prominently | pass | `#banner` visible 0,46–1280,78, opacity 1, "musterd unreachable — …" |
| §6.1 / §6.3 | rail card | launched session | unknown shown as a word; permission mode never shown as authoritative | pass | card reads `ctx unknown`; `permissionMode` is never rendered (`web/src` has no renderer for it) |
| §7.1 | focus / tiles | data | one live client per session | pass | Focus: 1 region, 1 socket; Tiles: one region per live tile, demoted session only as a static strip card |
| §7.4 | focus / tiles | — | xterm `scrollback: 0` | note — not measured (Note 6) | |

## Issues

### Critical

None.

### Major

None.

### Minor

1. **[orchestrator:decision]** A launch into a rail that overflows puts the current marker on a card the user cannot see. REQ-7 names the marker as its visible consequence. With 10 seeds and A focused, the launched B's card lands at 0,1740–299,1906. The rail's scroll viewport is 0,85–299,720 (`#sessions` scrollHeight 1821 / clientHeight 635, `overflow-y: auto`), and scrollTop stays 0. The mainhead does show B's title. No focus path in `web/src` calls `scrollIntoView`, so number chords behave the same way today. Launch is new here because it appends the card at the bottom of manual order and then focuses it. Options:
   - **(A)** `onLaunched` (`web/src/features/launch.ts`) scrolls the launched card into view in the rail (`block: "nearest"`), so the marker REQ-7 names is on screen.
   - **(B)** Keep rail scroll untouched, matching the number chords and ⌥⌘0. The mainhead title confirms the launch, and REQ-7's marker claim holds in the DOM.

### Notes

1. **[note]** The refusal message echoes the model string as typed, and `.launch-error` has no `overflow-wrap`. With a 184-character unbroken model name, both the alert and the dialog measure `scrollWidth 1208` against `clientWidth 718`, so the dialog scrolls sideways. Realistic model ids (≤ ~40 characters) wrap at the message's spaces and fit. The fix, if wanted, is one CSS line (`overflow-wrap: anywhere` on `.launch-error`, `web/src/style.css:2784`).
2. **[note]** REQ-6b plus a failing superseding navigation leaves the dialog empty. With two recents and the first `GET /api/browse` held, I deleted the older recent's directory and clicked it. The user's navigation failed and there was no earlier listing to restore. The initial restore, correctly superseded, did no fallback. The settled dialog showed no crumbs, an empty listing, a footer of `—`, and "directory does not exist or is not a directory". The other Recent is still clickable (this race needs two or more recents), so the user can recover in one click. That is why this is a note rather than a defect. If it is ever fixed, the fix belongs in `navigate`'s failure path (fall back to the browse root when `current` is null), not in the initial restore, which keeps REQ-6b as written.
3. **[note]** After a launch from Tiles (full grid), switching to Focus shows `p7-seed-0` (the old `focusedId`), not the launched `p7-full`. The plan only calls `app.focus` in Focus, so this is what the plan specifies. I am recording it because `kb:adr/launch-opens-launched-session`'s wording ("focuses the launched session in Focus") could be read either way.
4. **[note]** This predates the plan and is not caused by it. Pressing Launch while a child navigation is still loading launches into the previously listed directory. Measured: footer `…/browse-root`, listing `loading…`, launched `directory` `…/browse-root`. The footer states that directory truthfully, so this is not an honesty violation. My first probe run hit it by accident.
5. **[note]** This also predates the plan. With the daemon down, the dialog's Recent sidebar reads "No recent directories" beside "Could not reach musterd.". The sidebar states an absence Muster does not know. The error line explains it, so I am not filing it as §6.
6. **[note]** Not measured: xterm `scrollback: 0` (§7.4). The plan does not touch terminal construction (`pane.ts` changed only a doc comment), and xterm's options are not reachable from the DOM without its internals.
7. **[note]** Setup, not a claim: I switched the rail to attention sort with `selectOption` as a precondition for the E8 row. Every claim cell used real pointer or keyboard input: label clicks, typing, Enter, ArrowLeft, ⌥⌘N.
8. **[note]** The refusal took 23–52 ms because the stub answers the pre-check instantly. The real binary's ~1 s is D13's to measure (forced canary), since this rig never runs the real `claude`.
