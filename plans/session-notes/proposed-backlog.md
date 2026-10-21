# Proposed backlog: session-notes

Proposed by the run, never filed. The developer decides each one at `/land`.

### A throwing event listener stops the listeners after it
- **Summary**: One app-event listener that throws aborts every later listener of the same emit; the bus does not isolate them.
- **Source**: review.cycle3.md browser Major 1 (the reviewer's second remedy, "the bus isolates a throwing listener"); decisions/review-cycle-exhaustion-theme-storage dissent ("the event bus's failure semantics stay unchanged").
- **Change requested**: no — this run fixed the storage cause; the bus change was deliberately left out of scope.
- **Suggested section**: Pre-v1 (dashboard robustness)
- **Pre-existing**: yes; this branch does not touch `web/src/app.ts`'s emit.

### Two storage lookup policies in the dashboard
- **Summary**: Storage callers either resolve the guarded accessor once at init or per call; nothing says which a new caller picks.
- **Source**: review.cycle4.md maintainability note 1 (and cycle-3 note 2: `storage.ts`'s header undersells the module).
- **Change requested**: no (a `[note]`).
- **Suggested section**: Pre-v1 (maintainability)
- **Pre-existing**: partly; this branch added per-call lookups in `reader.ts` and `theme.ts`.

## Decisions (the developer, 2026-10-21)

1. A throwing event listener stops the listeners after it — not doing as a backlog entry: the developer chose to fix it directly on `main` right after this land. Not filed.
2. Two storage lookup policies in the dashboard — not doing as a backlog entry: the developer chose to fix it directly on `main` right after this land. Not filed.
