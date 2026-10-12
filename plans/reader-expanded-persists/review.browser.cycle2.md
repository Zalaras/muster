# Browser review: reader-expanded-persists

**Plan**: reader-expanded-persists
**Verdict**: needs-changes
**Cycle**: 2
**Pack**: kb: pack 6546 words (budget 30000)
**Rig**: `bin/musterd` built by `make web-build build` at 9e8e76ef (clean tree), driven through the committed `daemon` fixture (fresh space-bearing `muster e2e-XXXX` data dir per test, private tmux socket inside it, shared `muster e2e-stub-*/claude` stub), headless Chromium 1280×720, throwaway `web/e2e/zz-review-browser.spec.ts` (deleted)

Gates log (cycle 2): 0 failed lines. `web-build`, `e2e` (719 passed) and `E1` are green, so the app I drove is the one that ships.

## Matrix

A "switch" disposes the reader instance and rebuilds it. That happens on Docs → Claude/Shell → Docs, and on focusing another session and coming back. Folder state is read from the folder button's `aria-expanded` and from whether its children are present, with computed display, visibility and opacity. Fold state is read from the header toggle's `aria-expanded` and the section's computed `display`. Each reading is cross-checked against `localStorage["muster.reader.<id>"]` in the same pass. The "pop-out" waits (500 ms) are hand-speed gaps between hosts, not retries.

| Req | Host | State | Claim | Result | Evidence |
|-----|------|-------|-------|--------|----------|
| REQ-1 | focus | data | `docs/` expanded survives Claude → Docs | pass | `docs/` aria-expanded=true; `adr/` flex/visible/opacity 1 at 1045,290–1280,312, inside nav 1044,124–1280,720, inside reader region 300,95–1280,720; memory `expanded:["docs"]` |
| REQ-1 | focus | data | expanded survives Shell → Docs (with Files folded, then unfolded) | pass | after unfolding, `adr/` flex/visible at 1045,290–1280,312; memory `expanded:["docs"]` kept under the fold |
| REQ-1 | focus | data | expanded survives focus A → B → A | pass | A: `adr/` flex/visible 1045,290–1280,312. B is independent: `docs/` aria-expanded=false, Outline aria-expanded=true, B memory `null` |
| REQ-1 | focus | data | keyboard operable, focus kept | pass | Tab from the filter lands on `▸docs/1` and Enter expands it. After 1.2 s, `document.activeElement` is the same connected node (`▾docs/1`) |
| REQ-1 | tiles | data | expanded survives tile Claude → Docs | pass | tile A `adr/` 450,302–639,318, inside nav 449,146–639,373, inside tile 1,85–640,402. Tile B `docs/` aria-expanded=false, B memory `null` |
| REQ-1 | tiles→focus | data | Tiles state shows after Cmd+\ to Focus | pass | focus `adr/` flex/visible 1045,290–1280,312; Outline aria-expanded=false |
| REQ-1 | pop-out | data | pop-out opens with the dashboard's expanded set | pass | pop-out `adr/` flex/visible 1045,195–1280,217, inside nav 1044,29–1280,720, inside `#reader-host` 0,0–1280,720 |
| REQ-1 | focus + pop-out | data | dashboard-expanded `docs/adr` survives a pop-out Outline toggle and a dashboard switch (cycle-1 Major 1) | pass | memory before `["docs","docs/adr"]`. After the pop-out toggle it is `["docs","docs/adr"]` with `outlineFolded:false`. Dashboard Claude → Docs: `x.md` flex/visible 1045,315–1280,336, Outline aria-expanded=true |
| REQ-1 | pop-out (stale display) | data | a folder click in one host does what that host shows | FAIL | The dashboard collapsed `adr/` (memory `["docs"]`), but the pop-out still showed it expanded (`x.md` count 1). Clicking `adr/` in the pop-out to collapse it left `adr/` aria-expanded=true and `x.md` count 1, with nothing changing on screen, and stored `["docs","docs/adr"]`. That re-expanded the folder the dashboard had just collapsed (Minor 1) |
| REQ-1 | focus | no data (listing held) | remembered expansion applies once the listing lands | pass | loading row flex/visible 1045,224–1280,243 while held, Outline already aria-expanded=false; after release, `adr/` flex/visible 1045,290–1280,312 |
| REQ-1 | focus | daemon-down | folder toggle while down persists across restart and switch | pass | banner role=alert display:block 0,46–1280,78 "musterd unreachable — …"; status line "musterd unreachable — showing last render". `adr/` toggled while down gives memory `["docs","docs/adr"]`; after restart, Claude → Docs shows `x.md` flex/visible 1045,312–1280,333 |
| REQ-1 | focus | daemon-down | switch while down | N/A: the Claude and Docs segments are both `disabled` while down (measured `isDisabled()` true) | |
| REQ-1 | tiles / pop-out | daemon-down | | not measured (Note 2) | |
| REQ-2 | focus | data | Outline fold survives Claude → Docs | pass | toggle aria-expanded=false; outline section display:none |
| REQ-2 | focus | data | Files fold survives Shell → Docs | pass | Files aria-expanded=false; `.tree` and filter box absent (count 0); memory `filesFolded:true` |
| REQ-2 | focus | data | folds survive focus A → B → A | pass | A Outline aria-expanded=false, section display:none |
| REQ-2 | tiles | data | Outline fold survives tile Claude → Docs | pass | tile A Outline aria-expanded=false, section display:none, toggle 450,346–639,371 inside tile 1,85–640,402 |
| REQ-2 | pop-out | data | Files fold survives a pop-out reload | pass | aria-expanded=false, `.tree` absent |
| REQ-2 | focus | no data (empty dir) | folds survive a switch with no markdown | pass | both toggles aria-expanded=false; outline section display:none; memory `expanded:[]`, both folds `true` |
| REQ-2 | focus | daemon-down | Outline fold while down survives restart and switch | pass | aria-expanded=false after return |
| REQ-3 | focus | data | clearing the filter collapses the tree, and a return shows that | pass | type `x`, then Backspace: `adr/` count 0, memory `expanded:[]`; after Claude → Docs, `adr/` count 0 |
| REQ-3 | focus | data | a click while filtering, then a switch (cycle-1 Minor 1) | pass | Clicking `docs/` and pressing Enter on `adr/` both leave the tree text identical and memory `expanded:[]`. Focus stays on `▾adr/1`. After a switch the filter is `""` and `docs/` aria-expanded=false |
| REQ-3 | pop-out → focus | data | a filter clear in the pop-out | pass (shared memory) | pop-out types `x`, then Backspace: memory `expanded:[]`; the dashboard's next return shows `adr/` count 0. The clear applies to both hosts (Note 3) |
| REQ-3 | tiles | data | | N/A: `setFilter` runs the same path in every host; the focus and pop-out measurements stand | |
| REQ-4 | focus | data | old `{openPath, clearedAt}` loads as nothing expanded and nothing folded | pass | `docs/` aria-expanded=false, `adr/` count 0, Files/Outline aria-expanded=true, outline section display:block; TODO.md rendered from `openPath`; no page errors |
| REQ-4 | focus | data | wrong-type fields (`expanded:"docs"`, `filesFolded:"yes"`, `outlineFolded:1`) | pass | same readings as the old-shape row |
| Edge 1 | focus | data | stale remembered path is inert | pass | `expanded:["gone/dir","docs"]` gives `docs/` aria-expanded=true and `adr/` at 1045,293–1280,315; no page errors |
| §6 | focus | daemon-down | daemon-down shown prominently | pass | full-width alert banner (measured above) |
| §7 | focus | data | no stray terminal client after a Claude → Docs round-trip | pass | `TerminalSocketTracker.liveCount` = 0 on Docs after the round-trip |
| §6/§7 rest | | | unknown-as-0, context %, permission_mode, Done, cost, scrollback, pane styling | N/A: the plan adds no data display and changes no terminal | |

## Issues

### Critical

### Major

### Minor
1. **[web-impl]** A folder click in a host whose display is out of date does nothing visible, and it stores the opposite of what the developer meant. `commitMemory` applies `withFolderToggled` to a fresh storage read, so the click flips the *stored* state. The clicking host, though, keeps showing its own copy until its next write. Measured: the dashboard collapses `adr/` (stored `["docs"]`). The pop-out, opened earlier, still shows `adr/` expanded. Clicking `adr/` there to collapse it changes nothing on screen (`aria-expanded` stays true, `x.md` stays shown) and stores `["docs","docs/adr"]`, so the dashboard's next return shows `adr/` expanded again. Before this plan each host kept its own set, so a click always did what that host showed. The same staleness explains a smaller symptom: an unrelated click in the pop-out (the Outline toggle) re-renders from the fresh read, so its tree jumps open to the dashboard's folders (`x.md` count 0 → 1). — `web/src/features/reader.ts` `toggleFolder` / `commitMemory`. A fix must make a folder click set the state the clicking host shows, toggling from the displayed state rather than the stored one, or keep every host's display current with the stored memory (a `storage` listener).

### Notes
1. **[note]** Both cycle-1 defects are fixed, measured above. The cross-write (Major 1) is fixed in both directions, and the filter click (Minor 1) is fixed for both pointer and Enter.
2. **[note]** Not measured: daemon-down toggles in the Tiles host and the pop-out. They run the same instance code as the measured Focus cell, and the surface segments are disabled while the daemon is down, so a switch cannot happen.
3. **[note]** A filter cleared in the pop-out also clears the dashboard's expanded folders, because the memory is shared and REQ-3 says a clear collapses. This follows the spec. It is listed only because the developer may not expect typing in one window to fold the other.
4. **[note]** An empty directory still shows a Files section with an empty tree and no words (`innerText` ""). This predates the plan and was only observed.
5. **[note]** The committed cycle-2 E2E tests pin both cycle-1 defects. No test covers Minor 1, which is a click in a host whose display is out of date. Coverage is review-work's to judge.
