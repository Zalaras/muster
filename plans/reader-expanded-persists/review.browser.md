# Browser review: reader-expanded-persists

**Plan**: reader-expanded-persists
**Verdict**: approved
**Cycle**: 3
**Pack**: kb: pack 6546 words (budget 30000)
**Rig**: `bin/musterd` built by `make web-build build` at 4a885900 (clean tree), driven through the committed `daemon` fixture (fresh space-bearing `muster e2e-XXXX` data dir per test, private tmux socket inside it, shared `muster e2e-stub-*/claude` stub), headless Chromium 1280×720, throwaway `web/e2e/zz-review-browser.spec.ts` (deleted; `git status` shows nothing of mine)

Gates log (cycle 3): 0 failed lines. `web-build`, `e2e` (721 passed) and `E1` are green, so the app I drove is the one that ships.

## Matrix

A "switch" disposes the reader instance and rebuilds it: Docs → Claude/Shell → Docs, or focusing another session and coming back. Folder state is read from the folder button's `aria-expanded` and whether its children exist, with computed display, visibility and opacity. Fold state is read from the header toggle's `aria-expanded` and the section's computed `display`. Every reading is cross-checked in the same pass against `localStorage["muster.reader.<id>"]`, read from the page under test. "Live" cells are this cycle's change: one host writes, and the other host is read 1.2 s later with no input of its own.

| Req | Host | State | Claim | Result | Evidence |
|-----|------|-------|-------|--------|----------|
| REQ-1 | focus | data | `docs/` expanded survives Claude → Docs | pass | `docs/` aria-expanded=true; `adr/` flex/visible/opacity 1 at 1045,290–1280,312, inside nav 1044,127–1280,720, inside region 300,95–1280,720; memory `expanded:["docs"]`; terminal sockets open on Docs = 0 |
| REQ-1 | focus | data | expanded survives Shell → Docs (with Files folded, then unfolded) | pass | while folded: `.tree` display:none, memory keeps `["docs"]`. After unfolding, `adr/` flex/visible at 1045,290–1280,312 |
| REQ-1 | focus | data | expanded survives focus A → B → A | pass | B independent (`docs/` aria-expanded=false, Outline aria-expanded=true); back on A, `docs/` aria-expanded=true, `adr/` at 1045,290–1280,312 |
| REQ-1 | focus | data | keyboard operable, focus kept | pass | Tab from the filter lands on `▸docs/1`; Enter expands it; after 1.2 s `document.activeElement` is the same connected node (`▾docs/1`) |
| REQ-1 | tiles | data | expanded survives tile Claude → Docs | pass | tile A `adr/` 450,302–639,318, inside nav 449,146–639,373, inside tile 1,85–640,402; tile B `docs/` aria-expanded=false |
| REQ-1 | tiles + pop-out | data | tile adopts the pop-out's write live | pass | the pop-out expands `adr/` and unfolds Outline. With no tile input: tile A `adr/` aria-expanded=true, `x.md` flex/visible 450,321–639,336, Outline aria-expanded=true. Tile B (other session) unchanged: `docs/` aria-expanded=false |
| REQ-1 | tiles + pop-out | data | tile keeps keyboard focus across an adopted write | pass | tile `▾docs/1` focused by Tab from the filter; the pop-out toggles Outline; after 1.2 s activeElement is the same connected node, and the tile's Outline aria-expanded=false |
| REQ-1 | tiles→focus | data | Tiles state shows after Cmd+\ to Focus | pass | Focus shows Files aria-expanded=false and Outline aria-expanded=false, matching memory `filesFolded:true, outlineFolded:true` |
| REQ-1 | pop-out | data | pop-out adopts the dashboard's expansion live | pass | the dashboard expands `docs/`, `adr/`. In the pop-out with no click: `adr/` aria-expanded=true, `x.md` flex/visible 1045,217–1280,238, inside nav 1044,29–1280,720, inside `#reader-host` 0,0–1280,720 |
| REQ-1 | pop-out | data | cycle-2 Minor 1 repro: a collapse in the dashboard, then a click in the pop-out | pass | the dashboard collapses `adr/`, and the pop-out follows with no click (`adr/` aria-expanded=false, `x.md` count 0, memory `["docs"]`). A pop-out click on `adr/` then expands it there (aria-expanded=true, `x.md` 1045,217–1280,238), stores `["docs","docs/adr"]`, and the dashboard follows (`adr/` aria-expanded=true, `x.md` 1045,315–1280,336) |
| REQ-1 | pop-out (stale display) | data | a click in a host whose storage event never lands does what it shows | pass | `StorageEvent.prototype.key` is forced to null in the pop-out. The dashboard collapses `adr/`, and the pop-out still shows it expanded (memory `["docs"]`). The pop-out's click collapses it: aria-expanded=false, `x.md` count 0, memory stays `["docs"]`, and the dashboard's `adr/` stays aria-expanded=false |
| REQ-1 | pop-out | data | pop-out keeps keyboard focus across an adopted write | pass | `▾docs/1` focused by Tab; the dashboard toggles Outline; after 1.2 s the pop-out's activeElement is the same connected node and its Outline reads aria-expanded=false. Enter then collapses `docs/` with focus kept on the re-rendered `▸docs/1` |
| REQ-1 | pop-out | data | typing in the filter survives an adopted write | pass | the pop-out filter holds `x` with focus; the dashboard toggles `docs/`; after 1.2 s it is the same input, value `x`, and `x.md` is still shown. The reverse (dashboard filter, pop-out write) also gives the same input with value `x` |
| REQ-1 | focus | no data (listing held) | remembered expansion applies once the listing lands | pass | the loading row is flex/visible at 1045,224–1280,243 while the listing is held, and Outline is already aria-expanded=false. After release, `docs/` aria-expanded=true and `adr/` is at 1045,293–1280,315 |
| REQ-1 | focus + pop-out | daemon-down | toggles while down reach the other host live and survive restart | pass | banner role=alert display:block 0,46–1280,78 "musterd unreachable — …"; Claude segment `disabled`. The pop-out expands `adr/` and folds Files, and the dashboard follows (Files aria-expanded=false, tree entries count 0). The dashboard unfolds Files, and the pop-out follows (Files aria-expanded=true, `x.md` 1045,239–1280,260). After restart and reload, Docs shows `adr/` aria-expanded=true and `x.md` 1045,315–1280,336 |
| REQ-1 | focus | daemon-down | switch while down | N/A — the Claude and Docs segments are `disabled` while down (measured `isDisabled()` true) | |
| REQ-1 | tiles | daemon-down | | not measured (Note 2) | |
| REQ-2 | focus | data | Outline fold survives Claude → Docs and A → B → A | pass | toggle aria-expanded=false, outline section display:none, both times |
| REQ-2 | focus | data | Files fold survives Shell → Docs | pass | Files aria-expanded=false; `.tree` display:none; memory `filesFolded:true` |
| REQ-2 | tiles | data | Outline fold survives tile Claude → Docs | pass | tile A Outline aria-expanded=false, toggle at 450,346–639,371 inside tile 1,85–640,402 |
| REQ-2 | pop-out → focus | data | pop-out folds reach the dashboard live | pass | the pop-out folds Outline and Files. The dashboard, with no input: Files aria-expanded=false, `.tree` display:none, Outline aria-expanded=false, outline section display:none |
| REQ-2 | focus → pop-out | data | dashboard unfolds reach the pop-out live | pass | pop-out Files and Outline aria-expanded=true, outline section display:block 1045,297–1280,318 |
| REQ-2 | focus | no data (no markdown) | folds survive a switch with nothing to list | pass | Files aria-expanded=false, outline section display:none; memory `expanded:[]`, both folds `true` |
| REQ-3 | focus | data | clearing the filter collapses the tree, and a return shows that | pass | type `x`, then Backspace: `docs/` aria-expanded=false, `adr/` count 0, memory `expanded:[]`. After Claude → Docs, the same readings |
| REQ-3 | pop-out → focus | data | a filter clear in the pop-out | pass (live) | memory before `["docs/adr"]`. After the pop-out's Backspace, the dashboard with no input shows `docs/` aria-expanded=false and `adr/` count 0, with memory `expanded:[]` (Note 3) |
| REQ-3 | tiles | data | | N/A — `setFilter` runs the same path in every host; the focus and pop-out measurements stand | |
| REQ-4 | focus | data | old `{openPath, clearedAt}` loads as nothing expanded and nothing folded | pass | `docs/` aria-expanded=false, `adr/` count 0, Outline aria-expanded=true; TODO.md rendered from `openPath`; no page errors |
| REQ-4 | focus | data | wrong-type fields (`expanded:"docs"`, `filesFolded:"yes"`, `outlineFolded:1`) | pass | same readings as the old-shape row; no page errors |
| Edge 1 | focus | data | stale remembered path is inert | pass | `expanded:["gone/dir","docs"]` gives `docs/` aria-expanded=true and `adr/` at 1045,290–1280,312; no page errors |
| §6 | focus | daemon-down | daemon-down shown prominently | pass | full-width alert banner (measured above) |
| §7 | focus | data | no stray terminal client after a Claude → Docs round-trip | pass | `TerminalSocketTracker.liveCount` = 0 on Docs |
| §6/§7 rest | | | unknown-as-0, context %, permission_mode, Done, cost, scrollback, pane styling | N/A — the plan adds no data display and changes no terminal | |

## Issues

### Critical

### Major

### Minor

### Notes
1. **[note]** Cycle-2 Minor 1 is fixed, and both of its routes are measured above. A host adopts the other window's write live, and a click in a host whose display is stale does what that host shows. The committed cycle-3 E2E pair (`reader.spec.ts` "a dashboard's collapse of adr/ shows in the pop-out…" and "a click on a pop-out's displayed-expanded adr/ collapses it…") asserts both outcomes, so it could fail for the cycle-2 defect.
2. **[note]** Not measured: daemon-down toggles in the Tiles host. The Tiles host runs the same instance code and the same `storage` listener as the measured Focus and pop-out cells, and a switch cannot happen while the surface segments are disabled.
3. **[note]** With live adoption, a filter cleared in the pop-out now folds the dashboard's tree immediately, not only on its next return. This follows REQ-3 and the shared memory. It is listed only because the developer may not expect typing in one window to fold the other on screen.
4. **[note]** If the other window folds Files while a tree button has keyboard focus, focus falls to `<body>` (`activeElement` BODY, node still connected but in a `display:none` tree). The focused control stopped being shown, so this is expected. A fold of Outline keeps focus (measured above).
5. **[note]** Observed only, and it predates this plan: a file opened in the pop-out moves the shared `openPath` (memory `docs/adr/x.md`), but the dashboard keeps showing its own open document live (body still "TODO / one"). Adoption does not reopen files. The pop-out shows daemon-down as its status line ("musterd unreachable — showing last render") with no banner, as in cycle 2.
