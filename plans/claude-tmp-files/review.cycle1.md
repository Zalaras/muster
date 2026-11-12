# Review: claude-tmp-files

**Plan**: claude-tmp-files
**Verdict**: needs-changes
**Cycle**: 1
**Gates**: 1 failed
**Parts**: code, browser, maintainability
**Part verdicts**: code needs-changes, browser needs-changes, maintainability approved

_Merged by orch-state.py merge-review; the verdict is computed from the parts and the gate run, never edited by hand._

## Correctness review

# Correctness review: claude-tmp-files

**Plan**: claude-tmp-files
**Part verdict**: needs-changes
**Cycle**: 1
**Pack**: kb: pack 66778 words (budget 30000)

## Requirements

| Req | Implemented | Tested | Status |
|-----|-------------|--------|--------|
| REQ-1 | Yes — `claudecode.wellFormedScratchpad` (files.go), sole reader of `scratchpad_dir` | Yes — `TestInterpretFiles_ScratchpadDirOnlyWhenWellFormedForItsOwnSession` (SessionStart/PostToolUse/PreToolUse), E2E D1 | pass |
| REQ-2 | Yes — `Manager.SetScratchpad` gates on `ClaudeSessionID`, never clears, persists | Partly — /clear, straggler, reordered pair, reload covered; resume move-back and the dead/unbound source states of D3 untested (Major 1) | pass (coverage gap) |
| REQ-3 | Yes — `sessionWire.ScratchpadDir`, explicit null, broadcast via `persistWholeRowLocked(..., true)` | Yes — `TestToWireSession_ScratchpadDir`, `TestSetScratchpad_BroadcastsAndPersistsOnlyOnAChange`, E2E E1 | pass |
| REQ-4 | Yes — `reader.ListScratch` on `WalkMarkdown` (cap, dot-dirs), mtime desc then path | Yes — `TestListScratch*`, `TestHandleReaderList_ScratchBlock`, E2E plan+3 files | pass |
| REQ-5 | Yes — `Scope.Confine` branch (c), symlink-resolved both sides | Yes — `TestScopeScratchDir_Confine`, `TestHandleReaderFile_ScratchConfinement`, E2E D6 | pass |
| REQ-6 | Yes — `PathQualifies` widened lexically; existing `observeWrite` | Yes — `TestReaderObserve_ScratchWriteBroadcastsDocChangedAndIsLogged`, E2E E2 / non-md | pass |
| REQ-7 | Yes — summary row, `plan`/`no plan` chip, `<n> tmp` removed at 0 | Yes — W2 `claudeChips`, R1/R3/R7, E2E E1 | pass |
| REQ-8 | Yes — `claudeFolded` beside Files/Outline folds, default folded | Yes — W1 memory tests, render fold test, E2E reload | pass |
| REQ-9 | Yes — plan row then listing-order scratch rows, `tmp` badge, age from later of mtime/docChanged | Yes — W4 `latestIso`, R2, E2E | pass (age text: Decision 1) |
| REQ-10 | Yes — docbar `badge: "tmp"`, abs path, `aria-current`, dirty dot | Yes — R6, E2E E1 | pass |
| REQ-11 | Yes — `docChangedNeedsRescan`, `scratchDirMoved`, silent `rescanListing` on its own `listingSeq` | Yes — W3, E2E E2/E3/pop-out | pass |
| REQ-12 | Yes — `buildPlanSlot` no longer drops on `!alive` | Yes — R4, E2E E4, restart | pass |
| REQ-13 | Yes — `plan.modifiedAt` on wire; plan row age | Yes — `TestHandleReaderList_ScratchBlock`, R2 age test | pass |
| DIAG | `kb:diagram/store-schema`, `kb:diagram/web-components`, `kb:diagram/daemon-components`, `kb:diagram/domain-model` | — | fail — store-schema and web-components stale (Majors 2, 3) |

## Build & Tests

E2E tests: pass (272, scoped to 27 files incl. `reader-scratch.spec.ts`) · Daemon tests (race): pass (`02-test`, `22-D1` all `ok`) · Web tests: pass (3257) · Daemon build: pass · Web build: pass · Lint: **fail** (`03-lint`: golangci testifylint; `09-web-lint`: biome format) — all read from the gate log dir

## Acceptance Checks

| ID | Command | Result |
|----|---------|--------|
| D1 | `make test` | pass (`22-D1.log`, every package `ok`) |
| D2 | `go build ./...` | pass (deduped to the gates' build line, `01-build.log` empty = exit 0) |
| D3 | `make lint` | **FAIL** — `test/canary/resume_test.go:240:3: require-error` (Critical 2) |
| D5 | `make check-render-fixtures` | pass ("render fixtures up to date (114 scenarios)") |
| W1 | `make web-build` | pass |
| W2 | `make web-test` | pass (111 files, 3257 tests) |
| R1 | `make render-test` | pass (480 passed) |
| E1 | `make e2e` | pass, scoped (272 passed); full sweep at Completion |
| gate | `make web-lint` | **FAIL** — biome formatter on `web/src/api/reader.test.ts` (Critical 1) |
| gate | contrast / e2e-lint / render-lint / kb check / versions / comments / comment-ledger / features | pass |
| DOC | doc upkeep + Doc Delta vs what shipped | FAIL — ADRs exist but log lines still read `→ ADR: pending`; web-impl `doc-delta:` not in the plan's Doc Delta; store-schema diagram not updated; Doc Delta line on docChanged over-broad (Majors 2, 5, 6; Minor 1) |

## Reviewer-Verified Criteria

| ID | Criterion | Result | Evidence |
|----|-----------|--------|----------|
| V1 | no `any` in new web code | pass | grep for `: any`, `as any`, `<any>` over the changed web `.ts` files: only a comment hit in `session.test.ts:305` |
| V2 | summary row, chips, `tmp` badge, row ages match the mockup | partial | badge deviates under proposed kb:adr/reader-scratch-badge-neutral-not-teal; chips-when-unfolded under kb:adr/reader-claude-chips-stay-when-unfolded; row ages render `ageAgo` (`2m ago`) where the mockup and the Testable UI table show `2m` (Decision 1). Visual measurement is review-browser's. |
| V3 | `scratchpad_dir` read only in `internal/claudecode`, one owner of well-formedness | pass | outside `internal/claudecode` the string appears only in `test/canary` and the store column name; `wellFormedScratchpad` (`internal/claudecode/files.go`) is the single rule |
| V4 | no new watcher or poll | pass | the scratch list moves only in `loadListing`, and `rescanListing` from `handleDocChanged` and from `noteSession` on a changed `scratchpadDir`; the 1 s tick re-issues nothing because `coveredScratchDir` is set at issue |

## Hard-Rule Checklist

| # | Rule | Result |
|---|------|--------|
| 1 | Adapter boundary | pass — `scratchpad_dir` parsed only in `internal/claudecode/files.go`; `FileSignal.ScratchpadDir` is neutral |
| 2 | No terminal-output state parsing | pass |
| 3 | Non-blocking hook handler | pass — `SetScratchpad` runs in `readerFeature.Observe` on the ingest worker, after Apply |
| 4 | tmux via `-L muster` / sizing | pass — no tmux touched |
| 5 | No payload logging | pass — the new Warn logs the error and session id only |
| 6 | Empty-gauge honesty | pass — tmp chip removed at 0, never `0 tmp`; no-listing state shows the loading row |
| 7 | Identity on tmux target | pass — keyed by Muster session id; `session_id` only gates |
| 8 | No settings trespass | pass |
| 9 | No real `claude` outside canary | pass — E2E and Go tests synthesise hooks; canary untouched by this branch |

## Issues

### Critical
1. **[web-tests]** `make web-lint` fails: biome would reformat `web/src/api/reader.test.ts` (around lines 152–155, 175–177, 274–276, 316–319, 331–332, 341–342: wrapped calls and strings that fit on one line). A fix makes `make web-lint` exit 0 (biome format on that file, no assertion change).
   id: web/src/api/reader.test.ts:format:web-lint-red | confidence: 98
### Major
1. **[daemon-tests]** D2 and D3 are only partly tested. D2 names "a resume `SessionStart`" moving the folder back to the original; no test in `internal/session/reader_scratchpad_test.go`, `internal/server/reader_scratch_test.go` or the E2E file drives a resume rebind (test-specs.md hands it to "D2/D3 daemon unit tests", which do not have it). D3 requires the gate "from every source state (unbound, bound, after `/clear`, dead)"; `TestSetScratchpad_ClaudeSessionIDGate` covers bound and after-`/clear` only, with no case for an unbound session or a dead one receiving a hook from a left id. A fix adds those cases: a resume back to the original id moves the folder and broadcasts; an unbound or dead session's straggler leaves it unchanged.
   id: internal/session/reader_scratchpad_test.go:TestSetScratchpad_ClaudeSessionIDGate:missing-resume-dead-unbound | confidence: 88
2. **[orchestrator]** `kb:diagram/store-schema` is stale: its summary and body still say "after migrations 0001-0019" and the `session` entity has no `scratchpad_dir` (`docs/diagrams/store-schema.md:7,14,133-134`). The plan's Doc upkeep assigns this to the orchestrator. A fix adds `TEXT scratchpad_dir "0020, ..."` and moves the range to 0001-0020.
   id: docs/diagrams/store-schema.md:session:missing-scratchpad_dir | confidence: 95
3. **[web-impl]** `kb:diagram/web-components` is stale: `reader/` reads "12 modules" (`docs/diagrams/web-components.md:65`) but is now 13 with `reader/claude.ts`, and `reader/claude.ts:1` imports `../api/reader` (type-only), a `reader → api` edge the diagram does not draw. A fix updates the count and either draws the edge or moves the `ReaderListing` dependency out of `reader/`.
   id: docs/diagrams/web-components.md:reader:module-count-and-api-edge | confidence: 85
4. **[daemon-impl]** `internal/reader/CLAUDE.md` (hand-written part) is now false: "`Scope` (a session's directory plus its plan path)", the exemplar's "carrying the two paths a rule needs", and the `Confine` invariant naming only `Dir`. `Scope` now carries `ScratchDir` and `Confine` serves a third root; `ListScratch` is absent from **Owns**. A fix states the three roots and adds `ListScratch`.
   id: internal/reader/CLAUDE.md:Scope:two-paths-claim | confidence: 90
5. **[orchestrator]** `web-implementation.md:31` carries `doc-delta: the claude section keeps its chips while unfolded; the tmp badge is neutral (dashed), not teal.` The plan's `## Doc Delta` reflects neither clause, and it is promoted verbatim. A fix adds both to the reader "becomes true" lines.
   id: plans/claude-tmp-files/plan.md:Doc Delta:missing-web-doc-delta | confidence: 92
6. **[orchestrator]** All four `deviation:` lines (`daemon-implementation.md:32,33`, `web-implementation.md:22,23`) still end `→ ADR: pending`. The records exist and are right (`proposed`, `refs: plan:claude-tmp-files`, content matches what shipped: kb:adr/process-render-fixtures-normalise-modified-at covers both daemon lines; kb:adr/reader-scratch-badge-neutral-not-teal; kb:adr/reader-claude-chips-stay-when-unfolded). Only the pointers are missing. A fix repoints each line to its `kb:adr/…`.
   id: plans/claude-tmp-files/implementation-logs:Decisions:adr-pending | confidence: 90

### Minor
1. **[orchestrator]** The Doc Delta line "A write under the scratchpad sends `docChanged`" is over-broad: only a `.md` write does (REQ-6, D7; a `.json` write sends none, and E2E asserts that). A fix reads "A write of a `.md` under the scratchpad".
   id: plans/claude-tmp-files/plan.md:Doc Delta:docChanged-md-only | confidence: 85
2. **[orchestrator]** `ingest` is listed under **Touches** but its behaviour changed: a hook's `scratchpad_dir` is a new signal read in `internal/claudecode`, kb:adr/reader-scratchpad-dir-from-hooks-persisted lists `features: [reader, ingest]`, and `docs/features/ingest/spec.md` § Signals and their sources has no row for it. Promote `ingest` to **Features** and add a Doc Delta line for that table.
   id: plans/claude-tmp-files/plan.md:Touches:ingest-promote | confidence: 75
3. **[web-impl]** The **Owns** list in `web/src/reader/CLAUDE.md` does not name `claude.ts` (chips, `latestIso`, scratch-path and re-scan decisions). A fix adds it.
   id: web/src/reader/CLAUDE.md:Owns:claude.ts | confidence: 80

### Decisions
1. **[orchestrator:decision]** Row age text. The plan's Testable UI Elements table ("age last (`now`, `2m`, `1h`, `2d`)") and the design-authority mockup (`opt-b-summary.html`: `2m`, `6m`, `41m`) show bare buckets. REQ-9 says "`ageAgo` buckets", and the implementation renders `ageAgo` (`2m ago`), which the render tests assert (`web/render/reader-scratch.spec.ts:98,138`).
   - A: bare `formatAge` (`2m`). Matches the table and the mockup; shorter in a 3×2 tile; differs from the reader's existing `written 2m ago` readout.
   - B: keep `ageAgo` (`2m ago`). Matches REQ-9's named function and the dashboard's other relative times; three more characters per row in compact tiles; the table and mockup need amending.

### Notes
1. **[note]** For review-maintainability: `planHeaderRow` in `web/render/helpers/reader.ts:88` now targets the removed `[data-role="plan-header"]` and is still re-exported by `web/e2e/helpers/reader.ts:72`.
2. **[note]** `Scope.Confine` resolves `Dir` first and returns not-found when the session directory is gone, so a dead session whose worktree was removed serves neither its plan nor its scratch files (and the listing answers 409 before the scratch block). This already held for the plan, and daemon-impl logged it as unchanged. It is not a contract breach, because the contract says nothing about a missing directory.
3. **[note]** A `docChanged` that arrives while a silent `rescanListing` is in flight issues a second listing GET, because `listingPending` tracks only the first load. `listingSeq` keeps the result correct; the cost is one extra fetch.

## Browser review

# Browser review: claude-tmp-files

**Plan**: claude-tmp-files
**Part verdict**: needs-changes
**Cycle**: 1
**Pack**: kb: pack 12898 words (budget 30000)
**Rig**: `make web-build build` at 161961cb; scratch daemons from `web/e2e/helpers/fixtures.ts` (data dir `TMPDIR/muster e2e-<id>-*`, space-bearing; private `-tmux-socket` inside it, killed and removed at teardown); stub `claude` (`helpers/daemon.ts`, `2.0.0-e2e-stub`); headless Chromium 1280x720 via a throwaway spec (7 tests, run in the foreground, spec deleted, `git status` shows nothing of this reviewer).

Gates log read, not re-run: 2 red lines, `03-lint` (testifylint in `test/canary/resume_test.go:240`) and `09-web-lint` (biome format in `web/src/api/reader.test.ts`). Neither is the shipped bundle; `04-web-build` and `21-e2e` (272 passed) are green, so the app driven is the one that ships. The red lines are review-work territory.

Scenario used for "data": live session with a plan (transcript-located) and a scratchpad holding `findings.md` (3 min old), `notes/options.md` (2 h), a long nested `.md` (2 d), plus `data.json`, `.hidden/secret.md` and a sibling `tasks/x.output` that must not list.

## Matrix

| Req | Host | State | Claim | Result | Evidence |
|-----|------|-------|-------|--------|----------|
| REQ-4/D5 | API | data | listing holds exactly the 3 `.md`, newest first; json, dot-dir, `tasks/` absent | pass | reader listing scratch.files = findings.md 12:22, notes/options.md 10:25, long one 11-10 |
| REQ-7 | focus | data | summary row folded, `claude` + `plan` + `3 tmp`, no rows in DOM | pass | aria-expanded false; text `claude plan 3 tmp`; chips opacity 1, display block; plan-slot and scratch-rows children 0 |
| REQ-7 | focus | data | summary row placed inside nav | pass | sum box x 1045 w 235 (right 1280) y 127 inside nav 1044-1280 x 127-720 |
| REQ-7 | focus | no data yet | listing in flight: `claude` + plan chip from session, no tmp chip; unfolded loading row | pass | held listing: chips [`no plan` off, opacity 0.45]; rows `.f.none`, `.f.scratch-loading` |
| REQ-7 | focus | nothing from Claude | `claude [no plan]`, unfolded `no plan yet` only | pass | chips [`no plan`]; rows [`.f.none`] after release |
| REQ-7/INV-3 | tiles 2x2 | data | chips agree with rows | pass | `plan`, `3 tmp`; plan row + 3 scratch rows |
| REQ-7/INV-3 | tiles 3x2 | data | chips agree with rows | pass | same; sum box 236-425 inside nav 235-425 |
| REQ-7/INV-3 | pop-out | data | chips agree with rows | pass | `plan`, `3 tmp`; sum box y 30 inside region 0-720 |
| REQ-8 | focus | data | pointer click toggles | pass | aria-expanded false to true via click |
| REQ-8 | focus | data | keyboard Enter/Space toggle and keep focus | pass | Enter: true, Space: false, Space: true; activeElement same node after 1.2 s, connected |
| REQ-8 | focus | data | fold remembered per session, folded by default | pass | `muster.reader.1` holds `claudeFolded:false` beside filesFolded/outlineFolded; reload: expanded true; toggle + reload: false |
| REQ-8 | pop-out | data | fold shared live with the dashboard | pass | toggled in dashboard; pop-out aria-expanded true 1.5 s later |
| REQ-9 | focus | data | plan row then scratch rows in listing order; `tmp` badge first, path, age last | pass | kids `badge scratch:tmp`, `nm:findings.md`, `when:3m ago`; order findings, options, long = API order |
| REQ-9 | focus | data | ages from the later of mtime and docChanged | pass | rows read `3m ago`, `2h ago`, `2d ago` for mtimes -3 min / -2 h / -2 d; a file just written reads `now` |
| REQ-9/edge 16 | tiles 3x2 | data | long nested path ellipsized, no horizontal scroll | pass | `.nm` scrollWidth 409 > clientWidth 88, text-overflow ellipsis; nav sw 189 = cw 189; title = absolute path |
| REQ-9 | tiles 2x2, focus | data | unfolded section leaves Files and Outline reachable | FAIL | 2x2 tile, 3 scratch rows: outline clientHeight 0 of scrollHeight 21; focus, 30 scratch rows: tree 0/252, outline 0/441, a tree row 0 of 21 px visible (Major 1) |
| REQ-10 | focus | data | open scratch row: docbar `tmp` badge + absolute path; aria-current on that row only | pass | badge `tmp` dashed border, color rgb(178,182,195), not `--teal` #56c5d0; bar path absolute; aria-current on findings only |
| REQ-10 | tiles 2x2, 3x2 | data | docbar badge in compact host | pass | badge box 14-48 inside docbar 2-638 / 2-425; docbar sw = cw |
| REQ-10 | pop-out | data | open scratch row in pop-out | pass | bar `tmp findings.md <abs>`; aria-current on findings |
| REQ-10 | focus | data | dirty dot as tree files | pass | an unopened scratch file written by hook shows `.dot`; the open file none |
| REQ-11 | focus | data | docChanged for an unlisted scratch path re-fetches silently | pass | chip 3 to 4, new row on top; exactly 1 listing request; MutationObserver saw no loading row; body text unchanged |
| REQ-11 | focus | data | keyboard focus kept on a row while the re-fetch inserts above it | pass | focused `notes/options.md` row; same node 1.2 s after the insert |
| REQ-11/edge 14 | focus | data | a write to a listed path (and the sessionUpsert it causes) does not re-fetch | pass | 0 listing requests in 1.5 s after a second Write of the same file |
| REQ-11 | focus | late data | a first scratchpadDir arriving after the listing landed re-fetches | pass | docs opened before SessionStart; hook: chip `1 tmp`, row `late.md` |
| REQ-11 | pop-out | data | pop-out re-fetches on a new scratch write | pass | pop-out chip 3 to 4 |
| REQ-11/E3 | focus | data | `/clear` moves the folder: tmp chip gone, open file stays with `tmp` badge | pass | chips [`plan`]; rows [plan]; docbar still `tmp findings.md`, body unchanged |
| REQ-12 | focus | ended | section present, plan openable | pass | sum box inside nav after end; plan row present |
| REQ-12 | tiles 2x2 | ended | section present with scratch rows, openable | pass | ended tile, docs: `plan 3 tmp`, 4 rows; findings opens with `tmp` badge |
| REQ-12/edge 7 | focus | ended + daemon restart | section survives restart, plan opens | pass | after restart + reload: `claude plan`, plan opens (bar path = plan file) |
| REQ-12 | pop-out | ended | | N/A - not separately driven (Note 2) | |
| REQ-13 | focus, tiles, pop-out | data | plan row shows its age | pass | plan row `when:now` (plan written at setup) in every host |
| daemon down | focus | daemon-down | surfaced loudly; rows stay as last rendered | pass | `#banner` display block, unreachable text with the pane-noise sentence; reader notice `musterd unreachable - showing last render`; chips and 5 rows unchanged |
| daemon down | pop-out | daemon-down | status line names it; rows stay | pass | notice `musterd unreachable - showing last render`, display block; chips `plan 4 tmp` unchanged |
| daemon down | tiles | daemon-down | | N/A - not separately driven (Note 2) | |
| hidden | all | all | nothing relies on `[hidden]` against an author display rule | pass | tmp chip removed, not hidden, at 0; nothing sets `hidden` on the plan slot any more |
| V2 | focus | data | summary row, chips, badge, ages match `opt-b-summary.html` | pass (instrument) | computed styles match `mockup.css` new (B) rules; teal replaced by dashed neutral per kb:adr/reader-scratch-badge-neutral-not-teal |
| design-system 6 | all | all | no 0% track, cost, Done or unaged stale state | pass | every row carries its age; no gauge or cost added |
| design-system 7 | all | all | | N/A - plan adds no terminal surface | |

## Issues

### Critical

### Major
1. **[web-impl]** An unfolded claude section takes its full content height and starves the Files tree and the Outline to zero height, so their rows cannot be reached. In a default 2x2 tile with only 3 scratch files the Outline measures clientHeight 0 against scrollHeight 21; in Focus with 30 scratch files the tree measures 0/252 and the Outline 0/441, and scrolling the 6th file row into view leaves it 0 of 21 px visible inside `.tree` (the nav itself scrolls, 876 vs 593, but that only moves the zero-height boxes). Folded, the same tile gives the tree 16 px and the Outline 40 px. The plan slot and `.scratch-rows` sit in `.rnav` as non-shrinking content while `.tree`/`.outline` shrink with no floor (kb:adr/reader-nav-sections-shrink-without-floor) and have nothing left. `web/src/style.css` (`.rnav` section rules), `web/index.html` / `web/doc.html` (`scratch-rows`). A fix must make true: with the section unfolded in every host (Focus, 2x2, 3x2, pop-out) and any number of scratch files, the Files tree and the Outline each keep a non-zero box whose rows can be scrolled into view, and the scratch rows scroll inside their own share. R5 measured only horizontal fit, so no committed test could have failed for this (kb:lesson/surface-never-measured-against-its-host).
   id: web/src/style.css:.rnav .scratch-rows:starves files and outline | confidence: 95

### Minor

### Notes
1. **[note]** Ages render as `ageAgo` output (`3m ago`, `2h ago`, `2d ago`, `now`), as REQ-9 names; the plan Testable UI Elements table and mockup B show bare `2m`/`1h`/`2d`. The plan disagrees with itself (review-work territory). In a 3x2 tile the suffix costs the path about 30 px.
2. **[note]** Not measured: edge case 13 (docChanged while the listing is in flight, no double fetch) - the race cannot be staged reliably from the browser and is W3 unit coverage. Daemon-down in a tile and the ended pop-out were not separately driven; both run the same `ReaderInstance` and notice as the measured Focus and pop-out cells.
3. **[note]** V2 checked in the instrument theme only; dark and light rest on the design tokens the new rules use and the gates `10-contrast` line (54 pairs, 0 failures in each theme).
4. **[note]** Gate lines `03-lint` and `09-web-lint` are red (testifylint in `test/canary/resume_test.go`, biome format in `web/src/api/reader.test.ts`); review-work owns them.

## Maintainability review

# Maintainability review: claude-tmp-files

**Plan**: claude-tmp-files
**Part verdict**: approved
**Cycle**: 1
**Pack**: kb: pack 16351 words (budget 30000)
**Scope**: 24 non-test files in the branch diff against main (cmd, internal, web/src)

## Files

| File | Siblings opened | design: line | Size warnings | Result |
|------|-----------------|--------------|---------------|--------|
| internal/claudecode/claudecodetest/claudecodetest.go | same file's `markSubagent`, `orDefault` | n/a (test helper field + `addScratchpad`, shaped like `markSubagent`) | none | pass |
| internal/claudecode/files.go | interpret_transcript.go | yes (`wellFormedScratchpad` one owner) | none | pass |
| internal/reader/reader.go | writelog.go, scratch.go | yes (Scope) | none | pass (note 3) |
| internal/reader/scratch.go | reader.go (`WalkMarkdown`), writelog.go | yes | none | pass (note 4) |
| internal/server/reader.go | readerwire.go, respond.go, sessionwire.go | yes (`readerScope`) | none | pass |
| internal/server/readerwire.go | sessionwire.go, respond.go | no line for `wireScratchpadDir` | none | Minor 3 |
| internal/server/renderfix.go | renderfix_scenarios_reader.go, renderfix_normalise.go | no | filelen 574 (was 563), no reason | Minor 4 |
| internal/server/renderfix_normalise.go | renderfix.go | deviation line (ADR proposed) | none | pass |
| internal/server/renderfix_scenarios_reader.go | renderfix.go, sibling `driveReaderDocsPlan` | yes (fix attempt 1: reused `withPrefs`) | funlen `readerDocs` 76, `readerMermaidDocs` 158, untouched functions | Minor 5 |
| internal/server/sessionwire.go | readerwire.go, respond.go, state.go | none needed (one field) | funlen `toWireSession` 67 (was 66) | pass (note 6) |
| internal/session/reader.go | same file's `SetTranscript`, `SetPlan`, `MarkPlanWritten`; manager.go `Get`/`List` | yes (guard + writer named) | none | pass |
| internal/session/row.go | none (one mapping line each way) | none needed | none | pass |
| internal/session/session.go | none (one field) | none needed | none | pass |
| internal/session/writeorder.go | same file's `restoreChangedFields` list | yes (`restoredSessionFields`) | none | pass |
| internal/store/migrations/0020_scratchpad.sql | 0019 shape (one ALTER TABLE ADD COLUMN) | none needed | none | pass |
| internal/store/session.go | column lists in the same file | none needed | filelen 559 (was 558), funlen `UpdateSession`/`scanSession` 71; reason "already over, +4 lines" holds | pass (note 6) |
| web/src/api/reader.ts | same file's `parseReaderPlan`/`parseReaderFileEntry` | none needed | none | pass |
| web/src/features/reader.ts | readerscroll.ts, readerfind.ts, features/CLAUDE.md | yes (listingSeq, coveredScratchDir, scratchDirs) | filelen 818 (was 707); reason given is about render | Minor 6 |
| web/src/protocol/session.ts | none (one nullable field, parse + interface) | none needed | none | pass |
| web/src/reader/claude.ts | notice.ts, freshness.ts, paths.ts | yes | none | pass (note 2) |
| web/src/reader/memory.ts | same file's `withFilesFolded`/`withOutlineFolded` | none needed | none | pass |
| web/src/render/reader.ts | keyedreorder.ts, focuskeep.ts, launchpast.ts, sessions.ts | yes (keyed scratch rows) | filelen 678 (was 559); reason holds here | Minors 1, 2 |
| web/src/sessions/testfixtures.ts | none (one fixture field) | none needed | none | pass |
| web/src/style.css | `.rnav .hd`, `.rnav .hd.toggle` rules | none | none | pass (note 8) |

## Issues

### Critical

None.

### Major

None.

### Minor

1. **[web-impl]** `web/src/render/reader.ts` `buildReader`/`renderClaude`: the `tmp` chip is the only ref not taken from the template (`tmpChip: buildChip()`, line 199), and its presence is hand-rolled (`refs.tmpChip.remove()` / `refs.claudeChips.append(...)` in `renderClaude`). The same file already has one presence routine, `setPresence(el, anchor, present)` (line 237), which the docbar `badge` uses, and that badge is itself a template node. This breaks conventions § Design "Match the siblings" and "Reuse before add". A grep for `setPresence|buildChip` in that file finds `setPresence` used for the bar and `buildChip` used only here. A fix must make the chip come from `index.html`/`doc.html` like `plan-chip`, and route its presence through the file's one presence helper.
   id: web/src/render/reader.ts:renderClaude:tmp chip hand-rolled presence | confidence: 75

2. **[web-impl]** `web/src/render/reader.ts` `renderScratchRows` builds its `loading…` row inline (`div.f.scratch-loading`, `loadingText(null)`). The same file already has `buildTreeLoadingRow()` (`div.f.loading-row`, `loadingText(null)`), so this is a second builder for the same non-focusable placeholder that differs only by class. This breaks conventions § Design "Reuse before add". A grep for `loadingText(null)` in `web/src/render` shows the two sites. A fix must leave one builder for the nav's loading row, with its class as a parameter if both locators must stay distinct.
   id: web/src/render/reader.ts:renderScratchRows:second loading-row builder | confidence: 80

3. **[daemon-impl]** `internal/server/readerwire.go:65` `wireScratchpadDir` returns `&s.ScratchpadDir`, a pointer into the session value. Both siblings copy first: `sessionwire.go:222-224` (`v := s.ClaudeSessionID; w.ClaudeSessionID = &v`) and `respond.go:136` `wireTimePtr` ("otherwise a formatted copy, never an alias of t"). The alias is safe today only because every caller passes a clone (`session/manager.go:553` `Get`, `:623` `List`), and nothing at the helper says it relies on that. This breaks conventions § Design "Match the siblings". A fix must make the wire value a copy, as its siblings do.
   id: internal/server/readerwire.go:wireScratchpadDir:aliases session field | confidence: 85

4. **[daemon-impl]** `internal/server/renderfix.go` grows from 563 to 574 lines (filelen WARN in `19-size.log`), driven by the scratch-block capture in `captureReaderFiles`. The daemon Decisions give no reason for this file; the only size reason given is for `internal/store/session.go`. Under conventions § Design "Size is read, not obeyed", a filelen hit with no reason is a Minor. A fix must either give a reason in Decisions that holds, or move the reader-specific capture to where the other reader render-fixture code lives (`renderfix_scenarios_reader.go`). A split that only silences the warning does not count.
   id: internal/server/renderfix.go:captureReaderFiles:file length no reason | confidence: 85

5. **[daemon-impl]** `internal/server/renderfix_scenarios_reader.go` `driveReaderScratch`: the scratch-only scenario binds the transcript path `/tmp/reader-scratch.jsonl`, outside the rig root. Its sibling `writeReaderPlan` (same file) puts every transcript under `filepath.Join(r.root, "_transcripts", ...)`. The daemon scans the transcript on SessionStart (kb:spec/reader, "Locating the plan"), so the fixture's content depends on whatever a machine holds at that fixed path, not on the rig alone. This breaks conventions § Design "Match the siblings". A fix must keep every path the scenario names under `r.root`.
   id: internal/server/renderfix_scenarios_reader.go:driveReaderScratch:transcript outside rig root | confidence: 70

6. **[web-impl]** `web/src/features/reader.ts` is 818 lines (707 on main; filelen WARN). The Decisions reason is "the section shares the render pass and signature memo with the rest of the nav". That describes `render/reader.ts`, where `renderPlanSlot`'s `structSig` lives, and it holds there. `features/reader.ts` has no signature memo. Most of its growth is a separate concern, the scratch re-scan policy: `listingSeq`, `coveredScratchDir`, `session`, `scratchDirs`, `rescanListing`, `noteSession` and the re-scan branch in `handleDocChanged`. The directory already moves `ReaderInstance`'s separable concerns into sub-controllers (`readerscroll.ts`, `readerfind.ts`, named in features/CLAUDE.md as reader.ts's find bar and reading position). A fix must either give a reason for this file that holds, or move the re-scan concern out the way its siblings were moved. A split that only silences the warning does not count (kb:adr/process-size-linters-warn-never-fail).
   id: web/src/features/reader.ts:ReaderInstance:size reason does not fit | confidence: 70

### Notes

1. **[note]** For review-work (adapter boundary): `renderfix_scenarios_reader.go` `driveReaderScratch` builds Claude Code's scratchpad path shape (`<root>/claude-501/<project>/<session_id>/scratchpad`) inside `internal/server`. `internal/claudecode/files.go` `wellFormedScratchpad` owns the rule that shape must satisfy, and `claudecodetest` is where a builder for it would belong.
2. **[note]** For review-work (DIAG): `kb:diagram/web-components` counts `reader/` as "12 modules" and draws no reader-to-api edge. `web/src/reader/claude.ts` is a 13th module and the first in `reader/` to import `../api/reader`. It only reads `listing.scratch`, so if the edge is unwanted, `docChangedNeedsRescan` could take `ReaderScratch | null` instead of the whole listing. The Owns list in `web/src/reader/CLAUDE.md` also does not name `claude.ts`.
3. **[note]** `internal/reader/reader.go` `Confine`: the scratch branch inlines a second EvalSymlinks-then-HasPrefix containment test beside the `Dir` one, while `PathQualifies` factored its pair into `lexicallyUnder`. `Confine` also returns false before reaching the scratch branch when `s.Dir` fails to resolve (line 53). Decisions say the listing answers 409 first in that case; whether the file route should still serve scratch files then is for review-work.
4. **[note]** `internal/reader/scratch.go` `ListScratch` discards `WalkMarkdown`'s `truncated` result, and the scratch wire block has no truncation flag. That is a contract question for review-work.
5. **[note]** Naming: the same concept is `Session.ScratchpadDir` and wire `scratchpadDir`, but `reader.Scope.ScratchDir` and the listing's `scratch.dir`. It reads fine and is not worth a wave.
6. **[note]** Size warnings whose reasons hold: `store/session.go` filelen, `UpdateSession`/`scanSession` funlen and `sessionwire.go` `toWireSession` funlen (66 to 67) each grew one line per added column or field in a column-list function. `readerDocs`/`readerMermaidDocs` funlen are untouched data tables in a touched file. The `render/reader.ts` filelen reason (shared render pass and `structSig` memo) holds.
7. **[note]** Shared state: `Session.ScratchpadDir` has one writer (`Manager.SetScratchpad`, called from the ingest worker via `readerFeature.Observe`). It is guarded by `Manager.mu` and the write-order turnstile, and appears in `restoredSessionFields`/`restoreChangedFields`. The web side is single-threaded, and `listingSeq` now orders `loadListing` and `rescanListing` separately from `fetchSeq`. I found no interleaving in which a stale listing lands. No finding.
8. **[note]** `web/src/style.css`: `.rnav .claude-sum` and `.claude-sum .lbl` re-declare the typography of `.rnav .hd` (2xs, 0.12em, uppercase, `--fg-dim`) instead of reusing the `.hd.toggle` rule that the Files and Outline toggles use. The chips on the summary row may justify a rule of their own.

## Struck by critic

- code Critical: 2. **[daemon-tests]** `make lint` (this plan's check D3) fails: `test/canary/resume_test.go:240:3` testifylint `require-error` on `assert.NoError(t, err, "/clear must keep the old scratchpad folder")`. The line arrived with commit c949fb5c on main (this branch's merge base), not with this branch's diff, and both implementation logs flagged it; the gate is still red on this tree. A fix makes it `require.NoError` and `make lint` exits 0. Verifying needs no real `claude` run: it is a lint fix.
