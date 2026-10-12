# Review: reader-expanded-persists

**Plan**: reader-expanded-persists
**Verdict**: needs-changes
**Cycle**: 1
**Gates**: 1 failed
**Parts**: code, browser | skipped: maintainability
**Part verdicts**: code needs-changes, browser needs-changes

_Merged by orch-state.py merge-review; the verdict is computed from the parts and the gate run, never edited by hand._

## Correctness review

# Correctness review: reader-expanded-persists

**Plan**: reader-expanded-persists
**Part verdict**: needs-changes
**Cycle**: 1
**Pack**: kb: pack 14333 words (budget 30000)

The only thing blocking is the red `test` gate line (Critical 1). It is an environment leak that
already exists on `main`, and this web-only branch did not cause it. Everything the plan asks for
is implemented, tested where the plan says it should be, and matches the Doc Delta.

## Requirements

| Req | Implemented | Tested | Status |
|-----|-------------|--------|--------|
| REQ-1 expanded folders survive Claude/Shell→Docs and a session switch | Yes — `features/reader.ts:327` `toggleFolder` → `commitMemory(withFolderToggled(...))`; `:452` seeds `flattenTree` from `memory.expanded`; memory reloaded at `:166` on re-mount | Yes for the tab switch (E1, `reader.spec.ts:2449`); `withFolderToggled` + round-trip in `memory.test.ts`. The session-switch half has no E2E (Note 1) | pass |
| REQ-2 Files/Outline folds survive the same switches | Yes — `:345`/`:350` commit; `:491-492` read from memory | Yes — Outline fold in E1; both folds in `memory.test.ts` (`describe.each` toggles, independent round-trip) | pass |
| REQ-3 filter clear collapses, and the cleared state is what a later return shows | Yes — `:333-335` commits `withExpandedCleared` on an empty filter, so the clear is saved | Unit: `withExpandedCleared`. E2E: existing E7 filter-clear test (green in the sweep). Save-on-clear checked by reading the code, as the plan says | pass |
| REQ-4 older memory shape loads as nothing expanded or folded | Yes — `memory.ts` `parseMemory` defaults each field on its own (`isStringArray`, `=== true`) | Yes — older-shape, empty-object and 9-row wrong-type table, sibling-independence cases | pass |
| DIAG | `kb:diagram/web-components` (named by `kb for` on both changed files): `reader/` is described as "Markdown render, nav tree, per-session memory". Still true; no module or edge changed | — | pass |

## Build & Tests

E2E tests: pass (716/716, `16-e2e.log`) · Daemon tests (race): **FAIL** (`internal/server`, 2 tests, `02-test.log`) · Web tests: pass (2428 in 89 files) · Daemon build: pass (`01-build.log` empty, exit 0) · Web build: pass · Lint: pass (golangci 0 issues; biome clean; e2e-lint clean) · contrast, versions, kb check, features-scope, comment checks, comment ledger: pass · size: WARN `web/src/features/reader.ts` 648 lines (review-maintainability's) — all read from $GATES_LOG_DIR

## Acceptance Checks

| ID | Command | Result |
|----|---------|--------|
| E1 | `cd web && npx playwright test reader.spec.ts -g 'expanded folders and folds survive'` | pass (`17-E1.log`, 1 passed) |
| W1 | `make web-test` | pass (deduped to `05-web-test.log`, 2428 passed) |
| W2 | `make web-lint` | pass (deduped to `06-web-lint.log`) |
| W3 | `make web-build` | pass (deduped to `04-web-build.log`) |
| E2 | `make e2e` | pass (deduped to `16-e2e.log`, 716 passed) |
| gate `test` | `make test-race` | **FAIL** — Critical 1 |
| DOC | doc upkeep + Doc Delta vs what shipped | pass — the #82 block moved from `TODO.md` "On their own" to `docs/history/todo-done.md` under the same heading, ticked; no `deviation:` lines, so no ADR is owed (`kb ls --feature reader --status proposed` is empty, which is correct); the log's one `doc-delta:` line is about `web/src/reader/CLAUDE.md` and was applied in `ddbda3e8`. The Doc Delta's "becomes true" sentence matches the code: all five fields live in `muster.reader.<id>` and are shared with the pop-out, which uses the same `ReaderInstance` and key |

## Reviewer-Verified Criteria

| ID | Criterion | Result | Evidence |
|----|-----------|--------|----------|
| RV1 | Every change to the expanded set or the folds goes through one save path, and the filter clear saves too | pass | `commitMemory` (`features/reader.ts:204-207`) is the only place that assigns `this.memory` after construction and the only `saveMemory` call. `toggleFolder` (:327), `setFilter` clear (:334), `toggleFiles` (:345), `toggleOutline` (:350) and `openFile` (:311) all go through it. The old instance fields `manualExpanded`/`filesFolded`/`outlineFolded` are gone (rg finds no hits) |

## Hard-Rule Checklist

| # | Rule | Result |
|---|------|--------|
| 1 | Adapter boundary | pass — no Go change (`git diff --stat main..HEAD -- internal cmd` is empty) |
| 2 | Terminal-output state parsing | pass — n/a |
| 3 | Blocking hook handler | pass — n/a |
| 4 | Bare tmux | pass — n/a |
| 5 | Payload logging | pass — n/a |
| 6 | Empty-gauge dishonesty | pass — no gauge path touched |
| 7 | Session identity on `session_id` | pass — memory keys on the Muster session id (`muster.reader.<id>`) |
| 8 | Settings trespass | pass |
| 9 | Real `claude` outside canary/probes | pass — the E2E uses the stub (`MUSTER-STUB-READY`) |

Web-specific checks: no new dependency; no `innerHTML`; no CSS, markup or token change, so the design-token and `[hidden]` rules do not apply; no second WS client. Fixture shape matches the **Fixture plan** header: `daemon`, same as the rest of `reader.spec.ts`.

## Issues

### Critical
1. **[daemon-tests]** The `test` gate line (`make test-race`) is red:
   `TestShellRegistry_EnsurePaneEnvironmentNeverCarriesMusterSession` (`internal/server/shells_test.go:141`) and
   `TestShellRegistry_RespawnsAfterExternalKillWithNoMusterSession` (`:172`) get
   `MUSTER_SESSION=[9]` where they expect `MUSTER_SESSION=[]`.
   - **Cause.** The gate ran inside Muster session 9. My own shell shows `MUSTER_SESSION=9`. `newTestShellRegistry` (`shells_test.go:62-75`) sets `MUSTER_TEST_SHELL_LOG` and `SHELL` before the private tmux server starts, but never clears `MUSTER_SESSION`, so the server and its panes inherit it. The orchestrator measured both tests passing under `env -u MUSTER_SESSION`.
   - **Not this plan's change.** The branch touches no Go, and the failure exists on `main` whenever the suite runs from inside a Muster session.
   - **Fix.** Make the helper hermetic, e.g. `t.Setenv("MUSTER_SESSION", "")` followed by `os.Unsetenv`, or start the server with a scrubbed environment.
   - **Routing.** This is tagged by file owner as the rules require. The orchestrator intends to send it to `proposed-backlog.md` as a test-hermeticity follow-up. That is its call, but under review-scale § Verdicts the red line still makes this cycle `needs-changes` until the gate runs green, for example re-run with `MUSTER_SESSION` unset or after the helper fix.
   - **Product question.** The same mechanism means a `musterd` started from inside a Muster session hands `MUSTER_SESSION` to its shell panes, against INV-1. Whether that is worth a product fix in `shells.go` (strip the var from the spawn environment) is worth raising in the backlog entry.

### Major

None.

### Minor

None.

### Notes
1. **[note]** REQ-1's session-switch half (focus another session, come back) has no E2E. The plan's Proof only names the Claude→Docs path, and test-specs.md says so. Per the plan's Findings, both switches go through the same `reconcileInstances` dispose-and-rebuild and the same `loadMemory` at `features/reader.ts:166`, so the tab-switch test covers that code path.
2. **[note]** The Files fold has no E2E; only the Outline fold does. `toggleFiles` is one line, the same shape as `toggleOutline`, and the transition is unit-tested.
3. **[note]** This extends an existing behaviour rather than adding a regression. The dashboard and the pop-out each hold their own `this.memory` copy and write the whole object back. While both are mounted, a fold in one window followed by a folder toggle in the other makes the second write put the first window's stale `outlineFolded` back. `openPath`/`clearedAt` already work this way (kb:adr/reader-memory-split-browser-and-daemon).
4. **[note]** A filter left non-empty when the developer switches away is not a "clear". On return the filter is reset and the pre-filter expanded set shows again. This fits REQ-3 as written, which is only about an explicit clear.
5. **[note]** `web/src/reader/memory.ts:1`: the comment pass (`4a4cb564`) deleted the whole file header, including the ADR citation and the reason for keying acknowledgement on `writtenAt`. That is the comment pass's call. I mention it only because `web/src/reader/CLAUDE.md` and the ADR now carry that rationale alone.

## Browser review

# Browser review: reader-expanded-persists

**Plan**: reader-expanded-persists
**Part verdict**: needs-changes
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
