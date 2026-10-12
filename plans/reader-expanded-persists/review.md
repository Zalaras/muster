# Review: reader-expanded-persists

**Plan**: reader-expanded-persists
**Verdict**: approved
**Cycle**: 3
**Gates**: 0 failed
**Parts**: code, browser | skipped: maintainability
**Part verdicts**: code approved, browser approved

_Merged by orch-state.py merge-review; the verdict is computed from the parts and the gate run, never edited by hand._

## Correctness review

# Correctness review: reader-expanded-persists

**Plan**: reader-expanded-persists
**Part verdict**: approved
**Cycle**: 3
**Pack**: kb: pack 14333 words (budget 30000)

This is a delta cycle. Cycle 2's only open agent-tagged issue was browser Minor 1, a folder click in a host whose display is out of date. I read `git diff 107d5bd9..HEAD`. The non-test changes are in `web/src/features/reader.ts`, `web/src/reader/memory.ts` and `web/src/reader/CLAUDE.md`. All of them belong to the fix route the developer chose (the `storage` listener plus toggling from the displayed state), so I did not re-read §3–§6 beyond the diff. All 17 gate lines are green; they ran under `env -u MUSTER_SESSION` per the developer.

## Requirements

| Req | Implemented | Tested | Status |
|-----|-------------|--------|--------|
| REQ-1 expanded folders survive Claude/Shell→Docs and a session switch | Yes, unchanged from cycle 2. In cycle 3, `toggleFolder` (`features/reader.ts:334-339`) computes the target from what the host shows (`this.memory`) and commits `withFolderExpanded(m, path, expand)` to the fresh read. Every host now adopts another window's write live through `handleStorage` (`:211-215`), which is registered once in `initReader` (`:623-625`) | E1. The two cycle-2 shared-memory tests. Two new tests: "live adoption" (`reader.spec.ts:2688`) and "stale display" (`:2739`). Per test-specs.md, both failed against the cycle-2 `reader.ts`/`memory.ts` and pass now. Unit tests cover `withFolderExpanded` (6) and `isMemoryWrite` (8 rows) | pass |
| REQ-2 Files/Outline folds survive the same switches | Yes. `toggleFiles`/`toggleOutline` (`:354-364`) now set the value the host shows, inverted, through `withFilesFolded`/`withOutlineFolded` | E1, plus the shared-memory tests. Unit tests: `withFilesFolded`/`withOutlineFolded` cover all four before/after combinations and leave other fields untouched | pass |
| REQ-3 filter clear collapses, and the cleared state is what a later return shows | Unchanged. The `filterQuery` guard is still the first line of `toggleFolder` | Unchanged (E7 and the cycle-2 filter test) | pass |
| REQ-4 older memory shape loads as nothing expanded or folded | Unchanged. `parseMemory` is untouched. `handleStorage` adopts through the same `loadMemory`, so a foreign shape written by another window degrades the same way | Unchanged tables | pass |
| DIAG | `kb:diagram/web-components`. `reader/` is still "Markdown render, nav tree, per-session memory". A window-level listener inside `features/reader.ts` adds no module and no edge | — | pass |

## Build & Tests

E2E tests: pass (721/721, `16-e2e.log`) · Daemon tests (race): pass (24 `ok`, 0 FAIL, `02-test.log`, `MUSTER_SESSION` unset per the developer) · Web tests: pass (2449 in 89 files, `05-web-test.log`) · Daemon build: pass (`01-build.log` empty) · Web build: pass (`04-web-build.log`) · Lint: pass (golangci 0 issues, biome clean, e2e-lint clean) · contrast 0 failures; versions fresh; e2e-honest clean; kb check 0 problems; features-scope ok; comment checks and ledger clean · size: WARN `web/src/features/reader.ts` 664 lines (review-maintainability's) · all read from $GATES_LOG_DIR

No flake repair this cycle (test-specs.md: "Repairs: None"), so no soak was owed. The e2e agent ran the four shared-memory/adoption tests at `--repeat-each=10` and got 40 passed.

## Acceptance Checks

| ID | Command | Result |
|----|---------|--------|
| E1 | `cd web && npx playwright test reader.spec.ts -g 'expanded folders and folds survive'` | pass (`17-E1.log`, 1 passed) |
| W1 | `make web-test` | pass (deduped to `05-web-test.log`, 2449 passed) |
| W2 | `make web-lint` | pass (deduped to `06-web-lint.log`) |
| W3 | `make web-build` | pass (deduped to `04-web-build.log`) |
| E2 | `make e2e` | pass (deduped to `16-e2e.log`, 721 passed) |
| gate `test` | `make test-race` | pass (`02-test.log`) |
| DOC | doc upkeep + Doc Delta vs what shipped | pass. The logs have no `deviation:` line. The cycle-3 `doc-delta:` line (impl log :66) targets `web/src/reader/CLAUDE.md`, and the new invariant line is in the diff. The plan's Doc Delta ("expanded folders and the Files/Outline folds are remembered per session in the browser") is still exactly true. The reader spec's "the pop-out … sharing … that memory" (`docs/features/reader/spec.md:69-70`) is now true live, not only on the next write. Nothing in the delta needs to change (Note 1) |

## Reviewer-Verified Criteria

| ID | Criterion | Result | Evidence |
|----|-----------|--------|----------|
| RV1 | Every change to the expanded set or the folds goes through one save path, and the filter clear saves too | pass | `saveMemory` is still called only from `commitMemory`. All five writers pass a transition to it. `handleStorage` assigns `this.memory` from storage but never writes, so it is an adoption and not a change. The filter clear is unchanged |

## Hard-Rule Checklist

| # | Rule | Result |
|---|------|--------|
| 1 | Adapter boundary | pass (no Go change) |
| 2 | Terminal-output state parsing | pass (n/a) |
| 3 | Blocking hook handler | pass (n/a) |
| 4 | Bare tmux | pass (n/a) |
| 5 | Payload logging | pass (n/a) |
| 6 | Empty-gauge dishonesty | pass (no gauge path touched) |
| 7 | Session identity on `session_id` | pass (`isMemoryWrite` keys on the Muster session id via `keyFor`) |
| 8 | Settings trespass | pass |
| 9 | Real `claude` outside canary/probes | pass (the new tests use the stub fixture) |

Web checks on the delta: no new dependency, no `innerHTML`, no second WS client, and no markup, CSS or token change. There is one `storage` listener in `initReader`, beside the existing `focus` listener, and none in `main.ts`. Removal events (`newValue === null`) and `clear()` (null key) are ignored. That is correct because `sessionRemoved` already disposes the instance.

## Delta

| Prior Minor | Fix commit | Verified how |
|-------------|------------|--------------|
| cycle 2 browser Minor 1 `[web-impl]` "A folder click in a host whose display is out of date does nothing visible, and it stores the opposite" | `252ddced` (fix), `c17427e6` (dead `*Toggled` helpers dropped), `7140e44c` + `0483c21b` (tests) | Read the diff. The browser review asked for either of two fixes, and both are present. (a) A live `storage` listener adopts the other host's write and re-renders, so displays stay current; the "live adoption" E2E asserts that the pop-out's `adr/` goes `aria-expanded=false` with no click. (b) The toggle target comes from the displayed state, so a click on a stale display does what it shows; the "stale display" E2E defeats the event and asserts collapse with `["docs"]` stored. Both were red against the cycle-2 sources, per test-specs.md's red proof. The side symptom (an unrelated Outline toggle making the tree jump open) is gone: the tree now adopts on the event, before any click. Scope: the Files/Outline toggles got the same display-based treatment. That is the same defect class, and the change goes no further |

## Issues

### Critical

None.

### Major

None.

### Minor

None.

### Notes
1. **[note]** The impl log's cycle-3 `doc-delta:` line suggests the plan's Doc Delta line about shared memory should say "live". The plan's Doc Delta has no shared-memory line. The spec's existing sentence ("the pop-out … sharing … that memory") stays true and is now stronger in practice, so doc-reconcile has nothing to promote beyond what is already there.
2. **[note]** Carried from cycle 2: the doc comment at `web/src/reader/memory.ts:47-48` says a throwing storage or foreign shape "yields the empty default". It yields `fallback`, which is empty only when the caller omits it. `web/src/reader/CLAUDE.md`'s "defaulting to empty" has the same slant. Both are still true of the default.
3. **[note]** `handleStorage` adopts `clearedAt` too, so a change dot acknowledged in one window clears in the other. The impl log records this as a design decision, and it follows from the shared memory. Whether it reads well on screen is review-browser's call.
4. **[note]** The "stale display" test overrides `StorageEvent.prototype.key` in the pop-out to hold that host stale. This is setup only, and the click, the collapse and the stored value are real-user paths. It stands in honestly for an event that has not landed yet.
5. **[note]** Carried from cycle 1: REQ-1's session-switch half and the Files fold have no dedicated E2E. They share the dispose-and-rebuild `loadMemory` path that E1 covers.

## Browser review

# Browser review: reader-expanded-persists

**Plan**: reader-expanded-persists
**Part verdict**: approved
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
