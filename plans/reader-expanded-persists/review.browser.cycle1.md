# Browser review: reader-expanded-persists

**Plan**: reader-expanded-persists
**Verdict**: needs-changes
**Cycle**: 1
**Pack**: kb: pack 6546 words (budget 30000)
**Rig**: `bin/musterd` built by `make web-build build` at 4a4cb564 (dirty only in orchestration-state.json), driven through the committed `daemon` fixture (fresh `muster e2e-XXXX` space-bearing data dir per test, private `tmux.sock` inside it, shared `muster e2e-stub-*/claude` stub), headless Chromium 1280×720, throwaway `web/e2e/zz-review-browser.spec.ts` (deleted)

Gates log: one red line, `02-test` (`internal/server` `TestShellRegistry_*MusterSession`: `MUSTER_SESSION=[9]`
seen where `[]` was expected). The gate shell inherited `MUSTER_SESSION=9` from the Muster session
it ran in (my shell has it too). That is a Go-side environment leak, unrelated to this web-only
diff. `web-build`, `e2e` (716 passed) and `E1` are green, so the app I drove is the one that ships.

## Matrix

Each "switch" means the reader instance is disposed and rebuilt: either the Docs → Claude/Shell → Docs segment, or a focus change to another session and back. Folder state is read from `folderEntry` computed style plus `aria-expanded`, cross-checked against `localStorage["muster.reader.<id>"]` in the same pass. Fold state is read from the header `aria-expanded` and the section's computed `display`.

| Req | Host | State | Claim | Result | Evidence |
|-----|------|-------|-------|--------|----------|
| REQ-1 | focus | data | `docs/` expanded survives Claude → Docs | pass | after return `adr/` display:flex, visibility:visible, opacity 1, box 1045,290–1280,312 inside nav 1044,124–1280,720 inside main 300,46–1280,720; `docs/` aria-expanded=true; memory `expanded:["docs"]` |
| REQ-1 | focus | data | expanded survives Shell → Docs (with Files folded then unfolded) | pass | after unfold `adr/` flex/visible at 1045,290–1280,312; memory `expanded:["docs"]` kept under the fold |
| REQ-1 | focus | data | expanded survives focus → session B → A | pass | A after return: `adr/` flex/visible 1045,290–1280,312; B's reader shows `docs/` aria-expanded=false, B memory `null` (per-session isolation) |
| REQ-1 | focus | data | operable by keys, keeps focus | pass | Tab from filter to `▸docs/1`, Enter expanded it; after 1.2 s `document.activeElement` is the same node. After a collapse by Enter, focus is restored to the rebuilt `▸docs/1` button (old node disconnected), which is the focuskeep design |
| REQ-1 | tiles | data | expanded survives tile Claude → Docs | pass | tile A `adr/` box 450,302–639,318, nav 449,146–639,373 inside tile 1,85–640,402; tile B independent (`docs/` aria-expanded=false, memory null) |
| REQ-1 | tiles→focus | data | Tiles state visible after Cmd+\ to Focus | pass | focus reader `adr/` flex/visible 1045,279–1280,301; Outline still folded |
| REQ-1 | pop-out | data | pop-out opens with the dashboard's expanded set (shared memory) | pass | pop-out `adr/` flex/visible 1045,195–1280,217 inside `#reader-host` 0,0–1280,720 |
| REQ-1 | focus + pop-out | data | dashboard-expanded folder survives a switch while the pop-out is open | FAIL | dashboard expands `docs/adr` → memory `["docs","docs/adr"]`; pop-out toggles Outline → memory `["docs"]`; dashboard Claude → Docs shows `x.md` count 0, so `adr/` is collapsed (Major 1) |
| REQ-1 | focus | no data (listing in flight) | remembered expansion applies once the listing lands | pass | loading row flex/visible 1045,224–1280,243; Outline folded while held; after release `adr/` visible, Outline aria-expanded=false |
| REQ-1 | focus | daemon-down | folder toggle while down persists across restart and switch | pass | banner role=alert display:block 0,46–1280,78 "musterd unreachable — …"; status line "musterd unreachable — showing last render"; `adr/` toggled while down → memory `["docs","docs/adr"]`; after restart, Claude → Docs `x.md` count 1 |
| REQ-1 | focus | daemon-down | switch while down | N/A: Claude and Docs segments are both `disabled` while down (measured) | |
| REQ-1 | tiles / pop-out | daemon-down | | not measured (Note 2) | |
| REQ-2 | focus | data | Outline fold survives Claude → Docs | pass | toggle aria-expanded=false, `.outline` hidden, display:none |
| REQ-2 | focus | data | Files fold survives Shell → Docs | pass | Files aria-expanded=false, `.tree` display:none, filter box gone; memory `filesFolded:true` |
| REQ-2 | focus | data | Outline fold by keyboard (Space) keeps focus | pass | aria-expanded=false; activeElement is the same node after 1.2 s |
| REQ-2 | focus | data | folds survive a session switch | pass | A after return: Outline aria-expanded=false, display:none |
| REQ-2 | tiles | data | Outline and Files folds survive tile Shell/Claude → Docs | pass | tile A Outline display:none; Files aria-expanded=false, `.tree` display:none; nav 449,146–639,373 stays inside tile 1,85–640,402 |
| REQ-2 | pop-out | data | fold survives a pop-out reload | pass | Files folded in pop-out, reload → aria-expanded=false, `.tree` display:none |
| REQ-2 | focus | no data (empty dir) | folds survive a switch with no markdown | pass | both toggles aria-expanded=false, sections display:none; memory `expanded:[]`, both folds true |
| REQ-2 | focus | daemon-down | Outline fold while down survives restart and switch | pass | aria-expanded=false, display:none after return |
| REQ-3 | focus | data | clearing the filter collapses, and a return shows that | pass | type `x` (x.md shown) then Backspace → `adr/` count 0, memory `expanded:[]`; Claude → Docs → `adr/` count 0 |
| REQ-3 | focus | data | a click while filtering, then a switch | FAIL | the filter auto-expands `docs/`; clicking it changes nothing on screen (tree text identical before and after) but writes `expanded:["docs"]`; after a switch the filter is empty and `docs/` is expanded, a state the developer never saw (Minor 1) |
| REQ-3 | tiles / pop-out | data | | N/A: same `setFilter` path in every host; the focus measurement stands | |
| REQ-4 | focus | data | old `{openPath, clearedAt}` loads as nothing expanded or folded | pass | `docs/` aria-expanded=false, both sections display:block; TODO.md still opened from `openPath` |
| REQ-4 | focus | data | wrong-type fields (`expanded:"docs"`, `filesFolded:"yes"`, `outlineFolded:1`) | pass | same as above |
| Edge 1 | focus | data | stale remembered path is inert | pass | `expanded:["gone/dir","docs"]` → `docs/` expanded, no error, tree box 1045,271–1280,336 |
| §6 | all | daemon-down | daemon-down surfaced prominently | pass | full-width alert banner (measured above) |
| §7 | focus | data | one live terminal client | pass | `TerminalSocketTracker.liveCount` = 1 on Claude after Docs → Claude |
| §6/§7 rest | | | unknown-as-0, context %, permission_mode, Done, cost, scrollback, pane styling | N/A: the plan adds no data display or terminal change | |

## Issues

### Critical

### Major
1. **[web-impl]** A pop-out and the dashboard showing the same session overwrite each other's expanded folders and folds. Each `ReaderInstance` holds the copy of `muster.reader.<id>` it loaded when mounted, and `commitMemory` writes that whole object back. Measured: dashboard expands `docs/adr` (stored `["docs","docs/adr"]`); the pop-out, open since earlier, toggles Outline and stores `["docs"]`; the dashboard's next Claude → Docs shows `adr/` collapsed. The reverse direction (dashboard overwriting the pop-out) has the same cause. The pop-out sharing this memory is the documented design (spec: "the pop-out … sharing … that memory"), so REQ-1/REQ-2 fail whenever a pop-out is open. — `web/src/features/reader.ts` `commitMemory`. A fix must make a toggle in one host leave the other host's stored changes intact: apply the transition to a fresh `loadMemory` read rather than the instance copy, or adopt `storage` events. The same overwrite already hit `openPath`/`clearedAt` before this plan; it now also hits the new fields.

### Minor
1. **[web-impl]** Clicking a folder while the filter is active has no visible effect, because the filtered tree already shows every matching ancestor expanded, yet it is now saved. If the developer switches away before clearing the filter, the return shows the filter empty and that folder expanded, a state they never saw. Before this change the toggle was dropped with the instance. — `web/src/features/reader.ts` `toggleFolder`. A fix must make a folder click during filtering either ignored or visible, so that what a return shows is something the developer saw.

### Notes
1. **[note]** Gates `02-test` is red on `internal/server` shell tests because the gate shell inherited `MUSTER_SESSION=9`. This is an environment or daemon-test matter, not this diff's (review-work's territory).
2. **[note]** Not measured: daemon-down toggles in the Tiles host and the pop-out. Both use the same instance code as the measured Focus cell, and the surface segments are disabled while the daemon is down, so a switch cannot happen.
3. **[note]** The committed Proof test covers only Focus with a Claude → Docs switch. Session switch, Files fold, Tiles and the pop-out-overlap case (Major 1) have no E2E coverage. Coverage is review-work's to judge.
4. **[note]** An empty directory shows a Files section with an empty tree and no words (`innerText` ""). This predates the plan; it was observed only.
5. **[note]** One rig run hit Playwright's global timeout while waiting on the gate lock, leaving a scratch tmux server (`muster e2e-Dpiycl`). I killed it with `tmux -S … kill-server` and removed the directory. Nothing of mine remains.
