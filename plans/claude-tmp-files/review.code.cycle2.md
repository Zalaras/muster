# Correctness review: claude-tmp-files

**Plan**: claude-tmp-files
**Verdict**: approved
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
1. **[orchestrator]** `kb:diagram/web-components` is stale for `features/`. It reads "51 modules" and lists reader's sub-controllers as "readerfind, readerscroll" (`docs/diagrams/web-components.md:50`), but `features/` now has 52 non-test modules: `readerscratch.ts`, added in fix wave `47129db8`, is a third reader sub-module, already named in `web/src/features/CLAUDE.md`. web-impl's Fix Attempt 2 log flagged it ("`docs/diagrams/web-components.md` may want the tracker"), and the orchestrator's diagram commit `22f2e399` predates the file. A fix makes the count 52 and names `readerscratch` beside `readerfind`/`readerscroll`, with the category totals in that sentence adjusted to match.
   id: docs/diagrams/web-components.md:features:module-count-readerscratch | confidence: 95

### Minor
1. **[web-impl]** The Files header's folder path is now clamped to one line in every host, not just compact tiles: `.rnav .hd .dir` has `-webkit-line-clamp: 1; overflow: hidden` (`web/src/style.css:1808-1816`). Before this, the #67 fix wrapped the full path inside the panel, and `docs/history/todo-done.md` records "the files header's directory path wrap[s] inside the panel". Focus and the pop-out now show one ellipsized line, with the full path in the `title` only. Fix Attempt 3 logs this as a fix step but records no `deviation:` line, so no ADR records the change to #67's behaviour. A fix adds a `deviation:` line to `web-implementation.md` § Decisions, and the orchestrator then writes its ADR. The only new render test for the clamp asserts it in a compact tile; the existing #67 test checks only that the header stays inside the nav, which a clamp also satisfies.
   id: web/src/style.css:.rnav .hd .dir:unlogged-clamp-all-hosts | confidence: 85

### Notes
1. **[note]** For review-browser: the amended Views criterion ("each keep a scrollable box in every host whose nav is taller than its fixed rows") is met literally, but thinly. `render-tests.md` measures the Outline at 2 px in the 3×2 tile at 600 px and at 1 px in Focus at 360 px. `expectReachable` passes such a box because it accepts a row that is only partly inside. Whether a 1–2 px box is usable is an observed property, not a statement I can settle.
2. **[note]** `docs/features/reader/spec.md` gained `readerscratch*.ts` in its `web:` glob (`f884afef`), before doc-reconcile. This is a registry edit `check-kb` requires, not a behaviour claim; doc-reconcile should expect it.
3. **[note]** Cycle 1 Notes 2 and 3 (a dead session with a removed directory serves no scratch; one extra listing GET on a `docChanged` during a silent re-scan) are unchanged by this delta and still hold.
