# Doc Reconcile: reader-expanded-persists

**Verdict**: reconciled
**Pack**: kb: pack 6926 words (budget 30000)
**Features derived**: reader (plan header: reader)

## Claims

| Feature | Claim | Verified against | Action |
|---------|-------|------------------|--------|
| reader | Last open file, cleared dots, expanded folders and the Files/Outline folds are remembered per session in the browser | `web/src/reader/memory.ts:ReaderMemory`, `parseMemory`; `web/src/features/reader.ts:commitMemory/toggleFolder/toggleFiles/toggleOutline` | edited |
| reader | Pop-out and dashboard share that memory live, no switch or reload | `web/src/features/reader.ts:handleStorage`, `initReader` `storage` listener; `memory.ts:isMemoryWrite` | edited (existing "sharing ... memory" clause made explicitly live) |
| reader | "Last open file and cleared dots are remembered per session in the browser." | — | replaced |

## Contradictions
None

## For the orchestrator
None. `docs/protocol.md` untouched (no protocol change). The changed files all map to `reader`, so the feature set did not widen.

## Checks
`make gen-kb && make check-kb`: all generated files fresh; 536 records, 27 features, 0 problems; all checks pass.
reader spec body: 774 words (budget 800).
