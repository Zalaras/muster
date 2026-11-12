# Minor check: claude-tmp-files

Agent-tagged Minors routed into fix waves whose reviewer did not re-review them (kb:adr/process-minors-verified-not-re-reviewed), each read against the code on plan/claude-tmp-files after review cycle 3's approval.

| Minor | Commit | Satisfied how |
|---|---|---|
| maintainability Minor 1 (cycle 1), `web/src/render/reader.ts` tmp chip | 47129db8 | `tmp-chip` is a template node in `web/index.html:537` and `web/doc.html:55`; `buildChip` is gone; presence goes through `setPresence(refs.tmpChip, refs.planChip, …, "after")` (`render/reader.ts:417`) |
| maintainability Minor 2 (cycle 1), second loading-row builder | 47129db8 | one builder, `buildLoadingRow(className)` (`render/reader.ts:496`), used by the tree (`loading-row`) and the scratch rows (`scratch-loading`) |
| maintainability Minor 3 (cycle 1), `wireScratchpadDir` aliasing | 8e220c15 | copies before taking the address (`v := s.ScratchpadDir; return &v`), as its siblings do; guarded by `TestWireScratchpadDir_ReturnsACopy` (3ccf7b67) |
| maintainability Minor 4 (cycle 1), `renderfix.go` growth | 8e220c15 | the scratch capture moved to `readerScratchPaths` in `renderfix_scenarios_reader.go`; `renderfix.go` is 564 lines (563 on main), the one added line is the call, reason in daemon-implementation.md Decisions |
| maintainability Minor 5 (cycle 1), transcript outside the rig | 8e220c15 | `driveReaderScratch` binds `filepath.Join(r.root, "_transcripts", "reader-scratch.jsonl")` (`renderfix_scenarios_reader.go:163`) |
| maintainability Minor 6 (cycle 1), `features/reader.ts` size | 47129db8 | the scratch re-scan concern moved out to `web/src/features/readerscratch.ts` (`createScratchTracker`, 47 lines), shaped like `readerscroll.ts`; `reader.ts` 818 → 799 lines, still over the warn-only threshold with the separable concern gone |
| code Minor 3 (cycle 1), `reader/CLAUDE.md` Owns | 47129db8 | `web/src/reader/CLAUDE.md:13` names `claude.ts` |
| code Minor 1 (cycle 2), folder-path clamp in every host | 2b3ee0ff | the clamp is removed from `.rnav .hd .dir`; the #67 wrap is restored in every host, asserted in Focus and a compact tile (6f35cdd9); browser cycle 3 measured 99/99 px, no clamp |
