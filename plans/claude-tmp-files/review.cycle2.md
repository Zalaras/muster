# Review: claude-tmp-files

**Plan**: claude-tmp-files
**Verdict**: needs-changes
**Cycle**: 2
**Gates**: 0 failed
**Parts**: code, browser | skipped: maintainability
**Part verdicts**: code approved, browser needs-changes

_Merged by orch-state.py merge-review; the verdict is computed from the parts and the gate run, never edited by hand._

## Correctness review

# Correctness review: claude-tmp-files

**Plan**: claude-tmp-files
**Part verdict**: approved
**Cycle**: 2
**Pack**: kb: pack 67198 words (budget 30000)

Delta re-review over the cycle-1 review commit e304d5f0 to the tip of plan/claude-tmp-files (15 commits, 22f2e399 to 4f8c504c). §1–§2 in full; §3–§6 on the files that diff touches.

## Requirements

| Req | Implemented | Tested | Status |
|-----|-------------|--------|--------|
| REQ-1 | Yes — unchanged since cycle 1 (`claudecode.wellFormedScratchpad`) | Yes | pass |
| REQ-2 | Yes — unchanged | Yes — now from every source state: unbound, bound, /clear, straggler, never-had id, dead with a left id, dead with an unknown id; resume A→B→A moves the folder back and broadcasts (`internal/session/reader_scratchpad_test.go`) | pass |
| REQ-3 | Yes — `wireScratchpadDir` now returns a copy (`internal/server/readerwire.go:69`) | Yes — plus `TestWireScratchpadDir_ReturnsACopy` | pass |
| REQ-4 | Yes — unchanged | Yes | pass |
| REQ-5 | Yes — unchanged (`Scope.Confine`) | Yes | pass |
| REQ-6 | Yes — unchanged | Yes | pass |
| REQ-7 | Yes — the `tmp` chip now comes from the template in `index.html`/`doc.html`; presence via `setPresence(..., "after")`; still removed at 0 | Yes — W2, R1/R3/R7, E2E | pass |
| REQ-8 | Yes — unchanged | Yes | pass |
| REQ-9 | Yes — scratch row age is now bare `formatAge` (`web/src/features/reader.ts:545`), per the amended REQ-9 and kb:adr/reader-scratch-row-age-bare; the plan row keeps `ageAgo` | Yes — `web/render/reader-scratch.spec.ts` asserts bare buckets (`now`, `<n>m`) against the test clock; the shared-column property is tested at Focus 900/600/450/360 and in a 3×2 tile at 900/600 | pass |
| REQ-10 | Yes — unchanged | Yes | pass |
| REQ-11 | Yes — the re-scan policy moved, unchanged, to `createScratchTracker` (`web/src/features/readerscratch.ts`) | Yes — `readerscratch.test.ts` (10 cases) plus the existing `reader/claude.test.ts` and E2E E2/E3 | pass |
| REQ-12 | Yes — unchanged | Yes | pass |
| REQ-13 | Yes — unchanged | Yes | pass |
| DIAG | `kb:diagram/store-schema` (now has `scratchpad_dir`, 0001-0020: pass); `kb:diagram/web-components` (`reader/` 13 modules and the `reader → api` edge: pass; `features/` stale, Major 1) | — | fail — `features/` count and reader sub-controllers (Major 1, `[orchestrator]`) |

## Build & Tests

E2E tests: pass (272, scoped to 27 files incl. `reader-scratch.spec.ts`, `21-e2e.log`) · Daemon tests (race): pass (`02-test.log`, 9 packages `ok`; `22-D1.log` every package `ok`) · Web tests: pass (112 files, 3267 tests) · Daemon build: pass (`01-build.log` empty) · Web build: pass · Lint: pass (`03-lint.log` "0 issues."; `09-web-lint.log` "No fixes applied.") — all read from the gate log dir. Render: 494 passed. Size WARNs (`19-size.log`, 11 hits) are review-maintainability's.

## Acceptance Checks

| ID | Command | Result |
|----|---------|--------|
| D1 | `make test` | pass (`22-D1.log`) |
| D2 | `go build ./...` | pass (deduped to the gates' build line) |
| D3 | `make lint` | pass ("0 issues.", `03-lint.log`) |
| D5 | `make check-render-fixtures` | pass ("render fixtures up to date (116 scenarios)") |
| W1 | `make web-build` | pass (`04-web-build.log`) |
| W2 | `make web-test` | pass (3267/3267) |
| R1 | `make render-test` | pass (494 passed) |
| E1 | `make e2e` | pass, scoped (272 passed); the full sweep runs at Completion |
| gate | web-lint / contrast / e2e-lint / render-lint / kb check / versions / comments / comment-ledger / features / e2e-honest | pass |
| DOC | doc upkeep + Doc Delta vs what shipped | pass with one `[orchestrator]` Major: ADR pointers fixed, store-schema fixed, `doc-delta.md` carries the web clauses, the `.md`-only wording and the ingest row (each checked against the code: `wellFormedScratchpad` is exactly "absolute, clean, `scratchpad` under a parent named for `session_id`"); `ingest` promoted to Features. Open: `kb:diagram/web-components` `features/` is stale after `readerscratch.ts` (Major 1). |

## Reviewer-Verified Criteria

| ID | Criterion | Result | Evidence |
|----|-----------|--------|----------|
| V1 | no `any` in new web code | pass | `readerscratch.ts` and its test, and the `render/reader.ts` and `features/reader.ts` hunks, have no `any` |
| V2 | summary row, chips, `tmp` badge, row ages match the mockup | pass | row ages are now bare buckets as in the mockup; the badge and the chips-when-unfolded deviations stand under kb:adr/reader-scratch-badge-neutral-not-teal and kb:adr/reader-claude-chips-stay-when-unfolded. Measuring it visually is review-browser's job. |
| V3 | `scratchpad_dir` read only in `internal/claudecode`, one owner of well-formedness | pass | the delta adds no reader of the field; `wellFormedScratchpad` is unchanged |
| V4 | no new watcher or poll | pass | `createScratchTracker` decides only on `observeSession` (render), `docChangedNeedsRescan` (the `docChanged` handler) and `listingApplied`/`rescanStarted`; it has no timer or watcher |

## Hard-Rule Checklist

| # | Rule | Result |
|---|------|--------|
| 1 | Adapter boundary | pass — the delta adds no Claude-Code-format knowledge outside `internal/claudecode` |
| 2 | No terminal-output state parsing | pass |
| 3 | Non-blocking hook handler | pass — the hook path is untouched |
| 4 | tmux via `-L muster` / sizing | pass — no tmux touched |
| 5 | No payload logging | pass |
| 6 | Empty-gauge honesty | pass — the `tmp` chip is still removed at 0 (`setPresence` with `vm.tmpChip !== null`), never `0 tmp` |
| 7 | Identity on tmux target | pass |
| 8 | No settings trespass | pass — the render scenario transcript moved from `/tmp` to under the rig root |
| 9 | No real `claude` outside canary | pass — the canary file changed only on main (f348e7b5, `require.NoError`) |

## Delta

| Prior issue (id) | Status | Fix commit | Verified how |
|---|---|---|---|
| Critical 1 `web/src/api/reader.test.ts:format:web-lint-red` `[web-tests]` | resolved | `d0252ac9` | diff is formatting only, no assertion changed; `09-web-lint.log` "No fixes applied." |
| Critical 2 `test/canary/resume_test.go:240:require-error` `[daemon-tests]` | resolved | `561c89c5` (main, merged) | `test/canary/resume_test.go:240` reads `require.NoError`; `03-lint.log` "0 issues." |
| Major 1 `internal/session/reader_scratchpad_test.go:TestSetScratchpad_ClaudeSessionIDGate:missing-resume-dead-unbound` `[daemon-tests]` | resolved | `3ccf7b67` | the table runs on `newDeathHarness` and has unbound, dead-left-id and dead-unknown-id rows. Each asserts no change and no broadcast; `kill` requires `!Alive`. The straggler row now presets folder B, so "unchanged" is no longer vacuous. New `TestSetScratchpad_ResumeRebindMovesFolderBackAndBroadcasts` checks A→B→A moves back with one broadcast carrying folder A |
| Major 2 `docs/diagrams/store-schema.md:session:missing-scratchpad_dir` `[orchestrator]` | resolved | `22f2e399` | the summary and body read 0001-0020; `TEXT scratchpad_dir "0020, …"` added |
| Major 3 `docs/diagrams/web-components.md:reader:module-count-and-api-edge` `[web-impl]` | resolved | `22f2e399` | `reader/` reads "13 modules" (13 non-test `.ts` counted); `Rel(reader, api, "listing type")` drawn. A later fix-wave file made the `features/` box stale: new Major 1 |
| Major 4 `internal/reader/CLAUDE.md:Scope:two-paths-claim` `[daemon-impl]` | resolved | `8e220c15` | Owns names the scratchpad directory and `ListScratch`; the `Confine` invariant names the three roots, matching `internal/reader/reader.go:52-81` |
| Major 5 `plans/claude-tmp-files/plan.md:Doc Delta:missing-web-doc-delta` `[orchestrator]` | resolved | `22f2e399` | `doc-delta.md` reader line carries both clauses with their ADRs |
| Major 6 `plans/claude-tmp-files/implementation-logs:Decisions:adr-pending` `[orchestrator]` | resolved | `22f2e399` | all four `deviation:` lines point at `kb:adr/…` records, all `proposed` with `refs: plan:claude-tmp-files` |
| Decision 1 row age text | resolved | `44d58ad8`, `47129db8` | consensus for option A (bare `formatAge`), kb:adr/reader-scratch-row-age-bare; REQ-9/W4 amended; code and render tests follow |

No `counter:`/`refute:` in the prompt.

## Issues

### Critical
None.

### Major
### Minor
1. **[web-impl]** The Files header's folder path is now clamped to one line in every host, not just compact tiles: `.rnav .hd .dir` has `-webkit-line-clamp: 1; overflow: hidden` (`web/src/style.css:1808-1816`). Before this, the #67 fix wrapped the full path inside the panel, and `docs/history/todo-done.md` records "the files header's directory path wrap[s] inside the panel". Focus and the pop-out now show one ellipsized line, with the full path in the `title` only. Fix Attempt 3 logs this as a fix step but records no `deviation:` line, so no ADR records the change to #67's behaviour. A fix adds a `deviation:` line to `web-implementation.md` § Decisions, and the orchestrator then writes its ADR. The only new render test for the clamp asserts it in a compact tile; the existing #67 test checks only that the header stays inside the nav, which a clamp also satisfies.
   id: web/src/style.css:.rnav .hd .dir:unlogged-clamp-all-hosts | confidence: 85

### Notes
1. **[note]** For review-browser: the amended Views criterion ("each keep a scrollable box in every host whose nav is taller than its fixed rows") is met literally, but thinly. `render-tests.md` measures the Outline at 2 px in the 3×2 tile at 600 px and at 1 px in Focus at 360 px. `expectReachable` passes such a box because it accepts a row that is only partly inside. Whether a 1–2 px box is usable is an observed property, not a statement I can settle.
2. **[note]** `docs/features/reader/spec.md` gained `readerscratch*.ts` in its `web:` glob (`f884afef`), before doc-reconcile. This is a registry edit `check-kb` requires, not a behaviour claim; doc-reconcile should expect it.
3. **[note]** Cycle 1 Notes 2 and 3 (a dead session with a removed directory serves no scratch; one extra listing GET on a `docChanged` during a silent re-scan) are unchanged by this delta and still hold.

## Browser review

# Browser review: claude-tmp-files

**Plan**: claude-tmp-files
**Part verdict**: needs-changes
**Cycle**: 2
**Pack**: kb: pack 12898 words (budget 30000)
**Rig**: `make web-build build` at 4f8c504c; scratch daemon from `web/e2e/helpers/fixtures.ts` (data dir `TMPDIR/muster e2e-<id>-*`, space-bearing, private `-tmux-socket` inside it, killed and removed at teardown); stub `claude` (`helpers/daemon.ts`); headless Chromium via a throwaway spec (2 tests, foreground, 46 s, spec deleted; the working tree shows nothing of this reviewer).

Gates log read, not re-run: 0 failed lines; `04-web-build` green, `21-e2e` 272 passed. The app driven is the one that ships.

Scenario: a session directory holding the 20-file large tree plus `0-outline.md` (30 headings, opened so the Outline is full), a transcript-located plan, and a scratchpad of 30 `.md` files aged now / 2 min / 1 h / 2 d / older. A second session starts with an empty scratchpad and no plan, then gets one file by hook. "Reach" below = a real mouse wheel over the box, then the last row is measured inside the box and `elementFromPoint` at its centre hits it. Box figures are clientHeight/scrollHeight in px.

## Delta

| Prior issue | Fix commit | Verified how |
|---|---|---|
| browser Major 1 (unfolded claude section starves tree and Outline to 0) | 47129db8, 40bf9844 (bar amended by d70a0143, kb:adr/reader-nav-too-short-for-fixed-rows-out-of-scope) | Fixed for the zero-height case: in every in-scope host the tree, Outline and scratch rows each keep a non-zero box whose last row is reached by wheel and hit-tested (matrix rows "Major 1 re-measure"). Not usable in every in-scope host: a 2x2 or 3x2 tile in a 600 px window leaves the tree 8 px against 15 px rows (browser Major 2). Folded, a new empty 22 px strip takes height from both (browser Major 1). |
| browser Note 1 (rows read `3m ago`) | 44d58ad8 decision, 47129db8 | Rows read bare `now`, `2m`, `1h`, `2d`, `7d` in Focus, 2x2 and 3x2; plan row `now`. |

## Matrix

Surfaces touched since e304d5f0: `.rnav` section heights (`style.css` plan slot, scratch rows, compact padding, one-line Files header), the tmp chip from the template (`index.html`, `doc.html`, `render/reader.ts`), bare row age, the scratch loading row helper.

| Req | Host | State | Claim | Result | Evidence |
|-----|------|-------|-------|--------|----------|
| Major 1 re-measure | focus 900 | data, unfolded | tree, Outline, scratch each keep a scrollable box | pass | nav 773; tree 240/441, Outline 354/651, scratch 22/690; last row of each reached, 21/21/22 px visible, hit true |
| Major 1 re-measure | focus 600 | data, unfolded | same | pass | nav 473; tree 119/441, Outline 175/651, scratch 22/690; all reached, hit true |
| Major 1 re-measure | focus 360 | data, unfolded | same | pass (one row each) | nav 233; tree 22/441 (one 21 px row), Outline 32/651 (1.5 rows), scratch 22/690; all reached, hit true |
| Major 1 re-measure | pop-out 900 / 600 / 360 | data, unfolded | same | pass | tree 279 / 158 / 61, Outline 413 / 234 / 91, scratch 22 each; all reached, hit true |
| Major 1 re-measure | tiles 2x2 900, 3x2 900 | data, unfolded | same | pass | nav 314; tree 57/315, Outline 118/651, scratch 22/630; all reached |
| Major 1 re-measure | tiles 2x2 750, 3x2 750 | data, unfolded | same | pass | nav 239; tree 33/315 (2 rows of 15), Outline 68/651, scratch 22/630; all reached |
| Major 1 re-measure | tiles 2x2 600, 3x2 600 | data, unfolded | tree and Outline usable | FAIL | nav 164 (fixed rows 138, so in scope); tree 8/315 against 15 px rows, Outline 17/651 against 21 px rows; reachable by wheel, but no row is ever fully visible (browser Major 2) |
| Major 1 re-measure | tiles 3x2 600 | data, folded | folded section leaves its height to tree and Outline | FAIL | `.scratch-rows` 22/22 with 0 children still occupies y 172-194; tree 15/315, Outline 31/651 (browser Major 1) |
| Major 1 re-measure | focus 900 | data, folded | same | FAIL | `.scratch-rows` 22 px tall, 0 children, between summary row (127-156) and Files header (191) |
| Major 1 re-measure | focus 600 | empty scratchpad, unfolded | no empty scratch box | FAIL | `.scratch-rows` 22/22, 0 children, under `no plan yet` |
| Major 1 re-measure | tiles 3x2 600 | daemon-down | | N/A - out of scope by kb:adr/reader-nav-too-short-for-fixed-rows-out-of-scope (Note 2) | banner pushes the tile: tree 8 to 0, Outline 17 to 0, 30 scratch rows kept |
| REQ-9 amended | focus, tiles 2x2, tiles 3x2 | data | bare age | pass | first rows `now`, `2m`, `1h`, `2d`, then `7d`; plan row `now`; no `ago` anywhere |
| REQ-9 amended | focus | one late file | bare age on a hook-added row | pass | `late.md` row reads `now` |
| REQ-9 | focus 900 / 600 | data, unfolded | scratch row fully visible in its box | FAIL (1 px) | row 23 px in a 22 px box: 22 of 23 px visible; a single scratch file scrolls by 1 px (sh 23, ch 22) (browser Minor 1) |
| REQ-7 | focus | data | chips `plan` then `30 tmp` | pass | `["plan","30 tmp"]` |
| REQ-7 | focus | empty scratchpad, no plan | dimmed `no plan`, no tmp chip in the DOM | pass | chips `[no plan, class chip off, display block]`; `[data-role=tmp-chip]` count 0 |
| REQ-7/REQ-11 | focus | first scratch file by hook | tmp chip appears after the plan chip | pass | `["no plan","1 tmp"]` |
| REQ-8 | focus | data, unfolded | keyboard focus on a scratch row survives a render tick | pass | Tab to `f-00.md` row; same connected node after 1.2 s |
| Files header | focus, pop-out, tiles | data | long directory clamped to one line, full path kept | pass | `.hd .dir` 11 px tall (scrollHeight 44); full path in `title`; header 25 px (Focus), 19 px (compact) |
| compact padding | tiles 2x2, 3x2 | data | trimmed fixed rows inside nav | pass | summary 23 px, header 19 px (Focus 29 / 25) |
| daemon down | tiles 3x2 | daemon-down | surfaced loudly, rows kept | pass | `#banner` display block, `musterd unreachable - hook output ...`; 30 scratch rows still rendered |
| no data yet (loading row) | all | listing in flight | | N/A - outside the delta in behaviour (helper renamed only); not re-driven (Note 3) | |
| design-system 6 | all | all | no 0% track, cost, Done or unaged stale state | pass | every scratch and plan row carries its age; nothing added |
| design-system 7 | all | all | | N/A - no terminal surface touched | |

## Issues

### Critical

### Major
1. **[web-impl]** An empty `.scratch-rows` keeps a 22 px blank strip whenever it holds no rows: with the section folded (the default), and unfolded on a session with no scratch files. It sits between the summary row and the Files header and takes its height from the tree and the Outline, which are the boxes that are short: folded in a 3x2 tile at 600 px the tree gets 15 px (exactly one row) and the Outline 31 px with 22 px of that nav blank above them. Measured: Focus 900 folded `.scratch-rows` 22/22 with 0 children at y 156-178; tiles 3x2 600 folded 22/22 at 172-194; Focus 600 empty scratchpad unfolded 22/22. Cause: the `min-height: 22px` on `.rnav .scratch-rows` applies to the empty container. `web/src/style.css:2088`. A fix must make true: with no scratch row rendered (folded, or nothing to list) `.scratch-rows` has a 0 px box in every host, and the one-row floor applies only while rows exist. No committed render test could have failed for this: the large-fixture cases measure the unfolded state.
   id: web/src/style.css:.rnav .scratch-rows:empty strip when folded | confidence: 95
2. **[orchestrator:decision]** In a 2x2 or 3x2 tile in a 600 px window, which the amended bar keeps in scope (nav 164 px, fixed rows 138 px), the unfolded section leaves the tree 8 px against 15 px rows and the Outline 17 px against 21 px rows. Both are non-zero and reachable by wheel, which meets the letter of the amendment, but neither ever shows one whole row, so neither can be read. render-tests saw the same host with the Outline at 2 px. At 750 px the same tiles give tree 33 and Outline 68, which is usable. The no-floor ADR (kb:adr/reader-nav-sections-shrink-without-floor) stays binding either way.
   - **Option A - accept**: widen kb:adr/reader-nav-too-short-for-fixed-rows-out-of-scope to "a nav too short to give each section one whole row", covering the 600 px tile, and leave it to the tile-view overhaul.
   - **Option B - one whole row**: make the bar "tree and Outline each show at least one whole row in every tile at 600 px or taller, section unfolded", and win the space back from fixed rows without a floor (Major 1 frees 22 px folded only; unfolded needs more, such as the plan row and scratch rows sharing one compact scroller in tiles).
   id: web/src/style.css:.rnav compact:tree and outline under one row at 600px tiles | confidence: 85

### Minor
1. **[web-impl]** The scratch floor is 22 px but a Focus and pop-out scratch row is 23 px, so the visible row is clipped by 1 px and a session with exactly one scratch file gets a 1 px scrollable box (scrollHeight 23, clientHeight 22). Compact rows are 21 px, so the same floor is fine there. `web/src/style.css:2088`. A fix must make true: the floor equals one row in each host (Focus/pop-out and compact).
   id: web/src/style.css:.rnav .scratch-rows:min-height below row height | confidence: 90

### Notes
1. **[note]** In Focus at 900 px, with the 30-heading document open, the unfolded scratch list shows exactly one of 30 rows (22 px box) while the tree has 240 px and the Outline 354 px. This is the shipped rule doing what it says (`flex: 0 1000 auto`, scratch yields first, per the context of kb:adr/reader-nav-too-short-for-fixed-rows-out-of-scope), and its `max-height: 40%` never comes into play while either other section overflows. No change requested here; if the developer wants the scratch list readable in Focus, that is a separate placement decision.
2. **[note]** Daemon-down in a 3x2 tile at 600 px: the banner shortens the tile and the tree and Outline both go from 8 / 17 px to 0. The nav is then shorter than its fixed rows, which the amended bar puts out of scope; recorded, not filed.
3. **[note]** Not re-driven: the scratch loading row (listing held in flight) and the ended pop-out. The loading row change is a helper rename (`buildLoadingRow`) with the same class and text; cycle 1 measured both states.
4. **[note]** 2x2 and 3x2 with one session give the same tile box (host 346 / 271 / 196 px at 900 / 750 / 600), so the two densities share every figure above.

## Struck by critic

- code Major: 1. **[orchestrator]** `kb:diagram/web-components` is stale for `features/`. It reads "51 modules" and lists reader's sub-controllers as "readerfind, readerscroll" (`docs/diagrams/web-components.md:50`), but `features/` now has 52 non-test modules: `readerscratch.ts`, added in fix wave `47129db8`, is a third reader sub-module, already named in `web/src/features/CLAUDE.md`. web-impl's Fix Attempt 2 log flagged it ("`docs/diagrams/web-components.md` may want the tracker"), and the orchestrator's diagram commit `22f2e399` predates the file. A fix makes the count 52 and names `readerscratch` beside `readerfind`/`readerscroll`, with the category totals in that sentence adjusted to match.
