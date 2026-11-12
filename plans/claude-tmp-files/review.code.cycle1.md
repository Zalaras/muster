# Correctness review: claude-tmp-files

**Plan**: claude-tmp-files
**Verdict**: needs-changes
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
2. **[daemon-tests]** `make lint` (this plan's check D3) fails: `test/canary/resume_test.go:240:3` testifylint `require-error` on `assert.NoError(t, err, "/clear must keep the old scratchpad folder")`. The line arrived with commit c949fb5c on main (this branch's merge base), not with this branch's diff, and both implementation logs flagged it; the gate is still red on this tree. A fix makes it `require.NoError` and `make lint` exits 0. Verifying needs no real `claude` run: it is a lint fix.
   id: test/canary/resume_test.go:240:require-error | confidence: 97

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
