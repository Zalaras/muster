# Maintainability review: claude-tmp-files

**Plan**: claude-tmp-files
**Verdict**: approved
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
