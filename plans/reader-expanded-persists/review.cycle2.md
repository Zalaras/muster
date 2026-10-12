# Review: reader-expanded-persists

**Plan**: reader-expanded-persists
**Verdict**: needs-changes
**Cycle**: 2
**Gates**: 0 failed
**Parts**: code, browser | skipped: maintainability
**Part verdicts**: code approved, browser needs-changes

_Merged by orch-state.py merge-review; the verdict is computed from the parts and the gate run, never edited by hand._

## Correctness review

# Correctness review: reader-expanded-persists

**Plan**: reader-expanded-persists
**Part verdict**: approved
**Cycle**: 2
**Pack**: kb: pack 14333 words (budget 30000)

This is a full cycle, not a delta: cycle 1 left a Critical and a browser Major open. All 17 gate
lines are green. On the developer's instruction they ran with `env -u MUSTER_SESSION`, and the
hermeticity fix is in `proposed-backlog.md`. Both cycle 1 browser findings are fixed and now have
E2E tests that would fail without the fix. I soaked the two flake-prone shared-memory tests at
N=10 and both were green (20/20).

## Requirements

| Req | Implemented | Tested | Status |
|-----|-------------|--------|--------|
| REQ-1 expanded folders survive Claude/Shell→Docs and a session switch | Yes. `toggleFolder` (`features/reader.ts:327-331`) goes through `commitMemory`, and the render seeds `flattenTree` from `memory.expanded` (`:454`). Memory is reloaded on re-mount (`:166`). New in cycle 2: `commitMemory` (`:204-208`) applies each transition to a fresh `loadMemory(localStorage, id, this.memory)` read, so a write from the dashboard and a write from the pop-out keep each other's fields | Yes. E1 (`reader.spec.ts:2449`) covers the tab switch. The two shared-memory tests (`:2505`, `:2572`) failed against the pre-fix code per test-specs.md and pass now; soaked 20/20. The session-switch half has no E2E (Note 1) | pass |
| REQ-2 Files/Outline folds survive the same switches | Yes, `:345-353` through `commitMemory`; read at `:493-494` | E1 (Outline fold); both shared-memory tests assert that the pop-out's Outline fold survives; `memory.test.ts` transition suites | pass |
| REQ-3 filter clear collapses, and the cleared state is what a later return shows | Yes. `setFilter` (`:333-339`) commits `withExpandedCleared` on every empty filter, with no guard on the possibly stale instance copy. `toggleFolder` now returns early while a filter is typed (`:328`), so a click with no visible effect is no longer saved (cycle 1 browser Minor 1) | Existing E7 filter-clear test; the new filter test (`:2633`) failed against the pre-fix code (Repairs row 3) and passes now; unit `withExpandedCleared` | pass |
| REQ-4 older memory shape loads as nothing expanded or folded | Yes. `parseMemory` (`memory.ts:34-45`) defaults each field on its own. The fallback argument does not change this: a stored entry that parses ignores the fallback | older-shape and wrong-type table; `loadMemory — fallback argument` case "ignores the fallback when a stored entry parses" | pass |
| DIAG | `kb:diagram/web-components` (from `kb for web/src/features/reader.ts`). `reader/` is still "Markdown render, nav tree, per-session memory"; no module or edge changed in cycle 2 | — | pass |

## Build & Tests

E2E tests: pass (719/719, `16-e2e.log`) · Daemon tests (race): pass (24 `ok` packages, no FAIL, `02-test.log`, run under `env -u MUSTER_SESSION` per the developer) · Web tests: pass (2433 in 89 files, `05-web-test.log`) · Daemon build: pass (`01-build.log` empty) · Web build: pass (`04-web-build.log`) · Lint: pass (golangci 0 issues; biome clean; e2e-lint clean) · contrast 0 failures, versions fresh, e2e-honest clean, kb check 0 problems, features-scope, comment checks and comment ledger clean · size: WARN `web/src/features/reader.ts` 650 lines (review-maintainability's) · all read from $GATES_LOG_DIR

Flake soak (Repairs row 2 names an intermittent red that the ```checks block does not soak): `make e2e-soak SPEC=reader.spec.ts N=10 GREP='shared memory'` → `20 passed (20.3s)`.

## Acceptance Checks

| ID | Command | Result |
|----|---------|--------|
| E1 | `cd web && npx playwright test reader.spec.ts -g 'expanded folders and folds survive'` | pass (`17-E1.log`, 1 passed) |
| W1 | `make web-test` | pass (deduped to `05-web-test.log`, 2433 passed) |
| W2 | `make web-lint` | pass (deduped to `06-web-lint.log`) |
| W3 | `make web-build` | pass (deduped to `04-web-build.log`) |
| E2 | `make e2e` | pass (deduped to `16-e2e.log`, 719 passed) |
| gate `test` | `make test-race` | pass (`02-test.log`; `MUSTER_SESSION` unset per the developer's decision, backlog entry filed in `proposed-backlog.md`) |
| DOC | doc upkeep + Doc Delta vs what shipped | pass. The #82 block was moved, ticked, to `docs/history/todo-done.md` under "On their own". The logs have no `deviation:` line and `kb ls --feature reader --status proposed` is empty, which is consistent. The one `doc-delta:` line, about `web/src/reader/CLAUDE.md`, was applied in `ddbda3e8`. The Doc Delta's "becomes true" sentence matches the code: all five fields live in `muster.reader.<id>`, and the spec's statement that the pop-out shares that memory now holds for writes from both hosts |

## Reviewer-Verified Criteria

| ID | Criterion | Result | Evidence |
|----|-----------|--------|----------|
| RV1 | Every change to the expanded set or the folds goes through one save path, and the filter clear saves too | pass | `this.memory` is assigned only at construction (`:166`) and in `commitMemory` (`:206`). `saveMemory` is called only from `commitMemory` (`:207`). All five writers (`openFile` :312, `toggleFolder` :329, `setFilter` clear :336, `toggleFiles` :347, `toggleOutline` :352) pass a transition to it. The clear now saves unconditionally |

## Hard-Rule Checklist

| # | Rule | Result |
|---|------|--------|
| 1 | Adapter boundary | pass — no Go change (`git diff --stat main..HEAD -- internal cmd` is empty) |
| 2 | Terminal-output state parsing | pass — n/a |
| 3 | Blocking hook handler | pass — n/a |
| 4 | Bare tmux | pass — n/a |
| 5 | Payload logging | pass — n/a |
| 6 | Empty-gauge dishonesty | pass — no gauge path touched |
| 7 | Session identity on `session_id` | pass — memory keys on the Muster session id |
| 8 | Settings trespass | pass |
| 9 | Real `claude` outside canary/probes | pass — the new tests use the stub (`MUSTER-STUB-READY`) |

Web checks: no new dependency, no `innerHTML`, no `storage` listener or second WS client added, and no markup, CSS or token change, so the design-token and `[hidden]` rules do not apply. Fixture shape matches the **Fixture plan** header (`daemon`, plus `context` for the pop-out, as the file's existing pop-out tests use).

Test honesty: Repairs row 1 is setup only. Row 2 adds settle waits and a retried `localStorage` read (`expect.poll`) with no fixed sleep, and the final assertions are unchanged. Row 3 changed the scenario to the reviewer's, and the test then failed against the pre-fix code. No assertion was deleted, skipped or weakened. The new tests assert `aria-expanded` and specific entries, not container visibility.

## Issues

### Critical

None.

### Major

None.

### Minor

None.

### Notes
1. **[note]** Carried from cycle 1: REQ-1's session-switch half and the Files fold have no E2E. Both go through the same dispose-and-rebuild and `loadMemory` path that E1 covers, and the plan's Proof names only the Claude→Docs switch.
2. **[note]** `web/src/reader/memory.ts:47-48`: the `loadMemory` doc comment says a throwing storage or foreign shape "yields the empty default". It now yields `fallback`, which is empty only when the caller omits it. `features/reader.ts:205` passes the instance's own memory. `web/src/reader/CLAUDE.md`'s invariant "defaulting to empty" has the same slant. It is still true of the default, so this is not a false statement.
3. **[note]** For browser: under the fresh-read merge, a host keeps showing its own copy until its next write. That write then adopts the other host's fields. For example, the pop-out folds Outline, the dashboard then clicks a folder, and the dashboard's Outline folds at that moment. This follows from the shared memory the spec describes, and the impl log records it. Whether it reads well on screen is review-browser's call.
4. **[note]** test-specs.md's handoff points out that two hosts writing within the same few milliseconds can still read a stale copy, because Chromium propagates `localStorage` between renderers asynchronously. A person cannot hit that by hand. Adopting `storage` events would close it if that is ever wanted.

## Browser review

# Browser review: reader-expanded-persists

**Plan**: reader-expanded-persists
**Part verdict**: needs-changes
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
